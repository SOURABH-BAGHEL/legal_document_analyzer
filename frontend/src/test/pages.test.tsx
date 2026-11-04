import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateFile } from "../components/DocumentUploader";
import { AppSettingsProvider } from "../hooks/useAppSettings";
import AnalysisResults from "../pages/AnalysisResults";
import Dashboard from "../pages/Dashboard";
import Documents from "../pages/Documents";
import UploadDocument from "../pages/UploadDocument";
import { ApiError, toApiError } from "../services/api";
import { analysisFixture, docFixture, settingsFixture, statsFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({
  stats: vi.fn(),
  settings: vi.fn(),
  health: vi.fn(),
  getAnalysis: vi.fn(),
  start: vi.fn(),
  waitForCompletion: vi.fn(),
  history: vi.fn(),
  simplify: vi.fn(),
  upload: vi.fn(),
  list: vi.fn(),
  getDoc: vi.fn(),
  content: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../services/analysisService", () => ({
  dashboardService: { stats: mocks.stats },
  systemService: { settings: mocks.settings, health: mocks.health },
  analysisService: {
    get: mocks.getAnalysis,
    start: mocks.start,
    waitForCompletion: mocks.waitForCompletion,
    history: mocks.history,
    simplify: mocks.simplify,
  },
}));

vi.mock("../services/documentService", () => ({
  documentService: { upload: mocks.upload, list: mocks.list, get: mocks.getDoc, content: mocks.content, remove: mocks.remove },
}));

function renderAt(path: string, routePath: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppSettingsProvider>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="/analysis/:documentId" element={<p>results page</p>} />
        </Routes>
      </AppSettingsProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue(settingsFixture);
  mocks.history.mockResolvedValue([]);
});

describe("Dashboard", () => {
  it("renders real statistics from the API", async () => {
    mocks.stats.mockResolvedValue(statsFixture);
    renderAt("/", "/", <Dashboard />);
    expect(await screen.findByText("Documents uploaded")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Residential Rental Agreement")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Analyze New Document/i })[0]).toHaveAttribute("href", "/analyze");
  });

  it("shows an empty state when there are no documents", async () => {
    mocks.stats.mockResolvedValue({ ...statsFixture, total_documents: 0, recent_analyses: [] });
    renderAt("/", "/", <Dashboard />);
    expect(await screen.findByText("No documents analysed yet")).toBeInTheDocument();
  });

  it("shows an error state with retry when the API fails", async () => {
    mocks.stats.mockRejectedValueOnce(new ApiError("Cannot reach the server.", "NETWORK_ERROR"));
    mocks.stats.mockResolvedValueOnce(statsFixture);
    renderAt("/", "/", <Dashboard />);
    expect(await screen.findByText("Cannot reach the server.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Documents uploaded")).toBeInTheDocument();
  });
});

describe("Document upload", () => {
  const pdf = () => new File(["%PDF-1.7 content"], "lease.pdf", { type: "application/pdf" });

  it("validates file type, emptiness and size on the client", () => {
    expect(validateFile(new File(["x"], "virus.exe"), 20)).toMatch(/Unsupported/);
    expect(validateFile(new File([], "empty.txt"), 20)).toMatch(/empty/);
    expect(validateFile(new File([new Uint8Array(2 * 1024 * 1024)], "big.pdf"), 1)).toMatch(/exceeds/);
    expect(validateFile(pdf(), 20)).toBeNull();
  });

  it("shows file details, uploads, shows progress and navigates to results", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.upload.mockImplementation(async (_f: File, onProgress: (p: number) => void) => {
      onProgress(100);
      return docFixture;
    });
    mocks.start.mockResolvedValue({ ...analysisFixture, status: "pending" });
    mocks.waitForCompletion.mockImplementation((_id: string, onUpdate: (a: unknown) => void) => {
      onUpdate({ ...analysisFixture, status: "processing", progress_stage: "Detecting potential risks", progress_percent: 60 });
      return new Promise((resolve) => (finish = resolve));
    });

    renderAt("/analyze", "/analyze", <UploadDocument />);
    await userEvent.upload(screen.getByTestId("file-input"), pdf());
    expect(screen.getByText("lease.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Demo mode is active/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Analyze Document/i }));
    expect(await screen.findByText("Detecting potential risks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Analyzing/i })).toBeDisabled();

    finish(analysisFixture);
    expect(await screen.findByText("results page")).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledWith("doc-1", false);
  });

  it("rejects an unsupported file before uploading", async () => {
    renderAt("/analyze", "/analyze", <UploadDocument />);
    await userEvent.upload(screen.getByTestId("file-input"), new File(["x"], "photo.png", { type: "image/png" }), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Unsupported file format/);
    expect(screen.getByRole("button", { name: /Analyze Document/i })).toBeDisabled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("displays a server error message when upload fails", async () => {
    mocks.upload.mockRejectedValue(new ApiError("This PDF is password-protected.", "PDF_ENCRYPTED", 422));
    renderAt("/analyze", "/analyze", <UploadDocument />);
    await userEvent.upload(screen.getByTestId("file-input"), pdf());
    await userEvent.click(screen.getByRole("button", { name: /Analyze Document/i }));
    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
    expect(screen.getByText("This PDF is password-protected.")).toBeInTheDocument();
  });

  it("requires consent when the AI provider is external", async () => {
    mocks.settings.mockResolvedValue({ ...settingsFixture, ai: { ...settingsFixture.ai, mode: "live", external_processing: true, provider_name: "Anthropic Claude", model: "m" } });
    renderAt("/analyze", "/analyze", <UploadDocument />);
    await userEvent.upload(await screen.findByTestId("file-input"), pdf());
    const button = screen.getByRole("button", { name: /Analyze Document/i });
    expect(button).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /third-party AI service/i }));
    expect(button).toBeEnabled();
  });
});

describe("Analysis results", () => {
  it("renders overview and switches between tabs", async () => {
    mocks.getAnalysis.mockResolvedValue(analysisFixture);
    renderAt("/analysis/doc-1", "/analysis/:documentId", <AnalysisResults />);

    expect(await screen.findByRole("heading", { name: "Residential Rental Agreement" })).toBeInTheDocument();
    expect(screen.getByText("AI analysis")).toBeInTheDocument();
    expect(screen.queryByText(/Demo mode result/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Clauses/ }));
    expect(await screen.findByText("The tenant pays Rs. 25,000 every month.")).toBeInTheDocument();
    expect(screen.getAllByText("Not identified in the document").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("tab", { name: /Risks/ }));
    expect(await screen.findByText("Can a notice period be added?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Payments/ }));
    expect(await screen.findByText("Stated in document")).toBeInTheDocument();
  });

  it("labels demo-mode results clearly", async () => {
    mocks.getAnalysis.mockResolvedValue({ ...analysisFixture, mode: "demo" });
    renderAt("/analysis/doc-1", "/analysis/:documentId", <AnalysisResults />);
    expect(await screen.findByText(/Demo mode result — not an AI analysis/)).toBeInTheDocument();
  });

  it("never shows results for a failed analysis", async () => {
    mocks.getAnalysis.mockResolvedValue({ ...analysisFixture, status: "failed", error_message: "The AI provider did not respond.", clauses: [], risks: [] });
    renderAt("/analysis/doc-1", "/analysis/:documentId", <AnalysisResults />);
    expect(await screen.findByText("The analysis failed")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("shows a loading state while fetching", () => {
    mocks.getAnalysis.mockReturnValue(new Promise(() => {}));
    renderAt("/analysis/doc-1", "/analysis/:documentId", <AnalysisResults />);
    expect(screen.getByRole("status")).toHaveTextContent(/Loading analysis/);
  });
});

describe("Documents list", () => {
  it("lists documents and deletes after confirmation", async () => {
    const item = { ...docFixture, latest_analysis_id: "an-1", document_type: "Rental", risk_count: 4 };
    mocks.list.mockResolvedValueOnce({ items: [item], total: 1 }).mockResolvedValue({ items: [], total: 0 });
    mocks.remove.mockResolvedValue(undefined);

    renderAt("/documents", "/documents", <Documents />);
    expect((await screen.findAllByText("lease.pdf")).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("button", { name: "Delete lease.pdf" })[0]);
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/permanently deleted/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("doc-1"));
    expect(await screen.findByText(/and its analysis were permanently deleted/)).toBeInTheDocument();
  });

  it("passes the search query to the API", async () => {
    mocks.list.mockResolvedValue({ items: [], total: 0 });
    renderAt("/documents?q=lease", "/documents", <Documents />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith({ q: "lease", file_type: "", status: "" }));
    expect(await screen.findByText("No matching documents")).toBeInTheDocument();
  });
});

describe("API error handling", () => {
  it("maps network and server errors to friendly messages", () => {
    const network = toApiError({ isAxiosError: true, message: "Network Error", response: undefined, toJSON: () => ({}) });
    expect(network.code).toBe("NETWORK_ERROR");
    const server = toApiError({
      isAxiosError: true,
      response: { status: 415, data: { error: { code: "UNSUPPORTED_FILE_TYPE", message: "Unsupported file format." } } },
      toJSON: () => ({}),
    });
    expect(server.message).toBe("Unsupported file format.");
    expect(server.status).toBe(415);
  });
});
