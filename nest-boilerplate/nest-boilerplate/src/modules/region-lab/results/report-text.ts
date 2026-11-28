import type { PDFFont } from "pdf-lib";
/** Preserve all printable text while fitting the actual embedded font's page width. */
export function wrapReportText(
  font: PDFFont,
  text: string,
  size: number,
  width = 511,
): string[] {
  const clean = text.replace(/[^\x20-\x7e]/gu, "?");
  if (!clean.length) return [""];
  const lines: string[] = [];
  for (let start = 0; start < clean.length;) {
    let end = Math.min(clean.length, start + 90);
    while (
      end > start + 1 &&
      font.widthOfTextAtSize(clean.slice(start, end), size) > width
    )
      end--;
    const space = clean.lastIndexOf(" ", end - 1);
    if (end < clean.length && space > start + 20) end = space + 1;
    lines.push(clean.slice(start, end));
    start = end;
  }
  return lines;
}
