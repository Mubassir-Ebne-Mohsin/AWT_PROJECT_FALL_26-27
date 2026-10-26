import { useEffect, useId, useState } from "react";
import type { EditorSession } from "@/lib/editor-session";
import { numericTraffic } from "@/lib/traffic";
export function TrafficField({
  label,
  value,
  min,
  max,
  session,
  change,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  session: EditorSession;
  change: (n: number) => void;
  unit?: string;
}) {
  const id = useId(),
    key = "traffic:" + label;
  const [draft, setDraft] = useState<{ base: number; raw: string } | null>(
    null,
  );
  const text = draft?.base === value ? draft.raw : String(value);
  const error = numericTraffic(text, min, max) === undefined;
  useEffect(() => () => session.inputError(key, false), [session, key]);
  return (
    <div className="field m7-traffic-field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="row tight">
        <input
          id={id}
          className="input sm mono"
          type="number"
          value={text}
          min={min}
          max={max}
          step="any"
          aria-invalid={error}
          aria-describedby={error ? id + "-error" : undefined}
          onChange={(e) => {
            const raw = e.target.value,
              n = numericTraffic(raw, min, max);
            setDraft({ base: n ?? value, raw });
            session.inputError(key, n === undefined);
            if (n !== undefined) change(n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(null);
              session.inputError(key, false);
              e.stopPropagation();
            }
          }}
        />
        {unit && <span className="hint">{unit}</span>}
      </div>
      {error && (
        <p className="c-fail small" id={id + "-error"} role="alert">
          Enter a number from {min} to {max}. Escape restores the last valid
          value.
        </p>
      )}
    </div>
  );
}
