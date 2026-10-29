"use client";

import { useId } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { ReportDocument } from "@/components/report/report-document";
import { Crumbs } from "@/components/shell/crumbs";
import { ApiError } from "@/lib/api/errors";
import { fetchRunSummaries, fetchVersions } from "@/lib/api/history";
import { fetchReport } from "@/lib/api/report";
import { dateText, reportFileTitle } from "@/lib/report-presentation";
import { verdictLabel } from "@/lib/history-presentation";
import { resolveRoute } from "@/lib/routes";

function failureText(e: unknown) {
  if (e instanceof ApiError && e.status === 403) return "This design belongs to another account.";
  if (e instanceof ApiError && e.status === 404) return "That design, version or result is no longer available.";
  if (e instanceof ApiError && e.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  return "The report could not be made. Nothing was changed.";
}

export function ReportView({ id }: { id: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const uid = useId();
  const revisionParam = Number(params.get("revision"));
  const revision = Number.isInteger(revisionParam) && revisionParam >= 1 ? revisionParam : undefined;
  const runParam = params.get("run") ?? undefined;
  const run = runParam && /^[0-9a-f-]{36}$/i.test(runParam) ? runParam : undefined;

  const go = (next: { revision?: number; run?: string }) => {
    const p = new URLSearchParams();
    if (next.revision) p.set("revision", String(next.revision));
    if (next.run) p.set("run", next.run);
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const report = useQuery({
    queryKey: ["report", user?.id, id, revision, run],
    queryFn: ({ signal }) => fetchReport(id, { revision, run }, signal),
    enabled: !!user,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const versions = useQuery({ queryKey: ["report-versions", user?.id, id], queryFn: ({ signal }) => fetchVersions(id, undefined, signal), enabled: !!user, retry: false });
  const runs = useQuery({ queryKey: ["report-runs", user?.id, id], queryFn: ({ signal }) => fetchRunSummaries(id, signal), enabled: !!user, retry: false });

  const data = report.data;
  const newest = versions.data?.[0]?.revision;
  const completed = (runs.data ?? []).filter((r) => r.kind === "simulation" && r.status === "completed");

  function print() {
    if (!data) return;
    const before = document.title;
    document.title = reportFileTitle(data);
    window.print();
    document.title = before;
  }

  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute(`/designs/${id}/report`)} />
      <div className="page-head m16-noprint">
        <div className="stack">
          <span className="eyebrow">Report</span>
          <h1 className="h1">Report</h1>
          <p className="lede">A printable record of one revision and one recorded result.</p>
        </div>
        <div className="row">
          <Link className="btn" href={`/designs/${id}/edit`}>
            Back to the design
          </Link>
          <button className="btn btn-primary" type="button" disabled={!data} onClick={print}>
            Print or save as PDF
          </button>
        </div>
      </div>

      <form className="m15-pickers m16-noprint" aria-label="Choose what the report covers" onSubmit={(e) => e.preventDefault()}>
        <div className="m15-field">
          <label htmlFor={uid + "r"}>Revision</label>
          <select
            id={uid + "r"}
            value={revision ?? ""}
            onChange={(e) => go({ revision: e.target.value ? Number(e.target.value) : undefined })}
            disabled={!versions.data}
          >
            <option value="">{newest ? `Current (revision ${newest})` : "Current"}</option>
            {(versions.data ?? []).map((v) => (
              <option key={v.revision} value={v.revision}>
                Revision {v.revision} · {dateText(v.createdAt)}
              </option>
            ))}
          </select>
        </div>
        <div className="m15-field">
          <label htmlFor={uid + "u"}>Result</label>
          <select id={uid + "u"} value={run ?? ""} onChange={(e) => go({ revision, run: e.target.value || undefined })} disabled={!runs.data}>
            <option value="">Latest result for this revision</option>
            {completed.map((r) => (
              <option key={r.id} value={r.id}>
                Revision {r.designRevision} · {dateText(r.createdAt)} · {verdictLabel(r.verdict)}
              </option>
            ))}
          </select>
        </div>
      </form>

      {report.isError && !data ? (
        <div className="panel stack" role="alert">
          <h2 className="h3">The report could not be made</h2>
          <p className="hint">{failureText(report.error)}</p>
          <button className="btn" type="button" onClick={() => void report.refetch()}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="hint" role="status">
          Preparing the report…
        </p>
      ) : (
        <ReportDocument report={data} />
      )}
    </div>
  );
}
