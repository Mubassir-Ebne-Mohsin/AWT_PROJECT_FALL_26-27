import type { LibraryItem, LibraryQuery } from "@/lib/api/library";

export const DEFAULT_QUERY: LibraryQuery = { q: "", sort: "updated", verdict: "", archived: "active", page: 1 };

const SORTS = ["updated", "name", "lastRun"] as const;
const VERDICTS = ["", "pass", "strained", "fail", "none"] as const;
const ARCHIVED = ["active", "archived", "all"] as const;

/** Reads filters from the URL; anything unknown falls back to the default rather than reaching the API. */
export function queryFromParams(p: URLSearchParams): LibraryQuery {
  const pick = <T extends string>(v: string | null, allowed: readonly T[], d: T) => (allowed.includes(v as T) ? (v as T) : d);
  const page = Number(p.get("page"));
  return {
    q: (p.get("q") ?? "").slice(0, 100),
    sort: pick(p.get("sort"), SORTS, "updated"),
    verdict: pick(p.get("verdict"), VERDICTS, ""),
    archived: pick(p.get("archived"), ARCHIVED, "active"),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Only non-default values are written, so the plain /designs URL stays clean. */
export function paramsFromQuery(q: LibraryQuery) {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.sort !== DEFAULT_QUERY.sort) p.set("sort", q.sort);
  if (q.verdict) p.set("verdict", q.verdict);
  if (q.archived !== DEFAULT_QUERY.archived) p.set("archived", q.archived);
  if (q.page > 1) p.set("page", String(q.page));
  return p.toString();
}

export function isFiltered(q: LibraryQuery) {
  return !!q.q.trim() || !!q.verdict || q.archived !== "active";
}

export function resultLabel(run: LibraryItem["latestRun"], revision: number) {
  if (!run) return { label: "No result yet", tone: "" };
  const stale = run.designRevision !== revision ? "Earlier revision · " : "";
  if (run.status === "pending") return { label: stale + (run.kind === "limits" ? "Limits search running" : "Test running"), tone: "" };
  if (run.status === "failed") return { label: stale + "Calculation failed", tone: "fail" };
  const v = run.verdict;
  const label = v === "pass" ? "Passing" : v === "strained" ? "Strained" : v === "fail" ? "Missing target" : "Completed";
  const tone = stale ? "" : v === "pass" ? "ok" : v === "strained" ? "warn" : v === "fail" ? "fail" : "";
  return { label: stale + label, tone };
}
