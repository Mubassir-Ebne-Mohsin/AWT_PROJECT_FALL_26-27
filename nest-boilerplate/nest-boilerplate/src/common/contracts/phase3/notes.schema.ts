import { z } from "zod";

// M15.3 Notes: the user's own words about a design, tied to the revision they were written for.
// Plain text only. These contracts do not depend on the optional AI contracts.

export const NOTE_MAX_CHARS = 2000;
export const NOTES_MAX_PER_DESIGN = 100;

export const noteKindSchema = z.enum(["decision", "assumption"]);

/** Trimmed, non-empty, bounded plain text. NUL is rejected because PostgreSQL cannot store it. */
const noteText = z
  .string()
  .trim()
  .min(1, "Write something first")
  .max(NOTE_MAX_CHARS)
  .refine((value) => !value.includes("\u0000"), "Text contains an unsupported character");

export const designNoteSchema = z.strictObject({
  id: z.uuid(),
  designId: z.uuid(),
  /** The saved revision this note is about. It stays valid after that version is pruned. */
  revision: z.number().int().positive(),
  kind: noteKindSchema,
  text: noteText,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** `revision` defaults to the design's current revision. It cannot point at a revision that does not exist yet. */
export const createNoteRequestSchema = z.strictObject({
  kind: noteKindSchema,
  text: noteText,
  revision: z.number().int().positive().optional(),
});

/**
 * `expectedUpdatedAt` is the updatedAt the editor last saw, so an edit made from a stale view
 * gets a 409 instead of silently overwriting a newer change (for example from another tab).
 */
export const patchNoteRequestSchema = z
  .strictObject({
    expectedUpdatedAt: z.iso.datetime(),
    kind: noteKindSchema.optional(),
    text: noteText.optional(),
  })
  .refine((value) => value.kind !== undefined || value.text !== undefined, "Supply kind or text");
