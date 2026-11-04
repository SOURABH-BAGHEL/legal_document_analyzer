import { ChevronDown, FileSearch } from "lucide-react";
import { useState } from "react";
import type { Clause } from "../types/api";
import { locationLabel } from "../utils/format";
import { Badge, LevelBadge, VerificationBadge } from "./Badges";

interface Props {
  clause: Clause;
  unit: "page" | "section";
  onViewSource: () => void;
}

export function ClauseCard({ clause, unit, onViewSource }: Props) {
  const [open, setOpen] = useState(false);
  const long = clause.original_text.length > 280;

  return (
    <article className="card p-5" id={clause.id}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-navy-900">{clause.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge>{clause.category}</Badge>
            <span className="text-xs text-slate-500">{locationLabel(unit, clause.page_number)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LevelBadge level={clause.importance} suffix=" importance" />
          <VerificationBadge value={clause.verification} />
        </div>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="eyebrow mb-1.5">Original text</p>
          <p className={`font-serif text-[14.5px] leading-relaxed text-slate-700 ${!open && long ? "line-clamp-4" : ""}`}>{clause.original_text || "—"}</p>
          {long && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline" aria-expanded={open}>
              {open ? "Show less" : "Show full clause"}
              <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
        <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
          <p className="eyebrow mb-1.5 text-teal-800">In simple words</p>
          <p className="text-[14.5px] leading-relaxed text-slate-800">{clause.simplified_explanation || "No explanation available."}</p>
        </div>
      </div>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {clause.is_uncertain ? <p className="text-xs text-slate-500">Marked uncertain — check against the original wording.</p> : <span />}
        {clause.original_text && (
          <button type="button" onClick={onViewSource} className="btn-ghost px-2.5 py-1.5 text-xs">
            <FileSearch className="size-4" /> View in document
          </button>
        )}
      </footer>
    </article>
  );
}
