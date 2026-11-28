import { wrapReportText } from "@/modules/region-lab/results/report-text";
import { regionResultViewSchema } from "@/modules/region-lab/results/region-result.dto";
import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RegionStore } from "@/modules/region-lab/region-store.service";
import { hash } from "@/modules/region-lab/region-policy";
import { adaptRegionalScenario } from "@/modules/region-lab/engine/regional-scenario";
import { canonical } from "@/modules/region-lab/engine/regional-engine";
import { AppException } from "@/common/errors";
import {
  RESULT_FORMAT,
  validateTelemetry,
  distributionPlot,
} from "@/modules/region-lab/results/result-codec";
const selection = z.strictObject({
  scenario: z.enum(["baseline", "outage"]).default("baseline"),
  repetition: z.coerce.number().int().min(0).max(4).default(0),
  view: z
    .enum(["regions", "components", "timeline", "operations"])
    .default("regions"),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(120).default(60),
});
const conflict = (reason: string) =>
  new AppException("CONFLICT", reason, { reason });
@Injectable()
export class RegionResults {
  constructor(
    private readonly db: DataSource,
    private readonly store: RegionStore,
  ) {}
  async retained(owner: string, id: string, completed = true) {
    await this.store.getRun(owner, id);
    const [row] = await this.db.query(
      "SELECT id,experiment_id,experiment_revision,status,snapshot,result,input_hash,engine_version,created_at,started_at,finished_at,failure,(SELECT revision FROM region_lab_experiments e WHERE e.id=region_lab_runs.experiment_id AND e.owner_id=$2) AS current_revision FROM region_lab_runs WHERE id=$1 AND owner_id=$2",
      [id, owner],
    );
    if (!row) throw new AppException("NOT_FOUND", "Region Lab run not found");
    if (completed && row.status !== "completed")
      throw conflict("REGION_RESULT_NOT_COMPLETED");
    if (row.result?.wireVersion === RESULT_FORMAT)
      validateTelemetry(
        row.result,
        row.snapshot.scenario.workload.durationSeconds * 1000,
      );
    return row;
  }
  async runs(owner: string, id: string, raw: Record<string, unknown>) {
    await this.store.get(owner, id);
    const q = this.store.query(
      z.strictObject({
        before: z.string().max(1024).optional(),
        limit: z.coerce.number().int().min(1).max(20).default(20),
      }),
      raw,
    );
    let after: any = null;
    if (q.before) {
      try {
        after = JSON.parse(Buffer.from(q.before, "base64url").toString());
        if (
          after.owner !== owner ||
          after.scope !== id ||
          !z.uuid().safeParse(after.id).success ||
          !z.iso.datetime().safeParse(after.at).success
        )
          throw Error();
      } catch {
        throw new AppException("VALIDATION_FAILED", "Invalid run cursor");
      }
    }
    const rows = await this.db.query(
      `SELECT id,experiment_revision,status,input_hash,created_at,finished_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM region_lab_runs WHERE owner_id=$1 AND experiment_id=$2 ${after ? "AND (created_at,id)<($4::timestamptz,$5::uuid)" : ""} ORDER BY created_at DESC,id DESC LIMIT $3`,
      after
        ? [owner, id, q.limit + 1, after.at, after.id]
        : [owner, id, q.limit + 1],
    );
    const items = rows.slice(0, q.limit).map((r: any) => ({
      id: r.id,
      experimentRevision: r.experiment_revision,
      status: r.status,
      inputHash: r.input_hash,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
    }));
    const last = rows[q.limit - 1];
    return {
      items,
      nextCursor:
        rows.length > q.limit
          ? Buffer.from(
              JSON.stringify({ owner, scope: id, id: last.id, at: last.at }),
            ).toString("base64url")
          : null,
    };
  }
  select(row: any, side: string, repetition: number) {
    const rep = row.result?.repetitions?.[repetition],
      value = rep?.[side];
    if (!value) throw conflict("REGION_SIDE_OR_REPETITION_UNAVAILABLE");
    const index =
      row.result.repetitions
        .slice(0, repetition)
        .reduce(
          (n: number, r: any) => n + Number(!!r.baseline) + Number(!!r.outage),
          0,
        ) + (side === "outage" && rep.baseline ? 1 : 0);
    return {
      value,
      seed: rep.seed,
      telemetry: row.result.telemetry?.executions[index] ?? null,
    };
  }
  async inspect(owner: string, id: string, raw: Record<string, unknown>) {
    const q = this.store.query(selection, raw),
      row = await this.retained(owner, id),
      { value, seed, telemetry } = this.select(row, q.scenario, q.repetition);
    const rows =
      q.view === "regions"
        ? Object.entries(value.origins).map(([region, summary]) => {
            const target =
              row.snapshot.scenario.targets.perRegion.find(
                (t: any) => t.region === region,
              ) ?? row.snapshot.scenario.targets;
            const s = summary as any;
            const verdict =
              (s.errorRateRatio !== null &&
                s.errorRateRatio > target.errorBudgetRatio) ||
              (s.latency.p95Ms !== null && s.latency.p95Ms > target.p95Ms)
                ? "fail"
                : s.unresolvedRequests || s.latency.p95Ms === null
                  ? "indeterminate"
                  : "pass";
            return { region, summary, target, verdict };
          })
        : q.view === "operations"
          ? Object.entries(value.operations).map(([operation, summary]) => ({
              operation,
              summary,
            }))
          : q.view === "components"
            ? value.nodes
            : (telemetry?.buckets ?? []);
    const scope = hash([owner, id, q.scenario, q.repetition, q.view]);
    let offset = 0;
    if (q.cursor) {
      try {
        const c = JSON.parse(Buffer.from(q.cursor, "base64url").toString());
        if (
          c.scope !== scope ||
          !Number.isSafeInteger(c.offset) ||
          c.offset < 0 ||
          c.offset > rows.length
        )
          throw Error();
        offset = c.offset;
      } catch {
        throw new AppException("VALIDATION_FAILED", "Invalid result cursor");
      }
    }
    return regionResultViewSchema.parse({
      runId: id,
      experimentRevision: row.experiment_revision,
      currentRevision: row.current_revision,
      isCurrentRevision: row.current_revision === row.experiment_revision,
      inputHash: row.input_hash,
      engineVersion: row.engine_version,
      wireVersion: row.result.wireVersion ?? "native-v1",
      calibration: "uncalibrated",
      scenario: q.scenario,
      repetition: q.repetition,
      seed,
      summary: value.summary,
      provenance: row.result.provenance,
      targets: row.snapshot.scenario.targets,
      phases: value.regional?.phases ?? [],
      reroutedRoots: value.regional?.reroutedRoots ?? null,
      links: value.regional?.links ?? [],
      warnings: value.warnings ?? [],
      limitations: value.limitations ?? [],
      distribution: telemetry?.histograms.global ?? null,
      distributionPlot: distributionPlot(telemetry?.histograms.global ?? null),
      distributionStatus: telemetry ? "captured" : "unavailable_for_legacy_run",
      timelineAccounting:
        "Root outcomes grouped by measured arrival interval; finalized during drain. Component diagnostics cover the whole run, not time-bucket samples.",
      items: rows.slice(offset, offset + q.limit),
      nextCursor:
        offset + q.limit < rows.length
          ? Buffer.from(
              JSON.stringify({ scope, offset: offset + q.limit }),
            ).toString("base64url")
          : null,
    });
  }
  async versionExport(owner: string, id: string, revision: string) {
    await this.store.get(owner, id);
    const rev = this.store.query(
      z.strictObject({ revision: z.coerce.number().int().positive() }),
      { revision },
    ).revision;
    const [v] = await this.db.query(
      "SELECT revision,input_hash,snapshot,created_at FROM region_lab_versions WHERE experiment_id=$1 AND revision=$2",
      [id, rev],
    );
    if (!v) throw new AppException("NOT_FOUND", "Region Lab version not found");
    return { format: "stressforge-region-version-v1", experimentId: id, ...v };
  }
  async export(owner: string, id: string) {
    const row = await this.retained(owner, id);
    return {
      format: "stressforge-region-export-v1",
      run: {
        id: row.id,
        experimentId: row.experiment_id,
        experimentRevision: row.experiment_revision,
        status: row.status,
        inputHash: row.input_hash,
        engineVersion: row.engine_version,
        createdAt: row.created_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      },
      snapshot: row.snapshot,
      result: row.result,
      calibration: "uncalibrated",
      note: "Recorded inputs and outputs. No recomputation. Native-v1 runs have no captured distributions.",
    };
  }
  foundation(row: any) {
    const { input } = adaptRegionalScenario(row.snapshot.scenario);
    canonical(input);
    const { outage: _outage, ...base } = input;
    return {
      engine: row.snapshot.engineDigest,
      profiles: hash(
        row.snapshot.scenario.profiles
          .map(({ label: _label, ...p }: any) => p)
          .sort((a: any, b: any) =>
            a.id < b.id ? -1 : a.id > b.id ? 1 : a.version - b.version,
          ),
      ),
      architecture: hash([base.nodes, base.edges]),
      network: hash(base.network.map(({ provenance: _p, ...n }: any) => n)),
      workload: hash(base.workload),
      targets: hash([base.targets, base.regionalTargets]),
      routing: hash(base.routing),
      seed: base.seed,
    };
  }
  async compare(owner: string, id: string, raw: Record<string, unknown>) {
    const q = this.store.query(
      z.strictObject({
        otherId: z.uuid(),
        left: z.enum(["baseline", "outage"]).default("baseline"),
        right: z.enum(["baseline", "outage"]).default("outage"),
        repetition: z.coerce.number().int().min(0).max(4).default(0),
      }),
      raw,
    );
    const a = await this.retained(owner, id),
      b = await this.retained(owner, q.otherId),
      left = this.select(a, q.left, q.repetition),
      right = this.select(b, q.right, q.repetition),
      af = this.foundation(a),
      bf = this.foundation(b);
    const reasons = Object.keys(af).filter(
      (k) => hash((af as any)[k]) !== hash((bf as any)[k]),
    );
    if (left.seed !== right.seed) reasons.push("repetition_seed");
    const comparable = reasons.length === 0;
    const rows = [
      "offeredRequests",
      "successfulRequests",
      "failedRequests",
      "unresolvedRequests",
      "attempts",
      "errorRateRatio",
    ].map((metric) => ({
      metric,
      left: left.value.summary[metric],
      right: right.value.summary[metric],
    }));
    for (const field of ["p50Ms", "p95Ms", "p99Ms"])
      rows.push({
        metric: field,
        left: left.value.summary.latency[field],
        right: right.value.summary.latency[field],
      });
    return {
      comparable,
      reasons,
      calibration: "uncalibrated",
      left: {
        runId: id,
        scenario: q.left,
        repetition: q.repetition,
        seed: left.seed,
        verdict: left.value.summary.verdict,
      },
      right: {
        runId: q.otherId,
        scenario: q.right,
        repetition: q.repetition,
        seed: right.seed,
        verdict: right.value.summary.verdict,
      },
      items: rows.map((r) => ({
        ...r,
        delta:
          comparable && r.left !== null && r.right !== null
            ? r.right - r.left
            : null,
      })),
      note: "Right minus left, only for matching foundation and seed. No averaging of percentiles or repetitions.",
    };
  }
  async report(owner: string, id: string) {
    const record = await this.export(owner, id),
      pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica),
      bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]),
      y = 790;
    const line = (text: string, heading = false) => {
      for (const textLine of wrapReportText(
        heading ? bold : font,
        text,
        heading ? 13 : 10,
      )) {
        if (y < 55) {
          page = pdf.addPage([595, 842]);
          y = 790;
        }
        page.drawText(textLine, {
          x: 42,
          y,
          size: heading ? 13 : 10,
          font: heading ? bold : font,
          color: rgb(0.08, 0.13, 0.17),
        });
        y -= 17;
      }
    };
    line("REGION LAB by STRESSFORGE", true);
    line("Recorded experiment report - uncalibrated model estimates");
    line(
      "PDF uses ASCII labels; JSON preserves original Unicode text and encoded distributions.",
    );
    line(
      "Experiment " +
        (record.snapshot.metadata?.name ??
          "Name unavailable in legacy snapshot"),
    );
    line("Run " + id);
    line(
      "Revision " +
        record.run.experimentRevision +
        " | " +
        record.run.engineVersion,
    );
    line("Input " + record.run.inputHash);
    line("Code " + record.snapshot.engineDigest);
    line("Targets " + JSON.stringify(record.snapshot.scenario.targets));
    for (const rep of record.result.repetitions)
      for (const side of ["baseline", "outage"])
        if (rep[side]) {
          line(
            "Repetition " +
              rep.repetition +
              " | seed " +
              rep.seed +
              " | " +
              side,
            true,
          );
          const s = rep[side].summary;
          line(
            "Verdict " +
              s.verdict +
              "; offered " +
              s.offeredRequests +
              "; successful " +
              s.successfulRequests +
              "; failed " +
              s.failedRequests +
              "; unresolved " +
              s.unresolvedRequests,
          );
          line(
            "Error ratio " +
              s.errorRateRatio +
              " | p50/p95/p99 ms " +
              [s.latency.p50Ms, s.latency.p95Ms, s.latency.p99Ms]
                .map((v) => (v === null ? "insufficient samples" : v))
                .join(" / "),
          );
          for (const [region, r] of Object.entries(rep[side].origins) as any) {
            const target =
              record.snapshot.scenario.targets.perRegion.find(
                (t: any) => t.region === region,
              ) ?? record.snapshot.scenario.targets;
            const verdict =
              (r.errorRateRatio !== null &&
                r.errorRateRatio > target.errorBudgetRatio) ||
              (r.latency.p95Ms !== null && r.latency.p95Ms > target.p95Ms)
                ? "fail"
                : r.unresolvedRequests || r.latency.p95Ms === null
                  ? "indeterminate"
                  : "pass";
            line(
              "Region " +
                region +
                " | verdict " +
                verdict +
                " | p95 " +
                (r.latency.p95Ms ?? "insufficient samples") +
                " ms | error ratio " +
                r.errorRateRatio,
            );
            line(
              "Regional targets " +
                JSON.stringify(target) +
                "; offered " +
                r.offeredRequests +
                "; failed " +
                r.failedRequests +
                "; unresolved " +
                r.unresolvedRequests,
            );
          }
          line("Rerouted original roots " + rep[side].regional.reroutedRoots);
          for (const link of rep[side].regional.links)
            line("Network " + JSON.stringify(link));
          for (const n of rep[side].nodes)
            line("Component " + n.id + ": " + JSON.stringify(n));
          for (const p of rep[side].regional?.phases ?? [])
            line("Phase " + JSON.stringify(p));
          for (const warning of [
            ...rep[side].warnings,
            ...rep[side].limitations,
          ])
            line(warning);
        }
    line("Profile provenance", true);
    for (const p of record.result.provenance) line(JSON.stringify(p));
    line("Scenario inputs", true);
    line(JSON.stringify(record.snapshot.scenario));
    line(record.note);
    return Buffer.from(await pdf.save());
  }
}
