# Test Suite

Tests for installer behavior that is still active in the current `cli/` codebase.

## Run

```bash
npm run test:install
```

## Active Tests

- **File**: `test/test-installation-components.ts`
- **Covers**:
  - platform code loading
  - IDE list initialization
  - native skill installation path smoke checks
  - `SKILL.md` parsing validation in manifest generator

## Notes

- Legacy tests tied to removed paths/features (`tools/installer`, file-ref CSV validator, old workflow regex checks) were intentionally removed.
