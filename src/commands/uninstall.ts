// @ts-nocheck

/**
 * Uninstall Command
 * Removes QD installation from the current project
 */

const path = require('node:path');
const { Installer } = require('../domains/installation/installer');

function registerUninstall(program) {
  program
    .command('remove')
    .description('Remove QD from the current project')
    .option('-y, --yes', 'Remove all QD components without prompting')
    .option('--directory <path>', 'Project directory (default: current directory)')
    .action(async (options) => {
      const installer = new Installer();

      try {
        let projectDir;

        if (options.directory) {
          projectDir = path.resolve(options.directory);
        } else if (options.yes) {
          projectDir = process.cwd();
        } else {
          const prompts = require('../shared/prompts');
          const dirChoice = await prompts.select({
            message: 'Where do you want to uninstall QD from?',
            options: [
              { value: 'cwd', label: `Current directory (${process.cwd()})` },
              { value: 'other', label: 'Another directory...' },
            ],
          });

          if (dirChoice === 'other') {
            const customDir = await prompts.text({
              message: 'Enter the project directory path:',
              placeholder: process.cwd(),
              validate: (value) => {
                if (!value || value.trim().length === 0) return 'Directory path is required';
              },
            });
            projectDir = path.resolve(customDir.trim());
          } else {
            projectDir = process.cwd();
          }
        }

        const fs = require('../shared/fs-native');
        if (!(await fs.pathExists(projectDir))) {
          const prompts = require('../shared/prompts');
          await prompts.log.error(`Directory does not exist: ${projectDir}`);
          process.exit(1);
        }

        const { qdDir } = await installer.findQdDir(projectDir);
        if (!(await fs.pathExists(qdDir))) {
          const prompts = require('../shared/prompts');
          await prompts.log.warn('No QD installation found.');
          process.exit(0);
        }

        const existingInstall = await installer.getStatus(projectDir);
        const version = existingInstall.installed ? existingInstall.version : 'unknown';
        const modules = existingInstall.moduleIds.join(', ');
        const ides = existingInstall.ides.join(', ');

        const outputFolder = await installer.getOutputFolder(projectDir);
        const prompts = require('../shared/prompts');
        await prompts.intro('QD Uninstall');
        await prompts.note(`Version: ${version}\nModules: ${modules}\nIDE integrations: ${ides}`, 'Current Installation');

        let removeModules = true;
        let removeIdeConfigs = true;
        let removeOutputFolder = false;

        if (!options.yes) {
          const selected = await prompts.multiselect({
            message: 'Select components to remove:',
            options: [
              {
                value: 'modules',
                label: `QD Modules & data (${installer.qdFolderName}/)`,
                hint: 'Core installation, agents, workflows, config',
              },
              { value: 'ide', label: 'IDE integrations', hint: ides || 'No IDEs configured' },
              { value: 'output', label: `User artifacts (${outputFolder}/)`, hint: 'WARNING: Contains your work products' },
            ],
            initialValues: ['modules', 'ide'],
            required: true,
          });

          removeModules = selected.includes('modules');
          removeIdeConfigs = selected.includes('ide');
          removeOutputFolder = selected.includes('output');

          const red = (s) => `\u001B[31m${s}\u001B[0m`;
          await prompts.note(
            red('⚠ This action is IRREVERSIBLE! Removed files cannot be recovered!') +
              '\n' +
              red('⚠ IDE configurations and modules will need to be reinstalled.') +
              '\n' +
              red('⚠ User artifacts are preserved unless explicitly selected.'),
            '!! DESTRUCTIVE ACTION !!',
          );

          const confirmed = await prompts.confirm({
            message: 'Proceed with uninstall?',
            default: false,
          });

          if (!confirmed) {
            await prompts.outro('Uninstall cancelled.');
            process.exit(0);
          }
        }

        // Phase 1: IDE integrations
        if (removeIdeConfigs) {
          const s = await prompts.spinner();
          s.start('Removing IDE integrations...');
          await installer.uninstallIdeConfigs(projectDir, existingInstall, { silent: true });
          s.stop(`Removed IDE integrations (${ides || 'none'})`);

          // Clean up AGENTS.md QD block
          const agentsFile = path.join(projectDir, 'AGENTS.md');
          if (await fs.pathExists(agentsFile)) {
            const content = await fs.readFile(agentsFile, 'utf8');
            const startMarker = '<!-- AGENTS:START -->';
            const endMarker = '<!-- AGENTS:END -->';
            const startIdx = content.indexOf(startMarker);
            const endIdx = content.indexOf(endMarker);
            if (startIdx !== -1 && endIdx !== -1) {
              const cleaned = content.slice(0, startIdx).trimEnd() + '\n' + content.slice(endIdx + endMarker.length);
              await fs.writeFile(agentsFile, cleaned + '\n', 'utf8');
            }
          }
        }

        // Phase 2: User artifacts
        if (removeOutputFolder) {
          const s = await prompts.spinner();
          s.start(`Removing user artifacts (${outputFolder}/)...`);
          await installer.uninstallOutputFolder(projectDir, outputFolder);
          s.stop('User artifacts removed');
        }

        // Phase 3: QD modules & data
        if (removeModules) {
          const s = await prompts.spinner();
          s.start(`Removing QD modules & data (${installer.qdFolderName}/)...`);
          await installer.uninstallModules(projectDir);
          s.stop('Modules & data removed');
        }

        const summary = [];
        if (removeIdeConfigs) summary.push('IDE integrations cleaned');
        if (removeModules) summary.push('Modules & data removed');
        if (removeOutputFolder) summary.push('User artifacts removed');
        if (!removeOutputFolder) summary.push(`User artifacts preserved in ${outputFolder}/`);

        await prompts.note(summary.join('\n'), 'Summary');
        await prompts.outro('To reinstall, run: npx qd install');

        process.exit(0);
      } catch (error) {
        const prompts = require('../shared/prompts');
        try {
          await prompts.log.error(`Uninstall failed: ${error.message}`);
        } catch {
          console.error(error instanceof Error ? error.message : error);
        }
        process.exit(1);
      }
    });
}

module.exports = { registerUninstall };
