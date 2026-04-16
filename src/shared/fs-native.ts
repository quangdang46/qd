// @ts-nocheck

/**
 * fs-native - Node.js fs with promise-based API
 */

const fs = require('fs').promises;
const fsc = require('fs');
const path = require('path');

const _fs = {
  // Path utilities
  async pathExists(p) {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  },

  existsSync(p) {
    return fsc.existsSync(p);
  },

  readJsonSync(p) {
    return JSON.parse(fsc.readFileSync(p, 'utf8'));
  },

  // Read/write files
  async readFile(p, encoding = 'utf8') {
    return await fs.readFile(p, encoding);
  },

  async writeFile(p, content, encoding = 'utf8') {
    await fs.writeFile(p, content, encoding);
  },

  // Directory operations
  async readdir(p, options = {}) {
    return await fs.readdir(p, options);
  },

  async ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
  },

  async copy(src, dest, options = {}) {
    const filterFn = options.filter;
    const overwrite = options.overwrite !== false;
    const srcStat = await fs.stat(src);

    if (srcStat.isFile()) {
      if (filterFn && !(await filterFn(src, dest))) return;
      await fs.mkdir(path.dirname(dest), { recursive: true });
      if (!overwrite) {
        try {
          await fs.access(dest);
          return;
        } catch {
          // dest doesn't exist, proceed
        }
      }
      await fs.copyFile(src, dest);
      return;
    }

    if (srcStat.isDirectory()) {
      if (filterFn && !(await filterFn(src, dest))) return;
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        await this.copy(path.join(src, entry.name), path.join(dest, entry.name), options);
      }
    }
  },

  async remove(p) {
    try {
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        await fs.rm(p, { recursive: true });
      } else {
        await fs.unlink(p);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  },

  async stat(p) {
    return await fs.stat(p);
  },

  createReadStream(p, options = {}) {
    return fsc.createReadStream(p, options);
  },

  async mkdtemp(prefix) {
    return await fs.mkdtemp(prefix);
  },
};

module.exports = _fs;
