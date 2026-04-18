// @ts-nocheck

/**
 * Init Command
 * Initializes QD artifacts for selected IDEs
 */

const { Installer } = require('../domains/installation/installer');
const { loadPlatformCodes } = require('../domains/ide/platform-codes');

function registerInit(program) {
  program
    .command('init')
    .description('Initialize QD artifacts for selected IDEs')
    .option('--ides <ides>', 'Comma-separated list of IDE IDs (e.g., "claude-code,cursor")')
    .option('--directory <path>', 'Project directory (default: current directory)')
    .action(async (options) => {
      const installer = new Installer();
      const prompts = require('../shared/prompts');

      try {
        const projectDir = options.directory || process.cwd();
        let ides = [];

        // If --ides provided, use it directly
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
              // Preferred first
              if (a.hint && !b.hint) return -1;
              if (!a.hint && b.hint) return 1;
              return a.label.localeCompare(b.label);
            });

          // Get default IDEs - only claude-code
          const defaultIdes = ['claude-code'];

          await prompts.note('★ = recommended · Use ↑/↓ to navigate, SPACE select, ENTER confirm', 'Navigation');
          
          // Multi-select IDEs with scrolling - use default IDEs pre-selected
          const selected = await prompts.multiselect({
            message: 'Select IDEs to install:',
            options: availableIdes,
            required: true,
            maxItems: 8,
            initialValues: defaultIdes, // Pre-select recommended IDEs
          });

          ides = selected;
        }

        if (ides.length === 0) {
          await prompts.log.error('No IDEs specified. Use --ides to specify IDEs (e.g., --ides claude-code,cursor)');
          await prompts.log.message('Available IDEs: claude-code, cursor, windsurf, codex');
          process.exit(1);
        }

        await prompts.log.info(`Initializing for IDEs: ${ides.join(', ')}`);
        const result = await installer.install({
          ides,
          directory: projectDir,
          autoConfirm: !!options.ides, // Auto-confirm conflicts when using --ides flag
        });

        if (result && result.success) {
          await prompts.outro('QD is ready to use!');
          process.exit(0);
        } else if (result && result.success === false) {
          // User cancelled at conflict prompt
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
