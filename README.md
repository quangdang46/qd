# QD Framework

**AI-Driven Development Methodology** - A breakthrough method for agile development powered by AI agents.

## Quick Start

```bash
# Initialize QD for Claude Code
npx qd init --ides claude-code

# Or initialize for multiple IDEs
npx qd init --ides claude-code,cursor,codex
```

## Installation

### From npm (production)

```bash
npm install -g qdspec
qd init --ides <your-ide>
```

### Development Mode

```bash
git clone https://github.com/quangdang46/qd.git
cd qd
pnpm install
pnpm build

# Run in dev mode (uses local artifacts)
QD_ENV=development qd init --ides claude-code
```

## CLI Commands

### `qd init`

Initialize QD artifacts for selected IDEs.

```bash
qd init --ides claude-code,cursor,codex  # Initialize for multiple IDEs
qd init --ides claude-code --version v0.1.0  # Install specific version
qd init --ides cursor --no-cache  # Bypass cache
qd init --directory /path/to/project  # Initialize in specific directory
```

### `qd status`

Display installation status.

```bash
qd status  # Check current directory
qd status --directory /path/to/project  # Check specific directory
```

### `qd remove`

Remove QD from a project.

```bash
qd remove  # Interactive mode
qd remove --yes  # Remove without prompting
qd remove --directory /path/to/project  # Remove from specific directory
```

## Supported IDEs

| IDE | Command |
|-----|---------|
| Claude Code | `--ides claude-code` |
| Cursor | `--ides cursor` |
| Codex | `--ides codex` |
| Windsurf | `--ides windsurf` |
| GitHub Copilot | `--ides github-copilot` |
| Gemini CLI | `--ides gemini` |
| And 20+ more... |

Run `qd init --ides` to see all available IDEs.

## Architecture

```
qd/
├── artifacts/          # Installation artifacts
│   ├── skills/         # QD skills
│   ├── hooks/         # Session hooks
│   ├── agents/        # Agent definitions
│   └── ...
├── src/               # Source code
│   ├── commands/      # CLI commands
│   ├── domains/       # Domain logic
│   └── ...
└── dist/              # Compiled output
```

## Configuration

### module.yaml

Located in `artifacts/module.yaml`, controls installation behavior:

```yaml
code: qd
name: "QD Framework"
description: "AI-driven development methodology"

# Files to skip during installation
skip:
  - "*.example.yaml"
  - "module.yaml"
  - "schema.yaml"

# Format conversion rules
convert:
  codex:
    "agents/**": toml
```

## Versioning

QD uses a two-part release system:

1. **CLI** - Published to npm with `cli-*.*.*` tags (e.g., `cli-0.1.1`)
2. **Artifacts** - Published to GitHub Releases with `spec-*.*.*` tags (e.g., `spec-0.1.0`)

When you run `qd init --version spec-0.1.0`, the CLI downloads artifacts from the matching GitHub release.

## License

MIT