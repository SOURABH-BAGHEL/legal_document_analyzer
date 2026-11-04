import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Delete", busy, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4 backdrop-blur-[2px]" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="card w-full max-w-md p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h2 id="confirm-title" className="font-serif text-lg font-semibold text-navy-900">
              {title}
            </h2>
            <div className="mt-1.5 text-sm text-slate-600">{description}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
