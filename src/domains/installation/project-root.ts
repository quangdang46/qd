// @ts-nocheck

/**
 * Project Root utilities
 */

const path = require('node:path');
const fs = require('../../shared/fs-native');

function findProjectRoot(startPath = path.join(__dirname, '..')) {
  let currentPath = path.resolve(startPath);

  while (currentPath !== path.dirname(currentPath)) {
    const packagePath = path.join(currentPath, 'package.json');

    if (fs.existsSync(packagePath)) {
      try {
        const pkg = fs.readJsonSync(packagePath);
        if (pkg.name === 'qd' || pkg.name === 'qd-method') {
          return currentPath;
        }
      } catch {
        // Continue searching
      }
    }
    currentPath = path.dirname(currentPath);
  }

  return process.cwd();
}

let cachedRoot = null;

function getProjectRoot() {
  if (!cachedRoot) {
    cachedRoot = findProjectRoot();
  }
  return cachedRoot;
}

function getArtifactsPath(...segments) {
  return path.join(getProjectRoot(), 'artifacts', ...segments);
}

module.exports = {
  getProjectRoot,
  getArtifactsPath,
  findProjectRoot,
};
