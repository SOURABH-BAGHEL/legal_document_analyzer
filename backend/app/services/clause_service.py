"""Clause, party, payment and date extraction (per chunk) and merging across chunks."""

from app.schemas.analysis_schema import (
    CLAUSE_CATEGORIES,
    ChunkExtraction,
    Clause,
    ClauseCoverage,
    FinancialTerm,
    ImportantDate,
    LegalTerm,
    Party,
    Simplification,
)
from app.services.llm.base import LLMProvider
from app.services.llm.prompts import extraction_prompt
from app.utils.text_cleaner import normalize_for_match

NOT_IDENTIFIED = "Not identified in the document."
_IMPORTANCE_ORDER = {"High": 0, "Medium": 1, "Low": 2}


def extract_chunk(provider: LLMProvider, chunk_text: str, meta: dict) -> ChunkExtraction:
    from app.services.ai_service import call_json  # local import avoids a cycle

    return call_json(provider, extraction_prompt(chunk_text, meta), ChunkExtraction)


def _quote_key(text: str, fallback: str = "") -> str:
    norm = normalize_for_match(text)
    return norm[:160] if norm else normalize_for_match(fallback)


def _dedupe(items: list, key_fn) -> list:
    seen: set = set()
    out = []
    for item in items:
        key = key_fn(item)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _union(a: list[str], b: list[str]) -> list[str]:
    seen = {normalize_for_match(x) for x in a}
    merged = list(a)
    for item in b:
        if normalize_for_match(item) not in seen:
            seen.add(normalize_for_match(item))
            merged.append(item)
    return merged


def merge_parties(parties: list[Party]) -> list[Party]:
    merged: dict[str, Party] = {}
    for party in parties:
        key = normalize_for_match(party.name)
        if not key:
            continue
        if key not in merged:
            merged[key] = party.model_copy(deep=True)
            continue
        target = merged[key]
        target.role = target.role or party.role
        target.party_type = target.party_type or party.party_type
        target.page_number = target.page_number or party.page_number
        for field in ("rights", "obligations", "payment_obligations", "other_commitments"):
            setattr(target, field, _union(getattr(target, field), getattr(party, field)))
    return list(merged.values())


def merge_extractions(extractions: list[ChunkExtraction]) -> dict:
    """Combine per-chunk findings, removing duplicates produced by chunk overlap."""
    clauses: list[Clause] = []
    parties: list[Party] = []
    financial: list[FinancialTerm] = []
    dates: list[ImportantDate] = []
    terms: list[LegalTerm] = []
    simplifications: list[Simplification] = []
    for ext in extractions:
        clauses += ext.clauses
        parties += ext.parties
        financial += ext.financial_terms
        dates += ext.important_dates
        terms += ext.legal_terms
        simplifications += ext.simplifications

    clauses = _dedupe(clauses, lambda c: _quote_key(c.original_text, c.name + c.category))
    clauses.sort(key=lambda c: (_IMPORTANCE_ORDER.get(c.importance, 1), c.page_number or 10**6))
    return {
        "clauses": clauses,
        "parties": merge_parties(parties),
        "financial_terms": _dedupe(
            financial, lambda f: (normalize_for_match(f.amount or ""), _quote_key(f.original_text, f.description))
        ),
        "important_dates": _dedupe(
            dates, lambda d: (normalize_for_match(d.value), normalize_for_match(d.date_type or d.label))
        ),
        "legal_terms": _dedupe(terms, lambda t: normalize_for_match(t.term))[:25],
        "simplifications": _dedupe(simplifications, lambda s: _quote_key(s.original_text))[:20],
    }


def build_coverage(clauses: list[Clause]) -> list[ClauseCoverage]:
    """Report every required category, explicitly marking those not found."""
    counts = {cat: 0 for cat in CLAUSE_CATEGORIES}
    for clause in clauses:
        counts[clause.category] = counts.get(clause.category, 0) + 1
    return [
        ClauseCoverage(
            category=cat,
            status="identified" if counts[cat] else "not_identified",
            count=counts[cat],
            message=f"{counts[cat]} clause(s) identified." if counts[cat] else NOT_IDENTIFIED,
        )
        for cat in CLAUSE_CATEGORIES
    ]
