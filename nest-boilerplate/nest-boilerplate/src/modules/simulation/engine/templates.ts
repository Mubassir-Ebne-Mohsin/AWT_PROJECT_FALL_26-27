import type { z } from "zod";
import {
  templateSchema,
  catalogSchema,
} from "@/common/contracts/phase2/api.schema";
import {
  templateId,
  snapshotSchema,
} from "@/common/contracts/phase2/graph.schema";
import {
  buildFromSpec,
  BuilderSpec,
} from "@/modules/simulation/engine/builders";
import {
  CATALOG,
  REGIONS,
  PRESETS,
  TRAFFIC_DEFAULTS,
} from "@/modules/simulation/engine/catalog";
import {
  graphNode,
  MODEL_VERSION,
} from "@/common/contracts/phase2/graph.schema";
import type { Traffic } from "@/modules/simulation/engine/types";
type TemplateId = z.infer<typeof templateId>;
export const TEMPLATES: {
  id: TemplateId;
  name: string;
  blurb: string;
  spec: BuilderSpec;
  traffic: Partial<Traffic>;
}[] = [
  {
    id: "three-tier",
    name: "Classic three-tier web app",
    blurb:
      "A load balancer, a pool of app servers, a cache and one database. The usual starting point.",
    spec: {
      lb: true,
      appReplicas: 3,
      cache: { hitRatio: 0.8 },
      dbLabel: "Postgres",
    },
    traffic: {
      preset: "evening",
      rps: 1200,
      burst: 1.5,
      readRatio: 0.85,
      sloP95: 300,
      shape: "steady",
    },
  },
  {
    id: "content",
    name: "Read-heavy content site",
    blurb:
      "CDN at the edge, a cache and a read replica. Built for feeds, blogs and catalogs.",
    spec: {
      cdn: { hitRatio: 0.8 },
      lb: true,
      appReplicas: 3,
      cache: { label: "Redis", hitRatio: 0.9 },
      replicas: 1,
      dbLabel: "Postgres",
    },
    traffic: {
      preset: "evening",
      rps: 2000,
      burst: 1.5,
      readRatio: 0.92,
      sloP95: 300,
      shape: "steady",
    },
  },
  {
    id: "ingest",
    name: "Write-heavy ingest pipeline",
    blurb:
      "An API gateway in front, a queue to soak up bursts, workers writing to the database.",
    spec: {
      gateway: true,
      appReplicas: 4,
      queue: { label: "Kafka", workers: 4 },
      dbLabel: "Time-series DB",
    },
    traffic: {
      preset: "ingest",
      rps: 1500,
      burst: 1.3,
      readRatio: 0.15,
      sloP95: 250,
      shape: "steady",
    },
  },
  {
    id: "checkout",
    name: "E-commerce checkout",
    blurb:
      "A payments API on the request path, order emails sent by background workers.",
    spec: {
      cdn: { hitRatio: 0.5 },
      lb: true,
      appReplicas: 4,
      cache: { label: "Redis", hitRatio: 0.8 },
      queue: {
        workers: 2,
        external: [{ label: "Email API", share: 1, capacity: 800 }],
      },
      external: [{ label: "Payments API", share: 0.06, capacity: 400 }],
      dbLabel: "Postgres",
    },
    traffic: {
      preset: "flash",
      rps: 1400,
      burst: 3,
      readRatio: 0.6,
      sloP95: 400,
      shape: "spike",
    },
  },
  {
    id: "mvp",
    name: "Single-server MVP",
    blurb:
      "One app server and one database. Cheap and simple, and a quick way to see what breaks first.",
    spec: { appReplicas: 1 },
    traffic: {
      preset: "steady",
      rps: 300,
      burst: 1.2,
      readRatio: 0.8,
      sloP95: 300,
      shape: "steady",
    },
  },
  {
    id: "media",
    name: "Photo sharing",
    blurb: "Uploads go to object storage and images are served from a CDN.",
    spec: {
      cdn: { hitRatio: 0.75 },
      lb: true,
      appReplicas: 2,
      cache: { hitRatio: 0.8 },
      storage: { share: 0.25 },
    },
    traffic: {
      preset: "custom",
      rps: 800,
      burst: 1.5,
      readRatio: 0.9,
      sloP95: 300,
      shape: "steady",
    },
  },
];

export function getTemplates() {
  return TEMPLATES.map((t) =>
    templateSchema.parse({
      id: t.id,
      name: t.name,
      blurb: t.blurb,
      ...snapshotSchema.parse({
        schemaVersion: 1,
        graph: buildFromSpec(t.spec),
        traffic: { ...TRAFFIC_DEFAULTS, ...t.traffic },
      }),
    }),
  );
}
export function getCatalog() {
  return catalogSchema.parse({
    engineVersion: MODEL_VERSION,
    components: Object.entries(CATALOG).map(([type, c]) => ({
      type,
      label: c.label,
      short: c.short,
      category: c.category,
      capacity: Number.isFinite(c.capacity)
        ? { kind: "finite", value: c.capacity }
        : { kind: "unbounded" },
      latency: c.latency,
      behavior: c.behavior,
      blurb: c.blurb,
      defaults: { replicas: 1, ...c.defaults },
      editableProperties: Object.keys(
        graphNode.options.find((n) => n.shape.type.value === type)!.shape.props
          .shape,
      ),
    })),
    regions: Object.entries(REGIONS).map(([id, label]) => ({ id, label })),
    trafficDefaults: TRAFFIC_DEFAULTS,
    presets: PRESETS.map((p) => {
      const { id, name, note, ...traffic } = p;
      return {
        id,
        name,
        note,
        traffic: { ...TRAFFIC_DEFAULTS, ...traffic, preset: id },
      };
    }),
  });
}
