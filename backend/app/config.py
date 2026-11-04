"""Application configuration loaded from environment variables / backend/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Application -------------------------------------------------------
    app_name: str = "AI-Powered Legal Document Analyzer"
    app_version: str = "1.0.0"
    log_level: str = "INFO"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Storage -----------------------------------------------------------
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'legal_analyzer.db').as_posix()}"
    # Uploaded files live here. This directory is never mounted as static content.
    storage_dir: Path = BACKEND_DIR / "storage" / "uploads"

    # --- Upload & extraction limits ---------------------------------------
    max_upload_size_mb: int = 20
    min_extracted_chars: int = 80
    # DOCX/TXT have no physical pages; text is split into "sections" of this size.
    section_size_chars: int = 3500

    # --- Analysis pipeline -------------------------------------------------
    chunk_size_chars: int = 18000
    chunk_overlap_chars: int = 1200
    max_chunks: int = 15

    # --- LLM provider ------------------------------------------------------
    # auto | anthropic | nvidia | openai | demo
    llm_provider: str = "auto"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5-5"
    # Named *_API_URL (not *_BASE_URL) on purpose so unrelated tooling env vars are not picked up.
    anthropic_api_url: str = "https://api.anthropic.com"
    nvidia_api_key: str | None = None
    nvidia_model: str = "nvidia/nemotron-3-super-120b-a12b"
    nvidia_api_url: str = "https://integrate.api.nvidia.com/v1"
    openai_api_key: str | None = None
    openai_api_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    openai_json_mode: bool = True
    llm_timeout_seconds: float = 180.0
    llm_max_retries: int = Field(default=2, ge=0, le=5)
    llm_max_output_tokens: int = 8000

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
