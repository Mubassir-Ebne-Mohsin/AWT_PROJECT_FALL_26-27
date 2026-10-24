"use client";
import { useRef } from "react";
import {
  CreationPage,
  CreationFeedback,
  PreparedPreview,
  useCreationFlow,
} from "@/components/creation/shared";
export const IMPORT_SAMPLE = JSON.stringify(
  {
    schemaVersion: 1,
    name: "Imported MVP",
    nodes: [
      { id: "users", type: "client" },
      { id: "app", type: "app", props: { replicas: 2 } },
      { id: "db", type: "db" },
    ],
    edges: [
      { from: "users", to: "app" },
      { from: "app", to: "db" },
    ],
  },
  null,
  2,
);
export function ImportDesign() {
  const flow = useCreationFlow("import"),
    { session, state } = flow,
    fileSequence = useRef(0);
  const disabled = state.pending || state.uncertain || !!state.created;
  async function loadFile(file?: File) {
    const sequence = ++fileSequence.current;
    if (!file) return;
    if (file.size > 65536) {
      session.fail("Import exceeds 64 KiB.");
      return;
    }
    try {
      const text = await file.text();
      if (sequence === fileSequence.current) session.update({ text });
    } catch {
      session.fail("Could not read that file. Try another file or paste JSON.");
    }
  }
  return (
    <CreationPage
      path="/new/import"
      title="Import a design"
      intro="Paste JSON or load a file. It is checked before anything is created."
    >
      <CreationFeedback flow={flow} />
      <div className="grid-2">
        <section className="panel panel-b stack">
          <fieldset className="stack m4-fields" disabled={disabled}>
            <div className="row">
              <label className="field">
                <span className="label">Load a JSON file</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => void loadFile(e.target.files?.[0])}
                />
              </label>
            </div>
            <div className="row">
              <button
                className="btn btn-sm"
                onClick={() => session.update({ text: IMPORT_SAMPLE })}
              >
                Load an example
              </button>
              <button
                className="btn btn-sm"
                onClick={() =>
                  session.update({
                    text: '{"nodes":[{"id":"a","type":"redis-cluster"}],"edges":[{"from":"a","to":"missing"}]}',
                  })
                }
              >
                Load a broken example
              </button>
            </div>
            <label className="field">
              <span className="label">Design JSON</span>
              <textarea
                aria-label="Design JSON"
                className="textarea mono"
                rows={16}
                value={state.text}
                spellCheck={false}
                onChange={(e) => {
                  fileSequence.current++;
                  session.update({ text: e.target.value });
                }}
              />
            </label>
            <p className="hint">
              64 KiB UTF-8 maximum · 50 nodes · 200 edges. Version 1 and
              versionless legacy documents are accepted. Positions are optional.
            </p>
            <button
              className="btn btn-primary"
              onClick={() =>
                void session.prepare({ source: "import", text: state.text })
              }
            >
              Check import
            </button>
          </fieldset>
        </section>
        <aside className="panel panel-b stack" aria-live="polite">
          {state.prepared ? (
            <>
              <h2 className="h2">Ready to import</h2>
              <PreparedPreview prepared={state.prepared} />
              <label className="field">
                <span className="label">Design name</span>
                <input
                  className="input"
                  maxLength={100}
                  disabled={disabled}
                  value={state.name}
                  onChange={(e) => session.update({ name: e.target.value })}
                />
              </label>
              <button
                className="btn btn-primary"
                disabled={disabled}
                onClick={() =>
                  flow.create({ ...state.prepared!.design, name: state.name })
                }
              >
                Import and open editor
              </button>
            </>
          ) : (
            <>
              <h2 className="h2">Check before creating</h2>
              <p className="muted">
                A valid preview appears here. Schema errors create nothing.
                Incomplete or cyclic safe drafts may be imported, but cannot run
                until repaired.
              </p>
            </>
          )}
        </aside>
      </div>
    </CreationPage>
  );
}
