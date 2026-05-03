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

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const cliPath = path.join(repoRoot, 'dist', 'index.js');
  const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-smoke-'));
  const specPath = process.env.QD_SPEC_PATH || path.join(repoRoot, '..', 'spec', '.IDE');

  console.log(`Smoke test: ${tempProject}`);
  console.log(`Using artifacts: ${specPath}`);

  try {
    // Run: qd init --ides claude-code --directory <temp>
    // Uses QD_SPEC_PATH or defaults to ../spec/.IDE
    console.log(`Running: qd init --ides claude-code`);
    const install = run('node', [cliPath, 'init', '--ides', 'claude-code', '--directory', tempProject], {
      cwd: repoRoot,
      env: { ...process.env, QD_SPEC_PATH: specPath },
    });

    if (install.status !== 0) {
      throw new Error(`Init failed (${install.status})\nSTDERR: ${install.stderr}\nSTDOUT: ${install.stdout}`);
    }

    // Verify Claude Code target
    const claudeDir = path.join(tempProject, '.claude');
    const skillsDir = path.join(claudeDir, 'skills');
    assertExists(claudeDir);
    assertExists(skillsDir);

    // Verify no hidden qd state is created
    const qdDir = path.join(tempProject, '.qd');
    if (fs.existsSync(qdDir)) {
      throw new Error(`Unexpected state folder created: ${qdDir}`);
    }

    console.log('\nSmoke init PASS');
    console.log('  .claude/skills created');
    console.log('  no .qd folder created');
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
