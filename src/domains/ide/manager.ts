// @ts-nocheck

/**
 * IdeManager - Handles IDE-specific setup and detection
 */

const prompts = require('../../shared/prompts');

class IdeManager {
  constructor() {
    this.handlers = new Map();
    this._initialized = false;
    this.qdFolderName = '_qd';
  }

  setQdFolderName(qdFolderName) {
    this.qdFolderName = qdFolderName;
  }

  async ensureInitialized() {
    if (!this._initialized) {
      await this.loadHandlers();
      this._initialized = true;
    }
  }

  async loadHandlers() {
    const { loadPlatformCodes } = require('./platform-codes');
    const platformConfig = await loadPlatformCodes();

    const { ConfigDrivenIdeSetup } = require('./_config-driven');

    for (const [platformCode, platformInfo] of Object.entries(platformConfig.platforms)) {
      if (!platformInfo.installer) continue;

      const handler = new ConfigDrivenIdeSetup(platformCode, platformInfo);
      if (typeof handler.setQdFolderName === 'function') {
        handler.setQdFolderName(this.qdFolderName);
      }
      this.handlers.set(platformCode, handler);
    }
  }

  getAvailableIdes() {
    const ides = [];
    for (const [key, handler] of this.handlers) {
      const name = handler.displayName || handler.name || key;
      if (!key || !name) continue;
      if (handler.platformConfig?.suspended) continue;

      ides.push({
        value: key,
        name: name,
        preferred: handler.preferred || false,
      });
    }

    ides.sort((a, b) => {
      if (a.preferred && !b.preferred) return -1;
      if (!a.preferred && b.preferred) return 1;
      return a.name.localeCompare(b.name);
    });

    return ides;
  }

  getPreferredIdes() {
    return this.getAvailableIdes().filter((ide) => ide.preferred);
  }

  getOtherIdes() {
    return this.getAvailableIdes().filter((ide) => !ide.preferred);
  }

  async setup(ideName, projectDir, qdDir, options = {}) {
    const handler = this.handlers.get(ideName.toLowerCase());
    if (!handler) {
      await prompts.log.warn(`IDE '${ideName}' is not yet supported`);
      return { success: false, ide: ideName, error: 'unsupported IDE' };
    }

    if (handler.platformConfig?.suspended) {
      return { success: false, ide: ideName, error: 'suspended' };
    }

    try {
      const handlerResult = await handler.setup(projectDir, qdDir, options);
      return { success: handlerResult?.success !== false, ide: ideName };
    } catch (error) {
      return { success: false, ide: ideName, error: error.message };
    }
  }

  async cleanup(projectDir, options = {}) {
    const results = [];
    for (const [name, handler] of this.handlers) {
      try {
        await handler.cleanup(projectDir, options);
        results.push({ ide: name, success: true });
      } catch (error) {
        results.push({ ide: name, success: false, error: error.message });
      }
    }
    return results;
  }

  async detectInstalledIdes(projectDir) {
    const detected = [];
    for (const [name, handler] of this.handlers) {
      if (typeof handler.detect === 'function' && (await handler.detect(projectDir))) {
        detected.push(name);
      }
    }
    return detected;
  }
}

module.exports = { IdeManager };
