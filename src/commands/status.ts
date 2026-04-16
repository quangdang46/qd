// @ts-nocheck

/**
 * Status Command
 * Displays QD installation status and module versions
 */

const { Installer } = require('../domains/installation/installer');
const { Manifest } = require('../domains/installation/manifest');
const { UI } = require('../shared/ui');

function registerStatus(program) {
  program
    .command('status')
    .description('Display QD installation status and module versions')
    .option('--directory <path>', 'Project directory (default: current directory)')
    .action(async (options) => {
      const installer = new Installer();
      const manifest = new Manifest();
      const ui = new UI();

      try {
        const projectDir = options.directory || process.cwd();
        const { qdDir } = await installer.findQdDir(projectDir);

        const fs = require('../shared/fs-native');
        if (!(await fs.pathExists(qdDir))) {
          const prompts = require('../shared/prompts');
          await prompts.log.warn('No QD installation found in the current directory.');
          await prompts.log.message(`Expected location: ${qdDir}`);
          await prompts.log.message('Run "qd init" to set up a new installation.');
          process.exit(0);
          return;
        }

        const manifestData = await manifest._readRaw(qdDir);

        if (!manifestData) {
          const prompts = require('../shared/prompts');
          await prompts.log.warn('No QD installation manifest found.');
          await prompts.log.message('Run "qd init" to set up a new installation.');
          process.exit(0);
          return;
        }

        const installation = manifestData.installation || {};
        const modules = manifestData.modules || [];

        await ui.displayStatus({
          installation,
          modules,
          qdDir,
        });

        process.exit(0);
      } catch (error) {
        const prompts = require('../shared/prompts');
        await prompts.log.error(`Status check failed: ${error.message}`);
        if (process.env.QD_DEBUG) {
          await prompts.log.message(error.stack);
        }
        process.exit(1);
      }
    });
}

module.exports = { registerStatus };
