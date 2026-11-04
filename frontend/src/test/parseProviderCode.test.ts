import { describe, expect, it } from "vitest";
import { parseProviderCode } from "../utils/parseProviderCode";

const KEY = "nvapi-AbCdEf123456_ghIJKL-7890mnopQRST";

describe("parseProviderCode", () => {
  it("reads NVIDIA Python requests code", () => {
    const code = `
import requests
invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"
headers = {
  "Authorization": "Bearer ${KEY}",
  "Accept": "application/json",
}
payload = {
  "model": "mistralai/mistral-large-4-1t-a52b",
  "messages": [{"role": "user", "content": "Hi"}],
  "max_tokens": 4096,
}
response = requests.post(invoke_url, headers=headers, json=payload)`;
    expect(parseProviderCode(code)).toEqual({
      provider: "nvidia",
      model: "mistralai/mistral-large-4-1t-a52b",
      apiUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: KEY,
      keyIsPlaceholder: false,
    });
  });

  it("treats the literal api-key sample value as a placeholder", () => {
    const parsed = parseProviderCode(`invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"
headers = { "Authorization": "api-key" }
payload = { "model": "mistralai/mistral-large-4-1t-a52b" }`);
    expect(parsed.provider).toBe("nvidia");
    expect(parsed.model).toBe("mistralai/mistral-large-4-1t-a52b");
    expect(parsed.apiKey).toBeNull();
    expect(parsed.keyIsPlaceholder).toBe(true);
  });

  it("reads an Authorization value that has no Bearer prefix", () => {
    const parsed = parseProviderCode(`url = "https://integrate.api.nvidia.com/v1/chat/completions"
headers = { "Authorization": "${KEY}" }`);
    expect(parsed.apiKey).toBe(KEY);
  });

  it("reads the OpenAI SDK form NVIDIA also publishes", () => {
    const parsed = parseProviderCode(`from openai import OpenAI
client = OpenAI(base_url = "https://integrate.api.nvidia.com/v1", api_key = "${KEY}")
completion = client.chat.completions.create(model="nvidia/nemotron-3-super-120b-a12b", messages=[])`);
    expect(parsed).toMatchObject({ provider: "nvidia", model: "nvidia/nemotron-3-super-120b-a12b", apiKey: KEY });
  });

  it("reads curl with escaped JSON", () => {
    const parsed = parseProviderCode(`curl https://integrate.api.nvidia.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${KEY}" \\
  -d "{\\"model\\": \\"moonshotai/kimi-k2.6\\", \\"messages\\": []}"`);
    expect(parsed).toMatchObject({ provider: "nvidia", model: "moonshotai/kimi-k2.6", apiKey: KEY });
  });

  it("reads JavaScript fetch code", () => {
    const parsed = parseProviderCode(`fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  headers: { Authorization: 'Bearer ${KEY}' },
  body: JSON.stringify({ model: 'openai/gpt-oss-20b' }),
})`);
    expect(parsed).toMatchObject({ provider: "nvidia", model: "openai/gpt-oss-20b", apiKey: KEY });
  });

  it.each([
    "Bearer $NVIDIA_API_KEY",
    "Bearer $API_KEY_REQUIRED_IF_EXECUTING_OUTSIDE_NGC",
    "Bearer <YOUR_API_KEY>",
    "Bearer nvapi-your-key-here-please",
    "Bearer nvapi-xxxxxxxxxxxxxxxxxxxx",
  ])("does not accept %s as a key", (value) => {
    const parsed = parseProviderCode(`headers = { "Authorization": "${value}" }`);
    expect(parsed.apiKey).toBeNull();
    expect(parsed.keyIsPlaceholder).toBe(true);
  });

  it("does not read a key from an environment lookup", () => {
    expect(parseProviderCode(`api_key = os.environ["NVIDIA_API_KEY"]`).apiKey).toBeNull();
    expect(parseProviderCode('headers = {"Authorization": f"Bearer {api_key}"}').apiKey).toBeNull();
  });

  it("recognises Anthropic and other OpenAI-compatible endpoints", () => {
    const anthropic = parseProviderCode(`curl https://api.anthropic.com/v1/messages -H "x-api-key: sk-ant-api03-abcdefghijklmnop" -d '{"model": "claude-sonnet-5-5"}'`);
    expect(anthropic).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-ant-api03-abcdefghijklmnop" });

    const local = parseProviderCode(`client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")\nmodel = "llama3.3"`);
    expect(local).toMatchObject({ provider: "openai", apiUrl: "http://localhost:11434/v1", model: "llama3.3" });
  });

  it("prefers the API URL over documentation links", () => {
    const parsed = parseProviderCode(`# docs: https://build.nvidia.com/models
url = "https://integrate.api.nvidia.com/v1/chat/completions"`);
    expect(parsed.apiUrl).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("finds nothing in unrelated text", () => {
    expect(parseProviderCode("print('hello world')")).toMatchObject({ provider: null, model: null, apiKey: null, keyIsPlaceholder: false });
  });
});
