import { AlertCircle, ArrowLeft, FileSearch, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FileTypeBadge, ModeBadge, StatusBadge, cx } from "../components/Badges";
import { SourceDrawer, type SourceTarget } from "../components/SourceDrawer";
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/States";
import { useAppSettings } from "../hooks/useAppSettings";
import { analysisService } from "../services/analysisService";
import { errorMessage, toApiError } from "../services/api";
import { documentService } from "../services/documentService";
import type { Analysis, DocumentContent, DocumentInfo } from "../types/api";
import { formatBytes, formatDate } from "../utils/format";
import { ClausesTab, OverviewTab, PartiesTab, PaymentsTab, RecommendationsTab, RisksTab, SummaryTab, type TabProps } from "./results/tabs";

const TABS = [
  { id: "overview", label: "Overview", Component: OverviewTab },
  { id: "summary", label: "Summary", Component: SummaryTab },
  { id: "clauses", label: "Clauses", Component: ClausesTab },
  { id: "parties", label: "Parties & Obligations", Component: PartiesTab },
  { id: "risks", label: "Risks", Component: RisksTab },
  { id: "payments", label: "Payments & Dates", Component: PaymentsTab },
  { id: "recommendations", label: "Recommendations", Component: RecommendationsTab },
];

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "none"; doc: DocumentInfo }
  | { kind: "analysis"; analysis: Analysis };

export default function AnalysisResults() {
  const { documentId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const runId = params.get("run") ?? undefined;
  const tab = TABS.find((t) => t.id === params.get("tab")) ?? TABS[0];

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [source, setSource] = useState<SourceTarget | null>(null);
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const analysis = await analysisService.get(documentId, runId);
      setState({ kind: "analysis", analysis });
      if (analysis.status === "pending" || analysis.status === "processing") {
        pollRef.current = window.setTimeout(load, 1200);
      }
    } catch (err) {
      const e = toApiError(err);
      if (e.code === "ANALYSIS_NOT_FOUND") {
        try {
          setState({ kind: "none", doc: await documentService.get(documentId) });
        } catch (inner) {
          setState({ kind: "error", message: errorMessage(inner) });
        }
      } else {
        setState({ kind: "error", message: e.message });
      }
    }
  }, [documentId, runId]);

  useEffect(() => {
    setState({ kind: "loading" });
    void load();
    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [load]);

  const showSource = useCallback(
    (target: SourceTarget) => {
      setSource(target);
      if (!content) {
        documentService.content(documentId).then(setContent, (err) => setContentError(errorMessage(err)));
      }
    },
    [content, documentId],
  );

  const goTo = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  if (state.kind === "loading") return <LoadingState label="Loading analysis…" />;
  if (state.kind === "error") {
    return (
      <div className="card">
        <ErrorState title="Could not load this analysis" message={state.message} onRetry={() => { setState({ kind: "loading" }); void load(); }} />
      </div>
    );
  }
  if (state.kind === "none") return <StartAnalysis doc={state.doc} onStarted={() => { setState({ kind: "loading" }); void load(); }} />;

  const a = state.analysis;
  const doc = a.document;
  const unit = doc?.location_unit ?? "page";

  return (
    <div className="space-y-6">
      <Link to="/documents" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-800">
        <ArrowLeft className="size-4" /> My Documents
      </Link>

      <header className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{a.document_type ?? "Legal document"}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-navy-950">{a.document_title ?? doc?.original_filename}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-500">
              {doc && <FileTypeBadge type={doc.file_type} />}
              <span className="truncate">{doc?.original_filename}</span>
              {doc && <span>· {formatBytes(doc.file_size)}</span>}
              {doc && <span>· Uploaded {formatDate(doc.upload_timestamp, true)}</span>}
              {a.completed_at && <span>· Analysed {formatDate(a.completed_at, true)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} />
            {a.status === "completed" && <ModeBadge mode={a.mode} />}
            {doc && (a.status === "completed" || a.status === "failed") && (
              <RerunButton docId={doc.id} onStarted={() => { setParams(new URLSearchParams(), { replace: true }); setState({ kind: "loading" }); void load(); }} />
            )}
          </div>
        </div>
      </header>

      {a.status === "pending" || a.status === "processing" ? (
        <section className="card p-8 text-center" aria-live="polite">
          <Loader2 className="mx-auto size-8 animate-spin text-accent-600" />
          <h3 className="mt-4 font-semibold text-navy-900">{a.progress_stage ?? "Analysing document"}</h3>
          <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-accent-600 transition-[width] duration-500" style={{ width: `${a.progress_percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-500 tabular-nums">{a.progress_percent}% · results appear automatically when ready</p>
        </section>
      ) : a.status === "failed" ? (
        <div className="card">
          <ErrorState
            title="The analysis failed"
            message={`${a.error_message ?? "An unknown error occurred."} No results are shown because the analysis did not complete successfully.`}
          />
        </div>
      ) : (
        <>
          {a.mode === "demo" && (
            <Alert tone="demo" icon={<Sparkles className="size-4" />} title="Demo mode result — not an AI analysis">
              These results were produced by the rule-based demo engine (keyword and pattern matching) because no LLM provider is configured. They are
              useful for demonstrating the workflow but are less accurate than an AI analysis.
            </Alert>
          )}
          {doc && doc.extraction_warnings.length > 0 && <Alert tone="warning" title="Extraction notice">{doc.extraction_warnings.join(" ")}</Alert>}
          {a.processing_info.truncated && (
            <Alert tone="warning" icon={<AlertCircle className="size-4" />} title="Only part of this document was analysed">
              {a.limitations.find((l) => l.includes("too long")) ?? "The document exceeded the analysis limit."}
            </Alert>
          )}

          <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Analysis sections">
            <div role="tablist" className="flex min-w-max gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab.id === t.id}
                  onClick={() => goTo(t.id)}
                  className={cx(
                    "rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    tab.id === t.id ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {t.label}
                  {t.id === "risks" && a.risks.length > 0 && <span className="ml-1.5 tabular-nums opacity-70">{a.risks.length}</span>}
                  {t.id === "clauses" && <span className="ml-1.5 tabular-nums opacity-70">{a.clauses.length}</span>}
                </button>
              ))}
            </div>
          </nav>

          <div role="tabpanel">
            <tab.Component {...({ analysis: a, unit, showSource, goTo } satisfies TabProps)} />
          </div>

          <p className="flex items-start gap-2 text-xs text-slate-500">
            <FileSearch className="mt-0.5 size-3.5 shrink-0" />
            Quotes marked "Quote verified" were matched word-for-word against the extracted document text. Use "View in document" to read any finding in context.
          </p>
        </>
      )}

      <SourceDrawer target={source} content={content} error={contentError} onClose={() => setSource(null)} />
    </div>
  );
}

function useConsent() {
  const { settings } = useAppSettings();
  return { external: settings?.ai.external_processing ?? false, providerName: settings?.ai.provider_name ?? "the AI provider" };
}

function RerunButton({ docId, onStarted }: { docId: string; onStarted: () => void }) {
  const { external, providerName } = useConsent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (external && !window.confirm(`Re-running sends the document text to ${providerName}. Continue?`)) return;
    setBusy(true);
    setError(null);
    try {
      await analysisService.start(docId, external);
      onStarted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn-secondary px-3 py-1.5" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Re-analyze
      </button>
      {error && <p className="w-full text-right text-xs text-rose-600">{error}</p>}
    </>
  );
}

function StartAnalysis({ doc, onStarted }: { doc: DocumentInfo; onStarted: () => void }) {
  const { external, providerName } = useConsent();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await analysisService.start(doc.id, consent);
      onStarted();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <EmptyState
        title={`"${doc.original_filename}" has not been analysed yet`}
        description={`${doc.page_count} ${doc.location_unit}(s) of text were extracted (${doc.char_count.toLocaleString()} characters). Start the analysis to see the results.`}
        action={
          <div className="flex flex-col items-center gap-3">
            {external && (
              <label className="flex max-w-md gap-2 text-left text-xs text-slate-600">
                <input type="checkbox" className="mt-0.5 accent-navy-900" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                I consent to the document text being sent to {providerName} for analysis.
              </label>
            )}
            <button type="button" className="btn-primary" onClick={start} disabled={busy || (external && !consent)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />} Start analysis
            </button>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        }
      />
    </div>
  );
}
