"""Test configuration: isolated temp database/storage and demo AI mode (no paid API calls)."""

import os
import shutil
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="legal_analyzer_tests_"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["STORAGE_DIR"] = str(_TMP / "uploads")
os.environ["LLM_PROVIDER"] = "demo"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["NVIDIA_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["LOG_LEVEL"] = "WARNING"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

SAMPLES = Path(__file__).resolve().parents[2] / "samples"


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    shutil.rmtree(_TMP / "uploads", ignore_errors=True)
    with TestClient(app) as c:  # runs lifespan (create tables, storage dir)
        yield c


@pytest.fixture()
def storage_dir() -> Path:
    return _TMP / "uploads"


@pytest.fixture(scope="session")
def sample_txt() -> bytes:
    return (SAMPLES / "sample_rental_agreement.txt").read_bytes()


@pytest.fixture(scope="session")
def sample_pdf() -> bytes:
    return (SAMPLES / "sample_rental_agreement.pdf").read_bytes()


@pytest.fixture(scope="session")
def sample_docx() -> bytes:
    return (SAMPLES / "sample_rental_agreement.docx").read_bytes()


def upload(client: TestClient, name: str, data: bytes, mime: str = "text/plain"):
    return client.post("/api/documents/upload", files={"file": (name, data, mime)})


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)
