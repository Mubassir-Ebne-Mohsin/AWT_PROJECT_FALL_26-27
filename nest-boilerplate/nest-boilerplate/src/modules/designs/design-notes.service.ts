import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { DesignsService } from "@/modules/designs/designs.service";
import { DesignNote } from "@/modules/designs/entities/design-note.entity";
import { DesignVersion } from "@/modules/designs/entities/design-version.entity";
import type { Graph } from "@/common/contracts/phase2/graph.schema";
import {
  NOTES_MAX_PER_DESIGN,
  createNoteRequestSchema,
  designNoteSchema,
  patchNoteRequestSchema,
} from "@/common/contracts/phase3/notes.schema";
import { z } from "zod";

type CreateNote = z.infer<typeof createNoteRequestSchema>;
type PatchNote = z.infer<typeof patchNoteRequestSchema>;

/**
 * M15.3 Notes. Owner-only. Every write locks the design row first, so the per-design limit cannot be
 * exceeded by parallel requests and a note can never be written for a design that was just deleted.
 *
 * A note may be pinned to a component (docs/COMPONENT-NOTES-SCOPE.md). The pin is accepted only if that component is in the graph of
 * the note's own revision, it cannot be changed afterwards, and if the component is later removed the note is kept and flagged.
 */
@Injectable()
export class DesignNotesService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
  ) {}

  /** The note as the client sees it. `graph` is the design's CURRENT graph: it decides the component's label and whether it is gone. */
  private dto(row: DesignNote, graph: Pick<Graph, "nodes">) {
    const pinned = row.componentId ?? null;
    const node = pinned ? graph.nodes.find((n) => n.id === pinned) : undefined;
    return designNoteSchema.parse({
      id: row.id,
      designId: row.designId,
      revision: row.revision,
      kind: row.kind,
      componentId: pinned,
      component: node ? { id: node.id, label: node.label } : null,
      componentRemoved: pinned !== null && !node,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  async list(owner: string, designId: string) {
    const design = await this.designs.owned(owner, designId);
    const rows = await this.db.getRepository(DesignNote).find({
      where: { designId },
      order: { createdAt: "DESC", id: "DESC" },
      take: NOTES_MAX_PER_DESIGN,
    });
    return rows.map((row) => this.dto(row, design.graph));
  }

  async create(owner: string, designId: string, body: CreateNote) {
    return this.db.transaction(async (m) => {
      const design = await this.designs.owned(owner, designId, m, true);
      const revision = body.revision ?? design.revision;
      if (revision > design.revision)
        throw new AppException("VALIDATION_FAILED", "A note cannot be about a revision that does not exist yet", {
          reason: "NOTE_REVISION_INVALID",
          currentRevision: design.revision,
        });
      if (body.componentId !== undefined) {
        // The component must exist in the graph of the revision the note is about.
        let graph: Pick<Graph, "nodes"> | null = design.graph;
        if (revision !== design.revision) graph = (await m.findOneBy(DesignVersion, { designId, revision }))?.snapshot.graph ?? null;
        if (!graph)
          throw new AppException("VALIDATION_FAILED", "That revision is no longer kept, so a note cannot be pinned to one of its components", {
            reason: "NOTE_COMPONENT_REVISION_UNAVAILABLE",
            revision,
          });
        if (!graph.nodes.some((n) => n.id === body.componentId))
          throw new AppException("VALIDATION_FAILED", "That component is not in this revision of the design", {
            reason: "NOTE_COMPONENT_UNKNOWN",
            componentId: body.componentId,
            revision,
          });
      }
      if ((await m.count(DesignNote, { where: { designId } })) >= NOTES_MAX_PER_DESIGN)
        throw new AppException("VALIDATION_FAILED", "This design already has the maximum number of notes", {
          reason: "NOTES_LIMIT_REACHED",
          limit: NOTES_MAX_PER_DESIGN,
        });
      const now = new Date();
      const row = await m.save(
        m.create(DesignNote, { designId, revision, kind: body.kind, componentId: body.componentId ?? null, text: body.text, createdAt: now, updatedAt: now }),
      );
      return this.dto(row, design.graph);
    });
  }

  async patch(owner: string, designId: string, noteId: string, body: PatchNote) {
    return this.db.transaction(async (m) => {
      const design = await this.designs.owned(owner, designId, m, true);
      const row = await m.findOneBy(DesignNote, { id: noteId, designId });
      if (!row) throw new AppException("NOT_FOUND", "Note not found");
      if (row.updatedAt.toISOString() !== body.expectedUpdatedAt)
        throw new AppException("CONFLICT", "This note changed elsewhere. Your edit was not saved.", {
          reason: "NOTE_CHANGED",
          currentUpdatedAt: row.updatedAt.toISOString(),
        });
      // The pin is not part of the patch contract (strict object), so it cannot change here.
      if (body.kind !== undefined) row.kind = body.kind;
      if (body.text !== undefined) row.text = body.text;
      // Always strictly later than the version the client saw, even within the same millisecond.
      const next = new Date();
      row.updatedAt = next.getTime() > row.updatedAt.getTime() ? next : new Date(row.updatedAt.getTime() + 1);
      return this.dto(await m.save(row), design.graph);
    });
  }

  async remove(owner: string, designId: string, noteId: string) {
    await this.db.transaction(async (m) => {
      await this.designs.owned(owner, designId, m, true);
      const result = await m.delete(DesignNote, { id: noteId, designId });
      if (!result.affected) throw new AppException("NOT_FOUND", "Note not found");
    });
  }
}
