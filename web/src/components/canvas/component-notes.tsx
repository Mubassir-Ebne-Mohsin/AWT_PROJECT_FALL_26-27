"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { NoteComposer, NoteItem, type Notice } from "@/components/workspace/note-parts";
import { fetchNotes, type DesignNote } from "@/lib/api/notes";
import { filterNotes, notesFull } from "@/lib/notes-presentation";

/**
 * "Notes on this component" in the component's panel (docs/COMPONENT-NOTES-SCOPE.md): the notes pinned to the selected component, and a
 * form that adds one. It uses the same note parts and the same query as the Notes tab, so the two cannot disagree. A component that
 * exists only in the unsaved draft cannot be pinned yet, and the panel says so.
 */
export function ComponentNotes({
  designId,
  currentRevision,
  node,
  savedComponentIds,
}: {
  designId: string;
  currentRevision: number;
  node: { id: string; label: string };
  savedComponentIds: ReadonlySet<string>;
}) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const key = ["notes", user?.id, designId];
  const notes = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchNotes(designId, signal), enabled: !!user });
  const items: DesignNote[] = notes.data ?? [];
  const mine = filterNotes(items, { componentId: node.id });
  const refresh = () => queries.invalidateQueries({ queryKey: key });
  const saved = savedComponentIds.has(node.id);

  return (
    <div className="props-sec stack" data-testid="component-notes">
      <h3 className="h3" id="component-notes-heading" tabIndex={-1}>
        Notes on {node.label}
      </h3>
      {notice && (
        <p className={"note " + (notice.ok ? "ok" : "fail")} role={notice.ok ? "status" : "alert"}>
          {notice.text}
        </p>
      )}
      {notes.isError && (
        <div className="note fail" role="alert">
          <div>Notes could not be loaded.</div>
          <button className="btn btn-sm" onClick={() => void notes.refetch()}>
            Try again
          </button>
        </div>
      )}
      {notes.isSuccess && mine.length === 0 && <p className="hint">No notes on this component yet.</p>}
      <ul className="m15-notes" aria-label={`Notes on ${node.label}`}>
        {mine.map((note) => (
          <NoteItem key={note.id} note={note} designId={designId} currentRevision={currentRevision} showComponent={false} onNotice={setNotice} onChanged={refresh} />
        ))}
      </ul>
      <NoteComposer
        designId={designId}
        currentRevision={currentRevision}
        componentId={node.id}
        full={notesFull(items.length)}
        disabledReason={saved ? null : "This component is not saved yet. Save the design, then add the note."}
        submitLabel="Add note to this component"
        textLabel={`Note about ${node.label}`}
        onNotice={setNotice}
        onChanged={refresh}
      />
    </div>
  );
}
