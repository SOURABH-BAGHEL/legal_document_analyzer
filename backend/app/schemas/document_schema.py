from pydantic import BaseModel, ConfigDict

from app.schemas.common import UTCDateTime


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str
    file_type: str
    mime_type: str | None
    file_size: int
    upload_timestamp: UTCDateTime
    extraction_status: str
    analysis_status: str
    page_count: int
    char_count: int
    location_unit: str
    extraction_warnings: list[str]


class DocumentListItem(DocumentOut):
    latest_analysis_id: str | None = None
    document_type: str | None = None
    risk_count: int = 0


class DocumentList(BaseModel):
    items: list[DocumentListItem]
    total: int


class DocumentContentOut(BaseModel):
    document_id: str
    location_unit: str
    pages: list[str]
