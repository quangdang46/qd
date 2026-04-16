// @ts-nocheck

/**
 * UI - User interface display utilities
 * Extracted from cli/ui.ts
 */

const prompts = require('./prompts');

class UI {
  async displayStatus({ installation, modules, qdDir }) {
    const color = await prompts.getColor();

    const lines = [];
    lines.push('');
    lines.push(`  ${color.cyan('QD Installation Status')}`);
    lines.push('');
    lines.push(`  Directory: ${qdDir}`);
    lines.push(`  Version: ${installation.version || 'unknown'}`);
    lines.push(`  Installed: ${installation.installed ? color.green('Yes') : color.yellow('No')}`);
    lines.push(`  IDEs: ${installation.ides ? installation.ides.join(', ') : 'None'}`);
    lines.push(`  Updated: ${installation.lastUpdated || 'Never'}`);

    if (modules && modules.length > 0) {
      lines.push('');
      lines.push(`  Modules (${modules.length}):`);
      for (const mod of modules.slice(0, 10)) {
        lines.push(`    ${color.cyan(mod.id)} @ ${mod.version || 'unknown'}`);
      }
      if (modules.length > 10) {
        lines.push(`    ... and ${modules.length - 10} more`);
      }
    }

    lines.push('');

    await prompts.box(lines.join('\n'), 'Status', {
      rounded: true,
      formatBorder: color.cyan,
    });
  }
}

module.exports = { UI };
