// @ts-nocheck

/**
 * Manifest - Installation manifest reader/writer for QD
 * Based on BMAD's manifest pattern: .qd/_config/manifest.yaml
 */

const path = require('node:path');
const fs = require('../../shared/fs-native');
const yaml = require('yaml');

class Manifest {
  /**
   * Read existing manifest
   * @param {string} qdDir - Path to _qd directory
   * @returns {Object|null} Manifest data or null if not found
   */
  async read(qdDir) {
    const manifestPath = path.join(qdDir, '_config', 'manifest.yaml');

    if (!(await fs.pathExists(manifestPath))) {
      return null;
    }

    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      return yaml.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Write manifest to .qd/_config/manifest.yaml
   * @param {string} qdDir - Path to _qd directory
   * @param {Object} data - Manifest data
   */
  async write(qdDir, data) {
    const cfgDir = path.join(qdDir, '_config');
    await fs.ensureDir(cfgDir);

    const manifestPath = path.join(cfgDir, 'manifest.yaml');
    const manifestData = {
      installation: {
        version: data.version || '1.0.0',
        installDate: data.installDate || new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
      ides: data.ides || [],
      artifacts: data.artifacts || [],
    };

    const yamlContent = yaml.stringify(manifestData, {
      indent: 2,
      lineWidth: 0,
      sortKeys: false,
    });

    const content = yamlContent.endsWith('\n') ? yamlContent : yamlContent + '\n';
    await fs.writeFile(manifestPath, content, 'utf8');
  }

  /**
   * Add or update an IDE in the manifest
   * @param {string} qdDir - Path to _qd directory
   * @param {string} ide - IDE identifier to add
   */
  async addIde(qdDir, ide) {
    const manifest = await this.read(qdDir);
    if (!manifest) return;

    const ides = manifest.ides || [];
    if (!ides.includes(ide)) {
      ides.push(ide);
      manifest.ides = ides;
      manifest.installation.lastUpdated = new Date().toISOString();
      await this.write(qdDir, manifest);
    }
  }

  /**
   * Remove an IDE from the manifest
   * @param {string} qdDir - Path to _qd directory
   * @param {string} ide - IDE identifier to remove
   */
  async removeIde(qdDir, ide) {
    const manifest = await this.read(qdDir);
    if (!manifest) return;

    const ides = manifest.ides || [];
    const index = ides.indexOf(ide);
    if (index !== -1) {
      ides.splice(index, 1);
      manifest.ides = ides;
      manifest.installation.lastUpdated = new Date().toISOString();
      await this.write(qdDir, manifest);
    }
  }

  /**
   * Get list of installed IDEs from manifest
   * @param {string} qdDir - Path to _qd directory
   * @returns {Array} Array of IDE identifiers
   */
  async getIdes(qdDir) {
    const manifest = await this.read(qdDir);
    return manifest?.ides || [];
  }
}

module.exports = { Manifest };