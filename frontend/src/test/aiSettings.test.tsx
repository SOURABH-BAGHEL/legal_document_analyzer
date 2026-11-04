import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIProviderSettings } from "../components/AIProviderSettings";
import { AppSettingsProvider } from "../hooks/useAppSettings";
import Settings from "../pages/Settings";
import { ApiError } from "../services/api";
import type { AISettings } from "../types/api";
import { settingsFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  health: vi.fn(),
  aiSettings: vi.fn(),
  saveAiSettings: vi.fn(),
  resetAiSettings: vi.fn(),
  testAiSettings: vi.fn(),
}));

vi.mock("../services/analysisService", () => ({ systemService: mocks }));

const aiFixture: AISettings = {
  active_provider: "demo",
  customized: false,
  providers: [
    { id: "anthropic", label: "Anthropic Claude", model: "claude-sonnet-5-5", api_url: "https://api.anthropic.com", url_editable: false, has_key: false, key_hint: null, key_source: null },
    { id: "nvidia", label: "NVIDIA AI API", model: "mistralai/mistral-large-4-1t-a52b", api_url: "https://integrate.api.nvidia.com/v1", url_editable: false, has_key: false, key_hint: null, key_source: null },
    { id: "openai", label: "OpenAI / OpenAI-compatible", model: "gpt-4o-mini", api_url: "https://api.openai.com/v1", url_editable: true, has_key: false, key_hint: null, key_source: null },
    { id: "demo", label: "Demo mode (rule-based, no AI)", model: null, api_url: null, url_editable: false, has_key: false, key_hint: null, key_source: null },
  ],
};

const renderSection = () =>
  render(
    <AppSettingsProvider>
      <AIProviderSettings />
    </AppSettingsProvider>,
  );

async function chooseNvidia() {
  await userEvent.click(await screen.findByRole("combobox", { name: "Provider" }));
  await userEvent.click(screen.getByRole("option", { name: /NVIDIA AI API/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue(settingsFixture);
  mocks.aiSettings.mockResolvedValue(aiFixture);
});

describe("AI provider settings", () => {
  it("fills the model for the chosen provider and hides key fields for demo mode", async () => {
    renderSection();
    expect(await screen.findByText(/No key is needed/)).toBeInTheDocument();
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();

    await chooseNvidia();
    expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("mistralai/mistral-large-4-1t-a52b");
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
    expect(screen.queryByRole("textbox", { name: "API URL" })).not.toBeInTheDocument();
  });

  it("reports a working connection without saving", async () => {
    mocks.testAiSettings.mockResolvedValue({ status: "ok", message: "Connection works.", code: null, provider: "nvidia", model: "m", latency_ms: 1200 });
    renderSection();
    await chooseNvidia();
    await userEvent.type(screen.getByLabelText("API key"), "nvapi-abc");
    await userEvent.click(screen.getByRole("button", { name: /Test connection/ }));

    expect(await screen.findByText("Connection works.")).toBeInTheDocument();
    expect(screen.getByText(/replied in 1.2 s/)).toBeInTheDocument();
    expect(mocks.testAiSettings).toHaveBeenCalledWith({ provider: "nvidia", model: "mistralai/mistral-large-4-1t-a52b", api_url: null, api_key: "nvapi-abc" });
    expect(mocks.saveAiSettings).not.toHaveBeenCalled();
  });

  it("shows why a connection failed and clears the result after an edit", async () => {
    mocks.testAiSettings.mockResolvedValue({ status: "failed", message: "The AI provider rejected the API key.", code: "AI_NOT_CONFIGURED", provider: "nvidia", model: "m", latency_ms: null });
    renderSection();
    await chooseNvidia();
    await userEvent.click(screen.getByRole("button", { name: /Test connection/ }));

    expect(await screen.findByText("Connection failed")).toBeInTheDocument();
    expect(screen.getByText("The AI provider rejected the API key.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("API key"), "x");
    expect(screen.queryByText("Connection failed")).not.toBeInTheDocument();
  });

  it("saves, clears the key field and shows the saved-key hint", async () => {
    const saved: AISettings = {
      ...aiFixture,
      active_provider: "nvidia",
      customized: true,
      providers: aiFixture.providers.map((p) => (p.id === "nvidia" ? { ...p, has_key: true, key_hint: "••••1234", key_source: "saved" } : p)),
    };
    mocks.saveAiSettings.mockResolvedValue(saved);
    renderSection();
    await chooseNvidia();
    await userEvent.type(screen.getByLabelText("API key"), "nvapi-1234");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/New analyses will use NVIDIA AI API/)).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(screen.getByText(/A key is saved \(••••1234\)/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.settings).toHaveBeenCalledTimes(2));
  });

  it("keeps the saved message on the Settings page after settings reload", async () => {
    mocks.saveAiSettings.mockResolvedValue(aiFixture);
    mocks.health.mockResolvedValue({ status: "ok", database: "ok", ai_mode: "demo", version: "1.0.0" });
    render(
      <AppSettingsProvider>
        <Settings />
      </AppSettingsProvider>,
    );
    await chooseNvidia();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/New analyses will use NVIDIA AI API/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.settings).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/New analyses will use NVIDIA AI API/)).toBeInTheDocument();
  });

  const pasteCode = async (code: string) => {
    await userEvent.click(await screen.findByRole("button", { name: "Paste code" }));
    await userEvent.click(screen.getByLabelText("Sample code from your provider"));
    await userEvent.paste(code);
    await userEvent.click(screen.getByRole("button", { name: "Read code" }));
  };

  it("fills the form from pasted code and clears the pasted text", async () => {
    const key = "nvapi-AbCdEf123456ghIJKL7890";
    renderSection();
    await pasteCode(`url = "https://integrate.api.nvidia.com/v1/chat/completions"
headers = {"Authorization": "Bearer ${key}"}
payload = {"model": "moonshotai/kimi-k2.6"}`);

    expect(await screen.findByText(/Found NVIDIA AI API, model moonshotai\/kimi-k2.6 and an API key ending in 7890/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveTextContent("NVIDIA AI API");
    expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("moonshotai/kimi-k2.6");
    expect(screen.getByLabelText("API key")).toHaveValue(key);
    expect(document.body.textContent).not.toContain(key);
    expect(mocks.saveAiSettings).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Paste code" }));
    expect(screen.getByLabelText("Sample code from your provider")).toHaveValue("");
  });

  it("asks for the key when pasted code only has a placeholder", async () => {
    renderSection();
    await pasteCode(`url = "https://integrate.api.nvidia.com/v1/chat/completions"
headers = {"Authorization": "api-key"}
payload = {"model": "mistralai/mistral-large-4-1t-a52b"}`);
    expect(await screen.findByText(/only has a placeholder where the key goes/)).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("explains when pasted code contains nothing usable", async () => {
    renderSection();
    await pasteCode("print('hello')");
    expect(await screen.findByText(/No model or API key was found/)).toBeInTheDocument();
    expect(screen.getByLabelText("Sample code from your provider")).toHaveValue("print('hello')");
  });

  it("requires a model before testing or saving", async () => {
    renderSection();
    await chooseNvidia();
    await userEvent.clear(screen.getByRole("textbox", { name: "Model" }));
    expect(screen.getByRole("button", { name: /Test connection/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks for confirmation before resetting saved keys", async () => {
    mocks.aiSettings.mockResolvedValue({ ...aiFixture, customized: true });
    mocks.resetAiSettings.mockResolvedValue(aiFixture);
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: /Reset to backend/ }));
    expect(mocks.resetAiSettings).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(mocks.resetAiSettings).toHaveBeenCalled());
  });

  it("explains how to recover when the settings cannot load", async () => {
    mocks.aiSettings.mockRejectedValue(new ApiError("The server returned an error (HTTP 404).", "HTTP_ERROR", 404));
    renderSection();
    expect(await screen.findByText(/restart it to load this feature/)).toBeInTheDocument();
  });
});
