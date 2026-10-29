# STRESSFORGE: Claude Code entry point

The rules are shared with Codex and live in one place so they cannot drift:

@AGENTS.md

Project state and handoffs: [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md) and [docs/HANDOFF-LOG.md](docs/HANDOFF-LOG.md). Read both at the start of a session and update both at the end.

## Claude Code notes
- Use the dedicated Read/Edit/Grep/Glob tools for files and keep the in-app task list current for multi-step work.
- Before the first write to a new file, GateGuard may ask for facts (callers, no existing duplicate, data shape, the user's instruction). Answer them honestly and retry; do not disable it.
- Another agent may be editing the same working tree. After any "file changed on disk" notice, re-read before editing.
