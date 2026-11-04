/**
 * Text handling for the PDF dossier (docs/PDF-DOSSIER-SCOPE.md, rules R3 and R4). The PDF uses the standard Helvetica font, which
 * draws Latin text only. Anything it cannot draw is replaced with "?" and counted, so the page can say so. Nothing is cut silently.
 */

/** Width of a string in points at a font size. The real renderer passes the font's own measure; tests pass a fixed one. */
export type Measure = (text: string, size: number, bold: boolean) => number;

// Characters in the Windows-1252 range above 0x7F that are not in Latin-1 but are in the font's encoding.
const WIN_ANSI_EXTRA = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178]);

export const drawable = (code: number) => (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || WIN_ANSI_EXTRA.has(code);

/** The text with every character the font cannot draw replaced by "?", and how many were replaced. Tabs and line breaks become spaces. */
export function encodable(text: string): { text: string; replaced: number } {
  let out = "";
  let replaced = 0;
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (ch === "\t" || ch === "\n" || ch === "\r") out += " ";
    else if (code === 0xa0) out += " ";
    else if (drawable(code)) out += ch;
    else {
      out += "?";
      replaced++;
    }
  }
  return { text: out, replaced };
}

/** Lines no wider than `width`, broken at spaces; a single word wider than the line is broken by characters. Never loses a character. */
export function wrap(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? line + " " + word : word;
      if (measure(candidate, size, bold) <= width || !candidate) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      let rest = word;
      while (rest && measure(rest, size, bold) > width) {
        let cut = rest.length;
        while (cut > 1 && measure(rest.slice(0, cut), size, bold) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** Shortens to fit with an ellipsis (three dots). Used in the diagram only; the full text always appears in a table. */
export function shorten(text: string, width: number, size: number, bold: boolean, measure: Measure): string {
  if (measure(text, size, bold) <= width) return text;
  let cut = text.length;
  while (cut > 1 && measure(text.slice(0, cut) + "...", size, bold) > width) cut--;
  return text.slice(0, cut).trimEnd() + "...";
}

/** `<design name>-rev<N>-report.pdf`: lower case letters, digits and hyphens, at most 60 characters of name. */
export function dossierFileName(name: string, revision: number): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "design"}-rev${revision}-report.pdf`;
}

/** A fixed UTC date, so the same input always gives the same text: 2026-11-04 14:05 UTC. */
export function utcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown date";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
