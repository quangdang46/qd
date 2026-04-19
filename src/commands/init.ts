// @ts-nocheck

/**
 * Init Command
 * Initializes QD artifacts for selected IDEs
 * Supports local dev mode and remote GitHub download with version selection
 */

const path = require('node:path');
const { Installer } = require('../domains/installation/installer');
const { loadPlatformCodes } = require('../domains/ide/platform-codes');
const { GitHubClient, ErrorCategory } = require('../domains/github/github-client');
const { VersionSelector } = require('../domains/github/version-selector');
const { downloadVersion } = require('../domains/github/download');

const IS_DEV = process.env.QD_ENV === 'development';

function registerInit(program) {
  program
    .command('init')
    .description('Initialize QD artifacts for selected IDEs')
    .option('--ides <ides>', 'Comma-separated list of IDE IDs (e.g., "claude-code,cursor")')
    .option('--directory <path>', 'Project directory (default: current directory)')
    .option('--version <version>', 'Specific version to install (e.g., v0.1.0)')
    .option('--no-cache', 'Bypass cache and re-download even if cached')
    .action(async (options) => {
      const installer = new Installer();
      const prompts = require('../shared/prompts');

      try {
        const projectDir = options.directory || process.cwd();
        let ides = [];
        let artifactsDir = null;

        // ========================================
        // Step 1: Resolve artifacts source
        // ========================================
        if (IS_DEV) {
          // Dev mode: use local artifacts/ directory
          artifactsDir = path.join(projectDir, 'artifacts');
          await prompts.log.info('Dev mode: using local artifacts/');
        } else if (options.version) {
          // Specific version requested: download from GitHub
          await prompts.log.info(`Downloading version ${options.version}...`);
          try {
            const result = await downloadVersion(options.version, {
              cache: !options.noCache,
              force: !!options.noCache,
            });
            artifactsDir = result.artifactsDir;
            await prompts.log.success(`Installed from cache: ${result.fromCache}`);
          } catch (err) {
            // On download error, try fallback to local artifacts
            await prompts.log.warn(`Download failed: ${err.message}`);
            await prompts.log.info('Falling back to local artifacts/...');
            artifactsDir = path.join(projectDir, 'artifacts');
          }
        } else {
          // No version specified: interactive version selection from GitHub
          const githubClient = new GitHubClient();
          const versionSelector = new VersionSelector(githubClient);

          try {
            // Check rate limit first
            const rateLimit = await githubClient.checkRateLimit();
            if (rateLimit.remaining === 0) {
              await prompts.log.warn('GitHub API rate limit exceeded');
              await prompts.log.info('Set GITHUB_TOKEN env var for 5,000 req/hr');
              // Fallback to local artifacts
              artifactsDir = path.join(projectDir, 'artifacts');
              if (!(await require('../shared/fs-native').pathExists(artifactsDir))) {
                throw new Error('No GitHub access and no local artifacts/ found');
              }
            } else {
              // Show version picker
              const selectedVersion = await versionSelector.selectVersion();
              if (!selectedVersion) {
                throw new Error('No version selected');
              }

              await prompts.log.info(`Downloading version ${selectedVersion}...`);
              const result = await downloadVersion(selectedVersion, {
                cache: !options.noCache,
                force: !!options.noCache,
              });
              artifactsDir = result.artifactsDir;
            }
          } catch (err) {
            if (err.classified?.category === ErrorCategory.RATE_LIMIT) {
              await prompts.log.warn('GitHub API rate limit exceeded');
              await prompts.log.info('Set GITHUB_TOKEN env var for 5,000 req/hr');
              artifactsDir = path.join(projectDir, 'artifacts');
              if (!(await require('../shared/fs-native').pathExists(artifactsDir))) {
                throw new Error('No GitHub access and no local artifacts/ found');
              }
            } else {
              throw err;
            }
          }
        }

        // Verify artifactsDir exists
        const fs = require('../shared/fs-native');
        if (!(await fs.pathExists(artifactsDir))) {
          throw new Error(`Artifacts directory not found: ${artifactsDir}`);
        }

        // ========================================
        // Step 2: IDE Selection
        // ========================================
        if (options.ides) {
          ides = options.ides
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(s => s.length > 0);
        } else {
          // Interactive mode - show IDE selection
          await prompts.intro('QD Init');
          const platformConfig = await loadPlatformCodes();

          const availableIdes = Object.entries(platformConfig.platforms)
            .filter(([, config]) => config.installer && !config.suspended)
            .map(([value, config]) => ({
              value,
              label: config.name + (config.preferred ? ' ★' : ''),
              hint: config.preferred ? 'recommended' : undefined,
            }))
            .sort((a, b) => {
              if (a.hint && !b.hint) return -1;
              if (!a.hint && b.hint) return 1;
              return a.label.localeCompare(b.label);
            });

          const defaultIdes = ['claude-code'];

          await prompts.note('★ = recommended · Use ↑/↓ to navigate, SPACE select, ENTER confirm', 'Navigation');

          const selected = await prompts.multiselect({
            message: 'Select IDEs to install:',
            options: availableIdes,
            required: true,
            maxItems: 8,
            initialValues: defaultIdes,
          });

          ides = selected;
        }

        if (ides.length === 0) {
          await prompts.log.error('No IDEs specified. Use --ides to specify IDEs (e.g., --ides claude-code,cursor)');
          await prompts.log.message('Available IDEs: claude-code, cursor, windsurf, codex');
          process.exit(1);
        }

        await prompts.log.info(`Initializing for IDEs: ${ides.join(', ')}`);

        // ========================================
        // Step 3: Run installer with resolved artifactsDir
        // ========================================
        const result = await installer.install({
          ides,
          directory: projectDir,
          autoConfirm: !!options.ides,
          artifactsDir, // Inject the resolved artifacts directory
        });

        if (result && result.success) {
          await prompts.outro('QD is ready to use!');
          process.exit(0);
        } else if (result && result.success === false) {
          process.exit(0);
        } else {
          process.exit(1);
        }
      } catch (error) {
        try {
          await prompts.log.error(`Init failed: ${error.message}`);
        } catch {
          console.error(error.message);
        }
        process.exit(1);
      }
    });
}

module.exports = { registerInit };
