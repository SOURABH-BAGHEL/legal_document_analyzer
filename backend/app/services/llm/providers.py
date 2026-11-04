"""Concrete LLM providers and the factory that selects one from configuration."""

import httpx

from app.config import Settings
from app.services.ai_settings_service import effective_settings
from app.services.llm.base import LLMProvider, is_local_url
from app.utils.errors import LLMConfigError


class AnthropicProvider(LLMProvider):
    """Anthropic Messages API (Claude models)."""

    name = "anthropic"

    def __init__(self, api_key: str, base_url: str, **kwargs):
        super().__init__(**kwargs)
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    @property
    def is_external(self) -> bool:
        return not is_local_url(self.base_url)

    @property
    def display_name(self) -> str:
        return "Anthropic Claude"

    def _request(self, client: httpx.Client, system: str, user: str) -> httpx.Response:
        return client.post(
            f"{self.base_url}/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": self.max_output_tokens,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
        )

    def _parse(self, payload: dict) -> str:
        return "".join(block.get("text", "") for block in payload["content"] if block.get("type") == "text")


class OpenAICompatibleProvider(LLMProvider):
    """Any OpenAI-compatible /chat/completions endpoint (OpenAI, Azure-compatible gateways, Ollama, LM Studio...)."""

    name = "openai"
    temperature = 0.0

    def __init__(self, api_key: str | None, base_url: str, json_mode: bool, **kwargs):
        super().__init__(**kwargs)
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.json_mode = json_mode

    @property
    def is_external(self) -> bool:
        return not is_local_url(self.base_url)

    @property
    def display_name(self) -> str:
        return "OpenAI-compatible API" if self.is_external else "Local OpenAI-compatible model"

    def _request(self, client: httpx.Client, system: str, user: str) -> httpx.Response:
        body: dict = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_output_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if self.json_mode:
            body["response_format"] = {"type": "json_object"}
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        return client.post(f"{self.base_url}/chat/completions", headers=headers, json=body)

    def _parse(self, payload: dict) -> str:
        return payload["choices"][0]["message"]["content"] or ""


class NvidiaProvider(OpenAICompatibleProvider):
    """NVIDIA hosted models (build.nvidia.com), served through an OpenAI-compatible API."""

    name = "nvidia"
    temperature = 0.1  # some hosted models reject exactly 0

    @property
    def display_name(self) -> str:
        return "NVIDIA AI API"


def _common(settings: Settings, model: str) -> dict:
    return {
        "model": model,
        "timeout": settings.llm_timeout_seconds,
        "max_retries": settings.llm_max_retries,
        "max_output_tokens": settings.llm_max_output_tokens,
    }


def get_llm_provider(settings: Settings | None = None) -> LLMProvider | None:
    """Return the configured provider, or None when the app should run in demo mode.

    LLM_PROVIDER=auto picks the first provider with a key (Anthropic, NVIDIA, then
    OpenAI), otherwise demo mode.
    """
    settings = settings or effective_settings()
    choice = settings.llm_provider.strip().lower()

    if choice == "auto":
        if settings.anthropic_api_key:
            choice = "anthropic"
        elif settings.nvidia_api_key:
            choice = "nvidia"
        elif settings.openai_api_key:
            choice = "openai"
        else:
            return None

    if choice == "demo":
        return None
    if choice == "anthropic":
        if not settings.anthropic_api_key:
            raise LLMConfigError("LLM_PROVIDER is 'anthropic' but ANTHROPIC_API_KEY is not set.")
        return AnthropicProvider(
            api_key=settings.anthropic_api_key,
            base_url=settings.anthropic_api_url,
            **_common(settings, settings.anthropic_model),
        )
    if choice == "nvidia":
        if not settings.nvidia_api_key:
            raise LLMConfigError("LLM_PROVIDER is 'nvidia' but NVIDIA_API_KEY is not set.")
        # JSON mode is off because support varies by hosted model; replies are parsed defensively anyway.
        return NvidiaProvider(
            api_key=settings.nvidia_api_key,
            base_url=settings.nvidia_api_url,
            json_mode=False,
            **_common(settings, settings.nvidia_model),
        )
    if choice == "openai":
        if not settings.openai_api_key and not is_local_url(settings.openai_api_url):
            raise LLMConfigError("LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set.")
        return OpenAICompatibleProvider(
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_url,
            json_mode=settings.openai_json_mode,
            **_common(settings, settings.openai_model),
        )
    raise LLMConfigError(f"Unknown LLM_PROVIDER '{settings.llm_provider}'. Use auto, anthropic, nvidia, openai or demo.")


def describe_ai_status(settings: Settings | None = None) -> dict:
    """Non-secret description of the AI configuration for the Settings page."""
    settings = settings or effective_settings()
    try:
        provider = get_llm_provider(settings)
    except LLMConfigError as exc:
        return {
            "mode": "misconfigured",
            "provider": settings.llm_provider,
            "provider_name": None,
            "model": None,
            "external_processing": False,
            "message": exc.message,
        }
    if provider is None:
        return {
            "mode": "demo",
            "provider": "demo",
            "provider_name": "Demo mode (rule-based, no AI)",
            "model": None,
            "external_processing": False,
            "message": "No LLM API key is configured. Analyses use a rule-based demo engine and are clearly labelled as such.",
        }
    return {
        "mode": "live",
        "provider": provider.name,
        "provider_name": provider.display_name,
        "model": provider.model,
        "external_processing": provider.is_external,
        "message": (
            f"Document text is sent to {provider.display_name} ({provider.model}) for analysis."
            if provider.is_external
            else f"Document text is processed by a local model ({provider.model})."
        ),
    }
