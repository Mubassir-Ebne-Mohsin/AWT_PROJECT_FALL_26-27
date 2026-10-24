"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { CreationInput } from "@/lib/creation-session";
import {
  CreationPage,
  CreationFeedback,
  useCreationFlow,
} from "@/components/creation/shared";
export function BlankDesign() {
  const flow = useCreationFlow("blank"),
    { session, state } = flow;
  const catalog = useQuery({
    queryKey: ["simulation-catalog"],
    queryFn: () => api<components["schemas"]["Catalog"]>("/simulation/catalog"),
  });
  const disabled = state.pending || state.uncertain || !!state.created;
  async function submit() {
    const prepared = await session.prepare({
      source: "blank",
      name: state.name,
      region: state.region,
      start: state.start,
      preset: state.preset,
    });
    if (prepared) await flow.create(prepared.design);
  }
  return (
    <CreationPage
      path="/new/blank"
      title="Blank canvas"
      intro="Start with a traffic entry or an empty graph. Save the starting design now; canvas drawing arrives in M5–M6."
    >
      <CreationFeedback flow={flow} />
      <div className="grid-2">
        <form
          className="panel panel-b stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={disabled} className="stack m4-fields">
            <label className="field">
              <span className="label">Design name</span>
              <input
                className="input"
                required
                maxLength={100}
                value={state.name}
                onChange={(e) => session.update({ name: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="label">Region</span>
              <select
                aria-label="Region"
                className="select"
                value={state.region}
                onChange={(e) =>
                  session.update({
                    region: e.target.value as Extract<
                      CreationInput,
                      { source: "blank" }
                    >["region"],
                  })
                }
              >
                {catalog.data?.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Start with</span>
              <select
                aria-label="Start with"
                className="select"
                value={state.start}
                onChange={(e) =>
                  session.update({
                    start: e.target.value as "clients" | "empty",
                  })
                }
              >
                <option value="clients">Clients entry point</option>
                <option value="empty">Completely empty</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Traffic preset</span>
              <select
                aria-label="Traffic preset"
                className="select"
                value={state.preset}
                onChange={(e) =>
                  session.update({
                    preset: e.target.value as Extract<
                      CreationInput,
                      { source: "blank" }
                    >["preset"],
                  })
                }
              >
                {catalog.data?.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" disabled={!catalog.data}>
              Create blank design
            </button>
          </fieldset>
          {catalog.isError && (
            <button
              type="button"
              className="btn"
              onClick={() => catalog.refetch()}
            >
              Retry loading presets
            </button>
          )}
        </form>
        <aside className="panel panel-b stack">
          <h2 className="h2">Your first stress test</h2>
          <ol>
            <li>Add an App server from the palette.</li>
            <li>Connect Users to it.</li>
            <li>Add a Database and connect it.</li>
            <li>Set traffic and run a test.</li>
          </ol>
          <p className="note">
            This checklist becomes actionable with the M5–M6 canvas tools. An
            incomplete draft can be saved; Run requires a valid request path.
          </p>
        </aside>
      </div>
    </CreationPage>
  );
}
