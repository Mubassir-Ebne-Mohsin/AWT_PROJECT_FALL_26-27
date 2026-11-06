import type { Op, Page } from "@/lib/dossier/ops";
import type { Measure } from "@/lib/dossier/text";

// The landing wordmark's stacked layers, shared with the print view. No remote/raster asset.
export const BRAND_PATH = "m15 2 13 7-13 7L2 9Zm-13 14 13 7 13-7M2 23l13 7 13-7";
export const BRAND_NAME = "STRESSFORGE.";
export function sourceCredit(generatedAt: string): string {
  const year = new Date(generatedAt).getUTCFullYear();
  return `© ${Number.isFinite(year) ? year : 2026} STRESSFORGE · Generated with STRESSFORGE`;
}

/** Top-right on every page, inside the existing margins; source credit below the report footer. */
export function pdfBrandOps(page: Pick<Page, "width" | "height">, measure: Measure, generatedAt: string): Op[] {
  const size = 11, scale = 0.6, y = 12;
  const x = page.width - 40 - (22 + measure(BRAND_NAME, size, true));
  const paths = [ [[15,2],[28,9],[15,16],[2,9],[15,2]], [[2,16],[15,23],[28,16]], [[2,23],[15,30],[28,23]] ];
  const ops: Op[] = [];
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    ops.push({ k: "line", x1: x + path[i-1][0]*scale, y1: y + path[i-1][1]*scale,
      x2: x + path[i][0]*scale, y2: y + path[i][1]*scale, width: 1, gray: 0 });
  }
  ops.push({ k: "text", x: x + 22, y: y + 13, size, text: BRAND_NAME, bold: true, gray: 0 });
  ops.push({ k: "text", x: 40, y: page.height - 14, size: 7, text: sourceCredit(generatedAt), gray: 0.35 });
  return ops;
}

/** Chromium print margin boxes repeat outside content, including on fragmented/long pages. */
export function printBrandCss(generatedAt: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="152" height="26" viewBox="0 0 152 26"><g transform="translate(0 1) scale(.72)"><path d="${BRAND_PATH}" fill="none" stroke="black" stroke-width="2"/></g><text x="28" y="18" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700" fill="black">${BRAND_NAME}</text></svg>`;
  return `@page { @top-right { content: url("data:image/svg+xml,${encodeURIComponent(svg)}"); vertical-align: middle; } @bottom-left { content: "${sourceCredit(generatedAt)}"; color: #000; font: 7pt Arial, sans-serif; } }`;
}
