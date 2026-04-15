// @ts-nocheck

const fs = require('../fs-native');
const path = require('node:path');
const yaml = require('yaml');

// Resolve platform-codes.yaml from both runtime locations:
// - source execution: cli/ide/platform-codes.yaml
// - dist execution: dist/ide/platform-codes.js -> ../../cli/ide/platform-codes.yaml
const PLATFORM_CODES_CANDIDATES = [
  path.join(__dirname, 'platform-codes.yaml'),
  path.join(__dirname, '..', '..', 'cli', 'ide', 'platform-codes.yaml'),
];

async function resolvePlatformCodesPath() {
  for (const candidate of PLATFORM_CODES_CANDIDATES) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

let _cachedPlatformCodes = null;

/**
 * Load the platform codes configuration from YAML
 * @returns {Object} Platform codes configuration
 */
async function loadPlatformCodes() {
  if (_cachedPlatformCodes) {
    return _cachedPlatformCodes;
  }

  const platformCodesPath = await resolvePlatformCodesPath();
  if (!platformCodesPath) {
    throw new Error(`Platform codes configuration not found. Checked: ${PLATFORM_CODES_CANDIDATES.join(', ')}`);
  }

  const content = await fs.readFile(platformCodesPath, 'utf8');
  _cachedPlatformCodes = yaml.parse(content);
  return _cachedPlatformCodes;
}

/**
 * Clear the cached platform codes (useful for testing)
 */
function clearCache() {
  _cachedPlatformCodes = null;
}

module.exports = {
  loadPlatformCodes,
  clearCache,
};
