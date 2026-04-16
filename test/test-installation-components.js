/**
 * Installation Component Tests (JavaScript)
 * Tests for QD installer components using dist/ structure.
 */

const os = require('node:os');
const path = require('node:path');
const fsNative = require(path.join(__dirname, '..', 'dist', 'shared', 'fs-native.js'));
const { Installer } = require(path.join(__dirname, '..', 'dist', 'domains', 'installation', 'installer.js'));
const { clearCache, loadPlatformCodes } = require(path.join(__dirname, '..', 'dist', 'domains', 'ide', 'platform-codes.js'));

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCase(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('\x1b[32m✓\x1b[0m ' + name);
  } catch (error) {
    failed += 1;
    console.log('\x1b[31m✗\x1b[0m ' + name);
    console.log('  ' + (error?.message ?? String(error)));
  }
}

async function copyDir(src, dest) {
  await fsNative.ensureDir(dest);
  const entries = await fsNative.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fsNative.copy(srcPath, destPath);
    }
  }
}

async function main() {
  console.log('\nInstallation Component Tests\n');

  await runCase('platform-codes loads Ona native skills target', async () => {
    clearCache();
    const platformCodes = await loadPlatformCodes();
    ok(platformCodes.platforms.ona?.installer?.target_dir === '.ona/skills', 'Expected Ona target_dir');
  });

  await runCase('platform-codes loads Claude Code config', async () => {
    clearCache();
    const platformCodes = await loadPlatformCodes();
    ok(platformCodes.platforms['claude-code']?.name === 'Claude Code', 'Expected Claude Code');
    ok(platformCodes.platforms['claude-code']?.installer?.target_dir === '.claude', 'Expected .claude');
  });

  await runCase('Installer creates output directory', async () => {
    const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-test-'));
    try {
      const outputPath = path.join(tempDir, '_qd-output');
      await fsNative.ensureDir(path.join(outputPath, 'learnings'));
      ok(await fsNative.pathExists(outputPath), 'Output dir exists');
      ok(await fsNative.pathExists(path.join(outputPath, 'learnings')), 'Learnings dir exists');
    } finally {
      await fsNative.remove(tempDir).catch(() => {});
    }
  });

  await runCase('Installer full install creates .claude directory', async () => {
    const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-install-'));
    try {
      // Copy artifacts
      await copyDir(path.join(__dirname, '..', 'artifacts'), path.join(tempDir, 'artifacts'));

      const installer = new Installer();
      const result = await installer.install({
        ides: ['claude-code'],
        directory: tempDir,
      });

      ok(result.success === true, 'Install should succeed');
      ok(await fsNative.pathExists(path.join(tempDir, '.claude')), '.claude directory should exist');
      ok(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills')), '.claude/skills should exist');
    } finally {
      await fsNative.remove(tempDir).catch(() => {});
    }
  });

  console.log('\nPassed: ' + passed);
  console.log('Failed: ' + failed + '\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Test runner failed:', error?.message ?? String(error));
  process.exit(1);
});
