"""Text extraction for PDF, DOCX and TXT, producing cleaned per-page (or per-section) text.

OCR for scanned documents is intentionally not part of the MVP; `extract_text` is the
single extension point where an OCR backend can be plugged in later.
"""

import io
import logging
from dataclasses import dataclass, field

from docx import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.config import get_settings
from app.services.pdf_service import extract_pdf_pages
from app.utils.errors import ExtractionError
from app.utils.text_cleaner import clean_text

logger = logging.getLogger(__name__)

SCANNED_MESSAGE = (
    "No readable text could be extracted. The document may be a scanned image. "
    "OCR is not included in the current version - please upload a text-based PDF, DOCX or TXT file."
)


@dataclass
class ExtractionResult:
    pages: list[str]
    location_unit: str  # "page" for PDFs, "section" for DOCX/TXT
    warnings: list[str] = field(default_factory=list)

    @property
    def char_count(self) -> int:
        return sum(len(p) for p in self.pages)


def extract_text(file_type: str, data: bytes) -> ExtractionResult:
    settings = get_settings()
    if file_type == "pdf":
        raw_pages = extract_pdf_pages(data)
        pages = [clean_text(p) for p in raw_pages]
        unit = "page"
    elif file_type == "docx":
        pages = _split_sections(clean_text(_extract_docx(data)), settings.section_size_chars)
        unit = "section"
    elif file_type == "txt":
        pages = _split_sections(clean_text(_decode_txt(data)), settings.section_size_chars)
        unit = "section"
    else:
        raise ExtractionError("Unsupported file type.", code="UNSUPPORTED_FILE_TYPE")

    result = ExtractionResult(pages=pages, location_unit=unit)
    meaningful = sum(len(p.replace(" ", "").replace("\n", "")) for p in pages)
    if meaningful < settings.min_extracted_chars:
        code = "NO_EXTRACTABLE_TEXT" if file_type == "pdf" else "EMPTY_DOCUMENT"
        message = SCANNED_MESSAGE if file_type == "pdf" else "The document does not contain enough readable text to analyse."
        raise ExtractionError(message, code=code)

    if unit == "page":
        blank = [str(i + 1) for i, p in enumerate(pages) if len(p.strip()) < 20]
        if blank:
            result.warnings.append(
                f"Page(s) {', '.join(blank)} contain little or no extractable text (possibly scanned images or blank pages). "
                "Content on those pages could not be analysed because OCR is not included in this version."
            )
    return result


def _extract_docx(data: bytes) -> str:
    try:
        doc = DocxDocument(io.BytesIO(data))
    except Exception as exc:
        logger.info("DOCX open failed: %s", type(exc).__name__)
        raise ExtractionError("The DOCX file could not be read. It may be corrupted.", code="CORRUPTED_DOCX") from exc

    blocks: list[str] = []
    # Walk the body in order so paragraphs and tables keep their relative position.
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = Paragraph(child, doc).text
            if text.strip():
                blocks.append(text)
        elif tag == "tbl":
            for row in Table(child, doc).rows:
                cells = []
                for cell in row.cells:
                    value = cell.text.strip()
                    if value and (not cells or cells[-1] != value):  # merged cells repeat text
                        cells.append(value)
                if cells:
                    blocks.append(" | ".join(cells))
    return "\n\n".join(blocks)


def _decode_txt(data: bytes) -> str:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def _split_sections(text: str, size: int) -> list[str]:
    """Split page-less text into sections at paragraph boundaries for source referencing."""
    if not text:
        return []
    paragraphs = text.split("\n\n")
    sections: list[str] = []
    current: list[str] = []
    length = 0
    for para in paragraphs:
        if current and length + len(para) > size:
            sections.append("\n\n".join(current))
            current, length = [], 0
        current.append(para)
        length += len(para) + 2
    if current:
        sections.append("\n\n".join(current))
    return sections
