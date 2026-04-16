---
name: pre-publish-review
description: "Nuclear-grade 16-agent pre-publish release gate. Runs /get-unpublished-changes to detect all changes since last npm release, spawns up to 10 ultrabrain agents for deep per-change analysis, invokes /review-work (5 agents) for holistic review, and 1 oracle for overall release synthesis. Use before EVERY npm publish."
---

# Pre-Publish Review — 16-Agent Release Gate

Three-layer review before publishing to npm. Every layer covers a different angle — together they catch what no single reviewer could.

| Layer | Agents | Type | What They Check |
|-------|--------|------|-----------------|
| Per-Change Deep Dive | up to 10 | ultrabrain | Each logical change group individually |
| Holistic Review | 5 | review-work | Goal compliance, QA, code quality, security |
| Release Synthesis | 1 | oracle | Overall release readiness, version bump |

## Phase 0: Detect Unpublished Changes

Run `/get-unpublished-changes` FIRST. This is the single source of truth for what changed.

```bash
PUBLISHED=$(npm view oh-my-opencode version 2>/dev/null || echo "not published")
LOCAL=$(node -p "require('./package.json').version")
COMMITS=$(git log "v${PUBLISHED}"..HEAD --oneline 2>/dev/null || echo "no commits")
DIFF_STAT=$(git diff "v${PUBLISHED}"..HEAD --stat 2>/dev/null || echo "no diff")
```

## Phase 1: Parse Changes into Groups

Group by scope and type. Target up to 10 groups. For each group:
- **Group name**: Short descriptive label
- **Commits**: List of commit hashes and messages
- **Files**: Changed files
- **Diff**: Relevant portion of the full diff

## Phase 2: Spawn All Agents

Launch ALL agents in a single turn with `run_in_background=true`.

### Layer 1: Ultrabrain Per-Change Analysis (up to 10)

For each change group, spawn one ultrabrain agent. Each gets only its portion of the diff.

```
task(
  category="ultrabrain",
  run_in_background=true,
  description="Deep analysis: {GROUP_NAME}",
  prompt="ANALYSIS CHECKLIST:
1. Intent Clarity - Is the intent clear from code and commit messages?
2. Correctness - Trace through logic for 3+ scenarios
3. Breaking Changes - Does this alter public API, config, CLI behavior?
4. Pattern Adherence - Does new code follow established patterns?
5. Edge Cases - What inputs would break this?
6. Error Handling - Are errors properly caught and propagated?
7. Type Safety - Any as any, @ts-ignore, @ts-expect-error?
8. Test Coverage - Are behavioral changes covered by tests?
9. Side Effects - Could this break something in a different module?
10. Release Risk - SAFE / CAUTION / RISKY"
)
```

### Layer 2: Holistic Review via /review-work (5 agents)

```
task(
  category="unspecified-high",
  run_in_background=true,
  load_skills=["review-work"],
  description="Run /review-work on all unpublished changes"
)
```

### Layer 3: Oracle Release Synthesis (1 agent)

```
task(
  subagent_type="oracle",
  run_in_background=true,
  description="Oracle: overall release synthesis"
)
```

## Phase 3: Collect Results

Track completion in a table. Do NOT deliver final report until ALL agents complete.

## Phase 4: Final Verdict

**BLOCK** if:
- Oracle verdict is BLOCK
- Any ultrabrain found CRITICAL blocking issues
- Review-work failed on any MAIN agent

**RISKY** if: Oracle RISKY, multiple CAUTIONS/FAILs, significant findings
**CAUTION** if: Oracle CAUTION, few minor issues
**SAFE** if: Oracle SAFE, all ultrabrains passed, review-work passed

## Anti-Patterns

| Violation | Severity |
|-----------|----------|
| Publishing without waiting for all agents | **CRITICAL** |
| Spawning ultrabrains sequentially | **CRITICAL** |
| Using `run_in_background=false` | **CRITICAL** |
| Skipping the Oracle synthesis | HIGH |
| Not including diff in ultrabrain prompts | MAJOR |
