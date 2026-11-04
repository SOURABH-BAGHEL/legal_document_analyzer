"""Document upload, listing, retrieval and secure deletion."""

import logging
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Analysis, Document, DocumentContent
from app.services.text_extraction_service import extract_text
from app.utils.errors import ConflictError, NotFoundError
from app.utils.file_validator import validate_upload
from app.utils.security import generate_storage_name, resolve_storage_path, sanitize_display_name, sha256_hex

logger = logging.getLogger(__name__)


def create_document(db: Session, filename: str | None, content_type: str | None, data: bytes) -> Document:
    """Validate, extract and persist an upload. Unreadable files are rejected and never stored."""
    settings = get_settings()
    display_name = sanitize_display_name(filename)
    file_type = validate_upload(display_name, content_type, data, settings.max_upload_bytes)

    # Extraction runs before saving so empty/corrupt/encrypted/scanned files are rejected up-front.
    extraction = extract_text(file_type, data)

    storage_dir: Path = settings.storage_dir
    storage_dir.mkdir(parents=True, exist_ok=True)
    stored_name = generate_storage_name(file_type)
    path = resolve_storage_path(storage_dir, stored_name)
    path.write_bytes(data)

    doc = Document(
        filename=stored_name,
        original_filename=display_name,
        file_type=file_type,
        mime_type=(content_type or "").split(";")[0][:120] or None,
        file_size=len(data),
        file_hash=sha256_hex(data),
        extraction_status="completed",
        analysis_status="not_started",
        secure_file_reference=stored_name,
        page_count=len(extraction.pages),
        char_count=extraction.char_count,
        location_unit=extraction.location_unit,
        extraction_warnings=extraction.warnings,
    )
    doc.content = DocumentContent(pages=extraction.pages)
    try:
        db.add(doc)
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    db.refresh(doc)
    logger.info("Stored document %s (%s, %d bytes, %d %ss)", doc.id, file_type, len(data), doc.page_count, doc.location_unit)
    return doc


def get_document(db: Session, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if not doc:
        raise NotFoundError("Document not found.", code="DOCUMENT_NOT_FOUND")
    return doc


def list_documents(db: Session, q: str | None, file_type: str | None, status: str | None, limit: int, offset: int):
    stmt = select(Document)
    if q:
        stmt = stmt.where(Document.original_filename.ilike(f"%{q.strip()}%"))
    if file_type:
        stmt = stmt.where(Document.file_type == file_type.lower())
    if status:
        stmt = stmt.where(Document.analysis_status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    docs = db.scalars(stmt.order_by(Document.upload_timestamp.desc()).limit(limit).offset(offset)).all()

    latest: dict[str, Analysis] = {}
    if docs:
        rows = db.scalars(
            select(Analysis).where(Analysis.document_id.in_([d.id for d in docs])).order_by(Analysis.created_at)
        ).all()
        for a in rows:
            latest[a.document_id] = a
    return docs, latest, total


def delete_document(db: Session, document_id: str) -> None:
    """Delete the database records (cascade) and the stored file."""
    settings = get_settings()
    doc = get_document(db, document_id)
    if doc.analysis_status == "processing":
        raise ConflictError("This document is currently being analysed. Please wait until analysis finishes.", code="ANALYSIS_IN_PROGRESS")
    path = resolve_storage_path(settings.storage_dir, doc.secure_file_reference)
    db.delete(doc)
    db.commit()
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.error("Could not remove stored file for deleted document %s", document_id)
    logger.info("Deleted document %s and its analyses", document_id)
