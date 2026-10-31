"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { readAttempt } from "@/lib/api/attempts";
/** Identifies only a verified owned attempt; query parameters never confer access. */
export function AttemptWorkspaceContext({
  designId,
  blocked,
}: {
  designId: string;
  blocked: boolean;
}) {
  const search = useSearchParams(),
    id = search.get("attempt"),
    { user } = useAuth();
  const valid = !!id && /^[0-9a-f-]{36}$/i.test(id);
  const q = useQuery({
    queryKey: ["attempt-workspace", user?.id, id],
    queryFn: ({ signal }) => readAttempt(id!, signal),
    enabled: !!user && valid,
    retry: false,
  });
  if (!q.data || q.data.attempt.designId !== designId) return null;
  return (
    <div className="note">
      <div>
        <strong>Challenge attempt: {q.data.challenge.title}</strong>
        <p>Judging uses the fixed challenge traffic.</p>
        {blocked ? (
          <p>
            Save your edits and finish pending editor work before returning to
            submit.
          </p>
        ) : (
          <Link
            href={`/challenges/${q.data.attempt.challengeId}?attempt=${q.data.attempt.id}`}
          >
            Return to challenge and submit
          </Link>
        )}
      </div>
    </div>
  );
}
