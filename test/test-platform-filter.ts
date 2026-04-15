/**
 * QD Platform Filter Tests
 *
 * Tests the IF/ENDIF preprocessing and provider adapter filtering.
 */

const path = require('node:path');
const fs = require('node:fs');

const buildRoot = path.resolve(__dirname, '..');

// Load adapters
const { cursorAdapter } = require(path.join(buildRoot, 'cli', 'platforms', 'cursor'));
const { codexAdapter } = require(path.join(buildRoot, 'cli', 'platforms', 'codex'));
const { opencodeAdapter } = require(path.join(buildRoot, 'cli', 'platforms', 'opencode'));
const { claudeCodeAdapter } = require(path.join(buildRoot, 'cli', 'platforms', 'claude-code'));

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

const ctx = { moduleName: 'test', skillName: 'test-skill', platform: 'test', targetDir: 'test' };

const tests = [
  // ===== Cursor Adapter Tests =====
  {
    name: 'cursor: keeps cursor blocks, removes others',
    run: () => {
      const input = `Hello
<!-- IF cursor -->
This is cursor only
<!-- END -->
<!-- IF claude-code -->
This is claude-code only
<!-- END -->
After`;
      const result = cursorAdapter.transform(input, ctx);
      ok(result.includes('This is cursor only'), 'Should include cursor content');
      ok(!result.includes('This is claude-code only'), 'Should not include claude-code content');
    }
  },
  {
    name: 'cursor: passes through content unchanged (no IF blocks)',
    run: () => {
      const input = 'Normal content without any IF blocks';
      const result = cursorAdapter.transform(input, ctx);
      ok(result === input, 'Should be unchanged');
    }
  },
  {
    name: 'cursor: supports all artifact types',
    run: () => {
      ok(cursorAdapter.supportsType('agent'), 'Should support agent');
      ok(cursorAdapter.supportsType('skill'), 'Should support skill');
      ok(cursorAdapter.supportsType('workflow'), 'Should support workflow');
      ok(cursorAdapter.supportsType('command'), 'Should support command');
    }
  },

  // ===== Claude Code Adapter Tests =====
  {
    name: 'claude-code: keeps claude-code blocks, removes others',
    run: () => {
      const input = `Hello
<!-- IF cursor -->
Cursor content
<!-- END -->
<!-- IF claude-code -->
Claude Code content
<!-- END -->
After`;
      const result = claudeCodeAdapter.transform(input, ctx);
      ok(!result.includes('Cursor content'), 'Should not include cursor content');
      ok(result.includes('Claude Code content'), 'Should include claude-code content');
    }
  },

  // ===== Codex Adapter Tests =====
  {
    name: 'codex: transforms /qd:skill to $skill',
    run: () => {
      const input = 'Use /qd:my-skill to do something';
      const result = codexAdapter.transform(input, ctx);
      ok(result.includes('$my-skill'), 'Should transform to $ syntax');
      ok(!result.includes('/qd:'), 'Should remove /qd: prefix');
    }
  },
  {
    name: 'codex: transforms /skill to $skill',
    run: () => {
      const input = 'Use /other-skill for that';
      const result = codexAdapter.transform(input, ctx);
      ok(result.includes('$other-skill'), 'Should transform to $ syntax');
    }
  },
  {
    name: 'codex: keeps codex blocks, removes others',
    run: () => {
      const input = `Hello
<!-- IF codex -->
This is codex only
<!-- END -->
<!-- IF opencode -->
This is opencode only
<!-- END -->`;
      const result = codexAdapter.transform(input, ctx);
      ok(result.includes('This is codex only'), 'Should include codex content');
      ok(!result.includes('This is opencode only'), 'Should not include opencode content');
    }
  },
  {
    name: 'codex: only supports skill and workflow',
    run: () => {
      ok(!codexAdapter.supportsType('agent'), 'Should not support agent');
      ok(codexAdapter.supportsType('skill'), 'Should support skill');
      ok(!codexAdapter.supportsType('command'), 'Should not support command');
      ok(codexAdapter.supportsType('workflow'), 'Should support workflow');
    }
  },
  {
    name: 'codex: rejects autonomous agents',
    run: () => {
      ok(!codexAdapter.shouldInstall({ type: 'autonomous' }), 'Should reject autonomous');
      ok(codexAdapter.shouldInstall({ type: 'skill' }), 'Should allow skill');
    }
  },

  // ===== OpenCode Adapter Tests =====
  {
    name: 'opencode: transforms /qd:skill to skill({name: "skill"})',
    run: () => {
      const input = 'Use /qd:my-skill to do something';
      const result = opencodeAdapter.transform(input, ctx);
      ok(result.includes('skill({ name: "my-skill" })'), 'Should transform to function call syntax');
      ok(!result.includes('/qd:'), 'Should remove /qd: prefix');
    }
  },
  {
    name: 'opencode: transforms /skill to skill({name: "skill"})',
    run: () => {
      const input = 'Use /other-skill for that';
      const result = opencodeAdapter.transform(input, ctx);
      ok(result.includes('skill({ name: "other-skill" })'), 'Should transform to function call');
    }
  },
  {
    name: 'opencode: keeps opencode blocks, removes others',
    run: () => {
      const input = `Hello
<!-- IF opencode -->
This is opencode only
<!-- END -->
<!-- IF codex -->
This is codex only
<!-- END -->`;
      const result = opencodeAdapter.transform(input, ctx);
      ok(result.includes('This is opencode only'), 'Should include opencode content');
      ok(!result.includes('This is codex only'), 'Should not include codex content');
    }
  },
  {
    name: 'opencode: only supports skill and command',
    run: () => {
      ok(!opencodeAdapter.supportsType('agent'), 'Should not support agent');
      ok(opencodeAdapter.supportsType('skill'), 'Should support skill');
      ok(opencodeAdapter.supportsType('command'), 'Should support command');
      ok(!opencodeAdapter.supportsType('workflow'), 'Should not support workflow');
    }
  },
  {
    name: 'opencode: rejects autonomous agents',
    run: () => {
      ok(!opencodeAdapter.shouldInstall({ type: 'autonomous' }), 'Should reject autonomous');
      ok(opencodeAdapter.shouldInstall({ type: 'skill' }), 'Should allow skill');
    }
  },

  // ===== Platform Filtering Tests =====
  {
    name: 'platforms filter: supported array allows installation',
    run: () => {
      const manifest = { type: 'skill', name: 'test', platforms: { supported: ['claude-code', 'cursor'] } };
      ok(cursorAdapter.shouldInstall(manifest), 'cursor should install');
      ok(!codexAdapter.shouldInstall(manifest), 'codex should not install');
    }
  },
  {
    name: 'platforms filter: unsupported array blocks installation',
    run: () => {
      const manifest = { type: 'skill', name: 'test', platforms: { unsupported: ['codex'] } };
      ok(codexAdapter.shouldInstall(manifest) === false, 'codex should be blocked');
      ok(cursorAdapter.shouldInstall(manifest), 'cursor should be allowed');
    }
  },
  {
    name: 'platforms filter: no platforms means install everywhere',
    run: () => {
      const manifest = { type: 'skill', name: 'test' };
      ok(cursorAdapter.shouldInstall(manifest), 'cursor should install');
      ok(codexAdapter.shouldInstall(manifest), 'codex should install');
      ok(opencodeAdapter.shouldInstall(manifest), 'opencode should install');
    }
  },

  // ===== Nested/Multiple IF Blocks =====
  {
    name: 'multiple IF blocks: handles correctly',
    run: () => {
      const input = `Start
<!-- IF cursor -->
C1
<!-- END -->
<!-- IF codex -->
C2
<!-- END -->
<!-- IF opencode -->
C3
<!-- END -->
End`;
      const cursorResult = cursorAdapter.transform(input, ctx);
      ok(cursorResult.includes('C1') && !cursorResult.includes('C2') && !cursorResult.includes('C3'), 'cursor: C1 only');

      const codexResult = codexAdapter.transform(input, ctx);
      ok(!codexResult.includes('C1') && codexResult.includes('C2') && !codexResult.includes('C3'), 'codex: C2 only');
    }
  }
];

async function main() {
  console.log('\nQD Platform Filter Tests\n');
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
