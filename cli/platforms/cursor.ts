// @ts-nocheck

const { PlatformAdapter, TransformContext } = require('./adapter');

/**
 * Cursor adapter
 * - Uses similar syntax to Claude Code
 * - Supports all artifact types
 */
const cursorAdapter: PlatformAdapter = {
  platform: 'cursor',

  getCommandPrefix(): string {
    return '/';
  },

  transform(content: string, ctx: TransformContext): string {
    // Cursor uses raw content like Claude Code
    // Remove IF blocks for other platforms but keep all for cursor
    return content
      .replace(/<!-- IF cursor -->([\s\S]*?)<!-- END -->/g, '$1')
      .replace(/<!-- IF (?!cursor)([\s\S]*?)<!-- END -->/g, '');
  },

  transformPath(path: string): string {
    return path;
  },

  supportsType(type: string): boolean {
    return true;
  },

  shouldInstall(manifest: Record<string, unknown>): boolean {
    const platforms = manifest.platforms as Record<string, unknown> | undefined;
    if (!platforms) return true;

    if ('unsupported' in platforms) {
      const unsupported = platforms.unsupported as string[];
      return !unsupported.includes('cursor');
    }

    if ('supported' in platforms) {
      const supported = platforms.supported as string[];
      return supported.includes('cursor');
    }

    return true;
  },
};

module.exports = { cursorAdapter };
