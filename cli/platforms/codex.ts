// @ts-nocheck

const { PlatformAdapter, TransformContext } = require('./adapter');

/**
 * Codex adapter (OpenAI)
 * - Transforms /qd:skill → $skill
 * - Supports stateless skills with optional agents/openai.yaml
 */
const codexAdapter: PlatformAdapter = {
  platform: 'codex',

  getCommandPrefix(): string {
    return '$';
  },

  transform(content: string, ctx: TransformContext): string {
    // Transform Claude Code command syntax to Codex $ syntax
    let result = content
      // /qd:skill-name → $skill-name
      .replace(/\/qd:([\w-]+)/g, (_, name) => `$${name}`)
      // /skill-name → $skill-name
      .replace(/\/([\w-]+)/g, (_, name) => `$${name}`);

    // Remove IF blocks for other platforms, keep codex
    result = result
      .replace(/<!-- IF codex -->([\s\S]*?)<!-- END -->/g, '$1')
      .replace(/<!-- IF (?!codex)([\s\S]*?)<!-- END -->/g, '');

    return result;
  },

  transformPath(path: string): string {
    return path;
  },

  supportsType(type: string): boolean {
    // Codex supports skills and workflows
    return type === 'skill' || type === 'workflow';
  },

  shouldInstall(manifest: Record<string, unknown>): boolean {
    // Codex doesn't support autonomous agents
    if (manifest.type === 'autonomous') return false;

    const platforms = manifest.platforms as Record<string, unknown> | undefined;
    if (!platforms) return true;

    if ('unsupported' in platforms) {
      const unsupported = platforms.unsupported as string[];
      return !unsupported.includes('codex');
    }

    if ('supported' in platforms) {
      const supported = platforms.supported as string[];
      return supported.includes('codex');
    }

    return true;
  },
};

module.exports = { codexAdapter };
