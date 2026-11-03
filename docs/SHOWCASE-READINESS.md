# STRESSFORGE — showcase and submission readiness

**Verified:** 3 November 2026. **Branch:** `codex/phase2-contracts`. Technical rehearsal baseline: `68dd94c`.

**Student:** Mubassir Ebne Mohsin · **ID:** 22-49838-3

**Institution:** American International University-Bangladesh · Computer Science & Engineering

**Course:** CSC4161 — Advanced Programming in Web Technology, Section D

**Faculty:** Sultanul Arifeen Hamim · **Semester:** Fall 2026–2027

## What to say first

“StressForge lets me draw a system architecture, set its traffic and estimate where it becomes strained or fails. I can try a suggested fix, save it and compare the results. The numbers come from a mathematical simulator, not a load test against real servers. The optional AI goal reader is experimental; its measured limitations are shown on the Evaluation page.”

## Readiness and remaining decisions

| Item | Status |
| --- | --- |
| Core same-account presentation flow | Verified: 9 steps, from registration through report/share and logout |
| All four roles | Verified using 17 real-browser journeys and disposable audit accounts |
| Developer system states | Verified: 10 states and recovery in each of 4 width/theme projects |
| Local development migrations | Read-only check: all 16 source migrations recorded as applied |
| Optional live AI backend preflight | READY in one invocation, all 3 requests as expected; not a quality-gate pass |
| User's own timed presentation rehearsal | Still to do on the actual showcase setup |
| Faculty acceptance of experimental AI as the central-AI requirement | Not confirmed; user/faculty decision |
| AI release quality | NO-GO; all AI off by default; goal box demo only |

Evidence, initial harness correction and limitations: [readiness audit](audit/showcase-2026-11-03/README.md). Current status: [PROJECT-STATE](PROJECT-STATE.md). Complete presentation narration and fallback: [DEMO-SCRIPT](DEMO-SCRIPT.md).

## Start locally in PowerShell

Use Node 22 and each folder's pinned pnpm version. Dependencies and local environment setup are documented in the [root README](../README.md). Never paste the Groq key into the browser or a report. Do not start a second backend on port 5001.

Backend terminal:

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate'
docker compose -f docker-compose.dev.yml up -d --wait
pnpm migration:run
pnpm start:dev
```

Web terminal:

```powershell
Set-Location -LiteralPath 'C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\web'
pnpm dev
```

Open [the public entry page](http://localhost:3000), [API health](http://localhost:5001/v1/health) and [Swagger](http://localhost:5001/docs). The audit ports in the evidence are different and are not left running.

Optional AI demo: stop the ordinary backend with Ctrl+C in its terminal, then run the commands below from the backend folder. The first makes **three real Groq requests**; the second starts the explicitly enabled experimental goal box. Use the existing free account/settings. No new key or paid plan is needed. If NOT READY, use the manual controls; do not hide the failure or keep retrying during the presentation.

```powershell
pnpm demo:ai:check
pnpm demo:ai
```

## Eight-minute presentation order

1. **Purpose and model limits — 30 seconds.** Show the public landing page, enter the product.
2. **Design and traffic — 90 seconds.** Choose **Classic three-tier web app**. Set average traffic to **2,000 rps**, leaving the template's other settings unchanged. Save and Run.
3. **Fix and compare — 2 minutes.** Explain the failing result. Ask for verified fixes, apply **Double the copies**, open the editor, Save, then Run. In History compare the saved pre-fix and post-fix revisions at the same traffic/model version.
4. **Load ladder — 1 minute.** Show 2x, 5x and 10x load. Only average request rate changes; these remain model estimates.
5. **Report and share — 1 minute.** Open Report and Print/save as PDF. Create a read-only link and open it in a private browser window. Treat that link as a secret; do not publish it with the report.
6. **Evaluation and optional AI — 90 seconds.** Show simulator evidence and the guard's NO-GO result. If deliberately enabled, show the goal box only as editable assistance. Say that READY and a successful example do not mean it passed its quality test.
7. **Close — 30 seconds.** Explain what is built, what was measured and what remains experimental.

Observed case on 3 November: before the fix, **fails**, p95 **1,842.07 ms**, modeled errors **40.918%**; after doubling app copies, **strained**, p95 **41.26 ms**, modeled errors **0%**. Strained is the honest verdict at 83.333% app utilization even though the latency/error targets are met. Do not promise these numbers for a different template or traffic profile.

## Four-role demonstration cards

| Role | What to demonstrate |
| --- | --- |
| User | Own design → traffic → run → fixes → compare → report/share; attempt a published challenge |
| Instructor | Create/publish a challenge, inspect its learner submissions and send feedback |
| Reviewer | Open a specifically granted frozen revision and comment; owner revocation ends access |
| Admin | Find an account, grant/remove a role with confirmation, inspect the audit entry, suspend/restore |

Use prepared demonstration accounts, not real student records. Browser verification used disposable accounts, not your personal role accounts; their credentials were neither inspected nor saved. A normal account must be denied privileged tools. Do not grant Admin merely to make a demo convenient.

## Submission materials

- [Living project report](STRESSFORGE-PROGRESS-REPORT.md), especially sections 36–37 for current evidence and limitations.
- [Architecture](ARCHITECTURE.md), [role scope](ROLES-SCOPE.md), [simulation model](SIMULATION-MODEL.md).
- [AI Copilot scope/results](AI-COPILOT-SCOPE.md) and unchanged pre-registered gate rubrics.
- [Calibration findings](CALIBRATION-FINDINGS.md): one machine and one toy service, not validation for real infrastructure.
- [Setup/run/test commands](../README.md) and [eight-minute script](DEMO-SCRIPT.md).
- Fresh [Report screenshot](audit/showcase-2026-11-03/report-light.png), [Evaluation screenshot](audit/showcase-2026-11-03/guard-evaluation-light.png) and [readiness evidence](audit/showcase-2026-11-03/README.md).

Do not include `.env`, passwords, bearer tokens, Groq keys, private share links, audit accounts or untracked historical drafts in a submission archive. This checklist is a preparation package, not a claim that faculty acceptance, a personal rehearsal, an archive/PDF export or final submission has already happened.

## Next decision

Confirm the central-AI requirement with the faculty. If the disclosed experimental goal box is accepted, finish the personal rehearsal and submission. If more reliable AI is required, approve a separate improvement scope with new unseen goals and fixed pass marks **before** any new model run. Do not tune a pass mark after seeing a result.
