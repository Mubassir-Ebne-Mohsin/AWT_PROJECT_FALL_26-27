import type { Node } from "@/lib/canvas/model";
// Static, trusted component glyphs ported from prototype SECTION 2.
const GLYPHS: Record<string, string> = {
  client:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.6.6 2.7 2.2 3 4.7"/>',
  cdn: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
  lb: '<circle cx="4.5" cy="12" r="2"/><path d="M6.5 12H10l6.5-6.5M10 12h8.5M10 12l6.5 6.5"/><circle cx="18.5" cy="5" r="1.6"/><circle cx="20" cy="12" r="1.6"/><circle cx="18.5" cy="19" r="1.6"/>',
  gateway: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6M3 20h18"/>',
  app: '<rect x="3.5" y="4" width="17" height="7" rx="1.5"/><rect x="3.5" y="13" width="17" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
  worker:
    '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.8"/><path d="M12 2.5v2.7M12 18.8v2.7M2.5 12h2.7M18.8 12h2.7M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M5.3 18.7l1.9-1.9M16.8 7.2l1.9-1.9"/>',
  cache: '<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8z"/>',
  db: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  replica:
    '<ellipse cx="9.5" cy="5.5" rx="5.5" ry="2.2"/><path d="M4 5.5v10c0 1.2 2.5 2.2 5.5 2.2M15 5.5V8"/><ellipse cx="15" cy="10.5" rx="5.5" ry="2.2"/><path d="M9.5 10.5v8.5c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-8.5"/>',
  queue:
    '<path d="M1.5 12h2.5"/><rect x="4.5" y="7" width="4.2" height="10" rx="1"/><rect x="10" y="7" width="4.2" height="10" rx="1"/><rect x="15.5" y="7" width="4.2" height="10" rx="1"/><path d="M20 12h2.5"/>',
  storage:
    '<path d="M4 6.5h16l-1.8 12.7a2 2 0 0 1-2 1.8H7.8a2 2 0 0 1-2-1.8z"/><ellipse cx="12" cy="6.5" rx="8" ry="2.6"/>',
  external:
    '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
};
export function ComponentGlyph({
  type,
  size = 18,
}: {
  type: Node["type"];
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: GLYPHS[type] }}
    />
  );
}
