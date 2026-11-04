from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    # Internal, randomly generated storage name (never derived from user input).
    filename: Mapped[str] = mapped_column(String(64), unique=True)
    # Sanitised display name supplied by the user.
    original_filename: Mapped[str] = mapped_column(String(255), index=True)
    file_type: Mapped[str] = mapped_column(String(10), index=True)  # pdf | docx | txt
    mime_type: Mapped[str | None] = mapped_column(String(120))
    file_size: Mapped[int] = mapped_column(Integer)
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    upload_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    extraction_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|completed|failed
    analysis_status: Mapped[str] = mapped_column(String(20), default="not_started", index=True)
    # Path relative to the storage directory; resolved and checked by utils.security.
    secure_file_reference: Mapped[str] = mapped_column(String(255))

    page_count: Mapped[int] = mapped_column(Integer, default=0)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    location_unit: Mapped[str] = mapped_column(String(10), default="page")  # page | section
    extraction_warnings: Mapped[list] = mapped_column(JSON, default=list)

    content: Mapped["DocumentContent"] = relationship(
        back_populates="document", uselist=False, cascade="all, delete-orphan", passive_deletes=True
    )
    analyses: Mapped[list["Analysis"]] = relationship(  # noqa: F821
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Analysis.created_at",
    )


class DocumentContent(Base):
    """Extracted text, kept in its own table so list queries never load document bodies."""

    __tablename__ = "document_contents"

    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    pages: Mapped[list] = mapped_column(JSON, default=list)  # list[str], one entry per page/section

    document: Mapped[Document] = relationship(back_populates="content")
