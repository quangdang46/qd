/**
 * QD Schema Validation Tests
 *
 * Tests JSON schemas for module.yaml, qd-skill-manifest.yaml, and platforms.yaml
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const path = require('node:path');
const fs = require('node:fs');

const buildRoot = path.resolve(__dirname, '..');
// Load schemas
const skillManifestSchema = JSON.parse(fs.readFileSync(path.join(buildRoot, 'cli', 'schemas', 'skill-manifest.schema.json'), 'utf8'));
const platformsSchema = JSON.parse(fs.readFileSync(path.join(buildRoot, 'cli', 'schemas', 'platforms.schema.json'), 'utf8'));
const moduleSchema = JSON.parse(fs.readFileSync(path.join(buildRoot, 'cli', 'schemas', 'module.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validateSkillManifest = ajv.compile(skillManifestSchema);
const validatePlatforms = ajv.compile(platformsSchema);
const validateModule = ajv.compile(moduleSchema);

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function assertValid(validator, data, name) {
  const valid = validator(data);
  if (!valid) {
    const errors = validator.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`${name}: ${errors}`);
  }
}

function assertInvalid(validator, data, name) {
  const valid = validator(data);
  if (valid) throw new Error(`${name}: expected invalid but was valid`);
}

const tests = [
  // ===== Skill Manifest Tests =====
  {
    name: 'skill-manifest: valid agent manifest',
    run: () => {
      const manifest = {
        type: 'agent',
        name: 'test-agent',
        role: 'You are a helpful agent',
        identity: 'Test identity',
        platforms: { supported: ['claude-code', 'cursor'] }
      };
      assertValid(validateSkillManifest, manifest, 'skill-manifest: valid agent manifest');
    }
  },
  {
    name: 'skill-manifest: valid skill manifest',
    run: () => {
      const manifest = {
        type: 'skill',
        name: 'test-skill',
        displayName: 'Test Skill',
        capabilities: 'web-search,file-operations'
      };
      assertValid(validateSkillManifest, manifest, 'skill-manifest: valid skill manifest');
    }
  },
  {
    name: 'skill-manifest: valid workflow manifest',
    run: () => {
      const manifest = {
        type: 'workflow',
        name: 'test-workflow'
      };
      assertValid(validateSkillManifest, manifest, 'skill-manifest: valid workflow manifest');
    }
  },
  {
    name: 'skill-manifest: invalid - missing required type',
    run: () => {
      const manifest = { name: 'test' };
      assertInvalid(validateSkillManifest, manifest, 'skill-manifest: invalid - missing required type');
    }
  },
  {
    name: 'skill-manifest: invalid - missing required name',
    run: () => {
      const manifest = { type: 'skill' };
      assertInvalid(validateSkillManifest, manifest, 'skill-manifest: invalid - missing required name');
    }
  },
  {
    name: 'skill-manifest: invalid - bad type enum',
    run: () => {
      const manifest = { type: 'invalid-type', name: 'test' };
      assertInvalid(validateSkillManifest, manifest, 'skill-manifest: invalid - bad type enum');
    }
  },
  {
    name: 'skill-manifest: platforms with unsupported array',
    run: () => {
      const manifest = {
        type: 'skill',
        name: 'test',
        platforms: { unsupported: ['codex'] }
      };
      assertValid(validateSkillManifest, manifest, 'skill-manifest: platforms with unsupported array');
    }
  },
  {
    name: 'skill-manifest: platforms with supported array',
    run: () => {
      const manifest = {
        type: 'skill',
        name: 'test',
        platforms: { supported: ['claude-code'] }
      };
      assertValid(validateSkillManifest, manifest, 'skill-manifest: platforms with supported array');
    }
  },

  // ===== Platforms Config Tests =====
  {
    name: 'platforms: valid config with path restrictions',
    run: () => {
      const config = {
        paths: {
          'docs/secrets.md': { platforms: ['claude-code'] },
          'scripts/deploy.sh': { platforms: ['claude-code', 'cursor'] }
        }
      };
      assertValid(validatePlatforms, config, 'platforms: valid config with path restrictions');
    }
  },
  {
    name: 'platforms: valid config with supported object',
    run: () => {
      const config = {
        paths: {
          'docs/guide.md': { platforms: { supported: ['codex'] } }
        }
      };
      assertValid(validatePlatforms, config, 'platforms: valid config with supported object');
    }
  },
  {
    name: 'platforms: empty paths is valid',
    run: () => {
      const config = { paths: {} };
      assertValid(validatePlatforms, config, 'platforms: empty paths is valid');
    }
  },
  {
    name: 'platforms: valid - no paths key',
    run: () => {
      const config = {};
      assertValid(validatePlatforms, config, 'platforms: valid - no paths key');
    }
  },

  // ===== Module Config Tests =====
  {
    name: 'module: valid minimal config',
    run: () => {
      const config = { code: 'qd', name: 'QD Framework' };
      assertValid(validateModule, config, 'module: valid minimal config');
    }
  },
  {
    name: 'module: valid full config',
    run: () => {
      const config = {
        code: 'qd',
        name: 'QD Framework',
        description: 'A development framework',
        default_selected: true,
        module_version: '1.0.0',
        module_greeting: 'Welcome to QD!',
        directories: ['{output_folder}', '_qd-data']
      };
      assertValid(validateModule, config, 'module: valid full config');
    }
  },
  {
    name: 'module: invalid - missing required code',
    run: () => {
      const config = { name: 'Test' };
      assertInvalid(validateModule, config, 'module: invalid - missing required code');
    }
  },
  {
    name: 'module: invalid - missing required name',
    run: () => {
      const config = { code: 'test' };
      assertInvalid(validateModule, config, 'module: invalid - missing required name');
    }
  },
  {
    name: 'module: directories is array of strings',
    run: () => {
      const config = {
        code: 'qd',
        name: 'QD',
        directories: ['folder1', 'folder2']
      };
      assertValid(validateModule, config, 'module: directories is array of strings');
    }
  },
  {
    name: 'module: directories invalid - not array',
    run: () => {
      const config = {
        code: 'qd',
        name: 'QD',
        directories: 'not-an-array'
      };
      assertInvalid(validateModule, config, 'module: directories invalid - not array');
    }
  }
];

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

async function main() {
  console.log('\nQD Schema Validation Tests\n');
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
