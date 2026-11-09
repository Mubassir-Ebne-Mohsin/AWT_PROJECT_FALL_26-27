"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { publishToGallery, type GalleryPost } from "@/lib/api/gallery";

const REASONS: Record<string, string> = {
  NO_COMPLETED_RUN: "Run a completed test on this revision before publishing it.",
  GALLERY_LIMIT_REACHED: "You have reached the maximum number of published designs. Unpublish one first.",
  GALLERY_DAILY_LIMIT: "You can publish at most 5 designs a day. Try again tomorrow.",
  ALREADY_PUBLISHED: "This revision is already published.",
};

/** Publish one saved revision and its result to the gallery. A post is a frozen snapshot: notes are never included. */
export function PublishPanel({ designId, revision, runId, defaultTitle }: { designId: string; revision: number; runId: string; defaultTitle: string }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle.slice(0, 100));
  const [description, setDescription] = useState("");
  const [allowRemix, setAllowRemix] = useState(true);
  const [owns, setOwns] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<GalleryPost | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const post = await publishToGallery(designId, { title: title.trim(), description: description.trim(), revision, run: runId, allowRemix, confirmOwnership: true });
      void client.invalidateQueries({ queryKey: ["gallery"] });
      setDone(post);
    } catch (e) {
      const reason = e instanceof ApiError ? (e.details as { reason?: string } | undefined)?.reason : undefined;
      setError((reason && REASONS[reason]) || (e instanceof ApiError ? e.message : "It could not be published. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <p className="note ok" role="status" data-testid="gallery-published">
        Published. <Link href={"/gallery/" + done.id}>Open the post</Link>
      </p>
    );
  if (!open)
    return (
      <button className="btn" type="button" data-testid="gallery-publish-open" onClick={() => setOpen(true)}>
        Publish to the gallery
      </button>
    );
  const valid = title.trim().length > 0 && owns && !/[<>]/.test(title + description);
  return (
    <form
      className="stack"
      aria-label="Publish to the gallery"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
    >
      <p className="hint">
        This shows revision {revision}, its diagram, settings and this result to every signed-in person. Your notes and email are never shown. You can unpublish at any time.
      </p>
      <label className="field">
        <span className="label">Title</span>
        <input className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Description (plain text, optional)</span>
        <textarea className="textarea" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="row tight">
        <input type="checkbox" checked={allowRemix} onChange={(e) => setAllowRemix(e.target.checked)} />
        <span className="small">Let others copy it into their own account (with credit)</span>
      </label>
      <label className="row tight">
        <input type="checkbox" checked={owns} onChange={(e) => setOwns(e.target.checked)} />
        <span className="small">This design is mine to publish</span>
      </label>
      {error && (
        <p className="note fail" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={!valid || busy}>
          {busy ? "Publishing…" : "Publish"}
        </button>
        <button className="btn" type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
