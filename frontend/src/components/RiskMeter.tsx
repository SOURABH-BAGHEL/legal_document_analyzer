import type { Level, RiskCounts } from "../types/api";
import { LEVEL_STYLES, LevelBadge } from "./Badges";

/** Labelled horizontal meters for High / Medium / Low counts (icon + text, never colour alone). */
export function RiskMeter({ counts }: { counts: RiskCounts }) {
  const levels: Level[] = ["High", "Medium", "Low"];
  const total = levels.reduce((s, l) => s + (counts[l] ?? 0), 0);
  return (
    <div>
      <div className="mb-5 flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {total > 0 &&
          levels.map((l) =>
            counts[l] ? <div key={l} className={LEVEL_STYLES[l].bar} style={{ width: `${(counts[l] / total) * 100}%` }} /> : null,
          )}
      </div>
      <ul className="space-y-3">
        {levels.map((l) => (
          <li key={l} className="flex items-center justify-between text-sm">
            <LevelBadge level={l} />
            <span className="text-slate-600">
              <b className="font-semibold text-slate-900 tabular-nums">{counts[l] ?? 0}</b>
              <span className="ml-1.5 text-xs text-slate-400 tabular-nums">{total ? Math.round(((counts[l] ?? 0) / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
