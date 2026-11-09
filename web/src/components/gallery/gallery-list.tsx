"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crumbs } from "@/components/shell/crumbs";
import { fetchGallery, VERDICT_LABEL, VERDICT_TONE, type GalleryFilters, type GalleryVerdict } from "@/lib/api/gallery";
import { dateText } from "@/lib/report-presentation";
import { milliseconds } from "@/lib/result-presentation";
import { resolveRoute } from "@/lib/routes";

const VERDICTS: GalleryVerdict[] = ["pass", "strained", "fail"];

/** The gallery: published designs, newest first. Signed-in people only. Posts are frozen snapshots, never live designs. */
export function GalleryList() {
  const [filters, setFilters] = useState<GalleryFilters>({});
  const [draft, setDraft] = useState("");
  const q = useQuery({
    queryKey: ["gallery", filters],
    queryFn: ({ signal }) => fetchGallery(filters, signal),
    retry: false,
  });
  const set = (patch: Partial<GalleryFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const data = q.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/gallery")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Community</span>
          <h1 className="h1">Gallery</h1>
          <p className="lede">Designs other people published, with the result they were tested at. Open one to read it, or remix it into your own account.</p>
        </div>
      </div>

      <form
        className="row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: draft });
        }}
      >
        <label className="sr-only" htmlFor="gallery-q">
          Search the gallery
        </label>
        <input id="gallery-q" className="input" style={{ flex: "1 1 260px" }} placeholder="Search titles and descriptions" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn" type="submit">
          Search
        </button>
        <label className="row tight">
          <span className="small muted">Result</span>
          <select className="input" aria-label="Filter by result" value={filters.verdict ?? ""} onChange={(e) => set({ verdict: (e.target.value || undefined) as GalleryVerdict | undefined })}>
            <option value="">Any</option>
            {VERDICTS.map((v) => (
              <option key={v} value={v}>
                {VERDICT_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="row tight">
          <input type="checkbox" checked={!!filters.mine} onChange={(e) => set({ mine: e.target.checked || undefined })} />
          <span className="small">Only mine</span>
        </label>
      </form>

      {q.isPending && <p role="status">Loading the gallery…</p>}
      {q.isError && (
        <div className="panel stack" role="alert">
          <h2 className="h3">The gallery could not be loaded</h2>
          <p className="hint">Check the connection and try again.</p>
          <button className="btn" type="button" onClick={() => void q.refetch()}>
            Try again
          </button>
        </div>
      )}
      {data && data.items.length === 0 && (
        <div className="panel stack" data-testid="gallery-empty">
          <h2 className="h3">{filters.q || filters.verdict || filters.mine ? "No designs match these filters" : "Nothing is published yet"}</h2>
          <p className="hint">Run a test on one of your designs, then choose Publish to the gallery on its Results tab.</p>
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }} data-testid="gallery-items">
          {data.items.map((p) => (
            <li key={p.id}>
              <article className="card stack">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h2 className="h3" style={{ margin: 0 }}>
                    <Link href={"/gallery/" + p.id}>{p.title}</Link>
                  </h2>
                  <span className={"tag " + VERDICT_TONE[p.verdict]}>{VERDICT_LABEL[p.verdict]}</span>
                </div>
                {p.description && <p className="hint">{p.description}</p>}
                <p className="small muted">
                  p95 {milliseconds(p.p95)} (target {milliseconds(p.p95Target)}) · {p.nodeCount} components · by {p.ownerName}
                  {p.isMine ? " (you)" : ""} · {dateText(p.publishedAt)} · remixed {p.remixCount} {p.remixCount === 1 ? "time" : "times"}
                </p>
                <div className="row tight">
                  {p.tags.map((t) => (
                    <button key={t} className="chip" type="button" onClick={() => set({ tag: filters.tag === t ? undefined : t })} aria-pressed={filters.tag === t}>
                      {t}
                    </button>
                  ))}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {data && pages > 1 && (
        <nav className="row" aria-label="Gallery pages">
          <button className="btn btn-sm" type="button" disabled={data.page <= 1} onClick={() => set({ page: data.page - 1 })}>
            Previous
          </button>
          <span className="small muted">
            Page {data.page} of {pages}
          </span>
          <button className="btn btn-sm" type="button" disabled={data.page >= pages} onClick={() => set({ page: data.page + 1 })}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
