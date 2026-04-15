// @ts-nocheck

const { PlatformAdapter, TransformContext } = require('./adapter');

/**
 * OpenCode adapter
 * - Transforms /qd:skill → skill({ name: "skill" })
 * - OpenCode only supports stateless skills (no memory/autonomous)
 */
const opencodeAdapter: PlatformAdapter = {
  platform: 'opencode',

  getCommandPrefix(): string {
    return '@';
  },

  transform(content: string, ctx: TransformContext): string {
    // Transform Claude Code command syntax to OpenCode function call
    let result = content
      // /qd:skill-name → skill({ name: "skill-name" })
      .replace(/\/qd:([\w-]+)/g, (_, name) => `skill({ name: "${name}" })`)
      // /skill-name → skill({ name: "skill-name" })
      .replace(/\/([\w-]+)/g, (_, name) => `skill({ name: "${name}" })`);

    // Remove IF blocks for other platforms, keep opencode
    result = result
      .replace(/<!-- IF opencode -->([\s\S]*?)<!-- END -->/g, '$1')
      .replace(/<!-- IF (?!opencode)([\s\S]*?)<!-- END -->/g, '');

    return result;
  },

  transformPath(path: string): string {
    return path;
  },

  supportsType(type: string): boolean {
    // OpenCode only supports stateless skills
    return type === 'skill' || type === 'command';
  },

  shouldInstall(manifest: Record<string, unknown>): boolean {
    // OpenCode doesn't support autonomous agents
    if (manifest.type === 'autonomous') return false;

    const platforms = manifest.platforms as Record<string, unknown> | undefined;
    if (!platforms) return true;

    if ('unsupported' in platforms) {
      const unsupported = platforms.unsupported as string[];
      return !unsupported.includes('opencode');
    }

    if ('supported' in platforms) {
      const supported = platforms.supported as string[];
      return supported.includes('opencode');
    }

    return true;
  },
};

module.exports = { opencodeAdapter };
