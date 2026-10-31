"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchLibrary } from "@/lib/api/library";
import { CHALLENGE_TEXT_NOTE, SHAPES, SUMMARY_MAX, TITLE_MAX, toBody, type Body, type FormValues } from "@/lib/challenge-presentation";

export type FormMode = "create" | "draft" | "wording";

/**
 * One form for all three situations: a new challenge (everything, and a starting design is required), a draft (everything,
 * and the starting design can be swapped), and a published challenge (the wording only, because the rest is frozen).
 */
export function ChallengeForm(props: { mode: FormMode; initial: FormValues; busy: boolean; serverError: string | null; submitLabel: string; onSubmit: (body: Body | Pick<Body, "title" | "summary">) => void }) {
  const { user } = useAuth();
  const uid = useId();
  const [v, setV] = useState<FormValues>(props.initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [find, setFind] = useState("");
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setV((old) => ({ ...old, [key]: value }));
  const wordingOnly = props.mode === "wording";

  const designs = useQuery({
    queryKey: ["challenge-design-picker", user?.id, find],
    queryFn: ({ signal }) => fetchLibrary({ q: find, sort: "name", verdict: "", archived: "active", page: 1 }, signal),
    enabled: !!user && !wordingOnly,
    retry: false,
  });

  const field = (key: keyof FormValues, label: string, input: React.ReactNode, hint?: string) => (
    <div className="m15-field">
      <label htmlFor={uid + key}>{label}</label>
      {input}
      {hint && <span className="hint">{hint}</span>}
      {errors[key] && (
        <span className="m16-warn" role="alert">
          {errors[key]}
        </span>
      )}
    </div>
  );
  const number = (key: "p95Ms" | "errorPct" | "rps" | "burst" | "readPct" | "durationMin", label: string, hint?: string) =>
    field(key, label, <input id={uid + key} className="r2-input" inputMode="decimal" value={v[key]} onChange={(e) => set(key, e.target.value)} />, hint);

  return (
    <form
      className="stack"
      aria-label={props.mode === "create" ? "New challenge" : "Edit challenge"}
      onSubmit={(e) => {
        e.preventDefault();
        const converted = toBody(v, { needDesign: props.mode === "create" });
        if (!converted.ok) return setErrors(converted.errors);
        setErrors({});
        props.onSubmit(wordingOnly ? { title: converted.body.title, summary: converted.body.summary } : converted.body);
      }}
    >
      {field("title", "Title", <input id={uid + "title"} className="r2-input" value={v.title} maxLength={TITLE_MAX + 20} onChange={(e) => set("title", e.target.value)} />, CHALLENGE_TEXT_NOTE)}
      {field("summary", "What learners should achieve", <textarea id={uid + "summary"} className="r2-input" rows={4} value={v.summary} onChange={(e) => set("summary", e.target.value)} />, `Up to ${SUMMARY_MAX.toLocaleString("en-US")} characters, plain text.`)}

      {!wordingOnly && (
        <>
          <fieldset className="m15-field stack">
            <legend>Starting design</legend>
            <div className="m15-field">
              <label htmlFor={uid + "find"}>Find one of your designs</label>
              <input id={uid + "find"} className="r2-input" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" />
            </div>
            {field(
              "designId",
              "Starting design",
              <select id={uid + "designId"} className="r2-input" value={v.designId} onChange={(e) => set("designId", e.target.value)}>
                <option value="">{props.mode === "create" ? "Choose a design…" : "Keep the current starting design"}</option>
                {(designs.data?.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · revision {d.revision} · {d.nodeCount} components
                  </option>
                ))}
              </select>,
              "Learners get a frozen copy of this design at its current revision. Later edits to your design do not reach it.",
            )}
            {designs.isError && (
              <span className="m16-warn" role="alert">
                Your designs could not be loaded.
              </span>
            )}
          </fieldset>

          <fieldset className="m15-field stack">
            <legend>Goal</legend>
            {number("p95Ms", "p95 latency goal (ms)", "Learners pass when p95 is at or under this.")}
            {number("errorPct", "Error limit (%)", "…and the error rate is at or under this.")}
          </fieldset>

          <fieldset className="m15-field stack">
            <legend>Traffic the design is tested at</legend>
            {number("rps", "Requests per second")}
            {number("burst", "Burst multiplier")}
            {number("readPct", "Reads (%)")}
            {number("durationMin", "Duration (minutes)")}
            {field(
              "shape",
              "Shape",
              <select id={uid + "shape"} className="r2-input" value={v.shape} onChange={(e) => set("shape", e.target.value as FormValues["shape"])}>
                {SHAPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>,
            )}
          </fieldset>
        </>
      )}

      {props.serverError && (
        <p className="m16-warn" role="alert" data-testid="challenge-error">
          {props.serverError}
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={props.busy}>
          {props.busy ? "Saving…" : props.submitLabel}
        </button>
      </div>
    </form>
  );
}
