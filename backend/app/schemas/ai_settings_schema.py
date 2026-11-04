from typing import Literal

from pydantic import BaseModel, Field

ProviderId = Literal["anthropic", "nvidia", "openai", "demo"]


class AISettingsIn(BaseModel):
    provider: ProviderId
    model: str | None = Field(default=None, max_length=200)
    api_url: str | None = Field(default=None, max_length=500)
    # Blank means "keep the saved key" (or the key from backend/.env).
    api_key: str | None = Field(default=None, max_length=500)


class ProviderOption(BaseModel):
    id: ProviderId
    label: str
    model: str | None
    api_url: str | None
    url_editable: bool
    has_key: bool
    key_hint: str | None  # last characters only; the key itself never leaves the server
    key_source: Literal["saved", "env"] | None


class AISettingsOut(BaseModel):
    active_provider: ProviderId
    customized: bool  # True when choices saved on the Settings page override backend/.env
    providers: list[ProviderOption]


class ConnectionTestOut(BaseModel):
    status: Literal["ok", "warning", "failed"]
    message: str
    code: str | None = None
    provider: ProviderId
    model: str | None = None
    latency_ms: int | None = None
