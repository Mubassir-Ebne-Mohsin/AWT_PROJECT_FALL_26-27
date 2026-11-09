"use client";

import { enterDrawer } from "@/lib/drawer-focus";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { CATEGORIES, ENTRIES, POPULAR, entryById, flatten, related, reply, type Category, type Entry, type Reply } from "@/lib/concept-help";
import { ExplainDrawer } from "@/components/workspace/explain-panel";
import { useExplainView } from "@/lib/explain-store";

type Message = { role: "user"; text: string } | { role: "assistant"; reply: Reply };

/**
 * Assistant drawer. With a saved result on screen it is the real, grounded Result explanation (M12). With
 * none it is the concept-help drawer: fixed written answers, explicitly labelled, never a fallback for failed AI.
 */
export function AiPanel() {
  const view = useExplainView();
  const { ui: { conceptRequest } } = useUi();
  if (conceptRequest) {
    return (
      <ScriptedAssistant
        key={conceptRequest.sequence}
        topic={entryById(conceptRequest.topic)}
        opener={conceptRequest.opener}
      />
    );
  }
  return view ? <ExplainDrawer view={view} /> : <ScriptedAssistant />;
}

/** The workspace tab the drawer was opened from, so answers for that screen rank a little higher. */
function screenOf(pathname: string | null): string | undefined {
  const m = pathname?.match(/^\/designs\/[^/]+\/(edit|traffic|results|limits|history|notes)$/);
  return m ? `ws-${m[1]}` : undefined;
}

function Topics({ list, onPick, disabled }: { list: readonly Entry[]; onPick: (e: Entry) => void; disabled: boolean }) {
  return (
    <div className="row tight">
      {list.map((e) => (
        <button key={e.id} className="chip" onClick={() => onPick(e)} disabled={disabled}>
          {e.title}
        </button>
      ))}
    </div>
  );
}

/** Concept help. UI only: replies come from a fixed set of written answers (src/lib/concept-help); no model is called. */
function ScriptedAssistant({ topic, opener }: { topic?: Entry; opener?: HTMLElement }) {
  const { setUI } = useUi();
  const screen = screenOf(usePathname());
  const [messages, setMessages] = useState<Message[]>(() => topic
    ? [{ role: "assistant", reply: { kind: "answer", entry: topic, text: flatten(topic), also: [] } }]
    : []);
  const [text, setText] = useState("");
  const [stream, setStream] = useState<string | null>(null);
  const [browse, setBrowse] = useState<Category | "open" | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const restoreFocus = enterDrawer(inputRef.current, opener);
    return () => {
      if (timer.current) clearInterval(timer.current);
      restoreFocus();
    };
  }, [opener]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages.length, stream]);

  const send = (raw: string) => {
    const q = raw.trim();
    if (!q || stream !== null) return;
    setText("");
    setBrowse(null);
    setMessages((m) => [...m, { role: "user", text: q }]);

    const r = reply(q, screen);
    const first = r.entry ? r.entry.a : r.text;
    // Reveal the main paragraph a few words at a time so it reads like a stream; the rest appears with it.
    const words = first.split(/(\s+)/);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setMessages((m) => [...m, { role: "assistant", reply: r }]);
      return;
    }
    let i = 0;
    setStream("");
    timer.current = setInterval(() => {
      i += 3;
      if (i >= words.length) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setStream(null);
        setMessages((m) => [...m, { role: "assistant", reply: r }]);
        return;
      }
      setStream(words.slice(0, i).join(""));
    }, 28);
  };

  const busy = stream !== null;
  const renderReply = (r: Reply) => {
    const e = r.entry;
    if (!e) {
      return (
        <>
          <div className="body">{r.text}</div>
          {r.also.length > 0 && (
            <div className="stack">
              <div className="small muted">Nearest topics</div>
              <Topics list={r.also} onPick={(e) => send(e.q[0])} disabled={busy} />
            </div>
          )}
          <div className="row tight">
            <button className="chip" onClick={() => setBrowse("open")}>
              Browse all topics
            </button>
            <button className="chip" onClick={() => setUI({ feedback: true, reportRef: null })}>
              Suggest a topic
            </button>
          </div>
        </>
      );
    }
    const rel = related(e);
    const more = [...rel, ...r.also.filter((x) => !rel.includes(x))].slice(0, 5);
    return (
      <>
        <h2 className="small muted">{e.title}</h2>
        <div className="body" style={{ whiteSpace: "pre-line" }}>
          {e.a}
        </div>
        {e.why && <div className="body">{e.why}</div>}
        {e.steps && e.steps.length > 0 && (
          <div className="body">
            <div className="small muted">In the app</div>
            <ol style={{ margin: "4px 0 0 18px", padding: 0 }}>
              {e.steps.map((st) => (
                <li key={st}>{st}</li>
              ))}
            </ol>
          </div>
        )}
        {e.example && <div className="body">Example: {e.example}</div>}
        {e.links && e.links.length > 0 && (
          <div className="row tight">
            {e.links.map((l) => (
              <Link key={l.href} className="chip" href={l.href}>
                {l.label}
              </Link>
            ))}
          </div>
        )}
        {more.length > 0 && (
          <div className="stack">
            <div className="small muted">Related</div>
            <Topics list={more} onPick={(e) => send(e.q[0])} disabled={busy} />
          </div>
        )}
      </>
    );
  };

  return (
    <aside className="drawer" aria-label="Concept help">
      <div className="drawer-h">
        <Icon n="sparkle" />
        <div className="grow">
          <div style={{ fontWeight: 650 }}>Concept help</div>
          <div className="muted small">Fixed written answers · {ENTRIES.length} topics</div>
        </div>
        <span className="tag mock" title="Answers are scripted. No model is called.">
          Scripted mock
        </span>
        <button className="btn btn-ghost icon btn-sm" aria-label="Close concept help" onClick={() => setUI({ ai: false })}>
          <Icon n="x" />
        </button>
      </div>
      <div className="drawer-b" ref={bodyRef}>
        <div className="ai-msgs">
          {messages.length === 0 && stream === null && (
            <div className="note accent">
              <Icon n="info" />
              <div>These are fixed, written answers about concepts. No model is called, it does not look at your design, and nothing leaves your browser. The AI features are the goal box (Suggested fixes), the AI draft (New design, Describe your system) and the what-if sentence box (Results), when the server has them on.</div>
            </div>
          )}
          {messages.length === 0 && stream === null && (
            <div className="stack">
              <div className="small muted">Popular questions</div>
              <div className="row tight">
                {POPULAR.map((c) => (
                  <button key={c} className="chip" onClick={() => send(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.length === 0 && stream === null && (
            <div className="note">
              <Icon n="info" />
              <div>To explain a result, open a completed saved simulation in Results and choose Explain this result.</div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ai-msg user">
                <div className="who">You</div>
                <div className="body">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="ai-msg assistant stack">
                <div className="who">Concept help</div>
                {renderReply(m.reply)}
              </div>
            ),
          )}
          {stream !== null && (
            <div className="ai-msg assistant" aria-live="polite">
              <div className="who">Concept help</div>
              <div className="body caret">{stream}</div>
            </div>
          )}
          {browse && (
            <div className="stack">
              <div className="small muted">{browse === "open" ? "Browse by category" : CATEGORIES.find((c) => c.id === browse)?.label}</div>
              {browse === "open" ? (
                <div className="row tight">
                  {CATEGORIES.map((c) => (
                    <button key={c.id} className="chip" title={c.hint} onClick={() => setBrowse(c.id)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Topics list={ENTRIES.filter((e) => e.category === browse)} onPick={(e) => send(e.q[0])} disabled={busy} />
              )}
            </div>
          )}
        </div>
      </div>
      <div className="drawer-f stack">
        <div className="row tight">
          {POPULAR.slice(0, 4).map((c) => (
            <button key={c} className="chip" onClick={() => send(c)} disabled={busy}>
              {c}
            </button>
          ))}
          <button className="chip" onClick={() => setBrowse(browse ? null : "open")} aria-expanded={browse !== null}>
            Browse topics
          </button>
        </div>
        <form
          className="ai-input"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <input
            ref={inputRef}
            id="ai-input"
            className="input"
            placeholder="Ask about a concept…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Ask a concept question"
          />
          <button className="btn btn-primary icon" type="submit" aria-label="Send" disabled={busy || !text.trim()}>
            <Icon n="send" />
          </button>
        </form>
        <div className="small muted">Scripted mock · nothing leaves your browser</div>
      </div>
    </aside>
  );
}
