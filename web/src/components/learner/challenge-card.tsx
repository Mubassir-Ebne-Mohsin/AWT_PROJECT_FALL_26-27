"use client";
import Link from "next/link";
import { GalleryPreview } from "@/components/gallery/gallery-preview";
import { ComponentGlyph } from "@/components/canvas/component-glyph";
import {
  challengeCategory,
  type Challenge,
  type ProgressItem,
} from "@/lib/challenge-discovery";
const glyph = {
  Scaling: "app",
  Caching: "cache",
  Data: "db",
  Regions: "client",
  Media: "storage",
  Routing: "gateway",
} as const;
export function ChallengeCard({
  c,
  attempt,
  signedIn,
  ready,
  loadingProgress,
}: {
  c: Challenge;
  attempt?: ProgressItem;
  signedIn: boolean;
  ready: boolean;
  loadingProgress: boolean;
}) {
  const canContinue = ready && attempt?.designId && !attempt.archived,
    type = c.learning ? glyph[c.learning.category] : "app";
  return (
    <article className="challenge-card">
      <div className="challenge-preview">
        <GalleryPreview
          graph={c.preview}
          title={`${c.title} — starting design`}
          context="saved"
        />
        <span className="challenge-preview-caption">Frozen starter</span>
      </div>
      <div className="challenge-card-body">
        <div className="challenge-card-meta">
          <span className="challenge-topic">
            <ComponentGlyph type={type} size={17} />
            {challengeCategory(c)}
          </span>
          <span className="pill">
            {c.learning?.difficulty ?? "Unclassified"}
          </span>
        </div>
        <h2 className="h3">
          <Link href={`/challenges/${c.id}`}>{c.title}</Link>
        </h2>
        <p className="challenge-summary">{c.summary}</p>
        {c.traffic && (
          <p className="challenge-traffic">
            {c.traffic.rps.toLocaleString()} rps · ×{c.traffic.burst} burst ·{" "}
            {Math.round(c.traffic.readRatio * 100)}% reads
          </p>
        )}
        <div className="challenge-targets">
          <span>p95 ≤ {c.goal.p95Ms} ms</span>
          <span>errors ≤ {(c.goal.errorRate * 100).toFixed(2)}%</span>
        </div>
        {c.learning && (
          <p className="hint">
            About {c.learning.estimatedMinutes} min · editorial estimate
          </p>
        )}
      </div>
      <footer>
        <span className={"pill" + (ready && attempt?.passed ? " ok" : "")}>
          {!signedIn
            ? "Private progress after login"
            : !ready
              ? loadingProgress
                ? "Loading progress"
                : "Progress unavailable"
              : attempt?.passed
                ? "Passed"
                : attempt
                  ? "In progress"
                  : "Not started"}
        </span>
        <Link
          className="challenge-card-cta"
          href={
            canContinue
              ? `/challenges/${c.id}?attempt=${attempt!.attemptId}`
              : `/challenges/${c.id}`
          }
        >
          {canContinue
            ? attempt?.passed
              ? "Review attempt"
              : "Continue attempt"
            : "View challenge"}{" "}
          →
        </Link>
      </footer>
    </article>
  );
}
