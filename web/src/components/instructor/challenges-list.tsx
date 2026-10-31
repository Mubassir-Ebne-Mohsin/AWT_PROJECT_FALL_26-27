"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGate } from "@/components/auth/role-gate";
import { ChallengeForm } from "@/components/instructor/challenge-form";
import { Crumbs } from "@/components/shell/crumbs";
import { createChallenge, fetchMyChallenges, type CreateChallenge } from "@/lib/api/challenges";
import { CHALLENGE_RULES_TEXT, EMPTY_FORM, baselineText, challengeErrorText, goalText, statusLabel, type Body } from "@/lib/challenge-presentation";
import { dateText } from "@/lib/report-presentation";
import { resolveRoute } from "@/lib/routes";

/** The Instructor's own challenges, and the form to start a new one. */
export function ChallengesList() {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/instructor/challenges")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Instructor</span>
          <h1 className="h1">My challenges</h1>
          <p className="lede">Write a goal, pick a starting design, and publish it for learners.</p>
        </div>
      </div>
      <RoleGate role="instructor">
        <Mine />
      </RoleGate>
    </div>
  );
}

function Mine() {
  const { user } = useAuth();
  const router = useRouter();
  const queries = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["my-challenges", user?.id], queryFn: ({ signal }) => fetchMyChallenges(signal), enabled: !!user, retry: false });
  const create = useMutation({
    mutationFn: (body: CreateChallenge) => createChallenge(body),
    onSuccess: (made) => {
      void queries.invalidateQueries({ queryKey: ["my-challenges", user?.id] });
      router.push(`/instructor/challenges/${made.id}`);
    },
    onError: (e) => setError(challengeErrorText(e)),
  });

  return (
    <>
      <p className="hint">{CHALLENGE_RULES_TEXT}</p>
      {!creating ? (
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
            New challenge
          </button>
        </div>
      ) : (
        <section className="panel stack r2-pad" aria-label="New challenge">
          <h2 className="h3">New challenge</h2>
          <ChallengeForm
            mode="create"
            initial={EMPTY_FORM}
            busy={create.isPending}
            serverError={error}
            submitLabel="Create draft"
            onSubmit={(body) => {
              setError(null);
              create.mutate(body as Body as CreateChallenge);
            }}
          />
          <div className="row">
            <button className="btn" type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="panel stack r2-pad" aria-label="Your challenges" data-testid="my-challenges">
        <h2 className="h3">Your challenges</h2>
        {list.isPending && <p className="hint">Loading…</p>}
        {list.isError && (
          <p className="m16-warn" role="alert">
            {challengeErrorText(list.error)}
          </p>
        )}
        {list.data && list.data.length === 0 && <p className="hint">You have not made a challenge yet.</p>}
        {list.data && list.data.length > 0 && (
          <ul className="r2-list">
            {list.data.map((c) => (
              <li key={c.id} className="r2-audit r5-item" data-testid="challenge-item">
                <span className="stack">
                  <span>
                    <strong>{c.title}</strong> <span className={"pill" + (c.status === "published" ? " ok" : c.status === "archived" ? "" : " warn")}>{statusLabel(c.status)}</span>
                  </span>
                  <span className="muted small">{goalText(c.goal)}</span>
                  <span className="muted small">{baselineText(c.baseline)}</span>
                  <span className="muted small">Changed {dateText(c.updatedAt)}</span>
                </span>
                <Link className="btn btn-sm" href={`/instructor/challenges/${c.id}`} aria-label={`Open ${c.title}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
