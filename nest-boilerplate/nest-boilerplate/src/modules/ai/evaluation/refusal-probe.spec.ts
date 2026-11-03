import { z } from "zod";
import { AppException } from "@/common/errors";
import { GroqProvider } from "@/modules/ai/groq.provider";
import type { ProviderObservation, StructuredTask } from "@/modules/ai/provider";
import { probingFetch } from "@/modules/ai/evaluation/refusal-probe";

// The evaluation probe that notes why the provider refused a request, on a mocked network only. It wraps the network function the
// adapter is given, so the adapter and its behaviour are exactly what production runs. The key is a synthetic string.
const KEY = "synthetic-test-key-0123456789";
const SECRET = "account acme-corp key sk-live-9999 request req_abc123";
const task: StructuredTask = {
  name: "demo_task",
  messages: [{ role: "system", content: "Return JSON." }, { role: "user", content: "TEXT=a small site" }],
  schema: { type: "object", additionalProperties: false, required: ["n"], properties: { n: { type: "number" } } },
};
const parse = (value: unknown) => z.strictObject({ n: z.number() }).parse(value);
const refusal = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
async function ask(response: Response) {
  const probe = probingFetch((async () => response) as unknown as typeof fetch);
  const groq = new GroqProvider({ apiKey: KEY, model: "openai/gpt-oss-20b" }, probe.fetch);
  const seen: ProviderObservation[] = [];
  let error: AppException | undefined;
  let value: unknown;
  try {
    value = await groq.structured(task, parse, new AbortController().signal, (o) => seen.push(o));
  } catch (e) {
    error = e as AppException;
  }
  return { error, value, note: probe.take(), seen };
}
const reason = (e: AppException | undefined) => (e?.details as { reason?: string } | undefined)?.reason;

describe("noting why the provider refused a request", () => {
  it("keeps the HTTP status and the error's code, and the adapter still fails exactly as before", async () => {
    const { error, note } = await ask(refusal(503, { error: { message: SECRET, type: "server_error", code: "over_capacity" } }));
    expect(reason(error)).toBe("PROVIDER_UNAVAILABLE");
    expect(error?.message).toBe("Hosted AI could not complete the request");
    expect(note).toEqual({ httpStatus: 503, errorCode: "over_capacity" });
  });

  it("falls back to the error's type when there is no usable code", async () => {
    expect((await ask(refusal(400, { error: { message: SECRET, type: "invalid_request_error" } }))).note?.errorCode).toBe("invalid_request_error");
    expect((await ask(refusal(400, { error: { type: "invalid_request_error", code: "has spaces" } }))).note?.errorCode).toBe("invalid_request_error");
    expect((await ask(refusal(400, { error: { code: 42, type: "x_y" } }))).note?.errorCode).toBe("x_y");
  });

  it("never keeps or repeats the provider's message, in the note or in the adapter's error", async () => {
    const { error, note, seen } = await ask(refusal(500, { error: { message: SECRET, code: "internal_error" } }));
    const all = JSON.stringify([error?.message, error?.details, note, seen]);
    expect(all).not.toMatch(/acme|sk-live|req_abc/);
    expect(all).not.toContain(KEY);
  });

  it("drops an identifier that is not a plain token, and keeps the status", async () => {
    for (const code of ["<script>alert(1)</script>", "two words", SECRET, "", "x".repeat(65), "line\nbreak"]) {
      const { note } = await ask(refusal(502, { error: { message: "m", code, type: 5 } }));
      expect(note).toEqual({ httpStatus: 502 });
    }
    expect((await ask(refusal(502, { error: { code: "x".repeat(64) } }))).note?.errorCode).toBe("x".repeat(64));
  });

  it("keeps only the status when the body is empty, not JSON, not an object or has no error", async () => {
    for (const body of ["", "<html>Bad gateway</html>", "null", "[1,2]", { ok: false }, { error: "plain string" }, { error: null }]) {
      const { error, note } = await ask(refusal(502, body));
      expect(reason(error)).toBe("PROVIDER_UNAVAILABLE");
      expect(note).toEqual({ httpStatus: 502 });
    }
  });

  it("reads at most a few kilobytes of a large error body", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024).fill(97));
        if (pulled >= 200) controller.close();
      },
    });
    const { note } = await ask(new Response(stream, { status: 503 }));
    expect(pulled).toBeLessThan(20);
    expect(note).toEqual({ httpStatus: 503 });
  });

  it("notes a rate limit and an authentication refusal, and the adapter reports them as it always did", async () => {
    const limited = await ask(refusal(429, { error: { code: "rate_limit_exceeded", message: SECRET } }, { "retry-after": "45" }));
    expect(limited.error?.code).toBe("RATE_LIMITED");
    expect(limited.note).toEqual({ httpStatus: 429, errorCode: "rate_limit_exceeded" });
    expect(limited.seen).toHaveLength(1);
    expect(limited.seen[0].retryAfterSeconds).toBe(45);
    const auth = await ask(refusal(401, { error: { code: "invalid_api_key", message: SECRET } }));
    expect(reason(auth.error)).toBe("PROVIDER_AUTH");
    expect(auth.note).toEqual({ httpStatus: 401, errorCode: "invalid_api_key" });
  });

  it("notes nothing for a request that succeeded, and passes the reply through untouched", async () => {
    const ok = new Response(JSON.stringify({ model: "openai/gpt-oss-20b", choices: [{ finish_reason: "stop", message: { content: '{"n":1}' } }] }));
    const { value, note, error } = await ask(ok);
    expect(error).toBeUndefined();
    expect(value).toEqual({ n: 1 });
    expect(note).toBeUndefined();
  });

  it("a note is for one request only: it is cleared when read, and by the next request", async () => {
    let status = 503;
    const probe = probingFetch((async () => (status === 503 ? refusal(503, { error: { code: "over_capacity" } }) : new Response("{}"))) as unknown as typeof fetch);
    await probe.fetch("https://example.test", {});
    expect(probe.take()).toEqual({ httpStatus: 503, errorCode: "over_capacity" });
    expect(probe.take()).toBeUndefined();
    await probe.fetch("https://example.test", {});
    status = 200;
    await probe.fetch("https://example.test", {});
    expect(probe.take()).toBeUndefined();
  });

  it("passes a failure of the network itself through unchanged", async () => {
    const boom = new TypeError("network down");
    const probe = probingFetch((async () => {
      throw boom;
    }) as unknown as typeof fetch);
    await expect(probe.fetch("https://example.test", {})).rejects.toBe(boom);
    expect(probe.take()).toBeUndefined();
  });
});
