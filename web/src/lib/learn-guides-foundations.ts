import type { Topic } from "@/lib/learn-content";
export const FOUNDATION_GUIDES: Topic[] = [
  {
    "id": "capacity",
    "title": "Capacity per replica",
    "category": "properties",
    "summary": "How many requests one copy can handle, and why a larger number is an assumption.",
    "body": [
      "Capacity is an assumed sustainable request rate for one copy of a component. Its unit is requests per second, often written rps. It is separate from the total traffic entering the design: a service may see only a branch of that traffic or may receive requests from several upstream paths.",
      "At a fixed workload, raising capacity reduces modeled utilization. Adding replicas can also increase aggregate capacity, but changing the capacity field does not provision resources or improve real code. Base the assumption on measurements when available, and identify it as an estimate when those measurements do not exist.",
      "Inspect the load reaching each component rather than dividing global traffic by every capacity indiscriminately. Downstream bottlenecks, cache misses and background jobs can change which component needs work. Keep traffic and targets fixed while testing a capacity change, and record the revision so the comparison can be reproduced."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "Requests per second for one replica. How many requests one copy can handle, and why a larger number is an assumption.",
    "quiz": [
      {
        "prompt": "What is the capacity field measured in?",
        "options": [
          "Requests per second for one replica",
          "Total registered users",
          "Milliseconds per request",
          "Stored gigabytes"
        ],
        "answer": 0,
        "why": "Capacity is an assumed sustainable request rate for one copy of a component. Its unit is requests per second, often written rps. It is separate from the total traffic entering the design: a service may see only a branch of that traffic or may receive requests from several upstream paths."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to capacity per replica and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "utilization",
      "app-servers",
      "scaling"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "service-time",
    "title": "Service time and latency",
    "category": "properties",
    "summary": "Separate processing delay, queue wait and cross-region round trips.",
    "body": [
      "Service time is the mean processing delay assigned to a component, in milliseconds. End-to-end latency also includes time waiting for capacity and modeled network round trips. A component can have a small service-time value and still produce long request delays when it is close to saturation.",
      "Capacity and service time are separate inputs in StressForge. Lowering the service-time field changes the assumed processing cost; it does not automatically modify the configured request-rate capacity. Inspect the detailed result to distinguish processing delay from queueing and region effects instead of attributing every delay to one cause.",
      "Compare one change at a time under the same traffic. If moving components together helps, a network crossing may have mattered. If adding capacity helps at high load, waiting may have mattered. These are mathematical estimates, and real service latency must be measured with an appropriate instrumented workload."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "Processing, waiting and network round trips. Separate processing delay, queue wait and cross-region round trips.",
    "quiz": [
      {
        "prompt": "Which quantities can contribute to end-to-end latency?",
        "options": [
          "Only service time",
          "Only database size",
          "Only the number of components",
          "Processing, waiting and network round trips"
        ],
        "answer": 3,
        "why": "Service time is the mean processing delay assigned to a component, in milliseconds. End-to-end latency also includes time waiting for capacity and modeled network round trips. A component can have a small service-time value and still produce long request delays when it is close to saturation."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to service time and latency and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "p95",
      "regions",
      "utilization"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "scaling",
    "title": "Replicas and scaling",
    "category": "properties",
    "summary": "Adding parallel copies, changing per-copy resources and finding the next constraint.",
    "body": [
      "Horizontal scaling adds parallel copies of a service; vertical scaling changes the resources available to a copy. In the canvas, replicas model parallel copies and capacity describes assumed per-copy throughput. Neither control deploys machines, purchases resources or configures a real orchestration platform.",
      "More copies can lower the utilization of the component you scale. They can also allow more requests to reach a downstream database or external dependency. A read-replica component has a different role from the replica count of an app server, so those two controls should not be treated as interchangeable.",
      "Start with a recorded baseline, scale the limiting component and rerun with unchanged traffic. Inspect the entire path and compare the new bottleneck, latency and errors. Real scaling has costs involving shared state, connections and distribution; the simplified model does not prove that a real application scales linearly."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "Adding parallel service copies. Adding parallel copies, changing per-copy resources and finding the next constraint.",
    "quiz": [
      {
        "prompt": "Which change represents horizontal scaling?",
        "options": [
          "Increasing only the p95 target",
          "Moving a label on the canvas",
          "Adding parallel service copies",
          "Renaming a server"
        ],
        "answer": 2,
        "why": "Horizontal scaling adds parallel copies of a service; vertical scaling changes the resources available to a copy. In the canvas, replicas model parallel copies and capacity describes assumed per-copy throughput. Neither control deploys machines, purchases resources or configures a real orchestration platform."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to replicas and scaling and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "load-balancing",
      "app-servers",
      "replicas"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "request-share",
    "title": "Request share and client weight",
    "category": "properties",
    "summary": "Understand fractions on dependency branches and relative weights on Clients.",
    "body": [
      "The meaning of a share setting depends on the component. For Clients it is a relative weight used to divide the total incoming traffic between entry groups. For object storage and external dependencies it is a fraction describing how much modeled traffic uses that branch.",
      "A fraction of one quarter means a portion of the relevant demand. A client weight of three is not three percent: it must be compared with the weights of the other clients. For example, positive weights one and three split total entry traffic into one quarter and three quarters.",
      "Change one setting and inspect the flow shown by the recorded result. Read and write mix, caching and branching can change the work reaching a dependency, so do not assume every share is applied directly to global rps. Setting a small dependency share also does not remove its real reliability or security requirements."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "No, weights are relative and dependency shares are fractions. Understand fractions on dependency branches and relative weights on Clients.",
    "quiz": [
      {
        "prompt": "Are client weights and dependency request fractions identical controls?",
        "options": [
          "Yes, both change service time",
          "No, weights are relative and dependency shares are fractions",
          "Yes, both are always percentages",
          "Yes, both create a new baseline"
        ],
        "answer": 1,
        "why": "The meaning of a share setting depends on the component. For Clients it is a relative weight used to divide the total incoming traffic between entry groups. For object storage and external dependencies it is a fraction describing how much modeled traffic uses that branch."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to request share and client weight and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "clients",
      "object-storage",
      "external-apis"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "queue-depth",
    "title": "Queue depth and limits",
    "category": "properties",
    "summary": "The size of the waiting buffer, overflow and why storage cannot replace processing.",
    "body": [
      "Maximum depth is the configured limit on how many messages a queue can hold in the model. A queue accepts work and gives it to workers at their own pace. Its size describes a waiting buffer, while worker capacity describes processing ability; increasing the former does not increase the latter.",
      "A larger buffer can absorb a temporary mismatch between arrivals and drain. If the sustained arrival rate exceeds processing ability, more messages accumulate and the wait grows. Once the configured depth is reached, the model can report overflow. A small buffer can therefore reveal a mismatch earlier.",
      "Compare arrival rate, drain rate, backlog, lag and overflow together. Try reducing the depth while holding workers fixed, then restore it and change worker capacity separately. These are modeled messages and delays; real brokers also have persistence, retries, ordering and failure behavior that require separate design and testing."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "No, it increases the waiting buffer. The size of the waiting buffer, overflow and why storage cannot replace processing.",
    "quiz": [
      {
        "prompt": "Does increasing maximum queue depth increase worker throughput?",
        "options": [
          "No, it increases the waiting buffer",
          "Yes, workers become faster",
          "Yes, service time becomes zero",
          "Yes, clients stop sending writes"
        ],
        "answer": 0,
        "why": "Maximum depth is the configured limit on how many messages a queue can hold in the model. A queue accepts work and gives it to workers at their own pace. Its size describes a waiting buffer, while worker capacity describes processing ability; increasing the former does not increase the latter."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to queue depth and limits and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "queues",
      "workers",
      "queue-metrics"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "traffic-basics",
    "title": "Baseline traffic and traffic scale",
    "category": "traffic",
    "summary": "One design-wide request rate, its slider and multiple client groups.",
    "body": [
      "Baseline traffic is the request rate used as the design input. It is measured in requests per second, not people, accounts or concurrent sessions. A user can generate several requests while another remains idle, so registered-user count alone does not specify the workload.",
      "The Traffic scale slider edits this same baseline rate; it is not a second multiplier attached to a selected client. The numerical field allows supported values beyond the convenience slider range. Multiple Clients nodes share the design total according to their positive relative weights, rather than receiving independent baseline settings.",
      "Choose a rate that represents an explicit scenario and record it with the design. Keep it fixed when comparing an architecture change, then test a separate higher-load scenario. The burst setting controls peak demand, while traffic shape changes the modeled profile over time. None of these settings sends real load to an external service."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "No, it edits the design-wide baseline. One design-wide request rate, its slider and multiple client groups.",
    "quiz": [
      {
        "prompt": "Does the Traffic scale slider set a separate rate for each selected client?",
        "options": [
          "Yes, every selection has its own rate",
          "Yes, it controls only region delay",
          "No, it only changes the graph zoom",
          "No, it edits the design-wide baseline"
        ],
        "answer": 3,
        "why": "Baseline traffic is the request rate used as the design input. It is measured in requests per second, not people, accounts or concurrent sessions. A user can generate several requests while another remains idle, so registered-user count alone does not specify the workload."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to baseline traffic and traffic scale and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "clients",
      "bursts",
      "traffic-shapes"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ],
    "properties": [
      {
        "key": "rps",
        "meaning": "Design-wide baseline requests per second.",
        "change": "Raising it increases demand; the traffic scale slider edits this same value."
      }
    ]
  },
  {
    "id": "bursts",
    "title": "Burst multiplier and burst scale",
    "category": "traffic",
    "summary": "Why a design can pass at its average and struggle at its peak.",
    "body": [
      "A burst multiplier expresses how much higher peak demand is than the configured baseline. The peak used for component load is baseline rps multiplied by burst. A baseline of five hundred with a multiplier of two therefore represents a peak of one thousand requests per second in that scenario.",
      "Burst scale is a convenience slider for the same multiplier, not a second factor to multiply again. The editor slider spans one to four, while the numerical multiplier supports one to one hundred. Keep those input ranges distinct from any claim about a real traffic distribution.",
      "A short busy period can expose capacity pressure that is invisible at the average rate. Compare the recorded peak and component utilization, then inspect queues and targets. Changing only the burst is a useful sensitivity test. The timeline and queue model have explicit assumptions; they do not replay measured user sessions or real packets."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "1000 rps. Why a design can pass at its average and struggle at its peak.",
    "quiz": [
      {
        "prompt": "What peak follows from 500 rps and a burst multiplier of 2?",
        "options": [
          "500 rps",
          "2000 rps",
          "1000 rps",
          "250 rps"
        ],
        "answer": 2,
        "why": "A burst multiplier expresses how much higher peak demand is than the configured baseline. The peak used for component load is baseline rps multiplied by burst. A baseline of five hundred with a multiplier of two therefore represents a peak of one thousand requests per second in that scenario."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to burst multiplier and burst scale and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "traffic-basics",
      "traffic-shapes",
      "headroom"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ],
    "properties": [
      {
        "key": "burst",
        "meaning": "Peak multiplier applied to baseline demand.",
        "change": "Raising it increases modeled peak pressure; burst scale edits the same multiplier."
      }
    ]
  },
  {
    "id": "read-write",
    "title": "Reads and writes",
    "category": "traffic",
    "summary": "How request mix changes the value of caching and read replicas.",
    "body": [
      "Reads fetch information and writes change information. The Reads control sets the fraction of requests treated as reads in the model; the remaining fraction represents writes. This workload description matters because different architecture features help different kinds of demand.",
      "A cache can answer eligible repeated reads without reaching the database on a hit. A read replica can share database read work, while replaying writes brings overhead. Raising the read share may therefore make those techniques more useful, but it does not mean every read is cacheable or every query has identical cost in a real database.",
      "Keep total baseline traffic constant while testing read share so you can isolate the workload effect. Compare database load and latency rather than only a headline verdict. A write-heavy run may need a different response from a read-heavy one. StressForge simplifies request categories and does not execute actual SQL or measure query complexity."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "30%. How request mix changes the value of caching and read replicas.",
    "quiz": [
      {
        "prompt": "If the read share is 70%, what is the write share?",
        "options": [
          "It creates another 70% of requests",
          "30%",
          "70%",
          "100%"
        ],
        "answer": 1,
        "why": "Reads fetch information and writes change information. The Reads control sets the fraction of requests treated as reads in the model; the remaining fraction represents writes. This workload description matters because different architecture features help different kinds of demand."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to reads and writes and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "caching",
      "replicas",
      "databases"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ],
    "properties": [
      {
        "key": "readRatio",
        "meaning": "Read fraction; remaining requests are writes.",
        "change": "Changing it changes the work eligible for caches and read replicas."
      }
    ]
  },
  {
    "id": "traffic-shapes",
    "title": "Traffic shape over the test",
    "category": "traffic",
    "summary": "Steady with one burst, two sharp spikes and a rising profile.",
    "body": [
      "Traffic shape describes how the modeled demand is distributed across the timeline. The editor offers Steady with one burst, Two sharp spikes and Climbs all day. Choose a shape that represents the scenario you want to examine, rather than selecting one merely because its chart looks attractive.",
      "The baseline and burst still define important load assumptions. Changing shape should not be described as changing an independently measured population of users. Inspect the timeline and queue behavior to see what the calculation actually reports; a sharp peak and a longer busy period can tell different stories.",
      "Compare shapes while keeping component settings, targets and the other traffic inputs fixed. Record the saved revision and run so the comparison remains interpretable. These are synthetic profiles generated by the mathematical model, not imported access logs or a real load-test execution. Test duration also describes modeled time rather than how long you must wait."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "The synthetic demand profile over modeled time. Steady with one burst, two sharp spikes and a rising profile.",
    "quiz": [
      {
        "prompt": "What does a traffic shape represent?",
        "options": [
          "The synthetic demand profile over modeled time",
          "The canvas arrangement",
          "A measured user population",
          "The number of app replicas"
        ],
        "answer": 0,
        "why": "Traffic shape describes how the modeled demand is distributed across the timeline. The editor offers Steady with one burst, Two sharp spikes and Climbs all day. Choose a shape that represents the scenario you want to examine, rather than selecting one merely because its chart looks attractive."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to traffic shape over the test and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "traffic-basics",
      "bursts",
      "test-duration"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ],
    "properties": [
      {
        "key": "shape",
        "meaning": "Synthetic profile over the modeled timeline.",
        "change": "Select a scenario and inspect the actual timeline; it is not measured traffic."
      }
    ]
  },
  {
    "id": "traffic-presets",
    "title": "Traffic presets",
    "category": "traffic",
    "summary": "Starting scenarios, convenience controls and the settings they preserve.",
    "body": [
      "Presets provide convenient starting traffic profiles such as launch day, flash sale and write-heavy ingest. They save editing effort but do not know the real workload of your application. Open the resulting values and decide whether they match the situation you intend to demonstrate.",
      "The current Traffic tab explains which values a preset updates. Standard presets update load, burst, reads, shape and the p95 target while keeping the error budget and duration. Quiet night updates only load, burst and shape. This makes it important to inspect the full profile after switching scenarios.",
      "Use a preset to begin an experiment, then record any manual changes. Compare designs with matching profiles when evaluating an architecture change. A profile name is not evidence that a system survives a real launch or sale: the result remains a calculation under the selected assumptions, and changing a target can alter the verdict without making the system faster."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "Presets update some fields and preserve others. Starting scenarios, convenience controls and the settings they preserve.",
    "quiz": [
      {
        "prompt": "Why inspect settings after selecting a preset?",
        "options": [
          "A preset measures live traffic",
          "All presets erase every field",
          "The name proves the design will pass",
          "Presets update some fields and preserve others"
        ],
        "answer": 3,
        "why": "Presets provide convenient starting traffic profiles such as launch day, flash sale and write-heavy ingest. They save editing effort but do not know the real workload of your application. Open the resulting values and decide whether they match the situation you intend to demonstrate."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to traffic presets and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "traffic-basics",
      "read-write",
      "targets"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "test-duration",
    "title": "Test length and modeled time",
    "category": "traffic",
    "summary": "What duration means for timelines, queues and waiting for a result.",
    "body": [
      "Test length describes the duration represented by a simulation, in modeled minutes. It does not instruct StressForge to generate real traffic for that many minutes, and it does not necessarily equal the wall-clock time required to calculate a result.",
      "Duration is especially useful when interpreting queues and timelines. A sustained mismatch between job arrivals and drain can accumulate work over the represented period. Changing the length does not add service capacity, so it should not be presented as a direct remedy for a saturated worker or application.",
      "Keep rate and worker capacity fixed when investigating how backlog changes with duration. Inspect the exact saved inputs before comparing results. Read the model limitations because the representation of bursts and background work is simplified; an apparently short calculation can describe a long modeled scenario without being a real endurance or soak test."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "No, it is modeled time. What duration means for timelines, queues and waiting for a result.",
    "quiz": [
      {
        "prompt": "Does a ten-minute test length mean ten minutes of real load generation?",
        "options": [
          "Only if the graph has a queue",
          "Only for signed-in accounts",
          "No, it is modeled time",
          "Yes, always"
        ],
        "answer": 2,
        "why": "Test length describes the duration represented by a simulation, in modeled minutes. It does not instruct StressForge to generate real traffic for that many minutes, and it does not necessarily equal the wall-clock time required to calculate a result."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to test length and modeled time and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "queues",
      "queue-metrics",
      "model-limits"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ],
    "properties": [
      {
        "key": "durationMin",
        "meaning": "Represented duration in modeled minutes.",
        "change": "It can affect accumulation and timeline interpretation; it does not add processing capacity."
      }
    ]
  },
  {
    "id": "targets",
    "title": "p95 target and error budget",
    "category": "traffic",
    "summary": "Define success without confusing a looser target with a faster system.",
    "body": [
      "A p95 target is the latency threshold against which the modeled ninety-fifth percentile is judged. An error budget here is the allowed fraction of requests that fail in the simulated scenario. These are acceptance criteria chosen by the designer, rather than extra compute resources.",
      "A target of three hundred milliseconds asks whether the reported p95 meets that threshold. An error budget of one percent allows a failure fraction of one in a hundred requests for this calculation. This per-run budget is different from a production reliability policy tracked over a month.",
      "Changing a target or error budget may change the verdict without changing the architecture or making requests faster. Keep targets fixed while comparing fixes, and report when you deliberately change them. Read latency, errors and component pressure together because one successful metric does not establish that every requirement or real-world reliability goal has been met."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "No, it changes the acceptance threshold. Define success without confusing a looser target with a faster system.",
    "quiz": [
      {
        "prompt": "Does raising the p95 target make the service faster?",
        "options": [
          "Yes, it lowers traffic automatically",
          "No, it changes the acceptance threshold",
          "Yes, it reduces processing delay",
          "Yes, it adds app replicas"
        ],
        "answer": 1,
        "why": "A p95 target is the latency threshold against which the modeled ninety-fifth percentile is judged. An error budget here is the allowed fraction of requests that fail in the simulated scenario. These are acceptance criteria chosen by the designer, rather than extra compute resources."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to p95 target and error budget and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "p95",
      "throughput-errors",
      "verdicts-bottlenecks"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ],
    "properties": [
      {
        "key": "sloP95",
        "meaning": "Accepted p95 latency threshold.",
        "change": "Raising it relaxes acceptance without making the service faster."
      },
      {
        "key": "errorBudget",
        "meaning": "Allowed failed-request fraction for the scenario.",
        "change": "Raising it relaxes acceptance without fixing failures."
      }
    ]
  },
  {
    "id": "throughput-errors",
    "title": "Throughput and error rate",
    "category": "results",
    "summary": "Distinguish offered traffic, served traffic and failed requests.",
    "body": [
      "Offered traffic is the workload presented to the modeled system. Served throughput describes the portion successfully handled according to the calculation. Error rate describes the failed share. These quantities are related, but they are not interchangeable labels for baseline demand.",
      "A system under pressure can receive more requests without completing more useful work. Inspect the error figure and served rate as well as latency: a fast response statistic alone can hide the fact that some requests fail. Also distinguish average traffic from peak traffic when reading component pressure.",
      "Compare results with the same graph revision and traffic inputs, then explain which quantity changed. Use the recorded error budget to understand acceptance. StressForge estimates these outcomes mathematically; it does not send real requests to a deployed application, collect HTTP logs or observe actual infrastructure throughput."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "Yes, excess demand can fail. Distinguish offered traffic, served traffic and failed requests.",
    "quiz": [
      {
        "prompt": "Can offered demand rise while useful served throughput stops increasing?",
        "options": [
          "Yes, excess demand can fail",
          "No, served rate always equals demand",
          "No, latency alone prevents failure",
          "Only if the title changes"
        ],
        "answer": 0,
        "why": "Offered traffic is the workload presented to the modeled system. Served throughput describes the portion successfully handled according to the calculation. Error rate describes the failed share. These quantities are related, but they are not interchangeable labels for baseline demand."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to throughput and error rate and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "targets",
      "utilization",
      "model-limits"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "verdicts-bottlenecks",
    "title": "Verdicts and bottlenecks",
    "category": "results",
    "summary": "Read pass, strained and fail alongside the limiting component.",
    "body": [
      "A verdict summarizes the configured performance targets and component pressure for one calculation. Pass, strained and fail are concise labels, so read the supporting latency, error and utilization figures before explaining the result. A summary is not a substitute for the detailed assumptions.",
      "The limiting component identifies a constrained or heavily loaded point according to the simulator rules. Its presence does not automatically mean the whole design fails: a component can be the busiest while still having spare capacity. Likewise, a latency target can be missed for reasons that are not solved simply by adding copies of the named component.",
      "Inspect the recorded revision, traffic and targets and use component details to form a specific hypothesis. Change the relevant input and rerun. Avoid describing the verdict as a live health check or a guarantee of availability; it is an estimate of the scenario represented by that saved test."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "No, inspect its load and the configured targets. Read pass, strained and fail alongside the limiting component.",
    "quiz": [
      {
        "prompt": "Does a named limiting component automatically mean the design failed?",
        "options": [
          "Yes, every named component is broken",
          "Yes, even at zero demand",
          "No, it means the database was deleted",
          "No, inspect its load and the configured targets"
        ],
        "answer": 3,
        "why": "A verdict summarizes the configured performance targets and component pressure for one calculation. Pass, strained and fail are concise labels, so read the supporting latency, error and utilization figures before explaining the result. A summary is not a substitute for the detailed assumptions."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to verdicts and bottlenecks and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "utilization",
      "p95",
      "headroom"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "headroom",
    "title": "Headroom and load ladders",
    "category": "results",
    "summary": "How much room remains before an important limit is reached.",
    "body": [
      "Headroom describes spare capacity or distance from a performance constraint under stated assumptions. A comfortable result at one rate does not tell you the system can absorb any increase. Look at the busiest component and also consider latency and error targets.",
      "The load ladder evaluates higher request-rate scenarios for the same recorded design. Limits searches for a boundary under the tool's declared rules. These views answer related questions but are different calculations, and a graph change can invalidate assumptions behind an earlier result.",
      "Keep the saved architecture and targets consistent while comparing loads. Record which constraint is encountered and inspect whether the result is complete. A higher component capacity may move the limiting point elsewhere. Real headroom also depends on workloads and failure modes outside this simplified model, so treat the numbers as a planning estimate."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "The traffic, targets and saved architecture assumptions. How much room remains before an important limit is reached.",
    "quiz": [
      {
        "prompt": "What should accompany a claim about headroom?",
        "options": [
          "Only the project name",
          "The number of registered accounts",
          "The traffic, targets and saved architecture assumptions",
          "Only a green icon"
        ],
        "answer": 2,
        "why": "Headroom describes spare capacity or distance from a performance constraint under stated assumptions. A comfortable result at one rate does not tell you the system can absorb any increase. Look at the busiest component and also consider latency and error targets."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to headroom and load ladders and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "limits-preview",
      "utilization",
      "targets"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "queue-metrics",
    "title": "Backlog, lag and overflow",
    "category": "results",
    "summary": "Explain background processing separately from foreground latency.",
    "body": [
      "Backlog is queued work waiting to be processed. Lag estimates how long new work waits given the modeled drain rate. Overflow is work that cannot fit once a configured limit is reached. These explain background pressure that may not be obvious from the foreground response time.",
      "A system may quickly accept a job while its workers finish it much later. Compare job arrival and drain rates before concluding that an application is healthy. Increasing queue depth can delay overflow while increasing waiting; it cannot create processing capacity or fix a sustained throughput deficit.",
      "Inspect duration and burst assumptions, then change workers, demand or buffer size separately. Keep the user-facing response and background completion story distinct in a demonstration. Real queues also involve acknowledgements, retries, poison messages and persistence; these operational guarantees are not established by a simulated backlog figure."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "Backlog. Explain background processing separately from foreground latency.",
    "quiz": [
      {
        "prompt": "Which measure describes work waiting in a queue?",
        "options": [
          "Read percentage",
          "Backlog",
          "App replica count",
          "p95 target"
        ],
        "answer": 1,
        "why": "Backlog is queued work waiting to be processed. Lag estimates how long new work waits given the modeled drain rate. Overflow is work that cannot fit once a configured limit is reached. These explain background pressure that may not be obvious from the foreground response time."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to backlog, lag and overflow and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "queues",
      "workers",
      "queue-depth"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "model-limits",
    "title": "What the simulator does not prove",
    "category": "results",
    "summary": "Mathematical estimates, simplified assumptions and responsible interpretation.",
    "body": [
      "StressForge evaluates a graph using configured capacities, latencies and workload assumptions. It is an architecture learning and exploration tool. It does not provision infrastructure, execute your application code or send a realistic workload to the services drawn on the canvas.",
      "The model simplifies request paths, queueing, caching, regions and other behaviors. It does not establish security, durability, correctness of SQL, recovery from machine loss or actual cloud costs. Adding an icon for a service does not implement the guarantees or operational configuration associated with the real product.",
      "Use results to compare hypotheses and identify what to measure next. Keep revisions, profiles and targets visible when reporting a conclusion. For production decisions, supplement the model with benchmarks, instrumentation and failure testing. AI wording and diagrams also require review; the deterministic engine remains the authority for the numerical results inside StressForge."
    ],
    "seen": "Use the relevant component properties or workspace tab, then inspect Results with its saved inputs.",
    "takeaway": "That the configured scenario meets the model's criteria. Mathematical estimates, simplified assumptions and responsible interpretation.",
    "quiz": [
      {
        "prompt": "What does a passing model result establish?",
        "options": [
          "That the configured scenario meets the model's criteria",
          "That production cannot fail",
          "That SQL is optimized",
          "That security has been verified"
        ],
        "answer": 0,
        "why": "StressForge evaluates a graph using configured capacities, latencies and workload assumptions. It is an architecture learning and exploration tool. It does not provision infrastructure, execute your application code or send a realistic workload to the services drawn on the canvas."
      },
      {
        "prompt": "What makes a comparison for this topic interpretable?",
        "options": [
          "Changing multiple unrelated settings",
          "Using a matching saved revision and changing one relevant input",
          "Treating a screenshot as measured production evidence",
          "Changing targets until the badge turns green"
        ],
        "answer": 1,
        "why": "Keep the relevant architecture, traffic and targets explicit, change one input and inspect the matching recorded result. The outcome remains a model estimate."
      }
    ],
    "practice": [
      "Record a baseline with explicit traffic and targets.",
      "Change one setting relevant to what the simulator does not prove and rerun.",
      "Inspect the matching saved inputs and result; restore the setting and compare."
    ],
    "related": [
      "simulation-results",
      "verdicts-bottlenecks",
      "report-share"
    ],
    "links": [
      {
        "label": "How the model works",
        "href": "/how-it-works"
      }
    ]
  }
];
