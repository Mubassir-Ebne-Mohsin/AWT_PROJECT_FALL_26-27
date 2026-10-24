"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CreationPage, GraphThumbnail } from "@/components/creation/shared";
import { fetchTemplates } from "@/lib/api/designs";
export const CREATION_CHOICES = [
  [
    "describe",
    "Describe it in words",
    "Review a draft made by local keyword rules.",
    "Scripted mock",
  ],
  [
    "template",
    "Start from a template",
    "Six designs with traffic to match.",
    "6 templates",
  ],
  [
    "blank",
    "Blank canvas",
    "Start with a traffic entry or an empty graph.",
    "Manual",
  ],
  [
    "import",
    "Import a JSON file",
    "Paste or load a saved design. Check it before creating.",
    "File",
  ],
] as const;
export function CreationChooser() {
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });
  return (
    <CreationPage
      path="/new"
      title="Start a design"
      intro="Pick how you want to begin. Everything stays editable afterwards."
    >
      <div className="grid-2">
        {CREATION_CHOICES.map(([path, title, description, tag]) => (
          <Link
            key={path}
            href={"/new/" + path}
            className={"choice" + (path === "describe" ? " primary" : "")}
          >
            <span className="tag">{tag}</span>
            <h2 className="h3">{title}</h2>
            <p className="muted">{description}</p>
          </Link>
        ))}
      </div>
      <section className="stack">
        <div className="row between">
          <h2 className="h2">Or open a template right away</h2>
          <Link className="btn btn-ghost" href="/new/template">
            All templates
          </Link>
        </div>
        <div className="m3-template-grid">
          {templates.data?.slice(0, 3).map((t) => (
            <article className="panel" key={t.id}>
              <GraphThumbnail graph={t.graph} />
              <div className="panel-b stack">
                <h3 className="h3">{t.name}</h3>
                <p className="muted">{t.blurb}</p>
                <Link className="btn" href={"/new/template?template=" + t.id}>
                  Preview {t.name}
                </Link>
              </div>
            </article>
          ))}
        </div>
        {templates.isError && (
          <button className="btn" onClick={() => templates.refetch()}>
            Retry loading templates
          </button>
        )}
      </section>
    </CreationPage>
  );
}
