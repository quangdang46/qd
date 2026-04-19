# QD Project Structure

## QD Vision

**QD is a CLI tool that generates implementations for multiple developer IDEs (integrated development environments) from a single source of artifacts.**
- One central artifacts directory → multiple IDE output folders (`.claude`, `.cursor`, `.windsurf`, etc.)
- The internal `_qd/` directory holds runtime data and a `history/` with per-feature records and learnings.
- Artifacts are versioned independently from the CLI and published as GitHub Releases.

---

## Release Architecture

QD uses a **two-part release** model:

| Component | Where | Tag Format | Trigger |
|-----------|-------|-----------|---------|
| CLI (`qdspec`) | npmjs.org | `0.1.0` (semver) | `git tag 0.1.0` |
| Artifacts | GitHub Releases | `v0.1.0` (semver with v prefix) | `git tag v0.1.0` |

**Key invariant:** CLI and artifacts are versioned independently. Any CLI version works with any artifacts version. Dev mode (`QD_ENV=development`) uses local `artifacts/` without GitHub.

```
Release flow:
  git tag v0.1.0 && git push  →  GitHub Release with artifacts/ as .zip/.tar.gz
  git tag 0.1.0  && git push  →  npm publish (CLI only, excludes artifacts/)
```

---

## Before QD Init (Standard Project Layout)

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

Running `qd init` fetches artifacts from GitHub (or local in dev mode) and installs:

```
project/
├── _qd/                        # QD runtime files & history (created at runtime)
│   └── history/
├── .claude/                    # (if Claude Code is selected)
│   ├── skills/
│   ├── commands/
│   └── agents/
├── .cursor/                    # (if Cursor is selected)
│   ├── rules/                  # Cursor groups all artifacts here
│   └── ...
├── .windsurf/                  # (if Windsurf is selected)
│   ├── skills/
│   ├── commands/
│   └── agents/
└── ... (other selected IDEs)
```

---

## Key Architecture Decisions

| Decision                                | Status   | Notes                                                  |
|------------------------------------------|----------|--------------------------------------------------------|
| `_qd/` is internal only                  | CHOSEN   | Not exposed to the user                                |
| `_qd/` used for workflow                | CHOSEN   | Used for storing history and runtime data              |
| No `config.json` file                    | CHOSEN   | No prompts for username, language, project name        |
| CLI IDE logic (in `cli/ide/`) is kept    | CHOSEN   | Current CLI implementation remains                      |
| `schema.yaml` in folders + overrides     | CHOSEN   | Controls IDE selection per artifact folder/file         |
| `module.yaml` for format conversion      | CHOSEN   | Used for rules such as markdown→TOML for Codex         |
| Glob pattern for convert paths           | CHOSEN   | Enables clear file matching for format conversion       |
| Conflict (supported+ignored IDEs) = error| CHOSEN   | Cannot specify both; throws an error                   |
| `platform-codes.yaml` controls mapping   | CHOSEN   | Maps artifact type to IDE subdir                       |
| Artifacts versioned separately from CLI  | CHOSEN   | `v*.*.*` GitHub tags for artifacts, semver for CLI   |
| Dev mode uses local `artifacts/`        | CHOSEN   | `QD_ENV=development` bypasses GitHub fetch           |

---

## Directory Breakdown

### `_qd/` — QD Runtime & History

| Path           | Description                                 |
|----------------|---------------------------------------------|
| `CONTEXT.md`   | Records locked decisions from exploration    |
| `discovery.md` | Stores research findings                     |
| `approach.md`  | Contains the chosen technical approach       |
| `phase-plan.md`| Lists breakdown of planned phases            |
| `learnings/`   | Dated learning entries (format: YYYY-MM-DD-*.md) |

**Note:** `_qd/` is created only at runtime and excluded from artifact processing.

---

## Artifacts Directory Structure

`artifacts/` contains **arbitrary files and folders** — the structure is flexible and defined by the project author. There is no fixed schema. `module.yaml` and `schema.yaml` at each level are the **only** files that control how contents are processed and distributed to IDEs.

```
artifacts/
├── module.yaml                 # (optional) Module config — format conversion rules + artifact type mappings
├── schema.yaml                 # (optional) Root-level IDE selection (inherited by all subdirs unless overridden)
├── skills/                     # Any folder — processed by phase3WalkArtifacts
│   ├── schema.yaml            # IDE selection for this subtree (overrides parent)
│   ├── planning/
│   │   └── SKILL.md
│   └── exploring/
│       └── SKILL.md
├── commands/                   # Any folder name — type determined by parent dir
│   └── ...
├── agents/                     # Any folder — no enforced naming
│   └── atlas.md
├── docs/                       # Any folder
│   └── ...
├── prompts/                    # Any folder
├── .mcp.json                   # MCP config at root level
├── AGENTS.template.md          # Template merged into AGENTS.md on install
└── ...                         # Any files or folders — module.yaml decides what to do with each
```

**Key principle:** `module.yaml` is the authority. It defines:
- Which artifact types exist and how they're mapped to IDE subdirectories
- Format conversion rules (e.g., `md→toml` for Codex agents)
- Glob patterns to match files and apply specific handling

**Note:** `artifacts/` is the source for GitHub Release assets. It is NOT published to npm.

---

## `schema.yaml` — IDE Selection Rules

Each folder can contain a `schema.yaml` to specify which IDEs receive its content.

### Inheritance and Placement

```
artifacts/
├── schema.yaml                # Root-level (inherited by all subdirs unless overridden)
├── skills/
│   ├── schema.yaml           # Overrides root for everything in 'skills/'
│   ├── exploring/
│   │   └── SKILL.md         # inherits settings from skills/schema.yaml
│   └── NESTED/
│       ├── schema.yaml       # Overrides skills/schema.yaml for this folder
│       └── file.md           # inherits from NESTED/schema.yaml
└── commands/
    └── schema.yaml
```

### IDE Selection Options

```yaml
# artifacts/FOLDER/schema.yaml

# Select IDEs with one of the following:
supported_ides: [claude, cursor]   # Only these IDEs will receive this folder
# or
ignored_ides: [codex]             # All IDEs except these will receive this folder

# File-level overrides
overrides:
  fileYYYY.md:
    supported_ides: []              # Exclude this file entirely
  fileZZZZ.md:
    supported_ides: [claude]        # Only Claude gets this file
```

### Default Behavior

| Condition                                | Result                                    |
|-------------------------------------------|-------------------------------------------|
| No schema.yaml present                    | All IDEs get the contents (copied as-is)  |
| schema.yaml, but no `supported_ides`/`ignored_ides` | All IDEs get contents                    |
| `supported_ides: []`                      | Skip: no IDEs get this content            |
| `supported_ides: [a, b]`                  | Only IDEs a and b receive this content    |
| `ignored_ides: [x]`                       | All except x receive the content          |
| Both `supported_ides` AND `ignored_ides` set | **ERROR** (this is not allowed)          |

### 5 Example Scenarios

| # | Situation                               | Solution (in schema.yaml)                           |
|---|-----------------------------------------|-----------------------------------------------------|
| 1 | Folder not included in any IDE          | `supported_ides: []`                                |
| 2 | Folder only included in some IDEs       | `supported_ides: [claude]`                          |
| 3 | Specific file not included in any IDE   | `overrides: { file.md: { supported_ides: [] } }`    |
| 4 | Nested folder not included in any IDE   | Use `supported_ides: []` in nested/schema.yaml       |
| 5 | Convert MD→TOML for Codex agents        | Use `module.yaml` convert rule                      |

---

## `module.yaml` — Module Configuration & Conversion

```yaml
# artifacts/module.yaml

name: "QD Framework"
version: 1.0.0

# Optional: Only define if you want some files converted during install
convert:
  codex:
    "agents/**": toml     # All artifacts/agents/**/*.md → TOML
    "subagents/**": toml  # All artifacts/subagents/**/*.md → TOML
  # Everything else is copied as-is by default
```

**Glob patterns** are relative to the `artifacts/` directory.

---

## `platform-codes.yaml` — IDE Output Mapping

Each IDE specifies its target directory and how artifact types map into that directory.

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

- `mappings.<type>: <target>` — Maps contents of `artifacts/<type>/` to the specified `<target>/` in the IDE's folder.
- If not specified, the default target uses the artifact folder name.
- For Cursor, everything goes into `rules/`, combining all types.

---

## Phase-Based Initialization (`qd init` Process Overview)

```
qd init
  → Phase 1: Read config from module.yaml (from resolved artifactsDir)
  → Phase 2: Determine selected IDEs and load platform-codes.yaml
  → Phase 3: Traverse artifacts directory tree (from GitHub tarball or local)
       ├── Read schema.yaml at every level (apply inheritance/overrides)
       ├── Apply file-level overrides
       └── Always skip _qd/ (hardcoded exclusion)
  → Phase 4: Copy or convert files for each selected IDE
       ├── Use mappings from platform-codes.yaml
       ├── Convert formats if convert rules exist (e.g., MD→TOML)
       └── Skip files/folders based on supported_ides/ignored_ides
  → Phase 5: (No output for _qd/ — created during runtime only)
  → Phase 6: Show summary of operation
```

---

## Init Flow — Version Selection & Download

```
qd init
  │
  ├─ [DEV MODE] QD_ENV=development
  │     → use local ./artifacts/ directly, skip all GitHub calls
  │
  ├─ 1. IDE selection (interactive or --ides flag)
  │
  ├─ 2. Version selection
  │     ├─ API: GET /repos/quangdang46/qd/releases
  │     ├─ Rate limit? → show error + fallback hint
  │     └─ Fallback: use local artifacts/ (if exists)
  │
  ├─ 3. Download + Extract
  │     ├─ URL: https://github.com/.../archive/refs/tags/v0.2.0.tar.gz
  │     ├─ Extract to temp
  │     ├─ Discover: find "qd-*/artifacts/" subdir dynamically
  │     └─ Cache in ~/.cache/qdspec/ (with tag+sha key)
  │
  ├─ 4. Walk artifacts (Phase 3 — unchanged logic, different source)
  │
  ├─ 5..7. Copy/Merge/Manifest (unchanged logic)
  │
  └─ 8. Cleanup temp dir (keep cache)
```

---

## Output Example: After `qd init --ides claude,cursor`

```
myproject/
├── _qd/                     # QD runtime & history (runtime only, not installed)
│   └── history/
│       └── learnings/
├── .claude/
│   ├── skills/              # artifacts/skills/** → .claude/skills/
│   ├── commands/            # artifacts/commands/** → .claude/commands/
│   └── agents/              # artifacts/agents/** → .claude/agents/
├── .cursor/
│   └── rules/               # All artifact types → .cursor/rules/
│       ├── skills/
│       ├── commands/
│       └── agents/
└── src/
```

---

## Directory & File Reference

```
qd/                          # Repository root
├── src/
│   ├── commands/
│   │   ├── init.ts              # init command (modified: version selection + download)
│   │   ├── status.ts            # unchanged (reads _qd/ only)
│   │   └── uninstall.ts         # unchanged (reads _qd/ only)
│   ├── domains/
│   │   ├── github/              # GitHub API + version selection
│   │   │   ├── github-client.ts # GitHub REST API client
│   │   │   ├── download.ts      # tarball download + extract + cache
│   │   │   └── version-selector.ts # interactive version picker
│   │   ├── installation/
│   │   │   └── installer.ts     # 6-phase installer (artifactsDir injected)
│   │   └── ide/
│   │       └── platform-codes.yaml # IDE target mapping
│   ├── helpers/
│   └── shared/
├── artifacts/                   # Source for GitHub Release asset
│   ├── module.yaml
│   ├── skills/
│   ├── commands/
│   └── agents/
├── dist/                       # CLI published to npm (excludes artifacts/)
└── .github/workflows/
    ├── publish-cli.yml         # on: semver tag → npm publish
    └── release-artifacts.yml   # on: v* tag → GitHub Release

_qd/                        # (created at runtime, excluded from artifact walking)
```

---

## See Also

- `cli/ide/manager.ts`: IDE discovery and project setup logic
- `cli/ide/_config-driven.ts`: Configuration-based skill installation
- `cli/ide/platform-codes.yaml`: IDE target mapping
- `artifacts/module.yaml`: Module config & format conversion rules
- `PLAN.md`: Full 2-part architecture migration plan
