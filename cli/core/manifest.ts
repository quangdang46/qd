// @ts-nocheck

const path = require('node:path');
const fs = require('../fs-native');
const crypto = require('node:crypto');
const { getProjectRoot } = require('../project-root');
const prompts = require('../prompts');

class Manifest {
  /**
   * Create a new manifest
   * @param {string} bmadDir - Path to bmad directory
   * @param {Object} data - Manifest data
   * @param {Array} installedFiles - List of installed files (no longer used, files tracked in files-manifest.csv)
   */
  async create(bmadDir, data, installedFiles = []) {
    const manifestPath = path.join(bmadDir, '_config', 'manifest.yaml');
    const yaml = require('yaml');

    // Ensure _config directory exists
    await fs.ensureDir(path.dirname(manifestPath));

    // Get the BMad version from package.json
    const bmadVersion = data.version || require(path.join(process.cwd(), 'package.json')).version;

    // Convert module list to new detailed format
    const moduleDetails = [];
    if (data.modules && Array.isArray(data.modules)) {
      for (const moduleName of data.modules) {
        // Unified BMAD module uses the package version
        const moduleVersion = moduleName === 'bmad' ? bmadVersion : null;
        const now = data.installDate || new Date().toISOString();

        moduleDetails.push({
          name: moduleName,
          version: moduleVersion,
          installDate: now,
          lastUpdated: now,
          source: moduleName === 'bmad' ? 'built-in' : 'unknown',
        });
      }
    }

    // Structure the manifest data
    const manifestData = {
      installation: {
        version: bmadVersion,
        installDate: data.installDate || new Date().toISOString(),
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      },
      modules: moduleDetails,
      ides: data.ides || [],
    };

    // Write YAML manifest
    // Clean the manifest data to remove any non-serializable values
    const cleanManifestData = structuredClone(manifestData);

    const yamlContent = yaml.stringify(cleanManifestData, {
      indent: 2,
      lineWidth: 0,
      sortKeys: false,
    });

    // Ensure POSIX-compliant final newline
    const content = yamlContent.endsWith('\n') ? yamlContent : yamlContent + '\n';
    await fs.writeFile(manifestPath, content, 'utf8');
    return { success: true, path: manifestPath, filesTracked: 0 };
  }

  /**
   * Read existing manifest
   * @param {string} bmadDir - Path to bmad directory
   * @returns {Object|null} Manifest data or null if not found
   */
  async read(bmadDir) {
    const yamlPath = path.join(bmadDir, '_config', 'manifest.yaml');
    const yaml = require('yaml');

    if (await fs.pathExists(yamlPath)) {
      try {
        const content = await fs.readFile(yamlPath, 'utf8');
        const manifestData = yaml.parse(content);

        // Handle new detailed module format
        const modules = manifestData.modules || [];

        // For backward compatibility: if modules is an array of strings (old format),
        // the calling code may need the array of names
        const moduleNames = modules.map((m) => (typeof m === 'string' ? m : m.name));

        // Check if we have the new detailed format
        const hasDetailedModules = modules.length > 0 && typeof modules[0] === 'object';

        // Flatten the structure for compatibility with existing code
        return {
          version: manifestData.installation?.version,
          installDate: manifestData.installation?.installDate,
          lastUpdated: manifestData.installation?.lastUpdated,
          modules: moduleNames, // Simple array of module names for backward compatibility
          modulesDetailed: hasDetailedModules ? modules : null, // New detailed format
          ides: manifestData.ides || [],
        };
      } catch (error) {
        await prompts.log.error(`Failed to read YAML manifest: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Read raw manifest data without flattening
   * @param {string} bmadDir - Path to bmad directory
   * @returns {Object|null} Raw manifest data or null if not found
   */
  async _readRaw(bmadDir) {
    const yamlPath = path.join(bmadDir, '_config', 'manifest.yaml');
    const yaml = require('yaml');

    if (await fs.pathExists(yamlPath)) {
      try {
        const content = await fs.readFile(yamlPath, 'utf8');
        return yaml.parse(content);
      } catch (error) {
        await prompts.log.error(`Failed to read YAML manifest: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Flatten manifest for backward compatibility
   * @param {Object} manifest - Raw manifest data
   * @returns {Object} Flattened manifest
   */
  _flattenManifest(manifest) {
    const modules = manifest.modules || [];
    const moduleNames = modules.map((m) => (typeof m === 'string' ? m : m.name));
    const hasDetailedModules = modules.length > 0 && typeof modules[0] === 'object';

    return {
      version: manifest.installation?.version,
      installDate: manifest.installation?.installDate,
      lastUpdated: manifest.installation?.lastUpdated,
      modules: moduleNames,
      modulesDetailed: hasDetailedModules ? modules : null,
      ides: manifest.ides || [],
    };
  }

  /**
   * Add a module to the manifest with optional version info
   * If module already exists, update its version info
   * @param {string} bmadDir - Path to bmad directory
   * @param {string} moduleName - Module name to add
   * @param {Object} options - Optional version info
   */
  async addModule(bmadDir, moduleName, options = {}) {
    let manifest = await this._readRaw(bmadDir);
    if (!manifest) {
      // Bootstrap a minimal manifest if it doesn't exist yet
      // (e.g., skill-only modules with no agents to compile)
      manifest = { modules: [] };
    }

    if (!manifest.modules) {
      manifest.modules = [];
    }

    const existingIndex = manifest.modules.findIndex((m) => m.name === moduleName);

    if (existingIndex === -1) {
      // Module doesn't exist, add it
      manifest.modules.push({
        name: moduleName,
        version: options.version || null,
        installDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        source: options.source || 'unknown',
      });
    } else {
      const existing = manifest.modules[existingIndex];
      const updated = {
        ...existing,
        version: options.version === undefined ? existing.version : options.version,
        source: options.source || existing.source,
        lastUpdated: new Date().toISOString(),
      };
      delete updated.npmPackage;
      delete updated.repoUrl;
      delete updated.localPath;
      manifest.modules[existingIndex] = updated;
    }

    await this._writeRaw(bmadDir, manifest);
  }

  /**
   * Get all modules with their version info
   * @param {string} bmadDir - Path to bmad directory
   * @returns {Array} Array of module info objects
   */
  async getAllModuleVersions(bmadDir) {
    const manifest = await this._readRaw(bmadDir);
    if (!manifest || !manifest.modules) {
      return [];
    }

    return manifest.modules;
  }

  /**
   * Write raw manifest data to file
   * @param {string} bmadDir - Path to bmad directory
   * @param {Object} manifestData - Raw manifest data to write
   */
  async _writeRaw(bmadDir, manifestData) {
    const yaml = require('yaml');
    const manifestPath = path.join(bmadDir, '_config', 'manifest.yaml');

    await fs.ensureDir(path.dirname(manifestPath));

    const cleanManifestData = structuredClone(manifestData);

    const yamlContent = yaml.stringify(cleanManifestData, {
      indent: 2,
      lineWidth: 0,
      sortKeys: false,
    });

    const content = yamlContent.endsWith('\n') ? yamlContent : yamlContent + '\n';
    await fs.writeFile(manifestPath, content, 'utf8');
  }

  /**
   * Calculate SHA256 hash of a file
   * @param {string} filePath - Path to file
   * @returns {string} SHA256 hash
   */
  async calculateFileHash(filePath) {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch {
      return null;
    }
  }

  /**
   * Get module version info from source
   * @param {string} moduleName - Module name/code
   * @param {string} bmadDir - Path to bmad directory
   * @param {string} moduleSourcePath - Optional source tree path for marketplace.json walk-up
   * @returns {Object} Version info: { version, source }
   */
  async getModuleVersionInfo(moduleName, bmadDir, moduleSourcePath = null) {
    if (moduleName === 'bmad') {
      const version = await this._readMarketplaceVersion(moduleName, moduleSourcePath);
      return {
        version,
        source: 'built-in',
      };
    }

    const version = await this._readMarketplaceVersion(moduleName, moduleSourcePath);
    return {
      version,
      source: 'unknown',
    };
  }

  /**
   * Read version from .claude-plugin/marketplace.json for a module
   * @param {string} moduleName - Module code
   * @returns {string|null} Version or null
   */
  async _readMarketplaceVersion(moduleName, moduleSourcePath = null) {
    let marketplacePath;

    if (moduleName === 'bmad') {
      marketplacePath = path.join(getProjectRoot(), '.claude-plugin', 'marketplace.json');
    } else if (moduleSourcePath) {
      let dir = moduleSourcePath;
      for (let i = 0; i < 5; i++) {
        const candidate = path.join(dir, '.claude-plugin', 'marketplace.json');
        if (await fs.pathExists(candidate)) {
          marketplacePath = candidate;
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }

    try {
      if (await fs.pathExists(marketplacePath)) {
        const data = JSON.parse(await fs.readFile(marketplacePath, 'utf8'));
        const plugins = data?.plugins;
        if (!Array.isArray(plugins) || plugins.length === 0) return null;
        let best = null;
        for (const p of plugins) {
          if (p.version && (!best || p.version > best)) best = p.version;
        }
        return best;
      }
    } catch {
      // ignore
    }
    return null;
  }
}

module.exports = { Manifest };
