import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Info, Loader2, ShieldCheck, ShieldQuestion, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { AnalysisStatus, Level, Verification } from "../types/api";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Badge({ children, className, icon }: { children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        className ?? "bg-slate-50 text-slate-600 ring-slate-200",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export const LEVEL_STYLES: Record<Level, { badge: string; bar: string; text: string; soft: string }> = {
  High: { badge: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-600", text: "text-rose-700", soft: "border-rose-200 bg-rose-50/40" },
  Medium: { badge: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-500", text: "text-amber-800", soft: "border-amber-200 bg-amber-50/40" },
  Low: { badge: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500", text: "text-sky-700", soft: "border-sky-200 bg-sky-50/40" },
};

const LEVEL_ICONS: Record<Level, ReactNode> = {
  High: <AlertOctagon className="size-3.5" aria-hidden />,
  Medium: <AlertTriangle className="size-3.5" aria-hidden />,
  Low: <Info className="size-3.5" aria-hidden />,
};

/** Risk level or importance badge - always icon + text, never colour alone. */
export function LevelBadge({ level, suffix = "" }: { level: Level; suffix?: string }) {
  return (
    <Badge className={LEVEL_STYLES[level].badge} icon={LEVEL_ICONS[level]}>
      {level}
      {suffix}
    </Badge>
  );
}

const STATUS: Record<AnalysisStatus, { label: string; cls: string; icon: ReactNode }> = {
  not_started: { label: "Not analysed", cls: "bg-slate-50 text-slate-600 ring-slate-200", icon: <CircleDashed className="size-3.5" /> },
  pending: { label: "Queued", cls: "bg-accent-50 text-accent-700 ring-accent-200", icon: <Loader2 className="size-3.5 animate-spin" /> },
  processing: { label: "Processing", cls: "bg-accent-50 text-accent-700 ring-accent-200", icon: <Loader2 className="size-3.5 animate-spin" /> },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: <CheckCircle2 className="size-3.5" /> },
  failed: { label: "Failed", cls: "bg-rose-50 text-rose-700 ring-rose-200", icon: <XCircle className="size-3.5" /> },
};

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  const s = STATUS[status] ?? STATUS.not_started;
  return (
    <Badge className={s.cls} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

export function VerificationBadge({ value }: { value: Verification }) {
  if (value === "verified")
    return (
      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200" icon={<ShieldCheck className="size-3.5" />}>
        Quote verified
      </Badge>
    );
  if (value === "approximate")
    return (
      <Badge className="bg-teal-50 text-teal-700 ring-teal-200" icon={<ShieldCheck className="size-3.5" />}>
        Close match
      </Badge>
    );
  if (value === "unverified")
    return (
      <Badge className="bg-orange-50 text-orange-700 ring-orange-200" icon={<ShieldQuestion className="size-3.5" />}>
        Not found in document
      </Badge>
    );
  return null;
}

export function ModeBadge({ mode }: { mode: "live" | "demo" | "misconfigured" }) {
  if (mode === "live") return <Badge className="bg-accent-50 text-accent-700 ring-accent-200">AI analysis</Badge>;
  if (mode === "demo") return <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Demo mode · rule-based</Badge>;
  return <Badge className="bg-rose-50 text-rose-700 ring-rose-200">AI misconfigured</Badge>;
}

export function FileTypeBadge({ type }: { type: string }) {
  const cls =
    type === "pdf"
      ? "bg-rose-50 text-rose-700 ring-rose-100"
      : type === "docx"
        ? "bg-blue-50 text-blue-700 ring-blue-100"
        : "bg-slate-100 text-slate-600 ring-slate-200";
  return <Badge className={`${cls} font-semibold uppercase`}>{type}</Badge>;
}

export { cx };
