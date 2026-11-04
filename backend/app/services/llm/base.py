"""Provider-agnostic LLM interface with shared retry / error-mapping behaviour."""

import logging
import random
import time
from abc import ABC, abstractmethod
from urllib.parse import urlparse

import httpx

from app.utils.errors import LLMConfigError, LLMError, LLMRateLimitError, LLMTimeoutError

logger = logging.getLogger(__name__)

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def is_local_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in _LOCAL_HOSTS or host.endswith(".localhost")


class LLMProvider(ABC):
    """A text-in / text-out chat model. Subclasses implement a single HTTP request."""

    name: str = "base"

    def __init__(self, model: str, timeout: float, max_retries: int, max_output_tokens: int):
        self.model = model
        self.timeout = timeout
        self.max_retries = max_retries
        self.max_output_tokens = max_output_tokens
        self.transport: httpx.BaseTransport | None = None  # injectable for tests

    @property
    @abstractmethod
    def is_external(self) -> bool:
        """True when document text leaves this machine (requires user consent)."""

    @property
    def display_name(self) -> str:
        return self.name

    @abstractmethod
    def _request(self, client: httpx.Client, system: str, user: str) -> httpx.Response: ...

    @abstractmethod
    def _parse(self, payload: dict) -> str: ...

    def complete(self, system: str, user: str) -> str:
        """Send one prompt and return the model's text, retrying transient failures."""
        attempt = 0
        while True:
            try:
                with httpx.Client(timeout=httpx.Timeout(self.timeout, connect=15.0), transport=self.transport) as client:
                    response = self._request(client, system, user)
            except httpx.TimeoutException as exc:
                error: LLMError = LLMTimeoutError(
                    f"The AI provider did not respond within {int(self.timeout)} seconds."
                )
                cause: Exception = exc
            except httpx.HTTPError as exc:
                error = LLMError("Could not reach the AI provider. Check your network connection and provider URL.")
                cause = exc
            else:
                if response.status_code == 200:
                    try:
                        return self._parse(response.json())
                    except (ValueError, KeyError, IndexError, TypeError) as exc:
                        raise LLMError("The AI provider returned an unexpected response format.") from exc
                error, cause = self._map_status(response), None
                if response.status_code in (400, 401, 403, 404, 422):
                    raise error  # not retryable

            if attempt >= self.max_retries:
                if cause:
                    raise error from cause
                raise error
            attempt += 1
            delay = min(30.0, (2**attempt) + random.uniform(0, 1))
            if isinstance(error, LLMRateLimitError) and getattr(error, "retry_after", None):
                delay = min(60.0, float(error.retry_after))
            logger.warning("LLM call failed (%s); retry %d/%d in %.1fs", error.code, attempt, self.max_retries, delay)
            time.sleep(delay)

    def _map_status(self, response: httpx.Response) -> LLMError:
        status = response.status_code
        detail = self._error_detail(response)
        if status in (401, 403):
            return LLMConfigError("The AI provider rejected the API key. Check the configured credentials.")
        if status == 404:
            return LLMConfigError(f"The configured model '{self.model}' was not found at the provider.{detail}")
        if status == 429:
            err = LLMRateLimitError("The AI provider's rate limit was reached. Please try again in a minute.")
            try:
                err.retry_after = float(response.headers.get("retry-after", "0")) or None  # type: ignore[attr-defined]
            except ValueError:
                err.retry_after = None  # type: ignore[attr-defined]
            return err
        if status == 400:
            return LLMError(f"The AI provider rejected the request (HTTP 400). The document may be too long for the model.{detail}")
        return LLMError(f"The AI provider returned an error (HTTP {status}).{detail}")

    @staticmethod
    def _error_detail(response: httpx.Response) -> str:
        """The provider's own short error message, which usually names the actual problem."""
        try:
            body = response.json()
        except ValueError:
            return ""
        if not isinstance(body, dict):
            return ""
        error = body.get("error")
        message = error.get("message") if isinstance(error, dict) else error or body.get("detail") or body.get("message")
        return f" Provider said: {str(message)[:200]}" if message else ""
