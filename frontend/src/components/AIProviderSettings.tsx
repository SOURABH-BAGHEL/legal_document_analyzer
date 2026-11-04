import { CheckCircle2, ClipboardPaste, Cpu, Eye, EyeOff, FlaskConical, KeyRound, Loader2, PlugZap, RotateCcw, Save, Sparkles, TriangleAlert, Waypoints, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAppSettings } from "../hooks/useAppSettings";
import { useAsync } from "../hooks/useAsync";
import { systemService } from "../services/analysisService";
import { errorMessage } from "../services/api";
import type { AIProviderId, AISettings, AISettingsInput, ConnectionTestResult } from "../types/api";
import { parseProviderCode } from "../utils/parseProviderCode";
import { cx } from "./Badges";
import { ConfirmDialog } from "./ConfirmDialog";
import { Select } from "./Select";
import { Alert, ErrorState, LoadingState } from "./States";

const RESULT_TONE = { ok: "success", warning: "warning", failed: "error" } as const;
const RESULT_TITLE = { ok: "Connection works", warning: "Connected, with a problem", failed: "Connection failed" };
const RESULT_ICON = {
  ok: <CheckCircle2 className="size-4" />,
  warning: <TriangleAlert className="size-4" />,
  failed: <XCircle className="size-4" />,
};

const PROVIDER_DETAILS: Record<AIProviderId, { description: string; icon: ReactNode }> = {
  anthropic: { description: "Claude models", icon: <Sparkles className="size-4 text-accent-600" /> },
  nvidia: { description: "Models hosted on build.nvidia.com", icon: <Cpu className="size-4 text-emerald-600" /> },
  openai: { description: "OpenAI or any compatible server", icon: <Waypoints className="size-4 text-navy-600" /> },
  demo: { description: "Works offline, no key needed", icon: <FlaskConical className="size-4 text-violet-600" /> },
};

function keyStatus(option: AISettings["providers"][number]): string {
  if (!option.has_key) return "No key saved yet.";
  const where = option.key_source === "saved" ? "A key is saved" : "A key is set in backend/.env";
  return `${where}${option.key_hint ? ` (${option.key_hint})` : ""}. Leave this blank to keep it.`;
}

export function AIProviderSettings() {
  const { reload: reloadAppSettings } = useAppSettings();
  const { data, error, loading, reload, setData } = useAsync(() => systemService.aiSettings(), []);

  const [provider, setProvider] = useState<AIProviderId>("demo");
  const [model, setModel] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [entryMode, setEntryMode] = useState<"details" | "code">("details");
  const [code, setCode] = useState("");

  const select = (settings: AISettings, id: AIProviderId) => {
    const option = settings.providers.find((p) => p.id === id);
    setProvider(id);
    setModel(option?.model ?? "");
    setApiUrl(option?.api_url ?? "");
    setApiKey("");
    setShowKey(false);
    setResult(null);
  };

  useEffect(() => {
    if (data) select(data, data.active_provider);
    // Only re-sync the form when fresh data arrives, not while the user is editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading && !data) return <section className="card"><LoadingState label="Loading AI provider settings…" /></section>;
  if (error || !data) {
    return (
      <section className="card">
        <ErrorState
          title="AI provider settings are unavailable"
          message={`${error ?? "No data."} If the backend was already running, restart it to load this feature.`}
          onRetry={reload}
        />
      </section>
    );
  }

  const option = data.providers.find((p) => p.id === provider);
  const isDemo = provider === "demo";
  const busy = testing || saving;
  const input: AISettingsInput = {
    provider,
    model,
    api_url: option?.url_editable ? apiUrl : null,
    api_key: apiKey,
  };

  // Any edit makes an earlier test result stale.
  const edit = (setter: (value: string) => void) => (e: { target: { value: string } }) => {
    setter(e.target.value);
    setResult(null);
    setNotice(null);
  };

  const readCode = () => {
    const parsed = parseProviderCode(code);
    if (!parsed.model && !parsed.apiKey) {
      setNotice({ tone: "error", text: "No model or API key was found in that code. Check that you pasted the whole sample, or use Enter details." });
      return;
    }
    const id = parsed.provider ?? provider;
    const target = data.providers.find((p) => p.id === id);
    select(data, id);
    if (parsed.model) setModel(parsed.model);
    if (parsed.apiUrl && target?.url_editable) setApiUrl(parsed.apiUrl);
    if (parsed.apiKey) setApiKey(parsed.apiKey);
    setCode(""); // the pasted text may contain a key, so don't keep it around
    setEntryMode("details");

    const found = `${target?.label ?? "Provider"}${parsed.model ? `, model ${parsed.model}` : ""}`;
    if (parsed.apiKey) {
      setNotice({ tone: "success", text: `Found ${found} and an API key ending in ${parsed.apiKey.slice(-4)}. Click Test connection, then Save.` });
    } else if (target?.has_key) {
      setNotice({ tone: "warning", text: `Found ${found}, but no real API key in the code. Your saved key will be used unless you enter a new one.` });
    } else {
      const reason = parsed.keyIsPlaceholder ? "The code only has a placeholder where the key goes." : "The code has no API key.";
      setNotice({ tone: "warning", text: `Found ${found}. ${reason} Enter your API key below.` });
    }
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    setNotice(null);
    try {
      setResult(await systemService.testAiSettings(input));
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      setData(await systemService.saveAiSettings(input));
      await reloadAppSettings();
      setNotice({ tone: "success", text: `Saved. New analyses will use ${option?.label}.` });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setNotice(null);
    try {
      setData(await systemService.resetAiSettings());
      await reloadAppSettings();
      setNotice({ tone: "success", text: "Saved provider settings and keys were removed. The app now uses backend/.env." });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
      setConfirmReset(false);
    }
  };

  return (
    <section className="card p-6">
      <h3 className="flex items-center gap-2 font-semibold text-navy-900">
        <PlugZap className="size-4 text-navy-500" /> Choose your AI provider
      </h3>
      <p className="mt-1 text-sm text-slate-500">Saved changes apply to new analyses straight away, with no restart.</p>

      <div className="mt-4 inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="How to enter provider details">
        {(["details", "code"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={entryMode === m}
            disabled={busy}
            onClick={() => { setEntryMode(m); setNotice(null); }}
            className={cx("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", entryMode === m ? "bg-white text-navy-900 shadow-card" : "text-slate-600 hover:text-navy-900")}
          >
            {m === "details" ? "Enter details" : "Paste code"}
          </button>
        ))}
      </div>

      {entryMode === "code" ? (
        <div className="mt-4">
          <label htmlFor="ai-provider-code" className="mb-1.5 block text-sm font-medium text-slate-700">Sample code from your provider</label>
          <textarea
            id="ai-provider-code"
            aria-describedby="ai-provider-code-help"
            className="input min-h-52 resize-y font-mono text-[13px]"
            value={code}
            onChange={(e) => { setCode(e.target.value); setNotice(null); }}
            spellCheck={false}
            autoComplete="off"
            placeholder={'Paste the Python, curl or JavaScript sample here, such as the code from build.nvidia.com'}
          />
          <p id="ai-provider-code-help" className="mt-1 text-xs text-slate-500">
            The code is only read in this browser to find the provider, model and key. It is never run or uploaded, and it is cleared once read.
          </p>
          <button type="button" className="btn-primary mt-4" onClick={readCode} disabled={!code.trim()}>
            <ClipboardPaste className="size-4" /> Read code
          </button>
          {notice && <div className="mt-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
        </div>
      ) : (
      <>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="ai-provider" className="mb-1.5 block text-sm font-medium text-slate-700">Provider</label>
          <Select
            id="ai-provider"
            value={provider}
            disabled={busy}
            onChange={(id) => { select(data, id); setNotice(null); }}
            options={data.providers.map((p) => ({
              value: p.id,
              label: p.label,
              ...PROVIDER_DETAILS[p.id],
              meta: p.has_key ? "Key saved" : undefined,
            }))}
          />
        </div>

        {!isDemo && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Model</span>
            <input className="input font-mono text-[13px]" value={model} onChange={edit(setModel)} disabled={busy} spellCheck={false} placeholder="e.g. mistralai/mistral-large-4-1t-a52b" />
          </label>
        )}

        {option?.url_editable && (
          <div className="md:col-span-2">
            <label htmlFor="ai-api-url" className="mb-1.5 block text-sm font-medium text-slate-700">API URL</label>
            <input id="ai-api-url" aria-describedby="ai-api-url-help" className="input font-mono text-[13px]" value={apiUrl} onChange={edit(setApiUrl)} disabled={busy} spellCheck={false} />
            <p id="ai-api-url-help" className="mt-1 text-xs text-slate-500">Use a localhost URL, such as Ollama's, to keep document text on this machine.</p>
          </div>
        )}

        {!isDemo && option && (
          <div className="md:col-span-2">
            <label htmlFor="ai-api-key" className="mb-1.5 block text-sm font-medium text-slate-700">API key</label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input
                id="ai-api-key"
                aria-describedby="ai-api-key-help"
                className="input pr-11 pl-9 font-mono text-[13px]"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={edit(setApiKey)}
                disabled={busy}
                autoComplete="new-password"
                spellCheck={false}
                placeholder={option.has_key ? "Enter a new key to replace it" : "Paste your API key"}
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p id="ai-api-key-help" className="mt-1 text-xs text-slate-500">
              {keyStatus(option)} Keys stay on the server, unencrypted in the local database, and are never sent back to the browser.
            </p>
          </div>
        )}
      </div>

      {isDemo && (
        <p className="mt-4 text-sm text-slate-600">Demo mode uses the built-in rule-based engine. No key is needed and nothing leaves this machine.</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={test} disabled={busy || (!isDemo && !model.trim())}>
          {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy || (!isDemo && !model.trim())}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
        </button>
        {data.customized && (
          <button type="button" className="btn-ghost sm:ml-auto" onClick={() => setConfirmReset(true)} disabled={busy}>
            <RotateCcw className="size-4" /> Reset to backend/.env
          </button>
        )}
      </div>
      {!isDemo && !testing && !result && (
        <p className="mt-2 text-xs text-slate-500">The test sends one short message and no document text. It does not save anything.</p>
      )}

      <div aria-live="polite">
        {testing && <p className="mt-3 text-sm text-slate-500">Contacting the provider. This can take up to 45 seconds…</p>}
        {result && (
          <div className="mt-4">
            <Alert tone={RESULT_TONE[result.status]} icon={RESULT_ICON[result.status]} title={RESULT_TITLE[result.status]}>
              <p>{result.message}</p>
              {result.latency_ms != null && <p className="mt-1 text-xs tabular-nums">{result.model} replied in {(result.latency_ms / 1000).toFixed(1)} s</p>}
              {result.status === "ok" && !isDemo && <p className="mt-1 text-xs">Not saved yet. Click Save to use these settings.</p>}
            </Alert>
          </div>
        )}
        {notice && <div className="mt-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      </div>
      </>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reset AI provider settings?"
        description="All providers, models and API keys saved here will be permanently removed. The app will go back to the values in backend/.env."
        confirmLabel="Reset"
        busy={saving}
        onCancel={() => setConfirmReset(false)}
        onConfirm={reset}
      />
    </section>
  );
}
