// @ts-nocheck

const path = require('node:path');
const fs = require('./fs-native');

/**
 * Find the BMAD project root directory by looking for package.json
 * or specific BMAD markers
 */
function findProjectRoot(startPath = path.join(__dirname, '..')) {
  let currentPath = path.resolve(startPath);

  // Keep going up until we find package.json with BMAD package markers
  while (currentPath !== path.dirname(currentPath)) {
    const packagePath = path.join(currentPath, 'package.json');

    if (fs.existsSync(packagePath)) {
      try {
        const pkg = fs.readJsonSync(packagePath);
        // Check if this is the BMAD project
        if ((pkg.name === 'bmad' || pkg.name === 'bmad-method') || fs.existsSync(path.join(currentPath, 'src', 'core-skills'))) {
          return currentPath;
        }
      } catch {
        // Continue searching
      }
    }

    // Also check for src/core-skills as a marker
    if (fs.existsSync(path.join(currentPath, 'src', 'core-skills', 'agents'))) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  // If we can't find it, use process.cwd() as fallback
  return process.cwd();
}

// Cache the project root after first calculation
let cachedRoot = null;

function getProjectRoot() {
  if (!cachedRoot) {
    cachedRoot = findProjectRoot();
  }
  return cachedRoot;
}

/**
 * Get path to source directory
 */
function getSourcePath(...segments) {
  return path.join(getProjectRoot(), 'src', ...segments);
}

/**
 * Get path to a module's directory under src/
 * Built-in modules: bmad -> bmm-skills (unified BMAD module).
 * Legacy aliases kept for backward compatibility: core -> core-skills, bmm -> bmm-skills.
 * Any other name resolves under src/modules/{name} (legacy layout).
 */
function getModulePath(moduleName, ...segments) {
  if (moduleName === 'bmad') {
    return getSourcePath('bmm-skills', ...segments);
  }
  if (moduleName === 'core') {
    return getSourcePath('core-skills', ...segments);
  }
  if (moduleName === 'bmm') {
    return getSourcePath('bmm-skills', ...segments);
  }
  return getSourcePath('modules', moduleName, ...segments);
}

module.exports = {
  getProjectRoot,
  getSourcePath,
  getModulePath,
  findProjectRoot,
};
