"""Rule-based DEMO analysis engine.

Used only when no LLM provider is configured. It genuinely processes the uploaded
document (section detection, keyword classification, regex extraction of parties,
amounts, dates and risk patterns, a legal glossary) so the full workflow can be
demonstrated offline. Results are stored with mode="demo" and clearly labelled in
the UI as NOT being AI output. It is far less accurate than an LLM.
"""

import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache

from app.schemas.analysis_schema import (
    AnalysisResult,
    Clause,
    FinancialTerm,
    ImportantDate,
    LegalTerm,
    Party,
    Risk,
    Simplification,
)
from app.services.risk_service import sort_risks
from app.utils.text_cleaner import split_sentences, truncate

# ---------------------------------------------------------------------------
# Knowledge tables
# ---------------------------------------------------------------------------

# Ordered from most to least specific: on equal scores the earlier category wins.
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Penalty and Fine Clauses": [r"\bpenalt", r"\bfines?\b", r"late fee", r"liquidated damages", r"\bforfeit",
                                 r"interest at", r"late payment"],
    "Confidentiality Clause": [r"confidential", r"non-disclosure", r"proprietary information", r"trade secret"],
    "Indemnification": [r"indemnif", r"hold harmless"],
    "Force Majeure": [r"force majeure", r"act of god", r"beyond the reasonable control"],
    "Intellectual Property": [r"intellectual property", r"\bcopyright", r"\btrademark", r"\bpatent", r"work product"],
    "Dispute Resolution": [r"\bdisputes?\b", r"arbitrat", r"mediat", r"\bconciliation\b"],
    "Governing Law": [r"governing law", r"governed by", r"\blaws of\b", r"\bjurisdiction\b"],
    "Renewal Conditions": [r"\brenew", r"\bextension\b", r"extend the term"],
    "Termination Clause": [r"terminat", r"\bcancel", r"\bnotice period\b", r"\bvacate\b"],
    "Liability Clauses": [r"\bliabilit", r"\bliable\b", r"\bdamages\b"],
    "Payment Terms": [r"\bpay(ment|able)?\b", r"\brent\b", r"\bfees?\b", r"\bsalary\b", r"\bcompensation\b",
                      r"\binvoice", r"\bdeposit\b", r"\bconsideration\b", r"\bprice\b", r"\bremit\b"],
    "Parties Involved": [r"\bbetween\b", r"\bhereinafter\b", r"referred to as", r"\bparties\b"],
    "Obligations": [r"\bshall\b", r"\bmust\b", r"agrees? to", r"responsible for", r"\bobligat", r"\bmaintenance\b"],
    "Rights and Responsibilities": [r"right (to|of)", r"\bentitled\b", r"\bresponsibilit", r"\bduties\b", r"\buse of\b"],
}
# Generic categories only win when nothing more specific matches strongly.
WEAK_CATEGORIES = {"Obligations": 3, "Rights and Responsibilities": 2, "Parties Involved": 2}
HIGH_IMPORTANCE = {"Payment Terms", "Termination Clause", "Penalty and Fine Clauses", "Liability Clauses", "Indemnification"}
LOW_IMPORTANCE = {"Other Important Clauses", "Parties Involved"}

CATEGORY_LEADS = {
    "Payment Terms": "This clause sets out money that must be paid.",
    "Termination Clause": "This clause explains how and when the agreement can be ended.",
    "Confidentiality Clause": "This clause restricts sharing certain information.",
    "Penalty and Fine Clauses": "This clause describes penalties or extra charges.",
    "Dispute Resolution": "This clause explains how disagreements will be resolved.",
    "Liability Clauses": "This clause deals with who is responsible for losses or damage.",
    "Renewal Conditions": "This clause explains whether and how the agreement continues or renews.",
    "Governing Law": "This clause states which laws and courts apply.",
    "Indemnification": "This clause requires one party to cover certain losses of another.",
    "Force Majeure": "This clause covers events outside the parties' control.",
    "Intellectual Property": "This clause deals with ownership of ideas, content or creative work.",
    "Obligations": "This clause sets out duties a party must perform.",
    "Rights and Responsibilities": "This clause sets out rights and responsibilities.",
    "Parties Involved": "This part identifies who is entering into the agreement.",
    "Other Important Clauses": "This is a general provision of the document.",
}

PLAIN_ENGLISH: list[tuple[str, str]] = [
    (r"\bshall not\b", "must not"),
    (r"\bshall be\b", "will be"),
    (r"\bshall remain\b", "will remain"),
    (r"\bshall renew\b", "will renew"),
    (r"\bnotwithstanding the foregoing\b", "despite what is said above"),
    (r"\bshall\b", "must"),
    (r"\blessee\b", "tenant"),
    (r"\blessor\b", "landlord"),
    (r"\bremit\b", "pay"),
    (r"\bmonthly consideration\b", "monthly rent/payment"),
    (r"\bhereinafter\b", "from now on"),
    (r"\bin the event that\b", "if"),
    (r"\bin the event of\b", "if there is"),
    (r"\bprior to\b", "before"),
    (r"\bsubsequent to\b", "after"),
    (r"\bnotwithstanding\b", "despite"),
    (r"\bpursuant to\b", "under"),
    (r"\bin accordance with\b", "following"),
    (r"\bcommence(s|d)?\b", "start"),
    (r"\bforthwith\b", "immediately"),
    (r"\bthereof\b", "of it"),
    (r"\btherein\b", "in it"),
    (r"\bherein\b", "in this document"),
    (r"\bhereto\b", "to this agreement"),
    (r"\bhereunder\b", "under this agreement"),
    (r"\bhereby\b", ""),
    (r"\baforesaid\b", "mentioned above"),
    (r"\baforementioned\b", "mentioned above"),
    (r"\binter alia\b", "among other things"),
    (r"\bnull and void\b", "cancelled and of no effect"),
    (r"\bin lieu of\b", "instead of"),
    (r"\bwith effect from\b", "starting from"),
    (r"\bsave and except\b", "except"),
    (r"\bper annum\b", "per year"),
    (r"\bper mensem\b", "per month"),
]

GLOSSARY: dict[str, str] = {
    "indemnify": "To promise to cover another person's losses or legal costs if certain things happen.",
    "indemnification": "A promise to compensate someone for losses or legal costs they suffer.",
    "hold harmless": "To agree not to hold the other party responsible for certain losses.",
    "force majeure": "Unforeseeable events outside anyone's control (e.g. natural disasters) that may excuse performance.",
    "liquidated damages": "A fixed amount of compensation agreed in advance for a specific breach.",
    "arbitration": "Resolving a dispute privately through a neutral arbitrator instead of a court.",
    "mediation": "A neutral person helps the parties negotiate a settlement; it is usually non-binding.",
    "jurisdiction": "Which courts have authority to hear disputes about the agreement.",
    "governing law": "The legal system (country or state law) used to interpret the agreement.",
    "breach": "Failing to do what the agreement requires.",
    "material breach": "A serious failure that defeats the main purpose of the agreement.",
    "termination": "Ending the agreement before or at the end of its term.",
    "notice period": "The advance warning time required before an action, such as ending the agreement.",
    "consideration": "Something of value (usually money) exchanged under the agreement.",
    "lessee": "The tenant - the person who rents the property.",
    "lessor": "The landlord - the person who owns and rents out the property.",
    "licensor": "The party granting permission to use something (e.g. software or IP).",
    "licensee": "The party receiving permission to use something.",
    "confidential information": "Information the receiving party must keep secret and not misuse.",
    "non-compete": "A restriction on working for competitors or starting a competing business.",
    "non-solicitation": "A promise not to approach the other party's clients or employees.",
    "intellectual property": "Legal ownership of creations such as inventions, designs, software and content.",
    "waiver": "Voluntarily giving up a right, often only if done in writing.",
    "severability": "If one part of the agreement is invalid, the rest still applies.",
    "assignment": "Transferring rights or duties under the agreement to someone else.",
    "subletting": "Renting the property (or part of it) to another person.",
    "security deposit": "Money held as protection against damage or unpaid amounts, usually refundable.",
    "lock-in period": "A minimum period during which the agreement cannot be ended without penalty.",
    "renewal": "Continuing the agreement for a further period.",
    "automatic renewal": "The agreement continues automatically unless someone gives notice to stop it.",
    "liability": "Legal responsibility for losses, damage or costs.",
    "limitation of liability": "A cap or limit on how much a party can be required to pay for losses.",
    "warranty": "A promise that certain facts are true or that something will meet a standard.",
    "representation": "A statement of fact made to persuade the other party to sign.",
    "entire agreement": "The written document replaces all earlier discussions and promises.",
    "sole discretion": "One party can decide alone, without needing agreement or justification.",
    "pro rata": "Divided proportionally (e.g. for the part of a month used).",
    "in good faith": "Honestly and fairly, without trying to mislead.",
    "probation": "An initial trial period of employment with different notice terms.",
    "stamp duty": "A government tax that may need to be paid for an agreement to be properly executed.",
    "executed": "Signed and made legally effective.",
    "effective date": "The date from which the agreement starts to apply.",
}

RISK_RULES: list[dict] = [
    {"pattern": r"\bsole (and absolute )?discretion\b", "title": "Decision left to one party's sole discretion",
     "category": "Unbalanced Responsibilities", "level": "Medium",
     "explanation": "The wording lets one party decide alone, without needing to justify the decision or agree it with the other party.",
     "impact": "The other party may have little ability to challenge decisions made under this clause.",
     "questions": ["Can objective criteria be added for how this decision is made?", "Is there any way to challenge or appeal the decision?"]},
    {"pattern": r"without (any )?(prior )?(notice|cause|reason)", "title": "Action permitted without notice or cause",
     "category": "One-sided Termination", "level": "High",
     "explanation": "The clause allows action to be taken without notice or without giving a reason.",
     "impact": "The affected party could lose rights or the arrangement suddenly, with no time to prepare.",
     "questions": ["Can a minimum notice period be added?", "Does this right apply equally to both parties?"]},
    {"pattern": r"unlimited liability|liable for (any and )?all (losses|damages)|any and all (claims|losses|damages)",
     "title": "Broad or unlimited liability", "category": "Broad Liability", "level": "High",
     "explanation": "The wording places responsibility for a very wide range of losses on one party, with no stated limit.",
     "impact": "The responsible party could face large or unpredictable financial exposure.",
     "questions": ["Can liability be capped at a fixed amount?", "Are indirect or consequential losses excluded?"]},
    {"pattern": r"indemnif\w*[^.]{0,120}(any and all|all claims|all losses|whatsoever)|hold harmless",
     "title": "Broad indemnification obligation", "category": "Broad Indemnification", "level": "High",
     "explanation": "One party promises to cover a broad set of the other party's losses or legal costs.",
     "impact": "The indemnifying party may have to pay for losses it did not directly cause.",
     "questions": ["Is the indemnity limited to losses caused by the indemnifying party's own fault?", "Is the indemnity mutual?"]},
    {"pattern": r"automatic(ally)? renew|shall renew automatically|deemed to (be )?renew",
     "title": "Automatic renewal", "category": "Unusual Renewal", "level": "Medium",
     "explanation": "The agreement continues automatically unless someone takes action to stop it.",
     "impact": "A party may be bound for another term (and further payments) if a deadline is missed.",
     "questions": ["What is the exact deadline to stop automatic renewal?", "Will terms or prices change on renewal?"]},
    {"pattern": r"non-refundable|shall be forfeited|forfeit(ed|ure)?\b",
     "title": "Non-refundable payment or forfeiture", "category": "Unfavourable Payment Terms", "level": "Medium",
     "explanation": "Money paid may not be returned, or may be forfeited in certain situations.",
     "impact": "The paying party could lose money even if the arrangement ends early.",
     "questions": ["In which exact situations is money forfeited?", "Can a partial refund be negotiated?"]},
    {"pattern": r"\bpenalty of\b|\bpenalty equal to\b|liquidated damages",
     "title": "Penalty or pre-agreed damages", "category": "Excessive Penalty", "level": "Medium",
     "explanation": "The document sets a penalty or fixed damages amount for a breach or delay.",
     "impact": "The paying party may owe additional amounts beyond the original obligation.",
     "questions": ["Is the penalty amount proportionate to the likely loss?", "Is there a grace period before the penalty applies?"]},
    {"pattern": r"(may|reserves the right to) (unilaterally )?(amend|modify|change|revise) (these|this|the) (terms|agreement|policy)",
     "title": "Unilateral right to change terms", "category": "Unbalanced Responsibilities", "level": "High",
     "explanation": "One party can change the terms without the other party's agreement.",
     "impact": "Obligations or costs could change after signing.",
     "questions": ["Will changes require written consent from both parties?", "Is there a right to exit if terms change?"]},
    {"pattern": r"\b(perpetual|irrevocable)\b", "title": "Perpetual or irrevocable commitment",
     "category": "Ambiguous Wording", "level": "Medium",
     "explanation": "The commitment is described as lasting forever or as not able to be withdrawn.",
     "impact": "The obligation may continue long after the main relationship ends.",
     "questions": ["Can a fixed end date be added?", "Under what circumstances could this be withdrawn?"]},
    {"pattern": r"non-compete|shall not (directly or indirectly )?(engage|work|be employed)",
     "title": "Restriction on future work or business", "category": "Restrictive Confidentiality", "level": "Medium",
     "explanation": "The clause restricts working or doing business in certain areas, possibly after the agreement ends.",
     "impact": "Future employment or business opportunities may be limited.",
     "questions": ["How long and how wide (geography, industry) is the restriction?", "Is any compensation offered for it?"]},
    {"pattern": r"\b(reasonable|as deemed fit|from time to time|as may be required|appropriate)\b",
     "title": "Open-ended or subjective wording", "category": "Ambiguous Wording", "level": "Low", "max": 2,
     "explanation": "Terms such as 'reasonable' or 'as deemed fit' are not precisely defined and can be interpreted differently.",
     "impact": "Disagreements may arise about what exactly is required.",
     "questions": ["Can this term be defined more precisely?", "Who decides what counts as 'reasonable' here?"]},
    {"pattern": r"waive[sd]? (any|all|its|his|her|their) right", "title": "Waiver of rights",
     "category": "Unbalanced Responsibilities", "level": "Medium",
     "explanation": "A party agrees to give up certain rights.",
     "impact": "The party may lose protections or remedies it would otherwise have.",
     "questions": ["Which specific rights are being waived?", "Is the waiver mutual?"]},
]

ROLE_WORDS = [
    "Landlord", "Tenant", "Lessor", "Lessee", "Licensor", "Licensee", "Employer", "Employee", "Company",
    "Client", "Service Provider", "Contractor", "Consultant", "Vendor", "Supplier", "Customer", "Buyer",
    "Seller", "Lender", "Borrower", "Disclosing Party", "Receiving Party", "Owner", "Partner",
]

DOC_TYPES: list[tuple[str, list[str]]] = [
    ("Rental / Lease Agreement", [r"\blease\b", r"\brent\b", r"\blandlord\b", r"\btenant\b", r"\bpremises\b", r"\blessee\b"]),
    ("Employment Agreement", [r"\bemployee\b", r"\bemployer\b", r"\bsalary\b", r"\bemployment\b", r"\bprobation\b"]),
    ("Non-Disclosure Agreement", [r"confidential information", r"disclosing party", r"receiving party", r"non-disclosure"]),
    ("Service Agreement", [r"\bservices\b", r"service provider", r"\bdeliverables\b", r"\bclient\b", r"statement of work"]),
    ("Privacy Policy", [r"personal (data|information)", r"\bprivacy\b", r"\bcookies\b", r"data protection"]),
    ("Terms and Conditions", [r"terms of (service|use)", r"\busers?\b", r"\baccount\b", r"\bwebsite\b"]),
    ("Legal Notice", [r"legal notice", r"hereby called upon", r"\bnotice\b.*\bunder instructions\b", r"legal action"]),
    ("Sale / Purchase Agreement", [r"\bbuyer\b", r"\bseller\b", r"purchase price", r"\bgoods\b"]),
    ("Loan Agreement", [r"\bborrower\b", r"\blender\b", r"\bloan\b", r"\brepayment\b", r"\bEMI\b"]),
    ("Partnership Agreement", [r"\bpartners?\b", r"\bpartnership\b", r"profit sharing", r"capital contribution"]),
]

MONTHS = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
DATE_PATTERNS = [
    rf"\b{MONTHS}\.?\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}}\b",
    rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?{MONTHS},?\s+\d{{4}}\b",
    r"\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b",
    r"\b\d{4}-\d{2}-\d{2}\b",
]
PERIOD_PATTERN = re.compile(
    r"\b(?:[a-z]+(?:-[a-z]+)?\s+)?\(?\d{1,3}\)?\s+(?:calendar\s+|business\s+|working\s+|clear\s+)?(days?|weeks?|months?|years?)\b",
    re.I,
)
AMOUNT_PATTERN = re.compile(
    r"(?:₹|Rs\.?|INR|USD|US\$|\$|EUR|€|£|GBP)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:/-|lakhs?|crores?|million|thousand))?"
    r"|\b\d[\d,]*(?:\.\d+)?\s?(?:rupees|dollars|euros|pounds)\b",
    re.I,
)
PERCENT_PATTERN = re.compile(r"\b\d{1,2}(?:\.\d+)?\s?%(?:\s*(?:per\s+(?:annum|month|year)|p\.a\.|annually|monthly))?", re.I)
# A numbered clause start such as "4.", "4.2", "Section 4", "Article IV." followed by text.
NUMBERED_START = re.compile(r"^(?:(?:section|article|clause)\s+)?(?:\d{1,2}(?:\.\d{1,2})*[.)]|[IVX]{1,5}[.)])\s+\S", re.I)
# "4. Late Payment. If the rent ..." -> number, title, remaining text
NUMBERED_TITLE = re.compile(
    r"^((?:(?:section|article|clause)\s+)?(?:\d{1,2}(?:\.\d{1,2})*|[IVX]{1,5})[.)]?)\s+([A-Z][\w&/',-]*(?:\s+[\w&/',-]+){0,6}?)[.:]\s+(.*)$",
    re.I,
)
CAPS_HEADING = re.compile(r"^[A-Z][A-Z0-9 &/,'()-]{3,80}:?$")


@dataclass
class Block:
    heading: str | None
    text: str
    page: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def segment(pages: list[str]) -> list[Block]:
    """Split pages into blocks at numbered clauses, upper-case headings and blank lines."""
    blocks: list[Block] = []
    for page_no, page in enumerate(pages, start=1):
        heading: str | None = None
        buf: list[str] = []

        def flush() -> None:
            text = " ".join(buf).strip()
            if text:
                blocks.append(Block(heading, text, page_no))

        for raw in page.split("\n"):
            line = raw.strip()
            if not line:
                if buf:
                    flush()
                    heading, buf = None, []
                continue
            if NUMBERED_START.match(line):
                flush()
                m = NUMBERED_TITLE.match(line)
                if m and len(m.group(2)) <= 50:
                    heading, buf = f"{m.group(1)} {m.group(2)}", [m.group(3)]
                else:
                    heading, buf = None, [line]
                continue
            if CAPS_HEADING.match(line) and len(line) <= 80:
                flush()
                heading, buf = line.rstrip(":"), []
                continue
            buf.append(line)
        flush()
    return blocks


def heading_title(heading: str | None) -> str:
    name = re.sub(r"^\s*(?:(?:section|article|clause)\s+)?(?:\d{1,2}(?:\.\d{1,2})*|[IVX]{1,5})[.)]?\s*", "", heading or "", flags=re.I).strip()
    return name.title() if name.isupper() else name


def category_scores(block: Block) -> dict[str, tuple[int, bool]]:
    """Score each category; returns {category: (score, matched_in_heading)}."""
    heading = heading_title(block.heading).lower()
    body = block.text.lower()
    scores: dict[str, tuple[int, bool]] = {}
    for category, patterns in CATEGORY_KEYWORDS.items():
        head_hits = sum(len(re.findall(pat, heading)) for pat in patterns)
        body_hits = sum(len(re.findall(pat, body)) for pat in patterns)
        score = 4 * head_hits + body_hits
        if category in WEAK_CATEGORIES and not head_hits:
            score //= WEAK_CATEGORIES[category]
        scores[category] = (score, head_hits > 0)
    return scores


def classify(block: Block) -> tuple[str, int]:
    scores = category_scores(block)
    heading_cats = [c for c, (_, in_head) in scores.items() if in_head]
    if heading_cats:  # an explicit heading is the strongest signal
        best = max(heading_cats, key=lambda c: scores[c][0])
        return best, scores[best][0]
    best = max(scores, key=lambda c: scores[c][0])  # dict order breaks ties
    score = scores[best][0]
    if block.heading and score < 2:
        return "Other Important Clauses", 1
    return (best, score) if score > 0 else ("Other Important Clauses", 0)


def plain_english(text: str) -> str:
    out = text
    for pattern, replacement in PLAIN_ENGLISH:
        out = re.sub(pattern, replacement, out, flags=re.I)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out[:1].upper() + out[1:] if out else out


def _sentences_with(text: str, pattern: str) -> list[str]:
    return [s for s in split_sentences(text) if re.search(pattern, s, re.I)]


def _join_lines(page: str) -> str:
    """Unwrap single line breaks but keep paragraph breaks, so sentences never span paragraphs."""
    return re.sub(r"[ \t]*(?<!\n)\n(?!\n)[ \t]*", " ", page)


@lru_cache(maxsize=32)
def _sentence_spans(text: str) -> tuple[tuple[int, int], ...]:
    spans, pos = [], 0
    for sentence in split_sentences(text):
        idx = text.find(sentence, pos)
        if idx == -1:
            continue
        spans.append((idx, idx + len(sentence)))
        pos = idx + len(sentence)
    return tuple(spans)


def _sentence_around(text: str, start: int) -> str:
    """The sentence containing `start`, using the abbreviation-aware splitter (so "Rs. 500" stays intact)."""
    for left, right in _sentence_spans(text):
        if left <= start < right:
            return text[left:right].strip()
    return text[max(0, start - 150) : start + 150].strip()


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------


def detect_document_type(text: str) -> str:
    low = text.lower()
    scores = {name: sum(len(re.findall(p, low)) for p in pats) for name, pats in DOC_TYPES}
    name, score = max(scores.items(), key=lambda kv: kv[1])
    return name if score >= 3 else "General Legal Document"


def detect_title(pages: list[str], filename: str) -> str:
    lines = [ln.strip() for ln in (pages[0] if pages else "").split("\n")[:25]]
    keyword = re.compile(r"agreement|contract|lease|policy|notice|terms|deed|memorandum", re.I)
    candidates = [ln for ln in lines if 6 <= len(ln) <= 90 and ln[0].isalnum() and keyword.search(ln)]
    # Prefer an upper-case title line, then any short line naming the document type.
    for line in [c for c in candidates if c.isupper()] + candidates:
        return line.title() if line.isupper() else line
    return re.sub(r"[_-]+", " ", filename.rsplit(".", 1)[0]).strip().title() or "Untitled document"


def extract_parties(text: str) -> list[Party]:
    parties: list[Party] = []
    alias_re = re.compile(
        r"\((?:hereinafter\s+)?(?:(?:jointly|collectively)\s+)?(?:referred\s+to\s+as\s+|called\s+)?(?:the\s+)?[\"“']([A-Z][\w ]{1,40}?)[\"”']",
        re.I,
    )
    for m in alias_re.finditer(text):
        alias = m.group(1).strip()
        if alias.lower() in {"agreement", "premises", "property", "parties", "services", "effective date"}:
            continue
        before = text[max(0, m.start() - 260) : m.start()]
        before = re.split(r"\bbetween\b|\band\b\s*\n?|\n\n|:\s", before, flags=re.I)[-1]
        name = re.split(r",|\bresiding\b|\bhaving\b|\baged\b|\bson of\b|\bdaughter of\b|\bS/o\b|\bD/o\b", before, flags=re.I)[0]
        name = re.sub(r"^\W+|\W+$", "", name).strip()
        if not name or len(name) > 80:
            name = alias
        if any(p.role == alias for p in parties):
            continue
        party_type = "company" if re.search(r"\b(ltd|limited|llp|inc|corp|pvt|company|llc)\b", name, re.I) else "individual"
        parties.append(Party(name=name, role=alias, party_type=party_type))

    if not parties:
        counts = Counter()
        for role in ROLE_WORDS:
            counts[role] = len(re.findall(rf"\b(?:the\s+)?{role}\b", text))
        for role, count in counts.most_common(4):
            if count >= 2:
                parties.append(Party(name=f"The {role}", role=role, party_type=None))

    for party in parties:
        role = re.escape(party.role or party.name)
        right_re = rf"\b{role}\s+(?:may|shall be entitled|is entitled|shall have the right|has the right|reserves the right)"
        oblig_re = rf"\b{role}\s+(?:shall|must|agrees? to|will|undertakes? to|is required to|is responsible for)\b"
        rights = [truncate(s, 320) for s in _sentences_with(text, right_re)]
        obligations = [truncate(s, 320) for s in _sentences_with(text, oblig_re) if not re.search(right_re, s, re.I)]
        party.rights = rights[:8]
        party.payment_obligations = [o for o in obligations if re.search(r"\bpa(y|id)\b|payment|rent|fee|deposit|reimburse", o, re.I)][:6]
        party.obligations = [o for o in obligations if o not in party.payment_obligations][:8]
        party.other_commitments = [
            truncate(s, 320) for s in _sentences_with(text, rf"\b{role}\s+shall not\b")
        ][:5]
        party.obligations = [o for o in party.obligations if o not in party.other_commitments]
    return parties


def _responsible(sentence: str, parties: list[Party]) -> str | None:
    for p in parties:
        role = p.role or p.name
        if re.search(rf"\b{re.escape(role)}\s+(shall|must|agrees? to|will)\s+(pay|remit|deposit|reimburse)", sentence, re.I):
            return role
    return None


def extract_financial_terms(pages: list[str], parties: list[Party]) -> list[FinancialTerm]:
    terms: list[FinancialTerm] = []
    for page_no, page in enumerate(pages, start=1):
        flat = _join_lines(page)
        for m in AMOUNT_PATTERN.finditer(flat):
            sentence = _sentence_around(flat, m.start())
            low = sentence.lower()
            if "deposit" in low:
                term_type = "Security Deposit"
            elif re.search(r"\blate\b|penalt|delay|interest at|\bfine\b", low):
                term_type = "Late Payment Penalty"
            elif re.search(r"repair|maintenance|damage", low):
                term_type = "Repair / Maintenance Cost"
            elif re.search(r"rent|salary|fee|price|compensation|consideration|remuneration", low):
                term_type = "Payment Amount"
            else:
                term_type = "Other"
            freq_m = re.search(r"per month|monthly|per annum|annually|per year|yearly|quarterly|weekly|one[- ]time|per day|daily", low)
            due_m = re.search(r"(on or before [^,.;]{3,60}|within \w+ \(?\d*\)?\s*days[^,.;]{0,40}|in advance)", sentence, re.I)
            amount = m.group(0).strip()
            currency = "INR" if re.search(r"₹|rs|inr|rupee", amount, re.I) else "USD" if re.search(r"\$|usd|dollar", amount, re.I) \
                else "EUR" if re.search(r"€|eur", amount, re.I) else "GBP" if re.search(r"£|gbp|pound", amount, re.I) else None
            terms.append(FinancialTerm(
                term_type=term_type,
                description=truncate(plain_english(sentence), 240),
                amount=amount,
                currency=currency,
                frequency=freq_m.group(0) if freq_m else None,
                due=due_m.group(0) if due_m else None,
                responsible_party=_responsible(sentence, parties),
                original_text=truncate(sentence, 500),
                page_number=page_no,
            ))
        for m in PERCENT_PATTERN.finditer(flat):
            sentence = _sentence_around(flat, m.start())
            if re.search(r"interest|late|penalt|delay", sentence, re.I):
                terms.append(FinancialTerm(
                    term_type="Late Payment Penalty",
                    description=truncate(plain_english(sentence), 240),
                    amount=m.group(0).strip(),
                    original_text=truncate(sentence, 500),
                    responsible_party=_responsible(sentence, parties),
                    page_number=page_no,
                ))
    seen, unique = set(), []
    for t in terms:
        key = (t.amount, t.original_text[:80])
        if key not in seen:
            seen.add(key)
            unique.append(t)
    return unique[:30]


_DATE_TYPE_RULES = [
    (r"commenc|effective|start|begin|with effect from", "Contract Start"),
    (r"expir|end(s|ing)? on|until|till", "Contract End"),
    (r"renew", "Renewal"),
    (r"\bnotice\b", "Notice Period"),
    (r"lock-in|terminat|vacat", "Termination Deadline"),
    (r"refund", "Refund Deadline"),
    (r"period of|term of|remain in force|duration", "Contract Duration"),
    (r"due|payable|\bpay\b|on or before", "Payment Due"),
    (r"executed|made (and executed )?(at|on)|dated", "Agreement Date"),
]


def _date_type(window: str, sentence: str) -> str:
    """Classify a date by the words just before it, falling back to its whole sentence."""
    for text in (window.lower(), sentence.lower()):
        for pattern, label in _DATE_TYPE_RULES:
            if re.search(pattern, text):
                return label
    return "Other"


def extract_dates(pages: list[str], parties: list[Party]) -> list[ImportantDate]:
    dates: list[ImportantDate] = []
    for page_no, page in enumerate(pages, start=1):
        flat = _join_lines(page)
        found = []
        for pat in DATE_PATTERNS:
            found += [(m.start(), m.group(0)) for m in re.finditer(pat, flat, re.I)]
        for m in PERIOD_PATTERN.finditer(flat):
            sentence = _sentence_around(flat, m.start())
            if re.search(r"\b(aged|age of)\s*$", flat[max(0, m.start() - 12) : m.start()], re.I) or re.match(r"\s*old\b", flat[m.end() :]):
                continue  # a person's age, not a contractual period
            if re.search(r"notice|terminat|renew|within|period|term of|lock-in|probation|due|days? of", sentence, re.I):
                found.append((m.start(), m.group(0)))
        for start, value in found:
            sentence = _sentence_around(flat, start)
            window = flat[max(0, start - 45) : start]
            dates.append(ImportantDate(
                date_type=_date_type(window, sentence),
                label=truncate(plain_english(sentence), 200),
                value=value.strip(),
                is_explicit=True,
                responsible_party=next((p.role for p in parties if p.role and re.search(rf"\b{re.escape(p.role)}\s+(shall|must)", sentence)), None),
                original_text=truncate(sentence, 500),
                page_number=page_no,
            ))
    seen, unique = set(), []
    for d in dates:
        key = (d.value.lower(), d.original_text[:60])
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique[:30]


def detect_risks(blocks: list[Block], clauses: list[Clause], full_text: str) -> list[Risk]:
    risks: list[Risk] = []
    for rule in RISK_RULES:
        hits = 0
        for block in blocks:
            for sentence in split_sentences(block.text):
                if re.search(rule["pattern"], sentence, re.I):
                    risks.append(Risk(
                        title=rule["title"],
                        category=rule["category"],
                        risk_level=rule["level"],
                        original_text=truncate(sentence, 500),
                        explanation=rule["explanation"],
                        potential_impact=rule["impact"],
                        suggested_questions=rule["questions"],
                        page_number=block.page,
                        is_uncertain=True,
                    ))
                    hits += 1
                    break
            if hits >= rule.get("max", 3):
                break

    for m in PERCENT_PATTERN.finditer(full_text):
        sentence = _sentence_around(full_text, m.start())
        rate = float(re.match(r"[\d.]+", m.group(0)).group(0))
        monthly = re.search(r"per month|monthly", m.group(0) + sentence, re.I)
        if re.search(r"interest|late|penalt", sentence, re.I) and ((monthly and rate >= 2) or rate >= 18):
            risks.append(Risk(
                title="High late-payment interest or penalty rate",
                category="Excessive Penalty", risk_level="High",
                original_text=truncate(sentence, 500),
                explanation=f"The document specifies a rate of {m.group(0).strip()} for late or penalty amounts, which is high compared with typical commercial rates.",
                potential_impact="Small delays in payment could become expensive quickly.",
                suggested_questions=["Can the rate be reduced or capped?", "Is there a grace period before interest applies?"],
                is_uncertain=True,
            ))
            break

    present = {c.category for c in clauses}
    if "Dispute Resolution" not in present:
        risks.append(Risk(
            title="No dispute resolution clause identified", category="Dispute Resolution", risk_level="Medium",
            original_text="", explanation="The system did not find a clause describing how disagreements will be resolved (e.g. negotiation, mediation, arbitration or courts).",
            potential_impact="If a disagreement arises, the process and forum may be unclear and more costly to resolve.",
            suggested_questions=["How will disputes be resolved under this document?", "Which courts or arbitration body would have jurisdiction?"],
            is_uncertain=True,
        ))
    if "Termination Clause" not in present:
        risks.append(Risk(
            title="No termination clause identified", category="Unclear Obligations", risk_level="Medium",
            original_text="", explanation="The system did not find a clause explaining how the agreement can be ended.",
            potential_impact="It may be unclear how either party can exit the arrangement.",
            suggested_questions=["How can each party end this agreement?", "What notice is required to terminate?"],
            is_uncertain=True,
        ))
    return sort_risks(risks)[:20]


def extract_legal_terms(full_text: str) -> list[LegalTerm]:
    terms = []
    for term, meaning in GLOSSARY.items():
        m = re.search(rf"\b{re.escape(term)}\b", full_text, re.I)
        if m:
            terms.append(LegalTerm(term=term.title(), explanation=meaning, original_text=truncate(_sentence_around(full_text, m.start()), 240)))
    return terms[:20]


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class DemoAnalysisEngine:
    def __init__(self, progress=None):
        self.progress = progress or (lambda stage, pct: None)

    def analyze(self, pages: list[str], location_unit: str, filename: str) -> tuple[AnalysisResult, dict]:
        unit = "page" if location_unit == "page" else "section"
        full_text = "\n\n".join(pages)
        flat_text = re.sub(r"\s*\n\s*", " ", full_text)

        self.progress("Segmenting document into sections (demo engine)", 15)
        blocks = segment(pages)

        self.progress("Classifying clauses (demo engine)", 35)
        clauses: list[Clause] = []
        for block in blocks:
            if len(block.text) < 40 or block.text.startswith("***"):
                continue
            category, score = classify(block)
            if score == 0:
                continue
            categories = [category]
            # A heading such as "Governing Law and Disputes" covers two categories.
            categories += [
                c for c, (_, in_head) in category_scores(block).items()
                if in_head and c != category and c not in WEAK_CATEGORIES
            ][:1]
            name = heading_title(block.heading)
            if not name and category == "Parties Involved" and clauses and clauses[-1].category == category:
                # Merge consecutive unheaded preamble paragraphs into one "Parties" clause.
                clauses[-1].original_text = truncate(clauses[-1].original_text + " " + block.text, 1500)
                continue
            for cat in categories:
                importance = "High" if cat in HIGH_IMPORTANCE else "Low" if cat in LOW_IMPORTANCE else "Medium"
                clauses.append(Clause(
                    name=name or cat,
                    category=cat,
                    original_text=truncate(block.text, 1500),
                    simplified_explanation=f"{CATEGORY_LEADS[cat]} In simpler words: {truncate(plain_english(block.text), 700)}",
                    importance=importance,
                    page_number=block.page,
                    is_uncertain=True,
                ))
        for clause in clauses:
            if clause.category == "Parties Involved" and clause.name == clause.category:
                clause.simplified_explanation = (
                    f"{CATEGORY_LEADS['Parties Involved']} In simpler words: {truncate(plain_english(clause.original_text), 700)}"
                )

        self.progress("Extracting parties, payments and dates (demo engine)", 55)
        parties = extract_parties(flat_text)
        financial = extract_financial_terms(pages, parties)
        dates = extract_dates(pages, parties)

        self.progress("Checking risk patterns (demo engine)", 75)
        risks = detect_risks(blocks, clauses, flat_text)
        legal_terms = extract_legal_terms(flat_text)

        simplifications = []
        for block in sorted(blocks, key=lambda b: -len(b.text)):
            for sentence in split_sentences(block.text):
                simple = plain_english(sentence)
                if 80 <= len(sentence) <= 450 and simple != sentence and len(simplifications) < 8:
                    simplifications.append(Simplification(original_text=sentence, simplified_text=simple, page_number=block.page))

        self.progress("Composing summary (demo engine)", 90)
        doc_type = detect_document_type(flat_text)
        title = detect_title(pages, filename)
        result = AnalysisResult(
            document_title=title,
            document_type=doc_type,
            executive_summary=self._summary(doc_type, parties, clauses, financial, dates, risks),
            key_points=self._key_points(clauses, financial, dates),
            main_takeaways=self._takeaways(risks, clauses),
            parties=parties,
            clauses=clauses,
            risks=risks,
            financial_terms=financial,
            important_dates=dates,
            legal_terms=legal_terms,
            simplifications=simplifications,
            recommendations=[
                "Read every High-importance clause in full before signing.",
                "Ask the other party to clarify any clause flagged as a potential risk.",
                "Confirm all amounts, due dates and notice periods in writing.",
                "Configure an LLM provider for a more accurate AI analysis - this result was produced by the rule-based demo engine.",
                "For significant commitments, consult a qualified legal professional.",
            ],
            limitations=[
                "DEMO MODE: this analysis was produced by a rule-based engine (keyword and pattern matching), not by an AI language model.",
                "Clause classification and plain-English rewrites are approximate; read the original text for exact meaning.",
                "Dates and amounts are extracted only where they appear verbatim; no deadlines were calculated.",
            ],
        )
        info = {
            "chunks_total": 1,
            "pages_total": len(pages),
            "pages_analyzed": len(pages),
            "chars_total": len(full_text),
            "chars_analyzed": len(full_text),
            "coverage_percent": 100,
            "truncated": False,
            "llm_calls": 0,
            "location_unit": unit,
        }
        return result, info

    @staticmethod
    def _summary(doc_type, parties, clauses, financial, dates, risks) -> str:
        party_text = (
            " and ".join(f"{p.name} ({p.role})" if p.role and p.role != p.name else p.name for p in parties[:3])
            if parties else "parties that could not be identified automatically"
        )
        cats = sorted({c.category for c in clauses if c.category not in ("Other Important Clauses", "Obligations")})
        parts = [
            f"This document appears to be a {doc_type.lower()} between {party_text}.",
            f"The demo engine identified {len(clauses)} clause sections" + (f", covering {', '.join(cats[:6]).lower()}." if cats else "."),
        ]
        payments = [f for f in financial if f.term_type == "Payment Amount"]
        if payments:
            p = payments[0]
            parts.append(f"A key payment term is {p.amount}{' ' + p.frequency if p.frequency else ''}.")
        start = next((d for d in dates if d.date_type == "Contract Start"), None)
        if start:
            parts.append(f"The document refers to a start date of {start.value}.")
        high = [r for r in risks if r.risk_level == "High"]
        parts.append(
            f"{len(risks)} potential risk indicator(s) were flagged, {len(high)} of them rated High."
            if risks else "No significant potential risks were identified by the demo engine."
        )
        return " ".join(parts)

    @staticmethod
    def _key_points(clauses, financial, dates) -> list[str]:
        points = []
        for f in financial[:4]:
            points.append(f"{f.term_type}: {f.amount}" + (f" ({f.frequency})" if f.frequency else ""))
        for d in dates[:4]:
            points.append(f"{d.date_type}: {d.value}")
        for c in [c for c in clauses if c.importance == "High"][:4]:
            points.append(f"{c.category}: {c.name}")
        return points

    @staticmethod
    def _takeaways(risks, clauses) -> list[str]:
        takeaways = [f"Review '{r.title}' ({r.risk_level} risk)." for r in risks[:5]]
        if not takeaways:
            takeaways.append("No risk patterns were matched, but this does not mean the document is free of risk.")
        if any(c.category == "Termination Clause" for c in clauses):
            takeaways.append("Check the termination conditions and notice periods carefully.")
        return takeaways
