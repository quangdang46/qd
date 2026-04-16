// @ts-nocheck

/**
 * Logger - Verbose debug output
 * From cli/logger.ts pattern
 */

let _verbose = false;
let _logFile = null;

const logger = {
  setVerbose(v) {
    _verbose = v;
  },

  isVerbose() {
    return _verbose;
  },

  setLogFile(file) {
    _logFile = file;
  },

  verbose(message, data = {}) {
    if (!_verbose) return;

    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message} ${
      Object.keys(data).length > 0 ? JSON.stringify(data) : ''
    }`;

    console.error(entry);

    if (_logFile) {
      const fs = require('fs');
      fs.appendFileSync(_logFile, entry + '\n');
    }
  },

  error(message) {
    console.error(`[ERROR] ${message}`);
  },

  info(message) {
    console.log(`[INFO] ${message}`);
  },
};

module.exports = { logger };
