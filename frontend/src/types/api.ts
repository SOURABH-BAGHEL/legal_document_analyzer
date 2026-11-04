export type Level = "Low" | "Medium" | "High";
export type Verification = "verified" | "approximate" | "unverified" | "not_applicable";
export type AnalysisStatus = "not_started" | "pending" | "processing" | "completed" | "failed";
export type FileType = "pdf" | "docx" | "txt";

export interface DocumentInfo {
  id: string;
  original_filename: string;
  file_type: FileType;
  mime_type: string | null;
  file_size: number;
  upload_timestamp: string;
  extraction_status: string;
  analysis_status: AnalysisStatus;
  page_count: number;
  char_count: number;
  location_unit: "page" | "section";
  extraction_warnings: string[];
}

export interface DocumentListItem extends DocumentInfo {
  latest_analysis_id: string | null;
  document_type: string | null;
  risk_count: number;
}

export interface DocumentList {
  items: DocumentListItem[];
  total: number;
}

export interface DocumentContent {
  document_id: string;
  location_unit: "page" | "section";
  pages: string[];
}

export interface Party {
  name: string;
  role: string | null;
  party_type: string | null;
  rights: string[];
  obligations: string[];
  payment_obligations: string[];
  other_commitments: string[];
  page_number: number | null;
}

export interface Clause {
  id: string;
  name: string;
  category: string;
  original_text: string;
  simplified_explanation: string;
  importance: Level;
  page_number: number | null;
  verification: Verification;
  is_uncertain: boolean;
}

export interface ClauseCoverage {
  category: string;
  status: "identified" | "not_identified";
  count: number;
  message: string;
}

export interface Risk {
  id: string;
  title: string;
  category: string;
  risk_level: Level;
  original_text: string;
  explanation: string;
  potential_impact: string;
  affected_party: string | null;
  suggested_questions: string[];
  page_number: number | null;
  verification: Verification;
  is_uncertain: boolean;
}

export interface FinancialTerm {
  id: string;
  term_type: string;
  description: string;
  amount: string | null;
  currency: string | null;
  frequency: string | null;
  due: string | null;
  responsible_party: string | null;
  related_clause: string | null;
  original_text: string;
  page_number: number | null;
  verification: Verification;
}

export interface ImportantDate {
  id: string;
  date_type: string;
  label: string;
  value: string;
  is_explicit: boolean;
  calculation_note: string | null;
  responsible_party: string | null;
  related_clause: string | null;
  original_text: string;
  page_number: number | null;
  verification: Verification;
}

export interface LegalTerm {
  term: string;
  explanation: string;
  original_text?: string;
}

export interface Simplification {
  original_text: string;
  simplified_text: string;
  page_number: number | null;
  verification: Verification;
}

export interface ProcessingInfo {
  chunks_total?: number;
  pages_total?: number;
  pages_analyzed?: number;
  chars_total?: number;
  chars_analyzed?: number;
  coverage_percent?: number;
  truncated?: boolean;
  llm_calls?: number;
}

export interface AnalysisStatusInfo {
  id: string;
  document_id: string;
  status: AnalysisStatus;
  progress_stage: string | null;
  progress_percent: number;
  error_code: string | null;
  error_message: string | null;
  mode: "live" | "demo";
  provider: string | null;
  model_name: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Analysis extends AnalysisStatusInfo {
  document_title: string | null;
  document_type: string | null;
  executive_summary: string | null;
  key_points: string[];
  main_takeaways: string[];
  parties: Party[];
  clauses: Clause[];
  clause_coverage: ClauseCoverage[];
  risks: Risk[];
  financial_terms: FinancialTerm[];
  important_dates: ImportantDate[];
  legal_terms: LegalTerm[];
  simplifications: Simplification[];
  recommendations: string[];
  limitations: string[];
  processing_info: ProcessingInfo;
  document: DocumentInfo | null;
}

export type RiskCounts = Record<Level, number>;

export interface HistoryItem {
  id: string;
  document_id: string;
  original_filename: string;
  file_type: FileType;
  document_title: string | null;
  document_type: string | null;
  status: AnalysisStatus;
  mode: "live" | "demo";
  provider: string | null;
  risk_counts: RiskCounts;
  clause_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DashboardStats {
  total_documents: number;
  documents_analyzed: number;
  total_analyses: number;
  failed_analyses: number;
  total_clauses: number;
  total_risks: number;
  risk_distribution: RiskCounts;
  clause_categories: { category: string; count: number }[];
  document_types: { type: string; count: number }[];
  activity: { date: string; uploads: number; analyses: number }[];
  recent_analyses: {
    id: string;
    document_id: string;
    original_filename: string;
    document_title: string | null;
    document_type: string | null;
    status: AnalysisStatus;
    mode: "live" | "demo";
    risk_counts: RiskCounts;
    clause_count: number;
    created_at: string;
  }[];
}

export interface AIStatus {
  mode: "live" | "demo" | "misconfigured";
  provider: string;
  provider_name: string | null;
  model: string | null;
  external_processing: boolean;
  message: string;
}

export interface PublicSettings {
  app_name: string;
  version: string;
  max_upload_size_mb: number;
  allowed_file_types: FileType[];
  chunk_size_chars: number;
  max_chunks: number;
  ai: AIStatus;
  deployment: string;
  ocr_enabled: boolean;
}

export type AIProviderId = "anthropic" | "nvidia" | "openai" | "demo";

export interface AIProviderOption {
  id: AIProviderId;
  label: string;
  model: string | null;
  api_url: string | null;
  url_editable: boolean;
  has_key: boolean;
  key_hint: string | null;
  key_source: "saved" | "env" | null;
}

export interface AISettings {
  active_provider: AIProviderId;
  customized: boolean;
  providers: AIProviderOption[];
}

export interface AISettingsInput {
  provider: AIProviderId;
  model: string;
  api_url: string | null;
  api_key: string;
}

export interface ConnectionTestResult {
  status: "ok" | "warning" | "failed";
  message: string;
  code: string | null;
  provider: AIProviderId;
  model: string | null;
  latency_ms: number | null;
}

export interface SimplifyResult {
  original_text: string;
  simplified_text: string;
  key_terms: LegalTerm[];
  notes: string[];
  mode: "live" | "demo";
  provider: string | null;
}
