export const NODE_W = 184,
  NODE_H = 64,
  GRID = 12;
export type Point = { x: number; y: number };
export type View = Point & { k: number };
export type Size = { w: number; h: number };
export const snap = (n: number) =>
  Math.max(-99996, Math.min(99996, Math.round(n / GRID) * GRID));
export const world = (p: Point, view: View): Point => ({
  x: (p.x - view.x) / view.k,
  y: (p.y - view.y) / view.k,
});
export const screen = (p: Point, view: View): Point => ({
  x: p.x * view.k + view.x,
  y: p.y * view.k + view.y,
});
export function zoomAt(p: Point, view: View, factor: number): View {
  const anchor = world(p, view),
    k = Math.max(0.3, Math.min(2, view.k * factor));
  return { k, x: p.x - anchor.x * k, y: p.y - anchor.y * k };
}
export function fit(nodes: Point[], size: Size): View {
  if (!nodes.length) return { x: size.w * 0.2, y: size.h * 0.35, k: 1 };
  const left = Math.min(...nodes.map((n) => n.x)),
    top = Math.min(...nodes.map((n) => n.y));
  const w = Math.max(...nodes.map((n) => n.x + NODE_W)) - left,
    h = Math.max(...nodes.map((n) => n.y + NODE_H)) - top;
  const k = Math.max(
    0.3,
    Math.min(
      1.15,
      Math.min(Math.max(1, size.w - 80) / w, Math.max(1, size.h - 112) / h),
    ),
  );
  return {
    k,
    x: 40 + (size.w - 80 - w * k) / 2 - left * k,
    y: 72 + (size.h - 112 - h * k) / 2 - top * k,
  };
}
export function edgePath(a: Point, b: Point) {
  const x1 = a.x + NODE_W,
    y1 = a.y + NODE_H / 2,
    x2 = b.x - 2,
    y2 = b.y + NODE_H / 2;
  const dx = x2 < x1 + 30 ? 90 : Math.max(36, (x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}
