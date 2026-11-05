import type { DossierReport, Op } from "@/lib/dossier/ops";
import { encodable, shorten, type Measure } from "@/lib/dossier/text";
import { compactTokens } from "@/lib/dossier/settings";
import { percent } from "@/lib/result-presentation";

/**
 * The architecture diagram, drawn from the graph's own positions (rules R5 and R6 in docs/PDF-DOSSIER-SCOPE.md). A component's result
 * is shown as TEXT and as a border style, never by colour alone, so it reads in grey-scale print. When the scale would make the
 * labels unreadable the caller is told, and the page says so instead of drawing something illegible.
 */
export const NODE_W = 150;
export const NODE_H = 60;
export const READABLE_SCALE = 0.45;
export const ILLEGIBLE_SCALE = 0.3;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The scale that fits the graph in the box (never enlarged beyond 1), and the size the graph needs at scale 1. */
export function fitScale(report: Pick<DossierReport, "graph">, box: Pick<Box, "w" | "h">): { scale: number; width: number; height: number } {
  const nodes = report.graph.nodes;
  if (!nodes.length) return { scale: 1, width: 0, height: 0 };
  const minX = Math.min(...nodes.map((n) => n.x)), maxX = Math.max(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y)), maxY = Math.max(...nodes.map((n) => n.y));
  const width = maxX - minX + NODE_W, height = maxY - minY + NODE_H;
  return { scale: Math.min(1, box.w / width, box.h / height), width, height };
}

/**
 * The smallest vertical distance, in the graph's own units, between two components that sit over the same stretch of the page: no box
 * may grow past it without touching the box below. Large when no two components share a column.
 */
export function verticalClearance(nodes: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const dy = Math.abs(nodes[i].y - nodes[j].y);
      if (dy > 0 && Math.abs(nodes[i].x - nodes[j].x) < NODE_W) best = Math.min(best, dy);
    }
  return best;
}

export const MAX_SETTINGS_LINES = 2;

/** Packs the settings, in order, onto as few lines as fit the width; an item is never split. Always at least one line when there are items. */
export function wrapTokens(tokens: string[], width: number, size: number, measure: Measure): string[] {
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const next = current ? current + "  " + token : token;
    if (current && measure(next, size, false) > width) {
      lines.push(current);
      current = token;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

const STATUS_WORD = { ok: "ok", warn: "near limit", fail: "over limit", idle: "idle" } as const;
type Status = keyof typeof STATUS_WORD;

/** Border style per status: solid, dashed, double, dotted. The legend explains them in words. */
function borderOps(status: Status | null, x: number, y: number, w: number, h: number): Op[] {
  const rect = (inset: number, width: number, dash?: [number, number]): Extract<Op, { k: "rect" }> => ({ k: "rect", x: x + inset, y: y + inset, w: w - 2 * inset, h: h - 2 * inset, width, ...(dash ? { dash } : {}) });
  if (status === "fail") return [{ ...rect(0, 1.2), fill: 1 }, rect(2, 1.2)];
  if (status === "warn") return [{ ...rect(0, 1.4, [4, 2]), fill: 1 }];
  if (status === "idle") return [{ ...rect(0, 0.7, [1, 2]), fill: 1 }];
  if (status === "ok") return [{ ...rect(0, 1), fill: 1 }];
  return [{ ...rect(0, 0.5), fill: 1 }];
}

/** The point where the line from the centre of the box towards (tx, ty) leaves the box. */
function exitPoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number) {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const t = Math.min(dx === 0 ? Infinity : w / 2 / Math.abs(dx), dy === 0 ? Infinity : h / 2 / Math.abs(dy));
  return { x: cx + dx * t, y: cy + dy * t };
}

export interface Drawn {
  ops: Op[];
  scale: number;
  legible: boolean;
  /** The height the drawing actually uses, so the caller can place what follows right under it. */
  height: number;
  /** Characters replaced because the font cannot draw them. */
  replaced: number;
  /** True when each box also carries a line of its main settings (there was room, and at least one component has settings). */
  settings: boolean;
}

/** What the diagram can truthfully say about each component's result. Statuses belong to the report's revision only if the run matches it. */
export function statusesFor(report: DossierReport): Map<string, { status: Status; rho: number }> | null {
  const run = report.run;
  if (!run || !run.matchesRevision || !run.simulation) return null;
  const byId = new Map<string, { status: Status; rho: number }>();
  const labelCount = new Map<string, number>();
  for (const n of report.graph.nodes) labelCount.set(n.label, (labelCount.get(n.label) ?? 0) + 1);
  for (const c of run.simulation.components) {
    if (c.id && report.graph.nodes.some((n) => n.id === c.id)) byId.set(c.id, { status: c.status, rho: c.rho });
    else if (labelCount.get(c.label) === 1) {
      const node = report.graph.nodes.find((n) => n.label === c.label);
      if (node) byId.set(node.id, { status: c.status, rho: c.rho });
    }
  }
  return byId;
}

export function drawDiagram(report: DossierReport, box: Box, measure: Measure): Drawn {
  const nodes = report.graph.nodes;
  const { scale, width, height } = fitScale(report, box);
  if (!nodes.length) return { ops: [], scale: 1, legible: true, height: 0, replaced: 0, settings: false };
  if (scale < ILLEGIBLE_SCALE) return { ops: [], scale, legible: false, height: 0, replaced: 0, settings: false };
  const statuses = statusesFor(report);
  const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
  // Centred across the box, but top-aligned, so what follows sits right under the drawing.
  const ox = box.x + (box.w - width * scale) / 2, oy = box.y;
  const baseH = NODE_H * scale;
  const place = new Map(nodes.map((n) => [n.id, { x: ox + (n.x - minX) * scale, y: oy + (n.y - minY) * scale }]));
  const size = Math.max(4, Math.min(8, 14 * scale));
  const small = Math.max(3.5, size - 1.5);
  // A box grows only as far as the settings lines need, and only where the boxes above and below leave room and the page has the
  // height. Otherwise the box keeps its usual size and the lines are left out: the Components table still lists every setting.
  const bw = NODE_W * scale;
  const lineGap = 1.5;
  const needFor = (lines: number) => 12.5 + size + (2 + lines) * small + (lines - 1) * lineGap;
  const wrapped = nodes.map((n) => wrapTokens(compactTokens(n.props as Record<string, unknown>), bw - 8, small, measure));
  const wanted = Math.min(MAX_SETTINGS_LINES, Math.max(0, ...wrapped.map((w) => w.length)));
  const clearance = verticalClearance(nodes) * scale - 3;
  const pageRoom = Math.max(0, box.h - height * scale);
  const reach = Math.min(clearance, baseH + pageRoom);
  // Prefer the full lines; if they do not fit, one line (cut short with "...") if that fits; otherwise none.
  const lines = wanted >= 1 && reach >= needFor(wanted) ? wanted : wanted >= 1 && reach >= needFor(1) ? 1 : 0;
  const withSettings = lines > 0;
  const bh = withSettings ? Math.max(baseH, needFor(lines)) : baseH;
  const ops: Op[] = [];
  let replaced = 0;

  // Connections first, so the boxes (filled) sit over the line ends.
  for (const e of report.graph.edges) {
    const a = place.get(e.from), b = place.get(e.to);
    if (!a || !b) continue;
    const ac = { x: a.x + bw / 2, y: a.y + bh / 2 }, bc = { x: b.x + bw / 2, y: b.y + bh / 2 };
    const start = exitPoint(ac.x, ac.y, bw, bh, bc.x, bc.y), end = exitPoint(bc.x, bc.y, bw, bh, ac.x, ac.y);
    ops.push({ k: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y, width: 0.8, gray: 0.25 });
    const angle = Math.atan2(end.y - start.y, end.x - start.x), head = Math.max(3, 6 * Math.min(1, scale * 1.5));
    for (const side of [-0.45, 0.45]) ops.push({ k: "line", x1: end.x, y1: end.y, x2: end.x - head * Math.cos(angle + side), y2: end.y - head * Math.sin(angle + side), width: 0.8, gray: 0.25 });
  }

  for (const n of nodes) {
    const p = place.get(n.id)!;
    const result = statuses?.get(n.id) ?? null;
    ops.push(...borderOps(result?.status ?? null, p.x, p.y, bw, bh));
    const label = encodable(shorten(n.label, bw - 8, size, true, measure));
    const meta = encodable(shorten(`${n.type}${n.props && "region" in n.props && n.props.region ? " · " + n.props.region : ""}`, bw - 8, small, false, measure));
    const status = encodable(shorten(result ? `${STATUS_WORD[result.status]} ${percent(result.rho)}` : "no result", bw - 8, small, false, measure));
    replaced += label.replaced + meta.replaced + status.replaced;
    ops.push({ k: "text", x: p.x + 4, y: p.y + 4 + size, size, bold: true, text: label.text });
    ops.push({ k: "text", x: p.x + 4, y: p.y + 6 + size + small, size: small, text: meta.text, gray: 0.35 });
    if (withSettings) {
      const mine = wrapped[nodes.indexOf(n)];
      // When only one line fits, the tokens are joined and cut short; otherwise each wrapped line is drawn as it is.
      const rows = lines === 1 && mine.length > 1 ? [mine.join("  ")] : mine.slice(0, lines);
      rows.forEach((row, k) => {
        const line = encodable(shorten(row, bw - 8, small, false, measure));
        replaced += line.replaced;
        if (line.text) ops.push({ k: "text", x: p.x + 4, y: p.y + 6 + size + small + (k + 1) * (small + lineGap), size: small, text: line.text });
      });
    }
    ops.push({ k: "text", x: p.x + 4, y: p.y + bh - 4, size: small, text: status.text });
  }
  return { ops, scale, legible: true, height: height * scale + Math.max(0, bh - baseH), replaced, settings: withSettings };
}

/** The legend in words: how a status is shown without colour. Returned as lines so the caller lays it out. */
export const LEGEND: { status: Status | null; text: string }[] = [
  { status: "ok", text: "solid border: ok" },
  { status: "warn", text: "dashed border: near its limit" },
  { status: "fail", text: "double border: over its limit" },
  { status: "idle", text: "dotted border: idle" },
  { status: null, text: "thin border: no result for this revision" },
];

/** Legend swatches as drawing operations in a row starting at (x, y). */
export function drawLegend(x: number, y: number, measure: Measure): { ops: Op[]; width: number } {
  const ops: Op[] = [];
  let cx = x;
  for (const item of LEGEND) {
    ops.push(...borderOps(item.status, cx, y, 14, 9));
    const t = encodable(item.text).text;
    ops.push({ k: "text", x: cx + 18, y: y + 7, size: 6.5, text: t });
    cx += 18 + measure(t, 6.5, false) + 12;
  }
  return { ops, width: cx - x };
}
