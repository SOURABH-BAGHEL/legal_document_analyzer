from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.document import utcnow


class AISetting(Base):
    """AI provider choices made on the Settings page; they take precedence over backend/.env.

    One row per provider, so switching provider keeps each provider's saved key. The key is
    stored unencrypted, which suits the single-user local deployment only.
    """

    __tablename__ = "ai_settings"

    provider: Mapped[str] = mapped_column(String(20), primary_key=True)
    model: Mapped[str | None] = mapped_column(String(200))
    api_url: Mapped[str | None] = mapped_column(String(500))
    api_key: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
