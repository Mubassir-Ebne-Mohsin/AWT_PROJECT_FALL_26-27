import { useEffect, useId, useState } from "react";
import type { EditorSession } from "@/lib/editor-session";
import type { Node, NumericProperty } from "@/lib/canvas/model";
import { numericError, numericRules } from "@/lib/canvas/model";
export function NumericField({
  node,
  property,
  value,
  session,
  change,
}: {
  node: Node;
  property: NumericProperty;
  value: number;
  session: EditorSession;
  change: (value: number) => void;
}) {
  const id = useId(),
    key = node.id + "." + property,
    r = numericRules[property];
  const percent =
      property === "hitRatio" ||
      (property === "share" && node.type !== "client"),
    scale = percent ? 100 : 1;
  const [draft, setDraft] = useState<{ base: number; raw: string } | null>(
      null,
    ),
    [error, setError] = useState("");
  const text =
    draft?.base === value
      ? draft.raw
      : String(Number((value * scale).toFixed(6)));
  const label =
    property === "share" && node.type === "client"
      ? "Traffic weight"
      : r.label + (percent ? " (%)" : "");
  useEffect(() => () => session.inputError(key, false), [key, session]);
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="row tight">
        <input
          id={id}
          className="input sm mono"
          type="number"
          inputMode="decimal"
          value={text}
          aria-invalid={session.state.inputErrors.includes(key)}
          aria-describedby={error ? id + "-error" : undefined}
          min={r.min * scale}
          max={
            (property === "share" && node.type === "client" ? 1e6 : r.max) *
            scale
          }
          step={percent ? 1 : property === "share" ? 0.1 : r.step}
          onChange={(e) => {
            const raw = e.target.value,
              n = Number(raw) / scale,
              message = numericError(
                property,
                raw.trim() ? String(n) : "",
                node.type,
              );
            setDraft({ base: message ? value : n, raw });
            setError(message);
            session.inputError(key, !!message);
            if (!message) change(n);
          }}
          onBlur={() => {
            if (error) {
              setDraft(null);
              session.inputError(key, false);
              setError(
                "Invalid value was not applied; the last valid value is shown.",
              );
            } else setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(null);
              setError("");
              session.inputError(key, false);
              e.stopPropagation();
            }
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        {!percent && (
          <span className="hint">
            {property === "share" ? "weight" : r.unit}
          </span>
        )}
      </div>
      {error && (
        <p className="c-fail small" id={id + "-error"} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function LabelField({
  node,
  session,
  change,
}: {
  node: Node;
  session: EditorSession;
  change: (label: string) => void;
}) {
  const id = useId(),
    key = node.id + ".label",
    [draft, setDraft] = useState<{ base: string; raw: string } | null>(null),
    [error, setError] = useState("");
  const text = draft?.base === node.label ? draft.raw : node.label;
  useEffect(() => () => session.inputError(key, false), [key, session]);
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        Component name
      </label>
      <input
        id={id}
        className="input sm"
        maxLength={80}
        value={text}
        aria-invalid={session.state.inputErrors.includes(key)}
        onChange={(e) => {
          const raw = e.target.value,
            label = raw.trim();
          setDraft({ base: label || node.label, raw });
          setError(label ? "" : "Name must contain 1–80 characters.");
          session.inputError(key, !label);
          if (label) change(label);
        }}
        onBlur={() => {
          setDraft(null);
          session.inputError(key, false);
          if (error)
            setError(
              "Empty name was not applied; the last valid name is shown.",
            );
        }}
      />
      {error && (
        <p className="c-fail small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
