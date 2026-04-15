/**
 * QD Uninstall Tests
 *
 * Tests for _qd folder removal and cleanup.
 */

const os = require('node:os');
const path = require('node:path');
const buildRoot = path.resolve(__dirname, '..');
const fs = require(path.join(buildRoot, 'cli', 'fs-native'));

// Mock the installer for testing
class MockInstaller {
  constructor() {
    this.removed = [];
  }

  async removeDir(dirPath) {
    try {
      await fs.remove(dirPath);
      this.removed.push(dirPath);
      return true;
    } catch (error) {
      return false;
    }
  }
}

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCase(testCase) {
  try {
    await testCase.run();
    passed += 1;
    console.log(`\x1b[32m✓\x1b[0m ${testCase.name}`);
  } catch (error) {
    failed += 1;
    console.log(`\x1b[31m✗\x1b[0m ${testCase.name}`);
    console.log(`  ${error.message}`);
  }
}

const tests = [
  // ===== Folder Creation Tests =====
  {
    name: 'creates temporary directory',
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-test-'));
      ok(await fs.pathExists(tempDir), 'Temp dir should exist');
      ok(tempDir.includes('qd-test-'), 'Should have qd-test prefix');
      await fs.remove(tempDir);
    }
  },
  {
    name: 'creates nested directories',
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-test-'));
      const nestedDir = path.join(tempDir, 'a', 'b', 'c');
      await fs.ensureDir(nestedDir);
      ok(await fs.pathExists(nestedDir), 'Nested dir should exist after ensureDir');
      await fs.remove(tempDir);
    }
  },

  // ===== Folder Removal Tests =====
  {
    name: 'removes empty directory',
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-test-'));
      await fs.remove(tempDir);
      ok(!(await fs.pathExists(tempDir)), 'Temp dir should be removed');
    }
  },
  {
    name: 'removes directory with files',
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-test-'));
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'test content');
      await fs.remove(tempDir);
      ok(!(await fs.pathExists(tempDir)), 'Dir with files should be removed');
    }
  },
  {
    name: 'removes directory with nested subdirectories',
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-test-'));
      const subDir = path.join(tempDir, 'core', 'agents', 'skill');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(subDir, 'SKILL.md'), '# Skill');
      await fs.remove(tempDir);
      ok(!(await fs.pathExists(tempDir)), 'Nested dir should be removed');
    }
  },
  {
    name: 'removes _qd folder specifically',
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-'));
      const qdDir = path.join(tempDir, '_qd');

      // Create _qd structure
      await fs.ensureDir(path.join(qdDir, 'core', 'test-skill'));
      await fs.writeFile(path.join(qdDir, 'core', 'test-skill', 'SKILL.md'), '# Test');
      await fs.writeFile(path.join(qdDir, 'config.yaml'), 'key: value');

      ok(await fs.pathExists(qdDir), '_qd should exist before removal');

      // Remove _qd
      await fs.remove(qdDir);

      ok(!(await fs.pathExists(qdDir)), '_qd should be removed');
      ok(await fs.pathExists(tempDir), 'Parent project dir should still exist');

      await fs.remove(tempDir);
    }
  },

  // ===== Safety Tests =====
  {
    name: 'fails gracefully for non-existent path',
    run: async () => {
      const fakePath = path.join(os.tmpdir(), 'non-existent-folder-' + Date.now());
      try {
        await fs.remove(fakePath);
        ok(true, 'Should not throw');
      } catch {
        ok(false, 'Should handle gracefully');
      }
    }
  },

  // ===== Mock Installer Test =====
  {
    name: 'mock installer tracks removed directories',
    run: async () => {
      const installer = new MockInstaller();
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-test-'));
      const qdDir = path.join(tempDir, '_qd');
      await fs.ensureDir(qdDir);

      await installer.removeDir(qdDir);

      ok(installer.removed.includes(qdDir), 'Should track removed dir');
      ok(!(await fs.pathExists(qdDir)), '_qd should be gone');

      await fs.remove(tempDir);
    }
  }
];

async function main() {
  console.log('\nQD Uninstall Tests\n');
  for (const testCase of tests) {
    await runCase(testCase);
  }
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Test runner failed:', error.message);
  process.exit(1);
});
