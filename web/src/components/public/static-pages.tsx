import Link from "next/link";
import { Crumbs } from "@/components/shell/crumbs";
import {
  ABOUT_SECTIONS,
  HOW_INTRO,
  HOW_SECTIONS,
  PRIVACY_AI,
  PRIVACY_CONTROL,
  PRIVACY_INTRO,
  PRIVACY_STORED,
  SOURCE_URL,
  TERMS_SECTIONS,
  type Section,
} from "@/lib/public-content";
import { resolveRoute } from "@/lib/routes";

/** The shared frame of the public text pages: breadcrumb, one h1, a short lead, then the content. No account needed. */
function Frame({ path, lead, children }: { path: string; lead: string; children: React.ReactNode }) {
  const resolved = resolveRoute(path);
  return (
    <div className="page narrow stack lg" data-testid="public-page">
      <Crumbs resolved={resolved} />
      <div className="stack">
        <h1 className="h1">{resolved.title}</h1>
        <p className="lede">{lead}</p>
      </div>
      {children}
    </div>
  );
}

function Sections({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.id} className="stack" aria-labelledby={`sec-${s.id}`} data-testid="public-section">
          <h2 className="h2" id={`sec-${s.id}`}>
            {s.heading}
          </h2>
          <div className="prose">
            {s.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {s.items && (
              <ul>
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
    </>
  );
}

export function HowItWorksPage() {
  return (
    <Frame path="/how-it-works" lead={HOW_INTRO}>
      <Sections sections={HOW_SECTIONS} />
      <p className="hint">
        Want the evidence? <Link href="/evaluation/simulator">See what has been checked</Link>. Ready to try it? <Link href="/register">Create an account</Link> or <Link href="/learn">read the concepts</Link>.
      </p>
    </Frame>
  );
}

export function AboutPage() {
  return (
    <Frame path="/about" lead="An architecture drawing and simulation lab for students and developers.">
      <Sections sections={ABOUT_SECTIONS} />
      <p>
        <a href={SOURCE_URL} rel="noreferrer noopener" target="_blank">
          Open the source repository
        </a>
      </p>
    </Frame>
  );
}

export function PrivacyPage() {
  return (
    <Frame path="/privacy" lead={PRIVACY_INTRO}>
      <section className="stack" aria-labelledby="sec-stored">
        <h2 className="h2" id="sec-stored">
          What is stored, and who can see it
        </h2>
        <ul className="stack" aria-label="Stored data" style={{ listStyle: "none", padding: 0 }}>
          {PRIVACY_STORED.map((row) => (
            <li key={row.what} className="panel r2-pad stack" data-testid="privacy-row">
              <h3 className="h3">{row.what}</h3>
              <p>{row.detail}</p>
              <p className="small muted">Who can see it: {row.who}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="stack" aria-labelledby="sec-ai">
        <h2 className="h2" id="sec-ai">
          AI
        </h2>
        <p className="prose" data-testid="privacy-ai">
          {PRIVACY_AI}
        </p>
      </section>
      <section className="stack" aria-labelledby="sec-control">
        <h2 className="h2" id="sec-control">
          Your control
        </h2>
        <p className="prose" data-testid="privacy-control">
          {PRIVACY_CONTROL}
        </p>
      </section>
    </Frame>
  );
}

export function TermsPage() {
  return (
    <Frame path="/terms" lead="The short rules for using StressForge, and what its results mean.">
      <Sections sections={TERMS_SECTIONS} />
    </Frame>
  );
}
