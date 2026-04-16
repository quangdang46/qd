# QD Architecture

> QD — Quick Development Framework

## Overview

QD is a multi-agent development framework that installs artifacts (agents, skills, commands, workflows) into AI coding tools (providers) like Claude Code, OpenCode, Codex, Cursor, etc.

The framework uses a **module-based installation** system where:
- `artifacts/` — contains all installable artifacts
- `module.yaml` — defines module configuration and directories to create

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
├── module.yaml                 # Module configuration
├── module-help.csv            # Module help/registry
│
├── agents/                   # Agent artifacts (flat .md files)
│   ├── atlas.md
│   ├── hephaestus.md
│   └── sisyphus.md
│
├── skills/                   # Skill artifacts (folder + SKILL.md)
│   └── <skill-name>/
│       └── SKILL.md
│
├── commands/                 # Command artifacts (flat .md files)
│   ├── cancel-ralph.md
│   ├── handoff.md
│   └── ...
│
└── workflows/               # Workflow artifacts (folder structure)
    └── <workflow-name>/
        └── ...
```

---

## Manifest Files

Skills use Markdown with YAML frontmatter:

```markdown
---
name: skill-name
description: "Skill description"
---

# Skill Name

Content...
```

### Frontmatter Fields

```yaml
---
name: <name>                    # Required - unique identifier
description: "<description>"    # Required - brief description
argumentHint: <hint>           # Optional - for commands
agentType: <type>             # Optional - for agents
---
```

---

## Content Transform

Artifacts use Markdown with YAML frontmatter for metadata. Content is provider-agnostic.

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
├── core/
│   ├── installer.ts          # Main installer
│   ├── manifest.ts
│   └── config.ts
│
└── commands/
    ├── install.ts
    ├── uninstall.ts
    └── status.ts
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

- Agents: flat `.md` files in `agents/` directory
- Skills: folder with `SKILL.md` inside
- Commands: flat `.md` files in `commands/` directory
- Workflows: folder structure in `workflows/` directory
- Module config: `module.yaml` at artifacts root

---

## See Also

- [CLI Reference](./cli/README.md)
- [Provider Adapters](./cli/platforms/)
- [Schemas](./cli/schemas/)
