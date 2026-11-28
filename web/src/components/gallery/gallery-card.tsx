"use client";
import Link from "next/link";
import { GalleryPreview, COMPONENT_NAMES } from "@/components/gallery/gallery-preview";
import { VERDICT_LABEL, VERDICT_TONE, type GalleryPost } from "@/lib/api/gallery";
import { milliseconds } from "@/lib/result-presentation";

export function GalleryCard({ post: p, activeTag, onTag }: { post: GalleryPost; activeTag?: string; onTag: (tag: string) => void }) {
  const tags = p.tags.slice(0, 3);
  return <article className="gallery-card">
    <div className="gallery-art">
      <div className="gallery-art-head"><span className="eyebrow">Architecture</span><span className={"tag " + VERDICT_TONE[p.verdict]}>{VERDICT_LABEL[p.verdict]}</span></div>
      <GalleryPreview graph={p.preview} title={p.title} />
      <span className="gallery-revision">Revision {p.revision} · {p.nodeCount} components</span>
    </div>
    <div className="gallery-card-body">
      <h2 className="h3 gallery-title"><Link href={"/gallery/" + p.id} title={p.title}>{p.title}</Link></h2>
      <dl className="gallery-metrics"><div><dt>Recorded p95</dt><dd>{milliseconds(p.p95)}</dd></div><div><dt>Latency target</dt><dd>{milliseconds(p.p95Target)}</dd></div></dl>
      <div className="gallery-tags" aria-label="Component types">{tags.map(t => <button key={t} className="chip" type="button" onClick={() => onTag(t)} aria-pressed={activeTag === t}>{COMPONENT_NAMES[t as keyof typeof COMPONENT_NAMES] ?? t}</button>)}{p.tags.length > tags.length && <span className="gallery-tag-more" title={p.tags.slice(3).map(t => COMPONENT_NAMES[t as keyof typeof COMPONENT_NAMES] ?? t).join(", ")}>+{p.tags.length - tags.length} more</span>}</div>
      <div className="gallery-author"><span className="gallery-avatar" aria-hidden="true">{p.ownerName.trim().slice(0, 1).toUpperCase() || "?"}</span><div className="gallery-author-name"><span>by {p.ownerName}{p.isMine ? " (you)" : ""}</span>{p.ownerUsername && <span className="gallery-username">@{p.ownerUsername}</span>}</div></div>
      <div className="gallery-card-footer"><span>{p.allowRemix ? `${p.remixCount} ${p.remixCount === 1 ? "remix" : "remixes"}` : "View only"}</span><Link href={"/gallery/" + p.id} aria-label={`View design: ${p.title}`}>View design <span aria-hidden="true">→</span></Link></div>
    </div>
  </article>;
}
