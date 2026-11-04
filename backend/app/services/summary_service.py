"""Document-level synthesis: classification, executive summary, takeaways, recommendations."""

import json

from app.schemas.analysis_schema import Risk, Synthesis
from app.services.llm.base import LLMProvider
from app.services.llm.prompts import synthesis_prompt
from app.utils.text_cleaner import truncate

MAX_DIGEST_CHARS = 14000


def build_digest(merged: dict, risks: list[Risk]) -> str:
    """Compact JSON digest of merged findings that fits comfortably in one prompt."""
    digest = {
        "parties": [
            {
                "name": p.name,
                "role": p.role,
                "obligations": [truncate(o, 160) for o in p.obligations[:6]],
                "rights": [truncate(r, 160) for r in p.rights[:4]],
            }
            for p in merged["parties"][:8]
        ],
        "clauses": [
            {"name": c.name, "category": c.category, "importance": c.importance, "meaning": truncate(c.simplified_explanation, 220)}
            for c in merged["clauses"][:40]
        ],
        "financial_terms": [
            {"type": f.term_type, "amount": f.amount, "currency": f.currency, "frequency": f.frequency, "description": truncate(f.description, 120)}
            for f in merged["financial_terms"][:15]
        ],
        "important_dates": [
            {"type": d.date_type, "value": d.value, "label": truncate(d.label, 100)} for d in merged["important_dates"][:15]
        ],
        "risks": [
            {"title": r.title, "level": r.risk_level, "why": truncate(r.explanation, 200)} for r in risks[:15]
        ],
    }
    text = json.dumps(digest, ensure_ascii=False)
    while len(text) > MAX_DIGEST_CHARS and digest["clauses"]:
        digest["clauses"] = digest["clauses"][: len(digest["clauses"]) * 3 // 4]
        text = json.dumps(digest, ensure_ascii=False)
    return text


def synthesize(provider: LLMProvider, opening_text: str, digest: str, meta: dict) -> Synthesis:
    from app.services.ai_service import call_json  # local import avoids a cycle

    return call_json(provider, synthesis_prompt(opening_text, digest, meta), Synthesis)
