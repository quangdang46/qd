# QD Framework

**AI-Driven Development Methodology** - A breakthrough method for agile development powered by AI agents.

## Quick Start

```bash
# Initialize QD for Claude Code
npx qdspec init --ides claude-code

# Or initialize for multiple IDEs
npx qdspec init --ides claude-code,cursor,codex
```

## Installation

### From npm (production)

```bash
npm install -g qdspec
qdspec init --ides <your-ide>
```

### Development Mode

```bash
git clone https://github.com/quangdang46/qd.git
cd qd
pnpm install
pnpm build

# Run in dev mode (artifacts downloaded from GitHub Releases at init)
# Use QD_SPEC_PATH=/path/to/spec/artifacts for local artifacts
qdspec init --ides claude-code
```

## CLI Commands

### `qdspec init`

Initialize QD artifacts for selected IDEs.

```bash
qdspec init --ides claude-code,cursor,codex  # Initialize for multiple IDEs
qdspec init --ides claude-code --version v0.1.0  # Install specific version
qdspec init --ides cursor --no-cache  # Bypass cache
qdspec init --directory /path/to/project  # Initialize in specific directory
```

### `qdspec status`

Display installation status.

```bash
qdspec status  # Check current directory
qdspec status --directory /path/to/project  # Check specific directory
```

### `qdspec  remove`

Remove QD from a project.

```bash
qdspec remove  # Interactive mode
qdspec remove --yes  # Remove without prompting
qdspec remove --directory /path/to/project  # Remove from specific directory
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
├── src/               # Source code
│   ├── commands/      # CLI commands
│   ├── domains/       # Domain logic
│   └── ...
├── dist/              # Compiled output
└── test/              # Test files
```

## Versioning

QD uses a two-part release system:

1. **CLI** - Published to npm
2. **Spec** - Published to GitHub Releases of the spec repository

When you run `qdspec init`, the CLI downloads artifacts from the latest GitHub release of the spec repository.

## License

MIT