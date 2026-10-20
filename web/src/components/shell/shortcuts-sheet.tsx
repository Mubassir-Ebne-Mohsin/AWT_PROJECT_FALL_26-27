"use client";

import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";

const SHORTCUTS: Array<[string, Array<[string, string]>]> = [
  [
    "Anywhere",
    [
      ["Ctrl K", "Jump to a screen, design or action"],
      ["?", "Show this sheet"],
      [".", "Toggle the AI assistant"],
      ["G then D", "Go to the dashboard"],
      ["G then N", "Start a new design"],
      ["Esc", "Close the open panel or dialog"],
    ],
  ],
  [
    "Design workspace (phase 2)",
    [
      ["R", "Run the stress test"],
      ["1 – 4", "Edit, Traffic, Results, Limits tabs"],
    ],
  ],
  [
    "Canvas editor (phase 2)",
    [
      ["Delete", "Delete the selected component or edge"],
      ["Ctrl Z", "Undo"],
      ["Ctrl Shift Z", "Redo"],
      ["Ctrl D", "Duplicate the selected component"],
      ["C", "Toggle connect mode"],
      ["L", "Toggle the load overlay"],
      ["F", "Fit the design to the screen"],
      ["+ / −", "Zoom in and out"],
      ["Arrow keys", "Nudge the selected component"],
    ],
  ],
];

export function ShortcutsSheet() {
  const { setUI } = useUi();
  const close = () => setUI({ shortcuts: false });
  return (
    <Modal label="Keyboard shortcuts" wide onClose={close}>
      <div className="modal-h">
        <Icon n="keyboard" />
        <div className="h3 grow">Keyboard shortcuts</div>
        <button className="btn btn-ghost icon btn-sm" aria-label="Close" onClick={close}>
          <Icon n="x" />
        </button>
      </div>
      <div className="modal-b grid-2">
        {SHORTCUTS.map(([group, list]) => (
          <div className="stack" key={group}>
            <div className="eyebrow">{group}</div>
            {list.map(([keys, desc]) => (
              <div className="row between" style={{ gap: 16 }} key={keys}>
                <span className="ink2">{desc}</span>
                <span className="row tight">
                  {keys.split(" ").map((k, i) =>
                    k === "then" || k === "/" || k === "–" ? (
                      <span className="muted small" key={i}>
                        {k}
                      </span>
                    ) : (
                      <kbd key={i}>{k}</kbd>
                    ),
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
