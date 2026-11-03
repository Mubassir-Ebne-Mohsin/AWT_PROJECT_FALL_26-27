"use client";

import { enterDrawer } from "@/lib/drawer-focus";
import { useEffect, useRef, useState } from "react";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { STARTER_CHIPS, scriptedReply } from "@/lib/scripted-reply";
import { ExplainDrawer } from "@/components/workspace/explain-panel";
import { useExplainView } from "@/lib/explain-store";

interface Message {
  role: "user" | "assistant";
  text: string;
}

/**
 * Assistant drawer. With a saved result on screen it is the real, grounded Result explanation (M12). With
 * none it is the concept-help drawer: fixed written answers, explicitly labelled, never a fallback for failed AI.
 */
export function AiPanel() {
  const view = useExplainView();
  return view ? <ExplainDrawer view={view} /> : <ScriptedAssistant />;
}

/** Concept help. UI only: replies come from a fixed table of written answers (src/lib/scripted-reply.ts); no model is called. */
function ScriptedAssistant() {
  const { setUI } = useUi();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [stream, setStream] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const restoreFocus = enterDrawer(inputRef.current);
    return () => {
      if (timer.current) clearInterval(timer.current);
      restoreFocus();
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages.length, stream]);

  const send = (raw: string) => {
    const q = raw.trim();
    if (!q || stream !== null) return;
    setText("");
    setMessages((m) => [...m, { role: "user", text: q }]);

    const full = scriptedReply(q);
    // Reveal the reply a few words at a time so it reads like a stream.
    const words = full.split(/(\s+)/);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setMessages((m) => [...m, { role: "assistant", text: full }]);
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
        setMessages((m) => [...m, { role: "assistant", text: full }]);
        return;
      }
      setStream(words.slice(0, i).join(""));
    }, 28);
  };

  return (
    <aside className="drawer" aria-label="Concept help">
      <div className="drawer-h">
        <Icon n="sparkle" />
        <div className="grow">
          <div style={{ fontWeight: 650 }}>Concept help</div>
          <div className="muted small">Fixed written answers</div>
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
              <div>These are fixed, written answers about concepts. No model is called and nothing leaves your browser. The AI features are the goal box (Suggested fixes), the AI draft (New design, Describe your system) and the what-if sentence box (Results), when the server has them on. The AI tab on the Evaluation page records what was tested.</div>
            </div>
          )}
          {messages.length === 0 && stream === null && (
            <div className="note">
              <Icon n="info" />
              <div>To explain a result, open a completed saved simulation in Results and choose Explain this result.</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`ai-msg ${m.role}`}>
              <div className="who">{m.role === "user" ? "You" : "Concept help"}</div>
              <div className="body">{m.text}</div>
            </div>
          ))}
          {stream !== null && (
            <div className="ai-msg assistant" aria-live="polite">
              <div className="who">Concept help</div>
              <div className="body caret">{stream}</div>
            </div>
          )}
        </div>
      </div>
      <div className="drawer-f stack">
        <div className="row tight">
          {STARTER_CHIPS.map((c) => (
            <button key={c} className="chip" onClick={() => send(c)} disabled={stream !== null}>
              {c}
            </button>
          ))}
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
          <button className="btn btn-primary icon" type="submit" aria-label="Send" disabled={stream !== null || !text.trim()}>
            <Icon n="send" />
          </button>
        </form>
        <div className="small muted">Scripted mock · nothing leaves your browser</div>
      </div>
    </aside>
  );
}
