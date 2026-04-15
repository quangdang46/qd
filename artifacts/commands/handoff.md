---
name: handoff
description: "(builtin) Create a detailed context summary for continuing work in a new session"
argumentHint: "[goal]"
---

# Handoff Command

Use /handoff when:
- The current session context is getting too long and quality is degrading
- You want to start fresh while preserving essential context from this session
- The context window is approaching capacity

This creates a detailed context summary that can be used to continue work in a new session.

---

## Phase 1: Gather Context

Execute these tools to gather concrete data:

1. `session_read({ session_id: "$SESSION_ID" })` - full session history
2. `todoread()` - current task progress
3. `git diff --stat HEAD~10..HEAD` - recent file changes
4. `git status --porcelain` - uncommitted changes

Analyze the gathered outputs to understand:
- What the user asked for (exact wording)
- What work was completed
- What tasks remain incomplete
- What decisions were made
- What files were modified or discussed

---

## Phase 2: Extract Context

Write the context summary from first person perspective ("I did...", "I told you...").

Focus on:
- Capabilities and behavior, not file-by-file implementation details
- What matters for continuing the work
- USER REQUESTS (AS-IS) must be verbatim (do not paraphrase)
- EXPLICIT CONSTRAINTS must be verbatim only

---

## Phase 3: Format Output

Generate a handoff summary using this exact format:

```
HANDOFF CONTEXT
===============

USER REQUESTS (AS-IS)
---------------------
- [Exact verbatim user requests]

GOAL
----
[One sentence describing what should be done next]

WORK COMPLETED
-------------
- [First person bullet points of what was done]
- [Include specific file paths when relevant]

CURRENT STATE
-------------
- [Current state of the codebase or task]
- [Build/test status if applicable]

PENDING TASKS
-------------
- [Tasks that were planned but not completed]
- [Next logical steps to take]

KEY FILES
---------
- [path/to/file1] - [brief role description]
- [path/to/file2] - [brief role description]
(Maximum 10 files)

IMPORTANT DECISIONS
-------------------
- [Technical decisions that were made and why]
- [Trade-offs that were considered]

EXPLICIT CONSTRAINTS
--------------------
- [Verbatim constraints only]
- If none, write: None

CONTEXT FOR CONTINUATION
------------------------
- [What the next session needs to know to continue]
```

Rules:
- Plain text with bullets
- No markdown headers with #
- Use workspace-relative paths for files
- Keep it focused - only include what matters
- Maximum 10 files in KEY FILES section

---

## TO CONTINUE IN A NEW SESSION:

1. Press 'n' in OpenCode TUI to open a new session
2. Paste the HANDOFF CONTEXT above as your first message
3. Add your request: "Continue from the handoff context above. [Your next task]"
