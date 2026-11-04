from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.document import Document, utcnow


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )

    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|processing|completed|failed
    progress_stage: Mapped[str | None] = mapped_column(String(200))
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(60))
    error_message: Mapped[str | None] = mapped_column(Text)

    # "live" = LLM provider, "demo" = rule-based fallback (clearly labelled in the UI)
    mode: Mapped[str] = mapped_column(String(10), default="demo")
    provider: Mapped[str | None] = mapped_column(String(40))
    model_name: Mapped[str | None] = mapped_column(String(100))

    document_title: Mapped[str | None] = mapped_column(String(300))
    document_type: Mapped[str | None] = mapped_column(String(120))
    executive_summary: Mapped[str | None] = mapped_column(Text)
    key_points: Mapped[list] = mapped_column(JSON, default=list)
    main_takeaways: Mapped[list] = mapped_column(JSON, default=list)
    parties: Mapped[list] = mapped_column(JSON, default=list)
    clauses: Mapped[list] = mapped_column(JSON, default=list)
    clause_coverage: Mapped[list] = mapped_column(JSON, default=list)
    risks: Mapped[list] = mapped_column(JSON, default=list)
    financial_terms: Mapped[list] = mapped_column(JSON, default=list)
    important_dates: Mapped[list] = mapped_column(JSON, default=list)
    legal_terms: Mapped[list] = mapped_column(JSON, default=list)
    simplifications: Mapped[list] = mapped_column(JSON, default=list)
    recommendations: Mapped[list] = mapped_column(JSON, default=list)
    limitations: Mapped[list] = mapped_column(JSON, default=list)
    processing_info: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    document: Mapped[Document] = relationship(back_populates="analyses")
