"""Split long documents into overlapping, page-annotated chunks for LLM processing."""

from dataclasses import dataclass, field


@dataclass
class Chunk:
    index: int
    text: str
    page_start: int
    page_end: int


@dataclass
class ChunkPlan:
    chunks: list[Chunk]
    total_chars: int
    analyzed_chars: int
    total_pages: int
    last_page_analyzed: int
    truncated: bool
    notes: list[str] = field(default_factory=list)


def _units(pages: list[str], max_unit: int) -> list[tuple[int, str]]:
    """Break pages into (page_number, paragraph) units no longer than max_unit."""
    units: list[tuple[int, str]] = []
    for page_no, page in enumerate(pages, start=1):
        for para in page.split("\n\n"):
            para = para.strip()
            if not para:
                continue
            while len(para) > max_unit:
                cut = para.rfind(" ", 0, max_unit)
                cut = cut if cut > max_unit // 2 else max_unit
                units.append((page_no, para[:cut]))
                para = para[cut:].strip()
            if para:
                units.append((page_no, para))
    return units


def _render(units: list[tuple[int, str]], label: str) -> str:
    out: list[str] = []
    current_page = None
    for page_no, text in units:
        if page_no != current_page:
            out.append(f"[{label} {page_no}]")
            current_page = page_no
        out.append(text)
    return "\n\n".join(out)


def build_chunks(
    pages: list[str],
    location_unit: str = "page",
    chunk_size: int = 18000,
    overlap: int = 1200,
    max_chunks: int = 15,
) -> ChunkPlan:
    label = "Page" if location_unit == "page" else "Section"
    units = _units(pages, max(chunk_size // 2, 500))
    total_chars = sum(len(t) for _, t in units)

    # Groups hold unit indices so overlapping units are only counted once.
    groups: list[list[int]] = []
    current: list[int] = []
    size = 0
    for i, (_, text) in enumerate(units):
        if current and size + len(text) > chunk_size:
            groups.append(current)
            # Carry trailing paragraphs into the next chunk so clauses spanning a boundary survive.
            carry: list[int] = []
            carry_size = 0
            for prev in reversed(current):
                if carry_size + len(units[prev][1]) > overlap:
                    break
                carry.insert(0, prev)
                carry_size += len(units[prev][1])
            current, size = carry, carry_size
        current.append(i)
        size += len(text)
    if current:
        groups.append(current)

    truncated = len(groups) > max_chunks
    kept = groups[:max_chunks]
    chunks = []
    for ci, g in enumerate(kept):
        g_units = [units[i] for i in g]
        chunks.append(Chunk(index=ci, text=_render(g_units, label), page_start=g_units[0][0], page_end=g_units[-1][0]))
    covered = {i for g in kept for i in g}
    analyzed_chars = sum(len(units[i][1]) for i in covered)
    last_page = chunks[-1].page_end if chunks else 0

    notes: list[str] = []
    if truncated:
        notes.append(
            f"The document is too long to analyse in full. Only {label.lower()}s 1-{last_page} of {len(pages)} "
            f"(about {round(100 * analyzed_chars / max(total_chars, 1))}% of the text) were analysed. "
            "Content after that point was NOT reviewed."
        )
    return ChunkPlan(
        chunks=chunks,
        total_chars=total_chars,
        analyzed_chars=analyzed_chars,
        total_pages=len(pages),
        last_page_analyzed=last_page,
        truncated=truncated,
        notes=notes,
    )
