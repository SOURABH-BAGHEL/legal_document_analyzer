import { FileText, UploadCloud, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { formatBytes } from "../utils/format";
import { FileTypeBadge, cx } from "./Badges";

export const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt"];

export function validateFile(file: File, maxMb: number): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!file.name.includes(".") || !ALLOWED_EXTENSIONS.includes(ext)) {
    return "Unsupported file format. Please choose a PDF, DOCX or TXT document.";
  }
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > maxMb * 1024 * 1024) return `The file is ${formatBytes(file.size)}, which exceeds the ${maxMb} MB limit.`;
  return null;
}

interface Props {
  file: File | null;
  onSelect: (file: File | null) => void;
  onError: (message: string | null) => void;
  maxMb: number;
  disabled?: boolean;
}

export function DocumentUploader({ file, onSelect, onError, maxMb, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (candidate: File | undefined) => {
    if (!candidate) return;
    const problem = validateFile(candidate, maxMb);
    onError(problem);
    onSelect(problem ? null : candidate);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) pick(e.dataTransfer.files?.[0]);
  };

  if (file) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-navy-600 ring-1 ring-slate-200">
          <FileText className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-800" title={file.name}>{file.name}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <FileTypeBadge type={ext} />
            <span>{formatBytes(file.size)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            onError(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          disabled={disabled}
          className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-rose-600 disabled:opacity-40"
          aria-label="Remove selected file"
        >
          <X className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
        dragging ? "border-accent-500 bg-accent-50" : "border-slate-200 bg-slate-50/50 hover:border-navy-300",
      )}
      data-testid="dropzone"
    >
      <div className="grid size-14 place-items-center rounded-2xl bg-white text-accent-600 shadow-card ring-1 ring-slate-200">
        <UploadCloud className="size-7" />
      </div>
      <p className="mt-4 font-medium text-slate-800">Drag and drop your document here</p>
      <p className="mt-1 text-sm text-slate-500">PDF, DOCX or TXT · up to {maxMb} MB</p>
      <button type="button" className="btn-secondary mt-5" onClick={() => inputRef.current?.click()} disabled={disabled}>
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="sr-only"
        aria-label="Choose a document to upload"
        onChange={(e) => pick(e.target.files?.[0])}
        data-testid="file-input"
      />
    </div>
  );
}
