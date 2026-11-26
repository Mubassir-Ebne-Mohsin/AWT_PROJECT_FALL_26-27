import { ComponentGlyph } from "@/components/canvas/component-glyph";
import { Icon } from "@/components/ui/icon";
import type { Topic } from "@/lib/learn-content";
export function LessonIcon({ topic }: { topic: Topic }) {
  return <span className="learn-logo" data-component={topic.component} aria-hidden="true">{topic.component ? <ComponentGlyph type={topic.component} size={24} /> : <Icon n={topic.category === "traffic" ? "play" : topic.category === "workflows" ? "layers" : topic.category === "properties" ? "settings" : "dashboard"} s={24} />}</span>;
}
