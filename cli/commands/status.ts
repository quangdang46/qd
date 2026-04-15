// @ts-nocheck

const path = require('node:path');
const prompts = require('../prompts');
const { Installer } = require('../core/installer');
const { Manifest } = require('../core/manifest');
const { UI } = require('../ui');

const installer = new Installer();
const manifest = new Manifest();
const ui = new UI();

module.exports = {
  command: 'status',
  description: 'Display QD installation status and module versions',
  options: [],
  action: async (options) => {
    try {
      // Find the qd directory
      const projectDir = process.cwd();
      const { qdDir } = await installer.findQdDir(projectDir);

      // Check if qd directory exists
      const fs = require('../fs-native');
      if (!(await fs.pathExists(qdDir))) {
        await prompts.log.warn('No QD installation found in the current directory.');
        await prompts.log.message(`Expected location: ${qdDir}`);
        await prompts.log.message('Run "qd install" to set up a new installation.');
        process.exit(0);
        return;
      }

      // Read manifest
      const manifestData = await manifest._readRaw(qdDir);

      if (!manifestData) {
        await prompts.log.warn('No QD installation manifest found.');
        await prompts.log.message('Run "qd install" to set up a new installation.');
        process.exit(0);
        return;
      }

      // Get installation info
      const installation = manifestData.installation || {};
      const modules = manifestData.modules || [];

      await ui.displayStatus({
        installation,
        modules,
        qdDir,
      });

      process.exit(0);
    } catch (error) {
      await prompts.log.error(`Status check failed: ${error.message}`);
      if (process.env.QD_DEBUG) {
        await prompts.log.message(error.stack);
      }
      process.exit(1);
    }
  },
};
