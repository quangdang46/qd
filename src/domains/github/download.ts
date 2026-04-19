// @ts-nocheck
/**
 * Download Module for QD
 * Handles tarball/zipball download, extraction, and caching
 */

const fs = require('../../shared/fs-native');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

const CACHE_DIR = path.join(os.homedir(), '.cache', 'qdspec');

/**
 * Compute cache key from URL
 */
function getCacheKey(url, tag) {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `${tag}-${hash}`;
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir() {
  await fs.ensureDir(CACHE_DIR);
}

/**
 * Get cached archive path if exists
 */
async function getCachedArchive(tag, url) {
  const key = getCacheKey(url, tag);
  const archivePath = path.join(CACHE_DIR, `${key}.tar.gz`);
  const exists = await fs.pathExists(archivePath);
  if (exists) {
    return archivePath;
  }
  return null;
}

/**
 * Download file from URL
 */
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    const client = url.startsWith('https://') ? https : http;

    const req = client.get(url, (res) => {
      if (res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.redirected ? res.responseUrl || url : url;
        if (redirectUrl !== url) {
          // Handle redirect
          const redirectClient = redirectUrl.startsWith('https://') ? https : http;
          redirectClient.get(redirectUrl, (redirectRes) => {
            if (redirectRes.statusCode === 200) {
              redirectRes.pipe(file);
            } else {
              reject(new Error(`Redirect failed: ${redirectRes.statusCode}`));
              return;
            }
          }).on('error', reject);
        } else {
          res.pipe(file);
        }
      } else {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });

    file.on('finish', () => {
      file.close();
      resolve();
    });

    file.on('error', reject);
  });
}

/**
 * Extract tar.gz archive to directory
 */
async function extractTarGz(archivePath, destination) {
  await fs.ensureDir(destination);

  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', archivePath, '-C', destination, '--strip-components=1']);

    tar.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar extraction failed with code ${code}`));
      }
    });

    tar.on('error', reject);
  });
}

/**
 * Extract zip archive to directory
 */
async function extractZip(archivePath, destination) {
  await fs.ensureDir(destination);

  return new Promise((resolve, reject) => {
    const unzip = spawn('unzip', ['-o', archivePath, '-d', destination]);

    unzip.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`unzip extraction failed with code ${code}`));
      }
    });

    unzip.on('error', reject);
  });
}

/**
 * Download and extract release artifacts
 */
async function downloadAndExtract(url, tag, options = {}) {
  const { cache = true, force = false, destDir } = options;

  await ensureCacheDir();

  const cachedPath = await getCachedArchive(tag, url);
  let archivePath = cachedPath;
  let fromCache = !!cachedPath;

  // Download if not cached or force redownload
  if (!archivePath || force) {
    const key = getCacheKey(url, tag);
    archivePath = path.join(CACHE_DIR, `${key}.tar.gz`);
    fromCache = false;

    // Download tarball from GitHub
    if (url.startsWith('https://')) {
      await downloadFile(url, archivePath);
    } else {
      throw new Error('URL must be HTTPS');
    }
  }

  if (!destDir) {
    throw new Error('destDir is required');
  }

  // Extract to destination
  if (archivePath.endsWith('.zip')) {
    await extractZip(archivePath, destDir);
  } else {
    await extractTarGz(archivePath, destDir);
  }

  // Clean up archive if from cache (keep cache intact)
  // Note: we keep archives in cache for future use

  return { destDir, fromCache };
}

/**
 * Find the artifacts directory within extracted content
 * GitHub tarball extracts as owner-repo-tag/ - artifacts/ is inside that
 */
async function findArtifactsDir(extractedDir) {
  const candidates = [
    path.join(extractedDir, 'artifacts'),
    extractedDir, // artifacts might be at root
  ];

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        // Check if it looks like an artifacts dir (contains module.yaml or has subdirs)
        const contents = await fs.readdir(candidate);
        if (contents.length > 0) {
          return candidate;
        }
      }
    }
  }

  return extractedDir;
}

/**
 * Download specific version and return artifacts directory
 */
async function downloadVersion(tag, options = {}) {
  const { cache = true, force = false } = options;

  const { GitHubClient } = require('./github-client');
  const client = new GitHubClient();

  // Get release info
  const release = await client.getReleaseByTag(tag);

  // Determine download URL - prefer tarball_url over assets
  let downloadUrl = release.tarball_url;

  // If no tarball_url, try to find an asset
  if (!downloadUrl && release.assets && release.assets.length > 0) {
    const asset = release.assets.find((a) =>
      a.name.endsWith('.tar.gz') || a.name.endsWith('.tgz') || a.name.endsWith('.zip')
    );
    if (asset) {
      downloadUrl = asset.browser_download_url;
    }
  }

  if (!downloadUrl) {
    throw new Error(`No downloadable artifact found for tag ${tag}`);
  }

  // Create temp extraction directory
  const tempDir = path.join(os.tmpdir(), `qdspec-${tag}-${Date.now()}`);

  try {
    // Download and extract
    await downloadAndExtract(downloadUrl, tag, { cache, force, destDir: tempDir });

    // Find artifacts directory
    const artifactsDir = await findArtifactsDir(tempDir);

    return {
      tag,
      artifactsDir,
      extractedDir: tempDir,
      fromCache: false,
    };
  } catch (error) {
    // Clean up on error
    try {
      if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
      }
    } catch { /* ignore */ }
    throw error;
  }
}

/**
 * Clear cache for specific tag
 */
async function clearCache(tag) {
  await ensureCacheDir();
  const files = await fs.readdir(CACHE_DIR);
  const prefix = `${tag}-`;
  let cleared = 0;

  for (const file of files) {
    if (file.startsWith(prefix) && (file.endsWith('.tar.gz') || file.endsWith('.zip'))) {
      await fs.remove(path.join(CACHE_DIR, file));
      cleared++;
    }
  }

  return cleared;
}

/**
 * Get cache info
 */
async function getCacheInfo() {
  await ensureCacheDir();
  const files = await fs.readdir(CACHE_DIR);
  const entries = [];

  for (const file of files) {
    if (file.endsWith('.tar.gz') || file.endsWith('.zip')) {
      const filePath = path.join(CACHE_DIR, file);
      const stat = await fs.stat(filePath);
      entries.push({
        file,
        size: stat.size,
        cachedAt: stat.mtime,
      });
    }
  }

  return entries;
}

module.exports = {
  downloadVersion,
  downloadAndExtract,
  clearCache,
  getCacheInfo,
  CACHE_DIR,
};
