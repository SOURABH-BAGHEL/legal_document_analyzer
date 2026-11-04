"""Aggregated statistics for the dashboard, computed from stored records."""

from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Analysis, Document
from app.services.risk_service import risk_counts


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def get_stats(db: Session, days: int = 14) -> dict:
    total_documents = db.scalar(select(func.count(Document.id))) or 0
    completed = db.scalars(select(Analysis).where(Analysis.status == "completed")).all()

    # Only the latest completed analysis per document counts towards totals.
    latest: dict[str, Analysis] = {}
    for a in sorted(completed, key=lambda a: _as_utc(a.created_at)):
        latest[a.document_id] = a
    latest_list = list(latest.values())

    risk_totals = Counter({"High": 0, "Medium": 0, "Low": 0})
    categories: Counter = Counter()
    doc_types: Counter = Counter()
    total_clauses = 0
    for a in latest_list:
        risk_totals.update(risk_counts(a.risks or []))
        total_clauses += len(a.clauses or [])
        categories.update(c.get("category", "Other") for c in a.clauses or [])
        doc_types[a.document_type or "Unknown"] += 1

    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)
    uploads = Counter(
        _as_utc(ts).date()
        for ts in db.scalars(select(Document.upload_timestamp)).all()
        if _as_utc(ts).date() >= start
    )
    analyses_by_day = Counter(_as_utc(a.created_at).date() for a in completed if _as_utc(a.created_at).date() >= start)
    activity = [
        {
            "date": (start + timedelta(days=i)).isoformat(),
            "uploads": uploads.get(start + timedelta(days=i), 0),
            "analyses": analyses_by_day.get(start + timedelta(days=i), 0),
        }
        for i in range(days)
    ]

    recent = db.scalars(select(Analysis).order_by(Analysis.created_at.desc()).limit(6)).all()
    return {
        "total_documents": total_documents,
        "documents_analyzed": len(latest_list),
        "total_analyses": db.scalar(select(func.count(Analysis.id))) or 0,
        "failed_analyses": db.scalar(select(func.count(Analysis.id)).where(Analysis.status == "failed")) or 0,
        "total_clauses": total_clauses,
        "total_risks": sum(risk_totals.values()),
        "risk_distribution": dict(risk_totals),
        "clause_categories": [{"category": k, "count": v} for k, v in categories.most_common(8)],
        "document_types": [{"type": k, "count": v} for k, v in doc_types.most_common()],
        "activity": activity,
        "recent_analyses": [
            {
                "id": a.id,
                "document_id": a.document_id,
                "original_filename": a.document.original_filename if a.document else "",
                "document_title": a.document_title,
                "document_type": a.document_type,
                "status": a.status,
                "mode": a.mode,
                "risk_counts": risk_counts(a.risks or []),
                "clause_count": len(a.clauses or []),
                "created_at": _as_utc(a.created_at),
            }
            for a in recent
        ],
    }
