"use client";
import { useId, useState } from "react";
import type { components } from "@/lib/api/phase3-schema";
type C = components["schemas"];
export type Learning = NonNullable<C["Challenge"]["learning"]>;
export type Policy = NonNullable<C["CreateChallengeRequest"]["policy"]>;
export type LearningValues = {
  learning: Learning | null;
  policy: Policy | null;
};
export const defaultLearning: Learning = {
  category: "Scaling",
  difficulty: "beginner",
  estimatedMinutes: 15,
  objective: "",
  brief: "",
  topics: [],
  hints: ["", "", ""],
  sequence: 100,
};
export function ChallengeLearningFields({
  value,
  onChange,
}: {
  value: LearningValues;
  onChange: (v: LearningValues) => void;
}) {
  const id = useId(),
    l = value.learning;
  const set = <K extends keyof Learning>(key: K, v: Learning[K]) =>
    onChange({ ...value, learning: { ...l!, [key]: v } });
  return (
    <details className="panel r2-pad">
      <summary>Learning guide and exercise rules</summary>
      <div className="stack r2-pad">
        <label>
          Exercise profile
          <select
            className="r2-input"
            value={value.policy ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                policy: (e.target.value || null) as Policy | null,
              })
            }
          >
            <option value="">Original p95/error-only challenge</option>
            <option value="scale-app">Scale app replicas (up to 3)</option>
            <option value="add-cache">Add one cache (up to 85% hits)</option>
            <option value="read-replicas">Add up to two read replicas</option>
            <option value="edge-cache">Add one CDN (up to 80% hits)</option>
            <option value="co-locate">Change the app region</option>
            <option value="media-edge">
              Add cache and CDN (up to 80% hits)
            </option>
          </select>
        </label>
        <p className="hint">
          Profiles require exactly one app tier. Other starter properties and
          required paths are protected; rules freeze on publication. Custom
          challenges are not automatically proven solvable.
        </p>
        <label>
          <input
            type="checkbox"
            checked={!!l}
            onChange={(e) =>
              onChange({
                ...value,
                learning: e.target.checked
                  ? structuredClone(defaultLearning)
                  : null,
              })
            }
          />{" "}
          Add a learning guide
        </label>
        {l && (
          <>
            <div className="row">
              <label>
                Category
                <select
                  className="r2-input"
                  value={l.category}
                  onChange={(e) =>
                    set("category", e.target.value as Learning["category"])
                  }
                >
                  {[
                    "Scaling",
                    "Caching",
                    "Data",
                    "Regions",
                    "Media",
                    "Routing",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Difficulty
                <select
                  className="r2-input"
                  value={l.difficulty}
                  onChange={(e) =>
                    set("difficulty", e.target.value as Learning["difficulty"])
                  }
                >
                  {["beginner", "intermediate", "advanced"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Estimated minutes
                <input
                  className="r2-input"
                  type="number"
                  min={5}
                  max={180}
                  required
                  value={l.estimatedMinutes}
                  onChange={(e) =>
                    set("estimatedMinutes", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <label>
              Learning objective
              <input
                className="r2-input"
                required
                maxLength={240}
                value={l.objective}
                onChange={(e) => set("objective", e.target.value)}
              />
            </label>
            <label>
              Scenario and instructions
              <textarea
                className="r2-input"
                required
                maxLength={2000}
                rows={4}
                value={l.brief}
                onChange={(e) => set("brief", e.target.value)}
              />
            </label>
            <label>
              Learn topic IDs (comma separated)
              <TopicInput value={l.topics} onChange={(v) => set("topics", v)} />
            </label>
            {l.hints.map((h, i) => (
              <label key={i} htmlFor={`${id}-${i}`}>
                Hint {i + 1}
                <textarea
                  id={`${id}-${i}`}
                  className="r2-input"
                  required
                  maxLength={400}
                  value={h}
                  onChange={(e) => {
                    const hints: Learning["hints"] = [
                      l.hints[0],
                      l.hints[1],
                      l.hints[2],
                    ];
                    hints[i] = e.target.value;
                    set("hints", hints);
                  }}
                />
              </label>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

function TopicInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [raw, setRaw] = useState(value.join(", "));
  return (
    <input
      className="r2-input"
      required
      value={raw}
      placeholder="scaling,utilization"
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
