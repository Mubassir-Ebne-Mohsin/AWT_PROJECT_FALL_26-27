"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { Crumbs } from "@/components/shell/crumbs";
import { resolveRoute } from "@/lib/routes";
import { publishedChallenges, challengeProgress } from "@/lib/api/attempts";
import { ChallengeCard } from "@/components/learner/challenge-card";
import {
  discoverChallenges,
  challengeCategory,
} from "@/lib/challenge-discovery";

export function ChallengeLibrary() {
  const { user } = useAuth(),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [difficulty, setDifficulty] = useState(""),
    [state, setState] = useState(""),
    [sort, setSort] = useState("newest"),
    [limit, setLimit] = useState(12);
  const catalog = useQuery({
    queryKey: ["published-challenges", user?.id],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: ({ signal }) => publishedChallenges(signal),
    retry: false,
  });
  const progress = useQuery({
    queryKey: ["challenge-catalog-progress", user?.id],
    queryFn: ({ signal }) => challengeProgress(signal),
    enabled: !!user,
    retry: false,
  });
  const items = user ? progress.data?.items : undefined,
    byChallenge = useMemo(
      () => new Map((items ?? []).map((i) => [i.challengeId, i])),
      [items],
    );
  const available = user ? catalog.data ?? [] : [],
    ready = !!user && progress.isSuccess;
  const filtered = discoverChallenges(
    available,
    { search, category, difficulty, state: ready ? state : "", sort },
    byChallenge,
  );
  const existing = items?.find(
    (i) =>
      i.designId &&
      !i.archived &&
      available.some((c) => c.id === i.challengeId),
  );
  const reset = () => {
    setSearch("");
    setCategory("");
    setDifficulty("");
    setState("");
    setSort("newest");
    setLimit(12);
  };
  return (
    <div className="page stack lg challenge-page">
      <Crumbs resolved={resolveRoute("/challenges")} />
      <div className="challenge-heading">
        <div>
          <span className="eyebrow">ARCHITECTURE PRACTICE</span>
          <h1 className="h1">Challenges</h1>
          <p className="lede">
            Find the bottleneck. Make one thoughtful change. Test what improves.
          </p>
        </div>
        <div className="row">
          <button className="btn" aria-label="Refresh challenges" disabled={catalog.isFetching} onClick={() => { void catalog.refetch(); if (user) void progress.refetch(); }}>
            {catalog.isFetching ? "Refreshing…" : "Refresh challenges"}
          </button>
          <Link className="btn" href="/progress">My progress</Link>
        </div>
      </div>
      <div className="challenge-overview">
        <div>
          <strong>{available.length}</strong>
          <span>published in this set</span>
        </div>
        <div>
          <strong>
            {ready
              ? available.filter((c) => byChallenge.has(c.id)).length
              : "—"}
          </strong>
          <span>attempted in this set</span>
        </div>
        <div>
          <strong>
            {ready
              ? available.filter((c) => byChallenge.get(c.id)?.passed).length
              : "—"}
          </strong>
          <span>passed in this set</span>
        </div>
        {existing && (
          <Link
            className="btn btn-primary"
            href={`/challenges/${existing.challengeId}?attempt=${existing.attemptId}`}
          >
            Continue latest attempt →
          </Link>
        )}
      </div>
      {user && progress.isError && (
        <p role="status">
          Your progress is temporarily unavailable.{" "}
          <button className="btn" onClick={() => void progress.refetch()}>
            Retry progress
          </button>
        </p>
      )}
      <div className="challenge-filters" aria-label="Filter challenges">
        <label>
          Search challenges
          <input
            className="r2-input"
            placeholder="Title or scenario"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(12);
            }}
          />
        </label>
        <label>
          Category
          <select
            className="r2-input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {[...new Set(available.map(challengeCategory))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select
            className="r2-input"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">All levels</option>
            {["beginner", "intermediate", "advanced"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Progress
          <select
            className="r2-input"
            value={ready ? state : ""}
            disabled={!ready}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">All progress</option>
            <option value="not-started">Not started</option>
            <option value="in-progress">In progress</option>
            <option value="passed">Passed</option>
          </select>
        </label>
        <label>
          Sort
          <select
            className="r2-input"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="recommended">Recommended</option>
            <option value="difficulty">Difficulty</option>
            <option value="title">Title</option>
          </select>
        </label>
        <button className="btn" onClick={reset}>
          Reset filters
        </button>
      </div>
      <p className="hint">
        The catalog refreshes every 30 seconds while this page is visible. Mathematical model estimates, not real infrastructure measurements.
        Published traffic and targets are fixed; each exercise explains its
        allowed edits.
      </p>
      {catalog.isPending && (
        <div
          className="challenge-grid"
          role="status"
          aria-label="Loading challenges"
        >
          {[0, 1, 2].map((n) => (
            <div className="challenge-skeleton" key={n}>
              Loading challenge…
            </div>
          ))}
        </div>
      )}
      {catalog.isError && (
        <div className="panel stack r2-pad" role="alert">
          <p>
            Challenges could not be loaded. Your existing attempts are
            preserved.
          </p>
          <button className="btn" onClick={() => void catalog.refetch()}>
            Try again
          </button>
        </div>
      )}
      {catalog.isSuccess && (
        <>
          <p className="hint" role="status">
            {filtered.length} matching{" "}
            {filtered.length === 1 ? "challenge" : "challenges"}
            {available.length === 200
              ? " · Showing the server’s bounded catalog set"
              : ""}
          </p>
          {!filtered.length ? (
            <div className="panel stack r2-pad">
              <h2 className="h3">
                {available.length
                  ? "No matching challenges"
                  : "No published challenges yet"}
              </h2>
              <p>
                {available.length
                  ? "Try another keyword or clear the filters."
                  : "An Instructor can publish a challenge; no attempt has been lost."}
              </p>
              {!!available.length && (
                <button className="btn" onClick={reset}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="challenge-grid">
              {filtered.slice(0, limit).map((c) => (
                <ChallengeCard
                  key={c.id}
                  c={c}
                  attempt={byChallenge.get(c.id)}
                  signedIn={!!user}
                  ready={ready}
                  loadingProgress={!!user && progress.isPending}
                />
              ))}
            </div>
          )}
          {filtered.length > limit && (
            <button className="btn" onClick={() => setLimit((n) => n + 12)}>
              Show more challenges
            </button>
          )}
        </>
      )}
    </div>
  );
}
