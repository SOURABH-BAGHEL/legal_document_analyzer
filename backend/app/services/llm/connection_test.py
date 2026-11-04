"""Light connection check for the Settings page: one tiny request, never any document text."""

import logging
import time

from app.schemas.ai_settings_schema import AISettingsIn, ConnectionTestOut
from app.services.ai_service import parse_json_object
from app.services.ai_settings_service import clean_input, effective_settings, field_overrides
from app.services.llm.providers import get_llm_provider
from app.utils.errors import AppError

logger = logging.getLogger(__name__)

TEST_TIMEOUT_SECONDS = 45.0
TEST_MAX_TOKENS = 512  # leaves room for reasoning models to think before answering
TEST_SYSTEM = "You are a connectivity check. Reply with a single JSON object and nothing else."
TEST_USER = 'Reply with exactly this JSON: {"status": "ok"}'


def run_connection_test(payload: AISettingsIn) -> ConnectionTestOut:
    payload = clean_input(payload)
    if payload.provider == "demo":
        return ConnectionTestOut(status="ok", provider="demo", message="Demo mode runs locally and needs no connection.")

    candidate = effective_settings().model_copy(update={
        **field_overrides(payload.provider, payload.model, payload.api_url, payload.api_key),
        "llm_provider": payload.provider,
        "llm_timeout_seconds": TEST_TIMEOUT_SECONDS,
        "llm_max_retries": 0,
        "llm_max_output_tokens": TEST_MAX_TOKENS,
    })
    model = getattr(candidate, f"{payload.provider}_model")

    def failed(message: str, code: str) -> ConnectionTestOut:
        return ConnectionTestOut(status="failed", code=code, message=message, provider=payload.provider, model=model)

    started = time.perf_counter()
    try:
        reply = get_llm_provider(candidate).complete(TEST_SYSTEM, TEST_USER)
    except AppError as exc:
        return failed(exc.message, exc.code)
    except Exception as exc:  # e.g. a malformed URL or characters that cannot be sent in a header
        logger.warning("Connection test failed: %s", type(exc).__name__)
        return failed("The request could not be sent. Check the API key and URL for typing mistakes.", "INVALID_REQUEST")
    latency_ms = round((time.perf_counter() - started) * 1000)

    try:
        parse_json_object(reply)
    except ValueError:
        return ConnectionTestOut(
            status="warning",
            code="NOT_JSON",
            provider=payload.provider,
            model=model,
            latency_ms=latency_ms,
            message="The connection works, but the model did not return valid JSON. Analyses need JSON and may fail with this model.",
        )
    return ConnectionTestOut(
        status="ok",
        provider=payload.provider,
        model=model,
        latency_ms=latency_ms,
        message="Connection works. The API key was accepted and the model returned valid JSON.",
    )
