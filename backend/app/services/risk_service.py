"""Risk detection (per chunk), merging, ordering and language safeguards."""

import re

from app.schemas.analysis_schema import ChunkRisks, Risk
from app.services.llm.base import LLMProvider
from app.services.llm.prompts import risk_prompt
from app.utils.text_cleaner import normalize_for_match

_LEVEL_ORDER = {"High": 0, "Medium": 1, "Low": 2}

# The tool must not pronounce on legality/validity; definitive phrasing is softened.
_DEFINITIVE_PHRASES = [
    (re.compile(r"\b(is|are)\s+(clearly\s+)?(illegal|unlawful)\b", re.I), "may raise legal concerns"),
    (re.compile(r"\b(is|are)\s+(clearly\s+)?(invalid|void|unenforceable|not enforceable)\b", re.I),
     "may face questions about enforceability"),
    (re.compile(r"\b(is|are)\s+(clearly\s+)?fraudulent\b", re.I), "may warrant closer scrutiny"),
]


def soften_language(text: str) -> str:
    for pattern, replacement in _DEFINITIVE_PHRASES:
        text = pattern.sub(replacement, text)
    return text


def detect_chunk_risks(provider: LLMProvider, chunk_text: str, meta: dict) -> list[Risk]:
    from app.services.ai_service import call_json  # local import avoids a cycle

    return call_json(provider, risk_prompt(chunk_text, meta), ChunkRisks).risks


def merge_risks(risk_sets: list[list[Risk]]) -> list[Risk]:
    seen: set[str] = set()
    merged: list[Risk] = []
    for risks in risk_sets:
        for risk in risks:
            key = normalize_for_match(risk.original_text)[:160] or normalize_for_match(risk.title)
            if key in seen:
                continue
            seen.add(key)
            risk.explanation = soften_language(risk.explanation)
            risk.potential_impact = soften_language(risk.potential_impact)
            merged.append(risk)
    return sort_risks(merged)


def sort_risks(risks: list[Risk]) -> list[Risk]:
    return sorted(risks, key=lambda r: (_LEVEL_ORDER.get(r.risk_level, 1), r.page_number or 10**6))


def risk_counts(risks: list[dict] | list[Risk]) -> dict[str, int]:
    counts = {"High": 0, "Medium": 0, "Low": 0}
    for risk in risks:
        level = risk["risk_level"] if isinstance(risk, dict) else risk.risk_level
        counts[level] = counts.get(level, 0) + 1
    return counts
