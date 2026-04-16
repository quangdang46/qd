// @ts-nocheck

/**
 * Platform Codes - Load and cache IDE platform configuration
 */

const fs = require('../../shared/fs-native');
const path = require('node:path');
const yaml = require('yaml');
const { getProjectRoot } = require('../installation/project-root');

async function resolvePlatformCodesPath() {
  const candidates = [
    path.join(__dirname, 'platform-codes.yaml'),
    path.join(getProjectRoot(), 'src', 'domains', 'ide', 'platform-codes.yaml'),
    path.join(getProjectRoot(), 'ide', 'platform-codes.yaml'),
  ];
  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

let _cachedPlatformCodes = null;

async function loadPlatformCodes() {
  if (_cachedPlatformCodes) {
    return _cachedPlatformCodes;
  }

  const platformCodesPath = await resolvePlatformCodesPath();
  if (!platformCodesPath) {
    throw new Error(`Platform codes configuration not found`);
  }

  const content = await fs.readFile(platformCodesPath, 'utf8');
  _cachedPlatformCodes = yaml.parse(content);
  return _cachedPlatformCodes;
}

function clearCache() {
  _cachedPlatformCodes = null;
}

module.exports = {
  loadPlatformCodes,
  clearCache,
};
