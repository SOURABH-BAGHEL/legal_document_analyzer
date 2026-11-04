import { FileSearch, HelpCircle, Target } from "lucide-react";
import type { Risk } from "../types/api";
import { locationLabel } from "../utils/format";
import { Badge, LEVEL_STYLES, LevelBadge, VerificationBadge, cx } from "./Badges";

interface Props {
  risk: Risk;
  unit: "page" | "section";
  onViewSource: () => void;
}

export function RiskCard({ risk, unit, onViewSource }: Props) {
  return (
    <article className={cx("card overflow-hidden border-l-4", risk.risk_level === "High" ? "border-l-rose-600" : risk.risk_level === "Medium" ? "border-l-amber-500" : "border-l-sky-500")} id={risk.id}>
      <div className="p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-navy-900">{risk.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge>{risk.category}</Badge>
              {risk.affected_party && <Badge className="bg-navy-50 text-navy-700 ring-navy-100">Affects: {risk.affected_party}</Badge>}
              {risk.original_text && <span className="text-xs text-slate-500">{locationLabel(unit, risk.page_number)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <LevelBadge level={risk.risk_level} suffix=" risk" />
            <VerificationBadge value={risk.verification} />
          </div>
        </header>

        {risk.original_text ? (
          <blockquote className={cx("mt-4 rounded-xl border p-4 font-serif text-[14.5px] leading-relaxed text-slate-700", LEVEL_STYLES[risk.risk_level].soft)}>
            “{risk.original_text}”
          </blockquote>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">
            This finding is about something the system did not find in the document, so there is no quote.
          </p>
        )}

        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <dt className="eyebrow mb-1">Why it may be concerning</dt>
            <dd className="text-sm leading-relaxed text-slate-700">{risk.explanation}</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1 flex items-center gap-1"><Target className="size-3.5" /> Potential impact</dt>
            <dd className="text-sm leading-relaxed text-slate-700">{risk.potential_impact || "—"}</dd>
          </div>
        </dl>

        {risk.suggested_questions.length > 0 && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="eyebrow mb-2 flex items-center gap-1"><HelpCircle className="size-3.5" /> Questions to clarify with a legal professional</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {risk.suggested_questions.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </div>
        )}

        {risk.original_text && (
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={onViewSource} className="btn-ghost px-2.5 py-1.5 text-xs">
              <FileSearch className="size-4" /> View in document
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
