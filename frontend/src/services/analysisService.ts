import { api, toApiError } from "./api";
import type {
  AISettings,
  AISettingsInput,
  AIStatus,
  Analysis,
  AnalysisStatusInfo,
  ConnectionTestResult,
  DashboardStats,
  HistoryItem,
  PublicSettings,
  SimplifyResult,
} from "../types/api";

async function call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw toApiError(err);
  }
}

export const analysisService = {
  start: (documentId: string, consentExternal: boolean) =>
    call<AnalysisStatusInfo>(() =>
      api.post(`/api/analysis/${documentId}/analyze`, { consent_external_processing: consentExternal }),
    ),

  get: (documentId: string, analysisId?: string) =>
    call<Analysis>(() => api.get(`/api/analysis/${documentId}`, { params: analysisId ? { analysis_id: analysisId } : {} })),

  history: () => call<HistoryItem[]>(() => api.get("/api/analysis/history")),

  simplify: (text: string, consentExternal: boolean) =>
    call<SimplifyResult>(() => api.post("/api/tools/simplify", { text, consent_external_processing: consentExternal })),

  /** Poll until the analysis reaches a terminal state. */
  async waitForCompletion(
    documentId: string,
    onUpdate: (a: Analysis) => void,
    { intervalMs = 1200, signal }: { intervalMs?: number; signal?: AbortSignal } = {},
  ): Promise<Analysis> {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const analysis = await analysisService.get(documentId);
      onUpdate(analysis);
      if (analysis.status === "completed" || analysis.status === "failed") return analysis;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  },
};

export const dashboardService = {
  stats: () => call<DashboardStats>(() => api.get("/api/dashboard/stats")),
};

export const systemService = {
  settings: () => call<PublicSettings>(() => api.get("/api/settings")),
  aiSettings: () => call<AISettings>(() => api.get("/api/settings/ai")),
  saveAiSettings: (input: AISettingsInput) => call<AISettings>(() => api.put("/api/settings/ai", input)),
  resetAiSettings: () => call<AISettings>(() => api.delete("/api/settings/ai")),
  testAiSettings: (input: AISettingsInput) => call<ConnectionTestResult>(() => api.post("/api/settings/ai/test", input)),
  health: () => call<{ status: string; database: string; ai_mode: AIStatus["mode"]; version: string }>(() => api.get("/api/health")),
};
