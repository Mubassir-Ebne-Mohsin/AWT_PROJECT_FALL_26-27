"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api/errors";
import { createNote, deleteNote, fetchNotes, patchNote, type DesignNote, type NoteKind } from "@/lib/api/notes";
import { NOTE_KIND_HELP, noteDraft, noteKindLabel, notesCountText, notesFull } from "@/lib/notes-presentation";
import { workspaceHref } from "@/lib/run-links";

type Notice = { ok: boolean; text: string } | null;

function failureText(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Nothing was changed.";
  const reason = (error.details as { reason?: string } | undefined)?.reason;
  if (reason === "NOTES_LIMIT_REACHED") return "This design already has the maximum number of notes. Delete one to add another.";
  if (reason === "NOTE_CHANGED") return "This note changed elsewhere, so your edit was not saved. The latest version is shown; review it and edit again.";
  if (reason === "NOTE_REVISION_INVALID") return "That revision does not exist yet. Nothing was saved.";
  if (error.status === 422) return "That note could not be saved. Check its length and try again.";
  if (error.status === 403 || error.status === 404) return "That note or design is not available to this account.";
  if (error.code === "NETWORK") return "The server could not be reached. Your text is still here; nothing was saved.";
  return "The note was not saved. Your text is still here.";
}

function KindSelect({ value, onChange, label }: { value: NoteKind; onChange: (kind: NoteKind) => void; label: string }) {
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

function Counter({ text }: { text: string }) {
  const d = noteDraft(text);
  return (
    <span className={"small " + (d.problem ? "c-fail" : "muted")} role="status">
      {d.problem ?? `${d.remaining.toLocaleString("en-US")} characters left`}
    </span>
  );
}

/** The user's own decisions and assumptions, tied to the revision they were written for. Plain text only. */
export function NotesTab({ designId, currentRevision }: { designId: string; currentRevision: number }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const textId = useId();
  const [kind, setKind] = useState<NoteKind>("decision");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<{ id: string; kind: NoteKind; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const key = ["notes", user?.id, designId];
  const notes = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchNotes(designId, signal), refetchOnMount: "always" });
  const items: DesignNote[] = notes.data ?? [];
  const full = notesFull(items.length);
  const draft = noteDraft(text);

  async function add() {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await createNote(designId, { kind, text });
      setText("");
      setNotice({ ok: true, text: `Note added to revision ${saved.revision}.` });
      await queries.invalidateQueries({ queryKey: key });
    } catch (error) {
      setNotice({ ok: false, text: failureText(error) });
      if (error instanceof ApiError && (error.details as { reason?: string } | undefined)?.reason === "NOTES_LIMIT_REACHED")
        void queries.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  }
  async function save(note: DesignNote) {
    if (!editing) return;
    setBusy(true);
    setNotice(null);
    try {
      await patchNote(designId, note.id, { expectedUpdatedAt: note.updatedAt, kind: editing.kind, text: editing.text });
      setEditing(null);
      setNotice({ ok: true, text: "Note updated." });
      await queries.invalidateQueries({ queryKey: key });
    } catch (error) {
      setNotice({ ok: false, text: failureText(error) });
      if (error instanceof ApiError && (error.details as { reason?: string } | undefined)?.reason === "NOTE_CHANGED") {
        setEditing(null);
        void queries.invalidateQueries({ queryKey: key });
      }
    } finally {
      setBusy(false);
    }
  }
  async function remove(note: DesignNote) {
    setBusy(true);
    setNotice(null);
    try {
      await deleteNote(designId, note.id);
      setDeleting(null);
      setNotice({ ok: true, text: "Note deleted." });
      await queries.invalidateQueries({ queryKey: key });
    } catch (error) {
      setNotice({ ok: false, text: failureText(error) });
      setDeleting(null);
      void queries.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="m15-notes-tab stack" aria-label="Design notes">
      <div className="panel">
        <div className="panel-h">
          <h2 className="h3">Notes</h2>
          <span className="tag">{notesCountText(items.length)}</span>
        </div>
        <div className="panel-b stack">
          <p className="hint">
            Write down why the design is the way it is. Each note is tied to the revision you wrote it for, and stays even when older versions are removed.
          </p>
          {notice && (
            <p className={"note " + (notice.ok ? "ok" : "fail")} role={notice.ok ? "status" : "alert"}>
              {notice.text}
            </p>
          )}
          <form
            className="m15-form stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.canSave && !busy && !full) void add();
            }}
          >
            <KindSelect value={kind} onChange={setKind} label="Kind of note" />
            <div className="m15-field">
              <label htmlFor={textId}>Note</label>
              <textarea
                id={textId}
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={full}
                aria-describedby={textId + "-count"}
              />
              <span id={textId + "-count"}>
                <Counter text={text} />
              </span>
            </div>
            {full && <p className="note warn">This design has the maximum of 100 notes. Delete one to add another.</p>}
            <div className="row tight">
              <button className="btn btn-primary btn-sm" type="submit" disabled={!draft.canSave || busy || full}>
                {busy && !editing ? "Saving…" : `Add note to revision ${currentRevision}`}
              </button>
            </div>
          </form>
          {notes.isPending && <p role="status">Loading notes…</p>}
          {notes.isError && (
            <div className="note fail" role="alert">
              <div>Notes could not be loaded. Your design is unaffected.</div>
              <button className="btn btn-sm" onClick={() => void notes.refetch()}>
                Try again
              </button>
            </div>
          )}
          {notes.isSuccess && items.length === 0 && <p>No notes yet. Add the first decision or assumption above.</p>}
          <ul className="m15-notes" aria-label="Notes, newest first">
            {items.map((note) => (
              <li key={note.id} className="m15-note">
                <div className="row tight m15-vh">
                  <span className="tag">{noteKindLabel(note.kind)}</span>
                  <Link href={workspaceHref(designId, "history")}>Revision {note.revision}</Link>
                  {note.revision === currentRevision && <span className="tag accent">Current</span>}
                  <time className="small muted" dateTime={note.updatedAt}>
                    {note.updatedAt !== note.createdAt ? "Edited " : ""}
                    {new Date(note.updatedAt).toLocaleString()}
                  </time>
                </div>
                {editing?.id === note.id ? (
                  <div className="stack">
                    <KindSelect value={editing.kind} onChange={(k) => setEditing({ ...editing, kind: k })} label="Kind of note" />
                    <div className="m15-field">
                      <label htmlFor={"edit-" + note.id}>Edit note</label>
                      <textarea id={"edit-" + note.id} rows={4} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                      <Counter text={editing.text} />
                    </div>
                    <div className="row tight">
                      <button className="btn btn-primary btn-sm" disabled={busy || !noteDraft(editing.text).canSave} onClick={() => void save(note)}>
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
                      <button className="btn btn-sm" disabled={busy} onClick={() => setEditing({ id: note.id, kind: note.kind, text: note.text })}>
                        Edit
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDeleting(deleting === note.id ? null : note.id)} aria-expanded={deleting === note.id}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
                {deleting === note.id && (
                  <div className="note warn" role="group" aria-label="Confirm deleting this note">
                    <div className="stack">
                      <strong>Delete this note? This cannot be undone.</strong>
                      <div className="row tight">
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void remove(note)}>
                          Delete note
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDeleting(null)}>
                          Keep
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
