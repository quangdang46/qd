// @ts-nocheck

/**
 * Project Root utilities
 */

const path = require('node:path');
const fs = require('../../shared/fs-native');

function findProjectRoot(startPath = path.join(__dirname, '..')) {
  // First try using require.resolve to find the qdspec package
  try {
    const qdspecPath = require.resolve('qdspec/package.json');
    const qdspecDir = path.dirname(qdspecPath);
    if (fs.existsSync(path.join(qdspecDir, 'artifacts'))) {
      return qdspecDir;
    }
  } catch {
    // Continue with fallback
  }

  // Fallback: walk up from startPath looking for qdspec package.json
  let currentPath = path.resolve(startPath);

  while (currentPath !== path.dirname(currentPath)) {
    const packagePath = path.join(currentPath, 'package.json');

    if (fs.existsSync(packagePath)) {
      try {
        const pkg = fs.readJsonSync(packagePath);
        if (pkg.name === 'qdspec') {
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
