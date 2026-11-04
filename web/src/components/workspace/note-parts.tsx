"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/errors";
import { createNote, deleteNote, patchNote, type DesignNote, type NoteKind } from "@/lib/api/notes";
import { NOTE_KIND_HELP, noteAboutText, noteDraft, noteKindLabel } from "@/lib/notes-presentation";
import { workspaceHref } from "@/lib/run-links";

/**
 * The pieces of a note that the Notes tab and a component's own notes share, so adding, editing and deleting behave the same in both
 * places (docs/COMPONENT-NOTES-SCOPE.md). The wording is the Notes tab's own, unchanged.
 */
export type Notice = { ok: boolean; text: string } | null;

const reasonOf = (error: unknown) => (error instanceof ApiError ? (error.details as { reason?: string } | undefined)?.reason : undefined);

export function failureText(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Nothing was changed.";
  const reason = reasonOf(error);
  if (reason === "NOTES_LIMIT_REACHED") return "This design already has the maximum number of notes. Delete one to add another.";
  if (reason === "NOTE_CHANGED") return "This note changed elsewhere, so your edit was not saved. The latest version is shown; review it and edit again.";
  if (reason === "NOTE_REVISION_INVALID") return "That revision does not exist yet. Nothing was saved.";
  if (reason === "NOTE_COMPONENT_UNKNOWN") return "That component is not in the saved design yet. Save the design first, then add the note. Nothing was saved.";
  if (reason === "NOTE_COMPONENT_REVISION_UNAVAILABLE") return "That revision is no longer kept, so the note cannot be pinned to one of its components. Nothing was saved.";
  if (error.status === 422) return "That note could not be saved. Check its length and try again.";
  if (error.status === 403 || error.status === 404) return "That note or design is not available to this account.";
  if (error.code === "NETWORK") return "The server could not be reached. Your text is still here; nothing was saved.";
  return "The note was not saved. Your text is still here.";
}

export function KindSelect({ value, onChange, label }: { value: NoteKind; onChange: (kind: NoteKind) => void; label: string }) {
  const id = useId();
  return (
    <div className="m15-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as NoteKind)}>
        <option value="decision">Decision</option>
        <option value="assumption">Assumption</option>
      </select>
      <span className="small muted">{NOTE_KIND_HELP[value]}</span>
    </div>
  );
}

export function Counter({ text }: { text: string }) {
  const d = noteDraft(text);
  return (
    <span className={"small " + (d.problem ? "c-fail" : "muted")} role="status">
      {d.problem ?? `${d.remaining.toLocaleString("en-US")} characters left`}
    </span>
  );
}

/** The form that adds a note. With `componentId` the note is pinned to that component; without it, it is about the whole design. */
export function NoteComposer({
  designId,
  currentRevision,
  componentId,
  full,
  disabledReason,
  submitLabel,
  textLabel = "Note",
  onNotice,
  onChanged,
}: {
  designId: string;
  currentRevision: number;
  componentId?: string;
  full: boolean;
  /** When set, the form cannot be used and this says why (for example, the component is not saved yet). */
  disabledReason?: string | null;
  submitLabel?: string;
  textLabel?: string;
  onNotice: (notice: Notice) => void;
  onChanged: () => Promise<unknown> | void;
}) {
  const textId = useId();
  const [kind, setKind] = useState<NoteKind>("decision");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = noteDraft(text);
  const blocked = full || !!disabledReason;

  async function add() {
    setBusy(true);
    onNotice(null);
    try {
      const saved = await createNote(designId, { kind, text, ...(componentId ? { componentId } : {}) });
      setText("");
      onNotice({ ok: true, text: `Note added to revision ${saved.revision}.` });
      await onChanged();
    } catch (error) {
      onNotice({ ok: false, text: failureText(error) });
      if (reasonOf(error) === "NOTES_LIMIT_REACHED") void onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="m15-form stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.canSave && !busy && !blocked) void add();
      }}
    >
      <KindSelect value={kind} onChange={setKind} label="Kind of note" />
      <div className="m15-field">
        <label htmlFor={textId}>{textLabel}</label>
        <textarea id={textId} rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={blocked} aria-describedby={textId + "-count"} />
        <span id={textId + "-count"}>
          <Counter text={text} />
        </span>
      </div>
      {full && <p className="note warn">This design has the maximum of 100 notes. Delete one to add another.</p>}
      {disabledReason && <p className="hint">{disabledReason}</p>}
      <div className="row tight">
        <button className="btn btn-primary btn-sm" type="submit" disabled={!draft.canSave || busy || blocked}>
          {busy ? "Saving…" : (submitLabel ?? `Add note to revision ${currentRevision}`)}
        </button>
      </div>
    </form>
  );
}

/** One note, with edit and delete. `showComponent` adds the component's name (the Notes tab); a component's own list leaves it out. */
export function NoteItem({
  note,
  designId,
  currentRevision,
  showComponent,
  onNotice,
  onChanged,
}: {
  note: DesignNote;
  designId: string;
  currentRevision: number;
  showComponent: boolean;
  onNotice: (notice: Notice) => void;
  onChanged: () => Promise<unknown> | void;
}) {
  const [editing, setEditing] = useState<{ kind: NoteKind; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const about = showComponent ? noteAboutText(note) : null;

  async function save() {
    if (!editing) return;
    setBusy(true);
    onNotice(null);
    try {
      await patchNote(designId, note.id, { expectedUpdatedAt: note.updatedAt, kind: editing.kind, text: editing.text });
      setEditing(null);
      onNotice({ ok: true, text: "Note updated." });
      await onChanged();
    } catch (error) {
      onNotice({ ok: false, text: failureText(error) });
      if (reasonOf(error) === "NOTE_CHANGED") {
        setEditing(null);
        void onChanged();
      }
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    onNotice(null);
    try {
      await deleteNote(designId, note.id);
      setDeleting(false);
      onNotice({ ok: true, text: "Note deleted." });
      await onChanged();
    } catch (error) {
      onNotice({ ok: false, text: failureText(error) });
      setDeleting(false);
      void onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="m15-note">
      <div className="row tight m15-vh">
        <span className="tag">{noteKindLabel(note.kind)}</span>
        {about && (
          <span className={"tag" + (note.componentRemoved ? "" : " accent")} data-testid="note-about">
            {note.componentRemoved ? about : `On ${about}`}
          </span>
        )}
        <Link href={workspaceHref(designId, "history")}>Revision {note.revision}</Link>
        {note.revision === currentRevision && <span className="tag accent">Current</span>}
        <time className="small muted" dateTime={note.updatedAt}>
          {note.updatedAt !== note.createdAt ? "Edited " : ""}
          {new Date(note.updatedAt).toLocaleString()}
        </time>
      </div>
      {editing ? (
        <div className="stack">
          <KindSelect value={editing.kind} onChange={(k) => setEditing({ ...editing, kind: k })} label="Kind of note" />
          <div className="m15-field">
            <label htmlFor={"edit-" + note.id}>Edit note</label>
            <textarea id={"edit-" + note.id} rows={4} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
            <Counter text={editing.text} />
          </div>
          <div className="row tight">
            <button className="btn btn-primary btn-sm" disabled={busy || !noteDraft(editing.text).canSave} onClick={() => void save()}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="m15-note-text">{note.text}</p>
          <div className="row tight">
            <button className="btn btn-sm" disabled={busy} onClick={() => setEditing({ kind: note.kind, text: note.text })}>
              Edit
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDeleting(!deleting)} aria-expanded={deleting}>
              Delete
            </button>
          </div>
        </>
      )}
      {deleting && (
        <div className="note warn" role="group" aria-label="Confirm deleting this note">
          <div className="stack">
            <strong>Delete this note? This cannot be undone.</strong>
            <div className="row tight">
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void remove()}>
                Delete note
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDeleting(false)}>
                Keep
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
