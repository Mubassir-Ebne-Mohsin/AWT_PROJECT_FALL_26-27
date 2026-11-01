import { z } from "zod";
import { AppException } from "@/common/errors";
import { AI_CLAIMS, aiResultSchema, AiResult } from "@/common/contracts/phase3/ai.schema";
import { ExplanationProvider, HOSTED_DIGEST, ModelIdentity, ProviderObservation, explanationMessages } from "@/modules/ai/provider";

// Hosted explanation transport (Groq). It turns verified facts into a typed result, or fails. Admission, ownership, durable jobs,
// grounding and claim checking stay with AiService. Reviewed from the first draft; what changed and why is in docs/AI-RESUME-SCOPE.md.

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export type GroqModel = "openai/gpt-oss-20b" | "openai/gpt-oss-120b";
export interface GroqSettings {
  apiKey: string;
  model: GroqModel;
}

/**
 * The schema sent to Groq in strict mode. Groq's rules for strict output are that every property is required and every object
 * sets additionalProperties false (optional fields are not supported), so this is written by hand rather than generated from the
 * application schema, whose `claims` is optional. Bounds (lengths, counts) are enforced on our side by aiResultSchema after the
 * reply arrives, and a test ties this schema to that one.
 */
export const GROQ_TRANSPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "evidenceIds", "claims"],
  properties: {
    summary: { type: "string" },
    evidenceIds: { type: "array", items: { type: "string" } },
    claims: { type: "array", items: { type: "string", enum: [...AI_CLAIMS] } },
  },
} as const;

/** The most tokens one answer may use. Counted in full against the quota until the provider reports what was really used. */
export const GROQ_MAX_COMPLETION_TOKENS = 2048;
const MAX_REQUEST_BYTES = 12000;
const MAX_RESPONSE_BYTES = 65536;
const unavailable = (message: string, reason: string, extra: Record<string, unknown> = {}) => new AppException("UNAVAILABLE", message, { reason, ...extra });
const invalid = (message: string) => new AppException("VALIDATION_FAILED", message, { reason: "INVALID_OUTPUT" });

const count = z.number().int().nonnegative();
const replySchema = z.object({
  model: z.string(),
  usage: z.object({ prompt_tokens: count, completion_tokens: count, total_tokens: count }).optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({ content: z.string().nullable(), refusal: z.string().nullish() }),
      }),
    )
    .length(1),
});

export class GroqProvider implements ExplanationProvider {
  readonly kind = "groq" as const;
  /** Inference runs at Groq, so the host memory guards do not apply. */
  readonly needsHostMemory = false;
  get model() {
    return this.settings.model;
  }

  constructor(
    private readonly settings: GroqSettings,
    private readonly transport: typeof fetch = fetch,
  ) {}

  /** The configured model. Makes no request: readiness must not spend quota, and Groq exposes no digest to record. */
  async identity(): Promise<ModelIdentity | null> {
    if (!this.settings.apiKey) throw unavailable("Hosted AI is not configured", "PROVIDER_NOT_CONFIGURED");
    return { name: this.settings.model, digest: HOSTED_DIGEST };
  }

  /** A hosted provider has no local runner that another client could be using. */
  async idle() {
    return true;
  }

  /** Nothing is held locally; an aborted request is only abandoned, not proven cancelled at Groq. */
  async unload() {
    return undefined;
  }

  async generate(facts: Record<string, unknown>, allowed: string[], _digest: string, signal: AbortSignal, observe?: (observation: ProviderObservation) => void): Promise<AiResult> {
    if (!this.settings.apiKey) throw unavailable("Hosted AI is not configured", "PROVIDER_NOT_CONFIGURED");
    const messages = explanationMessages(facts);
    if (Buffer.byteLength(JSON.stringify(messages), "utf8") > MAX_REQUEST_BYTES)
      throw new AppException("VALIDATION_FAILED", "Explanation context is too large", { reason: "AI_CONTEXT_TOO_LARGE" });

    const started = performance.now();
    const res = await this.transport(GROQ_URL, {
      method: "POST",
      redirect: "error",
      signal,
      headers: { Authorization: `Bearer ${this.settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        stream: false,
        // Repeatable as far as the provider allows; the seed is best effort.
        temperature: 0,
        seed: 42,
        // A short answer needs little reasoning; the reasoning text is not returned or stored.
        reasoning_effort: "low",
        include_reasoning: false,
        max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
        response_format: { type: "json_schema", json_schema: { name: "explanation", strict: true, schema: GROQ_TRANSPORT_SCHEMA } },
      }),
    });

    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after"));
        observe?.({ latencyMs: Math.round(performance.now() - started), ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: Math.min(retry, 86400) } : {}) });
        throw new AppException("RATE_LIMITED", "Hosted AI quota is temporarily exhausted", {
          reason: "PROVIDER_RATE_LIMITED",
          ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: Math.min(retry, 86400) } : {}),
        });
      }
      // Never repeat the upstream message: it can contain account or request detail.
      throw unavailable("Hosted AI could not complete the request", res.status === 401 || res.status === 403 ? "PROVIDER_AUTH" : "PROVIDER_UNAVAILABLE");
    }
    if (!res.body) throw unavailable("Hosted AI returned no response", "PROVIDER_UNAVAILABLE");

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > MAX_RESPONSE_BYTES) throw invalid("Hosted AI response is too large");
        chunks.push(chunk.value);
      }
      const reply = replySchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const choice = reply.choices[0];
      // Reported as soon as a reply is understood, before it is judged: the tokens were spent whether or not the answer is accepted.
      observe?.({
        returnedModel: reply.model,
        finishReason: choice.finish_reason,
        ...(typeof choice.message.content === "string" ? { rawReply: choice.message.content.slice(0, 4096) } : {}),
        latencyMs: Math.round(performance.now() - started),
        ...(reply.usage ? { usage: { promptTokens: reply.usage.prompt_tokens, completionTokens: reply.usage.completion_tokens, totalTokens: reply.usage.total_tokens } } : {}),
      });
      if (reply.model !== this.settings.model) throw unavailable("The configured model changed during generation", "MODEL_CHANGED");
      if (choice.finish_reason !== "stop" || choice.message.refusal || choice.message.content === null) throw invalid("Hosted AI did not complete the answer");
      const result = aiResultSchema.parse(JSON.parse(choice.message.content));
      if (result.evidenceIds.some((id) => !allowed.includes(id))) throw invalid("Hosted AI cited evidence that was not supplied");
      return result;
    } catch (error) {
      // A deadline or cancel aborts the read; the service already knows why, so do not disguise it as bad output.
      if (error instanceof AppException || signal.aborted) throw error;
      throw invalid("Hosted AI returned an unusable explanation");
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
}
