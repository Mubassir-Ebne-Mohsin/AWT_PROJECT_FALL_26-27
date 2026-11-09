"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReportDocument } from "@/components/report/report-document";
import { Crumbs } from "@/components/shell/crumbs";
import { ApiError } from "@/lib/api/errors";
import { fetchGalleryPost, remixGalleryPost, unpublishGalleryPost, VERDICT_LABEL, VERDICT_TONE } from "@/lib/api/gallery";
import { dateText } from "@/lib/report-presentation";
import { resolveRoute } from "@/lib/routes";

/** One published design: a read-only snapshot with its result. Remix makes a private copy; the owner can unpublish. */
export function GalleryPostView({ id }: { id: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const [busy, setBusy] = useState<"remix" | "unpublish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const post = useQuery({ queryKey: ["gallery-post", id], queryFn: ({ signal }) => fetchGalleryPost(id, signal), retry: false });
  const gone = post.isError && post.error instanceof ApiError && post.error.status === 404;
  const p = post.data;

  async function remix() {
    setBusy("remix");
    setError(null);
    try {
      const res = await remixGalleryPost(id);
      void client.invalidateQueries({ queryKey: ["gallery"] });
      router.push(`/designs/${res.design.id}/edit`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The design could not be copied. Try again.");
      setBusy(null);
    }
  }
  async function unpublish() {
    setBusy("unpublish");
    setError(null);
    try {
      await unpublishGalleryPost(id);
      void client.invalidateQueries({ queryKey: ["gallery"] });
      router.push("/gallery");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The post could not be removed. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/gallery/x")} />
      {post.isPending && <p role="status">Opening the design…</p>}
      {gone && (
        <div className="panel stack" role="status" data-testid="gallery-gone">
          <h1 className="h3">This post is no longer available</h1>
          <p className="hint">The owner may have removed it.</p>
        </div>
      )}
      {post.isError && !gone && (
        <div className="panel stack" role="alert">
          <h1 className="h3">The design could not be loaded</h1>
          <button className="btn" type="button" onClick={() => void post.refetch()}>
            Try again
          </button>
        </div>
      )}
      {p && (
        <>
          <div className="page-head">
            <div className="stack">
              <span className="eyebrow">Gallery</span>
              <h1 className="h1">{p.title}</h1>
              <p className="small muted">
                By {p.ownerName}
                {p.isMine ? " (you)" : ""} · published {dateText(p.publishedAt)} · revision {p.revision} · remixed {p.remixCount} {p.remixCount === 1 ? "time" : "times"}
              </p>
            </div>
            <div className="row">
              <span className={"tag " + VERDICT_TONE[p.verdict]}>{VERDICT_LABEL[p.verdict]}</span>
              {p.allowRemix ? (
                <button className="btn btn-primary" type="button" data-testid="gallery-remix" disabled={busy !== null} onClick={() => void remix()}>
                  {busy === "remix" ? "Copying…" : "Remix into my designs"}
                </button>
              ) : (
                <span className="small muted">The owner has not allowed remixing.</span>
              )}
              {p.isMine && (
                <button className="btn" type="button" data-testid="gallery-unpublish" disabled={busy !== null} onClick={() => void unpublish()}>
                  Unpublish
                </button>
              )}
            </div>
          </div>
          {error && (
            <p className="note fail" role="alert">
              {error}
            </p>
          )}
          {p.description && <p className="lede">{p.description}</p>}
          <p className="hint">
            A read-only snapshot taken when it was published. It does not change if the owner edits the design. Remixing copies it into your account as a private design, with credit.
          </p>
          <ReportDocument report={p.report} />
        </>
      )}
    </div>
  );
}
