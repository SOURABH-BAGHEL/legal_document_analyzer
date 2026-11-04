"""Verify quotes, page references, amounts and dates against the extracted document text.

Applied to every analysis (LLM or demo) before it is stored, so the UI can show which
findings are backed by verbatim text and on which page/section it appears.
"""

import re
from uuid import uuid4

from app.schemas.analysis_schema import AnalysisResult
from app.services.clause_service import build_coverage
from app.utils.text_cleaner import normalize_for_match

SHINGLE = 5
APPROX_THRESHOLD = 0.6


class SourceIndex:
    def __init__(self, pages: list[str]):
        self.pages = [normalize_for_match(p) for p in pages]
        self.full = " ".join(self.pages)
        offsets, pos = [], 0
        for page in self.pages:
            offsets.append(pos)
            pos += len(page) + 1
        self.offsets = offsets
        self.shingles = [self._shingles(p.split()) for p in self.pages]
        self.compact = re.sub(r"[\s,]", "", self.full)

    @staticmethod
    def _shingles(words: list[str]) -> set[tuple[str, ...]]:
        return {tuple(words[i : i + SHINGLE]) for i in range(max(len(words) - SHINGLE + 1, 0))}

    def _page_at(self, offset: int) -> int:
        page = 1
        for i, start in enumerate(self.offsets):
            if start <= offset:
                page = i + 1
        return page

    def locate(self, quote: str) -> tuple[str, int | None]:
        """Return (verification_status, 1-based page) for a quote."""
        q = normalize_for_match(quote)
        if not q:
            return "not_applicable", None
        if len(q) < 12:
            return ("verified", self._page_at(self.full.find(q))) if q in self.full else ("unverified", None)
        idx = self.full.find(q)
        if idx != -1:
            return "verified", self._page_at(idx)
        words = q.split()
        if len(words) < SHINGLE:
            return "unverified", None
        target = self._shingles(words)
        best_page, best_hits = None, 0
        for i, page_sh in enumerate(self.shingles):
            hits = len(target & page_sh)
            if hits > best_hits:
                best_page, best_hits = i + 1, hits
        # Quotes spanning a page break: also count matches across all pages combined.
        total_hits = len(target & set().union(*self.shingles)) if self.shingles else 0
        if total_hits / len(target) >= APPROX_THRESHOLD:
            return "approximate", best_page
        return "unverified", None

    def contains_value(self, value: str) -> bool:
        compact = re.sub(r"[\s,]", "", normalize_for_match(value))
        return bool(compact) and compact in self.compact

    def mentions(self, name: str) -> bool:
        q = normalize_for_match(name)
        return bool(q) and q in self.full


def _apply(item, index: SourceIndex) -> None:
    status, page = index.locate(item.original_text)
    item.verification = status
    if status in ("verified", "approximate"):
        item.page_number = page
    elif status == "unverified":
        item.page_number = None


def verify_and_finalize(result: AnalysisResult, pages: list[str]) -> AnalysisResult:
    index = SourceIndex(pages)

    for collection in (result.clauses, result.risks, result.financial_terms, result.important_dates, result.simplifications):
        for item in collection:
            _apply(item, index)

    for clause in result.clauses:
        if clause.verification == "unverified":
            clause.is_uncertain = True
    for risk in result.risks:
        if risk.verification == "unverified":
            risk.is_uncertain = True

    for term in result.financial_terms:
        if term.amount and re.search(r"\d", term.amount) and not index.contains_value(re.sub(r"[^\d.,]", "", term.amount)):
            term.verification = "unverified"

    for date in result.important_dates:
        if date.is_explicit and not index.contains_value(date.value):
            # Claimed to be written in the document but not found verbatim.
            date.is_explicit = False
            date.calculation_note = date.calculation_note or (
                "This value was not found verbatim in the document; treat it as unconfirmed."
            )

    kept_parties = [p for p in result.parties if index.mentions(p.name) or (p.role and index.mentions(p.role))]
    removed = len(result.parties) - len(kept_parties)
    result.parties = kept_parties
    if removed:
        result.limitations.append(
            f"{removed} party entr{'y was' if removed == 1 else 'ies were'} removed because the name could not be found in the document."
        )

    unverified = sum(
        1 for c in (*result.clauses, *result.risks) if c.verification == "unverified"
    )
    if unverified:
        result.limitations.append(
            f"{unverified} quoted passage(s) could not be matched to the document text and are marked as unverified."
        )

    for prefix, collection in (("c", result.clauses), ("r", result.risks), ("f", result.financial_terms), ("d", result.important_dates)):
        for item in collection:
            item.id = f"{prefix}_{uuid4().hex[:10]}"

    result.clause_coverage = build_coverage(result.clauses)
    return result
