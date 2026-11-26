import type { Graph } from "@/lib/api/designs";
export type LearnCategory = "components" | "properties" | "traffic" | "results" | "workflows";
export type ComponentType = Graph["nodes"][number]["type"];
export type LessonProperty = { key: string; meaning: string; change: string };
export type LessonDetails = {
  category: LearnCategory;
  component?: ComponentType;
  keywords?: string[];
  diagram?: string[];
  properties?: LessonProperty[];
  example?: string;
  practice?: string[];
  tradeoff?: string;
  related?: string[];
  links?: { label: string; href: string }[];
};
export const LEARN_CATEGORIES: { id: LearnCategory; title: string; hint: string }[] = [
  { id: "components", title: "Components", hint: "All 12 building blocks in the canvas" },
  { id: "properties", title: "Properties & scaling", hint: "What each setting changes" },
  { id: "traffic", title: "Traffic", hint: "Rates, bursts, shapes and targets" },
  { id: "results", title: "Reading results", hint: "Interpret the model and its limits" },
  { id: "workflows", title: "Using StressForge", hint: "From a blank canvas to a shared report" },
];
