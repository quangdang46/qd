/**
 * Installation Component Tests (TypeScript)
 *
 * Tests for QD installer components.
 */

const os = require('node:os');
const path = require('node:path');
const buildRoot = path.resolve(__dirname, '..');
const fs = require(path.join(buildRoot, 'cli', 'fs-native.js'));
const { IdeManager } = require(path.join(buildRoot, 'cli', 'ide', 'manager.js'));
const { clearCache, loadPlatformCodes } = require(path.join(buildRoot, 'cli', 'ide', 'platform-codes.js'));
const { ManifestGenerator } = require(path.join(buildRoot, 'cli', 'core', 'manifest-generator.js'));

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

let passed = 0;
let failed = 0;

function ok(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCase(testCase: TestCase): Promise<void> {
  try {
    await testCase.run();
    passed += 1;
    console.log(`\x1b[32m✓\x1b[0m ${testCase.name}`);
  } catch (error: any) {
    failed += 1;
    console.log(`\x1b[31m✗\x1b[0m ${testCase.name}`);
    console.log(`  ${error?.message ?? String(error)}`);
  }
}

async function createTestQdFixture(): Promise<string> {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-fixture-'));
  const fixtureDir = path.join(fixtureRoot, '_qd');
  await fs.ensureDir(path.join(fixtureDir, '_config'));

  await fs.writeFile(
    path.join(fixtureDir, '_config', 'skill-manifest.csv'),
    [
      'canonicalId,name,description,module,path',
      '"qd-master","qd-master","Minimal test skill","core","_qd/core/qd-master/SKILL.md"',
      '',
    ].join('\n'),
  );

  const skillDir = path.join(fixtureDir, 'core', 'qd-master');
  await fs.ensureDir(skillDir);
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    ['---', 'name: qd-master', 'description: Minimal test skill', '---', '', '<!-- agent-activation -->', 'You are a test agent.'].join(
      '\n',
    ),
  );
  await fs.writeFile(path.join(skillDir, 'workflow.md'), '# Test Workflow\n');
  return fixtureDir;
}

const tests: TestCase[] = [
  {
    name: 'platform-codes loads Ona native skills target',
    run: async () => {
      clearCache();
      const platformCodes = await loadPlatformCodes();
      ok(platformCodes.platforms.ona?.installer?.target_dir === '.ona/skills', 'Expected Ona target_dir to be .ona/skills');
    },
  },
  {
    name: 'IdeManager exposes current IDE codes',
    run: async () => {
      const ideManager = new IdeManager();
      await ideManager.ensureInitialized();
      const available = ideManager.getAvailableIdes().map((ide: any) => ide.value);
      ok(available.includes('cursor'), 'Expected cursor in available IDEs');
      ok(available.includes('ona'), 'Expected ona in available IDEs');
    },
  },
  {
    name: 'Ona setup writes SKILL.md into native destination',
    run: async () => {
      const tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-ona-test-'));
      const installedQdDir = await createTestQdFixture();
      try {
        const ideManager = new IdeManager();
        await ideManager.ensureInitialized();
        const result = await ideManager.setup('ona', tempProjectDir, installedQdDir, {
          silent: true,
          selectedModules: ['qd'],
        });
        ok(result.success === true, 'Expected Ona setup to succeed');
        const skillFile = path.join(tempProjectDir, '.ona', 'skills', 'qd-master', 'SKILL.md');
        ok(await fs.pathExists(skillFile), 'Expected Ona to install SKILL.md');
      } finally {
        await fs.remove(tempProjectDir).catch(() => undefined);
        await fs.remove(path.dirname(installedQdDir)).catch(() => undefined);
      }
    },
  },
  {
    name: 'ManifestGenerator.parseSkillMd validates frontmatter',
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qd-skill-parse-'));
      try {
        const goodDir = path.join(tempDir, 'good-skill');
        const badDir = path.join(tempDir, 'bad-skill');
        await fs.ensureDir(goodDir);
        await fs.ensureDir(badDir);
        await fs.writeFile(path.join(goodDir, 'SKILL.md'), '---\nname: good-skill\ndescription: good\n---\n\nBody\n');
        await fs.writeFile(path.join(badDir, 'SKILL.md'), '---\nname: wrong-name\ndescription: bad\n---\n\nBody\n');

        const generator = new ManifestGenerator();
        (generator as any).qdFolderName = '_qd';
        const good = await generator.parseSkillMd(path.join(goodDir, 'SKILL.md'), goodDir, 'good-skill');
        const bad = await generator.parseSkillMd(path.join(badDir, 'SKILL.md'), badDir, 'bad-skill');

        ok(good !== null, 'Expected valid SKILL.md to parse');
        ok(bad === null, 'Expected mismatched skill name to fail parse');
      } finally {
        await fs.remove(tempDir).catch(() => undefined);
      }
    },
  },
];

async function main(): Promise<void> {
  console.log('\nInstallation Component Tests (TS)\n');
  for (const testCase of tests) {
    await runCase(testCase);
  }
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: any) => {
  console.error('Test runner failed:', error?.message ?? String(error));
  process.exit(1);
});
