import type { Analysis, DashboardStats, DocumentInfo, PublicSettings } from "../types/api";

export const settingsFixture: PublicSettings = {
  app_name: "AI-Powered Legal Document Analyzer",
  version: "1.0.0",
  max_upload_size_mb: 20,
  allowed_file_types: ["docx", "pdf", "txt"],
  chunk_size_chars: 18000,
  max_chunks: 15,
  ai: { mode: "demo", provider: "demo", provider_name: "Demo mode (rule-based, no AI)", model: null, external_processing: false, message: "Demo" },
  deployment: "single-user local deployment (no authentication)",
  ocr_enabled: false,
};

export const docFixture: DocumentInfo = {
  id: "doc-1",
  original_filename: "lease.pdf",
  file_type: "pdf",
  mime_type: "application/pdf",
  file_size: 10_523,
  upload_timestamp: "2026-11-03T10:00:00Z",
  extraction_status: "completed",
  analysis_status: "completed",
  page_count: 2,
  char_count: 5300,
  location_unit: "page",
  extraction_warnings: [],
};

export const analysisFixture: Analysis = {
  id: "an-1",
  document_id: "doc-1",
  status: "completed",
  progress_stage: "Completed",
  progress_percent: 100,
  error_code: null,
  error_message: null,
  mode: "live",
  provider: "anthropic",
  model_name: "claude-sonnet-5-5",
  created_at: "2026-11-03T10:00:00Z",
  completed_at: "2026-11-03T10:01:00Z",
  document_title: "Residential Rental Agreement",
  document_type: "Residential Rental Agreement",
  executive_summary: "An 11-month rental agreement between a landlord and a tenant.",
  key_points: ["Rent is Rs. 25,000 per month"],
  main_takeaways: ["Check the lock-in period"],
  parties: [
    { name: "Mr. Arjun Mehta", role: "Landlord", party_type: "individual", rights: ["Receive rent"], obligations: ["Structural repairs"], payment_obligations: [], other_commitments: [], page_number: 1 },
  ],
  clauses: [
    {
      id: "c1",
      name: "Rent",
      category: "Payment Terms",
      original_text: "The Tenant shall pay a monthly rent of Rs. 25,000.",
      simplified_explanation: "The tenant pays Rs. 25,000 every month.",
      importance: "High",
      page_number: 1,
      verification: "verified",
      is_uncertain: false,
    },
  ],
  clause_coverage: [
    { category: "Payment Terms", status: "identified", count: 1, message: "1 clause(s) identified." },
    { category: "Intellectual Property", status: "not_identified", count: 0, message: "Not identified in the document." },
  ],
  risks: [
    {
      id: "r1",
      title: "Termination without notice",
      category: "One-sided Termination",
      risk_level: "High",
      original_text: "The Landlord may terminate this Agreement without notice.",
      explanation: "The landlord can end the agreement suddenly.",
      potential_impact: "Tenant may lose housing quickly.",
      affected_party: "Tenant",
      suggested_questions: ["Can a notice period be added?"],
      page_number: 2,
      verification: "verified",
      is_uncertain: false,
    },
  ],
  financial_terms: [
    { id: "f1", term_type: "Payment Amount", description: "Monthly rent", amount: "Rs. 25,000", currency: "INR", frequency: "monthly", due: null, responsible_party: "Tenant", related_clause: null, original_text: "monthly rent of Rs. 25,000", page_number: 1, verification: "verified" },
  ],
  important_dates: [
    { id: "d1", date_type: "Contract Start", label: "Start", value: "1st January 2026", is_explicit: true, calculation_note: null, responsible_party: null, related_clause: null, original_text: "commence on 1st January 2026", page_number: 1, verification: "verified" },
  ],
  legal_terms: [{ term: "Indemnify", explanation: "Cover someone's losses." }],
  simplifications: [],
  recommendations: ["Ask for a notice period."],
  limitations: [],
  processing_info: { coverage_percent: 100, pages_total: 2, pages_analyzed: 2, chunks_total: 1, llm_calls: 3 },
  document: docFixture,
};

export const statsFixture: DashboardStats = {
  total_documents: 3,
  documents_analyzed: 2,
  total_analyses: 3,
  failed_analyses: 1,
  total_clauses: 31,
  total_risks: 12,
  risk_distribution: { High: 4, Medium: 5, Low: 3 },
  clause_categories: [{ category: "Payment Terms", count: 6 }],
  document_types: [{ type: "Rental", count: 2 }],
  activity: [{ date: "2026-11-03", uploads: 3, analyses: 2 }],
  recent_analyses: [
    { id: "an-1", document_id: "doc-1", original_filename: "lease.pdf", document_title: "Residential Rental Agreement", document_type: "Rental", status: "completed", mode: "live", risk_counts: { High: 1, Medium: 0, Low: 0 }, clause_count: 10, created_at: "2026-11-03T10:00:00Z" },
  ],
};
