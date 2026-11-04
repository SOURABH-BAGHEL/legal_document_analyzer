import { Eye, Files, FileText, FileUp, Play, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FileTypeBadge, StatusBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Select, type SelectOption } from "../components/Select";
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/States";
import { useAsync } from "../hooks/useAsync";
import { errorMessage } from "../services/api";
import { documentService } from "../services/documentService";
import type { DocumentListItem } from "../types/api";
import { formatBytes, formatDate } from "../utils/format";

const dot = (color: string) => <span className={`size-2 rounded-full ${color}`} />;

const FILE_TYPE_OPTIONS: SelectOption[] = [
  { value: "", label: "All file types", icon: <Files className="size-4 text-slate-400" /> },
  { value: "pdf", label: "PDF", icon: <FileText className="size-4 text-rose-600" /> },
  { value: "docx", label: "DOCX", icon: <FileText className="size-4 text-blue-600" /> },
  { value: "txt", label: "TXT", icon: <FileText className="size-4 text-slate-500" /> },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "", label: "All statuses", icon: dot("bg-slate-300") },
  { value: "completed", label: "Completed", icon: dot("bg-emerald-500") },
  { value: "processing", label: "Processing", icon: dot("bg-accent-500") },
  { value: "failed", label: "Failed", icon: dot("bg-rose-500") },
  { value: "not_started", label: "Not analysed", icon: dot("bg-slate-400") },
];

export default function Documents() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const fileType = params.get("type") ?? "";
  const status = params.get("status") ?? "";

  const [toDelete, setToDelete] = useState<DocumentListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data, error, loading, reload } = useAsync(
    () => documentService.list({ q: debounced, file_type: fileType, status }),
    [debounced, fileType, status],
  );

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await documentService.remove(toDelete.id);
      setNotice({ tone: "success", text: `"${toDelete.original_filename}" and its analysis were permanently deleted.` });
      setToDelete(null);
      await reload();
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const filtersActive = !!(debounced || fileType || status);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-semibold text-navy-900">My Documents</h2>
          <p className="text-sm text-slate-500">{data ? `${data.total} document${data.total === 1 ? "" : "s"}` : "Your uploaded documents"}</p>
        </div>
        <Link to="/analyze" className="btn-primary self-start">
          <FileUp className="size-4" /> Upload document
        </Link>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search by file name</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search by file name…" value={q} onChange={(e) => { setQ(e.target.value); setFilter("q", e.target.value); }} />
          </label>
          <Select className="md:w-44" ariaLabel="Filter by document type" value={fileType} onChange={(v) => setFilter("type", v)} options={FILE_TYPE_OPTIONS} />
          <Select className="md:w-48" ariaLabel="Filter by analysis status" value={status} onChange={(v) => setFilter("status", v)} options={STATUS_OPTIONS} />
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingState label="Loading documents…" />
        ) : !data || data.items.length === 0 ? (
          filtersActive ? (
            <EmptyState title="No matching documents" description="Try a different search term or clear the filters." />
          ) : (
            <EmptyState
              title="No documents yet"
              description="Upload a PDF, DOCX or TXT legal document to start your first analysis."
              action={<Link to="/analyze" className="btn-primary"><FileUp className="size-4" /> Analyze a document</Link>}
            />
          )
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Document</th>
                  <th className="hidden px-3 py-3 font-semibold xl:table-cell">Type</th>
                  <th className="hidden px-3 py-3 font-semibold xl:table-cell">Uploaded</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Risks</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="max-w-[16rem] px-5 py-3.5">
                      <p className="truncate font-medium text-slate-800" title={d.original_filename}>{d.original_filename}</p>
                      <p className="text-xs text-slate-500">
                        <span className="uppercase xl:hidden">{d.file_type} · </span>{d.document_type ?? "Not yet classified"} · {formatBytes(d.file_size)}<span className="xl:hidden"> · {formatDate(d.upload_timestamp)}</span> · {d.page_count} {d.location_unit}{d.page_count === 1 ? "" : "s"}
                      </p>
                    </td>
                    <td className="hidden px-3 py-3.5 xl:table-cell"><FileTypeBadge type={d.file_type} /></td>
                    <td className="hidden px-3 py-3.5 whitespace-nowrap text-slate-600 xl:table-cell">{formatDate(d.upload_timestamp)}</td>
                    <td className="px-3 py-3.5"><StatusBadge status={d.analysis_status} /></td>
                    <td className="px-3 py-3.5 text-right font-medium text-slate-800 tabular-nums">{d.analysis_status === "completed" ? d.risk_count : "—"}</td>
                    <td className="px-5 py-3.5">
                      <RowActions doc={d} onOpen={() => navigate(`/analysis/${d.id}`)} onDelete={() => setToDelete(d)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <ul className="divide-y divide-slate-100 md:hidden">
              {data.items.map((d) => (
                <li key={d.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{d.original_filename}</p>
                      <p className="text-xs text-slate-500">{formatDate(d.upload_timestamp, true)} · {formatBytes(d.file_size)}</p>
                    </div>
                    <FileTypeBadge type={d.file_type} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <StatusBadge status={d.analysis_status} />
                    <RowActions doc={d} onOpen={() => navigate(`/analysis/${d.id}`)} onDelete={() => setToDelete(d)} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this document?"
        description={
          <>
            <b className="text-slate-800">{toDelete?.original_filename}</b>, its stored file and all of its analysis results will be permanently deleted. This cannot be undone.
          </>
        }
        busy={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function RowActions({ doc, onOpen, onDelete }: { doc: DocumentListItem; onOpen: () => void; onDelete: () => void }) {
  const analysed = doc.analysis_status !== "not_started";
  return (
    <div className="flex justify-end gap-1">
      <button type="button" className="btn-ghost px-2.5 py-1.5" onClick={onOpen} title={analysed ? "Open analysis" : "Analyze document"}>
        {analysed ? <Eye className="size-4" /> : <Play className="size-4" />}
        <span className="hidden lg:inline">{analysed ? "Open" : "Analyze"}</span>
      </button>
      <button
        type="button"
        className="btn-ghost px-2.5 py-1.5 text-rose-600 hover:bg-rose-50"
        onClick={onDelete}
        disabled={doc.analysis_status === "processing"}
        aria-label={`Delete ${doc.original_filename}`}
        title="Delete document"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
