# BMad CLI Tool

## Development (TypeScript)

- Sources live in `cli/`. Build outputs go to `dist/` (`npm run build:installer`).
- The published `bin` entry points at `dist/bmad-cli.js`. After editing `.ts` files, rebuild before running `bmad` locally.
- Static data such as `cli/ide/platform-codes.yaml` stays in `cli/ide/` (not emitted to `dist/`); loaders resolve paths for both source and built runtime.

## Modules

The CLI installs one built-in module from this repository: `bmad` (source stored under `src/bmm-skills`).

## Post-Install Notes

Modules can display setup guidance to users after configuration is collected during `npx bmad install`. Notes are defined in the module's own `module.yaml` - no changes to the installer are needed.

### Simple Format

Always displayed after the module is configured:

```yaml
post-install-notes: |
  Thank you for choosing the XYZ Cool Module
  For Support about this Module call 555-1212
```

### Conditional Format

Display different messages based on a config question's answer:

```yaml
post-install-notes:
  config_key_name:
    value1: |
      Instructions for value1...
    value2: |
      Instructions for value2...
```

Values without an entry (e.g., `none`) display nothing. Multiple config keys can each have their own conditional notes.

### Example: TEA Module

The TEA module uses the conditional format keyed on `tea_browser_automation`:

```yaml
post-install-notes:
  tea_browser_automation:
    cli: |
      Playwright CLI Setup:
        npm install -g @playwright/cli@latest
        playwright-cli install --skills
    mcp: |
      Playwright MCP Setup (two servers):
        1. playwright    — npx @playwright/mcp@latest
        2. playwright-test — npx playwright run-test-mcp-server
    auto: |
      Playwright CLI Setup:
        ...
      Playwright MCP Setup (two servers):
        ...
```

When a user selects `auto`, they see both CLI and MCP instructions. When they select `none`, nothing is shown.
