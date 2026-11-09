"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { fetchGallery, remixGalleryPost, type GalleryFilters } from "@/lib/api/gallery";
import { milliseconds } from "@/lib/result-presentation";

const SHOWN = 3;

/** The query for "designs with the same limiting component that pass", most similar component list first. */
export function similarFilters(bottleneckType: string, componentTypes: readonly string[]): GalleryFilters {
  return { verdict: "pass", bottleneck: bottleneckType, like: [...new Set(componentTypes)].slice(0, 12) };
}

/**
 * Improve tab: published designs whose limiting component is the same kind and that pass. It does not claim they would fix this
 * design (traffic and size may differ); it shows a working outcome to open or remix.
 */
export function SimilarDesigns({ bottleneckType, bottleneckLabel, componentTypes }: { bottleneckType: string; bottleneckLabel: string; componentTypes: readonly string[] }) {
  const router = useRouter();
  const filters = similarFilters(bottleneckType, componentTypes);
  const q = useQuery({ queryKey: ["gallery", "similar", filters], queryFn: ({ signal }) => fetchGallery(filters, signal), retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remix(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await remixGalleryPost(id);
      router.push(`/designs/${res.design.id}/edit`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The design could not be copied. Try again.");
      setBusy(null);
    }
  }

  const items = q.data?.items.slice(0, SHOWN) ?? [];
  return (
    <section className="panel stack" style={{ padding: 16 }} aria-label="See how others solved this" data-testid="similar-designs">
      <h2 className="h3">See how others solved this</h2>
      <p className="hint">
        Published designs whose most loaded component is also of this kind ({bottleneckLabel}) and that pass their targets. Their traffic and size may differ from yours, so treat them as
        examples to open or remix, not as proof they would fix this design.
      </p>
      {q.isPending && <p role="status">Looking in the gallery…</p>}
      {q.isError && (
        <div className="note fail" role="alert">
          <p>The gallery could not be loaded.</p>
          <button className="btn btn-sm" type="button" onClick={() => void q.refetch()}>
            Try again
          </button>
        </div>
      )}
      {q.data && items.length === 0 && (
        <p data-testid="similar-empty">
          Nothing published yet is a passing design whose most loaded component is of this kind ({bottleneckLabel}). <Link href="/gallery">Browse the whole gallery</Link>
        </p>
      )}
      {error && (
        <p className="note fail" role="alert">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((p) => (
            <li key={p.id} className="card stack" data-testid="similar-item">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <strong>{p.title}</strong>
                <span className="tag ok">Passes</span>
              </div>
              <p className="small muted">
                p95 {milliseconds(p.p95)} (target {milliseconds(p.p95Target)}) · {p.nodeCount} components ({p.tags.join(", ")}) · by {p.ownerName}
              </p>
              <div className="row tight">
                <Link className="btn btn-sm" href={"/gallery/" + p.id}>
                  Open
                </Link>
                {p.allowRemix && (
                  <button className="btn btn-sm" type="button" disabled={busy !== null} onClick={() => void remix(p.id)}>
                    {busy === p.id ? "Copying…" : "Remix"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {q.data && q.data.total > SHOWN && (
        <p className="small">
          <Link href="/gallery">See all {q.data.total} in the gallery</Link>
        </p>
      )}
    </section>
  );
}
