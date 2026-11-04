"""FastAPI application entry point.

Run with:  uvicorn app.main:app --reload   (from the backend/ directory)
Swagger UI: http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.database import init_db
from app.routes import analysis_routes, document_routes, system_routes
from app.services.analysis_service import recover_interrupted_jobs
from app.utils.errors import AppError

settings = get_settings()
logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("legal_analyzer")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    recovered = recover_interrupted_jobs()
    if recovered:
        logger.warning("Marked %d interrupted analysis job(s) as failed", recovered)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "REST API for uploading legal documents (PDF/DOCX/TXT), extracting their text and producing a structured, "
        "source-verified analysis with an LLM (or a clearly labelled rule-based demo engine). "
        "Analysis is preliminary and is not legal advice."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


def _error(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    body = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=body)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError):
    return _error(exc.status_code, exc.code, exc.message)


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_request: Request, exc: StarletteHTTPException):
    return _error(exc.status_code, "HTTP_ERROR", str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return _error(422, "VALIDATION_ERROR", "The request was invalid.", details)


@app.exception_handler(Exception)
async def unhandled_error_handler(_request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", type(exc).__name__)
    return _error(500, "INTERNAL_ERROR", "An unexpected server error occurred.")


app.include_router(system_routes.router)
app.include_router(document_routes.router)
app.include_router(analysis_routes.router)
app.include_router(analysis_routes.tools_router)
