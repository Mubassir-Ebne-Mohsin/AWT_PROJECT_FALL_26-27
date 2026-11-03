// The concept-help drawer's answers. No model is called: this is a fixed set of written answers chosen by keywords in the question.
// It does not look at the design that is open, and it says so. Each answer describes how the tool behaves, not a measurement.

export interface Concept {
  id: string;
  /** Matched against the lower-cased question. The first concept that matches answers; more specific ones come first. */
  pattern: RegExp;
  answer: string;
}

export const CONCEPTS: readonly Concept[] = [
  {
    id: "ai",
    pattern: /\b(ai|llm|groq|gpt|language model|machine learning)\b/,
    answer:
      "This drawer is not AI: it is a fixed set of written answers. The AI features are three, each labelled experimental and each only on when the server has it switched on:\n\n• Results tab of a completed run → Suggested fixes → \"Say what you want from the fixes\".\n• New design → Describe your system → the AI draft.\n• Results tab → \"What if the traffic changed?\" → \"Say it in words\".\n\nNone of them writes a figure. Every number comes from the simulation. The Evaluation page's AI tab records what was and was not measured.",
  },
  {
    id: "what-if",
    pattern: /what[- ]?if|different traffic|more traffic|double the traffic/,
    answer:
      "On the Results tab of a completed run, \"What if the traffic changed?\" runs the same design under a changed load (multiply or set the request rate, change the shape or the read share) and shows it beside your run. It needs no AI, saves nothing, and has no difference column: you read the two sets of figures.",
  },
  {
    id: "ladder",
    pattern: /ladder|where does it break|breaking point|breaks?\b|2x|5x|10x/,
    answer:
      "\"Where does it break?\" on the Results tab runs the same design at two, five and ten times its request rate, with the same shape and targets, and shows where the verdict changes. A rate above the model's limit is shown as beyond the limit, never guessed.",
  },
  {
    id: "fixes",
    pattern: /\bfix(es)?\b|improve|suggest|make it better/,
    answer:
      "On a run that did not pass, \"Suggested fixes\" tries a few ordinary edits at the component that limits the design (one more copy, double the copies, a bigger size, a cache or a read replica for a database), runs each edited design through the same model, and shows only those that helped and made nothing worse. You can leave some kinds out or choose what comes first.",
  },
  {
    id: "verdict",
    pattern: /verdict|strained|\bpass(es|ed)?\b|\bfail(s|ed|ure)?\b/,
    answer:
      "A result fails when p95 is above its target or the error rate is above the error budget. It is strained when those targets are met but with little room: p95 above 80% of its target, a component nearly full, or a queue that keeps growing. Otherwise it passes. It is a model estimate, not a measurement of real servers.",
  },
  {
    id: "targets",
    pattern: /\bslo\b|target|error budget|budget/,
    answer:
      "Two targets are set on the design: a p95 latency target in milliseconds and an error budget, the share of requests that may fail. The verdict is judged against them, so changing a target can change a verdict without changing the design.",
  },
  {
    id: "utilization",
    pattern: /utili[sz]ation|\brho\b|bottleneck|\blimit(s|ing)?\b|saturat|busy|overload/,
    answer:
      "Utilization is how full a component is: the work arriving divided by the work it can do. Near 100% queues grow quickly and latency climbs. The limiting component is the one the model says is fullest or failing first, and it is where fixes are aimed.",
  },
  {
    id: "p95",
    pattern: /p95|p99|percentile|tail/,
    answer:
      "p95 is the latency that 95 out of 100 requests beat. The slowest 5% are what users notice, so it is a better target than the average. On a result, p95 is the model's estimate for the whole path a request takes.",
  },
  {
    id: "replica",
    pattern: /replica|read only|read-only/,
    answer:
      "A read replica is a read-only copy of the primary database. It takes a share of reads, but it replays every write too, so it does not help a write-heavy database. It is different from adding copies of the app servers.",
  },
  {
    id: "cache",
    pattern: /cache|redis|memcache|\bhit (rate|ratio)\b/,
    answer:
      "A cache keeps hot data in memory. With an 80% hit rate, 4 of every 5 reads never touch the database, which is often the cheapest way to raise a design's breaking point. It helps reads, not writes.",
  },
  {
    id: "queue",
    pattern: /queue|kafka|async|worker/,
    answer:
      "A queue accepts work immediately and lets workers process it at their own pace. Bursts fill the queue instead of hitting the database all at once. The cost is lag: the work finishes later.",
  },
  {
    id: "burst",
    pattern: /burst|spike|flash sale|surge|ramp/,
    answer:
      "The traffic shape and burst setting say how the load varies: steady stays level, a ramp climbs, a spike surges. A design that passes at the average can fail at the peak, which is why the burst multiplier matters.",
  },
  {
    id: "scale",
    pattern: /scale|scaling|app servers?|copies|bigger size|capacity|more servers/,
    answer:
      "There are two ordinary ways to add capacity: more copies of a component (spreads the work, costs more) or a bigger size (each copy does more). Neither helps if the limit is somewhere else, such as the database, which is why the fixes start from the limiting component.",
  },
  {
    id: "region",
    pattern: /region|far|distance|asia|europe|latency between/,
    answer:
      "Each component has a region. A call between regions adds a round trip: about 75 ms US East to EU West and 190 ms US East to Asia South. Utilization doesn't change that, only placement does.",
  },
];

export const FALLBACK =
  "I answer a fixed set of questions: p95, utilization and the limiting component, verdicts and targets, caches, queues, read replicas, regions, bursts, scaling, and where things are in the app (fixes, the load ladder, the what-if and the AI features). I do not look at your design and I do not call a model. Try one of the suggestions below.";

export function scriptedReply(question: string): string {
  const t = question.toLowerCase();
  return CONCEPTS.find((c) => c.pattern.test(t))?.answer ?? FALLBACK;
}

export const STARTER_CHIPS = ["What is p95?", "What limits my design?", "When should I add a queue?", "How do read replicas help?", "Where are the AI features?"];
