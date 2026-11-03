# StressForge demo script (about 8 minutes)

A walkthrough that shows what works, says plainly what is a model estimate, and presents the AI work as a tested result, not a feature.
**Dry run done on 2026-11-03** (sections 2 to 4 and the AI tab were clicked through in a browser on the audit stack; the numbers below are what it showed). Your own run may differ slightly, so do one more dry run on your machine.

## The case to use (tested)
Template **Classic three-tier web app**, then in **Traffic** set **Average requests per second to 2000** and save. Run test:
- **Fails:** p95 1,842.07 ms against a 300 ms target, errors 40.918%, **App servers** at 167% utilization.
- **Suggest fixes** offers three: "Use a bigger size" and "Double the copies" (3 to 6) both turn it into **strained** (p95 41.26 ms, errors 0%); "Add one more copy" (3 to 4) still fails but less badly (errors 21.176%).
- **Apply to my draft** on the second one, then **Run test**: the new run is **strained, p95 41.26 ms, errors 0%, App servers 83.333%**, exactly what the card promised.
- **Show 2×, 5× and 10× load** on that run: now 2,000 rps strained; 4,000 fails (40.847% errors); 10,000 and 20,000 fail. Headline: "Already strained at the recorded load."
- At the template's own 1,200 rps it is also strained or failing, and at 4,000 rps no fix rescues it (best fix still fails, errors 70.459% to 40.847%). 2,000 is the useful setting because a fix visibly changes the verdict.

## Before you start (5 minutes, the day before and again just before)
1. Start PostgreSQL, Redis, the API and the web app. Docker and the servers were down after the last reboot.
2. Sign in as a normal user. Create the three-tier design at 2,000 rps (see "The case to use"). Leave it **unfixed** so you can apply the fix live; keep a second copy ready in case you apply it by accident.
3. Run a test once so the Results tab already has a failing run, and check that the Suggested fixes panel and the load ladder both appear. The dev server is slow on the first load of each page; open each page once beforehand.
4. Keep `AI_ENABLED` unset or false. Do not turn AI on for the demo. The page and the panel should say the same thing you say.
5. Open the Evaluation page once so the first load is not slow on stage.

## 1. What it is (30 seconds)
"StressForge lets you draw an architecture, set traffic, and see how it behaves under load: where it queues, where it fails, and what limits it. The numbers come from a queueing model, not from real servers. I will say that again where it matters."

## 2. Draw and run (1.5 minutes)
- New design, start from a template, open the editor, point out components and connections.
- Set the traffic and run the test. Show the Results tab: verdict (passes, is strained, fails), p95, error rate, and the component the model says is limiting.
- Say: "The verdict is judged against the targets set on the design."

## 3. Verified fix suggestions (2 minutes) — no AI
- On the **failing** run, open the **Suggested fixes** panel and ask for fixes.
- Say what it does: "It tries a few ordinary edits at the limiting component: one more copy, double the copies, a bigger size, and for a database a cache or a read replica. Each edited design is run through the same model, and only fixes that make the design better and nothing worse are shown."
- Point at one card: the before and after p95 and error rate, the assumption it states, and the tag "Verified by the model, no AI".
- Click **Apply to my draft**. Say: "It is one change to my draft." **Note from the dry run:** the editor autosaves, so the applied fix was saved as a new revision straight away (the editor showed "Saved · revision 9" without my pressing Save), and the old result then shows "This result is not for the saved design. Save, then run the test again to get fixes." Do not say "nothing is saved"; say "the old result is now marked stale, so I run the test again". Click **Run test**, and the new run matches the card: that match is the point. It is calculated, not guessed.
- If the design still fails, say so: "It would still fail, but less badly. The panel says that plainly."

## 4. Where does it break? (1.5 minutes) — no AI
- On a completed run, open **Where does it break?** and choose **Show 2×, 5× and 10× load**.
- Read the one-sentence headline, for example "Passes up to 2× load, then is strained at 5× and fails at 10×", then show the table: request rate, result, p95, errors, limiting component.
- Say: "Only the average request rate changes; shape, bursts and targets stay as saved. A rate above the model's limit is shown as beyond the limit, never guessed."

## 5. Evaluation page: how far to trust it (2 minutes)
- **Simulator tab:** the model's waiting-time formula against the exact textbook answer, and that the engine reproduces the original prototype. Read "What none of this proves".
- **Calibration tab:** the first comparison with a real running service. Say exactly what the page says: one simple test service, one laptop, the model was cautious, and this is not a validation of the model for real applications.
- **AI tab (status: "Tested, no model passed"):**
  - Local models (28 October): shape right in 1 of 8 and 8 of 8, none passing every check.
  - Hosted model `openai/gpt-oss-20b`, explaining results: **0 of 18 accepted** against a bar of 17, set before the run. The first run was invalid because of our own test setup and is disclosed, not counted.
  - Hosted model, describe-to-design: **13 of 20** accepted against 18, and it **obeyed 3 of 3 hidden instructions** against a bar of zero.
  - Say: "We set the pass marks first, the model did not meet them, and we kept every AI feature switched off. That is a measured result about this model with these prompts, not a claim that AI cannot do it."

## 6. Close (30 seconds)
"The features that carry this project, the simulation, verified fixes and the load ladder, are calculated and checked against fresh runs. The AI work is built, guarded and tested, and it is off because it did not meet the bar we set. The Evaluation page shows all of that, including what we did not prove."

## Likely questions, and honest answers
- **Is the AI working?** The integration works and was run live. The two features we tested did not meet their pass marks, so they are off.
- **Why Groq and that model?** Hosted, free tier, strict JSON output. Only `gpt-oss-20b` was tested. `gpt-oss-120b` was planned and not run.
- **Could it pass with another try?** Possibly. A second run would need rules declared in advance, and the hidden-instruction problem would need a model or prompt that resists it. Not tried.
- **Are the numbers real?** They are model estimates. One small comparison with a real service exists (Calibration tab). None with a real application.
- **What stops AI from being turned on by accident?** It is off by default in code, and each task also needs to be listed in a separate setting.

## If something goes wrong on the day
- **Fixes or ladder say the calculation service is busy:** wait a few seconds and ask again; the page tells you.
- **A result says it is not for the saved design:** save, then run the test again.
- **No failing run available:** use a template at higher traffic and run it again.
