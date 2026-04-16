---
name: review-work
description: Post-implementation review orchestrator. Launches 5 parallel background sub-agents: Goal verification, QA execution, Code review, Security audit, Context mining. MUST USE after completing any significant implementation work. Triggers: 'review work', 'review my work', 'review changes', 'QA my work', 'verify implementation'.
---

# Review Work - 5-Agent Parallel Review Orchestrator

Launch 5 specialized sub-agents in parallel to review completed implementation work from every angle. All 5 must pass for the review to pass. If even ONE fails, the review fails.

| # | Agent | Role | Focus Level |
|---|-------|------|-------------|
| 1 | Goal Verifier | Did we build what was asked? | MAIN |
| 2 | QA Executor | Does it actually work? | MAIN |
| 3 | Code Reviewer | Is the code well-written? | MAIN |
| 4 | Security Auditor | Is it secure? | SUB |
| 5 | Context Miner | Did we miss any context? | MAIN |

---

## Phase 0: Gather Review Context

Before launching agents, collect these inputs:

- **GOAL**: The original objective. What was the user trying to achieve?
- **CONSTRAINTS**: Rules, requirements, or limitations. Tech stack restrictions, performance targets, API contracts.
- **BACKGROUND**: Why this work was needed. Business context, user stories.
- **CHANGED_FILES**: Auto-collect via `git diff --name-only HEAD~1`
- **DIFF**: Auto-collect via `git diff HEAD~1`
- **FILE_CONTENTS**: Read the full content of each changed file
- **RUN_COMMAND**: How to start/run the application

**NEVER CHECKOUT A PR BRANCH IN THE MAIN WORKTREE. ALWAYS CREATE A NEW GIT WORKTREE.**

---

## Phase 1: Launch 5 Agents

Launch ALL 5 in a single turn. Every agent uses `run_in_background=true`.

Oracle agents receive everything in the prompt (they cannot read files or run commands).

unspecified-high agents are autonomous - they can read files, run commands, and use tools.

### Agent 1: Goal & Constraint Verification (Oracle) - MAIN

Reviews whether the implementation achieves the stated goal within given constraints.

**Tasks:**
1. Goal Completeness: Break goal into sub-requirements. Mark ACHIEVED/MISSED/PARTIAL for each.
2. Constraint Compliance: Verify each constraint with specific code evidence.
3. Requirement Gaps: Requirements the user wanted but didn't spell out.
4. Over-Engineering: Anything added that wasn't requested.
5. Edge Cases: Trace through at least 5 edge cases.
6. Behavioral Correctness: Walk through code logic for 3+ representative scenarios.

**Output Format:**
```
<verdict>PASS or FAIL</verdict>
<confidence>HIGH / MEDIUM / LOW</confidence>
<summary>1-3 sentence overall assessment</summary>
<goal_breakdown>
  For each sub-requirement:
  - [ACHIEVED/MISSED/PARTIAL] Requirement description
</goal_breakdown>
<findings>
  - [PASS/FAIL/WARN] Category: Description
</findings>
<blocking_issues>Issues that MUST be fixed. Empty if PASS.</blocking_issues>
```

### Agent 2: QA via App Execution (unspecified-high) - MAIN

Tests whether the application actually works through hands-on execution.

**Process:**
1. **Scenario Brainstorm**: Write down EVERY test scenario (aim for 15-30 minimum)
2. **Scenario Augmentation**: Review and add at least 5 more scenarios
3. **Create Task List**: Convert to structured tasks with priority (P0/P1/P2)
4. **Execute Systematically**: Work through in priority order
5. **Compile Results**: Record pass/fail with evidence

**Execution guidance by app type:**
- **Web app**: Use playwright/dev-browser to navigate, click, fill forms
- **CLI tool**: Run commands with various arguments, check exit codes
- **Library/SDK**: Write test script that exercises the public API
- **Backend API**: Use curl/httpie to hit endpoints

**Output Format:**
```
<verdict>PASS or FAIL</verdict>
<scenario_coverage>
  Total scenarios: N
  P0: X tested, Y passed
  P1: X tested, Y passed
</scenario_coverage>
<test_results>
  For each test:
  - [PASS/FAIL] Test name (Priority)
  - Steps: What you did
  - Actual: What actually happened
</test_results>
<blocking_issues>P0 or P1 failures only. Empty if PASS.</blocking_issues>
```

### Agent 3: Code Quality Review (Oracle) - MAIN

Reviews whether the code is well-written, maintainable, and consistent.

**Review Dimensions:**
1. **Correctness**: Logic errors, off-by-one, null/undefined handling, race conditions
2. **Pattern Consistency**: Follows codebase's established patterns?
3. **Naming & Readability**: Clear variable/function names?
4. **Error Handling**: Errors properly caught, logged, propagated?
5. **Type Safety**: Any `as any`, `@ts-ignore`?
6. **Performance**: N+1 queries? Unnecessary re-renders?
7. **Abstraction Level**: Right level? No copy-paste duplication?
8. **Testing**: New behaviors covered?
9. **API Design**: Public interfaces clean?
10. **Tech Debt**: New tech debt introduced?

**Severity:**
- **CRITICAL**: Will cause bugs, data loss, crashes in production
- **MAJOR**: Should be fixed before merge
- **MINOR**: Improvement worth making
- **NITPICK**: Style preference, optional

### Agent 4: Security Review (Oracle) - SUB

Reviews exclusively for security vulnerabilities.

**Security Checklist:**
1. **Input Validation**: SQL injection, XSS, command injection, SSRF?
2. **Auth & AuthZ**: Authentication checks? Authorization verified?
3. **Secrets & Credentials**: Hardcoded secrets, API keys in code?
4. **Data Exposure**: Sensitive data in logs? PII in error messages?
5. **Dependencies**: New dependencies? Known CVEs?
6. **Cryptography**: Proper algorithms? No custom crypto?
7. **File & Path**: Path traversal? Unsafe file operations?
8. **Network**: CORS configured? Rate limiting? TLS enforced?
9. **Error Leakage**: Stack traces exposed?
10. **Supply Chain**: Lockfile updated consistently?

**Output Format:**
```
<verdict>PASS or FAIL</verdict>
<severity>CRITICAL / HIGH / MEDIUM / LOW / NONE</severity>
<findings>
  - [CRITICAL/HIGH/MEDIUM/LOW] Category: Description
  - Risk: What could an attacker do?
  - Remediation: Specific fix
</findings>
<blocking_issues>CRITICAL and HIGH items only. Empty if PASS.</blocking_issues>
```

### Agent 5: Context Mining (unspecified-high) - MAIN

Searches every accessible information source for missed context.

**Sources to Search:**
1. **Git History**: `git log --oneline -20 -- {file}`, `git blame`, related commits
2. **GitHub**: `gh issue list --search "{keywords}"`, `gh pr list`
3. **Communication Channels**: Slack, Notion, Discord
4. **Codebase Cross-References**: Files that import changed modules

**What to Look For:**
- Requirements mentioned in issues/PRs that implementation misses
- Past decisions explaining WHY code was written a certain way
- Related systems or features affected by changes
- Warnings from previous developers
- Migration or deprecation notes

---

## Phase 2: Wait & Collect

After launching all 5 agents, wait for system notifications as each completes.

Collect each verdict:

| Agent | Verdict | Notes |
|-------|---------|-------|
| 1. Goal Verification | pending | - |
| 2. QA Execution | pending | - |
| 3. Code Quality | pending | - |
| 4. Security | pending | - |
| 5. Context Mining | pending | - |

**Do NOT deliver the final report until ALL 5 have completed.**

---

## Phase 3: Final Report

**Verdict Logic:**
- ALL 5 agents returned PASS → **REVIEW PASSED**
- ANY agent returned FAIL → **REVIEW FAILED**

**Final Report Format:**
```markdown
# Review Work - Final Report

## Overall Verdict: PASSED / FAILED

| # | Review Area | Verdict | Confidence |
|---|------------|---------|------------|
| 1 | Goal & Constraint Verification | PASS/FAIL | HIGH/MED/LOW |
| 2 | QA Execution | PASS/FAIL | HIGH/MED/LOW |
| 3 | Code Quality | PASS/FAIL | HIGH/MED/LOW |
| 4 | Security | PASS/FAIL | Severity |
| 5 | Context Mining | PASS/FAIL | HIGH/MED/LOW |

## Blocking Issues
[Aggregated from all agents - deduplicated, prioritized]

## Key Findings
[Top 5-10 most important findings]

## Recommendations
[If FAILED: exactly what to fix, in priority order]
```

If FAILED - be specific. State the problem, the file, and the fix.

If PASSED - keep it short. Highlight non-blocking suggestions.
