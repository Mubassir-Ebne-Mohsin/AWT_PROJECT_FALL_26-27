/** Deterministic local admission; full at startup, refill capped at burst. */
export class TokenBucket {
  private tokens: number;
  private at = 0;
  constructor(
    readonly rate: number,
    readonly burst: number,
  ) {
    this.tokens = burst;
  }
  take(now: number): boolean {
    this.tokens = Math.min(
      this.burst,
      this.tokens + ((now - this.at) * this.rate) / 1000,
    );
    this.at = now;
    if (this.tokens + 1e-12 < 1) return false;
    this.tokens = Math.max(0, this.tokens - 1);
    return true;
  }
}

/** Equal-share decimal Mbps for one storage resource, independent of regional links. */
export class SharedBandwidth {
  private at = 0;
  private generation = 0;
  private transfers: { remaining: number; done: () => void }[] = [];
  constructor(
    private bytesPerMs: number,
    private now: () => number,
    private schedule: (at: number, fn: () => void) => void,
  ) {}
  get active() {
    return this.transfers.length;
  }
  private advance() {
    const each = this.transfers.length
      ? ((this.now() - this.at) * this.bytesPerMs) / this.transfers.length
      : 0;
    this.transfers.forEach(
      (t) => (t.remaining = Math.max(0, t.remaining - each)),
    );
    this.at = this.now();
  }
  add(bytes: number, done: () => void) {
    this.advance();
    if (!bytes) {
      done();
      return;
    }
    this.transfers.push({ remaining: bytes, done });
    this.arm();
  }
  private arm() {
    const generation = ++this.generation;
    if (!this.transfers.length) return;
    const minimum = Math.min(...this.transfers.map((t) => t.remaining));
    const due = new Set(this.transfers.filter((t) => t.remaining === minimum));
    const delay = (minimum * this.transfers.length) / this.bytesPerMs;
    this.schedule(this.now() + delay, () => {
      if (generation !== this.generation) return;
      this.advance();
      // With no intervening transfer change (generation matches), the scheduled
      // minimum has finished mathematically. Remove it even if timestamp
      // rounding leaves residual bytes, ensuring progress at sub-ULP delays.
      const complete = this.transfers.filter(
        (t) => due.has(t) || t.remaining < 1e-7,
      );
      this.transfers = this.transfers.filter(
        (t) => !due.has(t) && t.remaining >= 1e-7,
      );
      complete.forEach((t) => t.done());
      this.arm();
    });
  }
}
