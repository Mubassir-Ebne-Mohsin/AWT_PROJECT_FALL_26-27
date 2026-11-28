import Link from "next/link";
import { Crumbs } from "@/components/shell/crumbs";
import { Icon } from "@/components/ui/icon";
import { ABOUT_CAPABILITIES, ABOUT_SECTIONS } from "@/lib/public-content";
import { resolveRoute } from "@/lib/routes";

const phases = [
  { name: "Draw", text: "Make your assumptions visible. Connect clients, an app and a database, then decide where routing and caching belong." },
  { name: "Test", text: "Ask what happens when demand grows. Choose traffic and targets, then run the mathematical model." },
  { name: "Understand", text: "Follow the request path. Inspect utilization and latency to understand which component limits the design." },
  { name: "Improve", text: "Change one thing and compare. Try capacity, replicas or caching, then rerun the model to evaluate the trade-off." },
];

function ArchitectureLab() {
  return <fieldset className="about-lab about-glass">
    <legend className="sr">Explore the STRESSFORGE workflow</legend>
    <div className="about-lab-top"><span className="about-kicker">THE DESIGN LOOP</span><span className="about-live"><i /> Interactive illustration</span></div>
    <div className="about-phases">{phases.map((phase, i) => <label key={phase.name}>
      <input type="radio" name="about-phase" value={i} defaultChecked={i === 0} /><span>{String(i + 1).padStart(2, "0")}</span> {phase.name}
    </label>)}</div>
    <div className="about-diagram" aria-hidden="true">
      <svg viewBox="0 0 500 265" fill="none">
        <g className="about-wires" stroke="currentColor" strokeWidth="1.5"><path d="M100 138H147M225 138H272M350 138H397M311 115V65H397" /></g>
        <path className="about-flow" d="M100 138H397" stroke="currentColor" strokeWidth="2" strokeDasharray="3 35" />
        <g className="about-node"><rect x="22" y="115" width="78" height="46" rx="9"/><text x="61" y="143">Clients</text></g>
        <g className="about-node"><rect x="147" y="115" width="78" height="46" rx="9"/><text x="186" y="135">Load</text><text x="186" y="151">balancer</text></g>
        <g className="about-node about-node-app"><rect x="272" y="115" width="78" height="46" rx="9"/><text x="311" y="143">App</text></g>
        <g className="about-node"><rect x="397" y="115" width="81" height="46" rx="9"/><text x="437" y="143">Database</text></g>
        <g className="about-node about-node-cache"><rect x="397" y="42" width="81" height="46" rx="9"/><text x="437" y="70">Cache</text></g>
        <text className="about-diagram-note" x="250" y="216">ONE CONNECTED SYSTEM. MANY POSSIBLE DECISIONS.</text>
      </svg>
    </div>
    <div className="about-phase-copy" aria-live="polite">{phases.map((phase, i) => <p className={"about-state about-state-" + i} key={phase.name}><strong>{phase.name}.</strong> {phase.text}</p>)}</div>
    <p className="about-illustration-note">Illustration only · no simulation or AI request is made here.</p>
  </fieldset>;
}

export function AboutPage() {
  const [why, who, workflow, honest] = ABOUT_SECTIONS;
  return <div className="page about-page" data-testid="public-page">
    <Crumbs resolved={resolveRoute("/about")} />
    <header className="about-hero">
      <div className="about-intro">
        <h1 className="about-kicker">About</h1>
        <h2>Good systems start with <em>better questions.</em></h2>
        <p className="about-lead">Draw the architecture. Turn up the traffic. Understand what happens next.</p>
        <p>{why.body[0]}</p>
        <div className="about-actions"><Link className="btn btn-primary btn-lg" href="/new/blank">Start a design <Icon n="arrowR" /></Link><Link className="about-text-link" href="/learn">Learn the fundamentals <Icon n="arrowR" /></Link></div>
        <div className="about-hero-foot"><Icon n="layers" s={15} /> A system architecture lab for curious builders.</div>
      </div>
      <ArchitectureLab />
    </header>

    <section className="about-section" aria-labelledby="about-purpose">
      <div className="about-section-heading"><span className="about-kicker">FROM A SKETCH TO AN EXPLANATION</span><h2 id="about-purpose">See the system.<br />Understand the trade-offs.</h2><p>More than a diagram: a place to ask why a design works, where it struggles, and what to try next.</p></div>
      <div className="about-capabilities">{ABOUT_CAPABILITIES.map((card, i) => <article key={card.title} className="about-glass about-card" data-testid="about-capability">
        <div className="about-card-top"><span className="about-icon"><Icon n={card.icon} s={23} /></span><span className="about-card-index">0{i + 1}</span></div>
        <h3>{card.title}</h3><p>{card.detail}</p><Link className="about-text-link" href={card.link}>{card.action} <Icon n="arrowR" /></Link>
      </article>)}</div>
    </section>

    <section className="about-workflow about-glass" aria-labelledby="about-workflow">
      <div><span className="about-kicker">SMALL CHANGES. CLEARER REASONING.</span><h2 id="about-workflow">{workflow.heading}</h2></div>
      <div>{workflow.body.map(p => <p key={p}>{p}</p>)}<p className="about-inline-note"><Icon n="check" /> Saved runs give your comparison a recorded starting point.</p></div>
    </section>

    <section className="about-section about-people" aria-labelledby="about-people">
      <div className="about-section-heading"><span className="about-kicker">BUILT FOR LEARNING TOGETHER</span><h2 id="about-people">{who.heading}</h2><p>{who.body[0]}</p><p className="about-origin">{why.body[1]}</p></div>
      <div className="about-role-list">{who.items?.map((item, i) => <details key={item} className="about-glass" open={i === 0}><summary><span className="about-role-num">0{i + 1}</span><span>{["Builders & learners", "Reviewers", "Instructors", "Support", "Admins"][i]}</span><Icon n="plus" /></summary><p>{item}</p></details>)}</div>
    </section>

    <section className="about-honesty about-glass" aria-labelledby="about-honesty"><span className="about-icon"><Icon n="info" s={24} /></span><div><span className="about-kicker">UNDERSTANDING BEFORE CERTAINTY</span><h2 id="about-honesty">{honest.heading}</h2>{honest.body.map(p => <p key={p}>{p}</p>)}<Link className="about-text-link" href="/evaluation/simulator">Explore the evidence and limitations <Icon n="arrowR" /></Link></div></section>

    <footer className="about-closing"><span className="about-kicker">YOUR NEXT QUESTION STARTS HERE</span><h2>What would you build differently?</h2><p>Start small. Test an assumption. Make the next version better.</p><div className="about-actions"><Link className="btn btn-primary btn-lg" href="/new/blank">Open the canvas <Icon n="arrowR" /></Link><Link className="btn btn-lg" href="/challenges">Try a challenge</Link></div></footer>
  </div>;
}
