"use client";

import "@/styles/gallery.css";

import { COMPONENT_NAMES } from "@/components/gallery/gallery-preview";
import { GalleryCard } from "@/components/gallery/gallery-card";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crumbs } from "@/components/shell/crumbs";
import { fetchGallery, VERDICT_LABEL, type GalleryFilters, type GalleryVerdict } from "@/lib/api/gallery";
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
  const data = q.isError ? undefined : q.data;
  const filtered = !!(filters.q || filters.verdict || filters.mine || filters.tag);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="page stack lg gallery-page">
      <Crumbs resolved={resolveRoute("/gallery")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Community</span>
          <h1 className="h1">Gallery</h1>
          <p className="lede">Designs other people published, with the result they were tested at. Open one to read it, or remix it into your own account.</p>
        </div>
      </div>

      <form
        className="gallery-toolbar"
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

      <div className="gallery-summary">
        <p role="status">{q.isFetching ? "Loading designs…" : data ? `${data.total} published ${data.total === 1 ? "design" : "designs"}${filtered ? " matching your filters" : " · Newest first"}` : ""}</p>
        {filtered && <div className="row tight">{filters.tag && <span className="small">Component: {COMPONENT_NAMES[filters.tag as keyof typeof COMPONENT_NAMES] ?? filters.tag}</span>}<button className="btn btn-sm" type="button" onClick={() => { setFilters({}); setDraft(""); }}>Clear filters</button></div>}
      </div>
      <p className="hint gallery-disclaimer">Results are mathematical estimates from each published test. Designs may use different traffic profiles and targets.</p>
      {q.isPending && <ul className="gallery-grid" aria-label="Loading gallery" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <li key={i} className="gallery-skeleton" aria-hidden="true"><div /><span /><span /><span /></li>)}</ul>}
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
          <h2 className="h3">{filtered ? "No designs match these filters" : "Nothing is published yet"}</h2>
          <p className="hint">Run a test on one of your designs, then choose Publish to the gallery on its Results tab.</p>
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className="gallery-grid" data-testid="gallery-items">
          {data.items.map(p => <li key={p.id}><GalleryCard post={p} activeTag={filters.tag} onTag={tag => set({ tag: filters.tag === tag ? undefined : tag })} /></li>)}
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
