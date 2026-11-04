"""LLM analysis engine: chunk -> extract -> detect risks -> synthesise -> validate.

LLM output is treated as untrusted input: it is parsed defensively, validated against
Pydantic models item by item, retried once with a repair prompt if unusable, and
finally verified against the extracted document text (see verification_service).
"""

import json
import logging
import re
from collections.abc import Callable
from typing import TypeVar, get_args, get_origin

from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.schemas.analysis_schema import AnalysisResult
from app.services import clause_service, risk_service, summary_service
from app.services.chunking_service import build_chunks
from app.services.llm.base import LLMProvider
from app.services.llm.prompts import SYSTEM_PROMPT, repair_prompt
from app.utils.errors import LLMResponseError

logger = logging.getLogger(__name__)
M = TypeVar("M", bound=BaseModel)
ProgressCallback = Callable[[str, int], None]


def parse_json_object(text: str) -> dict:
    """Extract a JSON object from model output, tolerating code fences or stray prose."""
    # Reasoning models may emit their thinking before the answer.
    cleaned = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("No JSON object found in the response.") from None
        data = json.loads(cleaned[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("The response JSON is not an object.")
    return data


def validate_lenient(model_cls: type[M], data: dict) -> M:
    """Validate a model, dropping individual invalid list items instead of failing the whole response."""
    cleaned = dict(data)
    for name, field in model_cls.model_fields.items():
        value = cleaned.get(name)
        if get_origin(field.annotation) is not list or not isinstance(value, list):
            continue
        (item_type,) = get_args(field.annotation) or (None,)
        if not (isinstance(item_type, type) and issubclass(item_type, BaseModel)):
            continue
        kept = []
        for item in value:
            try:
                kept.append(item_type.model_validate(item))
            except ValidationError:
                logger.info("Dropped invalid %s item from AI response", item_type.__name__)
        cleaned[name] = kept
    return model_cls.model_validate(cleaned)


def call_json(provider: LLMProvider, prompt: str, model_cls: type[M]) -> M:
    raw = provider.complete(SYSTEM_PROMPT, prompt)
    try:
        return validate_lenient(model_cls, parse_json_object(raw))
    except (ValueError, ValidationError) as first_error:
        logger.warning("Invalid structured AI output for %s; retrying with repair prompt", model_cls.__name__)
        raw_retry = provider.complete(SYSTEM_PROMPT, repair_prompt(prompt, raw, str(first_error)))
        try:
            return validate_lenient(model_cls, parse_json_object(raw_retry))
        except (ValueError, ValidationError) as exc:
            raise LLMResponseError(
                "The AI model returned an invalid structured response twice, so the analysis was stopped "
                "rather than showing unreliable results. Please try again."
            ) from exc


class LLMAnalysisEngine:
    def __init__(self, provider: LLMProvider, progress: ProgressCallback | None = None):
        self.provider = provider
        self.progress = progress or (lambda stage, pct: None)

    def analyze(self, pages: list[str], location_unit: str, filename: str) -> tuple[AnalysisResult, dict]:
        settings = get_settings()
        plan = build_chunks(
            pages,
            location_unit,
            chunk_size=settings.chunk_size_chars,
            overlap=settings.chunk_overlap_chars,
            max_chunks=settings.max_chunks,
        )
        unit_label = "Page" if location_unit == "page" else "Section"
        total = len(plan.chunks)
        extractions, risk_sets = [], []

        for chunk in plan.chunks:
            meta = {
                "filename": filename,
                "chunk_number": chunk.index + 1,
                "chunk_total": total,
                "unit_label": unit_label,
                "page_start": chunk.page_start,
                "page_end": chunk.page_end,
            }
            base_pct = 10 + int(75 * chunk.index / total)
            step_pct = max(1, int(75 / total / 2))
            self.progress(f"Extracting clauses, parties and dates (part {chunk.index + 1} of {total})", base_pct)
            extractions.append(clause_service.extract_chunk(self.provider, chunk.text, meta))
            self.progress(f"Detecting potential risks (part {chunk.index + 1} of {total})", base_pct + step_pct)
            risk_sets.append(risk_service.detect_chunk_risks(self.provider, chunk.text, meta))

        merged = clause_service.merge_extractions(extractions)
        risks = risk_service.merge_risks(risk_sets)

        self.progress("Generating executive summary", 88)
        opening = plan.chunks[0].text[:6000] if plan.chunks else ""
        synthesis = summary_service.synthesize(
            self.provider,
            opening,
            summary_service.build_digest(merged, risks),
            {"filename": filename, "unit_label": unit_label, "page_start": 1, "page_end": plan.chunks[0].page_end if plan.chunks else 1},
        )

        result = AnalysisResult(
            document_title=synthesis.document_title,
            document_type=synthesis.document_type,
            executive_summary=synthesis.executive_summary,
            key_points=synthesis.key_points,
            main_takeaways=synthesis.main_takeaways,
            recommendations=synthesis.recommendations,
            limitations=plan.notes + synthesis.limitations,
            risks=risks,
            **merged,
        )
        info = {
            "chunks_total": total,
            "pages_total": plan.total_pages,
            "pages_analyzed": plan.last_page_analyzed,
            "chars_total": plan.total_chars,
            "chars_analyzed": plan.analyzed_chars,
            "coverage_percent": round(100 * plan.analyzed_chars / max(plan.total_chars, 1)),
            "truncated": plan.truncated,
            "llm_calls": total * 2 + 1,
        }
        return result, info
