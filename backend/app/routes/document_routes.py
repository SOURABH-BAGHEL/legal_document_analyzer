from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.document_schema import DocumentContentOut, DocumentList, DocumentListItem, DocumentOut
from app.services import document_service
from app.services.risk_service import risk_counts
from app.utils.errors import FileValidationError

router = APIRouter(prefix="/api/documents", tags=["Documents"])

READ_CHUNK = 1024 * 1024


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a PDF, DOCX or TXT file. The file is validated and its text extracted immediately."""
    max_bytes = get_settings().max_upload_bytes
    buffer = bytearray()
    # Read incrementally so oversized uploads are rejected without buffering the whole body.
    while chunk := await file.read(READ_CHUNK):
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise FileValidationError(
                f"The file exceeds the maximum allowed size of {get_settings().max_upload_size_mb} MB.",
                code="FILE_TOO_LARGE",
                status_code=413,
            )
    return await run_in_threadpool(
        document_service.create_document, db, file.filename, file.content_type, bytes(buffer)
    )


@router.get("/", response_model=DocumentList)
def list_documents(
    q: str | None = Query(None, max_length=200, description="Search by file name"),
    file_type: str | None = Query(None, pattern="^(pdf|docx|txt)$"),
    status: str | None = Query(None, pattern="^(not_started|processing|completed|failed)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    docs, latest, total = document_service.list_documents(db, q, file_type, status, limit, offset)
    items = []
    for doc in docs:
        item = DocumentListItem.model_validate(doc)
        analysis = latest.get(doc.id)
        if analysis:
            item.latest_analysis_id = analysis.id
            item.document_type = analysis.document_type
            item.risk_count = sum(risk_counts(analysis.risks or []).values())
        items.append(item)
    return DocumentList(items=items, total=total)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, db: Session = Depends(get_db)):
    return document_service.get_document(db, document_id)


@router.get("/{document_id}/content", response_model=DocumentContentOut)
def get_document_content(document_id: str, db: Session = Depends(get_db)):
    """Extracted text by page/section, used to show the source of a finding."""
    doc = document_service.get_document(db, document_id)
    return DocumentContentOut(
        document_id=doc.id, location_unit=doc.location_unit, pages=list(doc.content.pages) if doc.content else []
    )


@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
def delete_document(document_id: str, db: Session = Depends(get_db)):
    document_service.delete_document(db, document_id)
    return {"deleted": True, "id": document_id}
