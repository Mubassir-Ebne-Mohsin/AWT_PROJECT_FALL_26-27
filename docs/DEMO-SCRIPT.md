# StressForge demo script (about 8 minutes)

A walkthrough that shows what works, says plainly what is a model estimate, and presents the AI work as a tested result, not a feature.
Everything below is taken from the recorded results and the code. **It has not been rehearsed end to end by me**, so do one dry run first (see "Before you start").

## Before you start (5 minutes, the day before and again just before)
1. Start PostgreSQL, Redis, the API and the web app. Docker and the servers were down after the last reboot.
2. Sign in as a normal user. Have one saved design that **fails** a test run at heavy load (a template at about 3x to 8x its default rate works; the three-tier template fails at heavy load). Have one that **passes** with room to spare.
3. Run a test once on each so the results are already on the Results tab. Check that the Suggested fixes panel and the load ladder both appear.
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
- Click **Apply to my draft**. Say: "Nothing is saved until I save. It is one undoable change in the editor." Save, run again, and compare. The figure on the card should match the new run. That match is the point: it is calculated, not guessed.
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
