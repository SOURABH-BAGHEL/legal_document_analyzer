"""AI provider choices saved from the Settings page, layered on top of backend/.env."""

import re
from urllib.parse import urlparse

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import SessionLocal
from app.models import AISetting
from app.schemas.ai_settings_schema import AISettingsIn, AISettingsOut, ProviderOption
from app.utils.errors import AppError

PROVIDER_LABELS = {
    "anthropic": "Anthropic Claude",
    "nvidia": "NVIDIA AI API",
    "openai": "OpenAI / OpenAI-compatible",
    "demo": "Demo mode (rule-based, no AI)",
}


def clean_input(payload: AISettingsIn) -> AISettingsIn:
    """Normalise form input: blanks become None, a pasted "Bearer " prefix is dropped, URLs are checked."""
    model = (payload.model or "").strip() or None
    api_url = (payload.api_url or "").strip().rstrip("/") or None
    api_key = re.sub(r"^bearer\s+", "", (payload.api_key or "").strip(), flags=re.I) or None
    if api_url:
        parsed = urlparse(api_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise AppError("The API URL must start with http:// or https://.", code="INVALID_API_URL", status_code=422)
    return AISettingsIn(provider=payload.provider, model=model, api_url=api_url, api_key=api_key)


def field_overrides(provider: str, model: str | None, api_url: str | None, api_key: str | None) -> dict:
    """Map one provider's values onto the matching Settings fields, skipping blanks."""
    if provider == "demo":
        return {}
    values = {f"{provider}_model": model, f"{provider}_api_url": api_url, f"{provider}_api_key": api_key}
    return {name: value for name, value in values.items() if value}


def _load_rows(db: Session) -> list[AISetting]:
    return list(db.scalars(select(AISetting)).all())


def effective_settings() -> Settings:
    """backend/.env values with any choices saved on the Settings page applied on top."""
    base = get_settings()
    with SessionLocal() as db:
        rows = _load_rows(db)
    update: dict = {}
    for row in rows:
        update |= field_overrides(row.provider, row.model, row.api_url, row.api_key)
        if row.is_active:
            update["llm_provider"] = row.provider
    return base.model_copy(update=update) if update else base


def save(db: Session, payload: AISettingsIn) -> None:
    payload = clean_input(payload)
    rows = {row.provider: row for row in _load_rows(db)}
    row = rows.get(payload.provider)
    if row is None:
        row = AISetting(provider=payload.provider)
        db.add(row)
    row.model = payload.model
    row.api_url = payload.api_url
    if payload.api_key:
        row.api_key = payload.api_key
    for other in rows.values():
        other.is_active = False
    row.is_active = True
    db.commit()


def reset(db: Session) -> None:
    """Forget everything saved on the Settings page, including keys, and fall back to backend/.env."""
    db.execute(delete(AISetting))
    db.commit()


def _key_hint(key: str | None) -> str | None:
    return f"••••{key[-4:]}" if key and len(key) >= 12 else None


def view(db: Session, active_provider: str) -> AISettingsOut:
    effective = effective_settings()
    rows = {row.provider: row for row in _load_rows(db)}
    options = []
    for provider, label in PROVIDER_LABELS.items():
        if provider == "demo":
            options.append(ProviderOption(
                id="demo", label=label, model=None, api_url=None, url_editable=False,
                has_key=False, key_hint=None, key_source=None,
            ))
            continue
        key = getattr(effective, f"{provider}_api_key")
        saved = provider in rows and bool(rows[provider].api_key)
        options.append(ProviderOption(
            id=provider,
            label=label,
            model=getattr(effective, f"{provider}_model"),
            api_url=getattr(effective, f"{provider}_api_url"),
            url_editable=provider == "openai",
            has_key=bool(key),
            key_hint=_key_hint(key),
            key_source="saved" if saved else "env" if key else None,
        ))
    return AISettingsOut(
        active_provider=active_provider if active_provider in PROVIDER_LABELS else "demo",
        customized=bool(rows),
        providers=options,
    )
