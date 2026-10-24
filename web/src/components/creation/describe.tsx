"use client";
import {
  CreationPage,
  CreationFeedback,
  PreparedPreview,
  useCreationFlow,
} from "@/components/creation/shared";
export const DESCRIBE_EXAMPLES = [
  "A news feed for 200k daily users. Mostly reads, Postgres with a Redis cache, behind a CDN and a load balancer.",
  "Online store with a flash sale. 3 app servers, Postgres, Stripe payments, and order emails sent by background workers through a queue.",
  "IoT ingest: 4,000 requests per second of sensor writes, an API gateway, Kafka and 4 workers writing to a time-series database.",
  "Photo sharing app for users in South Asia. Uploads to S3, a CDN for images, 2 app servers and a cache.",
];
export function DescribeDesign() {
  const flow = useCreationFlow("describe"),
    { session, state } = flow;
  const disabled = state.pending || state.uncertain || !!state.created;
  return (
    <CreationPage
      path="/new/describe"
      title="Describe your system"
      intro="Describe your tools and traffic, then review every assumption before saving."
    >
      <div className="note accent">
        <b>Scripted mock</b> · Local keyword rules stand in for AI. No model is
        called, and no AI quota is used. Traffic estimates are assumptions.
      </div>
      <CreationFeedback flow={flow} />
      <div className="grid-2">
        <section className="panel panel-b stack">
          <fieldset className="stack m4-fields" disabled={disabled}>
            <label className="field">
              <span className="label">Your system, in your own words</span>
              <textarea
                aria-label="Your system, in your own words"
                className="textarea"
                rows={7}
                maxLength={1000}
                value={state.text}
                onChange={(e) => session.update({ text: e.target.value })}
              />
            </label>
            <span className="hint">Try an example</span>
            {DESCRIBE_EXAMPLES.map((text) => (
              <button
                className="chip m4-example"
                key={text}
                onClick={() => session.update({ text })}
              >
                {text}
              </button>
            ))}
            <div className="row">
              <button
                className="btn btn-ghost"
                onClick={() =>
                  void session.prepare({
                    source: "import",
                    text: '{"nodes":[{"id":"n1","type":"redis-cluster"}]}',
                  })
                }
              >
                Show invalid scripted output
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  void session.prepare({ source: "scripted", text: state.text })
                }
              >
                {state.prepared ? "Draft again" : "Draft the design"}
              </button>
            </div>
          </fieldset>
        </section>
        <aside className="panel panel-b stack" aria-live="polite">
          {state.prepared ? (
            <>
              <h2 className="h2">Review your draft</h2>
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
              <p className="hint">
                The original description and these assumptions will be saved in
                the design description.
              </p>
              <button
                className="btn btn-primary"
                disabled={disabled}
                onClick={() =>
                  flow.create({ ...state.prepared!.design, name: state.name })
                }
              >
                Open in the editor
              </button>
            </>
          ) : (
            <>
              <h2 className="h2">Your draft appears here</h2>
              <p className="muted">
                Review components, traffic and assumptions before saving.
                Unsupported details need manual correction when the canvas tools
                arrive.
              </p>
            </>
          )}
        </aside>
      </div>
    </CreationPage>
  );
}
