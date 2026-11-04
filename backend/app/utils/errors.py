"""Application error types. Every error carries a stable code and a user-safe message."""


class AppError(Exception):
    status_code = 400
    code = "APP_ERROR"

    def __init__(self, message: str, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class FileValidationError(AppError):
    status_code = 400
    code = "INVALID_FILE"


class ExtractionError(AppError):
    status_code = 422
    code = "EXTRACTION_FAILED"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"


class LLMError(AppError):
    """Base class for language-model provider failures."""

    status_code = 502
    code = "AI_PROVIDER_ERROR"


class LLMConfigError(LLMError):
    status_code = 503
    code = "AI_NOT_CONFIGURED"


class LLMTimeoutError(LLMError):
    status_code = 504
    code = "AI_TIMEOUT"


class LLMRateLimitError(LLMError):
    status_code = 429
    code = "AI_RATE_LIMITED"


class LLMResponseError(LLMError):
    status_code = 502
    code = "AI_INVALID_RESPONSE"
