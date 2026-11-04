"""Analysis job lifecycle: start, run in the background, persist, report status."""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Analysis, Document
from app.schemas.analysis_schema import AnalysisResult
from app.services.ai_service import LLMAnalysisEngine
from app.services.demo_analyzer import DemoAnalysisEngine
from app.services.llm.providers import get_llm_provider
from app.services.verification_service import verify_and_finalize
from app.utils.errors import AppError, ConflictError, NotFoundError

logger = logging.getLogger(__name__)

RESULT_FIELDS = [
    "document_title", "document_type", "executive_summary", "key_points", "main_takeaways", "parties",
    "clauses", "clause_coverage", "risks", "financial_terms", "important_dates", "legal_terms",
    "simplifications", "recommendations", "limitations",
]


def start_analysis(db: Session, document_id: str, consent_external: bool) -> Analysis:
    doc = db.get(Document, document_id)
    if not doc:
        raise NotFoundError("Document not found.", code="DOCUMENT_NOT_FOUND")
    if doc.extraction_status != "completed" or not doc.char_count:
        raise AppError("This document has no extracted text to analyse.", code="NO_TEXT", status_code=422)
    if doc.analysis_status == "processing":
        raise ConflictError("An analysis for this document is already running.", code="ANALYSIS_IN_PROGRESS")

    provider = get_llm_provider()  # raises LLMConfigError if misconfigured
    if provider and provider.is_external and not consent_external:
        raise AppError(
            f"This analysis sends the document text to a third-party AI service ({provider.display_name}). "
            "Please confirm that you consent to this processing.",
            code="CONSENT_REQUIRED",
            status_code=400,
        )

    analysis = Analysis(
        document_id=doc.id,
        status="pending",
        progress_stage="Queued",
        progress_percent=2,
        mode="live" if provider else "demo",
        provider=provider.name if provider else "demo",
        model_name=provider.model if provider else "rule-based-demo",
    )
    doc.analysis_status = "processing"
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


def run_analysis(analysis_id: str) -> None:
    """Background job. Opens its own session; never raises."""
    db = SessionLocal()
    try:
        analysis = db.get(Analysis, analysis_id)
        if not analysis:
            return
        doc = analysis.document
        pages = list(doc.content.pages) if doc.content else []

        def progress(stage: str, pct: int) -> None:
            analysis.status = "processing"
            analysis.progress_stage = stage[:200]
            analysis.progress_percent = max(0, min(99, pct))
            db.commit()

        progress("Preparing document text", 5)
        if analysis.mode == "live":
            provider = get_llm_provider()
            if provider is None:
                raise AppError("The AI provider is no longer configured.", code="AI_NOT_CONFIGURED")
            engine = LLMAnalysisEngine(provider, progress)
        else:
            engine = DemoAnalysisEngine(progress)

        result, info = engine.analyze(pages, doc.location_unit, doc.original_filename)
        progress("Verifying quotes and page references against the document", 95)
        result = verify_and_finalize(result, pages)
        if doc.extraction_warnings:
            result.limitations = list(doc.extraction_warnings) + result.limitations

        _store_result(analysis, result, info)
        analysis.status = "completed"
        analysis.progress_stage = "Completed"
        analysis.progress_percent = 100
        analysis.completed_at = datetime.now(timezone.utc)
        doc.analysis_status = "completed"
        db.commit()
        logger.info("Analysis %s completed (%s mode, %d clauses, %d risks)", analysis.id, analysis.mode, len(result.clauses), len(result.risks))
    except Exception as exc:  # job must always end in a terminal state
        db.rollback()
        _mark_failed(db, analysis_id, exc)
    finally:
        db.close()


def _store_result(analysis: Analysis, result: AnalysisResult, info: dict) -> None:
    data = result.model_dump(mode="json")
    for field in RESULT_FIELDS:
        setattr(analysis, field, data[field])
    analysis.processing_info = info


def _mark_failed(db: Session, analysis_id: str, exc: Exception) -> None:
    if isinstance(exc, AppError):
        code, message = exc.code, exc.message
        logger.warning("Analysis %s failed: %s", analysis_id, code)
    else:
        code, message = "ANALYSIS_FAILED", "An unexpected error occurred while analysing the document."
        logger.exception("Analysis %s crashed", analysis_id)
    analysis = db.get(Analysis, analysis_id)
    if not analysis:
        return
    analysis.status = "failed"
    analysis.error_code = code
    analysis.error_message = message
    analysis.progress_stage = "Failed"
    analysis.completed_at = datetime.now(timezone.utc)
    if analysis.document:
        analysis.document.analysis_status = "failed"
    db.commit()


def get_analysis(db: Session, document_id: str, analysis_id: str | None = None) -> Analysis:
    stmt = select(Analysis).where(Analysis.document_id == document_id)
    if analysis_id:
        stmt = stmt.where(Analysis.id == analysis_id)
    analysis = db.scalars(stmt.order_by(Analysis.created_at.desc()).limit(1)).first()
    if not analysis:
        if not db.get(Document, document_id):
            raise NotFoundError("Document not found.", code="DOCUMENT_NOT_FOUND")
        raise NotFoundError("No analysis exists for this document yet.", code="ANALYSIS_NOT_FOUND")
    return analysis


def list_history(db: Session, limit: int = 100) -> list[Analysis]:
    return list(db.scalars(select(Analysis).order_by(Analysis.created_at.desc()).limit(limit)).all())


def recover_interrupted_jobs() -> int:
    """Jobs left 'processing' by a server restart can never finish; mark them failed."""
    db = SessionLocal()
    try:
        stale = db.scalars(select(Analysis).where(Analysis.status.in_(["pending", "processing"]))).all()
        for analysis in stale:
            analysis.status = "failed"
            analysis.error_code = "INTERRUPTED"
            analysis.error_message = "The analysis was interrupted because the server restarted. Please run it again."
            analysis.completed_at = datetime.now(timezone.utc)
            if analysis.document:
                analysis.document.analysis_status = "failed"
        db.commit()
        return len(stale)
    finally:
        db.close()
