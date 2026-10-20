// The assistant's replies in phase 1. No model is called: this is a local function.
// Phase 3 replaces it with streamed responses from the API. The simulator-aware branches
// of the prototype's scriptedReply (SECTION 6) need the engine and arrive in phase 2.

export function scriptedReply(question: string): string {
  const t = question.toLowerCase();
  if (/p95|p99|percentile|tail/.test(t)) {
    return "p95 is the latency that 95 out of 100 requests beat. The slowest 5% are what users notice, so it is a better target than the average.\n\nWhen designs arrive in phase 2, I will show p50, p95 and p99 for the design you have open and point at the paths that make the tail slow.";
  }
  if (/cache|redis|hit/.test(t)) {
    return "A cache keeps hot data in memory. With an 80% hit rate, 4 of every 5 reads never touch the database, which is often the cheapest way to raise a design’s breaking point.";
  }
  if (/queue|kafka|async|burst|worker/.test(t)) {
    return "A queue accepts work immediately and lets workers process it at their own pace. Bursts fill the queue instead of hitting the database all at once. The cost is lag: the work finishes later.";
  }
  if (/replica|read only|read-only/.test(t)) {
    return "A read replica is a read-only copy of the primary. It takes a share of reads, but it replays every write too, so it does not help a write-heavy database.";
  }
  if (/region|far|distance|asia|europe/.test(t)) {
    return "Each component has a region. A call between regions adds a round trip: about 75 ms US East to EU West and 190 ms US East to Asia South. Utilization doesn’t change that, only placement does.";
  }
  return "I can explain results and suggest fixes for the design you have open. Designs arrive in phase 2, so for now I can explain concepts: p95, caching, queues, read replicas and regions.";
}

export const STARTER_CHIPS = ["What is p95?", "When should I add a queue?", "How do read replicas help?"];
