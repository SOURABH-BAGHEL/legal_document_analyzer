import { AlertCircle, FileSearch, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-3 py-16 text-slate-500 ${className}`}>
      <Loader2 className="size-7 animate-spin text-accent-600" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-navy-50 text-navy-600 ring-1 ring-navy-100">
        {icon ?? <FileSearch className="size-7" aria-hidden />}
      </div>
      <h3 className="font-serif text-lg font-semibold text-navy-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = "Something went wrong" }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
        <AlertCircle className="size-7" aria-hidden />
      </div>
      <h3 className="font-serif text-lg font-semibold text-navy-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-500">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary mt-5" onClick={onRetry}>
          <RefreshCw className="size-4" /> Try again
        </button>
      )}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: "info" | "warning" | "error" | "success" | "demo";
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const tones = {
    info: "border-accent-200 bg-accent-50 text-navy-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    demo: "border-violet-200 bg-violet-50 text-violet-900",
  };
  return (
    <div role={tone === "error" ? "alert" : "note"} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}
