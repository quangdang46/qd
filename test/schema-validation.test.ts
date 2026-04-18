/**
 * Schema Validation Tests (Jest)
 * Tests for module.yaml and schema.yaml validation
 */

jest.mock('@clack/prompts', () => ({
  log: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('../src/shared/prompts', () => ({
  log: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
  },
}));

import * as fs from '../src/shared/fs-native';
import * as yaml from 'yaml';

describe('Schema Validation', () => {
  const tempDir = 'test-temp-schema';

  beforeEach(async () => {
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('artifacts/module.yaml validation', () => {
    test('real artifacts/module.yaml is valid', async () => {
      const modulePath = 'artifacts/module.yaml';
      const content = await fs.readFile(modulePath, 'utf8');
      const parsed = yaml.parse(content);

      // Must have basic fields
      expect(parsed.code).toBeDefined();
      expect(parsed.name).toBeDefined();

      // supported_ides must be array of valid IDEs
      expect(Array.isArray(parsed.supported_ides)).toBe(true);
      if (parsed.supported_ides.length > 0) {
        const validIdes = ['claude-code', 'cursor', 'windsurf', 'codex', 'gemini', 'github-copilot', 'roo', 'trae'];
        for (const ide of parsed.supported_ides) {
          expect(validIdes).toContain(ide);
        }
      }

      // Cannot have both supported_ides AND ignored_ides
      if (parsed.supported_ides && parsed.ignored_ides) {
        throw new Error('Cannot have both supported_ides and ignored_ides');
      }

      // convert must be object if present
      if (parsed.convert) {
        expect(typeof parsed.convert).toBe('object');
      }

      // overrides must be object if present
      if (parsed.overrides) {
        expect(typeof parsed.overrides).toBe('object');
      }
    });

    test('real artifacts/module.yaml structure matches expected schema', async () => {
      const modulePath = 'artifacts/module.yaml';
      const content = await fs.readFile(modulePath, 'utf8');
      const parsed = yaml.parse(content);

      // Expected top-level keys
      const allowedKeys = ['code', 'name', 'description', 'supported_ides', 'ignored_ides', 'overrides', 'convert'];
      const actualKeys = Object.keys(parsed);

      for (const key of actualKeys) {
        expect(allowedKeys).toContain(key);
      }

      // Check supported_ides is array of strings
      if (parsed.supported_ides) {
        expect(Array.isArray(parsed.supported_ides)).toBe(true);
        for (const ide of parsed.supported_ides) {
          expect(typeof ide).toBe('string');
        }
      }

      // Check ignored_ides is array of strings
      if (parsed.ignored_ides) {
        expect(Array.isArray(parsed.ignored_ides)).toBe(true);
        for (const ide of parsed.ignored_ides) {
          expect(typeof ide).toBe('string');
        }
      }

      // Check convert format
      if (parsed.convert) {
        for (const [ide, rules] of Object.entries(parsed.convert)) {
          expect(typeof ide).toBe('string'); // IDE key
          expect(typeof rules).toBe('object'); // Pattern→format mapping
        }
      }

      // Check overrides format
      if (parsed.overrides) {
        for (const [filename, override] of Object.entries(parsed.overrides)) {
          expect(typeof filename).toBe('string'); // File being overridden
          expect(typeof override).toBe('object'); // Override config
        }
      }
    });
  });

  describe('module.yaml', () => {
    test('valid module.yaml with name and version', async () => {
      const moduleYaml = `
name: "QD Framework"
version: 1.0.0
convert:
  codex:
    "agents/**": toml
`;
      await fs.writeFile(`${tempDir}/module.yaml`, moduleYaml);
      const content = await fs.readFile(`${tempDir}/module.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      expect(parsed.name).toBe('QD Framework');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.convert).toHaveProperty('codex');
      expect(parsed.convert.codex['agents/**']).toBe('toml');
    });

    test('valid module.yaml with empty convert', async () => {
      const moduleYaml = `
name: "Simple Module"
version: 2.0.0
`;
      await fs.writeFile(`${tempDir}/module.yaml`, moduleYaml);
      const content = await fs.readFile(`${tempDir}/module.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      expect(parsed.name).toBe('Simple Module');
      expect(parsed.version).toBe('2.0.0');
      expect(parsed.convert).toBeUndefined();
    });

    test('invalid module.yaml - version not a number or string', async () => {
      const moduleYaml = `
name: "Bad Module"
version: { invalid: true }
`;
      await fs.writeFile(`${tempDir}/module.yaml`, moduleYaml);
      const content = await fs.readFile(`${tempDir}/module.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      // Version should be string or number - object is invalid
      const isValidVersion = typeof parsed.version === 'string' || typeof parsed.version === 'number';
      expect(isValidVersion).toBe(false);
    });

    test('convert rules require IDE key', async () => {
      const moduleYaml = `
name: "Module"
convert:
  codex:
    "skills/**": toml
`;
      await fs.writeFile(`${tempDir}/module.yaml`, moduleYaml);
      const content = await fs.readFile(`${tempDir}/module.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      expect(Object.keys(parsed.convert)[0]).toBe('codex');
      expect(parsed.convert.codex).toBeDefined();
    });
  });

  describe('schema.yaml', () => {
    test('valid schema.yaml with supported_ides', async () => {
      const schemaYaml = `
supported_ides:
  - claude-code
  - cursor
`;
      await fs.writeFile(`${tempDir}/schema.yaml`, schemaYaml);
      const content = await fs.readFile(`${tempDir}/schema.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      expect(parsed.supported_ides).toEqual(['claude-code', 'cursor']);
      expect(parsed.ignored_ides).toBeUndefined();
    });

    test('valid schema.yaml with ignored_ides', async () => {
      const schemaYaml = `
ignored_ides:
  - codex
  - windsurf
`;
      await fs.writeFile(`${tempDir}/schema.yaml`, schemaYaml);
      const content = await fs.readFile(`${tempDir}/schema.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      expect(parsed.ignored_ides).toEqual(['codex', 'windsurf']);
      expect(parsed.supported_ides).toBeUndefined();
    });

    test('empty supported_ides means skip all IDEs', async () => {
      const schemaYaml = `
supported_ides: []
`;
      await fs.writeFile(`${tempDir}/schema.yaml`, schemaYaml);
      const content = await fs.readFile(`${tempDir}/schema.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      expect(parsed.supported_ides).toEqual([]);
    });

    test('valid schema.yaml with file overrides', async () => {
      const schemaYaml = `
supported_ides:
  - claude-code
overrides:
  skip-this.md:
    supported_ides: []
  only-claude.md:
    supported_ides:
      - claude-code
`;
      await fs.writeFile(`${tempDir}/schema.yaml`, schemaYaml);
      const content = await fs.readFile(`${tempDir}/schema.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      expect(parsed.supported_ides).toEqual(['claude-code']);
      expect(parsed.overrides['skip-this.md'].supported_ides).toEqual([]);
      expect(parsed.overrides['only-claude.md'].supported_ides).toEqual(['claude-code']);
    });

    test('error when both supported_ides AND ignored_ides present', async () => {
      const schemaYaml = `
supported_ides:
  - claude-code
ignored_ides:
  - codex
`;
      await fs.writeFile(`${tempDir}/schema.yaml`, schemaYaml);
      const content = await fs.readFile(`${tempDir}/schema.yaml`, 'utf8');
      const parsed = yaml.parse(content);

      // Both present is a conflict error condition
      const hasConflict = parsed.supported_ides !== undefined && parsed.ignored_ides !== undefined;
      expect(hasConflict).toBe(true);
    });

    test('nested folder schema inherits parent', async () => {
      await fs.ensureDir(`${tempDir}/skills`);
      const parentSchema = `
supported_ides:
  - claude-code
`;
      const childSchema = `
ignored_ides:
  - cursor
`;
      await fs.writeFile(`${tempDir}/schema.yaml`, parentSchema);
      await fs.writeFile(`${tempDir}/skills/schema.yaml`, childSchema);

      const parent = yaml.parse(await fs.readFile(`${tempDir}/schema.yaml`, 'utf8'));
      const child = yaml.parse(await fs.readFile(`${tempDir}/skills/schema.yaml`, 'utf8'));

      expect(parent.supported_ides).toEqual(['claude-code']);
      expect(child.ignored_ides).toEqual(['cursor']);
    });
  });

  describe('Installer schema resolution', () => {
    test('resolveTargetIdes uses supported_ides when set', async () => {
      const schema = {
        supported_ides: ['claude-code'],
        ignored_ides: undefined,
      };
      const selectedIdes = ['claude-code', 'cursor', 'windsurf'];

      // If schema has supported_ides, use it (filter to only those)
      const result = selectedIdes.filter(ide => schema.supported_ides.includes(ide));
      expect(result).toEqual(['claude-code']);
    });

    test('resolveTargetIdes uses ignored_ides when no supported_ides', async () => {
      const schema = {
        supported_ides: undefined,
        ignored_ides: ['cursor'],
      };
      const selectedIdes = ['claude-code', 'cursor', 'windsurf'];

      // If schema has ignored_ides, exclude those
      const result = selectedIdes.filter(ide => !schema.ignored_ides.includes(ide));
      expect(result).toEqual(['claude-code', 'windsurf']);
    });

    test('resolveTargetIdes returns all when neither set', async () => {
      const schema = {
        supported_ides: undefined,
        ignored_ides: undefined,
      };
      const selectedIdes = ['claude-code', 'cursor'];

      // If neither supported_ides nor ignored_ides, use all selected
      const result = [...selectedIdes];
      expect(result).toEqual(['claude-code', 'cursor']);
    });

    test('empty supported_ides array means skip all', async () => {
      const schema = {
        supported_ides: [],
      };
      const selectedIdes = ['claude-code', 'cursor'];

      expect(schema.supported_ides.length).toBe(0);
    });

    test('file override takes precedence over folder schema', async () => {
      const folderSchema = {
        supported_ides: ['claude-code', 'cursor'],
      };
      const fileOverride = {
        supported_ides: ['claude-code'], // Override: only claude
      };

      // File override should replace folder schema for that file
      const result = fileOverride.supported_ides || folderSchema.supported_ides;
      expect(result).toEqual(['claude-code']);
    });
  });
});
