---
name: remove-ai-slops
description: "(builtin) Remove AI-generated code smells from branch changes and critically review the results"
---

# Remove AI Slops Command

Analyzes all files changed in the current branch (compared to parent commit), removes AI-generated code smells in parallel, then critically reviews the changes to ensure safety and behavior preservation.

## Process

### Phase 1: Identify Changed Files

Detect the repository base branch dynamically, then get all changed files:

```bash
BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
git diff $(git merge-base "$BASE_BRANCH" HEAD)..HEAD --name-only
```

### Phase 2: Parallel AI Slop Removal

For each changed file, use the ai-slop-remover skill on each file in parallel:
- Launch all removals in a single message for maximum parallelism
- Save rollback artifacts for each file before modification

**CRITICAL**: Before running ai-slop-remover on each file, save a file-specific rollback artifact.

### Phase 3: Critical Review

After all removals complete, perform a critical review:

**Safety Verification**:
- [ ] No functional logic was accidentally removed
- [ ] All error handling is preserved
- [ ] Type hints remain correct and complete
- [ ] Import statements are still valid
- [ ] No breaking changes to public APIs

**Behavior Preservation**:
- [ ] Return values unchanged
- [ ] Side effects unchanged
- [ ] Exception behavior unchanged
- [ ] Edge case handling preserved

**Code Quality**:
- [ ] Removed changes are genuinely AI slop (not intentional patterns)
- [ ] Remaining code follows project conventions
- [ ] No orphaned code or dead references

### Phase 4: Fix Issues

If any issues found during critical review:
1. Identify the specific problem
2. Explain why it's a problem
3. Revert only the ai-slop-remover delta using saved patches
4. If remaining ai-slops are found after reverting, remove them yourself
5. Verify the fix doesn't introduce new issues

## Output Format

```
## AI Slop Removal Summary

### Files Processed
- file1.py: X changes
- file2.py: Y changes

### Critical Review Results
- Safety: PASS/FAIL
- Behavior: PASS/FAIL
- Quality: PASS/FAIL

### Issues Found & Fixed
1. [Issue description] -> [Fix applied]

### Final Status
[CLEAN / ISSUES FIXED / REQUIRES ATTENTION]
```

## Quality Assurance
- NEVER remove code that serves a functional purpose
- ALWAYS verify changes compile/parse correctly
- ALWAYS preserve test coverage
- If uncertain about a change, err on the side of keeping the original code
