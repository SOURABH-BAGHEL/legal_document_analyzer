"""Stand-alone plain-language simplification of a pasted legal passage."""

import re

from app.schemas.analysis_schema import LegalTerm, SimplifyOutput
from app.services.ai_service import call_json
from app.services.demo_analyzer import GLOSSARY, plain_english
from app.services.llm.prompts import simplify_prompt
from app.services.llm.providers import get_llm_provider
from app.utils.errors import AppError


def simplify(text: str, consent_external: bool) -> dict:
    text = text.strip()
    provider = get_llm_provider()
    if provider and provider.is_external and not consent_external:
        raise AppError(
            f"Simplification sends this text to a third-party AI service ({provider.display_name}). "
            "Please confirm that you consent to this processing.",
            code="CONSENT_REQUIRED",
        )
    if provider:
        out = call_json(provider, simplify_prompt(text), SimplifyOutput)
        return {
            "original_text": text,
            "simplified_text": out.simplified_text,
            "key_terms": out.key_terms,
            "notes": out.notes,
            "mode": "live",
            "provider": provider.name,
        }

    terms = [
        LegalTerm(term=term.title(), explanation=meaning)
        for term, meaning in GLOSSARY.items()
        if re.search(rf"\b{re.escape(term)}\b", text, re.I)
    ]
    return {
        "original_text": text,
        "simplified_text": plain_english(text),
        "key_terms": terms,
        "notes": ["Demo mode: produced by rule-based word substitution, not by an AI model. Check it against the original."],
        "mode": "demo",
        "provider": "demo",
    }
