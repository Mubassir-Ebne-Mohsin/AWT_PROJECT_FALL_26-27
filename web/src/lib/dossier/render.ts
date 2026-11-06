import { PDFDocument, StandardFonts, grayscale, type PDFFont } from "pdf-lib";
import { buildDossier, type DossierOptions } from "@/lib/dossier/model";
import type { Dossier, DossierReport, Op } from "@/lib/dossier/ops";
import type { Measure } from "@/lib/dossier/text";

/**
 * The only file that imports the PDF library. The layout is made first (model.ts, with the real font's measure), then each
 * drawing operation is turned into PDF drawing calls. Standard fonts only: Latin text (docs/PDF-DOSSIER-SCOPE.md, rule R3).
 */
export async function renderDossier(report: DossierReport, options: DossierOptions): Promise<{ bytes: Uint8Array; dossier: Dossier }> {
  return renderPdfDocument((measure) => buildDossier(report, options, measure), report.generatedAt,
    "Design report: a model estimate, not a measurement of real infrastructure");
}

/** Shared drawing pipeline; each caller supplies its own aggregate layout and fixed snapshot metadata. */
export async function renderPdfDocument(build: (measure: Measure) => Dossier, generatedAt: string, subject: string): Promise<{ bytes: Uint8Array; dossier: Dossier }> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const measure: Measure = (text, size, isBold) => (isBold ? bold : regular).widthOfTextAtSize(text, size);
  const dossier = build(measure);

  // Fixed metadata, so the same report gives the same file.
  const made = new Date(generatedAt);
  doc.setTitle(dossier.title);
  doc.setAuthor("StressForge");
  doc.setSubject(subject);
  doc.setCreator("StressForge");
  doc.setProducer("StressForge (pdf-lib)");
  if (!Number.isNaN(made.getTime())) {
    doc.setCreationDate(made);
    doc.setModificationDate(made);
  }

  for (const spec of dossier.pages) {
    const page = doc.addPage([spec.width, spec.height]);
    const fontFor = (op: Extract<Op, { k: "text" }>): PDFFont => (op.bold ? bold : regular);
    for (const op of spec.ops) {
      if (op.k === "text") {
        page.drawText(op.text, { x: op.x, y: spec.height - op.y, size: op.size, font: fontFor(op), color: grayscale(op.gray ?? 0) });
      } else if (op.k === "line") {
        page.drawLine({
          start: { x: op.x1, y: spec.height - op.y1 },
          end: { x: op.x2, y: spec.height - op.y2 },
          thickness: op.width,
          color: grayscale(op.gray ?? 0),
          ...(op.dash ? { dashArray: op.dash } : {}),
        });
      } else {
        page.drawRectangle({
          x: op.x,
          y: spec.height - op.y - op.h,
          width: op.w,
          height: op.h,
          ...(op.fill !== undefined ? { color: grayscale(op.fill) } : {}),
          ...(op.width > 0 ? { borderWidth: op.width, borderColor: grayscale(op.gray ?? 0), ...(op.dash ? { borderDashArray: op.dash } : {}) } : {}),
        });
      }
    }
  }
  return { bytes: await doc.save(), dossier };
}

/** Hands the bytes to the browser as a file download. Browser only. */
export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
