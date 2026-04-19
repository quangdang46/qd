# Go Mode Pipeline — Step-by-Step Reference

> Load this when executing go mode. Contains the detailed sequence, gate conditions, fallback paths, and config options.
>
> Source patterns: CE `/lfg` + `/slfg`, GSD phase loop with plan-checker and verifier, qd architecture v2.

---

## Overview

Go mode is the full qd pipeline from raw feature request to merged, compounded learnings. It chains every skill in sequence with exactly 4 human gates. The pipeline is designed so that each gate protects the next irreversible commitment.

```text
User: "/go [feature]"
       │
       ▼
[BOOTSTRAP] Check state, read critical-patterns.md
       │
       ▼
[STEP 1] exploring
       │ Output: ._qd/history/<feature>/CONTEXT.md
       │
       ▼
[GATE 1] ← HARD STOP: "Approve CONTEXT.md?"
       │
       ▼
[STEP 2] planning (whole feature)
       │ Output: discovery.md, approach.md, phase-plan.md
       │
       ▼
[GATE 2] ← HARD STOP: "Approve phase-plan.md?"
       │
       ▼
[STEP 3] planning (current phase prep)
       │ Output: phase-<n>-contract.md, phase-<n>-story-map.md, current-phase beads
       │
       ▼
[STEP 4] validating (current phase)
       │ Plan-checker (<=3x) + spikes + bead polish
       │
       ▼
[GATE 3] ← HARD STOP: "Current phase verified. Approve execution?"
       │
       ▼
[STEP 5] swarming -> executing (xN workers)
       │ Current phase only
       │
       ├── if later phases remain -> return to STEP 3 for the next phase
       │
       ▼
[STEP 6] reviewing (after final phase only)
       │ 5 parallel review agents -> P1/P2/P3 findings
       │ Artifact verification + human UAT
       │
       ▼
[GATE 4] ← HARD STOP: "Approve merge?"
       │
       ▼
[STEP 7] compounding
       │ Capture learnings -> ._qd/history/learnings/
       │
       ▼
DONE
```

---

## Pre-Pipeline: Bootstrap

Before invoking `exploringexploring`, always:

1. Run State Bootstrap from SKILL.md (check `._qd/`, read `critical-patterns.md`).
2. Determine feature slug from the user's description (lowercase-hyphenated, e.g. `agent-email-inbox`).
3. Create `._qd/history/<feature>/` if it does not exist.
4. Write `._qd/STATE.md`:
   ```text
   focus: <feature>
   phase: go-mode/exploring
   pipeline: go
   last_updated: <timestamp>
   ```

---

## Step 1: Exploring

**Invoke:** Load `exploringexploring` skill.

**Input:** User's feature description.

**The exploringexploring skill will:**

- Classify domain (SEE / CALL / RUN / READ / ORGANIZE)
- Identify gray areas via Socratic Q&A
- Lock decisions with stable IDs (D1, D2, ...)
- Write `._qd/history/<feature>/CONTEXT.md`
- Self-review `CONTEXT.md`

**Update STATE.md:** `phase: go-mode/gate-1`

---

## GATE 1: Approve CONTEXT.md

```text
HARD-GATE: Do not proceed until user explicitly approves.

Present:
  "Exploration complete for [feature].
   [N] decisions locked in ._qd/history/<feature>/CONTEXT.md.
   [M] open questions noted.

   Key decisions:
   - D1: [summary]
   - D2: [summary]
   ... (max 5, then 'see CONTEXT.md for full list')

   Approve decisions and proceed to planning? (yes / revise / show full CONTEXT.md)"
```

If user says `revise`, loop back to exploring. If user says `yes`, proceed to Step 2.

---

## Step 2: Planning (Whole Feature)

**Invoke:** Load `exploringplanning` skill.

**Input:** `._qd/history/<feature>/CONTEXT.md`, `._qd/history/learnings/critical-patterns.md`.

**The first planning pass will:**

- retrieve learnings
- run discovery
- synthesize an approach
- write `._qd/history/<feature>/phase-plan.md`
- show the full phase breakdown in plain English

**Important:** this step does **not** create beads yet.

**Update STATE.md:** `phase: go-mode/gate-2`

---

## GATE 2: Approve phase-plan.md

```text
HARD-GATE: Do not proceed until user explicitly approves.

Present:
  "Planning complete for [feature].
   Proposed phases:
   - Phase 1: [name] -> [real-world outcome]
   - Phase 2: [name] -> [real-world outcome]
   - Phase 3: [name] -> [real-world outcome]

   Stories inside each phase are documented in ._qd/history/<feature>/phase-plan.md.

   Approve this phase/story breakdown before current-phase preparation? (yes / revise / show full phase-plan.md)"
```

If user says `revise`, return to the planning pass that owns `phase-plan.md`. If user says `yes`, proceed to Step 3.

---

## Step 3: Planning (Current Phase Prep)

**Invoke:** Load `exploringplanning` again in current-phase preparation mode.

**Input:** approved `phase-plan.md`, `approach.md`, `CONTEXT.md`.

**The second planning pass will:**

- select the current phase from `phase-plan.md`
- write `._qd/history/<feature>/phase-<n>-contract.md`
- write `._qd/history/<feature>/phase-<n>-story-map.md`
- create beads only for that phase

**Rules:**

- default to the first unprepared phase
- never create later-phase beads early
- every bead must include `Phase <n>` and `Story <m>` context

**Update STATE.md:** `phase: go-mode/validating`

---

## Step 4: Validating (Current Phase)

**Invoke:** Load `exploringvalidating` skill.

**Input:** current phase beads, `phase-plan.md`, current phase contract/story map, `approach.md`, `CONTEXT.md`.

**The exploringvalidating skill will:**

- Phase 0: orient on the current phase and confirm the phase plan was approved
- Phase 1: plan-checker loop (<=3 iterations, 8 dimensions)
- Phase 2: spike execution for current-phase HIGH-risk items
- Phase 3: bead polishing (`bv --robot-suggest`, `--robot-insights`, `--robot-priority`)
- Phase 4: current-phase exit-state readiness review

**Update STATE.md:** `phase: go-mode/gate-3`

---

## GATE 3: Approve Current-Phase Execution

```text
HARD-GATE: This is the most critical gate. Do not proceed until user explicitly approves.

Present:
  "Validation complete for [feature], Phase <n>.
   [N] beads ready for current-phase execution.
   Risk: [X] HIGH items -> spikes: [all passed / N failed]

   Any unresolved concerns: [list or 'none']

   Current phase verified. Approve execution? (yes / review beads / no - revise plan)"
```

If user says `no` or `revise`, return to planning or validating. If user says `yes`, proceed to Step 5.

---

## Step 5: Swarming + Executing (Current Phase)

**Invoke:** Load `exploringswarming` skill.

**The exploringswarming skill will:**

- initialize Agent Mail
- spawn workers for the current phase bead set
- monitor current-phase execution
- verify current-phase beads closed

### Phase loop rule

After current-phase execution completes:

- if `phase-plan.md` shows later phases still pending -> return to Step 3 for the next phase
- if the current phase was the final phase -> proceed to Step 6

**Update STATE.md:** either:

- `phase: go-mode/planning-next-phase`, or
- `phase: go-mode/reviewing`

---

## Step 6: Reviewing

**Invoke:** Load `exploringreviewing` skill only after the final phase swarm completes.

**The exploringreviewing skill will:**

- dispatch 5 specialist review agents
- run 3-level artifact verification
- run human UAT
- run final finishing tasks

**Update STATE.md:** `phase: go-mode/gate-4`

---

## GATE 4: Approve Merge

```text
HARD-GATE: Never auto-merge.

Present:
  "Review complete for [feature].
   P1 (blocks merge): [count] - [titles if any]
   P2 (should fix):   [count]
   P3 (nice to have): [count]"

IF P1 > 0:
  "P1 findings block merge. Options:
   (a) Fix P1s now
   (b) Show P1 details
   (c) Override (requires explicit user confirmation)"

IF P1 = 0:
  "No blocking findings.
   Ready to [create PR / merge to main / keep branch].
   Approve? (yes / show P2s first / no)"
```

If fix beads are created, execute them and re-run reviewing before presenting GATE 4 again.

---

## Step 7: Compounding

**Invoke:** Load `exploringcompounding` skill.

**Input:** full feature history (`CONTEXT.md`, `approach.md`, `phase-plan.md`, review findings, execution notes).

**The exploringcompounding skill will:**

- dispatch 3 analysis subagents: patterns / decisions / failures
- write `._qd/history/learnings/YYYYMMDD-<feature>.md`
- promote critical items to `._qd/history/learnings/critical-patterns.md`
- optionally index via CASS

**Final update STATE.md:**

```text
focus: (none)
phase: idle
last_feature: <feature>
last_updated: <timestamp>
```

Delete `._qd/HANDOFF.json` if it exists.

---

## Fallback Paths

### If exploring produces a CONTEXT.md the user rejects at GATE 1

```text
-> Identify which decisions need revision
-> Load exploringexploring skill, focus on those specific gray areas
-> Update CONTEXT.md in place
-> Re-present GATE 1
```

### If the user rejects phase-plan.md at GATE 2

```text
-> Identify which phase names, boundaries, or stories feel wrong
-> Return to the whole-feature planning pass
-> Update phase-plan.md
-> Re-present GATE 2
```

### If validating fails after 3 plan-checker iterations

```text
-> Present failing dimensions to user
-> Ask: "Return to planning with these specific concerns?"
-> Load planning with the failure report as context
-> Re-run validating after the current phase is re-prepared
```

### If a spike fails

```text
-> STOP: do not proceed to GATE 3
-> Present: "Spike [id] failed: [reason]. Current phase is blocked."
-> Options: (a) Revise approach, (b) Descope the risky part, (c) Re-split phase boundaries
-> If revise: return to planning and then re-run validating
```

### If orchestrator context hits 65% mid-swarm

```text
-> Write HANDOFF.json
-> Present: "Context budget reached. Current phase swarm paused.
            [X] beads complete, [Y] in flight.
            Resume in a new session with HANDOFF.json."
-> End turn gracefully
```

### If P1 findings are present at GATE 4 and the user wants to fix

```text
-> Create fix beads via br create for each P1 finding
-> Load exploringswarming skill (fix-bead swarm only)
-> After execution: re-run reviewing (targeted - fixes diff only)
-> Re-present GATE 4
-> Repeat until P1 = 0 or user explicitly overrides
```

---

## Config Options (._qd/config.json)

Absent = enabled. Only set to disable.

```json
{
  "go_mode": {
    "skip_exploring": false,
    "skip_compounding": false,
    "auto_approve_gates": false,
    "spike_on_medium_risk": false
  },
  "validating": {
    "plan_checker_max_iterations": 3,
    "bead_polish_rounds": 3
  },
  "reviewing": {
    "parallel_agents": true,
    "serial_threshold": 6
  }
}
```

---

## Quick Mode Pipeline (Reference)

For small fixes (<=3 files, LOW risk, no gray areas):

```text
planning (lightweight)
  -> one-phase plan
  -> approval gate
  -> one current-phase bead
  -> no multi-model refinement
  ↓
validating (lightweight)
  -> abbreviated structural verification
  -> skip spikes (LOW risk)
  -> bv check only
  ↓
swarming -> executing (single worker)
  ↓
reviewing (optional)
  -> skip if truly trivial
  ↓
compounding (only if lesson learned)
```

---

## Design Rationale

**Why 4 gates, not 3?**

Because the phase breakdown itself is now a first-class human decision. `CONTEXT.md` locks intent, `phase-plan.md` locks the feature shape, validating locks execution-readiness for the current phase, and reviewing locks merge-readiness.

**Why is GATE 3 the most critical?**

Execution is the only phase that creates source-code side effects. A broken current phase discovered post-execution costs far more to fix than one caught in validating.

**Why does planning now happen in two passes?**

Because "show me the whole shape" and "prepare one phase for execution" are different jobs. Combining them made phase/story explanations too abstract and pushed bead creation earlier than users wanted.

**What tone should the model use at every gate?**

Concrete and scenario-first. At every gate, the model should explain:

1. what becomes true or what is wrong
2. what the system does today
3. why that matters
4. one realistic example
5. what approval or change is needed next

Gate summaries should not rely on reviewer shorthand or planner jargon alone.
