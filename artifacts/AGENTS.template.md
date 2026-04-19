# QD Workflow

Use `using-qd` first in this repo unless you are resuming an already approved handoff.

## Startup

1. Read this file at session start and again after any context compaction.
2. If `._qd/onboarding.json` is missing or outdated, stop and run `using-qd` before continuing.
3. If `.codex/status.mjs` exists, run `node .codex/status.mjs --json` as the first quick scout step.
4. If `._qd/HANDOFF.json` exists, do not auto-resume. Surface the saved state and wait for user confirmation.
5. If `._qd/history/learnings/critical-patterns.md` exists, read it before planning or execution work.

## Chain

```
using-qd
  → exploring
  → planning
  → validating
  → swarming
  → executing
  → reviewing
  → compounding
```

## Critical Rules

1. Never execute without validating.
2. `CONTEXT.md` is the source of truth for locked decisions.
3. If context usage passes roughly 65%, write `._qd/HANDOFF.json` and pause cleanly.
4. Treat `._qd/state.json` as the routing mirror and `._qd/STATE.md` as the human-readable narrative; keep them aligned.
5. After compaction, re-read `AGENTS.md`, run `node .codex/status.mjs --json` if present, then re-open `._qd/HANDOFF.json`, `._qd/state.json`, `._qd/STATE.md`, and the active feature context before more work.
6. P1 review findings block merge.

## Working Files

```
._qd/
  onboarding.json     ← onboarding state
  state.json         ← machine-readable routing snapshot for agents and tools
  STATE.md           ← current phase and focus
  HANDOFF.json       ← pause/resume artifact

._qd/history/<feature>/
  CONTEXT.md         ← locked decisions
  discovery.md       ← research findings
  approach.md        ← approach + risk map

._qd/history/learnings/
  critical-patterns.md

.beads/              ← bead/task files when beads are in use
.spikes/             ← spike outputs when validation requires them
```

.codex/
  status.mjs         ← read-only scout command for onboarding, state, and handoff
  state.mjs          ← shared state helpers used by the scout command

## Guardrails

- Repo-local `.codex/` files installed by QD are workflow guardrails, not optional decoration.
- Use `node .codex/status.mjs --json` as the preferred quick scout step when it is available.
- Treat `compact_prompt` recovery instructions as mandatory.
- Use `bv` only with `--robot-*` flags. Bare `bv` launches the TUI and should be avoided in agent sessions.
- If the repo is only partially onboarded, stay in bootstrap/planning mode and surface what is missing before implementation.

## Session Finish

Before ending a substantial work chunk:

1. Update or close the active bead/task if one exists.
2. Leave `._qd/state.json`, `._qd/STATE.md`, and `._qd/HANDOFF.json` consistent with the current pause/resume state.
3. Mention any remaining blockers, open questions, or next actions in the final response.
<!-- AGENTS:END -->
