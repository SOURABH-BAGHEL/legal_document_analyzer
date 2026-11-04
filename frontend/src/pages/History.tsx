import { History as HistoryIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { FileTypeBadge, LEVEL_STYLES, ModeBadge, StatusBadge } from "../components/Badges";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { useAsync } from "../hooks/useAsync";
import { analysisService } from "../services/analysisService";
import type { Level } from "../types/api";
import { formatDate } from "../utils/format";

export default function History() {
  const { data, error, loading, reload } = useAsync(() => analysisService.history(), []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-semibold text-navy-900">Analysis History</h2>
        <p className="text-sm text-slate-500">Every analysis run, including re-runs and failures. Open any run to review its results.</p>
      </div>
      <div className="card overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <LoadingState label="Loading history…" />
        ) : !data?.length ? (
          <EmptyState icon={<HistoryIcon className="size-7" />} title="No analyses yet" description="Analyses you run will be listed here." />
        ) : (
          <ol className="divide-y divide-slate-100">
            {data.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileTypeBadge type={a.file_type} />
                    <p className="truncate font-medium text-slate-800">{a.document_title || a.original_filename}</p>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {a.original_filename} · {a.document_type ?? "—"} · started {formatDate(a.created_at, true)}
                    {a.completed_at && ` · finished ${formatDate(a.completed_at, true)}`}
                  </p>
                  {a.status === "failed" && a.error_message && <p className="mt-1 text-xs text-rose-600">{a.error_message}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.status === "completed" && (
                    <>
                      <span className="text-xs text-slate-500 tabular-nums">{a.clause_count} clauses</span>
                      {(["High", "Medium", "Low"] as Level[]).map((l) => (
                        <span key={l} className={`text-xs font-medium tabular-nums ${LEVEL_STYLES[l].text}`} title={`${l} risks`}>
                          {l[0]}:{a.risk_counts[l]}
                        </span>
                      ))}
                      <ModeBadge mode={a.mode} />
                    </>
                  )}
                  <StatusBadge status={a.status} />
                  <Link to={`/analysis/${a.document_id}?run=${a.id}`} className="btn-secondary px-3 py-1.5">Open</Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
