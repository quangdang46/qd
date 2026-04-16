---
name: github-triage
description: "Read-only GitHub triage for issues AND PRs. 1 item = 1 background task (category: quick). Analyzes all open items and writes evidence-backed reports to /tmp/. Every claim requires a GitHub permalink as proof. NEVER takes any action on GitHub - no comments, no merges, no closes, no labels. Reports only."
---

# GitHub Triage - Read-Only Analyzer

Read-only GitHub triage orchestrator. Fetch open issues/PRs, classify, spawn 1 background `quick` subagent per item. **ZERO GitHub mutations.**

## Zero-Action Policy (ABSOLUTE)

**FORBIDDEN:**
- `gh issue comment`, `gh issue close`, `gh issue edit`
- `gh pr comment`, `gh pr merge`, `gh pr review`, `gh pr edit`
- `gh api -X POST`, `gh api -X PUT`, `gh api -X PATCH`, `gh api -X DELETE`

**ALLOWED:**
- `gh issue view`, `gh pr view`, `gh api` (GET only)
- `Grep`, `Read`, `Glob`
- `Write` — report files to `/tmp/` ONLY
- `git log`, `git show`, `git blame`

## Evidence Rule (MANDATORY)

**Every factual claim MUST include a GitHub permalink as proof.**

Permalink format: `https://github.com/{owner}/{repo}/blob/{commit_sha}/{path}#L{start}-L{end}`

Rules:
- **No permalink = no claim.** Mark unverifiable claims as `[UNVERIFIED]`.
- Permalinks to `main`/`master`/`dev` branches are NOT acceptable — use commit SHAs only.
- For bug analysis: permalink to problematic code. For fix verification: permalink to fixing commit.

## Phase 0: Setup

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
REPORT_DIR="/tmp/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$REPORT_DIR"
COMMIT_SHA=$(git rev-parse HEAD)
```

## Phase 1: Fetch All Open Items

```bash
ISSUES_LIST=$(gh issue list --repo $REPO --state open --limit 500 --json number,title,labels,author,createdAt)
PRS_LIST=$(gh pr list --repo $REPO --state open --limit 500 --json number,title,labels,author,headRefName,baseRefName,isDraft,createdAt)
```

**Process ALL items** — if 500 open issues, spawn 500 subagents.

## Phase 2: Classify

| Type | Detection |
|------|-----------|
| `ISSUE_QUESTION` | `[Question]`, `[Discussion]`, "how to" / "why does" |
| `ISSUE_BUG` | `[Bug]`, error messages, stack traces |
| `ISSUE_FEATURE` | `[Feature]`, `[RFE]`, `[Enhancement]` |
| `PR_BUGFIX` | Title starts with `fix`, branch contains `fix/`/`bugfix/` |
| `PR_OTHER` | Everything else |

## Phase 3: Spawn Subagents

**1 ISSUE/PR = 1 `task_create` = 1 `quick` SUBAGENT (background). NO EXCEPTIONS.**

```bash
# For each item:
task_create(
  subject="Triage: #{number} {title}",
  description="GitHub triage analysis - {type}",
  metadata={"type": "...", "number": number}
)
task(
  category="quick",
  run_in_background=true,
  prompt=SUBAGENT_PROMPT
)
```

## Subagent Prompts

### ISSUE_BUG Format

```
# Issue #{number}: {title}
**Type:** Bug Report | **Author:** {author}

## Bug Summary
**Expected:** [what user expects]
**Actual:** [what actually happens]

## Verdict: [CONFIRMED_BUG | NOT_A_BUG | ALREADY_FIXED | UNCLEAR]

## Evidence
[Each with permalink]

## Root Cause (if CONFIRMED_BUG)
[Which file, which function]

## Severity: [LOW | MEDIUM | HIGH | CRITICAL]

## Suggested Fix
[Specific approach]

## Recommended Action
[What maintainer should do]
```

### ISSUE_FEATURE Format

```
# Issue #{number}: {title}
**Type:** Feature Request | **Author:** {author}

## Request Summary
[What the user wants]

## Existing Implementation: [YES_FULLY | YES_PARTIALLY | NO]

## Feasibility: [EASY | MODERATE | HARD | ARCHITECTURAL_CHANGE]

## Relevant Files
[With permalinks]

## Recommended Action
```

## Phase 4: Final Summary

```markdown
# GitHub Triage Report - {REPO}

**Date:** {date} | **Commit:** {COMMIT_SHA}
**Items Processed:** {total}

## Issues
| Category | Count |
|----------|-------|
| Bug Confirmed | {n} |
| Already Fixed | {n} |
| Not A Bug | {n} |
| Needs Investigation | {n} |
| Question Analyzed | {n} |
| Feature Assessed | {n} |

## Items Requiring Attention
[Each: number, title, verdict, link to report]
```

## Anti-Patterns

| Violation | Severity |
|-----------|----------|
| ANY GitHub mutation | **CRITICAL** |
| Claim without permalink | **CRITICAL** |
| Using category other than `quick` | CRITICAL |
| Batching multiple items into one task | CRITICAL |
| `run_in_background=false` | CRITICAL |
