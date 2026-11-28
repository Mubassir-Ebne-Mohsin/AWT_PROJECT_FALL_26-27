export interface Event {
  time: number;
  priority: number;
  sequence: number;
  run: () => void;
}
const before = (a: Event, b: Event) =>
  a.time < b.time ||
  (a.time === b.time &&
    (a.priority < b.priority ||
      (a.priority === b.priority && a.sequence < b.sequence)));

/** Binary min-heap; ties are explicit and never depend on collection iteration order. */
export class EventHeap {
  private readonly items: Event[] = [];
  get size() {
    return this.items.length;
  }
  peek(): Event | undefined {
    return this.items[0];
  }
  push(value: Event) {
    let i = this.items.length;
    this.items.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(value, this.items[parent])) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = value;
  }
  pop(): Event | undefined {
    const first = this.items[0],
      tail = this.items.pop();
    if (!this.items.length || !tail) return first;
    let i = 0;
    while (i * 2 + 1 < this.items.length) {
      let child = i * 2 + 1;
      if (
        child + 1 < this.items.length &&
        before(this.items[child + 1], this.items[child])
      )
        child++;
      if (before(tail, this.items[child])) break;
      this.items[i] = this.items[child];
      i = child;
    }
    this.items[i] = tail;
    return first;
  }
}
