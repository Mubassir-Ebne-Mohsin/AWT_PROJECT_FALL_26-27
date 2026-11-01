"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Crumbs } from "@/components/shell/crumbs";
import { createDesign, fetchTemplates } from "@/lib/api/designs";
import { TOPICS } from "@/lib/learn-content";
import { bucketFor, browserStore } from "@/lib/learn-progress";
import { resolveRoute } from "@/lib/routes";
import { SAMPLE_TEMPLATE_ID, TOUR_STEPS, markTourDone, parseTourDone, rawTourDone } from "@/lib/welcome";

// "Been through the tour" lives in localStorage, an outside system, so it is read with useSyncExternalStore.
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

export function WelcomePage() {
  const { user, status } = useAuth();
  const router = useRouter();
  const queries = useQueryClient();
  const bucket = bucketFor(user?.id);
  const ready = status !== "loading";
  const done = parseTourDone(
    useSyncExternalStore(
      subscribe,
      () => (ready ? rawTourDone(browserStore(), bucket) : null),
      () => null,
    ),
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // A ref, not the state above: two clicks before the next render must still make only one design.
  const inflight = useRef(false);
  const [error, setError] = useState("");

  const finish = useCallback(() => {
    if (!ready) return;
    markTourDone(browserStore(), bucket);
    changed();
  }, [ready, bucket]);

  const skip = () => {
    finish();
    router.push("/dashboard");
  };

  const startSample = async () => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    try {
      const template = (await fetchTemplates()).find((t) => t.id === SAMPLE_TEMPLATE_ID);
      if (!template) throw new Error("missing");
      const design = await createDesign(template);
      finish();
      await queries.invalidateQueries({ queryKey: ["dashboard"] });
      router.push(`/designs/${design.id}/edit`);
    } catch {
      setError("The sample design could not be created. If you try again and see two samples, you can delete one on the Designs page.");
      inflight.current = false;
      setBusy(false);
    }
  };

  const last = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];
  return (
    <div className="page narrow stack lg" data-testid="welcome-page">
      <Crumbs resolved={resolveRoute("/welcome")} />
      <div className="stack">
        <h1 className="h1">Welcome{user ? `, ${user.displayName.split(" ")[0]}` : ""}</h1>
        <p className="lede">StressForge shows where a system breaks before real users find out. This takes about a minute.</p>
        {done && (
          <p className="hint" data-testid="tour-done-note">
            You have already been through this tour on this browser. It is here whenever you want it again.
          </p>
        )}
      </div>

      <section className="panel stack r2-pad" aria-labelledby="tour-title" data-testid="tour">
        <p className="hint" data-testid="tour-counter">
          Step {step + 1} of {TOUR_STEPS.length}
        </p>
        <h2 className="h2" id="tour-title" data-testid="tour-step" data-step={current.id}>
          {current.title}
        </h2>
        <p>{current.body}</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => setStep(step - 1)} disabled={step === 0} data-testid="tour-back">
            Back
          </button>
          {!last && (
            <button className="btn btn-primary" type="button" onClick={() => setStep(step + 1)} data-testid="tour-next">
              Next
            </button>
          )}
          {last && (
            <button className="btn btn-primary" type="button" onClick={skip} data-testid="tour-finish">
              Finish the tour
            </button>
          )}
          {!last && (
            <button className="btn btn-ghost" type="button" onClick={skip} data-testid="tour-skip">
              Skip the tour
            </button>
          )}
        </div>
      </section>

      <section className="stack" aria-labelledby="try-title">
        <h2 className="h2" id="try-title">
          Try it on a sample
        </h2>
        <p>
          This makes a small one-server design that works at its traffic. Open it, add traffic or remove a replica, and run it to see it break. It is your copy, so you can change or delete it freely.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="button" onClick={() => void startSample()} disabled={busy || !ready} data-testid="start-sample">
            {busy ? "Creating the sample…" : "Start with a sample design"}
          </button>
          <Link className="btn btn-ghost" href="/new">
            Start from something else
          </Link>
        </div>
        {error && (
          <p role="alert" className="hint" data-testid="sample-error">
            {error}
          </p>
        )}
      </section>

      <section className="stack" aria-labelledby="learn-title" data-testid="learn-links">
        <h2 className="h2" id="learn-title">
          Or learn an idea first
        </h2>
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {TOPICS.map((t) => (
            <li key={t.id}>
              <Link href={`/learn/${t.id}`}>{t.title}</Link> <span className="muted">{t.summary}</span>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/dashboard">Go to the dashboard</Link>
        </p>
      </section>
    </div>
  );
}
