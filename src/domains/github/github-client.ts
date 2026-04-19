// @ts-nocheck
/**
 * GitHub Client for QD
 * Fetches releases and assets from GitHub
 * Uses gh CLI for auth (like Claudekit) with fallback to GITHUB_TOKEN env var
 */

const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

/**
 * Error classification for GitHub API errors
 */
const ErrorCategory = {
  RATE_LIMIT: 'RATE_LIMIT',
  AUTH_MISSING: 'AUTH_MISSING',
  AUTH_SCOPE: 'AUTH_SCOPE',
  REPO_ACCESS: 'REPO_ACCESS',
  REPO_NOT_FOUND: 'REPO_NOT_FOUND',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Classify GitHub API errors
 */
function classifyGitHubError(error, operation) {
  const status = error.status;
  const message = error.message || '';

  if (status === 403 && message.toLowerCase().includes('rate limit')) {
    return {
      category: ErrorCategory.RATE_LIMIT,
      message: 'GitHub API rate limit exceeded',
      details: 'Set GITHUB_TOKEN env var for 5,000 req/hr',
      suggestion: 'Wait for rate limit to reset or set GITHUB_TOKEN',
    };
  }

  if (status === 401) {
    return {
      category: ErrorCategory.AUTH_MISSING,
      message: 'Not authenticated with GitHub',
      details: 'GitHub token may be invalid or expired',
      suggestion: 'Set GITHUB_TOKEN env var or run gh auth login',
    };
  }

  if (status === 403) {
    return {
      category: ErrorCategory.AUTH_SCOPE,
      message: 'GitHub token missing required permissions',
      suggestion: 'Ensure token has repo scope',
    };
  }

  if (status === 404) {
    return {
      category: ErrorCategory.REPO_NOT_FOUND,
      message: 'Repository not found or access denied',
      suggestion: 'Check repository URL and access permissions',
    };
  }

  return {
    category: ErrorCategory.UNKNOWN,
    message: operation ? `Failed to ${operation}` : 'An unexpected error occurred',
    details: error.message || 'Unknown error',
    suggestion: 'Try again or check your network connection',
  };
}

/**
 * Get GitHub token - prefers gh CLI, falls back to env var
 */
function getGitHubToken() {
  // Try gh CLI first (like Claudekit does)
  try {
    const token = execSync('gh auth token -h github.com', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (token && token.length > 0) {
      return token;
    }
  } catch {
    // gh CLI failed, fall back to env var
  }

  // Fall back to GITHUB_TOKEN env var
  return process.env.GITHUB_TOKEN || null;
}

/**
 * Make HTTP request to GitHub API
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;

    const token = getGitHubToken();
    const headers = {
      'User-Agent': 'qdspec-cli',
      Accept: 'application/vnd.github+json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const req = client.get(url, { headers }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve(parsed);
          } else {
            const error = new Error(parsed.message || `HTTP ${res.statusCode}`);
            error.status = res.statusCode;
            error.response = { headers: res.headers };
            reject(error);
          }
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            const error = new Error(`HTTP ${res.statusCode}`);
            error.status = res.statusCode;
            reject(error);
          }
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

const GITHUB_API = 'https://api.github.com';

class GitHubClient {
  constructor() {
    this.owner = 'quangdang46';
    this.repo = 'qd';
  }

  /**
   * List releases for the repository
   */
  async listReleases(limit = 30) {
    try {
      const url = `${GITHUB_API}/repos/${this.owner}/${this.repo}/releases?per_page=${limit}`;
      const releases = await request(url);
      return releases.map((r) => ({
        tag_name: r.tag_name,
        name: r.name || r.tag_name,
        prerelease: r.prerelease,
        draft: r.draft,
        published_at: r.published_at,
        tarball_url: r.tarball_url,
        zipball_url: r.zipball_url,
        assets: (r.assets || []).map((a) => ({
          name: a.name,
          size: a.size,
          browser_download_url: a.browser_download_url,
        })),
      }));
    } catch (error) {
      const classified = classifyGitHubError(error, 'list releases');
      const e = new Error(classified.message);
      e.classified = classified;
      e.status = error.status;
      throw e;
    }
  }

  /**
   * Get release by tag
   */
  async getReleaseByTag(tag) {
    try {
      const url = `${GITHUB_API}/repos/${this.owner}/${this.repo}/releases/tags/${tag}`;
      const release = await request(url);
      return {
        tag_name: release.tag_name,
        name: release.name || release.tag_name,
        prerelease: release.prerelease,
        draft: release.draft,
        published_at: release.published_at,
        tarball_url: release.tarball_url,
        zipball_url: release.zipball_url,
        assets: (release.assets || []).map((a) => ({
          name: a.name,
          size: a.size,
          browser_download_url: a.browser_download_url,
        })),
      };
    } catch (error) {
      if (error.status === 404) {
        const e = new Error(`Release '${tag}' not found`);
        e.classified = { category: ErrorCategory.REPO_NOT_FOUND, message: e.message };
        e.status = 404;
        throw e;
      }
      const classified = classifyGitHubError(error, 'get release');
      const e = new Error(classified.message);
      e.classified = classified;
      e.status = error.status;
      throw e;
    }
  }

  /**
   * Get latest release
   */
  async getLatestRelease(includePrereleases = false) {
    try {
      const releases = await this.listReleases(100);
      const stable = releases.filter((r) => !r.prerelease && !r.draft);
      const target = includePrereleases ? releases : stable;
      if (target.length === 0) {
        const e = new Error('No releases found');
        e.classified = { category: ErrorCategory.REPO_NOT_FOUND, message: e.message };
        throw e;
      }
      return target[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if we're rate limited
   */
  async checkRateLimit() {
    try {
      const url = `${GITHUB_API}/rate_limit`;
      const data = await request(url);
      return {
        remaining: data.rate.remaining,
        limit: data.rate.limit,
        reset: new Date(data.rate.reset * 1000),
      };
    } catch {
      return { remaining: 0, limit: 0, reset: null };
    }
  }
}

module.exports = { GitHubClient, ErrorCategory, classifyGitHubError };
