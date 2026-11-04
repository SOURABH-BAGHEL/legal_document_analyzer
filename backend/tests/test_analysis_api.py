import json

import pytest

from app.services import analysis_service, simplify_service
from app.utils.errors import LLMRateLimitError
from tests.conftest import upload
from tests.fakes import FakeProvider, timeout_provider


def _use_provider(monkeypatch, provider):
    monkeypatch.setattr(analysis_service, "get_llm_provider", lambda: provider)
    monkeypatch.setattr(simplify_service, "get_llm_provider", lambda: provider)


def _analyze(client, doc_id, consent=False):
    return client.post(f"/api/analysis/{doc_id}/analyze", json={"consent_external_processing": consent})


# --- demo mode ----------------------------------------------------------------


def test_demo_mode_full_workflow(client, sample_pdf):
    doc = upload(client, "sample.pdf", sample_pdf, "application/pdf").json()
    assert client.get(f"/api/analysis/{doc['id']}").json()["error"]["code"] == "ANALYSIS_NOT_FOUND"

    started = _analyze(client, doc["id"])
    assert started.status_code == 202
    assert started.json()["mode"] == "demo"

    res = client.get(f"/api/analysis/{doc['id']}").json()
    assert res["status"] == "completed", res
    assert res["mode"] == "demo" and res["provider"] == "demo"
    assert res["document_type"] == "Rental / Lease Agreement"
    assert any("DEMO MODE" in item for item in res["limitations"])
    assert {p["role"] for p in res["parties"]} == {"Landlord", "Tenant"}
    categories = {c["category"] for c in res["clauses"]}
    assert {"Payment Terms", "Termination Clause", "Confidentiality Clause", "Dispute Resolution"} <= categories
    assert all(c["verification"] in ("verified", "approximate") for c in res["clauses"])
    assert all(c["page_number"] in (1, 2) for c in res["clauses"])
    assert len(res["clause_coverage"]) == 15
    ip = next(c for c in res["clause_coverage"] if c["category"] == "Intellectual Property")
    assert ip["status"] == "not_identified" and ip["message"] == "Not identified in the document."
    assert any(f["amount"] == "Rs. 25,000" for f in res["financial_terms"])
    assert any(d["value"] == "1st January 2026" and d["date_type"] == "Contract Start" for d in res["important_dates"])
    assert any(r["risk_level"] == "High" for r in res["risks"])
    assert res["document"]["original_filename"] == "sample.pdf"

    docs = client.get("/api/documents/").json()["items"]
    assert docs[0]["analysis_status"] == "completed" and docs[0]["risk_count"] > 0


def test_dashboard_and_history_reflect_real_data(client, sample_txt):
    empty = client.get("/api/dashboard/stats").json()
    assert empty["total_documents"] == 0 and empty["total_clauses"] == 0 and len(empty["activity"]) == 14

    doc = upload(client, "lease.txt", sample_txt).json()
    _analyze(client, doc["id"])
    analysis = client.get(f"/api/analysis/{doc['id']}").json()

    stats = client.get("/api/dashboard/stats").json()
    assert stats["total_documents"] == 1 and stats["documents_analyzed"] == 1
    assert stats["total_clauses"] == len(analysis["clauses"])
    assert stats["total_risks"] == len(analysis["risks"])
    assert stats["activity"][-1]["uploads"] == 1 and stats["activity"][-1]["analyses"] == 1
    assert stats["recent_analyses"][0]["id"] == analysis["id"]

    history = client.get("/api/analysis/history").json()
    assert history[0]["id"] == analysis["id"] and history[0]["status"] == "completed"
    specific = client.get(f"/api/analysis/{doc['id']}?analysis_id={analysis['id']}")
    assert specific.status_code == 200


def test_analyze_missing_document(client):
    res = _analyze(client, "missing-id")
    assert res.status_code == 404


# --- LLM pipeline with mocked provider -------------------------------------------


def test_llm_pipeline_validates_and_verifies_ai_output(client, sample_txt, monkeypatch):
    provider = FakeProvider()
    _use_provider(monkeypatch, provider)
    doc = upload(client, "lease.txt", sample_txt).json()

    assert _analyze(client, doc["id"]).json()["mode"] == "live"
    res = client.get(f"/api/analysis/{doc['id']}").json()
    assert res["status"] == "completed", res
    assert res["provider"] == "fake" and res["model_name"] == "fake-model"
    assert len(provider.calls) == 3  # extraction + risks + synthesis for a single chunk
    assert "<document>" in provider.calls[0]

    clauses = {c["name"]: c for c in res["clauses"]}
    assert "Termination Clause" not in clauses  # invalid item dropped
    rent = clauses["Rent"]
    assert rent["category"] == "Payment Terms" and rent["importance"] == "High"
    assert rent["verification"] == "verified" and rent["page_number"] == 1  # LLM claimed page 9; corrected
    fake = clauses["Invented clause"]
    assert fake["verification"] == "unverified" and fake["page_number"] is None and fake["is_uncertain"]

    assert [p["name"] for p in res["parties"]] == ["Mr. Arjun Mehta", "Ms. Priya Sharma"]  # fabricated party removed
    assert any("removed" in item for item in res["limitations"])

    risk = res["risks"][0]
    assert risk["risk_level"] == "High" and risk["verification"] == "verified"
    assert "illegal" not in risk["explanation"]  # definitive legal conclusion softened

    dates = {d["value"]: d for d in res["important_dates"]}
    assert dates["1st January 2026"]["is_explicit"] is True
    assert dates["2 October 2026"]["is_explicit"] is False  # not in document -> not presented as explicit
    assert res["executive_summary"].startswith("A fictional")


def test_invalid_ai_json_retries_then_fails_cleanly(client, sample_txt, monkeypatch):
    provider = FakeProvider(responses={"extraction": "Sorry, I cannot produce JSON."})
    _use_provider(monkeypatch, provider)
    doc = upload(client, "lease.txt", sample_txt).json()
    _analyze(client, doc["id"])

    res = client.get(f"/api/analysis/{doc['id']}").json()
    assert res["status"] == "failed"
    assert res["error_code"] == "AI_INVALID_RESPONSE"
    assert res["clauses"] == [] and res["executive_summary"] is None  # no partial results shown
    assert len(provider.calls) == 2  # original + one repair attempt
    assert client.get(f"/api/documents/{doc['id']}").json()["analysis_status"] == "failed"


def test_repair_prompt_recovers_from_one_bad_response(client, sample_txt, monkeypatch):
    provider = FakeProvider()
    responses = iter(["not json", json.dumps({"parties": [], "clauses": []})])
    original = provider.complete

    def flaky(system, user):
        if "TASKS for this part" in user:
            provider.calls.append(user)
            return next(responses)
        return original(system, user)

    provider.complete = flaky
    _use_provider(monkeypatch, provider)
    doc = upload(client, "lease.txt", sample_txt).json()
    _analyze(client, doc["id"])
    assert client.get(f"/api/analysis/{doc['id']}").json()["status"] == "completed"


@pytest.mark.parametrize(
    "provider_factory, code",
    [
        (timeout_provider, "AI_TIMEOUT"),
        (lambda: FakeProvider(fail_with=LLMRateLimitError("Rate limited")), "AI_RATE_LIMITED"),
    ],
)
def test_provider_failures_mark_analysis_failed(client, sample_txt, monkeypatch, provider_factory, code):
    _use_provider(monkeypatch, provider_factory())
    doc = upload(client, "lease.txt", sample_txt).json()
    _analyze(client, doc["id"])
    res = client.get(f"/api/analysis/{doc['id']}").json()
    assert res["status"] == "failed" and res["error_code"] == code


def test_external_provider_requires_consent(client, sample_txt, monkeypatch):
    _use_provider(monkeypatch, FakeProvider(external=True))
    doc = upload(client, "lease.txt", sample_txt).json()

    res = _analyze(client, doc["id"], consent=False)
    assert res.status_code == 400 and res.json()["error"]["code"] == "CONSENT_REQUIRED"
    assert client.get(f"/api/documents/{doc['id']}").json()["analysis_status"] == "not_started"

    assert _analyze(client, doc["id"], consent=True).status_code == 202


def test_simplify_endpoint_demo_and_live(client, monkeypatch):
    text = "The lessee shall remit the monthly consideration on or before the fifth day of each calendar month."
    demo = client.post("/api/tools/simplify", json={"text": text}).json()
    assert demo["mode"] == "demo"
    assert demo["simplified_text"].startswith("The tenant must pay the monthly rent/payment")
    assert any(t["term"] == "Lessee" for t in demo["key_terms"])

    _use_provider(monkeypatch, FakeProvider())
    live = client.post("/api/tools/simplify", json={"text": text}).json()
    assert live["mode"] == "live" and live["simplified_text"] == "The tenant must pay rent by the 5th."

    assert client.post("/api/tools/simplify", json={"text": ""}).status_code == 422
