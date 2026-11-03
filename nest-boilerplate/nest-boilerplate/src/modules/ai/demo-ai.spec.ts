import { readFileSync } from "node:fs";
import { join } from "node:path";
import { envSchema } from "@/config/app.config";
import { AiService } from "@/modules/ai/ai.service";
import { applyDemoEnv, DEMO_AI_ENV, DEMO_AI_MODEL } from "@/modules/ai/demo-env";
import { demoProblems, demoSummary } from "@/modules/ai/demo-check";

// The demo setup: exactly the three AI design tasks on and nothing else AI on, forced over whatever the environment says, with a check
// that cannot leak the key. Nothing here sends a request.
const KEY = "SECRET-KEY-do-not-print-0123456789";
const base: Record<string, string> = {
  DB_USER: "test",
  DB_PASSWORD: "test-db-password-VALUE",
  DB_DATABASE: "test",
  JWT_ACCESS_SECRET: "test-access-012345678901234567890123",
  JWT_REFRESH_SECRET: "test-refresh-012345678901234567890123",
  GROQ_API_KEY: KEY,
};
const demo = (over: Record<string, string | undefined> = {}) => {
  const env: Record<string, string | undefined> = { ...base };
  applyDemoEnv(env);
  return { ...env, ...over };
};
const here = (p: string) => readFileSync(join(__dirname, p), "utf8");

describe("the demo settings", () => {
  it("are exactly: AI on, the Groq provider, only the three design tasks, explanations off, and the model they were tested with", () => {
    expect(DEMO_AI_ENV).toEqual({ AI_ENABLED: "true", AI_PROVIDER: "groq", AI_FEATURES: "fixes,describe,whatif", AI_EXPLANATIONS: "false", GROQ_MODEL: "openai/gpt-oss-120b" });
    expect(DEMO_AI_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("replace whatever the environment already says, and touch nothing else, the key included", () => {
    const env: Record<string, string | undefined> = { ...base, AI_ENABLED: "false", AI_PROVIDER: "ollama", AI_FEATURES: "describe,whatif", AI_EXPLANATIONS: "true", GROQ_MODEL: "openai/gpt-oss-20b", PORT: "5001", OTHER: "x" };
    applyDemoEnv(env);
    expect(env).toMatchObject({ ...DEMO_AI_ENV, GROQ_API_KEY: KEY, PORT: "5001", OTHER: "x", DB_USER: "test" });
  });

  it("are applied by a file that imports nothing, so they are in place before the configuration is first read", () => {
    const source = here("demo-env.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/require\(/);
  });

  it("are put in place first by every demo script: the environment import is the first line of code", () => {
    for (const file of ["../../script/demo-ai.ts", "../../script/demo-ai-check.ts"]) {
      const code = here(file).split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
      expect(code[0].trim()).toBe('import "./demo-ai-env";');
    }
    const env = here("../../script/demo-ai-env.ts");
    expect(env).toContain("dotenv.config(");
    expect(env.indexOf("dotenv.config(")).toBeLessThan(env.indexOf("applyDemoEnv();"));
  });

  it("start the API only after the check, and never when it finds a problem", () => {
    const launcher = here("../../script/demo-ai.ts");
    expect(launcher.indexOf("demoProblems(process.env)")).toBeLessThan(launcher.indexOf('require("../main")'));
    expect(launcher).toMatch(/if \(problems\.length\) \{[\s\S]*process\.exit\(2\);[\s\S]*\}[\s\S]*require\("\.\.\/main"\)/);
  });
});

describe("the demo check", () => {
  it("finds nothing wrong with a complete demo environment", () => {
    expect(demoProblems(demo())).toEqual([]);
  });

  it("says when the key is missing or blank", () => {
    for (const GROQ_API_KEY of [undefined, "", "   "]) expect(demoProblems(demo({ GROQ_API_KEY }))[0]).toMatch(/GROQ_API_KEY is not set/);
  });

  it("says when a demo task is missing, or the explanation feature is on", () => {
    expect(demoProblems(demo({ AI_FEATURES: "describe,fixes" })).join(" ")).toMatch(/AI_FEATURES is not exactly the three demo tasks \(fixes, describe, whatif\)/);
    expect(demoProblems(demo({ AI_FEATURES: "" })).join(" ")).toMatch(/AI_FEATURES is not exactly/);
    expect(demoProblems(demo({ AI_FEATURES: "describe" })).join(" ")).toMatch(/AI_FEATURES is not exactly/);
    expect(demoProblems(demo({ AI_FEATURES: "fixes" })).join(" ")).toMatch(/AI_FEATURES is not exactly/);
    expect(demoProblems(demo({ AI_EXPLANATIONS: "true" })).join(" ")).toMatch(/explain-this-result feature is on/);
  });

  it("accepts the three tasks in any order and refuses any extra one", () => {
    for (const order of ["whatif,describe,fixes", "describe,whatif,fixes", "fixes,whatif,describe"]) expect(demoProblems(demo({ AI_FEATURES: order }))).toEqual([]);
  });

  it("says when AI is off, the provider is not Groq, or the model is not the tested one", () => {
    expect(demoProblems(demo({ AI_ENABLED: "false" })).join(" ")).toMatch(/AI_ENABLED is not true/);
    expect(demoProblems(demo({ AI_PROVIDER: "ollama" })).join(" ")).toMatch(/AI_PROVIDER is not groq/);
    expect(demoProblems(demo({ GROQ_MODEL: "openai/gpt-oss-20b" })).join(" ")).toMatch(/model is not openai\/gpt-oss-120b/);
  });

  it("names the settings that are missing or invalid, and stops there", () => {
    const problems = demoProblems(demo({ DB_USER: undefined, JWT_ACCESS_SECRET: "short" }));
    expect(problems.join(" ")).toMatch(/missing or not valid: .*DB_USER/);
    expect(problems.join(" ")).toMatch(/JWT_ACCESS_SECRET/);
    expect(problems.some((p) => /AI_ENABLED/.test(p))).toBe(false);
  });

  it("never puts a value of the environment in what it says: not the key, not a password, not a secret", () => {
    const messy = demo({ GROQ_API_KEY: KEY, DB_USER: undefined, JWT_ACCESS_SECRET: "short-secret-VALUE", AI_FEATURES: "describe,SECRET-FEATURE" });
    const everything = JSON.stringify([demoProblems(messy), demoSummary(messy), demoProblems(demo({ AI_ENABLED: "false" })), demoSummary(demo())]);
    for (const secret of [KEY, "short-secret-VALUE", "test-db-password-VALUE", "SECRET-FEATURE"]) expect(everything).not.toContain(secret);
  });

  it("prints the effective settings, and only whether the key is set", () => {
    const lines = demoSummary(demo());
    expect(lines).toEqual([
      "AI on: true, provider: groq, model: openai/gpt-oss-120b",
      "AI design tasks on: fixes, describe, whatif",
      "Explain-this-result on: false",
      "Groq key: set",
    ]);
    expect(demoSummary(demo({ GROQ_API_KEY: "" }))[3]).toBe("Groq key: NOT SET");
    expect(demoSummary(demo({ DB_USER: undefined }))).toEqual(["Settings: not valid", "Groq key: set"]);
  });
});

describe("the separate switch for the explain-this-result feature", () => {
  it("is off by default and must be asked for", () => {
    expect(envSchema.parse(base).AI_EXPLANATIONS).toBe(false);
    expect(envSchema.parse({ ...base, AI_EXPLANATIONS: "false" }).AI_EXPLANATIONS).toBe(false);
    expect(envSchema.parse({ ...base, AI_EXPLANATIONS: "true" }).AI_EXPLANATIONS).toBe(true);
    expect(envSchema.safeParse({ ...base, AI_EXPLANATIONS: "yes" }).success).toBe(false);
  });

  const service = (settings: object) => new AiService({} as never, {} as never, { kind: "groq", model: "openai/gpt-oss-120b" } as never, {} as never, {} as never, settings as never);
  it("keeps the explanation feature off when AI is on for the design tasks only", async () => {
    const out = await service({ enabled: true, explanations: false, features: ["fixes"], provider: "groq" }).readiness();
    expect(out).toMatchObject({ enabled: false, reason: "DISABLED", ready: false });
  });
  it("still follows AI_ENABLED when explanations are asked for, or when no choice was made", async () => {
    for (const explanations of [true, undefined]) {
      expect(await service({ enabled: true, explanations }).readiness()).toMatchObject({ enabled: true, reason: "INSTANCE_BUSY" });
    }
    expect(await service({ enabled: false, explanations: true }).readiness()).toMatchObject({ enabled: false, reason: "DISABLED" });
  });
  it("does not start the explanation lease at boot when explanations are off", async () => {
    const db = { createQueryRunner: jest.fn() };
    await new AiService(db as never, {} as never, { kind: "groq", model: "m" } as never, {} as never, {} as never, { enabled: true, explanations: false } as never).onApplicationBootstrap();
    expect(db.createQueryRunner).not.toHaveBeenCalled();
  });
});

describe("the settings the running application actually uses", () => {
  // The configuration module reads the environment once, when it is imported, so each case loads it fresh with its own environment.
  const settingsFor = (env: Record<string, string | undefined>) => {
    const saved = { ...process.env };
    for (const k of Object.keys(process.env)) if (/^(AI_|GROQ_|OLLAMA_)/.test(k)) delete process.env[k];
    Object.assign(process.env, base);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    try {
      let out: unknown;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy per environment, on purpose
        out = require("@/modules/ai/ai.settings").aiSettings();
      });
      return out as { enabled: boolean; explanations?: boolean; features?: string[]; provider?: string; model: string };
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  };

  it("with the demo settings: exactly the three design tasks on, explanations off, the tested model, on Groq", () => {
    const env: Record<string, string | undefined> = {};
    applyDemoEnv(env);
    expect(settingsFor(env)).toMatchObject({ enabled: true, explanations: false, features: ["fixes", "describe", "whatif"], provider: "groq", model: "openai/gpt-oss-120b" });
  });

  it("by default: everything off, and explanations off even if only AI_ENABLED is switched on", () => {
    expect(settingsFor({})).toMatchObject({ enabled: false, explanations: false, features: [] });
    expect(settingsFor({ AI_ENABLED: "true" })).toMatchObject({ enabled: true, explanations: false, features: [] });
  });

  it("explanations are on only when they are asked for by name", () => {
    expect(settingsFor({ AI_ENABLED: "true", AI_EXPLANATIONS: "true" })).toMatchObject({ enabled: true, explanations: true });
  });
});
