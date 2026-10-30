# Public landing page

Implemented 2026-10-28. Route: `/`; existing `/login`, `/register` and protected-route return-to flow retained.

## Design contract

The public visitor should understand immediately that StressForge is an architecture drawing and mathematical simulation lab for students/developers, then enter through registration or login. The persistent login entry must remain accessible without completing the story.

[Design reference](../DESIGN.md): user-supplied Vite specimen guidance informed dark midnight surfaces, violet accents, geometric heading hierarchy, generous spacing and fine technical rules. Existing project fonts are reused; no assets, endorsements or proprietary fonts copied. The external Inspo screenshot page was unavailable through the web reader; the supplied extraction and accessible Vite page informed the interpretation.

Story: connected architecture → hidden dependency problem → exploded clients/routing/compute/data → inspect model outputs → revise and rerun → create account. Distinguish illustration from simulation and current scripted mock from planned real AI. No unauthenticated simulator, production guarantee, AI inference or expanded-role feature is claimed.

Primary surfaces:
- `web/src/components/landing/landing-page.tsx`: server-rendered copy, navigation and calls to action.
- `web/src/components/landing/architecture-specimen.tsx`: lightweight custom SVG and reversible scroll mapping.
- `web/src/styles/landing.css`: scoped public visual system, responsive/reduced-motion rules.
- `web/src/components/shell/app-shell.tsx`: public shell variant; public content bypasses the search-param auth boundary and remains visible during a stale-session API outage. Protected-route gating remains intact.
- `web/tests/browser/landing.spec.ts`: focused browser acceptance without database mutations.

## Motion and fallback

The main scroll container retains native wheel/touch/keyboard scrolling. A sticky scene separates layers using smoothstep interpolation, holds the exploded view, then reassembles it. Scroll position determines the current transform directly, so reversing or skipping ahead does not accumulate state. Work is coalesced in requestAnimationFrame; no per-frame React rendering, WebGL, large assets or extra runtime dependency.

Text stays readable independently of the animation. Narrow phones use an HTML component key rather than tiny SVG annotations. At reduced motion the story is nonsticky, the specimen is statically exploded and anchor scrolling is immediate. Without JavaScript, all narrative, illustration and auth links remain server-rendered; animated choreography is intentionally unavailable.

## Verification and limits

See [landing audit evidence](audit/landing/evidence.json) and [living report](STRESSFORGE-PROGRESS-REPORT.md), section23, for final results. Screenshots and measurements live in `docs/audit/landing`, separate from historical milestone evidence.

Manual preview: start the web app using the root README commands and visit `/`. The isolated review server may use another port; it requires no backend for the public story. Authentication itself still requires the existing API.

This change does not rerun the entire authenticated canvas/simulation regression or certify screen-reader/device performance. Backend, database, simulator and authentication service code are unchanged. No package/lockfile changes.

## Lighting/motion follow-up

The requested polish adds soft specimen/final-CTA atmosphere, button hover/focus lighting, staggered hero entrance, a short settling motion and traffic pulses. Automatic animation finishes within4.8seconds and is disabled for reduced motion. The signature scroll sequence remains position-driven. See audit/landing/effects.json and the corresponding effects screenshots.

## Blueprint redesign (2026-10-30)

Requested by the user: a drafting-sheet look in the manner of an engineering blueprint, the login page's colours, smoother and glowier motion, and more interaction, while keeping the layered architecture graphic.

**Look.** Dark blue-black paper with a two-scale grid (24px and 120px), margin rulers, hairline modules, mono section tags ("SEC 01"), dimension-tick stats and a title-block footer. Colours are the login screen's dark palette: base `#0B0F15`, surface `#121821`, text `#E6EAF0`, accent `#7D95FF` (soft `#19223F`, line `#394A92`), green `#36C384` and amber `#EFB03A`, plus a cyan `#5FB0D9` for drawing labels. The four layers are blue (clients), cyan (routing), green (compute) and amber (data). Only real product facts appear as numbers (12 component types, 6 starter templates, a p95 output); nothing is invented. Readable text is at least 11px.

**Graphic.** Same geometry and the same deterministic scroll mapping. `--separation` is always the exact target. Smoothing is visual only: each plate has an inner group offset by `--delta` (eased value minus target) which decays to exactly zero, so motion never steps and nothing drifts. The hero figure opens under the pointer, tilts toward it and shows the layer under the cursor in a caption; layers can be hovered, focused (keyboard) or tapped, and Enter or a tap pins one.

**Interaction** (all in `landing-effects.tsx`, fine pointers only, never under reduced motion): a cursor lamp that brightens the grid, a plotter crosshair with live coordinates over the hero, magnetic buttons, reveal-on-scroll with stagger, a reading-progress hairline in the header, an active-section nav underline, and dimming of inactive story steps.

**Glow.** Breathing plate edges, travelling traffic pulses with a wide glow stroke, pulsing node dots, a slow halo behind the figure and the finale, and a gentle text glow on the accent words. Infinite animations run only while the figure is on screen.

**Safety.** No JavaScript: every section is visible and every link works (reveals arm only once the script runs). Reduced motion: no glides, tilt, lamp, crosshair or hidden reveal states, and anchors scroll instantly. Touch: no hover machinery; the caption says "Tap a layer".

**Tests.** `landing.spec.ts` is unchanged and still passes. `landing-fx.spec.ts` covers layer inspect, keyboard pin, hover-open and tilt, the glide offset, reveals, progress and nav, lamp, crosshair and magnetic buttons, reduced motion and touch. Nine mutation checks each made a test fail.

**Not verified.** Frame pacing was measured on a dev server in headless Chrome on a memory-limited laptop, not on a production build or a real GPU. Idle cost is zero long tasks. Screen-reader behaviour and real-device performance were not tested.

## A second, different figure: the pressure core (2026-10-30)

The story section used the same isometric layer stack as the hero, which read as repetition. The hero keeps the stack; the story now has its own illustration, `pressure-core.tsx`.

**What it is.** A radial, radar-style schematic. Clients sit on the outer ring, then routing, then compute, with the shared database as a core at the centre. Requests (twelve spokes, three packets each) spiral inward. A radar sweep rotates over a counter-rotating degree dial, rings carry slow orbiting nodes and utilisation arcs, and heat ripples radiate from the core. It tells the section's story as you scroll: the rings draw in and assemble, then load builds and the core heats from amber toward red, then app replicas multiply on the compute ring while the core stays hot ("more replicas still depend on the same database"). A phase tag, and relative LOAD and HEAT bars (no invented numbers), follow along.

**Interaction.** Hover a ring to inspect it (the others dim and the caption names it); press and hold the core to stress it (load and heat surge and recover on release); tilt follows the pointer. Touch: tap a ring, press and hold the core.

**Contract with the existing test.** The figure keeps the page's scroll contract: a `.sf-specimen--scroll` figure, `--separation` as the exact scroll-driven target (smoothstep up, hold, close), `data-phase`, and `.sf-plate--N` groups whose transform follows `--separation` (here each ring scales about the centre, so the system opens like an orrery and closes again). `landing.spec.ts` is unchanged and passes. Smoothing stays visual only: the eased load, heat, replicas and a per-ring scale ratio glide, while the plate transforms are exact. Shared hooks (`landing-hooks.ts`) give both figures the same pointer tilt and on-screen-only animation.

**Fallbacks.** No JavaScript: the figure shows a finished default state. Reduced motion: a still, finished diagram (no rays, sweep, ripples or rotation). Mobile: the HUD and callouts are replaced by the HTML layer key.

**Tests.** `landing-fx.spec.ts` gained four tests (the figure is genuinely different from the hero; the scroll narrative and its reversal; ring inspection and hold-to-stress; the reduced-motion still). Nine more mutation checks each made a test fail, including one that breaks the existing contract test.

**Measured, not guaranteed.** With the figure on screen and every animation running, idle frames were stable (no long tasks, worst frame about 15 ms). While scrolling, the figure adds roughly 1.3 percentage points of frames over 20 ms in this environment (dev server, headless Chrome, memory-limited laptop); most scroll hitching comes from the page and machine as a whole. The rotating rings are its largest single cost. Not tested: real GPUs, other browsers, screen readers.
