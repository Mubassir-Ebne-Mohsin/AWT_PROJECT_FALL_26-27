import type { Topic } from "@/lib/learn-content";
export const COMPONENT_GUIDES: Topic[] = [
  {
    "id": "clients",
    "title": "Clients",
    "summary": "Where requests begin, and how multiple client groups share total traffic.",
    "body": [
      "Clients represent the people or applications sending requests into your architecture. They are traffic entry points rather than servers that process requests. A client group can represent mobile customers in one region and another group can represent browser users elsewhere. Give the groups useful names so the graph explains who is sending the load.",
      "The baseline request rate belongs to the entire design. Positive client weights divide that total proportionally; they are not independent requests-per-second inputs. With weights one and three, the groups receive one quarter and three quarters of the total. Changing the selected client does not create another global traffic profile.",
      "Choose each client region to model where those requests originate, then connect the group to a serving path. Inspect the resulting flow and delay after a test. Clients have no replica pool or service capacity to scale; change the global rate, relative weights or placement instead."
    ],
    "seen": "Use this on the canvas and the relevant workspace tabs; compare the saved inputs with Results before drawing a conclusion.",
    "takeaway": "Client weights divide the design total proportionally; they do not define separate baseline request rates.",
    "quiz": [
      {
        "prompt": "What do client weights one and three describe?",
        "options": [
          "A relative split of one quarter and three quarters",
          "Two independent baseline rates",
          "One and three server replicas",
          "A latency setting in milliseconds"
        ],
        "answer": 0,
        "why": "Client weights divide the design total proportionally; they do not define separate baseline request rates."
      },
      {
        "prompt": "How should you verify the effect of this lesson in StressForge?",
        "options": [
          "Treat the illustration as measured production evidence",
          "Change several unrelated settings at once",
          "Save one controlled change and inspect the matching recorded result",
          "Assume a green badge proves real-world reliability"
        ],
        "answer": 2,
        "why": "A controlled change and a matching saved result make the comparison interpretable. The figures remain model estimates, and an illustration is not a production measurement."
      }
    ],
    "category": "components",
    "diagram": [
      "Clients A",
      "Load balancer",
      "App",
      "Database"
    ],
    "example": "For two regions, use two Clients nodes and one shared baseline traffic setting.",
    "practice": [
      "Create two client groups connected to the same application.",
      "Use different positive traffic weights and inspect their modeled request shares.",
      "Raise total traffic until a serving component saturates, then lower traffic or scale that component."
    ],
    "related": [
      "traffic-basics",
      "regions",
      "bursts"
    ],
    "component": "client",
    "properties": [
      {
        "key": "share",
        "meaning": "Relative traffic weight; client weights are not percentages.",
        "change": "Increasing one positive weight gives that client more of the shared total."
      },
      {
        "key": "region",
        "meaning": "Where this component runs.",
        "change": "Moving it can change round-trip delay on connected paths; distance does not create capacity."
      }
    ],
    "tradeoff": "Change one relevant input at a time. A result describes the configured model and traffic, not a promise about a deployed service."
  },
  {
    "id": "api-gateway",
    "title": "API gateway",
    "summary": "A routing entry layer that can become the first constrained hop.",
    "body": [
      "An API gateway sits in front of application services and gives callers a common entry point. Real gateways often handle authentication, routing and rate limiting. In StressForge the node represents the performance cost and capacity of that architectural layer. Drawing it does not configure real authentication policies or deploy a gateway.",
      "Connect clients or a load balancer to the gateway and connect the gateway to the application. Give the gateway plausible capacity and service-time assumptions. Its utilization depends on the traffic that reaches it, so a fast application behind a saturated gateway does not remove the upstream constraint.",
      "Inspect both the gateway and downstream application in Results. Compare a gateway-capacity change with an application-replica change separately. Keep the baseline and targets fixed while comparing them. Security guarantees, vendor-specific routing policies and real rate-limit rules are outside the simulation and require implementation and testing in a real service."
    ],
    "seen": "Use this on the canvas and the relevant workspace tabs; compare the saved inputs with Results before drawing a conclusion.",
    "takeaway": "Extra application capacity does not increase the capacity of an upstream gateway.",
    "quiz": [
      {
        "prompt": "Will adding app replicas fix a saturated upstream gateway?",
        "options": [
          "The gateway must also be addressed",
          "Yes, app replicas increase gateway capacity",
          "Yes, if the database is fast",
          "Yes, changing the diagram label is enough"
        ],
        "answer": 0,
        "why": "Extra application capacity does not increase the capacity of an upstream gateway."
      },
      {
        "prompt": "How should you verify the effect of this lesson in StressForge?",
        "options": [
          "Treat the illustration as measured production evidence",
          "Change several unrelated settings at once",
          "Save one controlled change and inspect the matching recorded result",
          "Assume a green badge proves real-world reliability"
        ],
        "answer": 2,
        "why": "A controlled change and a matching saved result make the comparison interpretable. The figures remain model estimates, and an illustration is not a production measurement."
      }
    ],
    "category": "components",
    "diagram": [
      "Clients",
      "API gateway",
      "App",
      "Database"
    ],
    "example": "A shop exposes one API gateway in front of its order application.",
    "practice": [
      "Run a connected gateway/application design.",
      "Lower gateway capacity until the gateway is strained or failing.",
      "Restore gateway capacity and inspect whether the limiting component moves."
    ],
    "related": [
      "capacity",
      "utilization",
      "verdicts-bottlenecks"
    ],
    "component": "gateway",
    "properties": [
      {
        "key": "capacity",
        "meaning": "Requests per second one replica can handle.",
        "change": "Increasing it lowers modeled utilization at the same offered load; it is an assumption about resources."
      },
      {
        "key": "latency",
        "meaning": "Mean service time in milliseconds before extra waiting and region effects.",
        "change": "Increasing it raises processing delay; capacity and latency are separate model inputs."
      },
      {
        "key": "replicas",
        "meaning": "Parallel copies of this component.",
        "change": "More copies increase modeled capacity, but downstream components may become the constraint."
      },
      {
        "key": "region",
        "meaning": "Where this component runs.",
        "change": "Moving it can change round-trip delay on connected paths; distance does not create capacity."
      }
    ],
    "tradeoff": "Change one relevant input at a time. A result describes the configured model and traffic, not a promise about a deployed service."
  },
  {
    "id": "app-servers",
    "title": "App server",
    "summary": "Request handlers, replicas and downstream dependency pressure.",
    "body": [
      "An app server represents the code that handles a request: reading product information, checking an order or assembling a response. Real examples include a NestJS API or another application service. The canvas node describes performance assumptions about that service, not the actual code running in StressForge itself.",
      "Capacity is the rate one copy can handle, service time is its processing delay, and replicas represent parallel copies. Increasing replicas can reduce utilization at the application while increasing the amount of work successfully reaching the database. A system therefore needs more than a large application replica count to remain balanced.",
      "Connect a clear entry path through the application to its dependencies. Run a baseline and inspect per-component utilization, latency and served throughput. Scale the application in a controlled comparison, then check whether a cache, database or external service becomes the new constraint. Real scaling also depends on connection pools and shared state, which this model simplifies."
    ],
    "seen": "Use this on the canvas and the relevant workspace tabs; compare the saved inputs with Results before drawing a conclusion.",
    "takeaway": "Scaling an application can move the limiting component downstream; recheck the whole path.",
    "quiz": [
      {
        "prompt": "What should you inspect after adding application replicas?",
        "options": [
          "Whether the constraint moved to a dependency",
          "Only the diagram color",
          "Only the number of clients",
          "Whether the title changed"
        ],
        "answer": 0,
        "why": "Scaling an application can move the limiting component downstream; recheck the whole path."
      },
      {
        "prompt": "How should you verify the effect of this lesson in StressForge?",
        "options": [
          "Treat the illustration as measured production evidence",
          "Change several unrelated settings at once",
          "Save one controlled change and inspect the matching recorded result",
          "Assume a green badge proves real-world reliability"
        ],
        "answer": 2,
        "why": "A controlled change and a matching saved result make the comparison interpretable. The figures remain model estimates, and an illustration is not a production measurement."
      }
    ],
    "category": "components",
    "diagram": [
      "Clients",
      "Load balancer",
      "App",
      "Database"
    ],
    "example": "A bookstore API reads products and accepts orders.",
    "practice": [
      "Start with one application copy.",
      "Increase traffic until the application approaches saturation.",
      "Add a copy, rerun, and inspect every downstream component."
    ],
    "related": [
      "scaling",
      "capacity",
      "utilization"
    ],
    "component": "app",
    "properties": [
      {
        "key": "capacity",
        "meaning": "Requests per second one replica can handle.",
        "change": "Increasing it lowers modeled utilization at the same offered load; it is an assumption about resources."
      },
      {
        "key": "latency",
        "meaning": "Mean service time in milliseconds before extra waiting and region effects.",
        "change": "Increasing it raises processing delay; capacity and latency are separate model inputs."
      },
      {
        "key": "replicas",
        "meaning": "Parallel copies of this component.",
        "change": "More copies increase modeled capacity, but downstream components may become the constraint."
      },
      {
        "key": "region",
        "meaning": "Where this component runs.",
        "change": "Moving it can change round-trip delay on connected paths; distance does not create capacity."
      }
    ],
    "tradeoff": "Change one relevant input at a time. A result describes the configured model and traffic, not a promise about a deployed service."
  },
  {
    "id": "workers",
    "title": "Worker",
    "summary": "Background processing and the difference between accepting and finishing work.",
    "body": [
      "A worker processes background jobs rather than completing every task during the user-facing request. Order emails, image processing and data imports are common examples. A queue gives the application somewhere to put jobs while workers process them, so a fast accepted response does not necessarily mean all background work has finished.",
      "The worker capacity and replica count determine how quickly its pool can drain jobs in the model. If jobs arrive faster than that rate over time, backlog grows even when the foreground request looks healthy. Worker service time contributes to the modeled processing path, and dependencies such as a database may impose another constraint.",
      "Connect the queue to a worker and give that worker a useful downstream dependency. Compare arrival rate, drain rate, backlog and lag. Increase traffic to observe growing work, then add worker capacity and check whether the queue can recover. Real systems also need retries, idempotency and dead-letter handling; drawing a Worker does not implement those mechanisms."
    ],
    "seen": "Use this on the canvas and the relevant workspace tabs; compare the saved inputs with Results before drawing a conclusion.",
    "takeaway": "A queue buffers work; workers and their dependencies must supply enough drain capacity.",
    "quiz": [
      {
        "prompt": "What happens when sustained job arrivals exceed worker drain?",
        "options": [
          "The backlog grows",
          "The queue creates processing capacity",
          "All jobs finish immediately",
          "Adding clients reduces demand"
        ],
        "answer": 0,
        "why": "A queue buffers work; workers and their dependencies must supply enough drain capacity."
      },
      {
        "prompt": "How should you verify the effect of this lesson in StressForge?",
        "options": [
          "Treat the illustration as measured production evidence",
          "Change several unrelated settings at once",
          "Save one controlled change and inspect the matching recorded result",
          "Assume a green badge proves real-world reliability"
        ],
        "answer": 2,
        "why": "A controlled change and a matching saved result make the comparison interpretable. The figures remain model estimates, and an illustration is not a production measurement."
      }
    ],
    "category": "components",
    "diagram": [
      "App",
      "Queue",
      "Worker",
      "Database"
    ],
    "example": "Order requests enqueue email jobs for a background worker.",
    "practice": [
      "Inspect the queue arrival and drain rates.",
      "Reduce worker capacity until the backlog grows.",
      "Restore capacity or add workers and inspect lag and downstream utilization."
    ],
    "related": [
      "queues",
      "queue-metrics",
      "queue-depth"
    ],
    "component": "worker",
    "properties": [
      {
        "key": "capacity",
        "meaning": "Requests per second one replica can handle.",
        "change": "Increasing it lowers modeled utilization at the same offered load; it is an assumption about resources."
      },
      {
        "key": "latency",
        "meaning": "Mean service time in milliseconds before extra waiting and region effects.",
        "change": "Increasing it raises processing delay; capacity and latency are separate model inputs."
      },
      {
        "key": "replicas",
        "meaning": "Parallel copies of this component.",
        "change": "More copies increase modeled capacity, but downstream components may become the constraint."
      },
      {
        "key": "region",
        "meaning": "Where this component runs.",
        "change": "Moving it can change round-trip delay on connected paths; distance does not create capacity."
      }
    ],
    "tradeoff": "Change one relevant input at a time. A result describes the configured model and traffic, not a promise about a deployed service."
  },
  {
    "id": "databases",
    "title": "Database",
    "summary": "Primary storage, read/write demand and saturation.",
    "body": [
      "A primary database stores structured application data and handles the reads and writes sent to it. PostgreSQL is a familiar real-world example. In the canvas the Database is a generic performance component; selecting it does not create tables, indexes or a real PostgreSQL installation.",
      "Capacity describes the assumed request rate of a copy and service time describes its modeled processing delay. Caches can reduce repeated read demand, while dedicated read replicas can share reads and replay writes. These changes affect different kinds of work. A read-heavy architecture and a write-heavy architecture should not be optimized with the same assumptions.",
      "Inspect the primary after scaling an application because it may become the limiting dependency. Hold the read/write mix constant for the first comparison, then vary it deliberately. Use caching for appropriate repeated reads and examine replica overhead when adding read capacity. The model does not simulate SQL query plans, locks, durability, backups or real replication failures."
    ],
    "seen": "Use this on the canvas and the relevant workspace tabs; compare the saved inputs with Results before drawing a conclusion.",
    "takeaway": "Caching can reduce eligible reads; it does not remove the primary database write workload.",
    "quiz": [
      {
        "prompt": "Which workload is a cache most directly intended to reduce?",
        "options": [
          "Repeated cacheable reads",
          "Every database write",
          "Database backups",
          "All network round trips"
        ],
        "answer": 0,
        "why": "Caching can reduce eligible reads; it does not remove the primary database write workload."
      },
      {
        "prompt": "How should you verify the effect of this lesson in StressForge?",
        "options": [
          "Treat the illustration as measured production evidence",
          "Change several unrelated settings at once",
          "Save one controlled change and inspect the matching recorded result",
          "Assume a green badge proves real-world reliability"
        ],
        "answer": 2,
        "why": "A controlled change and a matching saved result make the comparison interpretable. The figures remain model estimates, and an illustration is not a production measurement."
      }
    ],
    "category": "components",
    "diagram": [
      "Clients",
      "App",
      "Database"
    ],
    "example": "A bookstore stores products and orders in a primary database.",
    "practice": [
      "Run a direct application/database path.",
      "Increase demand or reduce database capacity until it saturates.",
      "Try a read-focused change and compare it with a write-heavy traffic profile."
    ],
    "related": [
      "caching",
      "replicas",
      "read-write"
    ],
    "component": "db",
    "properties": [
      {
        "key": "capacity",
        "meaning": "Requests per second one replica can handle.",
        "change": "Increasing it lowers modeled utilization at the same offered load; it is an assumption about resources."
      },
      {
        "key": "latency",
        "meaning": "Mean service time in milliseconds before extra waiting and region effects.",
        "change": "Increasing it raises processing delay; capacity and latency are separate model inputs."
      },
      {
        "key": "replicas",
        "meaning": "Parallel copies of this component.",
        "change": "More copies increase modeled capacity, but downstream components may become the constraint."
      },
      {
        "key": "region",
        "meaning": "Where this component runs.",
        "change": "Moving it can change round-trip delay on connected paths; distance does not create capacity."
      }
    ],
    "tradeoff": "Change one relevant input at a time. A result describes the configured model and traffic, not a promise about a deployed service."
  },
  {
    "id": "object-storage",
    "title": "Object storage",
    "summary": "Files and media, modeled as a request share rather than a relational database.",
    "body": [
      "Object storage represents a service for files such as uploaded photos, documents and media. An S3-style service is a real-world example. A file object is a different abstraction from a row in a relational database; the two components solve different problems and may appear together in one architecture.",
      "The request-share setting controls the modeled portion of traffic that uses this branch. Capacity and service time then describe the storage service under that workload. A CDN can serve eligible content closer to clients, reducing origin work according to the configured graph and caching assumptions. It does not remove all uploads or every storage request.",
      "Draw the paths that actually represent your application and inspect the computed flow after a run. Increase the storage request share to see more demand on the storage branch, then compare a relevant caching or capacity change. The model does not track object sizes, storage bills, consistency modes, upload bandwidth or real access-control policies."
    ],
    "seen": "Use this on the canvas and the relevant workspace tabs; compare the saved inputs with Results before drawing a conclusion.",
    "takeaway": "Request share changes modeled demand on the storage branch, not stored bytes or permissions.",
    "quiz": [
      {
        "prompt": "What does the storage request-share setting change?",
        "options": [
          "The modeled portion of traffic using storage",
          "The number of files already stored",
          "The price per gigabyte",
          "A real bucket permission"
        ],
        "answer": 0,
        "why": "Request share changes modeled demand on the storage branch, not stored bytes or permissions."
      },
      {
        "prompt": "How should you verify the effect of this lesson in StressForge?",
        "options": [
          "Treat the illustration as measured production evidence",
          "Change several unrelated settings at once",
          "Save one controlled change and inspect the matching recorded result",
          "Assume a green badge proves real-world reliability"
        ],
        "answer": 2,
        "why": "A controlled change and a matching saved result make the comparison interpretable. The figures remain model estimates, and an illustration is not a production measurement."
      }
    ],
    "category": "components",
    "diagram": [
      "App",
      "Object storage"
    ],
    "example": "A photo service keeps image bytes in object storage and metadata in a database.",
    "practice": [
      "Connect an object-storage branch to an application.",
      "Increase its request share and inspect the branch load.",
      "Reduce unnecessary origin work or adjust capacity, then rerun."
    ],
    "related": [
      "request-share",
      "cdn",
      "model-limits"
    ],
    "component": "storage",
    "properties": [
      {
        "key": "capacity",
        "meaning": "Requests per second one replica can handle.",
        "change": "Increasing it lowers modeled utilization at the same offered load; it is an assumption about resources."
      },
      {
        "key": "latency",
        "meaning": "Mean service time in milliseconds before extra waiting and region effects.",
        "change": "Increasing it raises processing delay; capacity and latency are separate model inputs."
      },
      {
        "key": "replicas",
        "meaning": "Parallel copies of this component.",
        "change": "More copies increase modeled capacity, but downstream components may become the constraint."
      },
      {
        "key": "region",
        "meaning": "Where this component runs.",
        "change": "Moving it can change round-trip delay on connected paths; distance does not create capacity."
      },
      {
        "key": "share",
        "meaning": "Fraction of relevant modeled requests using this branch.",
        "change": "A larger fraction sends more work to storage; inspect the recorded edge flow."
      }
    ],
    "tradeoff": "Change one relevant input at a time. A result describes the configured model and traffic, not a promise about a deployed service."
  },
  {
    "id": "external-apis",
    "title": "Third-party API",
    "summary": "Dependencies you call but do not operate, such as payments or email.",
    "body": [
      "A third-party API represents a dependency your application calls but does not run, such as a payment processor or email service. It can contribute substantial delay even if your own application is fast. The component models a dependency cost and capacity, rather than sending any real requests to a provider.",
      "Request share controls how much modeled demand uses this dependency. Capacity and service time are assumptions about the provider, not resources you acquire by editing a field. Even when the model exposes a generic replica setting, increasing it does not buy provider capacity or change the contract of a real external service.",
      "Inspect how often requests visit the external branch and how much time they spend there. Compare reducing unnecessary calls with changing the assumed service delay. Treat any improvement as conditional on those assumptions. Real providers can have quotas, failures, retries and billing behavior that this simplified node does not reproduce; their real limits must be verified separately."
    ],
    "seen": "Use this on the canvas and the relevant workspace tabs; compare the saved inputs with Results before drawing a conclusion.",
    "takeaway": "Changing an external API assumption does not change the actual provider contract or capacity.",
    "quiz": [
      {
        "prompt": "Does increasing a canvas capacity field purchase more provider capacity?",
        "options": [
          "No, it only changes a model assumption",
          "Yes, automatically",
          "Yes, if the result passes",
          "Yes, after saving"
        ],
        "answer": 0,
        "why": "Changing an external API assumption does not change the actual provider contract or capacity."
      },
      {
        "prompt": "How should you verify the effect of this lesson in StressForge?",
        "options": [
          "Treat the illustration as measured production evidence",
          "Change several unrelated settings at once",
          "Save one controlled change and inspect the matching recorded result",
          "Assume a green badge proves real-world reliability"
        ],
        "answer": 2,
        "why": "A controlled change and a matching saved result make the comparison interpretable. The figures remain model estimates, and an illustration is not a production measurement."
      }
    ],
    "category": "components",
    "diagram": [
      "App",
      "Third-party API"
    ],
    "example": "A checkout calls a payment service for a fraction of requests.",
    "practice": [
      "Inspect the external dependency share and delay.",
      "Increase that share or lower assumed capacity to expose sensitivity.",
      "Reduce avoidable calls and verify whether the recorded result improves."
    ],
    "related": [
      "request-share",
      "service-time",
      "model-limits"
    ],
    "component": "external",
    "properties": [
      {
        "key": "capacity",
        "meaning": "Requests per second one replica can handle.",
        "change": "Increasing it lowers modeled utilization at the same offered load; it is an assumption about resources."
      },
      {
        "key": "latency",
        "meaning": "Mean service time in milliseconds before extra waiting and region effects.",
        "change": "Increasing it raises processing delay; capacity and latency are separate model inputs."
      },
      {
        "key": "replicas",
        "meaning": "Parallel copies of this component.",
        "change": "More copies increase modeled capacity, but downstream components may become the constraint."
      },
      {
        "key": "region",
        "meaning": "Where this component runs.",
        "change": "Moving it can change round-trip delay on connected paths; distance does not create capacity."
      },
      {
        "key": "share",
        "meaning": "Fraction of relevant modeled requests calling the dependency.",
        "change": "A larger fraction increases dependency demand and can affect end-to-end latency."
      }
    ],
    "tradeoff": "Change one relevant input at a time. A result describes the configured model and traffic, not a promise about a deployed service."
  }
];
