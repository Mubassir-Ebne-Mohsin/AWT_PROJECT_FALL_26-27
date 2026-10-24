"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchTemplates, Template } from "@/lib/api/designs";
import {
  CreationPage,
  CreationFeedback,
  GraphThumbnail,
  PreparedPreview,
  useCreationFlow,
} from "@/components/creation/shared";
export function TemplatePicker() {
  const flow = useCreationFlow("template"),
    { session, state } = flow;
  const requested = useSearchParams().get("template");
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });
  useEffect(() => {
    const t = templates.data?.find((t) => t.id === requested);
    if (t) session.update({ templateId: t.id, name: t.name });
  }, [requested, templates.data, session]);
  const selected =
    templates.data?.find((t) => t.id === state.templateId) ??
    templates.data?.[0];
  const disabled = state.pending || state.uncertain || !!state.created;
  const draft = (t: Template) => ({
    schemaVersion: 1 as const,
    name: state.name === "Untitled design" ? t.name : state.name,
    description: t.blurb,
    source: "template" as const,
    templateId: t.id,
    graph: t.graph,
    traffic: t.traffic,
  });
  return (
    <CreationPage
      path="/new/template"
      title="Pick a template"
      intro="Start from a complete design with sensible traffic. Preview it and name your copy."
    >
      <CreationFeedback flow={flow} />
      {templates.isPending && <p role="status">Loading templates…</p>}
      {templates.isError && (
        <button className="btn" onClick={() => templates.refetch()}>
          Retry loading templates
        </button>
      )}
      <div className="split m4-template-split">
        <div className="m4-template-grid">
          {templates.data?.map((t) => (
            <article
              className={
                "panel" + (selected?.id === t.id ? " m4-selected" : "")
              }
              key={t.id}
            >
              <GraphThumbnail graph={t.graph} />
              <div className="panel-b stack">
                <h2 className="h3">{t.name}</h2>
                <p className="muted small">{t.blurb}</p>
                <span className="hint">
                  {t.graph.nodes.length} components · {t.traffic.rps} rps
                </span>
                <button
                  className="btn btn-sm"
                  disabled={disabled}
                  aria-pressed={selected?.id === t.id}
                  onClick={() =>
                    session.update({ templateId: t.id, name: t.name })
                  }
                >
                  Preview {t.name}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={disabled}
                  onClick={() => flow.create({ ...draft(t), name: t.name })}
                >
                  Use {t.name}
                </button>
              </div>
            </article>
          ))}
        </div>
        {selected && (
          <aside className="panel m4-preview">
            <div className="panel-h">
              <h2 className="h3">{selected.name}</h2>
            </div>
            <div className="panel-b stack">
              <PreparedPreview
                prepared={{ design: draft(selected), assumptions: [] }}
              />
              <label className="field">
                <span className="label">Name for your copy</span>
                <input
                  className="input"
                  maxLength={100}
                  value={
                    state.name === "Untitled design"
                      ? selected.name
                      : state.name
                  }
                  disabled={disabled}
                  onChange={(e) => session.update({ name: e.target.value })}
                />
              </label>
              <button
                className="btn btn-primary"
                disabled={disabled}
                onClick={() => flow.create(draft(selected))}
              >
                Use this template
              </button>
            </div>
          </aside>
        )}
      </div>
    </CreationPage>
  );
}
