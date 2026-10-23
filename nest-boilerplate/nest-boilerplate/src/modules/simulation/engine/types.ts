import type {
  Graph,
  Traffic as ContractTraffic,
} from "@/common/contracts/phase2/graph.schema";
import type { WorkBudget } from "@/modules/simulation/engine/budget";
export type NodeType = Graph["nodes"][number]["type"];
export type Region = "us-east" | "eu-west" | "ap-south";
export interface NodeProps {
  replicas?: number;
  capacity?: number;
  latency?: number;
  region?: Region;
  hitRatio?: number;
  share?: number;
  maxDepth?: number;
}
export interface EngineNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  props: NodeProps;
}
export interface Edge {
  id: string;
  from: string;
  to: string;
}
export interface Design {
  nodes: EngineNode[];
  edges: Edge[];
  traffic?: Traffic;
}
export type Traffic = ContractTraffic;
export interface CatalogEntry {
  label: string;
  short: string;
  category: string;
  capacity: number;
  latency: number;
  behavior: "none" | "shed" | "backlog" | "timeout" | "reject";
  defaults?: NodeProps;
  blurb: string;
}
export type Kind = "r" | "w" | "a";
export type Dict<T> = Record<string, T>;
export const dict = <T>(): Dict<T> => Object.create(null) as Dict<T>;
export interface Topology {
  byId: Dict<EngineNode>;
  out: Dict<string[]>;
  inn: Dict<string[]>;
}
export interface Issue {
  code: string;
  msg: string;
  fix: string;
  nodeIds: string[];
  level: "error" | "warning" | "info";
}
export interface Validation {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
}
export interface Call {
  to: string;
  p: number;
}
export type Tables = Dict<Record<Kind, Call[][]>>;
export interface Load {
  r: number;
  w: number;
  a: number;
}
export interface NodeState {
  load: Load;
  peak: number;
  cap: number;
  rho: number;
  s: number;
}
export interface Propagation {
  L: Dict<Load>;
  st: Dict<NodeState>;
  F: Dict<number>;
  B: number;
}
export interface Model {
  S: number;
  Wq: number;
  T: number;
  sd: number;
  c: number;
  e: number;
}
export interface Step {
  id: string;
  hop: number;
}
export interface Component {
  p: number;
  m: number;
  v: number;
  ok: number;
  seq: Step[] | null;
}
export interface Lognormal {
  p: number;
  ok: number;
  mu: number;
  s: number;
}
export interface QueueMetric {
  id: string;
  label: string;
  arrival: number;
  peakArrival: number;
  drain: number;
  backlog: number;
  lag: number;
  overflow: number;
  maxDepth: number;
  state: "idle" | "clear" | "growing" | "absorbing";
  syncShare: number;
}
export interface NodeMetric {
  id: string;
  type: NodeType;
  label: string;
  region: Region;
  reads: number;
  writes: number;
  async: number;
  peak: number;
  cap: number;
  rho: number;
  status: "idle" | "ok" | "warn" | "fail";
  background: boolean;
  T: number;
  S: number;
  Wq: number;
  servers: number | null;
  errors: number;
  visit: number;
  contribution: number;
  satRps: number;
}
export interface Simulation {
  ok: true;
  validation: Validation;
  traffic: Traffic;
  rps: number;
  peakRps: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  errorRate: number;
  throughput: number;
  sloMet: boolean;
  verdict: "pass" | "strained" | "fail";
  nodes: NodeMetric[];
  byId: Dict<NodeMetric>;
  bottleneck: NodeMetric | null;
  maxRho: number;
  queues: QueueMetric[];
  backgroundIssues: {
    id: string;
    label: string;
    rho: number;
    dropped: number;
  }[];
  flows: Dict<number>;
  crossRegion: {
    from: string;
    to: string;
    fromRegion: Region;
    toRegion: Region;
    rtt: number;
    flow: number;
  }[];
}
export interface InvalidSimulation {
  ok: false;
  validation: Validation;
  rps: number;
  traffic: Traffic;
}
export interface EngineOptions {
  rps?: number;
  shedding?: boolean;
  limit?: number;
  budget?: WorkBudget;
}
export interface NamedPath {
  kind: "Read" | "Write";
  p: number;
  mean: number;
  p95: number;
  ok: number;
  seq: Step[];
  steps?: (Step & { label: string; type: NodeType; T: number })[];
}
export interface TimelinePoint {
  t: number;
  rps: number;
  p95: number;
  err: number;
}
