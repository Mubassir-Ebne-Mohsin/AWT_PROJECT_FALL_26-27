import { z } from "zod";
const identity = z.strictObject({
  requestId: z.uuid(),
  expectedRevision: z.number().int().positive(),
});
export type SubmissionIdentity = z.infer<typeof identity>;
export const recoveryKey = (user: string, attempt: string) =>
  `sf-submit:${user}:${attempt}`;
export function readSubmissionIdentity(
  storage: Pick<Storage, "getItem">,
  key: string,
): SubmissionIdentity | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = identity.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function rememberSubmissionIdentity(
  storage: Pick<Storage, "setItem" | "removeItem">,
  key: string,
  value: SubmissionIdentity | null,
) {
  try {
    if (value) storage.setItem(key, JSON.stringify(value));
    else storage.removeItem(key);
  } catch {
    /* In-memory identity still permits retry when storage is unavailable. */
  }
}
