import type { Progress } from "@/lib/learn-progress";

// P6 Progress. What the concepts part of /progress shows, and the one suggestion it makes. Everything is computed from the
// Learn marks (kept in this browser) and the recorded challenge attempts; there are no dates, so there is no streak.

export type TopicRef = { id: string; title: string };
export type ChallengeItem = { challengeId: string; title: string; passed: boolean; archived: boolean };
/** null while the challenge results are loading or could not be loaded: nothing is then claimed about challenges. */
export type ChallengeState = { items: ChallengeItem[] } | null;

export type Suggestion = { kind: "topic" | "check" | "challenge" | "browse" | "done"; label: string; href: string | null; reason: string };

export function conceptTally(progress: Progress, topics: readonly TopicRef[]) {
  const ids = new Set(topics.map((t) => t.id));
  return {
    total: topics.length,
    opened: progress.opened.filter((id) => ids.has(id)).length,
    passed: progress.passed.filter((id) => ids.has(id)).length,
  };
}

/** Challenges attempted and not yet passed by any attempt, once each, in the order first seen. Archived ones cannot be continued. */
export function unpassedChallenges(items: readonly ChallengeItem[]): ChallengeItem[] {
  const passedIds = new Set(items.filter((i) => i.passed).map((i) => i.challengeId));
  const seen = new Set<string>();
  const out: ChallengeItem[] = [];
  for (const i of items) {
    if (i.archived || passedIds.has(i.challengeId) || seen.has(i.challengeId)) continue;
    seen.add(i.challengeId);
    out.push(i);
  }
  return out;
}

/**
 * One suggestion, by a fixed rule, with its reason:
 * 1. the first topic not yet opened;  2. else the first topic opened but not yet passed;
 * 3. else a challenge attempted and not yet passed;  4. else (none attempted yet) the challenges list;
 * 5. else everything here is done. While challenge results are unknown, step 5 is never claimed.
 */
export function nextSuggestion(progress: Progress, topics: readonly TopicRef[], challenges: ChallengeState): Suggestion {
  const unopened = topics.find((t) => !progress.opened.includes(t.id) && !progress.passed.includes(t.id));
  if (unopened) return { kind: "topic", label: `Read “${unopened.title}”`, href: `/learn/${unopened.id}`, reason: "It is the first concept you have not opened yet." };
  const unpassed = topics.find((t) => !progress.passed.includes(t.id));
  if (unpassed) return { kind: "check", label: `Take the check for “${unpassed.title}”`, href: `/learn/${unpassed.id}`, reason: "You opened it but have not passed its check yet." };
  if (!challenges) return { kind: "browse", label: "Try a challenge", href: "/challenges", reason: "You have passed every concept check." };
  const open = unpassedChallenges(challenges.items)[0];
  if (open) return { kind: "challenge", label: `Continue “${open.title}”`, href: `/challenges/${open.challengeId}`, reason: "You attempted it and have not passed it yet." };
  if (challenges.items.length === 0) return { kind: "browse", label: "Try a challenge", href: "/challenges", reason: "You have passed every concept check and have not attempted a challenge yet." };
  return { kind: "done", label: "You have covered everything here", href: null, reason: "Every concept check and every challenge you attempted is passed." };
}
