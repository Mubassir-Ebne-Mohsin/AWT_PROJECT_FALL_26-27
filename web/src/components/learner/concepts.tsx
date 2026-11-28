"use client";

import Link from "next/link";
import { LEARN_CATEGORIES } from "@/lib/learn-types";
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
      <div className="progress-category-grid">{LEARN_CATEGORIES.map(category=>{const topics=TOPICS.filter(t=>t.category===category.id),passed=topics.filter(t=>progress.passed.includes(t.id)).length;return <article className="progress-category" key={category.id}><h3>{category.title}</h3><progress value={passed} max={topics.length} aria-label={category.title+" checks passed"}/><p>{passed} / {topics.length} checks passed</p></article>;})}</div>
      <details className="progress-topic-list" open><summary>All lessons and your marks</summary>
      <ul>
        {TOPICS.map((t) => {
          const mark = markOf(progress, t.id);
          return (
            <li key={t.id} data-testid="concept-row" data-topic={t.id} data-mark={mark}>
              <Link href={`/learn/${t.id}`}>{t.title}</Link> <span className="muted">{MARK_LABEL[mark]}</span>
            </li>
          );
        })}
      </ul></details>
    </section>
  );
}
