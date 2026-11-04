"""Structured analysis schema.

The same models validate (a) raw LLM output, which is treated as untrusted input, and
(b) the API response. Validators coerce harmless variations (e.g. "high" -> "High",
a string where a list is expected) and drop values that cannot be trusted.
"""

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import UTCDateTime

from app.schemas.document_schema import DocumentOut

Level = Literal["Low", "Medium", "High"]
Verification = Literal["verified", "approximate", "unverified", "not_applicable"]

CLAUSE_CATEGORIES: list[str] = [
    "Parties Involved",
    "Rights and Responsibilities",
    "Obligations",
    "Payment Terms",
    "Termination Clause",
    "Confidentiality Clause",
    "Penalty and Fine Clauses",
    "Dispute Resolution",
    "Liability Clauses",
    "Renewal Conditions",
    "Governing Law",
    "Indemnification",
    "Force Majeure",
    "Intellectual Property",
    "Other Important Clauses",
]

# Ordered from most to least specific so e.g. "late payment penalty" maps to penalties.
_CATEGORY_PATTERNS: list[tuple[str, str]] = [
    (r"indemn|hold harmless", "Indemnification"),
    (r"force majeure|act of god", "Force Majeure"),
    (r"intellectual|copyright|trademark|patent", "Intellectual Property"),
    (r"confiden|non-disclosure|nda\b", "Confidentiality Clause"),
    (r"penalt|\bfines?\b|late fee|late payment|liquidated", "Penalty and Fine Clauses"),
    (r"dispute|arbitrat|mediat", "Dispute Resolution"),
    (r"liab", "Liability Clauses"),
    (r"renew", "Renewal Conditions"),
    (r"governing|jurisdiction|applicable law", "Governing Law"),
    (r"terminat|cancel", "Termination Clause"),
    (r"payment|\bfees?\b|\brent\b|compensation|salary|price|deposit", "Payment Terms"),
    (r"obligat|duties|covenant", "Obligations"),
    (r"right|responsib", "Rights and Responsibilities"),
    (r"\bpart(y|ies)\b", "Parties Involved"),
]


def normalize_category(value: Any) -> str:
    text = str(value or "").strip()
    for cat in CLAUSE_CATEGORIES:
        if text.lower() == cat.lower():
            return cat
    low = text.lower()
    for pattern, cat in _CATEGORY_PATTERNS:
        if re.search(pattern, low):
            return cat
    return "Other Important Clauses"


def _coerce_level(value: Any, default: str = "Medium") -> str:
    low = str(value or "").strip().lower()
    if low.startswith("h") or low in {"critical", "severe"}:
        return "High"
    if low.startswith("l") or low in {"minor"}:
        return "Low"
    if low.startswith("m"):
        return "Medium"
    return default


def _str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list):
        out = []
        for item in value:
            if isinstance(item, (str, int, float)) and str(item).strip():
                out.append(str(item).strip())
            elif isinstance(item, dict):
                text = item.get("text") or item.get("description") or item.get("point")
                if text:
                    out.append(str(text).strip())
        return out
    return []


def _opt_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in {"", "null", "none", "n/a", "na", "not specified", "unknown", "not stated"}:
        return None
    return text


def _page(value: Any) -> int | None:
    try:
        page = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return page if page > 0 else None


class _Lenient(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class Party(_Lenient):
    name: str
    role: str | None = None
    party_type: str | None = None  # individual | company | organisation | government | other
    rights: list[str] = Field(default_factory=list)
    obligations: list[str] = Field(default_factory=list)
    payment_obligations: list[str] = Field(default_factory=list)
    other_commitments: list[str] = Field(default_factory=list)
    page_number: int | None = None

    _lists = field_validator("rights", "obligations", "payment_obligations", "other_commitments", mode="before")(
        lambda v: _str_list(v)
    )
    _opts = field_validator("role", "party_type", mode="before")(lambda v: _opt_str(v))
    _pg = field_validator("page_number", mode="before")(lambda v: _page(v))


class Clause(_Lenient):
    id: str | None = None
    name: str
    category: str = "Other Important Clauses"
    original_text: str = ""
    simplified_explanation: str = ""
    importance: Level = "Medium"
    page_number: int | None = None
    verification: Verification = "unverified"
    is_uncertain: bool = False

    _cat = field_validator("category", mode="before")(lambda v: normalize_category(v))
    _imp = field_validator("importance", mode="before")(lambda v: _coerce_level(v))
    _pg = field_validator("page_number", mode="before")(lambda v: _page(v))
    _txt = field_validator("original_text", "simplified_explanation", mode="before")(lambda v: str(v or "").strip())


class Risk(_Lenient):
    id: str | None = None
    title: str
    category: str = "General"
    risk_level: Level = "Medium"
    original_text: str = ""
    explanation: str = ""
    potential_impact: str = ""
    affected_party: str | None = None
    suggested_questions: list[str] = Field(default_factory=list)
    page_number: int | None = None
    verification: Verification = "unverified"
    is_uncertain: bool = False

    _lvl = field_validator("risk_level", mode="before")(lambda v: _coerce_level(v))
    _q = field_validator("suggested_questions", mode="before")(lambda v: _str_list(v))
    _pg = field_validator("page_number", mode="before")(lambda v: _page(v))
    _opt = field_validator("affected_party", mode="before")(lambda v: _opt_str(v))
    _txt = field_validator("original_text", "explanation", "potential_impact", mode="before")(
        lambda v: str(v or "").strip()
    )


class FinancialTerm(_Lenient):
    id: str | None = None
    term_type: str = "Other"  # Payment Amount | Security Deposit | Late Payment Penalty | Fee | Other
    description: str = ""
    amount: str | None = None
    currency: str | None = None
    frequency: str | None = None
    due: str | None = None
    responsible_party: str | None = None
    related_clause: str | None = None
    original_text: str = ""
    page_number: int | None = None
    verification: Verification = "unverified"

    _opts = field_validator(
        "amount", "currency", "frequency", "due", "responsible_party", "related_clause", mode="before"
    )(lambda v: _opt_str(v))
    _pg = field_validator("page_number", mode="before")(lambda v: _page(v))
    _txt = field_validator("original_text", "description", "term_type", mode="before")(lambda v: str(v or "").strip())


class ImportantDate(_Lenient):
    id: str | None = None
    date_type: str = "Other"  # Contract Start | Contract End | Renewal | Notice Period | Termination Deadline | Payment Due | Other
    label: str = ""
    value: str
    is_explicit: bool = True
    calculation_note: str | None = None
    responsible_party: str | None = None
    related_clause: str | None = None
    original_text: str = ""
    page_number: int | None = None
    verification: Verification = "unverified"

    _opts = field_validator("calculation_note", "responsible_party", "related_clause", mode="before")(
        lambda v: _opt_str(v)
    )
    _pg = field_validator("page_number", mode="before")(lambda v: _page(v))
    _txt = field_validator("original_text", "label", "date_type", mode="before")(lambda v: str(v or "").strip())


class LegalTerm(_Lenient):
    term: str
    explanation: str
    original_text: str = ""


class Simplification(_Lenient):
    original_text: str
    simplified_text: str
    page_number: int | None = None
    verification: Verification = "unverified"

    _pg = field_validator("page_number", mode="before")(lambda v: _page(v))


class ClauseCoverage(BaseModel):
    category: str
    status: Literal["identified", "not_identified"]
    count: int
    message: str


class AnalysisResult(_Lenient):
    """Complete document-level analysis (the "AI response contract")."""

    document_title: str = "Untitled document"
    document_type: str = "Legal document"
    executive_summary: str = ""
    key_points: list[str] = Field(default_factory=list)
    main_takeaways: list[str] = Field(default_factory=list)
    parties: list[Party] = Field(default_factory=list)
    clauses: list[Clause] = Field(default_factory=list)
    clause_coverage: list[ClauseCoverage] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)
    financial_terms: list[FinancialTerm] = Field(default_factory=list)
    important_dates: list[ImportantDate] = Field(default_factory=list)
    legal_terms: list[LegalTerm] = Field(default_factory=list)
    simplifications: list[Simplification] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)

    _lists = field_validator("key_points", "main_takeaways", "recommendations", "limitations", mode="before")(
        lambda v: _str_list(v)
    )


# ---------------------------------------------------------------------------
# Per-call LLM output contracts (subsets of AnalysisResult)
# ---------------------------------------------------------------------------


class ChunkExtraction(_Lenient):
    parties: list[Party] = Field(default_factory=list)
    clauses: list[Clause] = Field(default_factory=list)
    financial_terms: list[FinancialTerm] = Field(default_factory=list)
    important_dates: list[ImportantDate] = Field(default_factory=list)
    legal_terms: list[LegalTerm] = Field(default_factory=list)
    simplifications: list[Simplification] = Field(default_factory=list)


class ChunkRisks(_Lenient):
    risks: list[Risk] = Field(default_factory=list)


class Synthesis(_Lenient):
    document_title: str = "Untitled document"
    document_type: str = "Legal document"
    executive_summary: str
    key_points: list[str] = Field(default_factory=list)
    main_takeaways: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)

    _lists = field_validator("key_points", "main_takeaways", "recommendations", "limitations", mode="before")(
        lambda v: _str_list(v)
    )


class SimplifyOutput(_Lenient):
    simplified_text: str
    key_terms: list[LegalTerm] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)

    _n = field_validator("notes", mode="before")(lambda v: _str_list(v))


# ---------------------------------------------------------------------------
# API request / response models
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    consent_external_processing: bool = False


class AnalysisStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    status: str
    progress_stage: str | None = None
    progress_percent: int = 0
    error_code: str | None = None
    error_message: str | None = None
    mode: str
    provider: str | None = None
    model_name: str | None = None
    created_at: UTCDateTime
    completed_at: UTCDateTime | None = None


class AnalysisOut(AnalysisStatusOut):
    document_title: str | None = None
    document_type: str | None = None
    executive_summary: str | None = None
    key_points: list[str] = Field(default_factory=list)
    main_takeaways: list[str] = Field(default_factory=list)
    parties: list[dict] = Field(default_factory=list)
    clauses: list[dict] = Field(default_factory=list)
    clause_coverage: list[dict] = Field(default_factory=list)
    risks: list[dict] = Field(default_factory=list)
    financial_terms: list[dict] = Field(default_factory=list)
    important_dates: list[dict] = Field(default_factory=list)
    legal_terms: list[dict] = Field(default_factory=list)
    simplifications: list[dict] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    processing_info: dict = Field(default_factory=dict)
    document: DocumentOut | None = None


class AnalysisHistoryItem(BaseModel):
    id: str
    document_id: str
    original_filename: str
    file_type: str
    document_title: str | None
    document_type: str | None
    status: str
    mode: str
    provider: str | None
    risk_counts: dict[str, int]
    clause_count: int
    error_message: str | None
    created_at: UTCDateTime
    completed_at: UTCDateTime | None


class SimplifyRequest(BaseModel):
    text: str = Field(min_length=1, max_length=6000)
    consent_external_processing: bool = False


class SimplifyResponse(BaseModel):
    original_text: str
    simplified_text: str
    key_terms: list[LegalTerm]
    notes: list[str]
    mode: str
    provider: str | None
