import { drawDiagram, drawLegend, fitScale, ILLEGIBLE_SCALE, READABLE_SCALE } from "@/lib/dossier/diagram";
import { A4, MARGIN, type Dossier, type DossierReport, type Op, type Page } from "@/lib/dossier/ops";
import { dossierFileName, encodable, wrap, utcStamp, type Measure } from "@/lib/dossier/text";
import { limitsStatement, noteScopeText, runStatementWith, trafficRows, verdictSentence } from "@/lib/report-presentation";
import { milliseconds, numberText, percent } from "@/lib/result-presentation";

/**
 * The layout of the design dossier: the report document in, pages of drawing operations out (docs/PDF-DOSSIER-SCOPE.md). Pure: the
 * same report, options and measure always give the same pages (rule R2). It adds no figure of its own (R1): every number is the
 * report's, formatted by the same helpers the report page uses.
 */
export interface DossierOptions {
  /** Include the decisions and assumptions the report holds. */
  includeNotes: boolean;
}

const BODY = 9;
const LINE = 1.28;
const GRAY = 0.4;

const SOURCE_LINE: Record<DossierReport["source"], string> = {
  ai: "AI-drafted by a hosted model, then reviewed and created by the owner. The simulation figures below are not AI output.",
  scripted: "Keyword-rules draft (no AI), reviewed and created by the owner.",
  template: "Started from a template.",
  import: "Imported from a file.",
  blank: "Started from a blank canvas.",
};

const PROP_ORDER: [string, (v: number) => string][] = [
  ["replicas", (v) => `${numberText(v, 0)} cop${v === 1 ? "y" : "ies"}`],
  ["capacity", (v) => `capacity ${numberText(v, 2)}`],
  ["latency", (v) => `latency ${milliseconds(v)}`],
  ["hitRatio", (v) => `hit ratio ${percent(v)}`],
  ["share", (v) => `share ${numberText(v, 3)}`],
  ["maxDepth", (v) => `max depth ${numberText(v, 0)}`],
];

/** The settings a component carries, in a fixed order, as one line. Region has its own column. */
export function propertyText(props: Record<string, unknown>): string {
  const parts = PROP_ORDER.flatMap(([key, fmt]) => (typeof props[key] === "number" ? [fmt(props[key] as number)] : []));
  return parts.length ? parts.join(", ") : "defaults";
}

class Layout {
  readonly pages: Page[] = [];
  private page!: Page;
  y = 0;
  replaced = 0;
  constructor(private readonly measure: Measure) {}

  get width() {
    return this.page.width - 2 * MARGIN;
  }
  private get bottom() {
    return this.page.height - MARGIN - 18;
  }
  get left() {
    return MARGIN;
  }
  get room() {
    return this.bottom - this.y;
  }

  newPage(landscape = false) {
    this.page = { width: landscape ? A4.height : A4.width, height: landscape ? A4.width : A4.height, ops: [], replaced: 0 };
    this.pages.push(this.page);
    this.y = MARGIN + (this.pages.length > 1 ? 14 : 0);
  }
  /** Starts a new page unless `h` points still fit. */
  ensure(h: number) {
    if (this.y + h > this.bottom) this.newPage();
  }
  gap(h: number) {
    this.y += h;
  }
  push(...ops: Op[]) {
    this.page.ops.push(...ops);
  }
  /** Encodes for the font, counting what could not be drawn against this page. */
  safe(text: string): string {
    const e = encodable(text);
    this.page.replaced += e.replaced;
    this.replaced += e.replaced;
    return e.text;
  }
  /** Counts characters the font could not draw on the current page (used for text the diagram encoded itself). */
  addReplaced(n: number) {
    this.page.replaced += n;
    this.replaced += n;
  }
  /** Like `safe`, for a given page (the header and footer are added after the pages exist). */
  safeText(text: string, page: Page): string {
    const e = encodable(text);
    page.replaced += e.replaced;
    this.replaced += e.replaced;
    return e.text;
  }
  lines(text: string, width: number, size: number, bold: boolean): string[] {
    return wrap(this.safe(text), width, size, bold, this.measure);
  }

  /** A paragraph; it may continue on the next page, line by line. Nothing is cut. */
  paragraph(text: string, o: { size?: number; bold?: boolean; gray?: number; indent?: number; after?: number } = {}) {
    const size = o.size ?? BODY;
    const indent = o.indent ?? 0;
    for (const line of this.lines(text, this.width - indent, size, !!o.bold)) {
      this.ensure(size * LINE);
      this.push({ k: "text", x: MARGIN + indent, y: this.y + size, size, text: line, bold: o.bold, gray: o.gray });
      this.y += size * LINE;
    }
    this.y += o.after ?? 3;
  }
  heading(text: string) {
    this.ensure(48);
    this.gap(6);
    this.paragraph(text, { size: 12.5, bold: true, after: 2 });
    this.push({ k: "line", x1: MARGIN, y1: this.y, x2: MARGIN + this.width, y2: this.y, width: 0.6, gray: 0.6 });
    this.gap(5);
  }
  bullets(items: string[], size = BODY) {
    for (const item of items) {
      const lines = this.lines(item, this.width - 12, size, false);
      lines.forEach((line, i) => {
        this.ensure(size * LINE);
        if (i === 0) this.push({ k: "text", x: MARGIN + 2, y: this.y + size, size, text: "-" });
        this.push({ k: "text", x: MARGIN + 12, y: this.y + size, size, text: line });
        this.y += size * LINE;
      });
      this.y += 1.5;
    }
    this.y += 2;
  }

  /** A table whose header repeats on every page it continues onto. A row is never split; a cell that is wider wraps. */
  table(columns: { title: string; w: number }[], rows: string[][], size = 8) {
    const pad = 3;
    const total = columns.reduce((s, c) => s + c.w, 0);
    const scale = this.width / total;
    const widths = columns.map((c) => c.w * scale);
    const header = () => {
      const h = size * LINE + 2 * pad;
      this.ensure(h + size * LINE * 2 + 2 * pad);
      this.push({ k: "rect", x: MARGIN, y: this.y, w: this.width, h, width: 0, fill: 0.9 });
      let x = MARGIN;
      columns.forEach((c, i) => {
        this.push({ k: "text", x: x + pad, y: this.y + pad + size, size, bold: true, text: wrap(this.safe(c.title), widths[i] - 2 * pad, size, true, this.measure)[0] });
        x += widths[i];
      });
      this.y += h;
    };
    header();
    for (const row of rows) {
      const cells = row.map((cell, i) => this.lines(cell, widths[i] - 2 * pad, size, false));
      const h = Math.max(...cells.map((c) => c.length)) * size * LINE + 2 * pad;
      if (this.y + h > this.bottom) {
        this.newPage();
        header();
      }
      let x = MARGIN;
      cells.forEach((lines, i) => {
        lines.forEach((line, j) => this.push({ k: "text", x: x + pad, y: this.y + pad + size + j * size * LINE, size, text: line }));
        x += widths[i];
      });
      this.y += h;
      this.push({ k: "line", x1: MARGIN, y1: this.y, x2: MARGIN + this.width, y2: this.y, width: 0.3, gray: 0.7 });
    }
    this.y += 6;
  }
}

export function buildDossier(report: DossierReport, options: DossierOptions, measure: Measure): Dossier {
  const L = new Layout(measure);
  const sim = report.run?.simulation ?? null;
  const labelOf = new Map(report.graph.nodes.map((n) => [n.id, n.label]));

  // ---- Page 1: cover and result ----
  L.newPage();
  L.paragraph(report.name, { size: 20, bold: true, after: 4 });
  L.paragraph(
    `Revision ${report.revision}${report.isCurrentRevision ? " (current)" : " (an earlier revision)"} · saved ${utcStamp(report.versionCreatedAt)} · report made ${utcStamp(report.generatedAt)}`,
    { size: 9, gray: GRAY },
  );
  L.paragraph(SOURCE_LINE[report.source], { size: 9, gray: GRAY, after: 6 });
  if (report.description) L.paragraph(report.description);
  L.paragraph("Model estimate, not a measurement of real infrastructure.", { size: 9.5, bold: true, after: 4 });

  L.heading("Result");
  const status = runStatementWith(report.run, report.revision, utcStamp);
  L.paragraph(status.text, { bold: status.warn });
  if (sim) {
    L.paragraph(verdictSentence(sim.verdict), { size: 12, bold: true, after: 4 });
    L.table(
      [{ title: "Measure", w: 160 }, { title: "Predicted", w: 200 }, { title: "Target", w: 150 }],
      [
        ["p50 latency", milliseconds(sim.p50), "-"],
        ["p95 latency", milliseconds(sim.p95), milliseconds(sim.p95Target)],
        ["p99 latency", milliseconds(sim.p99), "-"],
        ["Error rate", percent(sim.errorRate), percent(sim.errorBudget)],
        ["Throughput", `${numberText(sim.throughput, 0)} requests per second`, "-"],
      ],
      9,
    );
    L.paragraph(
      sim.bottleneck ? `The most loaded component is ${sim.bottleneck.label} (${sim.bottleneck.type}) at ${percent(sim.bottleneck.rho)} utilisation.` : "The model identified no single most-loaded component.",
    );
  }

  // ---- Architecture: under the result when it fits and reads well (scale at least 0.45); otherwise on a page of its own,
  // landscape when that reads better; and when even that cannot be read (scale under 0.3) only a note, with no empty page ----
  const BELOW = 44; // the legend and one line of note under the drawing
  const hereH = L.room - 34 - BELOW;
  const nodesDrawn = report.graph.nodes.length > 0;
  const hereScale = nodesDrawn && hereH >= 180 ? fitScale(report, { w: L.width, h: Math.min(hereH, 380) }).scale : 0;
  const portraitScale = nodesDrawn ? fitScale(report, { w: A4.width - 2 * MARGIN, h: A4.height - 2 * MARGIN - 18 - 14 - 34 - BELOW }).scale : 0;
  const landscapeScale = nodesDrawn ? fitScale(report, { w: A4.height - 2 * MARGIN, h: A4.width - 2 * MARGIN - 18 - 14 - 34 - BELOW }).scale : 0;
  const readableHere = hereScale >= READABLE_SCALE;
  const ownPage = !readableHere && Math.max(portraitScale, landscapeScale) >= ILLEGIBLE_SCALE;
  if (ownPage) L.newPage(portraitScale < READABLE_SCALE && landscapeScale > portraitScale);
  L.heading("Architecture");
  if (!nodesDrawn) L.paragraph("The design has no components.");
  else if (!readableHere && !ownPage) L.paragraph("Too many components to draw legibly on one page; see the component and connection tables that follow.");
  else {
    const box = { x: MARGIN, y: L.y, w: L.width, h: readableHere ? Math.min(L.room - BELOW, 380) : L.room - BELOW };
    const drawn = drawDiagram(report, box, measure);
    L.push(...drawn.ops);
    L.addReplaced(drawn.replaced);
    L.y = box.y + drawn.height + 8;
    L.push(...drawLegend(MARGIN, L.y, measure).ops);
    L.gap(14);
    L.paragraph(
      sim && !report.run?.matchesRevision
        ? `Results are not drawn: the recorded run is for revision ${report.run?.designRevision}, not revision ${report.revision}.`
        : sim
          ? "Each box shows the component's own name, type and region, and the model's utilisation for it at the traffic tested."
          : "No test run is recorded for this revision, so no results are drawn.",
      { size: 8, gray: GRAY },
    );
  }

  // ---- Details ----
  L.newPage();
  L.heading("Components");
  const resultOf = new Map((sim?.components ?? []).map((c) => [c.id ?? c.label, c]));
  L.table(
    [{ title: "Component", w: 88 }, { title: "Type", w: 38 }, { title: "Region", w: 46 }, { title: "Settings", w: 125 }, { title: "Peak rps", w: 46 }, { title: "Use", w: 36 }, { title: "Status", w: 58 }, { title: "Errors", w: 40 }],
    report.graph.nodes.map((n) => {
      const r = sim && report.run?.matchesRevision ? (resultOf.get(n.id) ?? [...resultOf.values()].find((c) => c.label === n.label && !c.id)) : undefined;
      const region = (n.props as { region?: string }).region ?? "-";
      return [n.label, n.type, region, propertyText(n.props as Record<string, unknown>), r ? numberText(r.peak, 1) : "-", r ? percent(r.rho) : "-", r ? r.status : "no result", r ? percent(r.errors) : "-"];
    }),
  );
  L.paragraph(`${report.graph.nodes.length} component${report.graph.nodes.length === 1 ? "" : "s"} and ${report.graph.edges.length} connection${report.graph.edges.length === 1 ? "" : "s"}.`, { gray: GRAY });

  if (report.graph.edges.length) {
    L.heading("Connections");
    L.table([{ title: "From", w: 250 }, { title: "To", w: 250 }], report.graph.edges.map((e) => [labelOf.get(e.from) ?? e.from, labelOf.get(e.to) ?? e.to]));
  }

  L.heading("Traffic");
  L.paragraph(sim ? "The traffic this result was recorded at:" : "The traffic saved with this revision:", { gray: GRAY });
  L.table([{ title: "Setting", w: 220 }, { title: "Value", w: 280 }], trafficRows(sim && report.run ? report.run.traffic : report.traffic).map(([k, v]) => [k, v]));
  if (sim && report.run && JSON.stringify(report.run.traffic) !== JSON.stringify(report.traffic)) L.paragraph("The traffic saved with this revision differs from the traffic the result was recorded at.", { gray: GRAY });

  L.heading("Limits");
  L.paragraph(limitsStatement(report.limits));

  if (options.includeNotes) {
    L.heading("Decisions and assumptions");
    L.paragraph(noteScopeText(report.noteScope), { gray: GRAY });
    if (!report.notes.length) L.paragraph(report.noteScope === "none" ? "The owner did not include notes." : "No notes were written for this design.");
    else L.bullets(report.notes.map((n) => `${n.kind === "decision" ? "Decision" : "Assumption"} (revision ${n.revision}): ${n.text}`));
  }

  L.heading("What these numbers are");
  L.bullets(report.limitations);

  // ---- Header and footer on every page ----
  const total = L.pages.length;
  L.pages.forEach((page, i) => {
    const pushText = (text: string, x: number, y: number, size: number, gray: number, bold = false) => page.ops.push({ k: "text", x, y, size, text, gray, bold });
    if (i > 0) pushText(L.safeText(report.name, page), MARGIN, 26, 8, GRAY);
    const run = report.run ? report.run.id : "no run recorded";
    const left = L.safeText(`Design ${report.designId} · revision ${report.revision} · run ${run} · engine ${report.run?.engineVersion ?? "n/a"} · StressForge`, page);
    const right = `Page ${i + 1} of ${total}`;
    const rightX = page.width - MARGIN - measure(right, 7, false);
    page.ops.push({ k: "line", x1: MARGIN, y1: page.height - MARGIN - 8, x2: page.width - MARGIN, y2: page.height - MARGIN - 8, width: 0.4, gray: 0.6 });
    pushText(left, MARGIN, page.height - MARGIN + 2, 6.5, GRAY);
    pushText(right, rightX, page.height - MARGIN + 2, 7, GRAY);
    if (page.replaced > 0) pushText("Some characters could not be shown on this page.", MARGIN, page.height - MARGIN + 11, 6.5, GRAY, true);
  });

  return { title: `${report.name} - revision ${report.revision} report`, fileName: dossierFileName(report.name, report.revision), pages: L.pages, replaced: L.replaced };
}
