// @ts-nocheck

/**
 * Platform Adapter Interface
 * Transforms skill content and paths for different AI coding tool providers
 */

/** @type {import('./adapter').TransformContext} */
const TransformContext = {
  moduleName: '',
  skillName: '',
  platform: '',
  targetDir: ''
};

/** @type {import('./adapter').PlatformAdapter} */
const PlatformAdapter = {
  platform: '',
  getCommandPrefix() { return '/'; },
  transform(content, ctx) { return content; },
  transformPath(path) { return path; },
  supportsType(type) { return true; },
  shouldInstall(manifest) { return true; }
};

module.exports = { PlatformAdapter, TransformContext };
