// @ts-nocheck

const prompts = require('./prompts');

const CLIUtils = {
  /**
   * Display BMAD logo and version using @clack intro + box
   */
  async displayLogo() {
    const color = await prompts.getColor();
    const termWidth = process.stdout.columns || 80;

    const logoWide = ['  ____  __  __    _    ____', ' | __ )|  \\/  |  / \\  |  _ \\', " |  _ \\| |\\/| | / _ \\ | | | |", ' | |_) | |  | |/ ___ \\| |_| |', ' |____/|_|  |_/_/   \\_\\____/'];
    const logoNarrow = ['  BMAD'];
    const logoLines = termWidth >= 60 ? logoWide : logoNarrow;
    const logo = logoLines.map((line) => color.blue(line)).join('\n');
    const tagline = color.white('    Build More, Architect Dreams\n    (c) BMad Code');

    await prompts.box(`${logo}\n${tagline}`, '', {
      contentAlign: 'center',
      rounded: true,
      formatBorder: color.blue,
    });
  },

  /**
   * Display module configuration header
   * @param {string} moduleName - Module name (fallback if no custom header)
   * @param {string} header - Custom header from module.yaml
   * @param {string} subheader - Custom subheader from module.yaml
   */
  async displayModuleConfigHeader(moduleName, header = null, subheader = null) {
    const title = header || `Configuring ${moduleName.toUpperCase()} Module`;
    await prompts.note(subheader || '', title);
  },
};

module.exports = { CLIUtils };
