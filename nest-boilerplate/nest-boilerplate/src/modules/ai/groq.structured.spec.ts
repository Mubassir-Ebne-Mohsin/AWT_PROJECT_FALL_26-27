import { z } from "zod";
import { AppException } from "@/common/errors";
import { GROQ_TASK_MAX_COMPLETION_TOKENS, GROQ_URL, GroqProvider } from "@/modules/ai/groq.provider";
import { isStructuredProvider, type ProviderObservation, type StructuredTask } from "@/modules/ai/provider";

// The task path of the hosted adapter, on a mocked network only. The key is a synthetic string.
const KEY = "synthetic-test-key-0123456789";
const task: StructuredTask = {
  name: "demo_task",
  messages: [
    { role: "system", content: "Return JSON." },
    { role: "user", content: "TEXT=a small site" },
  ],
  schema: { type: "object", additionalProperties: false, required: ["n"], properties: { n: { type: "number" } } },
};
const parse = (value: unknown) => z.strictObject({ n: z.number().min(0).max(10) }).parse(value);
const signal = () => new AbortController().signal;
const reply = (content: unknown, over: Record<string, unknown> = {}, choice: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "openai/gpt-oss-20b", choices: [{ finish_reason: "stop", message: { content: typeof content === "string" ? content : JSON.stringify(content) }, ...choice }], ...over }));
const make = (response: Response | Error, apiKey = KEY) => {
  const transport = jest.fn(async (_url: string, _init: RequestInit) => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { transport, groq: new GroqProvider({ apiKey, model: "openai/gpt-oss-20b" }, transport as unknown as typeof fetch) };
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
const body = (t: { mock: { calls: unknown[][] } }) => JSON.parse((t.mock.calls[0] as [string, RequestInit])[1].body as string);

describe("Groq structured tasks", () => {
  it("is offered as a structured provider", () => {
    expect(isStructuredProvider(make(reply({ n: 1 })).groq)).toBe(true);
    expect(isStructuredProvider({ generate: () => undefined })).toBe(false);
    expect(isStructuredProvider(null)).toBe(false);
  });

  it("sends the task's messages and schema in strict mode with the safe settings, to the fixed address, without following redirects", async () => {
    const { groq, transport } = make(reply({ n: 3 }));
    expect(await groq.structured(task, parse, signal())).toEqual({ n: 3 });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(GROQ_URL);
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer " + KEY);
    const sent = body(transport);
    expect(sent).toMatchObject({ model: "openai/gpt-oss-20b", stream: false, temperature: 0, seed: 42, reasoning_effort: "low", include_reasoning: false, max_completion_tokens: GROQ_TASK_MAX_COMPLETION_TOKENS });
    expect(sent.messages).toEqual(task.messages);
    expect(sent.response_format).toEqual({ type: "json_schema", json_schema: { name: "demo_task", strict: true, schema: task.schema } });
    expect(GROQ_TASK_MAX_COMPLETION_TOKENS).toBe(1024);
  });

  it("uses the task's own output cap when it sets one", async () => {
    const { groq, transport } = make(reply({ n: 1 }));
    await groq.structured({ ...task, maxCompletionTokens: 300 }, parse, signal());
    expect(body(transport).max_completion_tokens).toBe(300);
  });

  it("refuses without a key, and without a request, when the hosted provider is not configured", async () => {
    const { groq, transport } = make(reply({ n: 1 }), "");
    expect(details(await failure(groq.structured(task, parse, signal())))).toMatchObject({ reason: "PROVIDER_NOT_CONFIGURED" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("refuses an oversized request before any request is made", async () => {
    const { groq, transport } = make(reply({ n: 1 }));
    const big = { ...task, messages: [{ role: "user" as const, content: "x".repeat(13000) }] };
    expect(details(await failure(groq.structured(big, parse, signal())))).toMatchObject({ reason: "AI_CONTEXT_TOO_LARGE" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("applies the caller's validation: an answer the parser rejects is invalid output, and the tokens are still reported", async () => {
    const seen: ProviderObservation[] = [];
    const { groq } = make(reply({ n: 99 }, { usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }));
    const e = await failure(groq.structured(task, parse, signal(), (o) => void seen.push(o)));
    expect(details(e)).toMatchObject({ reason: "INVALID_OUTPUT" });
    expect(seen[0]).toMatchObject({ usage: { totalTokens: 110 }, returnedModel: "openai/gpt-oss-20b", finishReason: "stop", rawReply: '{"n":99}' });
  });

  it("lets a parser's own application error through unchanged", async () => {
    const { groq } = make(reply({ n: 1 }));
    const own = new AppException("VALIDATION_FAILED", "Out of range", { reason: "OUT_OF_RANGE" });
    const e = await failure(
      groq.structured(task, () => {
        throw own;
      }, signal()),
    );
    expect(e).toBe(own);
  });

  it.each([
    ["not JSON", () => reply("not json")],
    ["cut off at the length limit", () => reply({ n: 1 }, {}, { finish_reason: "length" })],
    ["a refusal", () => reply({ n: 1 }, {}, { message: { content: JSON.stringify({ n: 1 }), refusal: "no" } })],
    ["empty content", () => reply("", {}, { message: { content: null } })],
    ["a body over the size bound", () => new Response("x".repeat(70000))],
  ])("treats %s as invalid output", async (_name, response) => {
    const e = await failure(make(response()).groq.structured(task, parse, signal()));
    expect(details(e)).toMatchObject({ reason: "INVALID_OUTPUT" });
  });

  it("maps provider failures the same way as explanations, with the wait time on a rate limit", async () => {
    const limited = await failure(make(new Response("", { status: 429, headers: { "retry-after": "45" } })).groq.structured(task, parse, signal()));
    expect(limited.code).toBe("RATE_LIMITED");
    expect(details(limited)).toMatchObject({ reason: "PROVIDER_RATE_LIMITED", retryAfterSeconds: 45 });
    expect(details(await failure(make(new Response("", { status: 401 })).groq.structured(task, parse, signal())))).toMatchObject({ reason: "PROVIDER_AUTH" });
    expect(details(await failure(make(new Response("", { status: 503 })).groq.structured(task, parse, signal())))).toMatchObject({ reason: "PROVIDER_UNAVAILABLE" });
    expect(details(await failure(make(reply({ n: 1 }, { model: "openai/gpt-oss-120b" })).groq.structured(task, parse, signal())))).toMatchObject({ reason: "MODEL_CHANGED" });
  });

  it("does not disguise a cancelled request as bad output", async () => {
    const controller = new AbortController();
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { groq } = make(abort);
    controller.abort();
    await expect(groq.structured(task, parse, controller.signal)).rejects.toBe(abort);
  });

  it("never puts the key in an error", async () => {
    for (const response of [new Response("", { status: 401 }), new Response("", { status: 500 }), reply("nope")]) {
      const e = await failure(make(response).groq.structured(task, parse, signal()));
      expect(JSON.stringify([e.message, e.details])).not.toContain(KEY);
    }
  });
});
