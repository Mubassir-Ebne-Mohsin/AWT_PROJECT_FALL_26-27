import { BURST_SECONDS, CACHE_DEFAULT_HIT, CDN_DEFAULT_HIT, COMPONENT, REPLICATION_COST, RTT_MS, STATUS, WORKER_CAPACITY, caching, cdn, percentiles, queue } from "@/lib/learn-model";

// P2 Learn: the lessons, as typed data. Numbers in the words come from the same model the demos run on
// (learn-model.ts, which is checked against the real simulator), so a lesson cannot quote a figure the app does not use.
// Plain English, no promises about measured performance. Edit the words here; the components only lay them out.

export type Question = { prompt: string; options: string[]; answer: number; why: string };
export type Topic = {
  id: string;
  title: string;
  summary: string;
  body: string[];
  /** Where this idea shows up in the app (names a screen; never a link into somebody's design). */
  seen: string;
  takeaway: string;
  quiz: [Question, Question];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ms = (x: number) => `${Math.round(x)} ms`;
const [US, EU, AP] = ["us-east", "eu-west", "ap-south"];
const rtt = (a: string, b: string) => RTT_MS[`${a}|${b}`];

const pHealthy = percentiles({ fast: 20, slow: 400, share: 0 });
const pSlow = percentiles({ fast: 20, slow: 400, share: 0.05 });
const cacheLow = caching({ rps: 1000, readRatio: 1, hit: CACHE_DEFAULT_HIT, burst: 1 });
const cacheHigh = caching({ rps: 1000, readRatio: 1, hit: 0.95, burst: 1 });
const cdnSample = cdn({ rps: 2000, readRatio: 0.8, hit: CDN_DEFAULT_HIT, burst: 1.5 });
const growing = queue({ rps: 500, burst: 1, drain: WORKER_CAPACITY, maxDepth: 500000, durationMin: 10 });

export const TOPICS: Topic[] = [
  {
    id: "utilization",
    title: "Utilization (ρ)",
    summary: "How busy a component is, and why delays explode as it nears 100%.",
    body: [
      `Utilization, written ρ (rho), is how much of a component's capacity the traffic uses. If an app server can handle ${COMPONENT.app.capacity} requests a second and ${COMPONENT.app.capacity * STATUS.ok} arrive, ρ is ${pct(STATUS.ok)}.`,
      "StressForge measures ρ at the busiest moment, the burst, not the average. Steady load times the burst multiplier is the peak, and ρ is that peak divided by what the component can handle: its capacity times its replicas.",
      `Waiting time stays tiny while ρ is low, then climbs steeply as ρ nears 100%. That is why the app calls a component Healthy below ${pct(STATUS.ok)}, Warning from ${pct(STATUS.ok)}, and Failing at ${pct(STATUS.fail)} or more. For a single server the wait is its service time times ρ ÷ (1 − ρ). With several parallel servers the model uses a standard approximation, so the climb starts later but is just as steep. Past 98.5% it also adds a penalty for a full queue.`,
    ],
    seen: "On the Results tab each component shows its ρ and status, and the Limits tab finds the load at which the first component reaches 100%.",
    takeaway: "Keep the busiest component well under 100% at the burst; the last few percent cost the most delay.",
    quiz: [
      {
        prompt: `A server can handle ${COMPONENT.app.capacity} requests a second. At the burst peak ${COMPONENT.app.capacity * STATUS.ok} arrive. What is ρ?`,
        options: ["45%", "133%", pct(STATUS.ok), `${COMPONENT.app.capacity * STATUS.ok}`],
        answer: 2,
        why: `ρ is load divided by capacity: ${COMPONENT.app.capacity * STATUS.ok} ÷ ${COMPONENT.app.capacity} = ${pct(STATUS.ok)}, which the app shows as Warning.`,
      },
      {
        prompt: "Traffic stays the same. Which change lowers ρ?",
        options: ["Raising the burst multiplier", "Adding a replica", "Lengthening the test", "Lowering the capacity"],
        answer: 1,
        why: "More replicas raise the capacity in the denominator, so the same peak uses a smaller share of it.",
      },
    ],
  },
  {
    id: "queues",
    title: "Queues",
    summary: "How a buffer between a sender and its workers absorbs bursts, and when it only hides trouble.",
    body: [
      "A queue sits between a fast sender and slower workers. The app drops a job into the queue and carries on; workers pick jobs up when they can.",
      "If the workers keep up with the average rate but not with a short burst, the queue absorbs the burst: jobs wait a little, then the backlog drains. If the workers are slower than the average rate, the backlog only grows, and the wait for each new job keeps lengthening.",
      `The model shows the backlog (jobs waiting), the lag (how long a new job waits: the backlog divided by the workers' combined rate) and the share of jobs lost once the queue's size limit is reached. Bursts last ${BURST_SECONDS} seconds in the model. A queue hides slowness from users; it does not remove it.`,
    ],
    seen: "On the Results tab each queue shows its state: clear, absorbing a burst, or growing, with its backlog and lag.",
    takeaway: "Workers must keep up with the average rate. A queue only buys time for the bursts in between.",
    quiz: [
      {
        prompt: `Workers can drain ${WORKER_CAPACITY} jobs a second. Jobs arrive at ${growing.arrival} a second for 10 minutes. What happens?`,
        options: ["The queue stays empty", "The backlog grows the whole time", "The queue absorbs a short burst and recovers", "The jobs are processed twice"],
        answer: 1,
        why: `Jobs arrive twice as fast as they leave, so the backlog grows by ${growing.arrival - WORKER_CAPACITY} a second: ${growing.backlog.toLocaleString("en-US")} jobs after 10 minutes, with a lag of ${Math.round(growing.lag / 60)} minutes.`,
      },
      {
        prompt: "Which statement about a queue is true?",
        options: ["It makes slow workers fast", "It lets a burst pass if the workers keep up on average", "It removes the need for workers", "It speeds up writes to the database"],
        answer: 1,
        why: "A queue only moves the waiting from the user to the buffer. If the workers keep up on average, a burst drains afterwards.",
      },
    ],
  },
  {
    id: "p95",
    title: "p95 latency",
    summary: "Why the slowest few requests matter more than the average.",
    body: [
      "A percentile says how slow the slowest requests are. p50 is the middle request: half are faster. p95 means 95 of every 100 requests are faster than this figure; p99, 99 of every 100.",
      `Averages hide the slow tail. Say most requests take 20 ms but 5 in 100 take 400 ms. The middle barely moves (${ms(pHealthy.p50)} to ${ms(pSlow.p50)}), p95 rises from ${ms(pHealthy.p95)} to ${ms(pSlow.p95)}, and p99 jumps from ${ms(pHealthy.p99)} to ${ms(pSlow.p99)}. People who hit the slow requests feel every one of them.`,
      "StressForge builds a distribution from the paths a request can take and reads p50, p95 and p99 from it. These are the model's estimates, not measured latencies.",
    ],
    seen: "The Results tab shows p50, p95 and p99, and each challenge sets a goal such as p95 at or under a number of milliseconds.",
    takeaway: "Judge a design by its p95 and p99, not its average: that is where the slow requests live.",
    quiz: [
      {
        prompt: "Most requests take 20 ms, but 5 in 100 take 400 ms. Which figure moves the most?",
        options: ["p50", "p95", "p99", "None of them"],
        answer: 2,
        why: `p50 stays near ${ms(pSlow.p50)}, p95 rises to ${ms(pSlow.p95)}, and p99 rises to ${ms(pSlow.p99)}, because the slow 5% make up the whole top of the distribution.`,
      },
      {
        prompt: "A goal says p95 ≤ 300 ms. What does that mean?",
        options: ["The average request takes 300 ms", "95 of every 100 requests finish within 300 ms", "No request is slower than 300 ms", "5 requests in 100 take exactly 300 ms"],
        answer: 1,
        why: "p95 is the point 95% of requests are faster than. The slowest 5 in 100 may still be slower than the goal.",
      },
    ],
  },
  {
    id: "caching",
    title: "Caching",
    summary: "How keeping popular answers in fast memory takes load off the database.",
    body: [
      "A cache keeps the answers to popular reads in fast memory. When a read finds its answer there (a hit), the database is not asked. When it does not (a miss), the read goes on to the database.",
      "The hit ratio is the share of reads that hit. Only misses reach the database, so the reads it sees are reads × (1 − hit ratio). Writes always reach the database.",
      `Going from ${pct(CACHE_DEFAULT_HIT)} to 95% hits cuts the reads that reach the database from ${cacheLow.dbReads} to ${cacheHigh.dbReads} in every 1,000, a fourfold drop. That is why a cache is often the first fix for an overloaded database. It does nothing for writes.`,
    ],
    seen: "On the Results tab the database shows its ρ, and designs with a cache show how much the cache takes off it. Try a template that includes a cache.",
    takeaway: "A cache pays off for repeated reads. It cannot help a database that is busy with writes.",
    quiz: [
      {
        prompt: "1,000 reads a second arrive and the cache hit ratio is 90%. How many reads a second reach the database?",
        options: ["900", "90", "1,000", "100"],
        answer: 3,
        why: "Only the 10% that miss go on: 1,000 × (1 − 0.9) = 100 a second.",
      },
      {
        prompt: "A database is overloaded by writes. How much will adding a cache help?",
        options: ["Hardly at all: writes still reach the database", "Completely: caches absorb writes", "By half, always", "Only if it is in another region"],
        answer: 0,
        why: "A cache answers reads. Every write still has to reach the database, so write load is unchanged.",
      },
    ],
  },
  {
    id: "replicas",
    title: "Read replicas",
    summary: "How extra copies of a database share the reads, and what they cost the writes.",
    body: [
      "A read replica is a copy of the database that answers reads. In the model, reads are shared evenly between the primary and its replicas, while writes go to the primary only.",
      `Replicas are not free: each one must replay every write the primary takes. In the model, replaying a write costs a replica ${pct(REPLICATION_COST)} of what the write cost the primary.`,
      "So replicas help read-heavy traffic a great deal and write-heavy traffic very little. The primary stays the only place writes land, so it can still be the bottleneck.",
    ],
    seen: "On the Results tab the primary and each replica are listed separately with their own ρ. Look at a template that includes a replica.",
    takeaway: "Add replicas when reads dominate. When writes dominate, they will not remove the bottleneck.",
    quiz: [
      {
        prompt: "A database takes 600 reads a second. You add 2 replicas. How many reads a second does each of the three servers take?",
        options: ["600", "300", "200", "100"],
        answer: 2,
        why: "The primary and 2 replicas share the reads evenly: 600 ÷ 3 = 200 each.",
      },
      {
        prompt: "What happens to writes when you add replicas?",
        options: ["They are shared between all servers", "They still go to the primary, which also sends them to every replica", "They are skipped", "They are answered from the replicas' memory"],
        answer: 1,
        why: `Writes land on the primary only. Each replica then replays them at ${pct(REPLICATION_COST)} of the cost, so more replicas add work rather than remove it.`,
      },
    ],
  },
  {
    id: "load-balancing",
    title: "Load balancing",
    summary: "How a balancer spreads traffic over servers, and what the model assumes about it.",
    body: [
      "A load balancer sends each request to one of several identical servers, so no single one takes everything.",
      "In the model the load is split evenly. With 3 servers each takes a third of the traffic, so each server's ρ is a third of what one server alone would see. Adding servers is the usual way to bring a Failing tier back under the Warning line.",
      `The balancer is a component too, with limits of its own: the model gives it room for ${COMPONENT.lb.capacity.toLocaleString("en-US")} requests a second, far more than a typical app server's ${COMPONENT.app.capacity}, so it is rarely the first thing to fail.`,
      "Real balancers can be uneven: sticky sessions, hot keys and slow servers all skew the split. The model does not represent unevenness, so treat what it shows as the best case.",
    ],
    seen: "On the Results tab each server behind a balancer shows its own ρ. Try a template with a balancer in front of several servers.",
    takeaway: "Adding servers behind a balancer lowers each one's load, as long as the real split is close to even.",
    quiz: [
      {
        prompt: "1,200 requests a second arrive at a balancer in front of 3 identical servers. How many does each server get?",
        options: ["1,200", "600", "400", "300"],
        answer: 2,
        why: "An even split gives 1,200 ÷ 3 = 400 a second to each server.",
      },
      {
        prompt: "What does the model assume about how a balancer spreads load?",
        options: ["It sends everything to the fastest server", "It splits the load evenly", "It copes with sticky sessions", "It drops the slowest 5%"],
        answer: 1,
        why: "The model splits load evenly and does not represent sticky sessions or hot keys, so real results may be worse.",
      },
    ],
  },
  {
    id: "cdn",
    title: "CDNs",
    summary: "How serving content from the edge keeps most reads away from your servers.",
    body: [
      "A CDN keeps copies of cacheable content at edge locations near users. A request answered at the edge never reaches your servers (the origin) and skips the long trip.",
      `In the model the CDN's hit ratio, ${pct(CDN_DEFAULT_HIT)} by default, is the share of reads answered at the edge. Only the misses and all writes reach the origin. With 2,000 requests a second, 80% of them reads, the origin sees ${Math.round(cdnSample.originReads)} reads a second instead of 1,600.`,
      "A CDN helps most when many people read the same content. It does not help with writes or with content that is different for every user.",
    ],
    seen: "On the Results tab the origin's load is lower when a CDN sits in front of it. Try a template that starts with a CDN.",
    takeaway: "Put popular, shared, cacheable reads at the edge; keep personal and write traffic in mind for the origin.",
    quiz: [
      {
        prompt: `2,000 requests a second arrive, 80% are reads, and the CDN hit ratio is ${pct(CDN_DEFAULT_HIT)}. How many reads a second reach the origin?`,
        options: ["1,600", "960", "640", "400"],
        answer: 2,
        why: `Reads are 1,600 a second; the ${pct(1 - CDN_DEFAULT_HIT)} that miss reach the origin: 1,600 × ${1 - CDN_DEFAULT_HIT} = ${Math.round(cdnSample.originReads)}.`,
      },
      {
        prompt: "Which traffic benefits least from a CDN?",
        options: ["A popular image", "A shared stylesheet", "A public article", "Each user's own account changes (writes)"],
        answer: 3,
        why: "Writes and per-user content cannot be served from a shared copy at the edge, so they always reach the origin.",
      },
    ],
  },
  {
    id: "regions",
    title: "Regions and latency",
    summary: "Why distance adds a fixed delay every time a request crosses regions.",
    body: [
      `Data takes time to travel. When a request crosses from one region to another, the model adds a fixed round-trip time: ${rtt(US, EU)} ms between US East and EU West, ${rtt(US, AP)} ms between US East and Asia South, and ${rtt(EU, AP)} ms between EU West and Asia South. Within one region it adds none.`,
      "The cost repeats. If an app in one region calls a database in another five times to build one page, the round trips are paid five times.",
      "Putting the pieces that talk to each other in the same region is often the cheapest speed-up. Spreading across regions helps users be near the app, but it makes every call between regions slower.",
    ],
    seen: "Each component has a region. The Results tab shows cross-region traffic and the time it adds.",
    takeaway: "Keep chatty components in the same region, and count the round trips, not just the distance.",
    quiz: [
      {
        prompt: `An app in US East makes 3 calls in a row to a database in Asia South. How much round-trip time do the calls add in total?`,
        options: [`${rtt(US, AP)} ms`, `${3 * rtt(US, AP)} ms`, `${3 * rtt(US, EU)} ms`, "0 ms"],
        answer: 1,
        why: `Each crossing adds ${rtt(US, AP)} ms and the calls repeat it: 3 × ${rtt(US, AP)} = ${3 * rtt(US, AP)} ms.`,
      },
      {
        prompt: "Which pair of regions has the smallest round trip in the model?",
        options: ["US East and Asia South", "EU West and Asia South", "US East and EU West", "They are all the same"],
        answer: 2,
        why: `US East and EU West is ${rtt(US, EU)} ms, against ${rtt(EU, AP)} ms and ${rtt(US, AP)} ms for the others.`,
      },
    ],
  },
];

export const TOPIC_IDS = TOPICS.map((t) => t.id);
export const topicById = (id: string) => TOPICS.find((t) => t.id === id);
