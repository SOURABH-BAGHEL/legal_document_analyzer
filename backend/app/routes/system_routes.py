from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.ai_settings_schema import AISettingsIn, AISettingsOut, ConnectionTestOut
from app.services import ai_settings_service, dashboard_service
from app.services.llm.connection_test import run_connection_test
from app.services.llm.providers import describe_ai_status
from app.utils.file_validator import ALLOWED_TYPES

router = APIRouter(prefix="/api", tags=["System"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    settings = get_settings()
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "error"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "app": settings.app_name,
        "version": settings.app_version,
        "database": database,
        "ai_mode": describe_ai_status()["mode"],
    }


@router.get("/settings")
def public_settings():
    """Non-secret configuration shown on the Settings page. API keys are never returned."""
    settings = get_settings()
    return {
        "app_name": settings.app_name,
        "version": settings.app_version,
        "max_upload_size_mb": settings.max_upload_size_mb,
        "allowed_file_types": sorted(ALLOWED_TYPES),
        "chunk_size_chars": settings.chunk_size_chars,
        "max_chunks": settings.max_chunks,
        "ai": describe_ai_status(),
        "deployment": "single-user local deployment (no authentication)",
        "ocr_enabled": False,
    }


@router.get("/settings/ai", response_model=AISettingsOut)
def get_ai_settings(db: Session = Depends(get_db)):
    """Provider options for the Settings page. Keys are reported only as present/absent plus a short hint."""
    return ai_settings_service.view(db, describe_ai_status()["provider"])


@router.put("/settings/ai", response_model=AISettingsOut)
def save_ai_settings(body: AISettingsIn, db: Session = Depends(get_db)):
    """Save and activate a provider. Takes effect immediately, with no restart. A blank key keeps the saved one."""
    ai_settings_service.save(db, body)
    return ai_settings_service.view(db, describe_ai_status()["provider"])


@router.delete("/settings/ai", response_model=AISettingsOut)
def reset_ai_settings(db: Session = Depends(get_db)):
    """Remove everything saved on the Settings page, including keys, and go back to backend/.env."""
    ai_settings_service.reset(db)
    return ai_settings_service.view(db, describe_ai_status()["provider"])


@router.post("/settings/ai/test", response_model=ConnectionTestOut)
def test_ai_settings(body: AISettingsIn):
    """Check the given values with one tiny request, without saving them. Failures are reported in the body."""
    return run_connection_test(body)


@router.get("/dashboard/stats", tags=["Dashboard"])
def dashboard_stats(db: Session = Depends(get_db)):
    return dashboard_service.get_stats(db)
