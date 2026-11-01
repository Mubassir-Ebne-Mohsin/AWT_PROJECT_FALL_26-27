import { AI_CLAIMS, aiResultSchema } from "@/common/contracts/phase3/ai.schema";
import { AppException } from "@/common/errors";
import { GROQ_TRANSPORT_SCHEMA, GROQ_URL, GroqProvider } from "@/modules/ai/groq.provider";
import { FOUNDATION_PROMPT, HOSTED_DIGEST, explanationMessages, type ProviderObservation } from "@/modules/ai/provider";

// The hosted adapter is tested on a mocked network only: no request leaves the machine, and the key is a synthetic string.
const KEY = "synthetic-test-key-0123456789";
const settings = { apiKey: KEY, model: "openai/gpt-oss-20b" as const };
const facts = { verdict: "pass", p95Ms: 120, p95TargetMs: 300, evidenceIds: ["verdict", "latency", "errors"] };
const allowed = ["verdict", "latency", "errors"];
const good = { summary: "Latency and errors are within target.", evidenceIds: ["verdict", "latency"], claims: ["latency_within_target", "errors_within_budget"] };
const signal = () => new AbortController().signal;

const reply = (content: unknown, over: Record<string, unknown> = {}, choice: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      model: settings.model,
      choices: [{ finish_reason: "stop", message: { content: typeof content === "string" ? content : JSON.stringify(content) }, ...choice }],
      ...over,
    }),
  );
const provider = (response: Response | Error, model: "openai/gpt-oss-20b" | "openai/gpt-oss-120b" = settings.model) => {
  const transport = jest.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { transport, groq: new GroqProvider({ apiKey: KEY, model }, transport as unknown as typeof fetch) };
};
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppException;
  }
  throw new Error("expected a failure");
};
const details = (e: AppException) => e.details as Record<string, unknown>;

describe("Groq hosted provider", () => {
  describe("identity and capabilities", () => {
    it("is hosted: no host memory guard, always idle, nothing to unload, and names the configured model", async () => {
      const { groq } = provider(reply(good));
      expect(groq.kind).toBe("groq");
      expect(groq.needsHostMemory).toBe(false);
      expect(groq.model).toBe("openai/gpt-oss-20b");
      await expect(groq.idle()).resolves.toBe(true);
      await expect(groq.unload()).resolves.toBeUndefined();
      expect(provider(reply(good), "openai/gpt-oss-120b").groq.model).toBe("openai/gpt-oss-120b");
    });
    it("reports the model with an explicit no-digest marker, and makes no request to do so", async () => {
      const { groq, transport } = provider(reply(good));
      await expect(groq.identity()).resolves.toEqual({ name: "openai/gpt-oss-20b", digest: HOSTED_DIGEST });
      expect(transport).not.toHaveBeenCalled();
      expect(HOSTED_DIGEST).not.toMatch(/^[a-f0-9]{64}$/);
    });
    it("is unavailable, not silently ready, without a key; identity and generate send nothing", async () => {
      const transport = jest.fn();
      const groq = new GroqProvider({ apiKey: "", model: settings.model }, transport as unknown as typeof fetch);
      expect(details(await failure(groq.identity()))).toMatchObject({ reason: "PROVIDER_NOT_CONFIGURED" });
      const e = await failure(groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(e.code).toBe("UNAVAILABLE");
      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe("the request", () => {
    it("goes to the fixed Groq endpoint with the key in the header only, never following a redirect", async () => {
      const { groq, transport } = provider(reply(good));
      await groq.generate(facts, allowed, HOSTED_DIGEST, signal());
      const [url, options] = transport.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(GROQ_URL).toBe(url);
      expect(options.method).toBe("POST");
      expect(options.redirect).toBe("error");
      expect(options.headers.Authorization).toBe(`Bearer ${KEY}`);
      expect(String(options.body)).not.toContain(KEY);
    });
    it("asks for one short, non-streamed, strictly typed answer with no reasoning text", async () => {
      const { groq, transport } = provider(reply(good));
      await groq.generate(facts, allowed, HOSTED_DIGEST, signal());
      const body = JSON.parse(String((transport.mock.calls[0] as unknown as [string, RequestInit])[1].body));
      expect(body).toMatchObject({
        model: "openai/gpt-oss-20b",
        stream: false,
        temperature: 0,
        seed: 42,
        reasoning_effort: "low",
        include_reasoning: false,
        max_completion_tokens: 2048,
        response_format: { type: "json_schema", json_schema: { name: "explanation", strict: true, schema: GROQ_TRANSPORT_SCHEMA } },
      });
      expect(body.tools).toBeUndefined();
    });
    it("sends the same instruction and facts every provider gets, so models are compared and not prompts", async () => {
      const { groq, transport } = provider(reply(good));
      await groq.generate(facts, allowed, HOSTED_DIGEST, signal());
      const body = JSON.parse(String((transport.mock.calls[0] as unknown as [string, RequestInit])[1].body));
      expect(body.messages).toEqual(explanationMessages(facts));
      expect(body.messages[0].content).toBe(FOUNDATION_PROMPT);
      expect(body.messages[1].content).toBe("FACTS=" + JSON.stringify(facts));
    });
    it("sends the model it was configured with", async () => {
      const { groq, transport } = provider(reply(good, { model: "openai/gpt-oss-120b" }), "openai/gpt-oss-120b");
      await groq.generate(facts, allowed, HOSTED_DIGEST, signal());
      expect(JSON.parse(String((transport.mock.calls[0] as unknown as [string, RequestInit])[1].body)).model).toBe("openai/gpt-oss-120b");
    });
    it("refuses a request over the size bound without sending it", async () => {
      const { groq, transport } = provider(reply(good));
      const e = await failure(groq.generate({ ...facts, padding: "x".repeat(13000) }, allowed, HOSTED_DIGEST, signal()));
      expect(e.code).toBe("VALIDATION_FAILED");
      expect(details(e)).toMatchObject({ reason: "AI_CONTEXT_TOO_LARGE" });
      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe("the strict transport schema", () => {
    it("meets Groq's strict-mode rules: every property required, no extras, no optional fields", () => {
      const s = GROQ_TRANSPORT_SCHEMA;
      expect(s.additionalProperties).toBe(false);
      expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
      expect(JSON.stringify(s)).not.toContain("$schema");
    });
    it("matches the application schema: same fields, and claims limited to the claims the server can check", () => {
      expect(Object.keys(GROQ_TRANSPORT_SCHEMA.properties).sort()).toEqual(Object.keys(aiResultSchema.shape).sort());
      expect(GROQ_TRANSPORT_SCHEMA.properties.claims.items.enum).toEqual([...AI_CLAIMS]);
    });
  });

  describe("accepting an answer", () => {
    it("returns the typed result when every check passes", async () => {
      await expect(provider(reply(good)).groq.generate(facts, allowed, HOSTED_DIGEST, signal())).resolves.toEqual(good);
    });
    it.each([
      ["cites evidence that was not supplied", { ...good, evidenceIds: ["verdict", "invented"] }],
      ["names a claim the server cannot check", { ...good, claims: ["the_model_is_perfect"] }],
      ["has an empty summary", { ...good, summary: "   " }],
      ["has a summary over the bound", { ...good, summary: "x".repeat(501) }],
      ["cites no evidence", { ...good, evidenceIds: [] }],
      ["adds an unexpected field", { ...good, extra: true }],
      ["is not an object", "just words"],
    ])("rejects an answer that %s", async (_name, content) => {
      const e = await failure(provider(reply(content)).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(e.code).toBe("VALIDATION_FAILED");
      expect(details(e)).toMatchObject({ reason: "INVALID_OUTPUT" });
    });
    it.each([
      ["was cut off", { finish_reason: "length" }],
      ["stopped for another reason", { finish_reason: "content_filter" }],
      ["was refused", { message: { content: null, refusal: "I cannot help with that." } }],
      ["has no content", { message: { content: null } }],
      ["carries a refusal even though it also has content", { message: { content: JSON.stringify(good), refusal: "I cannot help with that." } }],
    ])("rejects a reply that %s", async (_name, choice) => {
      const e = await failure(provider(reply(good, {}, choice)).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(e.code).toBe("VALIDATION_FAILED");
      expect(details(e)).toMatchObject({ reason: "INVALID_OUTPUT" });
    });
    it("rejects a reply that is not the expected envelope", async () => {
      const twoChoices = JSON.stringify({ model: settings.model, choices: [{ finish_reason: "stop", message: { content: "{}" } }, { finish_reason: "stop", message: { content: "{}" } }] });
      for (const response of [new Response("<html>gateway</html>"), new Response(JSON.stringify({ model: settings.model, choices: [] })), new Response(twoChoices)]) {
        const e = await failure(provider(response).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
        expect(details(e)).toMatchObject({ reason: "INVALID_OUTPUT" });
      }
    });
    it("rejects a reply over the response bound, even when it would otherwise be a valid answer", async () => {
      const e = await failure(provider(new Response("x".repeat(70000))).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(details(e)).toMatchObject({ reason: "INVALID_OUTPUT" });
      const padded = JSON.stringify({ model: settings.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(good) } }], padding: "x".repeat(70000) });
      const big = await failure(provider(new Response(padded)).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(big.code).toBe("VALIDATION_FAILED");
      expect(details(big)).toMatchObject({ reason: "INVALID_OUTPUT" });
      // The same answer within the bound is accepted, so the bound is what rejected it.
      const small = JSON.stringify({ model: settings.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(good) } }], padding: "x".repeat(100) });
      await expect(provider(new Response(small)).groq.generate(facts, allowed, HOSTED_DIGEST, signal())).resolves.toEqual(good);
    });
    it("reports a different model than the one configured as a changed model, not as bad output", async () => {
      const e = await failure(provider(reply(good, { model: "openai/gpt-oss-120b" })).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(e.code).toBe("UNAVAILABLE");
      expect(details(e)).toMatchObject({ reason: "MODEL_CHANGED" });
    });
  });

  describe("what it reports about each request", () => {
    const usage = { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 };
    const watch = () => {
      const seen: ProviderObservation[] = [];
      return { seen, observe: (o: ProviderObservation) => void seen.push(o) };
    };
    it("reports the model, the tokens and the time as soon as a reply is understood", async () => {
      const { seen, observe } = watch();
      await provider(reply(good, { usage })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), observe);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ returnedModel: "openai/gpt-oss-20b", usage: { promptTokens: 400, completionTokens: 120, totalTokens: 520 } });
      expect(seen[0].latencyMs).toBeGreaterThanOrEqual(0);
      expect(seen[0].retryAfterSeconds).toBeUndefined();
    });
    it("reports the tokens of an answer it then rejects, because they were spent", async () => {
      const { seen, observe } = watch();
      const e = await failure(provider(reply({ ...good, evidenceIds: ["invented"] }, { usage })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), observe));
      expect(details(e)).toMatchObject({ reason: "INVALID_OUTPUT" });
      expect(seen[0].usage).toEqual({ promptTokens: 400, completionTokens: 120, totalTokens: 520 });
    });
    it("reports the reply text and why it stopped, even when the answer is then rejected, so a rejection can be explained", async () => {
      const ok = watch();
      await provider(reply(good, { usage })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), ok.observe);
      expect(ok.seen[0]).toMatchObject({ finishReason: "stop", rawReply: JSON.stringify(good) });
      const bad = watch();
      await failure(provider(reply({ ...good, evidenceIds: ["invented"] }, { usage })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), bad.observe));
      expect(JSON.parse(bad.seen[0].rawReply as string).evidenceIds).toEqual(["invented"]);
      const cut = watch();
      await failure(provider(reply(good, { usage }, { finish_reason: "length" })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), cut.observe));
      expect(cut.seen[0].finishReason).toBe("length");
    });
    it("bounds the reply text it reports", async () => {
      const { seen, observe } = watch();
      await failure(provider(reply("x".repeat(10_000), { usage })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), observe));
      expect((seen[0].rawReply as string).length).toBe(4096);
    });
    it("reports the model it actually got when that is not the one configured", async () => {
      const { seen, observe } = watch();
      await failure(provider(reply(good, { model: "openai/gpt-oss-120b", usage })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), observe));
      expect(seen[0].returnedModel).toBe("openai/gpt-oss-120b");
    });
    it("never invents token figures when the provider sends none", async () => {
      const { seen, observe } = watch();
      await provider(reply(good)).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), observe);
      expect(seen[0].usage).toBeUndefined();
      expect(seen[0].returnedModel).toBe("openai/gpt-oss-20b");
    });
    it("rejects token figures that are not whole non-negative numbers, without reporting them", async () => {
      const { seen, observe } = watch();
      const e = await failure(provider(reply(good, { usage: { prompt_tokens: -1, completion_tokens: 1.5, total_tokens: "x" } })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), observe));
      expect(details(e)).toMatchObject({ reason: "INVALID_OUTPUT" });
      expect(seen).toHaveLength(0);
    });
    it("reports how long to wait on a quota refusal, and only then", async () => {
      const limited = watch();
      await failure(provider(new Response("", { status: 429, headers: { "retry-after": "45" } })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), limited.observe));
      expect(limited.seen).toHaveLength(1);
      expect(limited.seen[0].retryAfterSeconds).toBe(45);
      const other = watch();
      await failure(provider(new Response("", { status: 500 })).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), other.observe));
      expect(other.seen).toHaveLength(0);
    });
    it("reports nothing for a reply it cannot understand or a request it never sent", async () => {
      const garbage = watch();
      await failure(provider(new Response("<html>gateway</html>")).groq.generate(facts, allowed, HOSTED_DIGEST, signal(), garbage.observe));
      expect(garbage.seen).toHaveLength(0);
      const unsent = watch();
      const groq = new GroqProvider({ apiKey: "", model: settings.model }, jest.fn() as unknown as typeof fetch);
      await failure(groq.generate(facts, allowed, HOSTED_DIGEST, signal(), unsent.observe));
      expect(unsent.seen).toHaveLength(0);
    });
  });

  describe("failures at the provider", () => {
    it("surfaces quota backoff with the retry time, capped, and never retries", async () => {
      const { groq, transport } = provider(new Response("private upstream message", { status: 429, headers: { "retry-after": "60" } }));
      const e = await failure(groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(e.code).toBe("RATE_LIMITED");
      expect(details(e)).toMatchObject({ reason: "PROVIDER_RATE_LIMITED", retryAfterSeconds: 60 });
      expect(transport).toHaveBeenCalledTimes(1);
      const capped = await failure(provider(new Response("", { status: 429, headers: { "retry-after": "999999" } })).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(details(capped).retryAfterSeconds).toBe(86400);
    });
    it("omits the retry time when the header is missing, zero, negative or not a number", async () => {
      for (const header of [undefined, "0", "-5", "Wed, 21 Oct 2026 07:28:00 GMT"]) {
        const e = await failure(provider(new Response("", { status: 429, headers: header === undefined ? {} : { "retry-after": header } })).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
        expect(e.code).toBe("RATE_LIMITED");
        expect(details(e).retryAfterSeconds).toBeUndefined();
      }
    });
    it.each([
      [401, "PROVIDER_AUTH"],
      [403, "PROVIDER_AUTH"],
      [400, "PROVIDER_UNAVAILABLE"],
      [500, "PROVIDER_UNAVAILABLE"],
      [503, "PROVIDER_UNAVAILABLE"],
    ])("maps HTTP %i to %s without repeating what the provider said", async (status, reason) => {
      const e = await failure(provider(new Response(`secret detail for key ${KEY}`, { status })).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(e.code).toBe("UNAVAILABLE");
      expect(details(e)).toMatchObject({ reason });
      expect(JSON.stringify([e.message, e.details])).not.toMatch(/secret detail/);
    });
    it("lets a network failure through unchanged, so the service reports the provider as unavailable", async () => {
      const boom = new TypeError("fetch failed");
      const e = await failure(provider(boom).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
      expect(e).toBe(boom);
      expect(e).not.toBeInstanceOf(AppException);
    });
    it("does not disguise an abort during the read as bad output", async () => {
      const controller = new AbortController();
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("{"));
        },
        pull() {
          controller.abort();
          throw new Error("aborted");
        },
      });
      const e = await failure(provider(new Response(stream)).groq.generate(facts, allowed, HOSTED_DIGEST, controller.signal));
      expect(e).not.toBeInstanceOf(AppException);
    });
    it("never puts the key in an error message or its details, whatever the failure", async () => {
      const responses = [new Response("x", { status: 401 }), new Response("x", { status: 429 }), new Response("x", { status: 500 }), reply(good, { model: "other" }), reply("nonsense"), new Response("x".repeat(70000))];
      for (const response of responses) {
        const e = await failure(provider(response).groq.generate(facts, allowed, HOSTED_DIGEST, signal()));
        expect(JSON.stringify([e.message, e.details])).not.toContain(KEY);
      }
    });
  });
});
