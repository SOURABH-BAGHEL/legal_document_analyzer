import { AlertCircle, Check, FileSearch, Loader2, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cx, ModeBadge } from "../components/Badges";
import { DocumentUploader } from "../components/DocumentUploader";
import { SimplifierTool } from "../components/SimplifierTool";
import { Alert } from "../components/States";
import { useAppSettings } from "../hooks/useAppSettings";
import { analysisService } from "../services/analysisService";
import { errorMessage } from "../services/api";
import { documentService } from "../services/documentService";
import type { DocumentInfo } from "../types/api";

type Phase = "idle" | "uploading" | "analyzing" | "done" | "error";

export default function UploadDocument() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const maxMb = settings?.max_upload_size_mb ?? 20;
  const external = settings?.ai.external_processing ?? false;

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [stage, setStage] = useState<string>("");
  const [analysisPct, setAnalysisPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<DocumentInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = phase === "uploading" || phase === "analyzing";
  const canSubmit = !!file && !busy && (!external || consent) && settings?.ai.mode !== "misconfigured";

  const run = async () => {
    if (!file) return;
    setError(null);
    setUploaded(null);
    setPhase("uploading");
    setUploadPct(0);
    let doc: DocumentInfo;
    try {
      doc = await documentService.upload(file, setUploadPct);
      setUploaded(doc);
    } catch (err) {
      setPhase("error");
      setError(errorMessage(err));
      return;
    }

    setPhase("analyzing");
    setStage("Starting analysis");
    setAnalysisPct(2);
    try {
      await analysisService.start(doc.id, consent);
      abortRef.current = new AbortController();
      const result = await analysisService.waitForCompletion(
        doc.id,
        (a) => {
          setStage(a.progress_stage ?? "Processing");
          setAnalysisPct(a.progress_percent);
        },
        { signal: abortRef.current.signal },
      );
      if (result.status === "failed") {
        setPhase("error");
        setError(result.error_message ?? "The analysis failed.");
        return;
      }
      setPhase("done");
      setAnalysisPct(100);
      navigate(`/analysis/${doc.id}`);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setPhase("error");
      setError(errorMessage(err));
    }
  };

  const steps = [
    { label: "Upload & validate", done: phase !== "uploading" && (phase !== "error" || !!uploaded), active: phase === "uploading" },
    { label: "Extract text", done: !!uploaded, active: false },
    { label: settings?.ai.mode === "live" ? "AI analysis" : "Demo analysis", done: phase === "done", active: phase === "analyzing" },
    { label: "Verify & save", done: phase === "done", active: phase === "analyzing" && analysisPct >= 95 },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold text-navy-900">Analyze a legal document</h2>
              <p className="mt-1 text-sm text-slate-500">Contracts, rental or employment agreements, NDAs, privacy policies, terms and legal notices.</p>
            </div>
            {settings && <ModeBadge mode={settings.ai.mode} />}
          </div>

          <DocumentUploader file={file} onSelect={setFile} onError={setFileError} maxMb={maxMb} disabled={busy} />
          {fileError && <p className="mt-3 flex items-center gap-1.5 text-sm text-rose-600" role="alert"><AlertCircle className="size-4" />{fileError}</p>}

          {settings?.ai.mode === "demo" && (
            <div className="mt-5">
              <Alert tone="demo" icon={<Sparkles className="size-4" />} title="Demo mode is active">
                No LLM API key is configured, so the document will be analysed by the rule-based demo engine. Results are clearly labelled and
                are less accurate than an AI analysis. Configure a provider in <code className="text-xs">backend/.env</code> (see Settings).
              </Alert>
            </div>
          )}
          {settings?.ai.mode === "misconfigured" && (
            <div className="mt-5">
              <Alert tone="error" title="AI provider misconfigured">{settings.ai.message}</Alert>
            </div>
          )}
          {external && (
            <label className="mt-5 flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-navy-900" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
              <span className="text-slate-700">
                I understand the extracted text will be sent to a third-party AI service (<b>{settings?.ai.provider_name}</b>, model{" "}
                <code className="text-xs">{settings?.ai.model}</code>) for analysis. Documents are not used for model training by this application.
              </span>
            </label>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary px-5" onClick={run} disabled={!canSubmit}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
              {busy ? "Analyzing…" : "Analyze Document"}
            </button>
            {external && !consent && file && <span className="text-xs text-slate-500">Please confirm the processing notice above.</span>}
          </div>

          {phase !== "idle" && (
            <div className="mt-6 rounded-2xl border border-slate-200 p-5" aria-live="polite">
              <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {steps.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-2 text-sm">
                    <span
                      className={cx(
                        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        s.done ? "bg-emerald-600 text-white" : s.active ? "bg-accent-600 text-white" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {s.done ? <Check className="size-3.5" /> : s.active ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
                    </span>
                    <span className={s.done || s.active ? "font-medium text-slate-800" : "text-slate-500"}>{s.label}</span>
                  </li>
                ))}
              </ol>

              {phase === "uploading" && <Progress label={`Uploading… ${uploadPct}%`} pct={uploadPct} />}
              {phase === "analyzing" && <Progress label={stage} pct={analysisPct} />}
              {phase === "done" && <p className="mt-4 text-sm font-medium text-emerald-700">Analysis complete. Opening results…</p>}
              {phase === "error" && error && (
                <div className="mt-4">
                  <Alert tone="error" icon={<AlertCircle className="size-4" />} title={uploaded ? "Analysis failed" : "Upload failed"}>
                    <p>{error}</p>
                    {uploaded && (
                      <p className="mt-2">
                        The document was uploaded successfully. You can retry from{" "}
                        <Link className="font-semibold underline" to={`/analysis/${uploaded.id}`}>its analysis page</Link>.
                      </p>
                    )}
                  </Alert>
                </div>
              )}
              {uploaded && uploaded.extraction_warnings.length > 0 && (
                <div className="mt-4">
                  <Alert tone="warning" title="Extraction notice">{uploaded.extraction_warnings.join(" ")}</Alert>
                </div>
              )}
            </div>
          )}
        </section>

        <SimplifierTool />
      </div>

      <aside className="space-y-6">
        <section className="card p-5">
          <h3 className="font-semibold text-navy-900">What you will get</h3>
          <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
            {[
              "Executive summary in simple English",
              "15 clause categories, each marked found or not identified",
              "Parties with their rights and obligations",
              "Payments, penalties, dates and notice periods",
              "Potential risks with questions to ask a lawyer",
              "Every quote verified against the document text",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {t}
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h3 className="flex items-center gap-2 font-semibold text-navy-900"><Lock className="size-4 text-navy-500" /> Privacy & handling</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>Files are stored under a random internal name outside any public folder and are never executed.</li>
            <li>{external ? "Text is sent to the configured AI provider only after you consent." : "No document text leaves this machine in the current configuration."}</li>
            <li>You can delete a document and all of its analyses at any time from My Documents.</li>
            <li>Scanned (image-only) PDFs are not supported yet — OCR is planned future work.</li>
          </ul>
        </section>
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <p>This tool provides a preliminary, automated analysis. It is not legal advice and does not replace a qualified legal professional.</p>
        </div>
      </aside>
    </div>
  );
}

function Progress({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex justify-between gap-3 text-sm">
        <span className="truncate text-slate-700">{label}</span>
        <span className="font-medium text-slate-900 tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-2 rounded-full bg-accent-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
