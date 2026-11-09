import { renderMail, reportUrl } from "@/modules/mails/templates";

describe("mail templates", () => {
  const url = "http://localhost:3000/reports/abc";

  it("says only a fixed sentence, the report number, a closed status word and a link", () => {
    const reply = renderMail("support_reply", { ref: 1042, status: "open", url });
    expect(reply.subject).toBe("Support replied to your report SF-1042");
    expect(reply.text).toContain(url);
    const status = renderMail("report_status", { ref: 7, status: "waiting", url });
    expect(status.subject).toBe("Your report SF-7 is now waiting for your reply");
  });

  it("never prints an unknown status or a non-numeric number from the database", () => {
    const m = renderMail("report_status", { ref: Number("12abc"), status: "<script>x</script>", url });
    expect(m.subject).toBe("Your report SF-NaN is now updated");
    expect(m.html).not.toContain("<script>");
  });

  it("escapes the link in the HTML body", () => {
    const m = renderMail("support_reply", { ref: 1, status: "open", url: 'http://x/"><img src=x>' });
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&quot;&gt;&lt;img");
  });

  it("builds the link from the front-end address without a double slash", () => {
    expect(reportUrl("http://localhost:3000/", "a b")).toBe("http://localhost:3000/reports/a%20b");
  });
});
