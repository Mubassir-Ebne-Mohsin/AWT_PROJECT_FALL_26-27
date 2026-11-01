import { AiSettings } from "@/modules/ai/ai.settings";
import { GroqProvider } from "@/modules/ai/groq.provider";
import { selectProvider } from "@/modules/ai/provider.factory";
import type { ExplanationProvider } from "@/modules/ai/provider";

const base: AiSettings = { enabled: true, baseUrl: "http://127.0.0.1:11434", model: "qwen2.5:1.5b", deadlineMs: 60000, minFreeMiB: 1536, minCommitMiB: 4096 };
const ollama = { kind: "ollama", model: "qwen2.5:1.5b", needsHostMemory: true } as unknown as ExplanationProvider;
const fetcher = jest.fn() as unknown as typeof fetch;

describe("provider selection", () => {
  it("uses the local provider unless a hosted one is asked for, including when nothing is said", () => {
    expect(selectProvider(base, ollama, { apiKey: "" }, fetcher)).toBe(ollama);
    expect(selectProvider({ ...base, provider: "ollama" }, ollama, { apiKey: "k" }, fetcher)).toBe(ollama);
  });
  it("uses Groq, with the configured model and the key from the credentials, when it is asked for", () => {
    const chosen = selectProvider({ ...base, provider: "groq", model: "openai/gpt-oss-120b" }, ollama, { apiKey: "k" }, fetcher);
    expect(chosen).toBeInstanceOf(GroqProvider);
    expect(chosen.kind).toBe("groq");
    expect(chosen.model).toBe("openai/gpt-oss-120b");
    expect(chosen.needsHostMemory).toBe(false);
  });
  it("never falls back to the local model when Groq is asked for without a key: it stays hosted and says it is not configured", async () => {
    const chosen = selectProvider({ ...base, provider: "groq", model: "openai/gpt-oss-20b" }, ollama, { apiKey: "" }, fetcher);
    expect(chosen).not.toBe(ollama);
    expect(chosen.kind).toBe("groq");
    await expect(chosen.identity()).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
  it("sends nothing at selection time", () => {
    selectProvider({ ...base, provider: "groq", model: "openai/gpt-oss-20b" }, ollama, { apiKey: "k" }, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
