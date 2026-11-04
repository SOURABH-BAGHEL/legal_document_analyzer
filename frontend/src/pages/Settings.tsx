import { Cpu, HardDrive, Lock, RefreshCw, Server } from "lucide-react";
import type { ReactNode } from "react";
import { AIProviderSettings } from "../components/AIProviderSettings";
import { ModeBadge } from "../components/Badges";
import { Alert, ErrorState, LoadingState } from "../components/States";
import { useAppSettings } from "../hooks/useAppSettings";
import { useAsync } from "../hooks/useAsync";
import { systemService } from "../services/analysisService";

const ENV_VARS = [
  ["LLM_PROVIDER", "auto | anthropic | nvidia | openai | demo", "auto uses the first key found: Anthropic, NVIDIA, OpenAI; otherwise demo mode"],
  ["NVIDIA_API_KEY", "your NVIDIA key", "Enables models hosted on build.nvidia.com"],
  ["NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b", "NVIDIA model ID"],
  ["ANTHROPIC_API_KEY", "your Anthropic key", "Enables Claude models"],
  ["ANTHROPIC_MODEL", "claude-sonnet-5-5", "Model used for analysis"],
  ["OPENAI_API_KEY", "your key", "Any OpenAI-compatible API"],
  ["OPENAI_API_URL", "https://api.openai.com/v1", "Point to a local server (e.g. Ollama) to keep text on-device"],
  ["OPENAI_MODEL", "gpt-4o-mini", "Model name at that endpoint"],
  ["MAX_UPLOAD_SIZE_MB", "20", "Upload size limit"],
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export default function Settings() {
  const { settings, error, loading, reload } = useAppSettings();
  const health = useAsync(() => systemService.health(), []);

  // Only on first load: a later reload must not unmount the provider form and lose its state.
  if (loading && !settings) return <LoadingState label="Loading settings…" />;
  if (error || !settings) return <div className="card"><ErrorState message={error ?? "Settings unavailable."} onRetry={reload} /></div>;
  const ai = settings.ai;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-navy-900">Settings</h2>
          <p className="text-sm text-slate-500">Choose how documents are analysed and review the system configuration.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => { void reload(); void health.reload(); }}>
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

      <AIProviderSettings />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h3 className="flex items-center gap-2 font-semibold text-navy-900"><Cpu className="size-4 text-navy-500" /> Active AI configuration</h3>
          <dl className="mt-2 divide-y divide-slate-100">
            <Row label="Mode"><ModeBadge mode={ai.mode} /></Row>
            <Row label="Provider">{ai.provider_name ?? ai.provider}</Row>
            <Row label="Model">{ai.model ?? "—"}</Row>
            <Row label="Sends text to a third party">{ai.external_processing ? "Yes — consent requested before each analysis" : "No"}</Row>
          </dl>
          <div className="mt-4">
            <Alert tone={ai.mode === "live" ? "info" : ai.mode === "demo" ? "demo" : "error"}>{ai.message}</Alert>
          </div>
        </section>

        <section className="card p-6">
          <h3 className="flex items-center gap-2 font-semibold text-navy-900"><Server className="size-4 text-navy-500" /> System</h3>
          <dl className="mt-2 divide-y divide-slate-100">
            <Row label="Backend status">{health.loading ? "Checking…" : health.error ? <span className="text-rose-600">Unreachable</span> : <span className="text-emerald-700">{health.data?.status} · database {health.data?.database}</span>}</Row>
            <Row label="Version">{settings.version}</Row>
            <Row label="Deployment">{settings.deployment}</Row>
            <Row label="Accepted formats">{settings.allowed_file_types.map((t) => t.toUpperCase()).join(", ")}</Row>
            <Row label="Maximum upload size">{settings.max_upload_size_mb} MB</Row>
            <Row label="Analysis capacity">{settings.max_chunks} chunks × {settings.chunk_size_chars.toLocaleString()} characters</Row>
            <Row label="OCR for scanned PDFs">{settings.ocr_enabled ? "Enabled" : "Not available (future work)"}</Row>
          </dl>
        </section>
      </div>

      <section className="card p-6">
        <h3 className="font-semibold text-navy-900">Configuring with backend/.env</h3>
        <p className="mt-1 text-sm text-slate-500">Optional. These values apply after a backend restart, and anything saved in the section above takes priority over them.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs tracking-wide text-slate-500 uppercase">
              <tr><th className="py-2 pr-4 font-semibold">Variable</th><th className="py-2 pr-4 font-semibold">Example</th><th className="py-2 font-semibold">Purpose</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ENV_VARS.map(([k, v, d]) => (
                <tr key={k}>
                  <td className="py-2.5 pr-4 font-mono text-xs text-navy-800">{k}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">{v}</td>
                  <td className="py-2.5 text-slate-600">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-6">
        <h3 className="flex items-center gap-2 font-semibold text-navy-900"><Lock className="size-4 text-navy-500" /> Privacy & data handling</h3>
        <ul className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <li className="flex gap-2"><HardDrive className="mt-0.5 size-4 shrink-0 text-slate-400" />Uploaded files are stored in <code className="text-xs">backend/storage/uploads</code> under random names and are never served as public static files.</li>
          <li className="flex gap-2"><HardDrive className="mt-0.5 size-4 shrink-0 text-slate-400" />Extracted text and results are stored in a local SQLite database. Deleting a document removes the file, text and all analyses.</li>
          <li className="flex gap-2"><Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />Document contents are not written to the logs. Uploaded documents are not used to train models by this application.</li>
          <li className="flex gap-2"><Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />This MVP assumes a single local user without authentication; the backend is structured so user accounts can be added later.</li>
        </ul>
      </section>
    </div>
  );
}
