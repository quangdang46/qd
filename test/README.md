# QD Test Suite

Tests for QD framework components.

## Run

```bash
npm run test:all
```

Or run individual test suites:

```bash
npx ts-node --esm test/test-schema-validation.ts
npx ts-node --esm test/test-platform-filter.ts
```

## Test Suites

### Schema Validation (`test-schema-validation.ts`)
Tests JSON schemas for:
- `qd-skill-manifest.yaml` - skill/agent manifest validation
- `platforms.yaml` - platform path restrictions
- `module.yaml` - module configuration

### Platform Filter (`test-platform-filter.ts`)
Tests provider adapters:
- Cursor adapter - IF/ENDIF processing, all types supported
- Claude Code adapter - IF/ENDIF processing
- Codex adapter - command transformation (`/qd:skill` → `$skill`), skill/workflow only
- OpenCode adapter - command transformation (`/qd:skill` → `skill({name})`), skill/command only
- Platform filtering via `shouldInstall()` manifest check

## Schema Definitions

Located in `cli/schemas/`:
- `skill-manifest.schema.json` - qd-skill-manifest.yaml
- `platforms.schema.json` - platforms.yaml
- `module.schema.json` - module.yaml
