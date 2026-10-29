import type { CSSProperties } from "react";
import Link from "next/link";
import { ArchitectureSpecimen } from "@/components/landing/architecture-specimen";
import { LandingEffects } from "@/components/landing/landing-effects";
import "@/styles/landing.css";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

/** Stagger index for reveal-on-scroll, read by CSS. */
const at = (i: number) => ({ "--i": i }) as CSSProperties;

export default function LandingPage() {
  return (
    <div className="sf-landing">
      <div className="sf-grid" aria-hidden="true"><div className="sf-spotlight" /></div>
      <div className="sf-frame" aria-hidden="true" />
      <header className="sf-public-header">
        <Link href="/" className="sf-wordmark" aria-label="StressForge home"><svg viewBox="0 0 30 32" aria-hidden="true"><path d="m15 2 13 7-13 7L2 9Zm-13 14 13 7 13-7M2 23l13 7 13-7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>STRESSFORGE<span className="sf-wordmark-period">.</span></Link>
        <nav className="sf-section-nav" aria-label="Page sections"><a href="#the-idea" data-nav="the-idea">The idea</a><a href="#inside" data-nav="inside">Inside the system</a></nav>
        <Link href="/login" className="sf-login sf-magnetic">Log in <Arrow diagonal /></Link>
        <span className="sf-progress" aria-hidden="true" />
      </header>

      <section className="sf-hero" aria-labelledby="sf-title">
        <div className="sf-hero-copy">
          <div className="sf-eyebrow sf-tag"><nav aria-label="Breadcrumb"><span aria-current="page">Home</span></nav><span className="sf-eyebrow-rule" /> A SYSTEM ARCHITECTURE LAB</div>
          <h1 id="sf-title">Good on paper.<br /><span>What about<br className="sf-desktop-break" /> under pressure?</span></h1>
          <p>Draw your architecture. Turn up the traffic. Discover where the model bends, before your next design decision.</p>
          <div className="sf-actions"><Link href="/register" className="sf-button sf-magnetic">Build your first system <Arrow /></Link><a href="#inside" className="sf-text-link">Take it apart <span aria-hidden="true">↓</span></a></div>
          <ul className="sf-stats" aria-label="At a glance">
            <li><strong>12</strong><span>COMPONENT TYPES</span></li>
            <li><strong>6</strong><span>STARTER TEMPLATES</span></li>
            <li><strong>p95</strong><span>LATENCY OUTPUT</span></li>
          </ul>
          <p className="sf-hero-note">For curious students. For deliberate developers.</p>
        </div>
        <div className="sf-hero-object"><div className="sf-specimen-index"><span>FIG. 001</span><span>THE CONNECTED SYSTEM</span></div><ArchitectureSpecimen /><span className="sf-object-bracket sf-object-bracket--tl" /><span className="sf-object-bracket sf-object-bracket--br" /><span className="sf-cross sf-cross--v" aria-hidden="true" /><span className="sf-cross sf-cross--h" aria-hidden="true" /><span className="sf-readout" data-readout aria-hidden="true">X 0000 · Y 0000</span></div>
        <a href="#the-idea" className="sf-scroll-cue"><span className="sf-scroll-track" /> SCROLL TO LOOK CLOSER <span aria-hidden="true">↓</span></a>
      </section>

      <div className="sf-capability-strip" aria-label="Available in StressForge">
        <span className="sf-cap sf-spot"><b aria-hidden="true">01</b>DRAW / CONNECT</span>
        <span className="sf-cap sf-spot"><b aria-hidden="true">02</b>CONFIGURE / SAVE</span>
        <span className="sf-cap sf-spot"><b aria-hidden="true">03</b>SIMULATE / INSPECT</span>
        <span className="sf-cap sf-spot"><b aria-hidden="true">04</b>CHANGE / REPEAT</span>
      </div>

      <section id="the-idea" className="sf-premise" aria-labelledby="sf-premise-title">
        <div className="sf-sec" data-reveal><span>SEC 01</span><i className="sf-rule" /></div>
        <p className="sf-eyebrow" data-reveal style={at(1)}>THE DIAGRAM IS ONLY THE BEGINNING</p>
        <h2 id="sf-premise-title" data-reveal style={at(2)}>Every box has a limit.<br /><span>Every arrow has a consequence.</span></h2>
        <div className="sf-premise-bottom" data-reveal style={at(3)}><span className="sf-crosshair" aria-hidden="true">+</span><p>A clean diagram can hide a busy app server, a shared database or a long request path. StressForge makes those dependencies something you can explore—not just draw.</p></div>
      </section>

      <section id="inside" className="sf-story" data-architecture-story aria-labelledby="sf-story-title">
        <div className="sf-story-heading"><span className="sf-eyebrow">ANATOMY OF AN ARCHITECTURE</span><span className="sf-eyebrow">SCROLL TO DISASSEMBLE ↘</span></div>
        <div className="sf-story-layout">
          <div className="sf-story-visual"><ArchitectureSpecimen animated /><div className="sf-visual-footnote"><span>ONE SYSTEM. CONNECTED CONSEQUENCES.</span><span>01—04</span></div></div>
          <div className="sf-story-copy">
            <article className="sf-story-step"><span className="sf-step-number">01 / ASSEMBLE</span><h2 id="sf-story-title">Make the idea<br /><em>tangible.</em></h2><p>Start with a template or a blank canvas. Connect components, adjust their properties and save a design you can come back to.</p><div className="sf-inline-spec sf-spot"><span>CANVAS</span><strong>12 component types</strong><span>FROM CLIENT TO DATA</span></div></article>
            <article className="sf-story-step"><span className="sf-step-number">02 / EXAMINE</span><h2>Look past<br /><em>the boxes.</em></h2><p>Set a traffic profile and run the model. Inspect predicted latency, errors and component utilization to understand where pressure builds.</p><div className="sf-metric-spec sf-spot"><span>READ THE MODEL</span><div><strong>p95</strong><span>Latency</span><strong>%</strong><span>Utilization</span></div><small>Mathematical estimates. Not measured infrastructure performance.</small></div></article>
            <article className="sf-story-step"><span className="sf-step-number">03 / RETHINK</span><h2>Change one thing.<br /><em>Learn something.</em></h2><p>More app replicas still depend on the same database. Change the design, run again and inspect the outcome. Use Limits to explore how much traffic the saved model can handle.</p><div className="sf-inline-spec sf-spot"><span>THE LOOP</span><strong>Design → model → refine</strong><span>KEEP ASKING “WHAT IF?”</span></div></article>
          </div>
        </div>
      </section>

      <section className="sf-honesty" aria-labelledby="sf-honesty-title"><span className="sf-eyebrow" data-reveal>A LAB FOR UNDERSTANDING</span><div className="sf-spot sf-panel" data-reveal style={at(1)}><h2 id="sf-honesty-title">Explore the tradeoffs.<br />Question the assumptions.</h2><p>StressForge models architecture behavior. It doesn’t deploy your system or send real traffic to infrastructure. Use the estimates to investigate a design—not as a production guarantee.</p><p className="sf-future-note">Real AI assistance is planned. Current AI-style interactions are labelled scripted mocks.</p></div></section>

      <section id="start" className="sf-finale" aria-labelledby="sf-final-title"><div className="sf-orb" aria-hidden="true" /><span className="sf-eyebrow" data-reveal>YOUR NEXT “WHAT IF?” STARTS HERE</span><h2 id="sf-final-title" data-reveal style={at(1)}>Put your architecture<br /><span>to the test.</span></h2><p data-reveal style={at(2)}>Start with an idea. Leave with a better question.</p><Link href="/register" className="sf-button sf-magnetic" data-reveal style={at(3)}>Create your account <Arrow /></Link><p className="sf-existing" data-reveal style={at(4)}>Already exploring? <Link href="/login">Log in <Arrow diagonal /></Link></p><div className="sf-finale-lines" aria-hidden="true" /></section>

      <footer className="sf-public-footer">
        <div className="sf-titleblock" role="group" aria-label="Sheet information">
          <div><span>DRAWN BY</span><strong>STRESSFORGE</strong></div>
          <div><span>TYPE</span><strong>Architecture lab</strong></div>
          <div><span>SHEET</span><strong>01 / 01</strong></div>
          <div><span>NOTE</span><strong>Illustration, not a live simulation</strong></div>
        </div>
        <div className="sf-footer-row"><Link href="/" className="sf-footer-brand">STRESSFORGE.</Link><span>Draw. Stress. Understand.</span><a href="#sf-title">Back to top ↑</a></div>
      </footer>
      <LandingEffects />
    </div>
  );
}
