/**
 * Installation Component Tests (Jest)
 * Tests for QD installer components using new src/ structure.
 */

// Mock @clack/prompts before importing anything else
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
}));

import * as os from 'os';
import * as path from 'path';
import { Installer } from '../src/domains/installation/installer';
import { clearCache, loadPlatformCodes } from '../src/domains/ide/platform-codes';
import * as fsNative from '../src/shared/fs-native';

describe('Installation Components', () => {
  beforeEach(() => {
    clearCache();
    jest.clearAllMocks();
  });

  describe('platform-codes', () => {
    test('loads Ona native skills target', async () => {
      const platformCodes = await loadPlatformCodes();
      expect(platformCodes.platforms.ona?.installer?.target_dir).toBe('.ona/skills');
    });

    test('loads Claude Code config', async () => {
      const platformCodes = await loadPlatformCodes();
      expect(platformCodes.platforms['claude-code']?.name).toBe('Claude Code');
      expect(platformCodes.platforms['claude-code']?.installer?.target_dir).toBe('.claude');
    });

    test('loads Cursor config', async () => {
      const platformCodes = await loadPlatformCodes();
      expect(platformCodes.platforms.cursor?.name).toBe('Cursor');
      expect(platformCodes.platforms.cursor?.installer?.target_dir).toBe('.cursor');
    });
  });

  describe('Installer', () => {
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

    test('creates output directory structure', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-test-'));
      try {
        const outputPath = path.join(tempDir, '_qd-output');
        await fsNative.ensureDir(path.join(outputPath, 'learnings'));
        expect(await fsNative.pathExists(outputPath)).toBe(true);
        expect(await fsNative.pathExists(path.join(outputPath, 'learnings'))).toBe(true);
      } finally {
        await fsNative.remove(tempDir);
      }
    });

    test('full install creates .claude directory', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-install-'));
      try {
        const repoRoot = path.resolve(__dirname, '..');
        await copyDir(path.join(repoRoot, 'artifacts'), path.join(tempDir, 'artifacts'));

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code'],
          directory: tempDir,
        });

        expect(result.success).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude'))).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude', 'skills'))).toBe(true);
      } finally {
        await fsNative.remove(tempDir);
      }
    });

    test('install with multiple IDEs creates both directories', async () => {
      const tempDir = await fsNative.mkdtemp(path.join(os.tmpdir(), 'qd-multi-'));
      try {
        const repoRoot = path.resolve(__dirname, '..');
        await copyDir(path.join(repoRoot, 'artifacts'), path.join(tempDir, 'artifacts'));

        const installer = new Installer();
        const result = await installer.install({
          ides: ['claude-code', 'cursor'],
          directory: tempDir,
        });

        expect(result.success).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.claude'))).toBe(true);
        expect(await fsNative.pathExists(path.join(tempDir, '.cursor'))).toBe(true);
      } finally {
        await fsNative.remove(tempDir);
      }
    });
  });
});
