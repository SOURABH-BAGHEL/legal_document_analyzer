from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.analysis_schema import (
    AnalysisHistoryItem,
    AnalysisOut,
    AnalysisStatusOut,
    AnalyzeRequest,
    SimplifyRequest,
    SimplifyResponse,
)
from app.services import analysis_service, simplify_service
from app.services.risk_service import risk_counts

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])
tools_router = APIRouter(prefix="/api/tools", tags=["Tools"])


@router.get("/history", response_model=list[AnalysisHistoryItem])
def analysis_history(limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    """All analysis runs, newest first (including failed runs)."""
    return [
        AnalysisHistoryItem(
            id=a.id,
            document_id=a.document_id,
            original_filename=a.document.original_filename,
            file_type=a.document.file_type,
            document_title=a.document_title,
            document_type=a.document_type,
            status=a.status,
            mode=a.mode,
            provider=a.provider,
            risk_counts=risk_counts(a.risks or []),
            clause_count=len(a.clauses or []),
            error_message=a.error_message,
            created_at=a.created_at,
            completed_at=a.completed_at,
        )
        for a in analysis_service.list_history(db, limit)
    ]


@router.post("/{document_id}/analyze", response_model=AnalysisStatusOut, status_code=status.HTTP_202_ACCEPTED)
def analyze_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    body: AnalyzeRequest = Body(default_factory=AnalyzeRequest),
    db: Session = Depends(get_db),
):
    """Start analysis. Returns immediately; poll GET /api/analysis/{document_id} for progress and results."""
    analysis = analysis_service.start_analysis(db, document_id, body.consent_external_processing)
    background_tasks.add_task(analysis_service.run_analysis, analysis.id)
    return analysis


@router.get("/{document_id}", response_model=AnalysisOut)
def get_analysis(document_id: str, analysis_id: str | None = Query(None), db: Session = Depends(get_db)):
    """Latest analysis for a document (or a specific run via ?analysis_id=)."""
    analysis = analysis_service.get_analysis(db, document_id, analysis_id)
    out = AnalysisOut.model_validate(analysis)
    if analysis.status != "completed":
        # Never expose partial or stale result fields for unfinished/failed runs.
        for field in analysis_service.RESULT_FIELDS:
            default = AnalysisOut.model_fields[field].get_default(call_default_factory=True)
            setattr(out, field, default)
    return out


@tools_router.post("/simplify", response_model=SimplifyResponse)
def simplify_text(body: SimplifyRequest):
    """Translate a legal passage into plain English (Module 9)."""
    return simplify_service.simplify(body.text, body.consent_external_processing)
