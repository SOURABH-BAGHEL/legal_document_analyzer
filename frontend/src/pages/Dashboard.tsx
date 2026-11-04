import { ArrowRight, ChevronRight, FileText, FileUp, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LEVEL_STYLES, ModeBadge, StatusBadge } from "../components/Badges";
import { RiskMeter } from "../components/RiskMeter";
import { StatCard } from "../components/StatCard";
import { EmptyState, ErrorState, Skeleton } from "../components/States";
import { useAppSettings } from "../hooks/useAppSettings";
import { useAsync } from "../hooks/useAsync";
import { dashboardService } from "../services/analysisService";
import type { DashboardStats, Level } from "../types/api";
import { pluralize, timeAgo } from "../utils/format";

const SERIES = { uploads: "#2f5fd0", analyses: "#0e9f8e" };
const AXIS = { stroke: "#cbd5e1", fontSize: 12, fill: "#64748b" };
const LEVELS: Level[] = ["High", "Medium", "Low"];

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function headline(data: DashboardStats | null): string {
  if (!data || data.total_documents === 0) {
    return "Upload a contract, agreement, policy or notice to get a plain-language summary, clause breakdown, key dates and potential risks, each linked back to the source text.";
  }
  const high = data.risk_distribution.High ?? 0;
  const analysed = pluralize(data.documents_analyzed, "analysed document");
  return high > 0
    ? `${pluralize(high, "high-level finding")} across ${analysed} ${high === 1 ? "is" : "are"} worth a closer look.`
    : `${analysed}, with no high-level findings so far.`;
}

export default function Dashboard() {
  const { data, error, loading, reload } = useAsync(() => dashboardService.stats(), []);
  const { settings } = useAppSettings();

  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;

  const hasDocuments = !!data && data.total_documents > 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-navy-950 text-white shadow-lift">
        <div className="ruled-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-col gap-5 px-6 pt-8 pb-7 sm:px-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-serif text-3xl font-semibold sm:text-4xl">{greeting()}</h2>
              {settings && <ModeBadge mode={settings.ai.mode} />}
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-navy-200">{headline(data)}</p>
          </div>
          <Link to="/analyze" className="btn shrink-0 self-start bg-white text-navy-900 hover:bg-accent-50 md:self-auto">
            <FileUp className="size-4" /> Analyze New Document
          </Link>
        </div>
        {loading && !data && (
          <div className="relative grid grid-cols-2 gap-px border-t border-white/10 lg:grid-cols-4" aria-busy="true" aria-label="Loading statistics">
            {[0, 1, 2, 3].map((i) => <div key={i} className="px-6 py-5 sm:px-8"><div className="h-20 animate-pulse rounded-lg bg-white/5" /></div>)}
          </div>
        )}
        {hasDocuments && <LedgerBand data={data} />}
      </section>

      {loading && !data ? (
        <div className="grid gap-6 lg:grid-cols-3" aria-hidden>
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : hasDocuments ? (
        <DashboardContent data={data} />
      ) : (
        <div className="card">
          <EmptyState
            icon={<Sparkles className="size-7" />}
            title="No documents analysed yet"
            description="Your statistics, recent analyses and activity charts will appear here once you upload your first document. A fictional sample agreement is included in the project's samples/ folder."
            action={<Link to="/analyze" className="btn-primary"><FileUp className="size-4" /> Upload your first document</Link>}
          />
        </div>
      )}
    </div>
  );
}

function LedgerBand({ data }: { data: DashboardStats }) {
  const total = LEVELS.reduce((sum, l) => sum + (data.risk_distribution[l] ?? 0), 0);
  return (
    <div className="relative grid grid-cols-2 border-t border-white/10 bg-white/[0.03] lg:grid-cols-4 [&>*]:border-white/10 [&>*:nth-child(odd)]:border-r lg:[&>*:not(:last-child)]:border-r [&>*:nth-child(-n+2)]:border-b lg:[&>*]:border-b-0">
      <StatCard label="Documents uploaded" value={data.total_documents} hint={pluralize(data.total_analyses, "analysis run")} />
      <StatCard label="Documents analysed" value={data.documents_analyzed} hint={data.failed_analyses ? pluralize(data.failed_analyses, "failed run") : "All runs succeeded"} />
      <StatCard label="Clauses identified" value={data.total_clauses} hint="Across latest analyses" />
      <StatCard
        label="Potential risk findings"
        value={data.total_risks}
        hint={
          <>
            <span className="mb-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
              {total > 0 && LEVELS.map((l) => data.risk_distribution[l] ? <span key={l} className={LEVEL_STYLES[l].bar} style={{ width: `${(data.risk_distribution[l] / total) * 100}%` }} /> : null)}
            </span>
            <span className="tabular-nums" title="High, Medium and Low findings">{LEVELS.map((l) => `${l[0]} ${data.risk_distribution[l] ?? 0}`).join(" · ")}</span>
          </>
        }
      />
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-menu">
      <p className="mb-1.5 font-semibold text-navy-900">{shortDate(String(label))}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center justify-between gap-6 py-0.5 text-slate-600">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
          <b className="font-semibold text-slate-900 tabular-nums">{p.value}</b>
        </p>
      ))}
    </div>
  );
}

function RiskPips({ counts }: { counts: Record<Level, number> }) {
  return (
    <span className="flex items-center gap-2.5 text-xs font-semibold tabular-nums">
      {LEVELS.map((l) => (
        <span key={l} className={counts[l] ? LEVEL_STYLES[l].text : "text-slate-300"} title={`${counts[l]} ${l} risk findings`}>
          {l[0]} {counts[l]}
          <span className="sr-only"> {l} risks</span>
        </span>
      ))}
    </span>
  );
}

function DashboardContent({ data }: { data: DashboardStats }) {
  const uploads = data.activity.reduce((sum, d) => sum + d.uploads, 0);
  const analyses = data.activity.reduce((sum, d) => sum + d.analyses, 0);
  const topCategory = data.clause_categories[0]?.count || 1;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-navy-900">Analysis activity</h3>
              <p className="text-xs text-slate-500">Per day (UTC), last 14 days</p>
            </div>
            <dl className="flex gap-6 text-sm">
              {[{ name: "Uploads", value: uploads, color: SERIES.uploads }, { name: "Analyses", value: analyses, color: SERIES.analyses }].map((s) => (
                <div key={s.name}>
                  <dt className="flex items-center gap-1.5 text-xs text-slate-500"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}</dt>
                  <dd className="text-xl font-semibold text-navy-950 tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="h-56" role="img" aria-label={`Bar chart of daily activity: ${uploads} uploads and ${analyses} analyses in the last 14 days`}>
            {/* Debounced so the chart redraws once after the sidebar animation, not on every frame. */}
            <ResponsiveContainer width="100%" height="100%" debounce={260}>
              <BarChart data={data.activity} barGap={2} margin={{ left: -24, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef0f4" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9", radius: 6 }} content={<ChartTooltip />} />
                <Bar dataKey="uploads" name="Uploads" fill={SERIES.uploads} radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="analyses" name="Analyses" fill={SERIES.analyses} radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 sm:px-6">
            <h3 className="font-serif text-lg font-semibold text-navy-900">Recent analyses</h3>
            <Link to="/history" className="inline-flex items-center gap-1 text-sm font-medium text-accent-700 hover:underline">
              View all <ArrowRight className="size-4" />
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {data.recent_analyses.map((a) => (
              <li key={a.id}>
                <Link to={`/analysis/${a.document_id}?run=${a.id}`} className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-navy-50/60 sm:px-6">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-600 transition-colors group-hover:bg-white">
                    <FileText className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{a.document_title || a.original_filename}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {a.document_type ?? "Type pending"} · {timeAgo(a.created_at)}{a.mode === "demo" && a.status === "completed" ? " · Demo engine" : ""}
                    </span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    {a.status === "completed" ? <RiskPips counts={a.risk_counts} /> : <StatusBadge status={a.status} />}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-navy-500 motion-reduce:transition-none" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="min-w-0 space-y-6">
        <section className="card p-5 sm:p-6">
          <h3 className="font-serif text-lg font-semibold text-navy-900">Risk overview</h3>
          <p className="mt-0.5 mb-5 text-xs text-slate-500">Findings by level, latest analyses</p>
          <RiskMeter counts={data.risk_distribution} />
          <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            Levels describe how concerning the wording may be. They are not legal probabilities or judgements of validity.
          </p>
        </section>

        <section className="card p-5 sm:p-6">
          <h3 className="font-serif text-lg font-semibold text-navy-900">Clause types</h3>
          <p className="mt-0.5 mb-4 text-xs text-slate-500">Most common across latest analyses</p>
          {data.clause_categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No clauses identified yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.clause_categories.map((c) => (
                <li key={c.category} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="truncate text-slate-700">{c.category}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">{c.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${(c.count / topCategory) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.document_types.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs text-slate-500">Document types</p>
              <ul className="flex flex-wrap gap-1.5">
                {data.document_types.map((d) => (
                  <li key={d.type} className="rounded-lg bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700">
                    {d.type} <span className="text-navy-500 tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
