# QD Framework

**AI-Driven Development Methodology** - A simple installer that places `.IDE` artifacts into your chosen AI IDE directories.

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
# Use QD_SPEC_PATH=/path/to/spec/.IDE for local artifacts
qdspec init --ides claude-code
```

## CLI Commands

### `qdspec init`

Initialize QD artifacts for selected IDEs.
This command is stateless:

- it does not create a `.qd` folder
- it does not write a manifest
- it does not install a remove/status management layer

```bash
qdspec init --ides claude-code,cursor,codex  # Initialize for multiple IDEs
qdspec init --ides claude-code --version v0.1.0  # Install specific version
qdspec init --ides cursor --no-cache  # Bypass cache
qdspec init --directory /path/to/project  # Initialize in specific directory
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

Run `qdspec init --ides` to see all available IDEs.

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
