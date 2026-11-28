import { PDFDocument, StandardFonts } from "pdf-lib";
import { wrapReportText } from "@/modules/region-lab/results/report-text";
it("keeps long names and unbroken JSON inside PDF margins using the real font metrics", async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.HelveticaBold),
    text = "W".repeat(200) + " configuration " + "ABCDEFG".repeat(200);
  const lines = wrapReportText(font, text, 13);
  expect(lines.join("")).toBe(text);
  expect(lines.length).toBeGreaterThan(3);
  for (const line of lines)
    expect(font.widthOfTextAtSize(line, 13)).toBeLessThanOrEqual(511);
});
it("handles an empty line and Unicode labels without invalid standard-font encoding", async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  expect(wrapReportText(font, "", 10)).toEqual([""]);
  const lines = wrapReportText(font, "Region 😀", 10);
  expect(lines).toEqual(["Region ?"]);
  expect(() => font.encodeText(lines[0])).not.toThrow();
});
