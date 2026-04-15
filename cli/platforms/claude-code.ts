// @ts-nocheck

const { PlatformAdapter, TransformContext } = require('./adapter');

/**
 * Claude Code adapter
 * - Uses raw content (no transformation needed)
 * - Supports all artifact types
 */
const claudeCodeAdapter: PlatformAdapter = {
  platform: 'claude-code',

  getCommandPrefix(): string {
    return '/';
  },

  transform(content: string, ctx: TransformContext): string {
    // Claude Code uses raw SKILL.md content
    // Remove IF blocks for other platforms but keep all for claude-code
    return content
      .replace(/<!-- IF claude-code -->([\s\S]*?)<!-- END -->/g, '$1')
      .replace(/<!-- IF (?!claude-code)([\s\S]*?)<!-- END -->/g, '');
  },

  transformPath(path: string): string {
    return path;
  },

  supportsType(type: string): boolean {
    return true; // Claude Code supports all types
  },

  shouldInstall(manifest: Record<string, unknown>): boolean {
    const platforms = manifest.platforms as Record<string, unknown> | undefined;
    if (!platforms) return true;

    if ('unsupported' in platforms) {
      const unsupported = platforms.unsupported as string[];
      return !unsupported.includes('claude-code');
    }

    if ('supported' in platforms) {
      const supported = platforms.supported as string[];
      return supported.includes('claude-code');
    }

    return true;
  },
};

module.exports = { claudeCodeAdapter };
