"use client";

import Link from "next/link";
import { useLearnProgress } from "@/components/learn/learn";
import { TOPICS } from "@/lib/learn-content";
import { MARK_LABEL, markOf } from "@/lib/learn-progress";
import { conceptTally, nextSuggestion, type ChallengeState } from "@/lib/progress-concepts";

/** The "what to do next" box and the concepts list on /progress. The marks are kept in this browser, and the page says so. */
export function NextStep({ challenges }: { challenges: ChallengeState }) {
  const { progress, ready } = useLearnProgress();
  if (!ready) return null;
  const s = nextSuggestion(progress, TOPICS, challenges);
  return (
    <section className="panel stack r2-pad" aria-labelledby="next-title" data-testid="next-step" data-kind={s.kind}>
      <h2 className="h3" id="next-title">
        What to do next
      </h2>
      <p>{s.href ? <Link href={s.href}>{s.label}</Link> : s.label}</p>
      <p className="hint" data-testid="next-reason">
        {s.reason}
      </p>
    </section>
  );
}

export function ConceptsProgress() {
  const { progress, ready } = useLearnProgress();
  const tally = conceptTally(progress, TOPICS);
  return (
    <section className="stack" aria-labelledby="concepts-title" data-testid="concepts">
      <h2 className="h2" id="concepts-title">
        Concepts
      </h2>
      <p data-testid="concepts-tally">
        {ready ? `${tally.opened} of ${tally.total} opened · ${tally.passed} passed the check` : "Loading…"}
      </p>
      <p className="hint">Kept in this browser, not on your account. Clearing this browser&apos;s site data removes it.</p>
      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {TOPICS.map((t) => {
          const mark = markOf(progress, t.id);
          return (
            <li key={t.id} data-testid="concept-row" data-topic={t.id} data-mark={mark}>
              <Link href={`/learn/${t.id}`}>{t.title}</Link> <span className="muted">{MARK_LABEL[mark]}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
