# Creation Log: swarming

## Source Material

Origin:
- Existing `../swarming/SKILL.md`
- Existing `../executing/SKILL.md`
- Existing swarm worker/message references
- Root `AGENTS.md`
- User-reported failures from March 31, 2026

What the source does:
- Defines the orchestrator role, worker bootstrap, and Agent Mail coordination surface
- Already requires reporting in several places, but left room for silent drift and passive waiting

Observed failures that triggered this hardening:
- Sub-agents often forgot to report back through Agent Mail
- Workers drifted past `AGENTS.md` and skipped the intended mail-first startup flow
- The main orchestrator sometimes stopped tending the swarm and waited for the user instead of polling inboxes and coordinating workers

## Extraction Decisions

What to include:
- A hard rule that an active swarm never idles
- A mandatory startup sequence for workers: register, read `AGENTS.md`, post `[ONLINE]`, fetch inbox, only then claim work
- A coordinator silence ladder for missing startup acks and quiet active workers
- Stronger message templates so the runtime prompt itself carries the same contract
- Pressure scenarios that test silent worker behavior and passive orchestrator behavior directly

What to leave out:
- Automatic worker replacement or forced reassignment logic
- Runtime implementation changes outside the skill and reference artifacts
- Any onboarding rewrite for `._qd/onboarding.json`

## Structure Decisions

1. Harden both `swarming` and `executing`, not just the top-level orchestrator text, because the failure exists at both ends of the handoff.
2. Put startup/reporting requirements into `references/worker-template.md` so spawned prompts inherit the contract directly.
3. Add coordinator reminder templates to `references/message-templates.md` so the silence ladder is concrete, not implied.
4. Record RED pressure scenarios in `references/pressure-scenarios.md` to keep future edits anchored to real failure modes.

## RED Phase: Baseline Targets

Observed rationalization targets:
1. "I should start the bead first and report once there is something meaningful to say."
2. "The coordinator can infer completion from `br close` and git."
3. "Waiting quietly is less noisy than posting an obvious blocker."
4. "The thread is quiet, so I should wait for the user instead of polling."
5. "A missing startup acknowledgment will probably resolve itself if I give it more time."

Scenario catalog added:
- Worker Skips `[ONLINE]` Under Urgency
- Worker Finishes A Bead And Jumps To The Next One
- Worker Waits Silently On A Conflict
- Coordinator Sees Quiet Workers And Idles
- Coordinator Quietly Assumes Startup Drift Will Fix Itself
- Maximum Pressure Combined Failure

## GREEN Phase: Contract Changes

Edits made:
- `../swarming/SKILL.md`
  - Added the hard rule that an active swarm never idles
  - Replaced soft monitoring language with a poll-act-repeat coordinator loop
  - Added a silence ladder for missing startup acks and quiet active workers
  - Required startup acknowledgments to confirm `AGENTS.md` read status and inbox-first behavior
- `../executing/SKILL.md`
  - Made `[ONLINE]` plus `fetch_inbox(...)` a prerequisite for claiming work
  - Made each loop start with inbox coordination
  - Added a post-completion inbox check before the next bead
  - Marked silent completion/blocker/handoff behavior as a red flag
- `../swarming/references/worker-template.md`
  - Embedded `AGENTS.md: read` and inbox-first startup requirements in the worker prompt
  - Tightened reporting requirements and forbidden behaviors
- `../swarming/references/message-templates.md`
  - Strengthened `[ONLINE]`, `[DONE]`, `[BLOCKED]`, and `[FILE CONFLICT]`
  - Added coordinator reminder templates for missing startup and silent workers

## REFACTOR Notes

Loopholes closed:
- Worker can no longer plausibly claim that reporting is optional until after the first bead
- Coordinator can no longer treat quiet mail as permission to idle
- Startup drift now has explicit recovery messages, not just a vague expectation
- Post-completion drift is reduced by requiring an inbox poll before the next bead

Tradeoff chosen:
- Balanced enforcement: strong mail/reporting gates and reminder ladders, but no automatic worker replacement policy

## Validation

Planned validation steps for this hardening pass:
- Run `agentskills validate` against the edited skill directories if the validator is available
- Replay the pressure scenarios manually or with future skill tests against the updated contract

## Final Outcome

- The swarm contract now treats Agent Mail reporting as mandatory worker behavior, not optional etiquette.
- The orchestrator contract now treats inbox polling and coordination as the default live-loop behavior while a swarm is active.
- The failure modes reported by the user are now directly represented in both the skill text and the pressure scenarios.

Created: 2026-03-31
Mode: RED targets -> GREEN edits -> REFACTOR tightening
