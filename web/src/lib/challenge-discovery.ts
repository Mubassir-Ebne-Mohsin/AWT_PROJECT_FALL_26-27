import type { components } from "@/lib/api/phase3-schema";
export type Challenge = components["schemas"]["PublicChallenge"];
export type ProgressItem =
  components["schemas"]["ChallengeProgress"]["items"][number];
export const challengeCategory = (c: Challenge) =>
  c.learning?.category ?? "Unclassified";
export function discoverChallenges(
  all: Challenge[],
  filter: {
    search: string;
    category: string;
    difficulty: string;
    state: string;
    sort: string;
  },
  progress: Map<string, ProgressItem>,
) {
  const status = (id: string) =>
    progress.get(id)?.passed
      ? "passed"
      : progress.has(id)
        ? "in-progress"
        : "not-started";
  const rank = (c: Challenge) =>
    c.learning
      ? ["beginner", "intermediate", "advanced"].indexOf(c.learning.difficulty)
      : 3;
  return all
    .filter(
      (c) =>
        (!filter.search.trim() ||
          `${c.title} ${c.summary}`
            .toLowerCase()
            .includes(filter.search.trim().toLowerCase())) &&
        (!filter.category || challengeCategory(c) === filter.category) &&
        (!filter.difficulty || c.learning?.difficulty === filter.difficulty) &&
        (!filter.state || status(c.id) === filter.state),
    )
    .sort((a, b) =>
      filter.sort === "title"
        ? a.title.localeCompare(b.title)
        : filter.sort === "difficulty"
          ? rank(a) - rank(b) || a.title.localeCompare(b.title)
          : (a.learning?.sequence ?? 999) - (b.learning?.sequence ?? 999) ||
            a.title.localeCompare(b.title),
    );
}
