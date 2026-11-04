import { AlertTriangle, ArrowRight, BookOpen, Calendar, CheckCircle2, CircleSlash, FileSearch, Lightbulb, ListChecks, Scale, ShieldAlert, Users, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Badge, LEVEL_STYLES, LevelBadge, VerificationBadge, cx } from "../../components/Badges";
import { ClauseCard } from "../../components/ClauseCard";
import { RiskCard } from "../../components/RiskCard";
import { RiskMeter } from "../../components/RiskMeter";
import { Select, type SelectOption } from "../../components/Select";
import type { SourceTarget } from "../../components/SourceDrawer";
import { EmptyState } from "../../components/States";
import type { Analysis, Level, Party } from "../../types/api";
import { locationLabel } from "../../utils/format";

export interface TabProps {
  analysis: Analysis;
  unit: "page" | "section";
  showSource: (t: SourceTarget) => void;
  goTo: (tab: string) => void;
}

const LEVELS: Level[] = ["High", "Medium", "Low"];

function riskCounts(a: Analysis) {
  return LEVELS.reduce((acc, l) => ({ ...acc, [l]: a.risks.filter((r) => r.risk_level === l).length }), {} as Record<Level, number>);
}

function Section({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-navy-900">
          {icon && <span className="text-navy-500">{icon}</span>}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-navy-400" />
          {t}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

export function OverviewTab({ analysis: a, unit, showSource, goTo }: TabProps) {
  const counts = riskCounts(a);
  const identified = a.clause_coverage.filter((c) => c.status === "identified").length;
  const metrics = [
    { label: "Clauses identified", value: a.clauses.length, icon: <ListChecks className="size-4" />, tab: "clauses" },
    { label: "Potential risks", value: a.risks.length, icon: <ShieldAlert className="size-4" />, tab: "risks" },
    { label: "Parties", value: a.parties.length, icon: <Users className="size-4" />, tab: "parties" },
    { label: "Payments & dates", value: a.financial_terms.length + a.important_dates.length, icon: <Calendar className="size-4" />, tab: "payments" },
  ];
  const topRisks = a.risks.filter((r) => r.risk_level === "High").slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((m) => (
          <button key={m.label} type="button" onClick={() => goTo(m.tab)} className="card p-4 text-left transition-shadow hover:shadow-lift">
            <span className="flex items-center gap-2 text-sm text-slate-500">{m.icon}{m.label}</span>
            <span className="mt-1 block text-2xl font-semibold text-navy-950 tabular-nums">{m.value}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Summary" icon={<BookOpen className="size-4" />} action={<TabLink onClick={() => goTo("summary")}>Details</TabLink>}>
            <p className="font-serif text-[16px] leading-7 text-slate-800">{a.executive_summary}</p>
          </Section>
        </div>
        <Section title="Risk overview" icon={<ShieldAlert className="size-4" />} action={<TabLink onClick={() => goTo("risks")}>All</TabLink>}>
          <RiskMeter counts={counts} />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Section title="Most important findings" icon={<AlertTriangle className="size-4" />}>
            {topRisks.length === 0 ? (
              <p className="text-sm text-slate-600">No high-level potential risks were identified by the system. This does not guarantee that the document is free of risk.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topRisks.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{r.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{r.explanation}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <LevelBadge level={r.risk_level} />
                      {r.original_text && (
                        <button type="button" className="btn-ghost p-1.5" onClick={() => showSource({ quote: r.original_text, page: r.page_number, title: r.title })} aria-label={`View source for ${r.title}`}>
                          <FileSearch className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Clause coverage" icon={<Scale className="size-4" />} action={<TabLink onClick={() => goTo("clauses")}>Clauses</TabLink>}>
            <p className="mb-3 text-xs text-slate-500">{identified} of {a.clause_coverage.length} standard categories identified</p>
            <CoverageList analysis={a} unit={unit} compact />
          </Section>
        </div>
        <div className="lg:col-span-2">
        <Section title="Key dates" icon={<Calendar className="size-4" />} action={<TabLink onClick={() => goTo("payments")}>All</TabLink>}>
          {a.important_dates.length === 0 ? (
            <p className="text-sm text-slate-500">No dates or deadlines were identified.</p>
          ) : (
            <ul className="space-y-2.5">
              {a.important_dates.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-500">{d.date_type}</span>
                  <span className="text-right font-medium text-slate-800">{d.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        </div>
      </div>
    </div>
  );
}

function CoverageList({ analysis, compact }: { analysis: Analysis; unit: string; compact?: boolean }) {
  return (
    <ul className={cx("grid gap-1.5", !compact && "sm:grid-cols-2 lg:grid-cols-3")}>
      {analysis.clause_coverage.map((c) => (
        <li key={c.category} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-slate-50">
          <span className="flex min-w-0 items-center gap-2">
            {c.status === "identified" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <CircleSlash className="size-4 shrink-0 text-slate-400" />}
            <span className={cx("truncate", c.status === "identified" ? "text-slate-800" : "text-slate-500")}>{c.category}</span>
          </span>
          <span className="shrink-0 text-xs text-slate-500">{c.status === "identified" ? `${c.count} found` : "Not identified in the document"}</span>
        </li>
      ))}
    </ul>
  );
}

function TabLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline">
      {children} <ArrowRight className="size-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------

export function SummaryTab({ analysis: a, unit, showSource }: TabProps) {
  return (
    <div className="space-y-6">
      <Section title="Executive summary" icon={<BookOpen className="size-4" />}>
        <p className="font-serif text-[17px] leading-8 text-slate-800">{a.executive_summary}</p>
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Key points"><Bullets items={a.key_points} empty="No key points were generated." /></Section>
        <Section title="Main takeaways before signing" icon={<Lightbulb className="size-4" />}>
          <Bullets items={a.main_takeaways} empty="No takeaways were generated." />
        </Section>
      </div>
      <Section title="Important legal terms, explained">
        {a.legal_terms.length === 0 ? (
          <p className="text-sm text-slate-500">No specialised legal terms were identified.</p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {a.legal_terms.map((t) => (
              <div key={t.term} className="rounded-xl border border-slate-200 p-4">
                <dt className="font-serif font-semibold text-navy-900">{t.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600">{t.explanation}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>
      <Section title="Complex sentences in plain English">
        {a.simplifications.length === 0 ? (
          <p className="text-sm text-slate-500">No sentence rewrites were produced.</p>
        ) : (
          <ul className="space-y-4">
            {a.simplifications.map((s, i) => (
              <li key={i} className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="eyebrow">Original · {locationLabel(unit, s.page_number)}</p>
                    <button type="button" className="text-xs font-medium text-accent-700 hover:underline" onClick={() => showSource({ quote: s.original_text, page: s.page_number, title: "Original sentence" })}>
                      Source
                    </button>
                  </div>
                  <p className="font-serif text-[14.5px] leading-relaxed text-slate-700">{s.original_text}</p>
                </div>
                <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
                  <p className="eyebrow mb-1.5 text-teal-800">Simplified</p>
                  <p className="text-[14.5px] leading-relaxed text-slate-800">{s.simplified_text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ClausesTab({ analysis: a, unit, showSource }: TabProps) {
  const [category, setCategory] = useState("all");
  const [importance, setImportance] = useState<"all" | Level>("all");
  const categoryOptions = useMemo<SelectOption[]>(() => {
    const counts = new Map<string, number>();
    a.clauses.forEach((c) => counts.set(c.category, (counts.get(c.category) ?? 0) + 1));
    return [
      { value: "all", label: "All categories", meta: a.clauses.length },
      ...[...counts].map(([value, count]) => ({ value, label: value, meta: count })),
    ];
  }, [a.clauses]);
  const importanceOptions: SelectOption<"all" | Level>[] = [
    { value: "all", label: "Any importance", icon: <span className="size-2 rounded-full bg-slate-300" /> },
    ...LEVELS.map((l) => ({ value: l, label: l, icon: <span className={cx("size-2 rounded-full", LEVEL_STYLES[l].bar)} /> })),
  ];
  const shown = a.clauses.filter((c) => (category === "all" || c.category === category) && (importance === "all" || c.importance === importance));

  return (
    <div className="space-y-6">
      <Section title="Clause categories" icon={<Scale className="size-4" />}>
        <CoverageList analysis={a} unit={unit} />
        <p className="mt-3 text-xs text-slate-500">
          "Not identified in the document" means the system did not find such a clause. It does not mean the document is legally deficient.
        </p>
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600"><b className="text-slate-900">{shown.length}</b> of {a.clauses.length} clauses</p>
        <div className="flex gap-2">
          <Select className="min-w-0 flex-1 sm:w-60 sm:flex-none" ariaLabel="Filter clauses by category" value={category} onChange={setCategory} options={categoryOptions} />
          <Select className="min-w-0 flex-1 sm:w-44 sm:flex-none" ariaLabel="Filter clauses by importance" value={importance} onChange={setImportance} options={importanceOptions} />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card"><EmptyState title="No clauses match these filters" /></div>
      ) : (
        <div className="space-y-4">
          {shown.map((c) => (
            <ClauseCard key={c.id} clause={c} unit={unit} onViewSource={() => showSource({ quote: c.original_text, page: c.page_number, title: c.name })} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PartyList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div>
      <p className={cx("eyebrow mb-2", tone)}>{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">None identified</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t, i) => <li key={i} className="text-sm leading-relaxed text-slate-700">{t}</li>)}
        </ul>
      )}
    </div>
  );
}

export function PartiesTab({ analysis: a }: TabProps) {
  if (!a.parties.length) {
    return <div className="card"><EmptyState icon={<Users className="size-7" />} title="No parties identified" description="The system could not identify the parties to this document." /></div>;
  }
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Parties named in the document. The person who uploaded the document is not assumed to be a party. Each party's commitments are listed separately.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {a.parties.map((p: Party) => (
          <article key={p.name} className="card overflow-hidden">
            <header className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
              <div className="grid size-10 place-items-center rounded-full bg-navy-900 font-semibold text-white">{p.name.replace(/^(Mr|Ms|Mrs|Dr)\.?\s+/i, "")[0]}</div>
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-navy-900">{p.name}</h3>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {p.role && <Badge className="bg-navy-50 text-navy-700 ring-navy-100">{p.role}</Badge>}
                  {p.party_type && <Badge>{p.party_type}</Badge>}
                </div>
              </div>
            </header>
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <PartyList title="Obligations" items={p.obligations} tone="text-navy-700" />
              <PartyList title="Rights" items={p.rights} tone="text-emerald-700" />
              <PartyList title="Payment obligations" items={p.payment_obligations} tone="text-accent-700" />
              <PartyList title="Other commitments & restrictions" items={p.other_commitments} tone="text-amber-800" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RisksTab({ analysis: a, unit, showSource }: TabProps) {
  const [level, setLevel] = useState<"all" | Level>("all");
  const counts = riskCounts(a);
  const shown = a.risks.filter((r) => level === "all" || r.risk_level === level);

  if (!a.risks.length) {
    return (
      <div className="card">
        <EmptyState
          icon={<ShieldAlert className="size-7" />}
          title="No significant potential risks were identified by the system"
          description="This does not mean the document is guaranteed to be safe or favourable. Review it carefully and consult a legal professional for important decisions."
        />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter risks by level">
        {(["all", ...LEVELS] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLevel(l)}
            className={cx("rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors", level === l ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}
            aria-pressed={level === l}
          >
            {l === "all" ? `All (${a.risks.length})` : `${l} (${counts[l]})`}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">Risk levels reflect the wording and context of each clause. They are not legal probabilities and do not decide whether a clause is valid or enforceable.</p>
      <div className="space-y-4">
        {shown.map((r) => (
          <RiskCard key={r.id} risk={r} unit={unit} onViewSource={() => showSource({ quote: r.original_text, page: r.page_number, title: r.title })} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SourceButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-navy-800" aria-label={label} title="View in document">
      <FileSearch className="size-4" />
    </button>
  );
}

export function PaymentsTab({ analysis: a, unit, showSource }: TabProps) {
  return (
    <div className="space-y-6">
      <Section title="Payment terms & financial obligations" icon={<Wallet className="size-4" />}>
        {a.financial_terms.length === 0 ? (
          <p className="text-sm text-slate-500">No payment amounts, fees or penalties were identified.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-y border-slate-100 bg-slate-50/70 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-2.5 font-semibold sm:px-6">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Value</th>
                  <th className="px-3 py-2.5 font-semibold">Frequency / due</th>
                  <th className="px-3 py-2.5 font-semibold">Responsible</th>
                  <th className="px-3 py-2.5 font-semibold">Description</th>
                  <th className="px-5 py-2.5 font-semibold sm:px-6">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {a.financial_terms.map((f) => (
                  <tr key={f.id}>
                    <td className="px-5 py-3 font-medium text-slate-800 sm:px-6">{f.term_type}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-semibold text-navy-900">{f.amount ?? "—"}</span>
                      {f.currency && <span className="ml-1 text-xs text-slate-500">{f.currency}</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{[f.frequency, f.due].filter(Boolean).join(" · ") || "Not stated"}</td>
                    <td className="px-3 py-3 text-slate-600">{f.responsible_party ?? "Not identified"}</td>
                    <td className="max-w-sm px-3 py-3 text-slate-600">{f.description}</td>
                    <td className="px-5 py-3 sm:px-6">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-xs text-slate-500">{locationLabel(unit, f.page_number)}</span>
                        {f.original_text && <SourceButton label={`View source of ${f.term_type}`} onClick={() => showSource({ quote: f.original_text, page: f.page_number, title: f.term_type })} />}
                      </div>
                      {f.verification === "unverified" && <VerificationBadge value="unverified" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Important dates, durations & deadlines" icon={<Calendar className="size-4" />}>
        {a.important_dates.length === 0 ? (
          <p className="text-sm text-slate-500">No dates, notice periods or deadlines were identified.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-y border-slate-100 bg-slate-50/70 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-2.5 font-semibold sm:px-6">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Value</th>
                  <th className="px-3 py-2.5 font-semibold">Basis</th>
                  <th className="px-3 py-2.5 font-semibold">Context</th>
                  <th className="px-5 py-2.5 font-semibold sm:px-6">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {a.important_dates.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-3 font-medium text-slate-800 sm:px-6">{d.date_type}</td>
                    <td className="px-3 py-3 font-semibold whitespace-nowrap text-navy-900">{d.value}</td>
                    <td className="px-3 py-3">
                      {d.is_explicit ? (
                        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Stated in document</Badge>
                      ) : (
                        <Badge className="bg-orange-50 text-orange-700 ring-orange-200">Inferred / unconfirmed</Badge>
                      )}
                      {d.calculation_note && <p className="mt-1 max-w-[16rem] text-xs text-slate-500">{d.calculation_note}</p>}
                    </td>
                    <td className="max-w-md px-3 py-3 text-slate-600">
                      {d.label}
                      {d.responsible_party && <span className="mt-1 block text-xs text-slate-500">Responsible: {d.responsible_party}</span>}
                    </td>
                    <td className="px-5 py-3 sm:px-6">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-xs text-slate-500">{locationLabel(unit, d.page_number)}</span>
                        {d.original_text && <SourceButton label={`View source of ${d.value}`} onClick={() => showSource({ quote: d.original_text, page: d.page_number, title: `${d.date_type}: ${d.value}` })} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">No deadline is calculated unless the document gives enough information; any calculated value is marked "Inferred".</p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RecommendationsTab({ analysis: a }: TabProps) {
  const info = a.processing_info;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Section title="Recommendations & next steps" icon={<Lightbulb className="size-4" />}>
          <ol className="space-y-3">
            {a.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy-50 text-xs font-semibold text-navy-700">{i + 1}</span>
                {r}
              </li>
            ))}
            {a.recommendations.length === 0 && <p className="text-sm text-slate-500">No recommendations were generated.</p>}
          </ol>
        </Section>
        <Section title="Limitations of this analysis" icon={<AlertTriangle className="size-4" />}>
          <Bullets items={a.limitations} empty="No specific limitations were reported." />
        </Section>
      </div>
      <div className="space-y-6">
        <Section title="Processing details">
          <dl className="space-y-2.5 text-sm">
            {[
              ["Engine", a.mode === "live" ? "AI language model" : "Rule-based demo engine"],
              ["Provider", a.provider ?? "—"],
              ["Model", a.model_name ?? "—"],
              ["Text analysed", info.coverage_percent != null ? `${info.coverage_percent}%` : "—"],
              ["Pages / sections", info.pages_total != null ? `${info.pages_analyzed} of ${info.pages_total}` : "—"],
              ["Chunks processed", info.chunks_total ?? "—"],
              ["LLM calls", info.llm_calls ?? "—"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
          <p className="font-semibold">Not legal advice</p>
          <p className="mt-1">
            This is a preliminary, automated analysis to help you understand the document. It may contain errors or omissions and does not determine
            whether any clause is legally valid or enforceable. Consult a qualified legal professional before relying on it.
          </p>
        </div>
      </div>
    </div>
  );
}
