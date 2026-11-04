import type { components } from "@/lib/api/phase3-schema";

/** The report document the PDF is made from: the server's own, with nothing added. */
export type DossierReport = components["schemas"]["DesignReport"];

/**
 * The PDF as a list of drawing operations per page, with the origin at the top left and y growing downwards. The layout code builds
 * this and knows nothing about the PDF library; `render.ts` turns it into bytes. That keeps the layout testable in plain Node.
 */
export type Op =
  | { k: "text"; x: number; y: number; size: number; text: string; bold?: boolean; gray?: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; width: number; dash?: [number, number]; gray?: number }
  | { k: "rect"; x: number; y: number; w: number; h: number; width: number; dash?: [number, number]; fill?: number; gray?: number };

export interface Page {
  width: number;
  height: number;
  ops: Op[];
  /** Characters on this page that the font cannot draw and that were replaced with "?". */
  replaced: number;
}

export interface Dossier {
  title: string;
  fileName: string;
  pages: Page[];
  /** The text the document contains, line by line, for tests and for the file's accessibility summary. */
  replaced: number;
}

export const A4 = { width: 595, height: 842 } as const;
export const MARGIN = 40;
