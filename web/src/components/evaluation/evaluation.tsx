"use client";

import Link from "next/link";
import { notFound, usePathname } from "next/navigation";
import { Crumbs } from "@/components/shell/crumbs";
import {
  AI_GOALS,
  AI_DESIGN_TASKS,
  AI_GOAL_GUARD,
  AI_HOSTED,
  AI_RECORD,
  COMMANDS,
  EVAL,
  LOADS_SHOWN,
  NOT_PROVEN,
  TAB_LIST,
  bandRows,
  consistencySummary,
  fidelityText,
  gapText,
  oneServerText,
  pct,
  typicalCell,
} from "@/lib/evaluation";
import {
  CAL,
  CALIBRATION_STEPS,
  CALIBRATION_WHY,
  CAL_COMMANDS,
  NOT_SHOWN,
  TRUST,
  breakingText,
  differenceText,
  fitText,
  headline,
  machineText,
  ms1,
  msWhole,
  noteFor,
  rangeText,
  setupText,
  share,
  verdictWord,
  type CalConfig,
  type CalibrationData,
} from "@/lib/calibration";
import { NOT_FOUND_ROUTE, resolveRoute } from "@/lib/routes";

const STATUS_CLASS: Record<string, string> = { Measured: "ok", "Measured on one machine, one toy service": "warn", "Not yet measured": "warn", "Tested, no model passed": "warn" };

function Status({ text }: { text: string }) {
  return (
    <span className={"pill " + (STATUS_CLASS[text] ?? "")} data-testid="status">
      <span className="dot" aria-hidden="true" /> {text}
    </span>
  );
}

function Simulator() {
  const consistency = consistencySummary();
  return (
    <>
      <p className="lede">What has been checked about the model&apos;s own maths, with the numbers. These checks look inside the model. They do not show that it matches real servers; see the Calibration tab for that.</p>

      <section className="stack" aria-labelledby="ev-erlang" data-testid="erlang">
        <h2 className="h2" id="ev-erlang">
          1. The waiting-time formula against the exact textbook answer
        </h2>
        <p>
          When requests queue for a component, the model estimates the wait with a standard approximation. The exact answer for this kind of queue is known (the Erlang C formula), so the two can be compared directly. The comparison covers {EVAL.erlang.servers.length} server counts from {EVAL.erlang.servers[0]} to {EVAL.erlang.servers[EVAL.erlang.servers.length - 1]} and loads from 5% to 98% busy.
        </p>
        <p data-testid="one-server">{oneServerText()}</p>
        <p>With several servers the model is an approximation, and it overestimates small waits. How far off it is depends on how large the wait is:</p>
        <table className="table" data-testid="bands">
          <caption>Worst difference from the exact wait, by how large that wait is</caption>
          <thead>
            <tr>
              <th scope="col">When the exact wait is at least this share of one service time</th>
              <th scope="col">Points checked</th>
              <th scope="col">Worst error</th>
            </tr>
          </thead>
          <tbody>
            {bandRows().map((r) => (
              <tr key={r.share}>
                <th scope="row">{r.share}</th>
                <td>{r.points}</td>
                <td>{r.worst}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-testid="gap">{gapText()}</p>
        <p>
          In short: close to the exact answer where the wait is large enough to matter, and loose where the wait is tiny. The model was not changed to hide this; matching the exact formula would change every result and break the match with the original prototype.
        </p>

        <h3 className="h3">What it means for real components</h3>
        <p className="hint">Each cell shows the exact wait, then the model&apos;s wait, in milliseconds, at the load in the column heading. The number of parallel servers is what the model infers from each component&apos;s capacity and service time.</p>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="table" data-testid="typical">
            <caption>Exact wait / model wait for each component type (ms)</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Servers</th>
                <th scope="col">Service time</th>
                {LOADS_SHOWN.map((r) => (
                  <th scope="col" key={r}>
                    {pct(r)} busy
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVAL.erlang.typical.map((t) => (
                <tr key={t.type}>
                  <th scope="row">{t.label}</th>
                  <td>{t.servers}</td>
                  <td>{t.serviceMs} ms</td>
                  {LOADS_SHOWN.map((r) => {
                    const row = t.rows.find((x) => x.rho === r)!;
                    return <td key={r}>{typicalCell(row)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" aria-labelledby="ev-fidelity" data-testid="fidelity">
        <h2 className="h2" id="ev-fidelity">
          2. The engine against the original prototype
        </h2>
        <p data-testid="fidelity-text">{fidelityText()}</p>
        <p>This shows the engine in the app is a faithful copy of the original prototype&apos;s calculation. It does not show that the prototype&apos;s maths is correct.</p>
      </section>

      <section className="stack" aria-labelledby="ev-checks" data-testid="consistency">
        <h2 className="h2" id="ev-checks">
          3. Consistency checks on each shipped design
        </h2>
        <p data-testid="consistency-text">{consistency.text}</p>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="table">
            <caption>Each check, for each of the six example designs</caption>
            <thead>
              <tr>
                <th scope="col">Check</th>
                {EVAL.consistency[0].results.map((r) => (
                  <th scope="col" key={r.template}>
                    {r.template}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVAL.consistency.map((c) => (
                <tr key={c.id} data-testid="check-row" data-passed={c.passed}>
                  <th scope="row">{c.text}</th>
                  {c.results.map((r) => (
                    <td key={r.template}>{r.passed ? "Pass" : "FAIL"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel stack r2-pad" aria-labelledby="ev-not" data-testid="not-proven">
        <h2 className="h3" id="ev-not">
          What none of this proves
        </h2>
        <ul>
          {NOT_PROVEN.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="stack" aria-labelledby="ev-repro" data-testid="reproduce">
        <h2 className="h2" id="ev-repro">
          How to check this yourself
        </h2>
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {COMMANDS.map((c) => (
            <li key={c.command}>
              <code>{c.command}</code> <span className="muted">in {c.dir}</span>
              <br />
              <span className="small">{c.says}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function CalibrationTable({ c, label }: { c: CalConfig; label: string }) {
  return (
    <section className="stack" aria-labelledby={`ev-cal-${c.workers}`} data-testid={`calibration-table-${c.workers}`}>
      <h3 className="h3" id={`ev-cal-${c.workers}`}>
        {label}
      </h3>
      <p>{fitText(c)}</p>
      <p data-testid={`calibration-breaking-${c.workers}`}>{breakingText(c)}</p>
      <div className="table-scroll" style={{ overflowX: "auto" }}>
        <table className="table">
          <caption>
            p95 in milliseconds, {label.toLowerCase()}: measured (the range over {c.repeats} repeats) against the model
          </caption>
          <thead>
            <tr>
              <th scope="col">Load (share of capacity)</th>
              <th scope="col">Requests a second</th>
              <th scope="col">Measured p95</th>
              <th scope="col">Model p95</th>
              <th scope="col">Model against measured</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.level} data-testid="calibration-row" data-level={r.level} data-censored={r.censored} data-direction={r.direction ?? ""}>
                <th scope="row">{share(r.level)}</th>
                <td>{ms1(r.rps)}</td>
                <td>{rangeText(r)}</td>
                <td>{msWhole(r.modelP95)}</td>
                <td>{differenceText(r)}</td>
                <td>{noteFor(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Measured({ d }: { d: CalibrationData }) {
  const one = d.configs.find((c) => c.workers === 1);
  const four = d.configs.find((c) => c.workers === 4);
  return (
    <>
      <section className="panel stack r2-pad" aria-labelledby="ev-cal-head" data-testid="calibration-headline">
        <h2 className="h3" id="ev-cal-head">
          What it showed
        </h2>
        <p>{headline(d)}</p>
      </section>

      <section className="stack" aria-labelledby="ev-cal-setup" data-testid="calibration-setup">
        <h2 className="h2" id="ev-cal-setup">
          What was measured
        </h2>
        <p>{setupText(d)}</p>
        <p className="hint" data-testid="calibration-machine">
          {machineText(d)}
        </p>
      </section>

      <section className="stack" aria-labelledby="ev-cal-compare" data-testid="calibration-compare">
        <h2 className="h2" id="ev-cal-compare">
          The comparison with the model
        </h2>
        <p>Where the measured and model figures differ by more than the spread between repeats, the sign shows which is higher. Above the limit the measured latencies cover only requests that were answered within the timeout, so those rows are marked and are not like for like.</p>
        {one && <CalibrationTable c={one} label="One worker" />}
        {four && <CalibrationTable c={four} label="Four workers" />}
      </section>

      <section className="stack" aria-labelledby="ev-cal-expect" data-testid="calibration-expectations">
        <h2 className="h2" id="ev-cal-expect">
          What was expected, and whether it held
        </h2>
        <p>Four expectations were written down before any measurement. The result column uses the corrected capacity fit (see below); the last three columns show the same verdict under the original rules, with the paging rule dropped, and corrected.</p>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="table">
            <caption>The four expectations and their results</caption>
            <thead>
              <tr>
                <th scope="col">Expectation</th>
                <th scope="col">Result</th>
                <th scope="col">What it showed</th>
                <th scope="col">Original rules</th>
                <th scope="col">Paging rule dropped</th>
                <th scope="col">Corrected</th>
              </tr>
            </thead>
            <tbody>
              {d.expectations.map((e) => (
                <tr key={e.id} data-testid="expectation-row" data-id={e.id} data-held={String(e.held)}>
                  <th scope="row">
                    {e.id}. {e.text}
                  </th>
                  <td>{verdictWord(e.held)}</td>
                  <td>{e.evidence}</td>
                  <td>{verdictWord(e.byVariant.committed)}</td>
                  <td>{verdictWord(e.byVariant.noExclusions)}</td>
                  <td>{verdictWord(e.byVariant.corrected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" aria-labelledby="ev-cal-trust" data-testid="calibration-trust">
        <h2 className="h2" id="ev-cal-trust">
          How much to trust this
        </h2>
        <ul>
          {TRUST(d).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="panel stack r2-pad" aria-labelledby="ev-cal-not" data-testid="calibration-not-shown">
        <h2 className="h3" id="ev-cal-not">
          What this does not show
        </h2>
        <p>{NOT_SHOWN}</p>
      </section>
    </>
  );
}

function Calibration() {
  return (
    <>
      <p className="lede" data-testid="calibration-why">
        {CAL ? CALIBRATION_WHY : "Calibration means measuring a real service as load grows and checking how closely the model predicts those measurements. There is no comparison yet, so this page shows no figure."}
      </p>
      {CAL ? (
        <Measured d={CAL} />
      ) : (
        <section className="panel stack r2-pad" aria-labelledby="ev-result" data-testid="calibration-result">
          <h2 className="h3" id="ev-result">
            Result
          </h2>
          <p>There is no result yet, so no table or figure is shown here.</p>
        </section>
      )}
      <section className="stack" aria-labelledby="ev-method" data-testid="method">
        <h2 className="h2" id="ev-method">
          How it was measured
        </h2>
        <ol className="stack">
          {CALIBRATION_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <section className="stack" aria-labelledby="ev-cal-repro" data-testid="reproduce-cal">
        <h2 className="h2" id="ev-cal-repro">
          How to check or repeat it
        </h2>
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {CAL_COMMANDS.map((c) => (
            <li key={c.command}>
              <code>{c.command}</code> <span className="muted">in {c.dir}</span>
              <br />
              <span className="small">{c.says}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="hint">
        What has been checked about the model&apos;s own maths is on the <Link href="/evaluation/simulator">Simulator tab</Link>. The limits of the model are described on <Link href="/how-it-works">How it works</Link>.
      </p>
    </>
  );
}

function Ai() {
  return (
    <>
      <p className="lede" data-testid="ai-lede">
        Four tests of AI were run, each with a pass mark fixed before it. None passed, so every AI feature is switched off by default. The experimental goal box can be enabled explicitly for a demo; that does not change its NO-GO verdict. The fix suggestions and the load ladder use the simulation model, not AI.
      </p>
      <section className="stack" aria-labelledby="ev-m10" data-testid="m10">
        <h2 className="h2" id="ev-m10">
          Small models run locally on this laptop ({AI_RECORD.date})
        </h2>
        <p>{AI_RECORD.setup} Each was asked to explain eight kinds of result, such as healthy, failed and missing inputs.</p>
        <table className="table">
          <caption>Results of the eight explanation cases</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Replies with the required shape</th>
              <th scope="col">Replies that passed every check</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {AI_RECORD.models.map((m) => (
              <tr key={m.name} data-testid="m10-row">
                <th scope="row">{m.name}</th>
                <td>{m.shape}</td>
                <td>{m.passed}</td>
                <td>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{AI_RECORD.resource}</p>
        <p>{AI_RECORD.verdict}</p>
      </section>
      <section className="stack" aria-labelledby="ev-hx" data-testid="hosted-explain">
        <h2 className="h2" id="ev-hx">
          The hosted model explaining a result ({AI_HOSTED.explain.dates})
        </h2>
        <p>
          The model was {AI_HOSTED.model}, {AI_HOSTED.where}. It was asked to explain {AI_HOSTED.explain.requests} test results, and an answer counted only if it passed the app&apos;s automatic checks. The bar was {AI_HOSTED.explain.bar} of {AI_HOSTED.explain.requests}.
        </p>
        <p data-testid="hosted-explain-result">
          <b>
            Accepted: {AI_HOSTED.explain.accepted} of {AI_HOSTED.explain.requests}. Not good enough.
          </b>
        </p>
        <p>{AI_HOSTED.explain.reason}</p>
        <p>{AI_HOSTED.explain.firstRun}</p>
        <p>{AI_HOSTED.explain.after}</p>
      </section>
      <section className="stack" aria-labelledby="ev-hd" data-testid="hosted-describe">
        <h2 className="h2" id="ev-hd">
          The hosted model describing a design ({AI_HOSTED.describe.date})
        </h2>
        <p>
          The same model was given {AI_HOSTED.describe.requests} plain-language descriptions of a system and asked to draft a design. Three of them hid an instruction inside the description. The bar was {AI_HOSTED.describe.bar} of {AI_HOSTED.describe.requests} accepted, and none of the hidden instructions followed.
        </p>
        <table className="table" data-testid="hosted-describe-table">
          <caption>Results of the {AI_HOSTED.describe.requests} descriptions</caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">Result</th>
              <th scope="col">Bar</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Drafts accepted by the checks</th>
              <td>
                {AI_HOSTED.describe.accepted} of {AI_HOSTED.describe.requests}
              </td>
              <td>{AI_HOSTED.describe.bar}</td>
            </tr>
            <tr>
              <th scope="row">Hidden instructions obeyed</th>
              <td>
                {AI_HOSTED.describe.injectionsObeyed} of {AI_HOSTED.describe.injectionsOf}
              </td>
              <td>{AI_HOSTED.describe.injectionBar}</td>
            </tr>
          </tbody>
        </table>
        <p data-testid="hosted-describe-result">
          <b>Not good enough.</b> {AI_HOSTED.describe.refusedText}
        </p>
        <p>{AI_HOSTED.describe.injectionText}</p>
        <p>{AI_HOSTED.describe.baselineText}</p>
      </section>
      <section className="stack" aria-labelledby="ev-hg" data-testid="hosted-goal">
        <h2 className="h2" id="ev-hg">
          The hosted model reading a goal for the fix suggestions ({AI_GOALS.date})
        </h2>
        <p>{AI_GOALS.intro}</p>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="table" data-testid="hosted-goal-table" style={{ minWidth: 680 }}>
            <caption>
              Results of the {AI_GOALS.goals} goals: each count is how many were exactly right
            </caption>
            <thead>
              <tr>
                <th scope="col">Reading</th>
                <th scope="col">
                  Ordinary (bar {AI_GOALS.bars.ordinary} of {AI_GOALS.ordinaryTotal})
                </th>
                <th scope="col">
                  Ask nothing (bar {AI_GOALS.bars.neutral} of {AI_GOALS.neutralTotal})
                </th>
                <th scope="col">
                  Hidden orders (bar {AI_GOALS.bars.injection} of {AI_GOALS.injectionTotal})
                </th>
                <th scope="col" style={{ whiteSpace: "nowrap" }}>
                  Verdict
                </th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {AI_GOALS.rows.map((r) => (
                <tr key={r.reading} data-testid="hosted-goal-row">
                  <th scope="row">{r.reading}</th>
                  <td>{r.ordinary}</td>
                  <td>{r.neutral}</td>
                  <td>{r.injection}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.verdict}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p data-testid="hosted-goal-cap">
          <b>What went wrong in the second run.</b> {AI_GOALS.capText}
        </p>
        <p data-testid="hosted-goal-orders">
          <b>What the hidden orders did.</b> {AI_GOALS.ordersText}
        </p>
        <p data-testid="hosted-goal-result">
          <b>Result.</b> {AI_GOALS.resultText}
        </p>
      </section>
      <section className="stack" aria-labelledby="ev-guard" data-testid="hosted-goal-guard">
        <h2 className="h2" id="ev-guard">The goal box with a grounding guard ({AI_GOAL_GUARD.date})</h2>
        <p>{AI_GOAL_GUARD.intro}</p>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 680 }}>
            <caption>{AI_GOAL_GUARD.goals} new goals: each count is how many were exactly right</caption>
            <thead>
              <tr>
                <th scope="col">Reading</th>
                <th scope="col">Ordinary (bar {AI_GOAL_GUARD.bars.ordinary} of {AI_GOAL_GUARD.ordinaryTotal})</th>
                <th scope="col">Neutral (bar {AI_GOAL_GUARD.bars.neutral} of {AI_GOAL_GUARD.neutralTotal})</th>
                <th scope="col">Hidden instructions (bar {AI_GOAL_GUARD.bars.injection} of {AI_GOAL_GUARD.injectionTotal})</th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {AI_GOAL_GUARD.rows.map(r => (
                <tr key={r.reading} data-testid="hosted-goal-guard-row">
                  <th scope="row">{r.reading}</th>
                  <td>{r.ordinary}</td>
                  <td>{r.neutral}</td>
                  <td>{r.injection}</td>
                  <td>{r.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p data-testid="hosted-goal-guard-failure"><b>The remaining failure.</b> {AI_GOAL_GUARD.failure}</p>
        <p data-testid="hosted-goal-guard-limits"><b>Limits.</b> {AI_GOAL_GUARD.limits}</p>
        <p data-testid="hosted-goal-guard-result"><b>Result.</b> {AI_GOAL_GUARD.result}</p>
      </section>
      <section className="stack" aria-labelledby="ev-tasks" data-testid="ai-design-tasks">
        <h2 className="h2" id="ev-tasks">
          The three design tasks, rebuilt ({AI_DESIGN_TASKS.date})
        </h2>
        <p>{AI_DESIGN_TASKS.intro}</p>
        <section className="stack" data-testid="ai-task-goalbox">
          <h3 className="h3">{AI_DESIGN_TASKS.goalBox.title}</h3>
          <p>{AI_DESIGN_TASKS.goalBox.what}</p>
          <div className="table-scroll" style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 640 }}>
              <caption>{AI_DESIGN_TASKS.goalBox.goals} development goals: each count is how many were as expected</caption>
              <thead>
                <tr>
                  <th scope="col">Reading</th>
                  <th scope="col">All</th>
                  <th scope="col">Ordinary</th>
                  <th scope="col">With an order or code</th>
                  <th scope="col">Ambiguous</th>
                  <th scope="col">Nothing to act on</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["gpt-oss-120b plus cleaning and checks", AI_DESIGN_TASKS.goalBox.model],
                    ["Keyword rules plus the same cleaning and checks", AI_DESIGN_TASKS.goalBox.rules],
                  ] as const
                ).map(([label, r]) => (
                  <tr key={label} data-testid="ai-task-goalbox-row">
                    <th scope="row">{label}</th>
                    <td>
                      {r.correct} of {AI_DESIGN_TASKS.goalBox.goals}
                    </td>
                    <td>
                      {r.ordinary[0]} of {r.ordinary[1]}
                    </td>
                    <td>
                      {r.mixed[0]} of {r.mixed[1]}
                    </td>
                    <td>
                      {r.ambiguous[0]} of {r.ambiguous[1]}
                    </td>
                    <td>
                      {r.neutral[0]} of {r.neutral[1]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p data-testid="ai-task-goalbox-note">{AI_DESIGN_TASKS.goalBox.note}</p>
        </section>
        <section className="stack" data-testid="ai-task-describe">
          <h3 className="h3">{AI_DESIGN_TASKS.describe.title}</h3>
          <p>{AI_DESIGN_TASKS.describe.what}</p>
          <p>{AI_DESIGN_TASKS.describe.history}</p>
          <ul>
            <li data-testid="ai-task-describe-first">
              First batch of {AI_DESIGN_TASKS.describe.descriptions} development descriptions: {AI_DESIGN_TASKS.describe.first.correct} of {AI_DESIGN_TASKS.describe.descriptions} (ordinary {AI_DESIGN_TASKS.describe.first.ordinary[0]} of{" "}
              {AI_DESIGN_TASKS.describe.first.ordinary[1]}, vague {AI_DESIGN_TASKS.describe.first.vague[0]} of {AI_DESIGN_TASKS.describe.first.vague[1]}, off-topic {AI_DESIGN_TASKS.describe.first.offTopic[0]} of{" "}
              {AI_DESIGN_TASKS.describe.first.offTopic[1]}, with an order {AI_DESIGN_TASKS.describe.first.injection[0]} of {AI_DESIGN_TASKS.describe.first.injection[1]}).
            </li>
            <li data-testid="ai-task-describe-rules">
              Keyword rules on the same descriptions: {AI_DESIGN_TASKS.describe.rules.correct} of {AI_DESIGN_TASKS.describe.descriptions}.
            </li>
            <li data-testid="ai-task-describe-second">
              Second batch, after fixes: {AI_DESIGN_TASKS.describe.second.correct} of {AI_DESIGN_TASKS.describe.descriptions}.
            </li>
          </ul>
          <p data-testid="ai-task-describe-note">{AI_DESIGN_TASKS.describe.note}</p>
        </section>
        <section className="stack" data-testid="ai-task-whatif">
          <h3 className="h3">{AI_DESIGN_TASKS.whatIf.title}</h3>
          <p>{AI_DESIGN_TASKS.whatIf.what}</p>
          <p data-testid="ai-task-whatif-note">{AI_DESIGN_TASKS.whatIf.note}</p>
        </section>
        <section className="panel stack r2-pad" data-testid="ai-task-notshown">
          <h3 className="h3">What this does not show</h3>
          <ul>
            {AI_DESIGN_TASKS.notShown.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </section>
      <section className="stack" aria-labelledby="ev-notai" data-testid="not-ai">
        <h2 className="h2" id="ev-notai">
          What does not use AI
        </h2>
        <p>{AI_HOSTED.notAi}</p>
      </section>
      <section className="panel stack r2-pad" aria-labelledby="ev-ainot" data-testid="ai-not-shown">
        <h2 className="h3" id="ev-ainot">
          What this does not show
        </h2>
        <ul>
          {AI_HOSTED.notShown.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
      <section className="stack" aria-labelledby="ev-later" data-testid="ai-later">
        <h2 className="h2" id="ev-later">
          What a future evaluation would measure
        </h2>
        <ul>
          {AI_RECORD.later.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="hint">No comparison with a rule-based explanation has been made, so no such numbers are shown.</p>
      </section>
    </>
  );
}

export function EvaluationPage() {
  const pathname = usePathname();
  const resolved = resolveRoute(pathname);
  if (resolved.route === NOT_FOUND_ROUTE) notFound();
  const tab = resolved.params.tab as "simulator" | "calibration" | "ai";
  const info = TAB_LIST.find((t) => t.id === tab)!;
  return (
    <div className="page narrow stack lg" data-testid="evaluation-page">
      <Crumbs resolved={resolved} />
      <div className="stack">
        <h1 className="h1">Evaluation</h1>
        <nav aria-label="Evaluation sections">
          <ul className="row" style={{ flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0 }}>
            {TAB_LIST.map((t) => (
              <li key={t.id}>
                <Link className={"chip" + (t.id === tab ? " is-on" : "")} href={`/evaluation/${t.id}`} aria-current={t.id === tab ? "page" : undefined}>
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <h2 className="h2" data-testid="tab-heading">
            {info.label}
          </h2>
          <Status text={info.status} />
        </div>
      </div>
      {tab === "simulator" && <Simulator />}
      {tab === "calibration" && <Calibration />}
      {tab === "ai" && <Ai />}
    </div>
  );
}
