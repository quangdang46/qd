# QD Architecture

> QD — Quick Development Framework

## Overview

QD is a multi-agent development framework that installs skill-based artifacts into AI coding tools (providers) like Claude Code, OpenCode, Codex, Cursor, etc.

## Core Concepts

### Providers

Providers are AI coding tools that consume skill artifacts. Supported providers are defined in `cli/ide/platform-codes.yaml`.

| Provider | Target Directory | Command Syntax |
|---|---|---|
| Claude Code | `.claude/skills/` | `/skill-name` |
| OpenCode | `.opencode/skills/` | `skill({name: "x"})` |
| Codex | `.agents/skills/` | `$skill` |
| Cursor | `.cursor/skills/` | `/skill-name` |

### Artifacts

Artifacts are the installable units — agents, skills, commands, workflows. They live in `artifacts/` and are installed to provider-specific directories.

### Modules

Modules are groups of artifacts with shared configuration. Each module has:
- `module.yaml` — configuration and variables
- `module-help.csv` — skill registry

---

## Directory Structure

```
artifacts/
├── module.yaml                 # Root module config
├── module-help.csv            # Root skill registry
│
├── agents/                   # Agent artifacts
│   └── <agent-name>/
│       ├── SKILL.md
│       ├── qd-skill-manifest.yaml
│       │   └── platforms: [claude-code]
│       └── resources/
│           ├── knowledge/    # Fragments
│           │   ├── fragment.md
│           │   └── ...
│           └── <agent>-index.csv
│
├── skills/                   # Skill artifacts
│   └── <skill-name>/
│       ├── SKILL.md
│       ├── qd-skill-manifest.yaml
│       ├── platforms.yaml    # Path → platform mapping
│       ├── assets/
│       │   └── <path>/.qd-platforms.yaml  # File-level override
│       ├── references/
│       └── scripts/
│
├── commands/                 # Command artifacts
│   └── <command-name>/
│       └── ...
│
└── workflows/               # Workflow artifacts
    └── <workflow-name>/
        ├── workflow.yaml
        ├── workflow.md
        └── steps/
            └── step-*.md
```

---

## Manifest Files

### `qd-skill-manifest.yaml`

```yaml
type: agent | skill | command | workflow
name: <name>
displayName: <display>
title: <title>
icon: "<emoji>"
platforms:
  supported: [claude-code, cursor]
  # OR
  unsupported: [opencode]
capabilities: "<list of capabilities>"
canonicalId: <unique-id>
```

### `platforms.yaml` (skill root)

```yaml
# Path → platform mapping
paths:
  <relative-path>:
    platforms: [claude-code]  # or ["*"] for all
  <another-path>:
    platforms: ["*"]
```

### `.qd-platforms.yaml` (file-level override)

```yaml
platforms:
  supported: [claude-code]
  # OR
  unsupported: [opencode, codex]
```

---

## Content Transform

SKILL.md content uses IF/ENDIF preprocessor:

```markdown
## Usage

<!-- IF claude-code -->
Run: /qd:skill-name
<!-- END -->

<!-- IF opencode -->
Run: skill({ name: "skill-name" })
<!-- END -->

<!-- IF codex -->
Run: $skill-name
<!-- END -->
```

Adapter transforms content at install time based on target provider.

---

## CLI Structure

```
cli/
├── ide/
│   ├── platform-codes.yaml    # Provider registry
│   ├── platform-codes.ts
│   ├── manager.ts
│   └── _config-driven.ts     # IDE-specific installer
│
├── platforms/                # Provider adapters
│   ├── adapter.ts           # Interface
│   ├── claude-code.ts
│   ├── opencode.ts
│   ├── codex.ts
│   └── windsurf.ts
│
├── schemas/                   # JSON Schemas
│   ├── platforms.schema.json
│   ├── skill-manifest.schema.json
│   └── module.schema.json
│
├── core/
│   ├── installer.ts          # Main installer
│   ├── manifest.ts
│   └── config.ts
│
├── commands/
│   ├── install.ts
│   ├── uninstall.ts
│   └── status.ts
│
└── validate-schemas.ts       # Schema validation CLI
```

---

## Tests

```
test/
├── schemas/                   # JSON Schema validation
│   ├── platforms.test.ts
│   ├── skill-manifest.test.ts
│   └── module.test.ts
│
├── install/                  # Integration tests
│   ├── create-artifacts.test.ts   # Create real structure
│   ├── validate-structure.test.ts  # Validate structure
│   └── cleanup.test.ts           # Cleanup
│
└── platform-filter/          # Platform filtering tests
    ├── platforms-yaml.test.ts
    └── adapter-transform.test.ts
```

---

## Design Principles

1. **Convention over configuration** — sensible defaults
2. **Platform-first** — artifacts designed for multi-provider install
3. **Lazy loading** — only load what's needed (index files)
4. **Validation at install** — schemas validate before copy
5. **Graceful degradation** — unsupported features skip without error

---

## Naming Convention

- Skill folders: kebab-case (`quick-dev`, `agent-builder`)
- Agent names: kebab-case (`qd-tea`, `qd-quick-dev`)
- Manifest file: `qd-skill-manifest.yaml` (not `bmad-`)
- CLI config folder: `.qd/` (not `_bmad/`)

---

## See Also

- [CLI Reference](./cli/README.md)
- [Provider Adapters](./cli/platforms/)
- [Schemas](./cli/schemas/)
