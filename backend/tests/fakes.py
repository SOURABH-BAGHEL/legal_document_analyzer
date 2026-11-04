"""Mock LLM providers returning canned structured responses (no network, no API cost)."""

import json

from app.services.llm.base import LLMProvider
from app.utils.errors import LLMTimeoutError

EXTRACTION = {
    "parties": [
        {"name": "Mr. Arjun Mehta", "role": "Landlord", "party_type": "individual",
         "rights": ["Receive monthly rent"], "obligations": ["Carry out structural repairs"]},
        {"name": "Ms. Priya Sharma", "role": "Tenant", "party_type": "individual",
         "payment_obligations": ["Pay Rs. 25,000 monthly rent"]},
        {"name": "Imaginary Corp Ltd", "role": "Guarantor"},  # not in the document -> must be removed
    ],
    "clauses": [
        {"name": "Rent", "category": "payment", "importance": "high", "page_number": 9,
         "original_text": "The Tenant shall pay a monthly rent of Rs. 25,000 (Rupees Twenty-Five Thousand only) to the Landlord.",
         "simplified_explanation": "The tenant pays Rs. 25,000 every month."},
        {"name": "Invented clause", "category": "Other Important Clauses", "importance": "Low",
         "original_text": "The Tenant shall paint the moon purple every Tuesday afternoon without fail.",
         "simplified_explanation": "Fabricated."},
        {"category": "Termination Clause"},  # invalid item (no name) -> dropped, not fatal
    ],
    "financial_terms": [
        {"term_type": "Payment Amount", "amount": "Rs. 25,000", "currency": "INR", "frequency": "monthly",
         "original_text": "The Tenant shall pay a monthly rent of Rs. 25,000"},
    ],
    "important_dates": [
        {"date_type": "Contract Start", "value": "1st January 2026", "is_explicit": True,
         "original_text": "This Agreement shall commence on 1st January 2026"},
        {"date_type": "Renewal", "value": "2 October 2026", "is_explicit": True, "original_text": ""},
    ],
    "legal_terms": [{"term": "Indemnify", "explanation": "Cover someone's losses."}],
    "simplifications": [],
}
RISKS = {
    "risks": [
        {"title": "Unilateral termination without notice", "category": "One-sided Termination", "risk_level": "HIGH",
         "original_text": "The Landlord may terminate this Agreement without notice if the Tenant fails to pay rent for two (2) consecutive months",
         "explanation": "This clause is illegal and lets the landlord end the agreement suddenly.",
         "potential_impact": "Tenant could lose housing quickly.", "suggested_questions": ["Can notice be added?"]},
    ]
}
SYNTHESIS = {
    "document_title": "Residential Rental Agreement",
    "document_type": "Residential Rental Agreement",
    "executive_summary": "A fictional 11-month rental agreement between a landlord and a tenant.",
    "key_points": ["Rent is Rs. 25,000 per month"],
    "main_takeaways": ["Check the lock-in period"],
    "recommendations": ["Clarify the termination notice"],
    "limitations": [],
}


class FakeProvider(LLMProvider):
    name = "fake"

    def __init__(self, external: bool = False, responses: dict | None = None, fail_with: Exception | None = None):
        super().__init__(model="fake-model", timeout=5, max_retries=0, max_output_tokens=1000)
        self._external = external
        self.responses = responses or {}
        self.fail_with = fail_with
        self.calls: list[str] = []

    @property
    def is_external(self) -> bool:
        return self._external

    def _request(self, client, system, user):  # pragma: no cover - complete() is overridden
        raise NotImplementedError

    def _parse(self, payload):  # pragma: no cover
        raise NotImplementedError

    def complete(self, system: str, user: str) -> str:
        self.calls.append(user)
        if self.fail_with:
            raise self.fail_with
        if "TASK: RISK DETECTION" in user:
            return self.responses.get("risks", json.dumps(RISKS))
        if "DOCUMENT CLASSIFICATION" in user:
            return self.responses.get("synthesis", "```json\n" + json.dumps(SYNTHESIS) + "\n```")
        if "PLAIN-LANGUAGE SIMPLIFICATION" in user and "TASKS for this part" not in user:
            return json.dumps({"simplified_text": "The tenant must pay rent by the 5th.", "key_terms": [], "notes": []})
        return self.responses.get("extraction", json.dumps(EXTRACTION))


def timeout_provider() -> FakeProvider:
    return FakeProvider(fail_with=LLMTimeoutError("The AI provider did not respond within 5 seconds."))
