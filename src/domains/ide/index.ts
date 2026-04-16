// @ts-nocheck

/**
 * IDE domain - IDE detection, platform codes, and setup
 */

// Re-export from ide subdirectory
module.exports = {
  loadPlatformCodes: require('./platform-codes'),
  IdeManager: require('./manager'),
};
