# QD Project Structure

## QD Vision

**QD là một CLI để init nhiều IDE từ một artifacts source duy nhất.**

- Một artifacts source → nhiều IDE targets (`.claude`, `.cursor`, `.windsurf`, etc.)
- Không cần config.json cho username, language
- `_qd-output/` cho Khuym workflow outputs (exploring → planning → validating → swarming → executing → reviewing → compounding)
- Học hỏi Claudekit CLI về phase-based architecture
- Học hỏi BMAD method về config-driven IDE setup

---

## Before QD Init (Typical Project)

```
project/
├── .git/
├── .gitignore
├── node_modules/
├── package.json
├── package-lock.json
└── src/
```

## After QD Init (`qd init`)

Running `qd init` creates:

```
project/
├── _qd-output/                  # QD outputs (Khuym workflow)
│   └── learnings/
├── .claude/                    # (if Claude Code selected)
│   ├── skills/
│   ├── commands/
│   └── agents/
├── .cursor/                    # (if Cursor selected)
│   ├── rules/                  # Cursor uses "rules" instead of "skills/commands/agents"
│   └── ...
├── .windsurf/                  # (if Windsurf selected)
│   ├── skills/
│   ├── commands/
│   └── agents/
└── ... (other IDEs as selected)
```

---

## Key Architecture Decisions

| Decision | Status | Notes |
|----------|--------|-------|
| `_qd/` internal only | CHOSED | Not exposed to users |
| `_qd-output/` for workflow | CHOSED | Khuym pattern - workflow outputs only |
| No config.json | CHOSED | No username, language, project_name prompts |
| CLI IDE handling logic | KEEP | Current implementation in cli/ide/ is good |
| schema.yaml per folder + overrides | CHOSED | IDE selection per artifact folder + file-level |
| module.yaml for conversion | CHOSED | Format conversion (MD → TOML for Codex) |
| Glob pattern for convert paths | CHOSED | Clear path matching for format conversion |
| Conflict = throw error | CHOSED | supported_ides + ignored_ides cannot coexist |
| platform-codes.yaml subdir mapping | CHOSED | Per-IDE artifact type → target dir mapping |

---

## Directory Breakdown

### `_qd-output/` — Khuym Workflow Outputs

| Path | Description |
|------|-------------|
| `CONTEXT.md` | Locked decisions from exploring phase |
| `discovery.md` | Research findings |
| `approach.md` | Chosen approach |
| `phase-plan.md` | Phase breakdown |
| `learnings/` | Dated learnings (YYYY-MM-DD-*.md) |

**Note:** `_qd-output/` is created at phase 5, excluded from artifacts walk.

---

## Artifacts Structure

```
artifacts/
├── module.yaml                 # Module config + format conversion
├── schema.yaml               # (optional) root-level IDE selection
├── skills/
│   ├── schema.yaml           # override cho skills folder
│   └── ...
├── commands/
│   └── schema.yaml
├── agents/
│   └── schema.yaml
└── subagents/
    └── schema.yaml
```

---

## schema.yaml — IDE Selection

Each folder can have a `schema.yaml` to control which IDEs receive its contents.

### Placement & Inheritance

```
artifacts/
├── schema.yaml                # Root-level (cascade down)
├── skills/
│   ├── schema.yaml           # Override root + apply to all in skills/
│   ├── exploring/
│   │   └── SKILL.md         # inherits skills/schema.yaml
│   └── NESTED/
│       ├── schema.yaml       # Override skills/schema.yaml
│       └── file.md           # inherits NESTED/schema.yaml
└── commands/
    └── schema.yaml
```

### Supported IDEs

```yaml
# artifacts/FOLDER/schema.yaml

# IDE selection (chọn 1 trong 2)
supported_ides: [claude, cursor]   # Chỉ này được init
# hoặc
ignored_ides: [codex]             # Tất cả NGOs trừ này được init

# File-level override
overrides:
  fileYYYY.md:
    supported_ides: []              # exclude file này
  fileZZZZ.md:
    supported_ides: [claude]        # override - chỉ claude
```

### Default Rules

| Condition | Behavior |
|-----------|----------|
| No schema.yaml | Init ALL IDEs (copy as-is) |
| schema.yaml, no `supported_ides`/`ignored_ides` | Init ALL IDEs |
| `supported_ides: []` | Skip - don't init anywhere |
| `supported_ides: [a, b]` | Init only to a, b |
| `ignored_ides: [x]` | Init to all EXCEPT x |
| Both `supported_ides` AND `ignored_ides` | **ERROR** - throw error |

### 5 Trường Hợp

| # | Trường hợp | Giải pháp |
|---|------------|------------|
| 1 | Folder không init cho IDE nào | `supported_ides: []` |
| 2 | Folder chỉ init cho 1 số IDE | `supported_ides: [claude]` |
| 3 | File trong folder không init cho IDE nào | `overrides: { file.md: { supported_ides: [] } }` |
| 4 | Nested folder không init cho IDE nào | `supported_ides: []` trong nested/schema.yaml |
| 5 | Format MD → TOML cho Codex agents | module.yaml convert |

---

## module.yaml — Module Config + Format Conversion

```yaml
# artifacts/module.yaml

name: "QD Framework"
version: 1.0.0

# Format conversion (chỉ khi CẦN convert)
# Default = copy as-is (không cần định nghĩa)
convert:
  codex:
    "agents/**": toml     # artifacts/agents/**/*.md → TOML
    "subagents/**": toml  # artifacts/subagents/**/*.md → TOML
  # Tất cả others = copy as-is (default)
```

**Path matching:** Glob patterns relative to `artifacts/` root.

---

## platform-codes.yaml — IDE Target Mapping

Each IDE has its own target directory and artifact type mappings.

```yaml
# cli/ide/platform-codes.yaml

platforms:
  claude-code:
    name: "Claude Code"
    preferred: true
    installer:
      target_dir: ".claude"
      mappings:
        skills: "skills"
        commands: "commands"
        agents: "agents"
        subagents: "agents"

  cursor:
    name: "Cursor"
    preferred: true
    installer:
      target_dir: ".cursor"
      mappings:
        skills: "rules"
        commands: "rules"
        agents: "rules"
        subagents: "rules"

  windsurf:
    name: "Windsurf"
    installer:
      target_dir: ".windsurf"
      mappings:
        skills: "skills"
        commands: "commands"
        agents: "agents"
        subagents: "agents"

  codex:
    name: "Codex"
    installer:
      target_dir: ".codex"
      mappings:
        skills: "skills"
        commands: "commands"
        agents: "agents"
        subagents: "agents"
```

### Mapping Rules

- `mappings.<type>: <target>` — maps `artifacts/<type>/` to `<target>/` in IDE dir
- Default target = `type` name if not specified
- Cursor merges skills/commands/agents into `rules/`

---

## Phase-Based Init (Claudekit Pattern)

```
qd init
  → Phase 1: Collect config from module.yaml
  → Phase 2: Detect selected IDEs + load platform-codes.yaml
  → Phase 3: Walk artifacts tree
       ├── Read schema.yaml at each level (cascade + override)
       ├── Apply overrides for individual files
       └── Skip _qd-output/ (hardcoded exclude)
  → Phase 4: Copy/convert to IDE targets
       ├── Apply mappings from platform-codes.yaml
       ├── Convert format if convert rule exists (MD → TOML)
       └── Skip files with supported_ides: [] or ignored_ides excludes
  → Phase 5: Create _qd-output/ directory
  → Phase 6: Display summary
```

---

## Example: After `qd init --ides claude,cursor`

```
myproject/
├── _qd-output/                     # Khuym workflow outputs
│   └── learnings/
├── .claude/
│   ├── skills/                     # artifacts/skills/** → .claude/skills/
│   ├── commands/                   # artifacts/commands/** → .claude/commands/
│   └── agents/                     # artifacts/agents/** → .claude/agents/
├── .cursor/
│   └── rules/                     # ALL artifacts types → .cursor/rules/
│       ├── skills/
│       ├── commands/
│       └── agents/
└── src/
```

---

## File System

```
artifacts/
├── module.yaml              # Global: name, version, convert rules
├── schema.yaml             # (optional) root-level IDE selection
├── skills/
│   ├── schema.yaml         # override cho skills folder
│   ├── exploring/
│   │   └── SKILL.md
│   └── planning/
│       └── SKILL.md
├── commands/
│   └── schema.yaml
├── agents/
│   └── schema.yaml
└── subagents/
    └── schema.yaml

cli/ide/
└── platform-codes.yaml     # IDE → target dir + artifact type mappings

_qd-output/                 # (created at phase 5, excluded from walk)
```

---

## See Also

- `cli/ide/manager.ts` — IDE discovery and setup
- `cli/ide/_config-driven.ts` — Config-driven skill installation
- `cli/ide/platform-codes.yaml` — IDE target directory + mapping
- `artifacts/module.yaml` — Module configuration + convert rules
- `references/BMAD-METHOD-main/tools/installer/` — BMAD config-driven IDE setup reference
- `references/claudekit-engineer-main/` — Claudekit phase-based architecture reference
