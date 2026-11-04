import type { AIProviderId } from "../types/api";

export interface ParsedProviderCode {
  provider: AIProviderId | null;
  model: string | null;
  apiUrl: string | null;
  apiKey: string | null;
  /** The code has a key slot, but it holds a placeholder such as "api-key" or $NVIDIA_API_KEY. */
  keyIsPlaceholder: boolean;
}

const KNOWN_KEY = /\b(nvapi-[\w-]{8,}|sk-ant-[\w-]{8,}|sk-[\w-]{16,})/g;
const KEY_SLOTS = [
  /authorization\\?["']?\s*[:=,]?\s*\\?["'`]?\s*(?:authorization\s*:\s*)?(?:bearer\s+)?([^\s"'`\\,)]+)/i,
  /x-api-key\\?["']?\s*[:=,]?\s*\\?["'`]?\s*([^\s"'`\\,)]+)/i,
  /\bapi[_-]?key\\?["']?\s*[:=]\s*\\?["'`]([^"'`\\\s]+)/i,
];
const MODEL = /\bmodel\\?["']?\s*[:=]\s*\\?["'`]([^"'`\\\s]+)/i;
const URL_PATTERN = /https?:\/\/[^\s"'`\\)]+/g;

function isPlaceholder(value: string): boolean {
  return /[$<>{}[\]]/.test(value) || /api[_-]?key|your[-_]?(api|key|token)|required|x{4,}/i.test(value) || value.length < 16;
}

function detectProvider(url: string | null, key: string | null): AIProviderId | null {
  if (url?.includes("nvidia.com") || key?.startsWith("nvapi-")) return "nvidia";
  if (url?.includes("anthropic.com") || key?.startsWith("sk-ant-")) return "anthropic";
  if (url || key?.startsWith("sk-")) return "openai";
  return null;
}

/**
 * Pull the provider, model, URL and key out of sample code (Python, curl or JavaScript).
 * The code is only searched as plain text. It is never executed or sent anywhere.
 */
export function parseProviderCode(code: string): ParsedProviderCode {
  const urls = code.match(URL_PATTERN) ?? [];
  const rawUrl = urls.find((u) => /\/(chat\/completions|messages)\b|\/v1\/?$/.test(u)) ?? urls[0] ?? null;
  const apiUrl = rawUrl?.replace(/\/(chat\/completions|messages)\/?$/, "").replace(/\/+$/, "") ?? null;

  const slotValues = KEY_SLOTS.map((re) => code.match(re)?.[1]).filter((v): v is string => !!v);
  const candidates = [...(code.match(KNOWN_KEY) ?? []), ...slotValues];
  const apiKey = candidates.find((v) => !isPlaceholder(v)) ?? null;

  return {
    provider: detectProvider(apiUrl, apiKey),
    model: code.match(MODEL)?.[1] ?? null,
    apiUrl,
    apiKey,
    keyIsPlaceholder: !apiKey && candidates.length > 0,
  };
}
