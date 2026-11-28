import { SharedBandwidth } from "@/modules/region-lab/engine/component-resources";
import { sample } from "@/modules/region-lab/engine/random";
import type {
  RegionalInput,
  Region,
} from "@/modules/region-lab/engine/regional-input";

type Schedule = (at: number, priority: number, fn: () => void) => void;
export class RegionalRuntime {
  private failed = new Set<string>();
  private observedFailed = new Set<string>();
  private links = new Map<
    string,
    { pool: SharedBandwidth; transfers: number; bytes: number; pending: number }
  >();
  private states = new Map<
    string,
    { entry: string | null; initialEntry: string | null; epoch: number }
  >();
  private stopped = false;
  private reroutedRoots = new Set<string>();
  private routeCounts = new Map<string, number>();
  private transportSequence = 0;
  readonly phases: {
    atMs: number;
    phase: string;
    route?: string;
    entry?: string | null;
  }[] = [];
  constructor(
    readonly input: RegionalInput,
    private now: () => number,
    private schedule: Schedule,
    private changed: (ids: string[], down: boolean) => void,
    private track: (delta: number) => void,
  ) {
    for (const n of input.network)
      this.links.set(n.from + ">" + n.to, {
        pool: new SharedBandwidth(
          (n.bandwidthMbps * 1000000) / 8 / 1000,
          now,
          (at, fn) => schedule(at, 1, fn),
        ),
        transfers: 0,
        bytes: 0,
        pending: 0,
      });
    for (const r of input.routing) {
      const key = this.key(r.originRegion, r.operationId);
      this.states.set(key, {
        entry: this.choose(r),
        initialEntry: this.choose(r),
        epoch: 0,
      });
    }
    this.phases.push({ atMs: 0, phase: "healthy" });
    if (input.outage) {
      const o = input.outage,
        start = input.workload.warmupMs + o.startMs,
        end = start + o.durationMs;
      schedule(start, 0, () => {
        this.stopped = true;
        o.affectedNodeIds.forEach((id) => this.failed.add(id));
        this.phases.push({ atMs: o.startMs, phase: "undetected_outage" });
        changed(o.affectedNodeIds, true);
        this.observe(false);
      });
      schedule(end, 0, () => {
        this.stopped = false;
        o.affectedNodeIds.forEach((id) => this.failed.delete(id));
        this.phases.push({
          atMs: o.startMs + o.durationMs,
          phase: "recovering",
        });
        changed(o.affectedNodeIds, false);
        this.observe(true);
      });
    }
  }
  private key(origin: string, op: string) {
    return origin + ">" + op;
  }
  private choose(r: RegionalInput["routing"][number]): string | null {
    const candidates = [r.primaryEntryNodeId, ...r.fallbackEntryNodeIds].filter(
      (id) => !this.observedFailed.has(id),
    );
    if (r.policy === "nearest_healthy")
      candidates.sort(
        (a, b) =>
          this.distance(r.originRegion, a) - this.distance(r.originRegion, b) ||
          (a < b ? -1 : a > b ? 1 : 0),
      );
    return candidates[0] ?? null;
  }
  private distance(origin: Region, id: string) {
    const region = this.input.nodes.find((n) => n.id === id)!.region;
    const mean = (a: Region, b: Region) => {
      const d = this.input.network.find(
        (n) => n.from === a && n.to === b,
      )!.oneWayDelay;
      return d.kind === "constant" ? d.valueMs : d.meanMs;
    };
    return mean(origin, region) + mean(region, origin);
  }
  private observe(recovered: boolean) {
    for (const r of this.input.routing) {
      const key = this.key(r.originRegion, r.operationId),
        state = this.states.get(key)!,
        epoch = ++state.epoch;
      this.schedule(this.now() + r.detectionMs, 2, () => {
        if (state.epoch !== epoch || this.stopped === recovered) return;
        // Health observations are per route; another route's detection must not update this one early.
        const affected = new Set(this.input.outage!.affectedNodeIds);
        const candidates = [r.primaryEntryNodeId, ...r.fallbackEntryNodeIds];
        const observed = new Set(recovered ? [] : [...affected]);
        this.phases.push({
          atMs: this.now() - this.input.workload.warmupMs,
          phase: recovered ? "recovery_detected" : "switching",
          route: key,
          entry: state.entry,
        });
        this.schedule(
          this.now() + (recovered ? r.failbackMs : r.switchMs),
          2,
          () => {
            if (state.epoch !== epoch || this.stopped === recovered) return;
            // Temporary route-local view keeps detection clocks independent.
            const old = this.observedFailed;
            this.observedFailed = observed;
            const selected = this.choose(r);
            this.observedFailed = old;
            const previous = state.entry;
            if (!recovered || r.returnOnRecovery || state.entry === null)
              state.entry = selected;
            else if (!candidates.includes(state.entry)) state.entry = selected;
            this.phases.push({
              atMs: this.now() - this.input.workload.warmupMs,
              phase: recovered
                ? "recovered"
                : state.entry === previous
                  ? "route_unchanged"
                  : "rerouted",
              route: key,
              entry: state.entry,
            });
          },
        );
      });
    }
  }
  available(id: string) {
    return !this.failed.has(id);
  }
  route(origin: Region, operation: string, root: string, measured: boolean) {
    const key = this.key(origin, operation),
      state = this.states.get(key)!;
    if (measured) {
      const counter = key + ">" + String(state.entry);
      this.routeCounts.set(counter, (this.routeCounts.get(counter) ?? 0) + 1);
      if (state.entry && state.entry !== state.initialEntry)
        this.reroutedRoots.add(root);
    }
    return state.entry;
  }
  transfer(
    from: Region,
    to: Region,
    bytes: number,
    key: string,
    done: () => void,
  ) {
    const definition = this.input.network.find(
      (n) => n.from === from && n.to === to,
    )!;
    const link = this.links.get(from + ">" + to)!;
    const serial = ++this.transportSequence;
    link.transfers++;
    link.bytes += bytes;
    link.pending++;
    this.track(1);
    // Serialize on the directed shared link, then propagate once. Reverse calls use the reverse link.
    link.pool.add(bytes, () => {
      const delay = sample(
        definition.oneWayDelay,
        this.input.seed,
        "network",
        key,
        from,
        to,
      );
      this.schedule(this.now() + delay, 1, () => {
        link.pending--;
        this.track(-1);
        done();
      });
    });
    return serial;
  }
  result() {
    return {
      phases: this.phases,
      reroutedRoots: this.reroutedRoots.size,
      attemptRoutes: Object.fromEntries([...this.routeCounts].sort()),
      links: [...this.links].map(([pair, l]) => ({
        pair,
        transfers: l.transfers,
        bytes: l.bytes,
        pending: l.pending,
        activeSerializations: l.pool.active,
      })),
    };
  }
}
