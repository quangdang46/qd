---
name: work-with-pr
description: "Full PR lifecycle: git worktree → implement → atomic commits → PR creation → verification loop (CI + review-work + Cubic approval) → merge. Keeps iterating until ALL gates pass and PR is merged. Worktree auto-cleanup after merge. Use whenever implementation work needs to land as a PR."
---

# Work With PR — Full PR Lifecycle

Complete PR lifecycle: from isolated worktree setup through implementation, PR creation, and unbounded verification loop until merged.

## Architecture

```
Phase 0: Setup         → Branch + worktree in sibling directory
Phase 1: Implement     → Do the work, atomic commits
Phase 2: PR Creation   → Push, create PR targeting dev
Phase 3: Verify Loop   → Unbounded iteration until ALL gates pass:
  ├─ Gate A: CI         → gh pr checks (bun test, typecheck, build)
  ├─ Gate B: review-work → 5-agent parallel review
  └─ Gate C: Cubic      → cubic-dev-ai[bot] "No issues found"
Phase 4: Merge         → Squash merge, worktree cleanup
```

## Phase 0: Setup

Create isolated worktree (not inside repo):

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BASE_BRANCH="dev"
BRANCH_NAME="feature/$(echo "$TASK_SUMMARY" | tr '[:upper:] ' '[:lower:]-' | head -c 50)"
git fetch origin "$BASE_BRANCH"
git branch "$BRANCH_NAME" "origin/$BASE_BRANCH"
WORKTREE_PATH="../${REPO_NAME}-wt/${BRANCH_NAME}"
mkdir -p "$(dirname "$WORKTREE_PATH")"
git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
cd "$WORKTREE_PATH"
```

## Phase 1: Implement

**Commit strategy** (atomic commits):
```
3+ files changed  → 2+ commits minimum
5+ files changed  → 3+ commits minimum
10+ files changed → 5+ commits minimum
```

Each commit should pair implementation with its tests. Use git-master skill.

**Pre-push local validation**:
```bash
bun run typecheck && bun test && bun run build
```

## Phase 2: PR Creation

```bash
git push -u origin "$BRANCH_NAME"
gh pr create --base "$BASE_BRANCH" --title "$PR_TITLE" --body "## Summary..."
```

## Phase 3: Verify Loop

```
while true:
  1. Wait for CI          → Gate A
  2. If CI fails          → read logs, fix, commit, push, continue
  3. Run review-work       → Gate B
  4. If review fails      → fix blocking issues, commit, push, continue
  5. Check Cubic          → Gate C
  6. If Cubic has issues  → fix issues, commit, push, continue
  7. All three pass       → break
```

### Gate A: CI Checks

```bash
gh pr checks "$PR_NUMBER" --watch --fail-fast
```

On failure: Get logs, fix, commit, push, continue.

### Gate B: review-work

Invoke after CI passes. 5 parallel sub-agents must all pass.

### Gate C: Cubic Approval

Approval signal: Latest Cubic comment contains `**No issues found**` and confidence `**5/5**`.

## Phase 4: Merge & Cleanup

```bash
# Squash merge
gh pr merge "$PR_NUMBER" --squash --delete-branch

# Sync .sisyphus state back before cleanup
cp -r "$WORKTREE_PATH/.sisyphus/"* "$ORIGINAL_DIR/.sisyphus/" 2>/dev/null || true

# Clean up worktree
git worktree remove "$WORKTREE_PATH"
git worktree prune
```

## Anti-Patterns

| Violation | Severity |
|-----------|----------|
| Working in main worktree | **CRITICAL** |
| Pushing directly to dev/master | **CRITICAL** |
| Skipping CI gate after code changes | **CRITICAL** |
| Fixing unrelated code during verification loop | HIGH |
| Deleting worktree on failure | HIGH |
| Giant single commits | MEDIUM |
