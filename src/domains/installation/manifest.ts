// @ts-nocheck

/**
 * Manifest - Installation manifest reader/writer
 * From cli/core/manifest.ts
 */

const path = require('node:path');
const fs = require('../../shared/fs-native');

class Manifest {
  async _readRaw(qdDir) {
    const manifestPath = path.join(qdDir, 'manifest.json');

    if (!(await fs.pathExists(manifestPath))) {
      return null;
    }

    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

module.exports = { Manifest };
