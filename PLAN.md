# QD 2-Part Architecture Migration Plan

## Overview

Split the current `qd` package into two independent release lines:

| Component | Where | Tag Format | Trigger |
|-----------|-------|-----------|---------|
| CLI (`qdspec`) | npmjs.org | `0.1.0` (semver) | `git tag 0.1.0` |
| Artifacts | GitHub Releases | `v0.1.0` (semver with v prefix) | `git tag v0.1.0` |

**Key invariant:** CLI and artifacts are versioned independently. Any CLI version works with any artifacts version. Dev mode uses local `artifacts/` without GitHub.

---

## Current State

```
qd/
├── src/
│   ├── commands/init.ts          # calls Installer.install()
│   ├── domains/installation/
│   │   └── installer.ts         # phase3WalkArtifacts hardcodes projectDir/artifacts
│   ├── helpers/
│   └── shared/
├── artifacts/                   # local only, NOT published anywhere
├── package.json                 # was published to npm (now removed)
└── dist/                       # npm publish target
```

Current init flow:
1. IDE selection (interactive or `--ides` flag)
2. `Installer.install()` → hardcoded `path.join(projectDir, 'artifacts')`
3. Phase 3 walks local `artifacts/`
4. Phase 4 copies/merges to IDE targets
5. Manifest + gitignore

---

## Target State

```
qd/
├── src/
│   ├── commands/
│   │   ├── init.ts              # + version selection, + download
│   │   ├── status.ts           # unchanged (reads _qd/ only)
│   │   └── uninstall.ts         # unchanged (reads _qd/ only)
│   ├── domains/
│   │   ├── github/
│   │   │   ├── github-client.ts     # GitHub API + rate limit handling
│   │   │   ├── download.ts          # tarball download + extract + cache
│   │   │   └── version-selector.ts  # interactive version picker
│   │   ├── installation/
│   │   │   └── installer.ts        # artifactsDir injected (no longer hardcoded)
│   │   └── ide/
│   │       └── platform-codes.yaml
│   ├── helpers/
│   └── shared/
├── artifacts/                   # source for GitHub Release asset
├── dist/                        # CLI published to npm
└── .github/workflows/
    ├── publish-cli.yml          # triggers on semver tag (0.1.0)
    └── release-artifacts.yml    # triggers on v* tag (v0.1.0)
```

---

## Implementation Phases

### Phase 1: GitHub Client + Version Selector

**Files to create:**
- `src/domains/github/github-client.ts`
- `src/domains/github/download.ts`
- `src/domains/github/version-selector.ts`

**GitHubClient responsibilities:**
- `listReleases(repo, options)` — paginated list with prerelease support
- `getReleaseByTag(repo, tag)` — single release by tag
- `getLatestRelease(repo)` — latest stable release
- `downloadTarball(url, destDir)` — download + extract
- Rate limit detection with user-friendly error message

**VersionSelector responsibilities:**
- Fetch last N releases from GitHub API
- Present interactive clack picker with:
  - Last 10 stable releases
  - Toggle "include prereleases"
  - Manual tag entry option
- Return selected tag or `null` (user cancelled)

**Rate limit handling:**
```typescript
catch (error) {
  if (isRateLimitError(error)) {
    console.error(
      `GitHub API rate limit exceeded (60 req/hr for unauthenticated).\n` +
      `Set GITHUB_TOKEN env var for 5,000 req/hr,\n` +
      `or use --version <vX.Y.Z> to specify version directly.\n` +
      `Falling back to local artifacts/...`
    );
    return null; // signals fallback to local
  }
  throw error;
}
```

**GitHub repo constant:**
```typescript
const GITHUB_OWNER = 'quangdang46';
const GITHUB_REPO = 'qd';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const GITHUB_DOWNLOAD_BASE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags`;
```

---

### Phase 2: Download + Extract Logic

**download.ts responsibilities:**

1. **Cache:** Store downloaded tarballs in `~/.cache/qdspec/`
   ```typescript
   const CACHE_DIR = path.join(os.homedir(), '.cache', 'qdspec');
   ```
   Cache key includes tag + Git SHA of the archive for invalidation on re-tag:
   ```typescript
   // Cache path: ~/.cache/qdspec/v0.2.0-{sha}.tar.gz
   // Add --no-cache flag to bypass
   ```

2. **Download to temp:** `os.tmpdir() + '/qd-artifacts-xxxx'`

3. **Extract:** Use `tar` command via Node.js `child_process.exec` (works on macOS/Linux/Windows WSL). For native Windows without WSL, use `extract-zip` npm package (add as dependency). Detect platform and choose accordingly:
   ```typescript
   import { exec } from 'child_process';
   import { extract } from 'extract-zip';

   async function extractTarball(tarballPath: string, destDir: string) {
     // Unix-like: use tar
     if (process.platform !== 'win32') {
       await exec(`tar -xzf "${tarballPath}" -C "${destDir}"`, { cwd: destDir });
     } else {
       // Windows native: use extract-zip
       await extract(tarballPath, { dir: destDir });
     }
   }
   ```
   **Note:** Windows Subsystem for Linux (WSL) users — `npx qd init` runs under Node.js native Windows, not WSL bash. If native Windows support is needed, add `extract-zip` dependency. For MVP, WSL/Linux/macOS only.

4. **Dynamic path discovery:** GitHub archive structure is `qd-{tag}/artifacts/`, not `artifacts/` at root. Must find dynamically:
   ```typescript
   const entries = await fs.readdir(tempDir);
   const artifactsSubdir = entries.find(name =>
     name.startsWith('qd-') && fs.stat(path.join(tempDir, name)).isDirectory()
   );
   if (!artifactsSubdir) throw new Error('Invalid archive structure');
   return path.join(tempDir, artifactsSubdir, 'artifacts');
   ```

5. **Cleanup:** Remove temp dir after phase 3 walk is done (keep cache)

---

### Phase 3: Refactor Installer — Inject artifactsDir

**File to modify:** `src/domains/installation/installer.ts`

**Changes:**

1. Add `artifactsDir` to `install()` options:
   ```typescript
   async install(options = {}) {
     const {
       directory: projectDir,
       ides,
       artifactsDir,   // NEW: injected instead of hardcoded
       autoConfirm,
     } = options;

     // OLD (remove):
     // const artifactsDir = path.join(projectDir, 'artifacts');

     const artifacts = await this.phase3WalkArtifacts(artifactsDir, config);
     // ...
   }
   ```

2. Update `phase3WalkArtifacts` signature:
   ```typescript
   async phase3WalkArtifacts(artifactsDir, config) {
     // artifactsDir is now passed in — no more path.join(projectDir, 'artifacts')
   }
   ```

3. Update `phase1CollectConfig` — only use artifactsDir for `module.yaml`:
   ```typescript
   async phase1CollectConfig(projectDir, artifactsDir) {
     // module.yaml always comes from the resolved artifactsDir
     const modulePath = path.join(artifactsDir, 'module.yaml');
     // NEVER fallback to projectDir/artifacts — that would be confusing in production
     // If artifactsDir is invalid and has no module.yaml, config stays empty {} with a warning
   }
   ```

**No changes needed to:**
- `uninstall.ts` — reads `_qd/` manifest only
- `status.ts` — reads `_qd/` manifest only
- Phase 4 (copy to targets), Phase 5 (manifest), Phase 6 (gitignore) — unchanged

---

### Phase 4: Update init.ts

**File to modify:** `src/commands/init.ts`

**New flow:**

```
init command
│
├─ 1. Parse options (--ides, --directory, --version)
│
├─ 2. DEV MODE check
│     if (QD_ENV === 'development' || NODE_ENV === 'development') {
│       use local artifacts/ from projectDir
│     }
│
├─ 3. Determine artifactsDir
│     ├─ if --version flag → download specific tag
│     └─ else → interactive version selector
│         ├─ GitHub API works → show picker
│         └─ Rate limited or offline → fallback to local artifacts/ (if exists)
│
├─ 4. Pass artifactsDir to Installer.install()
│
└─ 5. Cleanup temp dir
```

**New options:**
```typescript
.option('--version <vX.Y.Z>', 'Install specific artifacts version from GitHub')
.option('--no-cache', 'Bypass artifact cache, re-download even if cached')
```

**Fallback logic:**
```typescript
async function resolveArtifactsDir(options) {
  const { version, projectDir } = options;

  // DEV mode: always use local
  if (isDevMode()) {
    const localPath = path.join(projectDir, 'artifacts');
    if (fs.pathExists(localPath)) return localPath;
    throw new Error('DEV mode requires local artifacts/ directory');
  }

  // Explicit version: download directly
  if (version) {
    return await downloadVersion(version);
  }

  // Interactive: fetch versions, show picker
  const versions = await fetchVersions();
  if (!versions) {
    // Rate limited: fallback to local
    const localPath = path.join(projectDir, 'artifacts');
    if (fs.pathExists(localPath)) {
      console.log('Falling back to local artifacts/');
      return localPath;
    }
    throw new Error('GitHub API unavailable and no local artifacts/ found');
  }

  const selected = await versionSelector.select(versions);
  return await downloadVersion(selected);
}
```

---

### Phase 5: package.json Updates

**Changes:**

1. Add `files` field to exclude `artifacts/` from npm:
   ```json
   {
     "files": [
       "dist",
       "src",
       "README.md",
       "package.json"
     ]
   }
   ```

2. Ensure `scripts.build` copies `platform-codes.yaml` to dist:
   ```json
   "build": "tsc -p tsconfig.json && cp src/domains/ide/platform-codes.yaml dist/domains/ide/"
   ```

3. Add `publishConfig`:
   ```json
   "publishConfig": {
     "access": "public",
     "registry": "https://registry.npmjs.org"
   }
   ```

---

### Phase 6: GitHub Actions Workflows

#### `publish-cli.yml`

**Tag filter note:** GitHub Actions `on.push.tags` glob patterns do not support negative matching. A `v`-prefixed tag will also trigger this workflow. Guard in job instead:

```yaml
name: Publish CLI to npm
on:
  push:
    tags:
      - '[0-9]+.[0-9]+.[0-9]+'   # matches both "1.0.0" and "v1.0.0"

jobs:
  publish:
    runs-on: ubuntu-latest
    # Guard: skip if v-prefixed tag (those are for artifacts releases)
    if: "!startsWith(github.ref_name, 'v')"
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### `release-artifacts.yml`

```yaml
name: Release Artifacts
on:
  push:
    tags:
      - 'spec-[0-9]+.[0-9]+.[0-9]+'   # spec prefix for artifacts

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Package artifacts
        run: |
          tar -czf qdspec-artifacts.tar.gz artifacts/
          zip -r qdspec-artifacts.zip artifacts/

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            qdspec-artifacts.tar.gz
            qdspec-artifacts.zip
          draft: false
          prerelease: ${{ contains(github.ref_name, '-') }}
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Note:** Both workflows use `if` guards as the tag pattern filter since GitHub Actions glob does not support negative patterns natively. `softprops/action-gh-release@v2` creates the release automatically when the tag is pushed — no manual release creation needed.

---

### Phase 7: First Release

```bash
# 1. Verify everything works in dev mode
QD_ENV=development npm run build && node dist/index.js init --ides claude-code

# 2. Tag artifacts (v prefix)
git tag -a v0.1.0 -m "Release artifacts v0.1.0"
git push origin v0.1.0
# → GitHub Release created automatically

# 3. Tag CLI (no prefix)
git tag -a 0.1.0 -m "Release CLI v0.1.0"
git push origin 0.1.0
# → npm publish triggered
```

---

## User-Facing Commands After Migration

```bash
# Install latest artifacts
npx qdspec init

# Install specific artifacts version
npx qdspec init --version v0.2.0

# Use specific IDEs
npx qdspec init --ides claude-code,cursor

# Combine options
npx qdspec init --ides claude-code --version v0.1.0

# Dev / local development
QD_ENV=development npx qdspec init
# or
NODE_ENV=development npx qdspec init

# Status / remove (unchanged)
npx qdspec status
npx qdspec remove
```

---

## Error Handling Summary

| Scenario | Behavior |
|----------|----------|
| GitHub API rate limit | Clear error message + fallback to local `artifacts/` |
| GitHub API error (network) | Clear error message + fallback to local `artifacts/` |
| Invalid tag specified (`--version foo`) | Error: "Tag not found" + show available versions |
| No local `artifacts/` and offline | Error: "Cannot init without network or local artifacts/" |
| DEV mode, no local `artifacts/` | Error: "DEV mode requires local artifacts/ directory" |
| Offline (no GitHub, no local) | Error with actionable message |

---

## Files Summary

| File | Action |
|------|--------|
| `src/domains/github/github-client.ts` | **CREATE** — GitHub API client |
| `src/domains/github/download.ts` | **CREATE** — download + extract + cache |
| `src/domains/github/version-selector.ts` | **CREATE** — interactive version picker |
| `src/domains/installation/installer.ts` | **MODIFY** — inject `artifactsDir` |
| `src/commands/init.ts` | **MODIFY** — version selection + download orchestration |
| `package.json` | **MODIFY** — add `files` exclusion |
| `.github/workflows/publish-cli.yml` | **CREATE** — npm publish workflow |
| `.github/workflows/release-artifacts.yml` | **CREATE** — GitHub release workflow |

**UNCHANGED:** `uninstall.ts`, `status.ts`, `phase4CopyToTargets`, `phase6WriteManifest`, `phaseAddToGitignore`, all helpers.

---

## Testing Checklist

- [ ] `QD_ENV=development qd init` uses local `artifacts/`
- [ ] `qd init` without args fetches from GitHub and shows version picker
- [ ] `qd init --version v0.1.0` downloads specific tag
- [ ] `qd init --version v0.1.0 --no-cache` bypasses cache and re-downloads
- [ ] Rate limit error shows clear message + fallback
- [ ] Offline + no local artifacts = actionable error
- [ ] `npm run build` succeeds
- [ ] `npm run test` passes
- [ ] Tag `v0.1.0` creates GitHub Release with zip/tar.gz
- [ ] Tag `0.1.0` publishes to npm
- [ ] `qd status` still works
- [ ] `qd remove` still works
- [ ] Installed artifacts land in correct `.claude/` subdirs
- [ ] `AGENTS.template.md` merges correctly into `AGENTS.md`
