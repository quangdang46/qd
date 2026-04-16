// @ts-nocheck

/**
 * Init Command
 * Initializes QD artifacts for selected IDEs
 */

const { Installer } = require('../domains/installation/installer');

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
        const idesArg = options.ides || options.tools || '';
        const ides = idesArg
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(s => s.length > 0);

        if (ides.length === 0) {
          await prompts.log.error('No IDEs specified. Use --ides to specify IDEs (e.g., --ides claude-code,cursor)');
          await prompts.log.message('Available IDEs: claude-code, cursor, windsurf, codex');
          process.exit(1);
        }

        await prompts.log.info(`Initializing for IDEs: ${ides.join(', ')}`);

        const result = await installer.install({
          ides,
          directory: options.directory || process.cwd(),
        });

        if (result && result.success) {
          process.exit(0);
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
