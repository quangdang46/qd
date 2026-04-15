#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
    throw new Error(`Missing expected file: ${filePath}`);
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const cliPath = path.join(repoRoot, 'dist', 'qd-cli.js');
  const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-smoke-init-'));
  const projectName = path.basename(tempProject);
  const autoMode = process.argv.includes('--auto');

  console.log(`Smoke test temp project: ${tempProject}`);

  try {
    const installArgs = [cliPath, 'install', '--directory', tempProject];
    if (autoMode) {
      installArgs.push('--yes', '--tools', 'none', '--modules', 'qd');
    }

    console.log(
      autoMode
        ? 'Running install in auto mode (--yes --tools none --modules qd)'
        : 'Running install in interactive mode (manual confirmations)',
    );

    const install = run(process.execPath, installArgs, { cwd: repoRoot, stdio: 'inherit' });

    if (install.status !== 0) {
      throw new Error(
        `Install failed (${install.status})\nSTDOUT:\n${install.stdout}\nSTDERR:\n${install.stderr}`,
      );
    }

    const qdDir = path.join(tempProject, '_qd');
    const configDir = path.join(qdDir, '_config');
    assertExists(qdDir);
    assertExists(path.join(configDir, 'manifest.yaml'));
    assertExists(path.join(configDir, 'skill-manifest.csv'));
    assertExists(path.join(configDir, 'agent-manifest.csv'));
    assertExists(path.join(configDir, 'qd-help.csv'));
    assertExists(path.join(qdDir, 'qd', 'config.yaml'));

    const status = run(process.execPath, [cliPath, 'status'], { cwd: tempProject });
    if (status.status !== 0) {
      throw new Error(
        `Status failed (${status.status})\nSTDOUT:\n${status.stdout}\nSTDERR:\n${status.stderr}`,
      );
    }

    if (!status.stdout.includes(projectName) && !status.stdout.includes('_qd')) {
      throw new Error(`Status output did not include expected installation path.\n${status.stdout}`);
    }

    console.log('Smoke init PASS');
    console.log(`Mode: ${autoMode ? 'auto' : 'interactive'}`);
  } finally {
    // fs.rmSync(tempProject, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`Smoke init FAIL: ${error.message}`);
  process.exit(1);
}
