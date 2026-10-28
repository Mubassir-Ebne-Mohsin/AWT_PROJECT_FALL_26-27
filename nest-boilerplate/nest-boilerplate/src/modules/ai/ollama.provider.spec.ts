import {
  OllamaProvider,
  FOUNDATION_PROMPT,
} from "@/modules/ai/ollama.provider";
import type { AiSettings } from "@/modules/ai/ai.settings";
const settings: AiSettings = {
  enabled: true,
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen2.5:1.5b",
  deadlineMs: 1000,
  minFreeMiB: 1536,
  minCommitMiB: 4096,
};
const digest = "a".repeat(64);
const valid = {
  model: settings.model,
  done: true,
  done_reason: "stop",
  message: {
    content: JSON.stringify({
      summary: "The recorded model passes.",
      evidenceIds: ["verdict"],
    }),
  },
};
describe("M11 bounded local provider", () => {
  const transport = jest.fn() as jest.MockedFunction<typeof fetch>;
  const provider = new OllamaProvider(settings, transport);
  beforeEach(() => transport.mockReset());
  it("uses fixed local URLs, no redirects, structured short generation and immutable digest", async () => {
    transport
      .mockResolvedValueOnce(new Response(JSON.stringify(valid)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ models: [{ name: settings.model, digest }] }),
        ),
      );
    await expect(
      provider.generate(
        { verdict: "pass" },
        ["verdict"],
        digest,
        AbortSignal.timeout(2000),
      ),
    ).resolves.toEqual({
      summary: "The recorded model passes.",
      evidenceIds: ["verdict"],
    });
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe(settings.baseUrl + "/api/chat");
    expect(options?.redirect).toBe("error");
    expect(JSON.parse(options!.body as string)).toMatchObject({
      stream: false,
      keep_alive: 0,
      options: { num_ctx: 2048, num_predict: 256 },
    });
  });
  it.each(["length", "missing"])(
    "rejects incomplete output: %s",
    async (reason) => {
      transport.mockResolvedValue(
        new Response(JSON.stringify({ ...valid, done_reason: reason })),
      );
      await expect(
        provider.generate({}, ["verdict"], digest, AbortSignal.timeout(1000)),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    },
  );
  it("rejects malformed JSON, schema deviations, and invented evidence", async () => {
    for (const content of [
      "not json",
      JSON.stringify({
        summary: "text",
        evidenceIds: ["secret"],
        ownerId: "forged",
      }),
      JSON.stringify({ summary: "text", evidenceIds: ["secret"] }),
    ]) {
      transport.mockResolvedValue(
        new Response(JSON.stringify({ ...valid, message: { content } })),
      );
      await expect(
        provider.generate({}, ["verdict"], digest, AbortSignal.timeout(1000)),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
  });
  it("rejects oversized request/response without silently trimming", async () => {
    expect(FOUNDATION_PROMPT.length).toBeLessThan(500);
    await expect(
      provider.generate(
        { data: "x".repeat(2000) },
        ["verdict"],
        digest,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValue(new Response("x".repeat(17000)));
    await expect(
      provider.generate({}, ["verdict"], digest, AbortSignal.timeout(1000)),
    ).rejects.toThrow("too large");
  });
  it("rejects a changed model instead of recording false provenance", async () => {
    transport
      .mockResolvedValueOnce(new Response(JSON.stringify(valid)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [{ name: settings.model, digest: "b".repeat(64) }],
          }),
        ),
      );
    await expect(
      provider.generate({}, ["verdict"], digest, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ details: { reason: "MODEL_CHANGED" } });
  });
  it("does not call an installed-model probe that would load a model", async () => {
    transport.mockImplementation(
      async () => new Response(JSON.stringify({ models: [] })),
    );
    expect(await provider.metadata()).toBeNull();
    expect(await provider.idle()).toBe(true);
    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      settings.baseUrl + "/api/tags",
      settings.baseUrl + "/api/ps",
    ]);
  });
});
