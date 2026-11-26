import type { Topic } from "@/lib/learn-content";
export const WORKFLOW_GUIDES: Topic[] = [
  {
    "id": "canvas-graph",
    "title": "Canvas, creation and graph checks",
    "category": "workflows",
    "summary": "Build an architecture, connect directed paths and resolve graph errors.",
    "body": [
      "Begin from a blank canvas, a template or a validated JSON import. Describe your system offers a draft workflow, whose current mode must be read from the screen. A draft needs review; drawing or generating a component does not create the real service represented by its icon.",
      "Add Clients and the serving components you need, then connect them in the intended direction. Node positions organize the drawing while component properties affect the modeled workload. A disconnected component is not automatically part of the request path, and an arrow pointing the wrong way changes the architecture.",
      "Run Check graph and read errors separately from warnings. A previous check can become outdated after inputs change, so check the current revision before relying on it. Save and run only when the graph and properties are appropriate. Passing graph validation establishes supported structure, not production correctness or security."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "Check the current inputs again. Build an architecture, connect directed paths and resolve graph errors.",
    "quiz": [
      {
        "prompt": "What should you do when the graph check is outdated?",
        "options": [
          "Trust its earlier green badge",
          "Rename the design",
          "Change the p95 target",
          "Check the current inputs again"
        ],
        "answer": 3,
        "why": "Begin from a blank canvas, a template or a validated JSON import. Describe your system offers a draft workflow, whose current mode must be read from the screen. A draft needs review; drawing or generating a component does not create the real service represented by its icon."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "clients",
      "simulation-results",
      "model-limits"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/new/blank"
      }
    ],
    "diagram": [
      "Clients",
      "App",
      "Database"
    ]
  },
  {
    "id": "save-history",
    "title": "Saving, History, Restore and Notes",
    "category": "workflows",
    "summary": "Keep changes and reasoning without confusing a revision with a run.",
    "body": [
      "A saved revision identifies a particular set of design inputs. A completed run records the inputs it tested and its result. Editing the graph or traffic does not rewrite an earlier test, so its verdict can describe an earlier revision even while you are looking at the current design.",
      "Watch the save state and resolve conflicts rather than assuming every keystroke was persisted. History lets you inspect recorded versions and runs. Restore applies earlier design content through the normal revision workflow, while Notes records reasoning; a note is not an input that changes numerical simulation behavior.",
      "Before presenting a result, verify which revision and traffic it belongs to. Use notes to explain your assumption and the reason for a change. A duplicate or remix is a separate design, not a continuation of the same ownership history. Save carefully and use recorded evidence to distinguish a current design from a historical result."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "No, it keeps its tested snapshot. Keep changes and reasoning without confusing a revision with a run.",
    "quiz": [
      {
        "prompt": "After changing a design, does an earlier run automatically describe the new inputs?",
        "options": [
          "Yes, if the name stays the same",
          "Only the notes decide",
          "No, it keeps its tested snapshot",
          "Yes, every run updates live"
        ],
        "answer": 2,
        "why": "A saved revision identifies a particular set of design inputs. A completed run records the inputs it tested and its result. Editing the graph or traffic does not rewrite an earlier test, so its verdict can describe an earlier revision even while you are looking at the current design."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "simulation-results",
      "compare",
      "report-share"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/designs"
      }
    ]
  },
  {
    "id": "simulation-results",
    "title": "Run tests and inspect Results",
    "category": "workflows",
    "summary": "Follow the saved-input evidence behind every numerical result.",
    "body": [
      "A simulation calculates model results for design inputs and a traffic profile. Run test may involve saving the relevant draft and waiting for the calculation to complete. Treat pending, failed and completed states differently; a pending request is not evidence that a scenario passes.",
      "On Results, inspect the verdict, latency percentiles, errors, throughput and component utilization. The topology and tested inputs describe the recorded run. If the current design changes, distinguish that draft from the recorded snapshot instead of assuming every number follows the latest edit.",
      "Read the timeline, paths and queue information when explaining an outcome. A matching revision and fingerprint help identify exactly what was tested. The computation is deterministic model work; it is not real infrastructure load generation, and an AI explanation cannot replace these recorded numerical facts. Use the result to guide a controlled next experiment."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "The graph snapshot tested by that run. Follow the saved-input evidence behind every numerical result.",
    "quiz": [
      {
        "prompt": "Which graph should explain a historical result?",
        "options": [
          "The first template in the list",
          "The graph snapshot tested by that run",
          "Any current unsaved drawing",
          "The newest Gallery post"
        ],
        "answer": 1,
        "why": "A simulation calculates model results for design inputs and a traffic profile. Run test may involve saving the relevant draft and waiting for the calculation to complete. Treat pending, failed and completed states differently; a pending request is not evidence that a scenario passes."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "p95",
      "throughput-errors",
      "verdicts-bottlenecks"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "limits-preview",
    "title": "Limits and live preview",
    "category": "workflows",
    "summary": "Separate transient feedback, saved searches and recorded simulations.",
    "body": [
      "Live preview gives temporary feedback while you edit eligible inputs. It can pause while the draft is invalid or other work is pending. That feedback is useful for exploration, but it is not a new saved simulation result simply because the canvas displays numbers or colors.",
      "Limits performs a separate calculation to search for a boundary under the model rules. A Limits record and an ordinary simulation record have different meanings and should not be presented as interchangeable test runs. Inspect the calculation kind and the inputs attached to the result.",
      "Use preview to explore, then save and run the operation that answers your actual question. Review stale, paused and failed states rather than treating old preview output as current. A found boundary depends on the graph, traffic mix and targets; later changes can make a previous limit irrelevant. Neither operation measures a real deployed service."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "No, it is transient feedback. Separate transient feedback, saved searches and recorded simulations.",
    "quiz": [
      {
        "prompt": "Is live preview automatically a saved simulation run?",
        "options": [
          "No, it is transient feedback",
          "Yes, every edit creates a completed run",
          "Yes, if the overlay is visible",
          "Only dark mode saves it"
        ],
        "answer": 0,
        "why": "Live preview gives temporary feedback while you edit eligible inputs. It can pause while the draft is invalid or other work is pending. That feedback is useful for exploration, but it is not a new saved simulation result simply because the canvas displays numbers or colors."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "headroom",
      "simulation-results",
      "targets"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "fixes-whatif",
    "title": "Verified fixes, what-if and load ladder",
    "category": "workflows",
    "summary": "Explore controlled alternatives and review what actually improves.",
    "body": [
      "Verified fix suggestions are calculated alternatives checked by the simulator. Their numerical benefit comes from rerunning the model, rather than from a language model inventing faster figures. Review which properties change and whether the proposal addresses the limiting component relevant to your goal.",
      "Manual what-if changes a bounded workload scenario for comparison, while the load ladder examines higher request rates. These views support reasoning about sensitivity and pressure. They do not automatically rewrite the original design or establish that a real infrastructure change would have the same benefit.",
      "Keep the recorded baseline visible, inspect assumptions and apply changes deliberately. AI-assisted controls, when enabled, can interpret a request into a proposal, but the interface must state their mode and the numerical result remains server-calculated. If a calculation fails or is unavailable, preserve that uncertainty instead of treating it as a passing alternative."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "A server model calculation of the alternative. Explore controlled alternatives and review what actually improves.",
    "quiz": [
      {
        "prompt": "Where does the numerical benefit of a verified fix come from?",
        "options": [
          "A model guessing a percentage",
          "The color of the suggestion",
          "The author name",
          "A server model calculation of the alternative"
        ],
        "answer": 3,
        "why": "Verified fix suggestions are calculated alternatives checked by the simulator. Their numerical benefit comes from rerunning the model, rather than from a language model inventing faster figures. Review which properties change and whether the proposal addresses the limiting component relevant to your goal."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "verdicts-bottlenecks",
      "headroom",
      "compare"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/how-it-works"
      }
    ]
  },
  {
    "id": "compare",
    "title": "Comparing saved runs",
    "category": "workflows",
    "summary": "Explain a before-and-after result without changing the question midway.",
    "body": [
      "A useful comparison identifies the two recorded runs and the inputs each tested. A change in latency can come from a graph improvement, lower traffic, a different read mix or altered targets. Without those inputs, a before-and-after number alone cannot explain what caused the difference.",
      "Use the comparison workflow to inspect recorded values and changed assumptions. Match traffic and targets when evaluating an architecture edit, or explicitly say that the comparison is a workload experiment. Check run kind and engine information when interpreting records rather than silently comparing different meanings.",
      "Record a baseline, make one relevant change, save and calculate again. Explain both gains and tradeoffs, such as moving the constraint to another dependency. These are model results and remain conditional on their assumptions; a lower calculated p95 does not establish measured production performance or a general improvement for every workload."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "To separate the architecture effect from workload changes. Explain a before-and-after result without changing the question midway.",
    "quiz": [
      {
        "prompt": "Why keep traffic fixed when comparing an architecture change?",
        "options": [
          "To avoid saving a revision",
          "To make both verdicts identical",
          "To separate the architecture effect from workload changes",
          "To hide the number of requests"
        ],
        "answer": 2,
        "why": "A useful comparison identifies the two recorded runs and the inputs each tested. A change in latency can come from a graph improvement, lower traffic, a different read mix or altered targets. Without those inputs, a before-and-after number alone cannot explain what caused the difference."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "simulation-results",
      "save-history",
      "targets"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/compare"
      }
    ]
  },
  {
    "id": "report-share",
    "title": "Reports, PDF and read-only sharing",
    "category": "workflows",
    "summary": "Present recorded evidence and control what other people can access.",
    "body": [
      "A report gathers the design and available recorded results into a readable document. PDF export is a way to present that evidence outside the application. Inspect the selected revision and run before exporting so the graph and numbers tell the story you intend to demonstrate.",
      "A share link provides a read-only view under the sharing workflow. It does not grant general edit access to your private design or every note and run in your account. Review sharing options and any included decisions or assumptions before distributing the link or file.",
      "Explain that performance figures are mathematical estimates and preserve their traffic and target context. A downloaded PDF remains a copy after it leaves the app; changing access to a link does not retrieve files someone already downloaded. Use the current interface to manage links, and do not publish credentials or sensitive design labels unintentionally."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "No, access is limited to the shared view. Present recorded evidence and control what other people can access.",
    "quiz": [
      {
        "prompt": "Does a read-only share link grant edit access to the entire account?",
        "options": [
          "Only if the reader downloads a PDF",
          "No, access is limited to the shared view",
          "Yes, it grants the owner role",
          "Yes, it exposes every private note"
        ],
        "answer": 1,
        "why": "A report gathers the design and available recorded results into a readable document. PDF export is a way to present that evidence outside the application. Inspect the selected revision and run before exporting so the graph and numbers tell the story you intend to demonstrate."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "save-history",
      "simulation-results",
      "model-limits"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/designs"
      }
    ]
  },
  {
    "id": "gallery-learning",
    "title": "Templates, Gallery, challenges and progress",
    "category": "workflows",
    "summary": "Learn from examples while distinguishing copies, published snapshots and your own attempts.",
    "body": [
      "Templates offer starting architectures to inspect and adapt. Gallery posts show designs that people deliberately published with recorded test context. A remix creates your own copy, so later changes to your copy do not edit the publisher's private design.",
      "Inspect the published workload and targets before interpreting a Gallery verdict or comparing two posts. Challenges ask you to work toward stated goals and evaluate attempts according to their rules. A badge on an unrelated example does not prove that it solves your particular challenge or workload.",
      "Learn progress tracks opened lessons and completed checks in browser storage, separately for accounts and guests on that device. It is not proof of expert competence or a cross-device academic record. Use examples, controlled experiments and quizzes together, and retain attribution when presenting a design derived from another person's work."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "No, it creates your own copy. Learn from examples while distinguishing copies, published snapshots and your own attempts.",
    "quiz": [
      {
        "prompt": "Does remixing a Gallery post edit its publisher's original design?",
        "options": [
          "No, it creates your own copy",
          "Yes, it is live co-editing",
          "Yes, if its result passes",
          "Only the title is copied"
        ],
        "answer": 0,
        "why": "Templates offer starting architectures to inspect and adapt. Gallery posts show designs that people deliberately published with recorded test context. A remix creates your own copy, so later changes to your copy do not edit the publisher's private design."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "canvas-graph",
      "compare",
      "model-limits"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/gallery"
      }
    ]
  },
  {
    "id": "account-safety",
    "title": "Accounts, roles and Support",
    "category": "workflows",
    "summary": "Understand ownership, role-specific access and safe problem reports.",
    "body": [
      "Authentication establishes which account is making a request. Authorization determines what that account may do. In StressForge, owning a design and holding a role are different facts, so seeing an administrative or review area should not be interpreted as permission to edit every private design.",
      "Role-specific workflows include instruction, review, administration and Support. Use the controls available to your account and treat access failures as meaningful checks, not merely missing interface buttons. Read-only sharing, publishing and review grants have their own scope and should be handled deliberately.",
      "When reporting a problem, provide reproducible steps and the relevant safe context instead of passwords, access tokens or private credentials. Inspect notification and account preferences in Settings. Learning material can explain the workflows without making a network request or changing your account; actual authentication and ownership enforcement belong to the backend."
    ],
    "seen": "Find this workflow using the named workspace tabs or navigation links. Inspect Results when explaining a recorded calculation.",
    "takeaway": "Deciding which actions the account may perform. Understand ownership, role-specific access and safe problem reports.",
    "quiz": [
      {
        "prompt": "What is authorization responsible for?",
        "options": [
          "Generating a diagram thumbnail",
          "Choosing a cache hit ratio",
          "Measuring app latency",
          "Deciding which actions the account may perform"
        ],
        "answer": 3,
        "why": "Authentication establishes which account is making a request. Authorization determines what that account may do. In StressForge, owning a design and holding a role are different facts, so seeing an administrative or review area should not be interpreted as permission to edit every private design."
      },
      {
        "prompt": "What should a demonstration of this workflow preserve?",
        "options": [
          "Its relevant saved inputs, access scope and model limitations",
          "Only the most attractive badge",
          "An unlabelled screenshot without a revision",
          "A claim that the app measured real servers"
        ],
        "answer": 0,
        "why": "Preserving the saved context, permissions and model limitations makes a demonstration reproducible and avoids claims the app has not established."
      }
    ],
    "practice": [
      "Open the workflow using its link below.",
      "Inspect the saved revision, access scope and relevant controls before taking an action.",
      "Try the intended operation on your own example and explain what changed and what stayed recorded."
    ],
    "related": [
      "report-share",
      "gallery-learning",
      "model-limits"
    ],
    "links": [
      {
        "label": "Open the relevant screen",
        "href": "/settings/profile"
      }
    ]
  }
];
