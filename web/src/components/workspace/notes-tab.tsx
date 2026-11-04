"use client";

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchNotes, type DesignNote } from "@/lib/api/notes";
import { NoteComposer, NoteItem, type Notice } from "@/components/workspace/note-parts";
import { filterNotes, filterOptions, notesCountText, notesFull, parseFilter } from "@/lib/notes-presentation";

/**
 * The user's own decisions and assumptions, tied to the revision they were written for. Plain text only. A note can also be pinned to a
 * component of the saved design (docs/COMPONENT-NOTES-SCOPE.md); the list can be filtered by it.
 */
export function NotesTab({ designId, currentRevision, components = [] }: { designId: string; currentRevision: number; components?: { id: string; label: string }[] }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const aboutId = useId();
  const showId = useId();
  const [notice, setNotice] = useState<Notice>(null);
  const [about, setAbout] = useState("");
  const [show, setShow] = useState("all");

  const key = ["notes", user?.id, designId];
  const notes = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchNotes(designId, signal), refetchOnMount: "always" });
  const items: DesignNote[] = notes.data ?? [];
  const full = notesFull(items.length);
  const options = filterOptions(items, components);
  // A filter that no longer shows anything (its last note was deleted) falls back to all notes.
  const active = options.some((o) => o.value === show) ? show : "all";
  const visible = filterNotes(items, parseFilter(active));
  const refresh = () => queries.invalidateQueries({ queryKey: key });

  return (
    <section className="m15-notes-tab stack" aria-label="Design notes">
      <div className="panel">
        <div className="panel-h">
          <h2 className="h3">Notes</h2>
          <span className="tag">{notesCountText(items.length)}</span>
        </div>
        <div className="panel-b stack">
          <p className="hint">
            Write down why the design is the way it is. Each note is tied to the revision you wrote it for, and stays even when older versions are removed. A note can be about the whole design or about one component.
          </p>
          {notice && (
            <p className={"note " + (notice.ok ? "ok" : "fail")} role={notice.ok ? "status" : "alert"}>
              {notice.text}
            </p>
          )}
          {components.length > 0 && (
            <div className="m15-field">
              <label htmlFor={aboutId}>This note is about</label>
              <select id={aboutId} data-testid="note-about-select" value={about} onChange={(e) => setAbout(e.target.value)}>
                <option value="">The whole design</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <NoteComposer
            designId={designId}
            currentRevision={currentRevision}
            componentId={about || undefined}
            full={full}
            submitLabel={`Add note to revision ${currentRevision}`}
            onNotice={setNotice}
            onChanged={refresh}
          />
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
          {options.length > 1 && (
            <div className="m15-field">
              <label htmlFor={showId}>Show</label>
              <select id={showId} data-testid="note-filter" value={active} onChange={(e) => setShow(e.target.value)}>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <ul className="m15-notes" aria-label="Notes, newest first">
            {visible.map((note) => (
              <NoteItem key={note.id} note={note} designId={designId} currentRevision={currentRevision} showComponent onNotice={setNotice} onChanged={refresh} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
