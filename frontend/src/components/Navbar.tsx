import { ArrowRight, Bell, BellOff, CheckCircle2, Menu, Search, UserRound, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { analysisService } from "../services/analysisService";
import type { HistoryItem } from "../types/api";
import { timeAgo } from "../utils/format";

const SEEN_KEY = "lda.notifications.seen";

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function Navbar({ title, onOpenMenu }: { title: string; onOpenMenu: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [seen, setSeen] = useState(readSeen);
  const panelRef = useRef<HTMLDivElement>(null);

  // Notifications are real analysis events (completed / failed runs).
  useEffect(() => {
    let alive = true;
    const load = () =>
      analysisService
        .history()
        .then((h) => alive && setItems(h.filter((i) => i.status === "completed" || i.status === "failed").slice(0, 6)))
        .catch(() => undefined);
    load();
    const t = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => panelRef.current && !panelRef.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((i) => (i.completed_at ?? i.created_at) > seen).length;

  const toggle = () => {
    setOpen((o) => !o);
    if (!open && items[0]) {
      const latest = items[0].completed_at ?? items[0].created_at;
      setSeen(latest);
      try {
        localStorage.setItem(SEEN_KEY, latest);
      } catch {
        /* storage unavailable */
      }
    }
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/documents${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur sm:px-6">
      <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <h1 className="truncate font-serif text-lg font-semibold text-navy-900 sm:text-xl">{title}</h1>

      <form onSubmit={onSearch} className="ml-auto hidden w-72 md:block" role="search">
        <label className="relative block">
          <span className="sr-only">Search documents</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input bg-slate-50 py-2 pl-9"
            placeholder="Search documents by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </form>

      <div className="relative ml-auto md:ml-0" ref={panelRef}>
        <button type="button" onClick={toggle} className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications (${unread} new)`}>
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white tabular-nums ring-2 ring-white">{unread}</span>}
        </button>
        {open && (
          <div className="menu-pop absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-menu">
            <div className="px-4 pt-3.5 pb-2.5">
              <p className="font-serif text-[15px] font-semibold text-navy-900">Analysis activity</p>
            </div>
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 pt-4 pb-8 text-center">
                <span className="grid size-10 place-items-center rounded-xl bg-navy-50 text-navy-500"><BellOff className="size-5" /></span>
                <p className="text-sm text-slate-500">Finished analyses will appear here.</p>
              </div>
            ) : (
              <>
                <ul className="max-h-80 overflow-y-auto px-1.5">
                  {items.map((i) => (
                    <li key={i.id}>
                      <Link to={`/analysis/${i.document_id}?run=${i.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm transition-colors hover:bg-navy-50">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${i.status === "completed" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                          {i.status === "completed" ? <CheckCircle2 className="size-[18px]" /> : <XCircle className="size-[18px]" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800">{i.original_filename}</span>
                          <span className="block text-xs text-slate-500">
                            Analysis {i.status} · {timeAgo(i.completed_at ?? i.created_at)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to="/history" onClick={() => setOpen(false)} className="mt-1.5 flex items-center justify-center gap-1 border-t border-slate-100 py-2.5 text-sm font-medium text-accent-700 transition-colors hover:bg-slate-50">
                  View full history <ArrowRight className="size-4" />
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-l border-slate-200 pl-3">
        <div className="grid size-9 place-items-center rounded-full bg-navy-100 text-navy-700">
          <UserRound className="size-[18px]" />
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-medium text-slate-800">Local user</p>
          <p className="text-xs text-slate-500">Single-user mode</p>
        </div>
      </div>
    </header>
  );
}
