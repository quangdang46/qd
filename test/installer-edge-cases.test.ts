/**
 * Comprehensive Installer Tests
 * Tests all edge cases for QD installer with module.yaml as single config source.
 */

// Mock @clack/prompts
jest.mock('@clack/prompts', () => ({
  log: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
  },
  getColor: jest.fn().mockResolvedValue({
    red: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
  }),
  box: jest.fn().mockResolvedValue(undefined),
  note: jest.fn().mockResolvedValue(undefined),
  spinner: jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  }),
  confirm: jest.fn().mockResolvedValue(true),
  multiselect: jest.fn().mockResolvedValue(['modules', 'ide']),
  select: jest.fn().mockResolvedValue('cwd'),
  text: jest.fn().mockResolvedValue('test'),
  intro: jest.fn().mockResolvedValue(undefined),
  outro: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/shared/prompts', () => ({
  log: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
  },
  getColor: jest.fn().mockResolvedValue({
    red: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
  }),
  box: jest.fn().mockResolvedValue(undefined),
  note: jest.fn().mockResolvedValue(undefined),
  spinner: jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  }),
  confirm: jest.fn().mockResolvedValue(true),
  multiselect: jest.fn().mockResolvedValue(['modules', 'ide']),
  select: jest.fn().mockResolvedValue('cwd'),
  text: jest.fn().mockResolvedValue('test'),
  intro: jest.fn().mockResolvedValue(undefined),
  outro: jest.fn().mockResolvedValue(undefined),
}));

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { Installer } from '../src/domains/installation/installer';
import { clearCache } from '../src/domains/ide/platform-codes';
import * as fsNative from '../src/shared/fs-native';

describe('Installer Comprehensive Tests', () => {
  const copyDir = async (src: string, dest: string): Promise<void> => {
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
  };

  const createMinimalArtifacts = async (tempDir: string, moduleYaml?: string): Promise<void> => {
    const artifactsDir = path.join(tempDir, '.IDE');
    await fsNative.ensureDir(artifactsDir);
    await fsNative.ensureDir(path.join(artifactsDir, 'skills'));
    await fsNative.ensureDir(path.join(artifactsDir, 'hooks'));

    // Default module.yaml
    const defaultModule = moduleYaml || `
code: test
name: "Test Module"
supported_ides:
  - claude-code
convert: {}
`;
    await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), defaultModule);

    // Sample skill file
    await fsNative.writeFile(path.join(artifactsDir, 'skills', 'test-skill.md'), '# Test Skill');
    await fsNative.writeFile(path.join(artifactsDir, 'hooks', 'test-hook.md'), '# Test Hook');
  };

  beforeEach(() => {
    clearCache();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup any temp dirs
  });

  // ============================================================================
  // EDGE CASE 1: Single file at artifacts root level
  // ============================================================================
  describe('Edge Case 1: Single file at artifacts root', () => {
    test('artifacts/testfile.md copies to .claude/testfile.md (IDE root, not skills subdir)', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge1-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        // Create module.yaml
        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [claude-code]
convert: {}
`);

        // Create file at artifacts root
        await fsNative.writeFile(path.join(artifactsDir, 'testfile.md'), 'Test content');

        // Create skill file to ensure .claude/skills exists
        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'sample.md'), '# Sample');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);

        // testfile.md should be at IDE root (.claude/testfile.md), not in skills subdir
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'testfile.md'))).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'testfile.md'))).toBe(false);

        // Content check
        const content = await fsNative.readFile(path.join(tempDir, '.claude', 'testfile.md'), 'utf8');
        expect(content).toBe('Test content');
      } finally {
        await fsNative.remove(tempDir);
      }
    });

    test('artifacts/testfile.md can be IDE-specific via module.yaml overrides', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge1b-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        // Create module.yaml with override - testfile.md only for cursor
        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [claude-code, cursor]
overrides:
  testfile.md:
    supported_ides: [cursor]
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'testfile.md'), 'Test content');
        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'sample.md'), '# Sample');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code'],  // Only Claude Code requested
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);

        // testfile.md should NOT be installed (overridden to cursor only)
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'testfile.md'))).toBe(false);

        // But skills should still be installed
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'sample.md'))).toBe(true);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 2: Nested skill directories
  // ============================================================================
  describe('Edge Case 2: Nested skill directories', () => {
    test('artifacts/skills/my-skill/*.md copies to .claude/skills/my-skill/*.md', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge2-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(path.join(artifactsDir, 'skills', 'my-skill'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [claude-code]
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'my-skill', 'SKILL.md'), '# My Skill');
        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'my-skill', 'README.md'), '# README');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);

        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'my-skill', 'SKILL.md'))).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'my-skill', 'README.md'))).toBe(true);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 3: IDE Selection (supported_ides / ignored_ides)
  // ============================================================================
  describe('Edge Case 3: IDE Selection', () => {
    test('supported_ides: only listed IDEs receive artifacts', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge3a-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [cursor]
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'test.md'), '# Test');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code', 'cursor'],  // Both IDEs requested
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);

        // .cursor should have artifacts (cursor is in supported_ides)
        expect(await fsNative.pathExists(path.join(tempDir, '.cursor', 'skills', 'test.md'))).toBe(true);

        // .claude should NOT have artifacts (claude-code NOT in supported_ides)
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'test.md'))).toBe(false);
      } finally {
        await fsNative.remove(tempDir);
      }
    });

    test('ignored_ides: all IDEs except listed receive artifacts', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge3b-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
ignored_ides: [cursor]
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'test.md'), '# Test');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code', 'cursor'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);

        // .claude should have artifacts (claude-code NOT ignored)
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'test.md'))).toBe(true);

        // .cursor should NOT have artifacts (cursor IS ignored)
        expect(await fsNative.pathExists(path.join(tempDir, '.cursor', 'skills', 'test.md'))).toBe(false);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 4: File-level overrides
  // ============================================================================
  describe('Edge Case 4: File-level overrides', () => {
    test('specific file can be excluded via overrides', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge4-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [claude-code]
overrides:
  secret.md:
    supported_ides: []
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'public.md'), '# Public');
        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'secret.md'), '# Secret');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);

        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'public.md'))).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'secret.md'))).toBe(false);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 5: Stateless install
  // ============================================================================
  describe('Edge Case 5: Stateless install', () => {
    test('install does not create a .qd folder or manifest state', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge5-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [claude-code]
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'testfile.md'), 'Root file');
        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'test.md'), '# Test');

        const installer = new Installer();
        await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'testfile.md'))).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'test.md'))).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.qd'))).toBe(false);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 6: Re-init works correctly (no duplication)
  // ============================================================================
  describe('Edge Case 6: Re-init', () => {
    test('re-init updates files without duplication', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge6-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [claude-code]
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'testfile.md'), 'Original');
        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'test.md'), '# Test');

        const installer = new Installer();
        await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        // Modify file and re-init
        await fsNative.writeFile(path.join(artifactsDir, 'testfile.md'), 'Updated');
        await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        // Should have updated content, not duplicated
        const content = await fsNative.readFile(path.join(tempDir, '.claude', 'testfile.md'), 'utf8');
        expect(content).toBe('Updated');

        // Should NOT have testfile.md in both root and skills/
        const rootExists = await fsNative.pathExists(path.join(tempDir, '.claude', 'testfile.md'));
        const skillsExists = await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'testfile.md'));
        expect(rootExists).toBe(true);
        expect(skillsExists).toBe(false);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 7: Empty supported_ides (skip all)
  // ============================================================================
  describe('Edge Case 7: Empty supported_ides', () => {
    test('supported_ides: [] skips all IDEs', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge7-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: []
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'test.md'), '# Test');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);

        // No .claude directory should be created
        expect(await fsNative.pathExists(path.join(tempDir, '.claude'))).toBe(false);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 8: Multi-IDE with different targets
  // ============================================================================
  describe('Edge Case 8: Multi-IDE installation', () => {
    test('installs to correct target directories for each IDE', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge8-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [claude-code, cursor]
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'test.md'), '# Test');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code', 'cursor'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);

        // Claude Code target: .claude
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'test.md'))).toBe(true);

        // Cursor target: .cursor
        expect(await fsNative.pathExists(path.join(tempDir, '.cursor', 'skills', 'test.md'))).toBe(true);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 9: Direct file in type root (e.g., artifacts/agents/atlas.md)
  // ============================================================================
  describe('Edge Case 9: Direct file in type root', () => {
    test('artifacts/agents/atlas.md copies to .claude/agents/atlas.md', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge9-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'agents'));

        await fsNative.writeFile(path.join(artifactsDir, 'module.yaml'), `
code: test
name: "Test"
supported_ides: [claude-code]
convert: {}
`);

        await fsNative.writeFile(path.join(artifactsDir, 'agents', 'atlas.md'), '# Atlas Agent');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'agents', 'atlas.md'))).toBe(true);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });

  // ============================================================================
  // EDGE CASE 10: Module without module.yaml (defaults should work)
  // ============================================================================
  describe('Edge Case 10: Missing module.yaml', () => {
    test('installs with default config when module.yaml missing', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-edge10-'));
      try {
        const artifactsDir = path.join(tempDir, '.IDE');
        await fsNative.ensureDir(artifactsDir);
        await fsNative.ensureDir(path.join(artifactsDir, 'skills'));

        // NO module.yaml - should use defaults

        await fsNative.writeFile(path.join(artifactsDir, 'skills', 'test.md'), '# Test');

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
          autoConfirm: true,
        });

        expect(result.success).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills', 'test.md'))).toBe(true);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });
});
