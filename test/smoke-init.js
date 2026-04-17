#!/usr/bin/env node

/**
 * Smoke test for QD CLI
 * Tests: qd init --ides claude-code
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing expected: ${filePath}`);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const cliPath = path.join(repoRoot, 'dist', 'index.js');
  const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-smoke-'));

  console.log(`Smoke test: ${tempProject}`);

  try {
    // Copy artifacts to temp project
    const srcArtifacts = path.join(repoRoot, 'artifacts');
    const destArtifacts = path.join(tempProject, 'artifacts');
    copyDir(srcArtifacts, destArtifacts);

    // Run: qd init --ides claude-code --directory <temp>
    console.log(`Running: qd init --ides claude-code`);
    const install = run('node', [cliPath, 'init', '--ides', 'claude-code', '--directory', tempProject], {
      cwd: repoRoot,
    });

    if (install.status !== 0) {
      throw new Error(`Init failed (${install.status})\nSTDERR: ${install.stderr}\nSTDOUT: ${install.stdout}`);
    }

    // Verify Claude Code target
    const claudeDir = path.join(tempProject, '.claude');
    const skillsDir = path.join(claudeDir, 'skills');
    assertExists(claudeDir);
    assertExists(skillsDir);

    // Verify output folder (_qd/learnings)
    const qdDir = path.join(tempProject, '_qd');
    const learningsDir = path.join(qdDir, 'learnings');
    assertExists(qdDir);
    assertExists(learningsDir);

    console.log('\nSmoke init PASS');
    console.log('  .claude/skills created');
    console.log('  _qd/learnings created');
  } catch (error) {
    console.error(`Smoke init FAIL: ${error.message}`);
    process.exit(1);
  } finally {
    if (fs.existsSync(tempProject)) {
      fs.rmSync(tempProject, { recursive: true, force: true });
    }
  }
}

main();
