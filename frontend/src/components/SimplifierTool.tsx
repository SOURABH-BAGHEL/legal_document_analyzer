import { ArrowRight, Languages, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAppSettings } from "../hooks/useAppSettings";
import { analysisService } from "../services/analysisService";
import { errorMessage } from "../services/api";
import type { SimplifyResult } from "../types/api";
import { ModeBadge } from "./Badges";
import { Alert } from "./States";

const EXAMPLE = "The lessee shall remit the monthly consideration on or before the fifth day of each calendar month.";

/** Module 9: translate a pasted legal passage into everyday English. */
export function SimplifierTool() {
  const { settings } = useAppSettings();
  const external = settings?.ai.external_processing ?? false;
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimplifyResult | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await analysisService.simplify(text, consent));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
          <Languages className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold text-navy-900">Plain-language explainer</h2>
          <p className="text-sm text-slate-500">Paste a single clause or passage to see it rewritten in everyday English.</p>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Legal text to simplify</span>
        <textarea
          className="input min-h-28 resize-y"
          maxLength={6000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`e.g. "${EXAMPLE}"`}
        />
      </label>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <button type="button" className="text-accent-700 hover:underline" onClick={() => setText(EXAMPLE)}>
          Use example
        </button>
        <span className="tabular-nums">{text.length}/6000</span>
      </div>

      {external && (
        <label className="mt-3 flex gap-2 text-xs text-slate-600">
          <input type="checkbox" className="accent-navy-900" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I consent to this text being sent to {settings?.ai.provider_name}.
        </label>
      )}

      <button type="button" className="btn-secondary mt-4" disabled={!text.trim() || busy || (external && !consent)} onClick={submit}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Simplify
      </button>

      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="eyebrow mb-2">Original</p>
              <p className="font-serif text-[15px] leading-relaxed text-slate-700">{result.original_text}</p>
            </div>
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="eyebrow text-teal-800">Plain English</p>
                <ModeBadge mode={result.mode} />
              </div>
              <p className="text-[15px] leading-relaxed text-slate-800">{result.simplified_text}</p>
            </div>
          </div>
          {result.key_terms.length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2">
              {result.key_terms.map((t) => (
                <div key={t.term} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <dt className="font-semibold text-navy-900">{t.term}</dt>
                  <dd className="mt-0.5 text-slate-600">{t.explanation}</dd>
                </div>
              ))}
            </dl>
          )}
          {result.notes.map((n) => (
            <p key={n} className="text-xs text-slate-500">{n}</p>
          ))}
        </div>
      )}
    </section>
  );
}
