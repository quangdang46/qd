// @ts-nocheck
/**
 * Version Selector for QD
 * Interactive version selection for GitHub releases
 */

const { GitHubClient } = require('./github-client');
const prompts = require('../../shared/prompts');

class VersionSelector {
  constructor(githubClient) {
    this.githubClient = githubClient || new GitHubClient();
  }

  /**
   * Select version interactively
   */
  async selectVersion(options = {}) {
    const { includePrereleases = false, limit = 10 } = options;

    const spinner = prompts.spinner();
    spinner.start();

    try {
      const releases = await this.githubClient.listReleases(limit * 2);

      spinner.stop();

      // Filter releases
      const filtered = releases.filter((r) => {
        if (r.draft) return false;
        if (!includePrereleases && r.prerelease) return false;
        return true;
      }).slice(0, limit);

      if (filtered.length === 0) {
        const e = new Error('No versions available');
        throw e;
      }

      // Build version options
      const versionOptions = filtered.map((r, index) => ({
        value: r.tag_name,
        label: r.tag_name,
        hint: r.prerelease ? 'prerelease' : index === 0 ? 'latest' : undefined,
      }));

      // Add manual entry option
      const finalOptions = [
        ...versionOptions,
        { value: '__manual__', label: 'Enter version manually', hint: 'specify exact tag' },
      ];

      const selected = await prompts.select({
        message: 'Select version:',
        options: finalOptions,
        initialValue: filtered[0]?.tag_name,
      });

      if (selected === '__manual__') {
        const manualVersion = await prompts.text({
          message: 'Enter version tag (e.g., v0.1.0):',
          placeholder: 'v0.1.0',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Version is required';
            }
            return true;
          },
        });
        return manualVersion.trim();
      }

      return selected;
    } catch (error) {
      spinner.stop();
      throw error;
    }
  }

  /**
   * Get latest version without prompting
   */
  async getLatestVersion(includePrereleases = false) {
    try {
      const release = await this.githubClient.getLatestRelease(includePrereleases);
      return release?.tag_name || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all available versions
   */
  async listVersions(limit = 20) {
    const releases = await this.githubClient.listReleases(limit);
    return releases.map((r) => ({
      tag_name: r.tag_name,
      prerelease: r.prerelease,
      published_at: r.published_at,
    }));
  }

  /**
   * Check if a specific version exists
   */
  async versionExists(tag) {
    try {
      await this.githubClient.getReleaseByTag(tag);
      return true;
    } catch (error) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }
}

module.exports = { VersionSelector };
