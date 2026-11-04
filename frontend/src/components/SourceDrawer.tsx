import { FileText, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { DocumentContent } from "../types/api";
import { locationLabel } from "../utils/format";
import { LoadingState } from "./States";

export interface SourceTarget {
  quote: string;
  page: number | null;
  title: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Find a quote in page text, tolerating whitespace/line-break differences from extraction. */
export function findQuote(text: string, quote: string): [number, number] | null {
  const words = quote.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").split(/\s+/).filter(Boolean);
  for (const take of [words.length, 25, 12, 6]) {
    if (take > words.length || take < 3) continue;
    const re = new RegExp(words.slice(0, take).map(escapeRe).join("\\s+"), "i");
    const m = re.exec(text);
    if (m) {
      // Extend to the full quote length where possible when only a prefix matched.
      const end = take === words.length ? m.index + m[0].length : Math.min(text.length, m.index + Math.max(m[0].length, quote.length));
      return [m.index, end];
    }
  }
  return null;
}

interface Props {
  target: SourceTarget | null;
  content: DocumentContent | null;
  error: string | null;
  onClose: () => void;
}

export function SourceDrawer({ target, content, error, onClose }: Props) {
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  const view = useMemo(() => {
    if (!target || !content) return null;
    const pages = target.page ? [target.page - 1] : content.pages.map((_, i) => i);
    for (const idx of pages) {
      const text = content.pages[idx];
      if (text == null) continue;
      const hit = target.quote ? findQuote(text, target.quote) : null;
      if (hit || target.page) return { idx, text, hit };
    }
    return { idx: 0, text: content.pages[0] ?? "", hit: null };
  }, [target, content]);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center" });
  }, [view]);

  if (!target) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Source text"
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <FileText className="mt-0.5 size-5 shrink-0 text-navy-500" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Source text</p>
            <h2 className="truncate font-semibold text-navy-900">{target.title}</h2>
            {view && <p className="text-xs text-slate-500">{locationLabel(content?.location_unit, view.idx + 1)} of {content?.pages.length}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close source text">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : !view ? (
            <LoadingState label="Loading document text…" />
          ) : (
            <>
              {!view.hit && target.quote && (
                <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
                  The exact quote could not be located on this {content?.location_unit}; it may span a page break or have been shortened.
                </p>
              )}
              <div className="font-serif text-[15px] leading-7 whitespace-pre-wrap text-slate-700">
                {view.hit ? (
                  <>
                    {view.text.slice(0, view.hit[0])}
                    <mark ref={markRef} className="source-highlight">{view.text.slice(view.hit[0], view.hit[1])}</mark>
                    {view.text.slice(view.hit[1])}
                  </>
                ) : (
                  view.text
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
