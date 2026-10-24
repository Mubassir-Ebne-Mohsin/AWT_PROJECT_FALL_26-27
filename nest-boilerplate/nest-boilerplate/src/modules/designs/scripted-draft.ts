import { TRAFFIC_DEFAULTS } from "@/common/contracts/phase2/graph.schema";
import { REGIONS } from "@/modules/simulation/engine/catalog";
import {
  buildFromSpec,
  BuilderSpec,
  ExternalSpec,
} from "@/modules/simulation/engine/builders";
// Port of prototype SECTION 1 MockAI.draft. Counts outside the API envelope
// are rejected instead of silently clamped; all estimates disclose assumptions.
function parseNumber(raw: string, unit?: string) {
  let value = Number(raw.replace(/,/g, ""));
  if (unit === "k" || unit === "thousand") value *= 1000;
  if (unit === "m" || unit === "million") value *= 1000000;
  return value;
}
export function scriptedDraft(text: string) {
  const t =
    " " +
    String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ") +
    " ";
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  // Do not let the legacy integer matcher turn "-2" or "1.5" into a positive count.
  for (const match of t.matchAll(
    /(-?\d+(?:\.\d+)?)\s*(?:(?:app|api|web|application|backend|node|read)\s*)?(?:servers?|instances?|replicas?|pods?|containers?|workers?)/g,
  )) {
    const count = Number(match[1]);
    if (!Number.isInteger(count) || count < 1 || count > 200)
      throw new RangeError(
        "Server and worker counts must be whole numbers within 1–200",
      );
  }
  if (
    /-\d[\d,.]*\s*(?:k|thousand)?\s*(?:rps|req\/s|requests? (?:per|a|each) second)/.test(
      t,
    )
  )
    throw new RangeError("Requests per second cannot be negative");
  const found: string[] = [],
    assumptions: string[] = [];
  const spec: BuilderSpec = {};
  spec.region = has("europe", " eu ", "germany", " uk ", "london", "paris")
    ? "eu-west"
    : has(
          "asia",
          "india",
          "bangladesh",
          "mumbai",
          "singapore",
          "pakistan",
          "nepal",
          "sri lanka",
        )
      ? "ap-south"
      : "us-east";
  if (spec.region !== "us-east") found.push("Users in " + REGIONS[spec.region]);
  else assumptions.push("No region mentioned, so everything runs in US East.");
  const mApps = t.match(
    /(\d+)\s*(?:app|api|web|application|backend|node)?\s*(?:servers?|instances?|replicas?|pods?|containers?)/,
  );
  spec.appReplicas = mApps ? parseInt(mApps[1], 10) : 2;
  if (mApps) found.push(spec.appReplicas + " app servers");
  else assumptions.push("Started with 2 app servers.");
  if (
    has(
      "cdn",
      "cloudfront",
      "cloudflare",
      "static",
      "image",
      "video",
      "media",
      "photo",
      "assets",
    )
  ) {
    spec.cdn = {
      hitRatio: has("video", "media", "image", "photo") ? 0.75 : 0.6,
    };
    found.push("CDN");
  }
  if (has("gateway", "kong", "apigee")) {
    spec.gateway = true;
    found.push("API gateway");
  }
  spec.lb =
    has("load balancer", "balancer", "nginx", "haproxy", " elb", " alb") ||
    spec.appReplicas > 1;
  if (spec.lb) {
    if (has("load balancer", "balancer", "nginx", "haproxy", " elb", " alb"))
      found.push("Load balancer");
    else
      assumptions.push(
        "Added a load balancer because there is more than one app server.",
      );
  }
  if (has("cache", "redis", "memcache", "valkey")) {
    const mh = t.match(/(\d{1,2})\s*%\s*(?:cache\s*)?hit/);
    spec.cache = {
      label: has("redis") ? "Redis" : has("memcache") ? "Memcached" : "Cache",
      hitRatio: mh ? parseInt(mh[1], 10) / 100 : 0.8,
    };
    found.push(spec.cache.label + " cache");
    if (!mh) assumptions.push("Assumed the cache answers 80% of reads.");
  }
  spec.dbLabel = has("postgres", "postgresql")
    ? "Postgres"
    : has("mysql")
      ? "MySQL"
      : has("mongo")
        ? "MongoDB"
        : has("timescale", "time-series", "time series", "influx")
          ? "Time-series DB"
          : has("dynamo")
            ? "DynamoDB"
            : "Database";
  found.push(spec.dbLabel);
  const mRep = t.match(/(\d+)\s*read replicas?/);
  spec.replicas = mRep ? parseInt(mRep[1], 10) : has("replica") ? 1 : 0;
  if (spec.replicas)
    found.push(
      spec.replicas + " read replica" + (spec.replicas > 1 ? "s" : ""),
    );
  const wantsQueue = has(
    "queue",
    "kafka",
    "rabbit",
    "sqs",
    "background",
    "async",
    "worker",
    "jobs",
    "emails",
    "e-mail",
    "notification",
  );
  const ext: ExternalSpec[] = [];
  if (has("stripe", "payment", "checkout", "paypal", "bkash"))
    ext.push({ label: "Payments API", share: has("checkout") ? 0.08 : 0.05 });
  if (wantsQueue) {
    const mw = t.match(/(\d+)\s*workers?/);
    spec.queue = {
      label: has("kafka")
        ? "Kafka"
        : has("rabbit")
          ? "RabbitMQ"
          : has("sqs")
            ? "SQS"
            : "Queue",
      workers: mw ? parseInt(mw[1], 10) : 2,
      external: has("email", "e-mail", "notification", "sendgrid")
        ? [{ label: "Email API", share: 1 }]
        : [],
    };
    found.push(spec.queue.label + " + " + spec.queue.workers + " workers");
    if (!mw) assumptions.push("Assumed 2 workers read from the queue.");
    if (spec.queue.external!.length)
      found.push("Email API (called by workers)");
  }
  if (has("sms", "twilio")) ext.push({ label: "SMS API", share: 0.05 });
  if (has("maps", "geocod", "location lookup"))
    ext.push({ label: "Maps API", share: 0.1 });
  spec.external = ext;
  ext.forEach((x) => found.push(x.label));
  if (has("upload", " s3", "storage", " file", "photo", "video", "media")) {
    spec.storage = { share: has("photo", "video", "media") ? 0.25 : 0.12 };
    found.push("Object storage");
  }

  const traffic = Object.assign({}, TRAFFIC_DEFAULTS);
  const mRps = t.match(
    /(\d[\d,.]*)\s*(k|thousand)?\s*(?:rps|req\/s|requests? (?:per|a|each) second|requests?\/s)/,
  );
  const mUsers = t.match(
    /(\d[\d,.]*)\s*(k|m|thousand|million)?\s*(?:daily active users|daily users|dau|users|visitors|customers|devices|sensors)/,
  );
  if (mRps) {
    traffic.rps = Math.round(parseNumber(mRps[1], mRps[2]));
    found.push(traffic.rps.toLocaleString("en-US") + " rps");
  } else if (mUsers) {
    const users = parseNumber(mUsers[1], mUsers[2]);
    traffic.rps = Math.max(20, Math.round(((users * 50) / 86400) * 3));
    assumptions.push(
      "Turned " +
        Math.round(users).toLocaleString("en-US") +
        " users into " +
        traffic.rps.toLocaleString("en-US") +
        " rps at the busiest hour (50 requests per user per day, peak hour 3x the average).",
    );
  } else {
    traffic.rps = 500;
    assumptions.push("No traffic figure given, so the test starts at 500 rps.");
  }
  if (
    has(
      "read-heavy",
      "read heavy",
      "feed",
      "news",
      "blog",
      "content",
      "catalog",
      "browse",
      "photo",
      "video",
    )
  )
    traffic.readRatio = 0.9;
  else if (
    has(
      "write-heavy",
      "write heavy",
      "ingest",
      "logging",
      "sensor",
      "iot",
      "telemetry",
      "analytics",
      "events",
    )
  )
    traffic.readRatio = 0.15;
  else if (has("chat", "messag")) traffic.readRatio = 0.5;
  else if (has("store", "shop", "commerce", "checkout"))
    traffic.readRatio = 0.75;
  assumptions.push(
    "Assumed " +
      Math.round(traffic.readRatio * 100) +
      "% of requests are reads.",
  );
  if (has("flash sale", "launch", "spike", "black friday", "viral", "eid")) {
    traffic.burst = 3;
    traffic.shape = "spike";
    found.push("Traffic spikes (3x bursts)");
  }
  const name = has("news", "feed")
    ? "News feed"
    : has("shop", "store", "commerce", "checkout")
      ? "Online store"
      : has("iot", "sensor", "telemetry", "ingest")
        ? "Sensor ingest"
        : has("photo", "image", "video")
          ? "Photo sharing"
          : has("chat", "messag")
            ? "Chat service"
            : has("ride", "carpool", "taxi")
              ? "Ride booking"
              : "Drafted design";
  for (const value of [spec.appReplicas, spec.replicas, spec.queue?.workers]) {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 0 || value > 200)
    )
      throw new RangeError("Server and worker counts must be within 1–200");
  }
  if (spec.appReplicas === 0 || spec.queue?.workers === 0)
    throw new RangeError("Server and worker counts must be within 1–200");
  const design = buildFromSpec(spec);
  return { name, design, traffic, found, assumptions, spec };
}
