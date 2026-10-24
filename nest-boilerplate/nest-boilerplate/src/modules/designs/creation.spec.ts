import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { prepareDesign } from "@/modules/designs/creation";
import { prepareDesignSchema } from "@/modules/designs/creation.schema";
import { scriptedDraft } from "@/modules/designs/scripted-draft";
import { createDesignSchema } from "@/common/contracts/phase2/api.schema";
const examples = [
  "A news feed for 200k daily users. Mostly reads, Postgres with a Redis cache, behind a CDN and a load balancer.",
  "Online store with a flash sale. 3 app servers, Postgres, Stripe payments, and order emails sent by background workers through a queue.",
  "IoT ingest: 4,000 requests per second of sensor writes, an API gateway, Kafka and 4 workers writing to a time-series database.",
  "Photo sharing app for users in South Asia. Uploads to S3, a CDN for images, 2 app servers and a cache.",
];
describe("M4 preparation without persistence", () => {
  it.each(examples)("preserves prototype draft behavior: %s", (text) => {
    const sandbox: { MockAI?: { draft: (text: string) => unknown } } = {};
    runInNewContext(
      readFileSync(
        resolve(process.cwd(), "docs/stressforge/reference/mock-engine.js"),
        "utf8",
      ),
      sandbox,
    );
    expect(JSON.parse(JSON.stringify(scriptedDraft(text)))).toEqual(
      JSON.parse(JSON.stringify(sandbox.MockAI!.draft(text))),
    );
    const result = prepareDesign({ source: "scripted", text });
    expect(createDesignSchema.safeParse(result.design).success).toBe(true);
    expect(result.design.description).toContain(result.assumptions[0]);
  });
  it("creates empty and Clients-only safe drafts with exact region/preset", () => {
    for (const start of ["clients", "empty"] as const) {
      const result = prepareDesign({
        source: "blank",
        name: "Mine",
        start,
        region: "ap-south",
        preset: "flash",
      });
      expect(result.design.graph.nodes).toHaveLength(
        start === "clients" ? 1 : 0,
      );
      expect(result.design.traffic.preset).toBe("flash");
      if (start === "clients")
        expect(result.design.graph.nodes[0].props).toMatchObject({
          region: "ap-south",
        });
    }
  });
  it("completes legacy imports deterministically without edge-id collisions", () => {
    const input = {
      source: "import" as const,
      text: JSON.stringify({
        nodes: [
          { id: "e1", type: "client" },
          { id: "app", type: "app" },
        ],
        edges: [{ from: "e1", to: "app" }],
      }),
    };
    const one = prepareDesign(input),
      two = prepareDesign(input);
    expect(one).toEqual(two);
    expect(one.design.graph.edges[0].id).toBe("e2");
    expect(one.design.graph.nodes[0].label).toBe("Clients");
  });
  it.each([
    "{",
    '{"schemaVersion":2,"nodes":[]}',
    '{"nodes":[{"id":"a","type":"unknown"}]}',
    '{"nodes":[{"id":"constructor","type":"app"}]}',
    '{"nodes":[{"id":"a","type":"app"},{"id":"a","type":"db"}]}',
    '{"nodes":[{"id":"a","type":"app","x":100001}]}',
    '{"nodes":[{"id":"a","type":"app","props":{"replicas":1.5}}]}',
    '{"nodes":[{"id":"a","type":"app"}],"edges":[{"from":"a","to":"missing"}]}',
    '{"nodes":[],"ownerId":"injected"}',
    JSON.stringify({ description: "界".repeat(22000), nodes: [] }),
  ])("rejects unsafe input: %.60s", (text) =>
    expect(() => prepareDesign({ source: "import", text })).toThrow(),
  );
  it("keeps a safe cyclic draft rather than claiming it is runnable", () => {
    const result = prepareDesign({
      source: "import",
      text: JSON.stringify({
        nodes: [
          { id: "a", type: "app" },
          { id: "b", type: "db" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      }),
    });
    expect(result.design.graph.edges).toHaveLength(2);
  });
  it.each([
    "201 app servers",
    "0 app servers",
    "1.5 app servers",
    "-2 app servers",
    "-5 rps",
    "900 workers with a queue",
    "999999999 rps",
  ])("rejects unsupported literal numbers rather than clamping: %s", (text) => {
    expect(() => prepareDesign({ source: "scripted", text })).toThrow();
  });
  it("rejects forged preparation modes, fields and empty descriptions", () => {
    for (const value of [
      { source: "scripted", text: "" },
      { source: "scripted", text: "app", ownerId: "x" },
      { source: "real-ai", text: "app" },
    ])
      expect(prepareDesignSchema.safeParse(value).success).toBe(false);
  });
});
