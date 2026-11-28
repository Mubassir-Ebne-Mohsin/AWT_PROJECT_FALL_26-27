import {
  JsHistogram,
  build,
  encodeIntoCompressedBase64,
  decodeFromCompressedBase64,
} from "hdr-histogram-js";
import { inflateSync, deflateSync } from "node:zlib";
export const RESULT_FORMAT = "region-lab-result-v2";
const MAX_TICKS = 60_000_000;
export function histogram(samples: readonly number[]) {
  if (!samples.length) return null;
  const h = build({
    lowestDiscernibleValue: 1,
    highestTrackableValue: MAX_TICKS,
    numberOfSignificantValueDigits: 3,
    autoResize: false,
  });
  for (const ms of samples) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 60000)
      throw Error("Latency outside histogram range");
    h.recordValue(Math.round(ms * 1000));
  }
  // v3 writes integer bits for the IEEE-754 conversion field. Emit standard HDR ratio 1.0.
  const encoded = Buffer.from(encodeIntoCompressedBase64(h), "base64"),
    plain = inflateSync(encoded.subarray(8, 8 + encoded.readInt32BE(4)));
  plain.writeInt32BE(0, 8);
  plain.writeDoubleBE(1, 32);
  const compressed = deflateSync(plain),
    header = Buffer.alloc(8);
  header.writeUInt32BE(0x1c849314, 0);
  header.writeInt32BE(compressed.length, 4);
  const data = Buffer.concat([header, compressed]).toString("base64");
  return {
    format: "hdr-v2-base64" as const,
    unit: "ms",
    encodedTickToMs: 0.001,
    lowestDiscernibleValue: 1,
    highestTrackableValue: MAX_TICKS,
    significantDigits: 3,
    count: samples.length,
    data,
  };
}
export function decodeHistogram(
  value: ReturnType<typeof histogram>,
  count: number,
) {
  if (count === 0) {
    if (value !== null) throw Error("Empty distribution required");
    return null;
  }
  if (
    !value ||
    value.format !== "hdr-v2-base64" ||
    value.unit !== "ms" ||
    value.encodedTickToMs !== 0.001 ||
    value.count !== count ||
    value.significantDigits !== 3 ||
    value.lowestDiscernibleValue !== 1 ||
    value.highestTrackableValue !== MAX_TICKS ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data) ||
    value.data.length > 180000
  )
    throw Error("Invalid histogram envelope");
  const bytes = Buffer.from(value.data, "base64");
  if (
    bytes.length < 9 ||
    bytes.readUInt32BE(0) !== 0x1c849314 ||
    bytes.readInt32BE(4) !== bytes.length - 8 ||
    bytes.readInt32BE(4) < 1
  )
    throw Error("Invalid compressed HDR header");
  const plain = inflateSync(bytes.subarray(8, 8 + bytes.readInt32BE(4)), {
    maxOutputLength: 256 * 1024,
  });
  if (
    plain.length < 40 ||
    plain.readUInt32BE(0) !== 0x1c849313 ||
    plain.readInt32BE(8) !== 0 ||
    plain.readInt32BE(12) !== 3 ||
    plain.readBigInt64BE(16) !== 1n ||
    plain.readBigInt64BE(24) !== BigInt(MAX_TICKS) ||
    plain.readDoubleBE(32) !== 1
  )
    throw Error("Incompatible HDR allocation header");
  if (
    plain.readInt32BE(4) !== plain.length - 40 ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 600000
  )
    throw Error("Invalid HDR count payload");
  let position = 40,
    slots = 0,
    total = 0;
  while (position < plain.length) {
    let word = 0n,
      done = false;
    for (let byte = 0; byte < 9; byte++) {
      if (position >= plain.length) throw Error("Truncated HDR count");
      const v = plain[position++];
      word |= BigInt(byte === 8 ? v : v & 127) << BigInt(byte * 7);
      if (byte === 8 || !(v & 128)) {
        done = true;
        break;
      }
    }
    if (!done) throw Error("Invalid HDR varint");
    const signed = (word >> 1n) ^ -(word & 1n);
    if (signed < 0n) slots += Number(-signed);
    else {
      if (signed > BigInt(count)) throw Error("Invalid HDR bucket count");
      slots++;
      total += Number(signed);
    }
    if (!Number.isSafeInteger(slots) || slots > 17408 || total > count)
      throw Error("HDR bucket bounds exceeded");
  }
  if (total !== count) throw Error("HDR payload total mismatch");
  const h = decodeFromCompressedBase64(value.data);
  if (!(h instanceof JsHistogram)) throw Error("Unsupported histogram runtime");
  if (h.totalCount !== count || h.maxValue > MAX_TICKS + 65536)
    throw Error("Histogram count/range mismatch");
  return h;
}
type Bucket = {
  startMs: number;
  endMs: number;
  offeredRequests: number;
  attempts: number;
  successfulRequests: number;
  failedRequests: number;
  unresolvedRequests: number;
  failures: Record<string, number>;
  samples: number[];
};
export function createCapture(durationMs: number) {
  const width = Math.ceil(durationMs / 60),
    executions: Array<{
      histograms: Record<string, ReturnType<typeof histogram>>;
      buckets: any[];
    }> = [];
  let buckets = new Map<number, Bucket>();
  return {
    executions,
    onRootEvent(event: {
      kind: string;
      arrivedMs: number;
      latencyMs?: number;
      error?: string | null;
    }) {
      const i = Math.min(59, Math.floor(event.arrivedMs / width));
      if (!buckets.has(i))
        buckets.set(i, {
          startMs: i * width,
          endMs: Math.min(durationMs, (i + 1) * width),
          offeredRequests: 0,
          attempts: 0,
          successfulRequests: 0,
          failedRequests: 0,
          unresolvedRequests: 0,
          failures: {
            QUEUE_FULL: 0,
            RATE_LIMITED: 0,
            DEADLINE: 0,
            UNAVAILABLE: 0,
          },
          samples: [],
        });
      const b = buckets.get(i)!;
      if (event.kind === "offered") b.offeredRequests++;
      if (event.kind === "attempt") b.attempts++;
      if (event.kind === "outcome") {
        if (event.error) {
          b.failedRequests++;
          b.failures[event.error]++;
        } else {
          b.successfulRequests++;
          b.samples.push(event.latencyMs!);
        }
      }
    },
    onSamples(scope: string, samples: readonly number[]) {
      if (scope === "global") {
        const timeline = [...buckets.values()]
          .sort((a, b) => a.startMs - b.startMs)
          .map(({ samples, ...b }) => ({
            ...b,
            unresolvedRequests:
              b.offeredRequests - b.successfulRequests - b.failedRequests,
            errorRateRatio: b.offeredRequests
              ? b.failedRequests / b.offeredRequests
              : null,
            histogram: histogram(samples),
          }));
        executions.push({ histograms: {}, buckets: timeline });
        buckets = new Map();
      }
      executions.at(-1)!.histograms[scope] = histogram(samples);
    },
  };
}
export function validateTelemetry(result: any, durationMs?: number) {
  if (
    result.wireVersion !== RESULT_FORMAT ||
    !Array.isArray(result.telemetry?.executions)
  )
    throw Error("Invalid recorded result format");
  const sides = result.repetitions.flatMap((r: any) =>
    [r.baseline, r.outage].filter(Boolean),
  );
  if (sides.length !== result.telemetry.executions.length)
    throw Error("Execution manifest mismatch");
  sides.forEach((side: any, index: number) => {
    const telemetry = result.telemetry.executions[index],
      summaries: Record<string, any> = { global: side.summary };
    for (const [id, s] of Object.entries(side.origins))
      summaries["origin:" + id] = s;
    for (const [id, s] of Object.entries(side.operations))
      summaries["operation:" + id] = s;
    if (
      JSON.stringify(Object.keys(summaries).sort()) !==
      JSON.stringify(Object.keys(telemetry.histograms).sort())
    )
      throw Error("Distribution scope mismatch");
    const decoded: Record<string, ReturnType<typeof decodeHistogram>> = {};
    for (const [key, s] of Object.entries(summaries)) {
      const h = decodeHistogram(
        telemetry.histograms[key],
        s.successfulRequests,
      );
      decoded[key] = h;
      if (h)
        for (const [p, field] of [
          [50, "p50Ms"],
          [95, "p95Ms"],
          [99, "p99Ms"],
        ] as const) {
          const exact = s.latency[field];
          if (
            exact !== null &&
            Math.abs(h.getValueAtPercentile(p) * 0.001 - exact) >
              Math.max(0.002, Math.abs(exact) * 0.002)
          )
            throw Error("Histogram percentile mismatch");
        }
    }
    if (!Array.isArray(telemetry.buckets) || telemetry.buckets.length > 60)
      throw Error("Invalid timeline");
    const signature = (h: ReturnType<typeof decodeHistogram>) => {
      if (!h) return "";
      const it = h.recordedValuesIterator;
      it.reset();
      const values: string[] = [];
      while (it.hasNext()) {
        const v = it.next();
        values.push(v.valueIteratedTo + ":" + v.countAddedInThisIterationStep);
      }
      return values.join(",");
    };
    const merge = (items: Array<ReturnType<typeof decodeHistogram>>) => {
      const h = build({
        lowestDiscernibleValue: 1,
        highestTrackableValue: MAX_TICKS,
        numberOfSignificantValueDigits: 3,
        autoResize: false,
      }) as JsHistogram;
      items.forEach((v) => {
        if (v) h.add(v);
      });
      return h;
    };
    for (const prefix of ["origin:", "operation:"])
      if (
        signature(
          merge(
            Object.keys(decoded)
              .filter((k) => k.startsWith(prefix))
              .map((k) => decoded[k]),
          ),
        ) !== signature(decoded.global)
      )
        throw Error("Merged distribution mismatch");
    const bucketHistograms: Array<ReturnType<typeof decodeHistogram>> = [];
    let end = 0,
      offered = 0,
      success = 0,
      failed = 0,
      attempts = 0;
    const reasons: Record<string, number> = {
      QUEUE_FULL: 0,
      RATE_LIMITED: 0,
      DEADLINE: 0,
      UNAVAILABLE: 0,
    };
    for (const b of telemetry.buckets) {
      if (
        !Number.isFinite(b.startMs) ||
        b.startMs < end ||
        b.endMs <= b.startMs ||
        (durationMs !== undefined && b.endMs > durationMs)
      )
        throw Error("Invalid bucket order");
      end = b.endMs;
      for (const k of [
        "offeredRequests",
        "successfulRequests",
        "failedRequests",
        "unresolvedRequests",
        "attempts",
      ])
        if (!Number.isSafeInteger(b[k]) || b[k] < 0)
          throw Error("Invalid bucket count");
      if (
        b.offeredRequests !==
          b.successfulRequests + b.failedRequests + b.unresolvedRequests ||
        (b.offeredRequests ? b.failedRequests / b.offeredRequests : null) !==
          b.errorRateRatio ||
        Object.values(b.failures).reduce((a: number, v: any) => a + v, 0) !==
          b.failedRequests
      )
        throw Error("Bucket conservation mismatch");
      if (
        JSON.stringify(Object.keys(b.failures).sort()) !==
        JSON.stringify(Object.keys(reasons).sort())
      )
        throw Error("Bucket reason mismatch");
      for (const key of Object.keys(reasons)) {
        if (!Number.isSafeInteger(b.failures[key]) || b.failures[key] < 0)
          throw Error("Invalid bucket failures");
        reasons[key] += b.failures[key];
      }
      bucketHistograms.push(decodeHistogram(b.histogram, b.successfulRequests));
      offered += b.offeredRequests;
      success += b.successfulRequests;
      failed += b.failedRequests;
      attempts += b.attempts;
    }
    if (
      signature(merge(bucketHistograms)) !== signature(decoded.global) ||
      Object.keys(reasons).some((k) => reasons[k] !== side.summary.failures[k])
    )
      throw Error("Bucket distributions/reasons mismatch");
    if (
      offered !== side.summary.offeredRequests ||
      success !== side.summary.successfulRequests ||
      failed !== side.summary.failedRequests ||
      attempts !== side.summary.attempts
    )
      throw Error("Timeline totals mismatch");
  });
}

export function distributionPlot(wire: ReturnType<typeof histogram>) {
  if (!wire) return [];
  const h = decodeHistogram(wire, wire.count)!,
    max = Math.max(1, h.maxValue),
    step = max / 24;
  const bins = Array.from({ length: 24 }, (_, i) => ({
    fromMs: (i * step) / 1000,
    toMs: ((i + 1) * step) / 1000,
    count: 0,
  }));
  const it = h.recordedValuesIterator;
  it.reset();
  while (it.hasNext()) {
    const v = it.next();
    bins[Math.min(23, Math.floor(v.valueIteratedTo / step))].count +=
      v.countAddedInThisIterationStep;
  }
  if (bins.reduce((n, b) => n + b.count, 0) !== wire.count)
    throw Error("Plot count mismatch");
  return bins;
}
