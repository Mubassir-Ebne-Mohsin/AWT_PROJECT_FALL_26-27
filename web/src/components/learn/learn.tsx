"use client";

import Link from "next/link";
import { recordLearningActivity, clearLearningActivity } from "@/lib/learning-activity";
import { LearnLibrary } from "@/components/learn/learn-library";
import { LessonGuide, RelatedLessons } from "@/components/learn/lesson-guide";
import { LessonIcon } from "@/components/learn/lesson-icon";
import { notFound, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { DEMOS } from "@/components/learn/demos";
import { Crumbs } from "@/components/shell/crumbs";
import { TOPICS, TOPIC_IDS, topicById, type Question } from "@/lib/learn-content";
import { MARK_LABEL, bucketFor, browserStore, clearProgress, markOf, markOpened, markPassed, parseProgress, rawProgress } from "@/lib/learn-progress";
import { NOT_FOUND_ROUTE, resolveRoute } from "@/lib/routes";

// The marks live in localStorage, an outside system, so they are read with useSyncExternalStore: the server and the
// first render see "nothing yet", the browser then reads what is stored, and any change here (or in another tab) updates.
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};

/** What this person has opened and passed, kept in this browser. Waits until we know who is signed in. */
export function useLearnProgress() {
  const { user, status } = useAuth();
  const bucket = bucketFor(user?.id);
  const ready = status !== "loading";
  const raw = useSyncExternalStore(
    subscribe,
    () => (ready ? rawProgress(browserStore(), bucket) : null),
    () => null,
  );
  const progress = parseProgress(raw, TOPIC_IDS);
  // Only tell listeners when something was actually stored, so a repeated call can never cause a render loop.
  const record = useCallback(
    (mark: typeof markOpened, topic: string) => {
      if (!ready) return;
      const store = browserStore();
      const before = rawProgress(store, bucket);
      mark(store, bucket, topic, TOPIC_IDS);
      recordLearningActivity(store, bucket, topic, TOPIC_IDS, mark === markPassed ? "passed" : "opened");
      if (rawProgress(store, bucket) !== before) changed();
    },
    [ready, bucket],
  );
  const open = useCallback((topic: string) => record(markOpened, topic), [record]);
  const pass = useCallback((topic: string) => record(markPassed, topic), [record]);
  const clear = useCallback(() => {
    clearProgress(browserStore(), bucket);
    clearLearningActivity(browserStore(), bucket);
    changed();
  }, [bucket]);
  return { progress, open, pass, clear, ready };
}

export function LearnIndex() {
  const { progress, clear } = useLearnProgress();
  return <LearnLibrary progress={progress} clear={clear} />;
}

function QuestionBlock({ q, index, onResult }: { q: Question; index: number; onResult: (correct: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState<boolean | null>(null);
  const name = `q${index}`;
  return (
    <fieldset className="stack lrn-question" data-testid="question">
      <legend className="h3">
        Question {index + 1}: {q.prompt}
      </legend>
      {q.options.map((o, i) => (
        <label key={o} className="row tight">
          <input
            type="radio"
            name={name}
            checked={picked === i}
            onChange={() => {
              setPicked(i);
              setChecked(null);
            }}
          />{" "}
          {o}
        </label>
      ))}
      <div className="row">
        <button
          className="btn"
          type="button"
          disabled={picked === null || checked === true}
          onClick={() => {
            const ok = picked === q.answer;
            setChecked(ok);
            onResult(ok);
          }}
          data-testid="check-answer"
        >
          Check answer
        </button>
      </div>
      {checked !== null && (
        <p role="status" className={checked ? "hint" : "m16-warn"} data-testid="answer-result">
          <strong>{checked ? "Correct." : "Not quite."}</strong> {q.why}
          {!checked && " Pick another answer and check again."}
        </p>
      )}
    </fieldset>
  );
}

function Check({ id, passedBefore, onPass }: { id: string; passedBefore: boolean; onPass: () => void }) {
  const topic = topicById(id)!;
  const [right, setRight] = useState<boolean[]>([false, false]);
  const passedNow = right.every(Boolean);
  const reported = useRef(false);
  useEffect(() => {
    if (passedNow && !reported.current) {
      reported.current = true;
      onPass();
    }
  }, [passedNow, onPass]);
  return (
    <section className="stack" aria-label="Check your understanding" data-testid="check">
      <h2 className="h2">Check yourself</h2>
      {passedBefore && !passedNow && <p className="hint">You have passed this check before. You can try it again.</p>}
      {topic.quiz.map((q, i) => (
        <QuestionBlock
          key={q.prompt}
          q={q}
          index={i}
          onResult={(ok) =>
            setRight((cur) => {
              const next = [...cur];
              next[i] = next[i] || ok;
              return next;
            })
          }
        />
      ))}
      {passedNow && (
        <p role="status" className="hint" data-testid="check-passed">
          Both answers right. You have passed this check.
        </p>
      )}
    </section>
  );
}

export function LearnTopic() {
  const pathname = usePathname();
  const resolved = resolveRoute(pathname);
  const id = resolved.params.topic ?? "";
  const topic = topicById(id);
  const { progress, open, pass, ready } = useLearnProgress();
  const known = topic !== undefined;
  useEffect(() => {
    if (ready && known) open(id);
  }, [ready, open, id, known]);
  const mark = MARK_LABEL[markOf(progress, id)];
  if (resolved.route === NOT_FOUND_ROUTE || !topic) notFound();
  const Demo = Object.hasOwn(DEMOS, id) ? DEMOS[id] : undefined;
  const index = TOPICS.findIndex((t) => t.id === id);
  const prev = TOPICS[index - 1];
  const next = TOPICS[index + 1];
  const passedBefore = progress.passed.includes(id);

  return (
    <div className="page narrow stack lg" data-testid="learn-topic">
      <Crumbs resolved={resolved} />
      <div className="stack">
        <LessonIcon topic={topic} /><h1 className="h1">{topic.title}</h1>
        <p className="lede">{topic.summary}</p>
        <p className="hint" data-testid="topic-mark">
          {mark}
        </p>
      </div>
      <section className="stack prose" aria-label="Explanation">
        {topic.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </section>
      <LessonGuide topic={topic} />
      {Demo && <Demo />}
      <section className="panel stack r2-pad" aria-label="Where you will see this" data-testid="seen">
        <h2 className="h3">Where you will see this in the app</h2>
        <p>{topic.seen}</p>
        <p>
          <Link href="/new/template">Start from a template</Link> · <Link href="/how-it-works">How the model works</Link>
        </p>
      </section>
      <section className="stack" aria-label="Takeaway">
        <p data-testid="takeaway">
          <strong>Remember:</strong> {topic.takeaway}
        </p>
      </section>
      <Check key={id} id={id} passedBefore={passedBefore} onPass={() => pass(id)} />
      <RelatedLessons topic={topic} />
      <nav className="row between" aria-label="More concepts">
        {prev ? <Link href={`/learn/${prev.id}`}>← {prev.title}</Link> : <span />}
        <Link href="/learn">All concepts</Link>
        {next ? <Link href={`/learn/${next.id}`}>{next.title} →</Link> : <span />}
      </nav>
    </div>
  );
}
