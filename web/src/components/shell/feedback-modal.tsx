"use client";

import { useState } from "react";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/notify";

const KINDS: Array<[string, string]> = [
  ["bug", "Something broke"],
  ["idea", "Idea"],
  ["confusing", "Confusing"],
];
const PLACEHOLDER: Record<string, string> = {
  bug: "I pressed Run and…",
  idea: "It would help if…",
  confusing: "I expected… but saw…",
};

/** Phase 1: collects feedback and shows a toast. Nothing is stored or sent. */
export function FeedbackModal({ path }: { path: string }) {
  const { setUI } = useUi();
  const [kind, setKind] = useState("idea");
  const [msg, setMsg] = useState("");
  const [attach, setAttach] = useState(true);
  const close = () => setUI({ feedback: false });

  const submit = () => {
    if (!msg.trim()) {
      notify("Write a sentence or two first.", "warn");
      return;
    }
    close();
    notify("Thanks. Feedback is not stored yet, so nothing was sent.", "ok");
  };

  return (
    <Modal label="Send feedback" onClose={close}>
      <div className="modal-h">
        <Icon n="msg" />
        <div className="h3 grow">Send feedback</div>
        <button className="btn btn-ghost icon btn-sm" aria-label="Close" onClick={close}>
          <Icon n="x" />
        </button>
      </div>
      <div className="modal-b stack">
        <div className="seg" role="group" aria-label="Feedback type">
          {KINDS.map(([k, label]) => (
            <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="field">
          <label className="label" htmlFor="fb-msg">
            What happened, or what would help?
          </label>
          <textarea id="fb-msg" className="textarea" rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={PLACEHOLDER[kind]} />
        </div>
        <label className="row tight small ink2">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> Attach the current screen ({path || "/"})
        </label>
      </div>
      <div className="modal-f">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit}>
          Send feedback
        </button>
      </div>
    </Modal>
  );
}
