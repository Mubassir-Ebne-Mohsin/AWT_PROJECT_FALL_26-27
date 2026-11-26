// Server-only official pack. Reference solutions must never be projected by HTTP APIs.
import type { Graph, Traffic } from "@/common/contracts/phase2/graph.schema";
import type {
  ChallengeLearning,
  ExerciseProfile,
} from "@/common/contracts/phase3/challenge-learning.schema";
export interface FoundationFixture {
  id: string;
  title: string;
  summary: string;
  learning: ChallengeLearning;
  policy: ExerciseProfile;
  traffic: Traffic;
  start: Graph;
  reference: Graph;
}
export const FOUNDATION_PACK: FoundationFixture[] = [
  {
    id: "66666666-6666-4666-8666-000000000001",
    title: "Rescue the single-server launch",
    summary: "Scale a small application without inventing faster servers.",
    learning: {
      category: "Scaling",
      difficulty: "beginner",
      estimatedMinutes: 15,
      objective: "Scale a small application without inventing faster servers.",
      brief:
        "Your small shop is launching today. The app tier cannot serve the burst. Keep the workload and per-instance properties fixed; increase only its replica count, up to three.",
      topics: ["app-servers", "scaling", "utilization"],
      hints: [
        "Which component exceeds its capacity?",
        "Replicas add instances; they do not make each instance faster.",
        "Try a small app replica pool and submit the saved revision.",
      ],
      sequence: 1,
    },
    policy: "scale-app",
    traffic: {
      preset: "custom",
      rps: 600,
      burst: 1.5,
      readRatio: 0.8,
      sloP95: 150,
      errorBudget: 0.01,
      durationMin: 10,
      shape: "steady",
    },
    start: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "app",
          label: "App servers",
          x: 280,
          y: 228,
          props: {
            replicas: 1,
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "db",
          label: "Database",
          x: 520,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "e3",
          from: "n1",
          to: "n2",
        },
        {
          id: "e5",
          from: "n2",
          to: "n4",
        },
      ],
    },
    reference: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "app",
          label: "App servers",
          x: 280,
          y: 228,
          props: {
            replicas: 3,
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "db",
          label: "Database",
          x: 520,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "connection_0",
          from: "n1",
          to: "n2",
        },
        {
          id: "connection_1",
          from: "n2",
          to: "n4",
        },
      ],
    },
  },
  {
    id: "66666666-6666-4666-8666-000000000002",
    title: "Cache a busy catalogue",
    summary: "Reduce repeated catalogue reads reaching the database.",
    learning: {
      category: "Caching",
      difficulty: "beginner",
      estimatedMinutes: 20,
      objective: "Reduce repeated catalogue reads reaching the database.",
      brief:
        "Most requests read the same products. Application capacity is sufficient, but the database is overloaded. Add one cache with at most 85% hits. Preserve the original components and database writes.",
      topics: ["caching", "read-write", "verdicts-bottlenecks"],
      hints: [
        "Inspect database utilization under the fixed burst.",
        "Which requests could be answered without repeating a database read?",
        "Add a cache after the app. The model sends cache misses to its primary data path.",
      ],
      sequence: 2,
    },
    policy: "add-cache",
    traffic: {
      preset: "custom",
      rps: 2000,
      burst: 1.5,
      readRatio: 0.95,
      sloP95: 150,
      errorBudget: 0.01,
      durationMin: 10,
      shape: "steady",
    },
    start: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 280,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 520,
          y: 228,
          props: {
            replicas: 8,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "db",
          label: "Database",
          x: 760,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "e3",
          from: "n1",
          to: "n2",
        },
        {
          id: "e5",
          from: "n2",
          to: "n4",
        },
        {
          id: "e7",
          from: "n4",
          to: "n6",
        },
      ],
    },
    reference: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 280,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 520,
          y: 228,
          props: {
            replicas: 8,
            region: "us-east",
          },
        },
        {
          id: "added_cache_3",
          type: "cache",
          label: "Cache",
          x: 760,
          y: 228,
          props: {
            hitRatio: 0.85,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "db",
          label: "Database",
          x: 1000,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "connection_0",
          from: "n1",
          to: "n2",
        },
        {
          id: "connection_1",
          from: "n2",
          to: "n4",
        },
        {
          id: "connection_2",
          from: "n4",
          to: "added_cache_3",
        },
        {
          id: "connection_3",
          from: "n4",
          to: "n6",
        },
      ],
    },
  },
  {
    id: "66666666-6666-4666-8666-000000000003",
    title: "Scale reads without moving writes",
    summary: "Distribute reads while preserving a primary write destination.",
    learning: {
      category: "Data",
      difficulty: "intermediate",
      estimatedMinutes: 25,
      objective:
        "Distribute reads while preserving a primary write destination.",
      brief:
        "Caching is unavailable for this exercise. Add at most two read replicas from the primary database. Keep the original service capacities and workload unchanged. Replicas also spend capacity replaying writes.",
      topics: ["databases", "replicas", "read-write"],
      hints: [
        "Separate read demand from write demand.",
        "Read replicas add a read pool, not writable primaries.",
        "Connect replicas from the primary and inspect their load before submitting.",
      ],
      sequence: 3,
    },
    policy: "read-replicas",
    traffic: {
      preset: "custom",
      rps: 2000,
      burst: 1.5,
      readRatio: 0.95,
      sloP95: 150,
      errorBudget: 0.01,
      durationMin: 10,
      shape: "steady",
    },
    start: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 280,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 520,
          y: 228,
          props: {
            replicas: 8,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "db",
          label: "Database",
          x: 760,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "e3",
          from: "n1",
          to: "n2",
        },
        {
          id: "e5",
          from: "n2",
          to: "n4",
        },
        {
          id: "e7",
          from: "n4",
          to: "n6",
        },
      ],
    },
    reference: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 280,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 520,
          y: 228,
          props: {
            replicas: 8,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "db",
          label: "Database",
          x: 760,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "added_replica_4",
          type: "replica",
          label: "Read replica",
          x: 1000,
          y: 181,
          props: {
            region: "us-east",
          },
        },
        {
          id: "added_replica_5",
          type: "replica",
          label: "Read replica 2",
          x: 1000,
          y: 275,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "connection_0",
          from: "n1",
          to: "n2",
        },
        {
          id: "connection_1",
          from: "n2",
          to: "n4",
        },
        {
          id: "connection_2",
          from: "n4",
          to: "n6",
        },
        {
          id: "connection_3",
          from: "n6",
          to: "added_replica_4",
        },
        {
          id: "connection_4",
          from: "n6",
          to: "added_replica_5",
        },
      ],
    },
  },
  {
    id: "66666666-6666-4666-8666-000000000004",
    title: "Put a breaking-news site behind the edge",
    summary: "Reduce origin work through edge caching.",
    learning: {
      category: "Caching",
      difficulty: "intermediate",
      estimatedMinutes: 25,
      objective: "Reduce origin work through edge caching.",
      brief:
        "A breaking-news site already has an internal cache, but its app tier is saturated. Add one CDN in front of the original origin path, with at most 80% hits. Keep the app pool and origin writes intact.",
      topics: ["cdn", "caching", "bursts"],
      hints: [
        "An internal cache still requires the request to reach your application.",
        "An edge hit can avoid the origin request entirely.",
        "Insert the CDN between Clients and the existing load balancer.",
      ],
      sequence: 4,
    },
    policy: "edge-cache",
    traffic: {
      preset: "custom",
      rps: 3000,
      burst: 2,
      readRatio: 0.95,
      sloP95: 200,
      errorBudget: 0.01,
      durationMin: 10,
      shape: "steady",
    },
    start: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 280,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 520,
          y: 228,
          props: {
            replicas: 4,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "cache",
          label: "Cache",
          x: 760,
          y: 228,
          props: {
            hitRatio: 0.8,
            region: "us-east",
          },
        },
        {
          id: "n8",
          type: "db",
          label: "Database",
          x: 1000,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "e3",
          from: "n1",
          to: "n2",
        },
        {
          id: "e5",
          from: "n2",
          to: "n4",
        },
        {
          id: "e7",
          from: "n4",
          to: "n6",
        },
        {
          id: "e9",
          from: "n4",
          to: "n8",
        },
      ],
    },
    reference: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "added_cdn_1",
          type: "cdn",
          label: "CDN",
          x: 280,
          y: 228,
          props: {
            hitRatio: 0.8,
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 520,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 760,
          y: 228,
          props: {
            replicas: 4,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "cache",
          label: "Cache",
          x: 1000,
          y: 228,
          props: {
            hitRatio: 0.8,
            region: "us-east",
          },
        },
        {
          id: "n8",
          type: "db",
          label: "Database",
          x: 1240,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "connection_0",
          from: "n1",
          to: "added_cdn_1",
        },
        {
          id: "connection_1",
          from: "added_cdn_1",
          to: "n2",
        },
        {
          id: "connection_2",
          from: "n2",
          to: "n4",
        },
        {
          id: "connection_3",
          from: "n4",
          to: "n6",
        },
        {
          id: "connection_4",
          from: "n4",
          to: "n8",
        },
      ],
    },
  },
  {
    id: "66666666-6666-4666-8666-000000000005",
    title: "Remove a cross-region detour",
    summary: "Find latency caused by an unnecessary geographic detour.",
    learning: {
      category: "Regions",
      difficulty: "intermediate",
      estimatedMinutes: 20,
      objective: "Find latency caused by an unnecessary geographic detour.",
      brief:
        "Clients, the load balancer and database are in US East; the app tier is in EU West. It has spare capacity. Change only the app region, preserving the client location and traffic.",
      topics: ["regions", "p95", "model-limits"],
      hints: [
        "Is high utilization the cause of the slow result?",
        "Look at region crossings between the app and its neighbours.",
        "Keep the fixed clients where they are and move the application tier closer.",
      ],
      sequence: 5,
    },
    policy: "co-locate",
    traffic: {
      preset: "custom",
      rps: 500,
      burst: 1.2,
      readRatio: 0.8,
      sloP95: 150,
      errorBudget: 0.01,
      durationMin: 10,
      shape: "steady",
    },
    start: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 280,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 520,
          y: 228,
          props: {
            replicas: 4,
            region: "eu-west",
          },
        },
        {
          id: "n6",
          type: "db",
          label: "Database",
          x: 760,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "e3",
          from: "n1",
          to: "n2",
        },
        {
          id: "e5",
          from: "n2",
          to: "n4",
        },
        {
          id: "e7",
          from: "n4",
          to: "n6",
        },
      ],
    },
    reference: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 280,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 520,
          y: 228,
          props: {
            replicas: 4,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "db",
          label: "Database",
          x: 760,
          y: 228,
          props: {
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "connection_0",
          from: "n1",
          to: "n2",
        },
        {
          id: "connection_1",
          from: "n2",
          to: "n4",
        },
        {
          id: "connection_2",
          from: "n4",
          to: "n6",
        },
      ],
    },
  },
  {
    id: "66666666-6666-4666-8666-000000000006",
    title: "Serve a photo feed under load",
    summary: "Combine edge and application caching for photo-feed reads.",
    learning: {
      category: "Media",
      difficulty: "intermediate",
      estimatedMinutes: 25,
      objective: "Combine edge and application caching for photo-feed reads.",
      brief:
        "A photo feed repeatedly reads media from object storage. Add at most one CDN and one cache, each with at most 80% hits. Preserve the storage request share and all existing capacity settings. This model covers read demand, not upload bandwidth or durability.",
      topics: ["object-storage", "cdn", "caching"],
      hints: [
        "Which origin components still handle repeated media reads?",
        "Edge caching and application caching remove work at different points.",
        "Use a CDN before the existing origin and a cache after the app, retaining storage.",
      ],
      sequence: 6,
    },
    policy: "media-edge",
    traffic: {
      preset: "custom",
      rps: 2000,
      burst: 2,
      readRatio: 0.95,
      sloP95: 200,
      errorBudget: 0.01,
      durationMin: 10,
      shape: "steady",
    },
    start: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 280,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 520,
          y: 228,
          props: {
            replicas: 3,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "db",
          label: "Database",
          x: 1000,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n8",
          type: "storage",
          label: "Object storage",
          x: 760,
          y: 228,
          props: {
            share: 0.6,
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "e3",
          from: "n1",
          to: "n2",
        },
        {
          id: "e5",
          from: "n2",
          to: "n4",
        },
        {
          id: "e7",
          from: "n4",
          to: "n6",
        },
        {
          id: "e9",
          from: "n4",
          to: "n8",
        },
      ],
    },
    reference: {
      nodes: [
        {
          id: "n1",
          type: "client",
          label: "Users",
          x: 40,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "added_cdn_1",
          type: "cdn",
          label: "CDN",
          x: 280,
          y: 228,
          props: {
            hitRatio: 0.8,
          },
        },
        {
          id: "n2",
          type: "lb",
          label: "Load balancer",
          x: 520,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n4",
          type: "app",
          label: "App servers",
          x: 760,
          y: 228,
          props: {
            replicas: 3,
            region: "us-east",
          },
        },
        {
          id: "added_cache_4",
          type: "cache",
          label: "Cache",
          x: 1000,
          y: 181,
          props: {
            hitRatio: 0.8,
            region: "us-east",
          },
        },
        {
          id: "n6",
          type: "db",
          label: "Database",
          x: 1240,
          y: 228,
          props: {
            region: "us-east",
          },
        },
        {
          id: "n8",
          type: "storage",
          label: "Object storage",
          x: 1000,
          y: 275,
          props: {
            share: 0.6,
            region: "us-east",
          },
        },
      ],
      edges: [
        {
          id: "connection_0",
          from: "n1",
          to: "added_cdn_1",
        },
        {
          id: "connection_1",
          from: "added_cdn_1",
          to: "n2",
        },
        {
          id: "connection_2",
          from: "n2",
          to: "n4",
        },
        {
          id: "connection_3",
          from: "n4",
          to: "added_cache_4",
        },
        {
          id: "connection_4",
          from: "n4",
          to: "n6",
        },
        {
          id: "connection_5",
          from: "n4",
          to: "n8",
        },
      ],
    },
  },
];
