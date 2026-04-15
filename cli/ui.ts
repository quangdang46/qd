// @ts-nocheck

const path = require('node:path');
const os = require('node:os');
const fs = require('./fs-native');
const prompts = require('./prompts');

/**
 * UI utilities for the installer
 */
class UI {
  /**
   * Prompt for installation configuration
   * @param {Object} options - Command-line options from install command
   * @returns {Object} Installation configuration
   */
  async promptInstall(options = {}) {
    // Get directory from options or prompt
    let confirmedDirectory;
    if (options.directory) {
      // Use provided directory from command-line
      const expandedDir = this.expandUserPath(options.directory);
      const validation = this.validateDirectorySync(expandedDir);
      if (validation) {
        throw new Error(`Invalid directory: ${validation}`);
      }
      confirmedDirectory = expandedDir;
      await prompts.log.info(`Using directory from command-line: ${confirmedDirectory}`);
    } else {
      confirmedDirectory = await this.getConfirmedDirectory();
    }

    const { Installer } = require('./core/installer');
    const installer = new Installer();
    const { bmadDir } = await installer.findBmadDir(confirmedDirectory);

    // Check if there's an existing BMAD installation
    const hasExistingInstall = await fs.pathExists(bmadDir);

    // Track action type (only set if there's an existing installation)
    let actionType;

    // Only show action menu if there's an existing installation
    if (hasExistingInstall) {
      // Get version information
      const { existingInstall, bmadDir } = await this.getExistingInstallation(confirmedDirectory);

      // Build menu choices dynamically
      const choices = [];

      // Always show Quick Update first (allows refreshing installation even on same version)
      if (existingInstall.installed) {
        choices.push({
          name: 'Quick Update',
          value: 'quick-update',
        });
      }

      // Common actions
      choices.push({ name: 'Modify BMAD Installation', value: 'update' });

      // Check if action is provided via command-line
      if (options.action) {
        const validActions = choices.map((c) => c.value);
        if (!validActions.includes(options.action)) {
          throw new Error(`Invalid action: ${options.action}. Valid actions: ${validActions.join(', ')}`);
        }
        actionType = options.action;
        await prompts.log.info(`Using action from command-line: ${actionType}`);
      } else if (options.yes) {
        // Default to quick-update if available, otherwise first available choice
        if (choices.length === 0) {
          throw new Error('No valid actions available for this installation');
        }
        const hasQuickUpdate = choices.some((c) => c.value === 'quick-update');
        actionType = hasQuickUpdate ? 'quick-update' : choices[0].value;
        await prompts.log.info(`Non-interactive mode (--yes): defaulting to ${actionType}`);
      } else {
        actionType = await prompts.select({
          message: 'How would you like to proceed?',
          choices: choices,
          default: choices[0].value,
        });
      }

      // Handle quick update separately
      if (actionType === 'quick-update') {
        return {
          actionType: 'quick-update',
          directory: confirmedDirectory,
          skipPrompts: options.yes || false,
        };
      }

      // If actionType === 'update', handle it with the new flow
      // Return early with modify configuration
      if (actionType === 'update') {
        // Get existing installation info
        const { installedModuleIds } = await this.getExistingInstallation(confirmedDirectory);

        await prompts.log.message(`Found existing modules: ${[...installedModuleIds].join(', ')}`);

        await prompts.log.info('Using BMAD profile');

        // Get tool selection
        const toolSelection = await this.promptToolSelection(confirmedDirectory, options);

        const moduleConfigs = await this.collectModuleConfigs(confirmedDirectory, 'bmad', options);

        return {
          actionType: 'update',
          directory: confirmedDirectory,
          ides: toolSelection.ides,
          skipIde: toolSelection.skipIde,
          bmadConfig: moduleConfigs.bmad || {},
          moduleConfigs: moduleConfigs,
          skipPrompts: options.yes || false,
        };
      }
    }

    // This section is only for new installations (update returns early above)

    await prompts.log.info('Using BMAD profile');

    let toolSelection = await this.promptToolSelection(confirmedDirectory, options);
    const moduleConfigs = await this.collectModuleConfigs(confirmedDirectory, 'bmad', options);

    return {
      actionType: 'install',
      directory: confirmedDirectory,
      ides: toolSelection.ides,
      skipIde: toolSelection.skipIde,
      bmadConfig: moduleConfigs.bmad || {},
      moduleConfigs: moduleConfigs,
      skipPrompts: options.yes || false,
    };
  }

  /**
   * Prompt for tool/IDE selection (called after module configuration)
   * Uses a split prompt approach:
   *   1. Recommended tools - standard multiselect for preferred tools
   *   2. Additional tools - autocompleteMultiselect with search capability
   * @param {string} projectDir - Project directory to check for existing IDEs
   * @param {Object} options - Command-line options
   * @returns {Object} Tool configuration
   */
  async promptToolSelection(projectDir, options = {}) {
    const { ExistingInstall } = require('./core/existing-install');
    const { Installer } = require('./core/installer');
    const installer = new Installer();
    const { bmadDir } = await installer.findBmadDir(projectDir || process.cwd());
    const existingInstall = await ExistingInstall.detect(bmadDir);
    const configuredIdes = existingInstall.ides;

    // Get IDE manager to fetch available IDEs dynamically
    const { IdeManager } = require('./ide/manager');
    const ideManager = new IdeManager();
    await ideManager.ensureInitialized(); // IMPORTANT: Must initialize before getting IDEs

    const preferredIdes = ideManager.getPreferredIdes();
    const otherIdes = ideManager.getOtherIdes();

    // Determine which configured IDEs are in "preferred" vs "other" categories
    const configuredPreferred = configuredIdes.filter((id) => preferredIdes.some((ide) => ide.value === id));
    const configuredOther = configuredIdes.filter((id) => otherIdes.some((ide) => ide.value === id));

    // Warn about previously configured tools that are no longer available
    const allKnownValues = new Set([...preferredIdes, ...otherIdes].map((ide) => ide.value));
    const unknownTools = configuredIdes.filter((id) => id && typeof id === 'string' && !allKnownValues.has(id));
    if (unknownTools.length > 0) {
      await prompts.log.warn(`Previously configured tools are no longer available: ${unknownTools.join(', ')}`);
    }

    // -------------------------------------------------------------------------------
    // UPGRADE PATH: If tools already configured, show all tools with configured at top
    // -------------------------------------------------------------------------------
    if (configuredIdes.length > 0) {
      const allTools = [...preferredIdes, ...otherIdes];

      // Non-interactive: handle --tools and --yes flags before interactive prompt
      if (options.tools) {
        if (options.tools.toLowerCase() === 'none') {
          await prompts.log.info('Skipping tool configuration (--tools none)');
          return { ides: [], skipIde: true };
        }
        const selectedIdes = options.tools
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        await prompts.log.info(`Using tools from command-line: ${selectedIdes.join(', ')}`);
        await this.displaySelectedTools(selectedIdes, preferredIdes, allTools);
        return { ides: selectedIdes, skipIde: false };
      }

      if (options.yes) {
        await prompts.log.info(`Non-interactive mode (--yes): keeping configured tools: ${configuredIdes.join(', ')}`);
        await this.displaySelectedTools(configuredIdes, preferredIdes, allTools);
        return { ides: configuredIdes, skipIde: false };
      }

      // Sort: configured tools first, then preferred, then others
      const sortedTools = [
        ...allTools.filter((ide) => configuredIdes.includes(ide.value)),
        ...allTools.filter((ide) => !configuredIdes.includes(ide.value)),
      ];

      const upgradeOptions = sortedTools.map((ide) => {
        const isConfigured = configuredIdes.includes(ide.value);
        const isPreferred = preferredIdes.some((p) => p.value === ide.value);
        let label = ide.name;
        if (isPreferred) label += ' ⭐';
        if (isConfigured) label += ' ✅';
        return { label, value: ide.value };
      });

      // Sort initialValues to match display order
      const sortedInitialValues = sortedTools.filter((ide) => configuredIdes.includes(ide.value)).map((ide) => ide.value);

      const upgradeSelected = await prompts.autocompleteMultiselect({
        message: 'Integrate with',
        options: upgradeOptions,
        initialValues: sortedInitialValues,
        required: false,
        maxItems: 8,
      });

      const selectedIdes = upgradeSelected || [];

      if (selectedIdes.length === 0) {
        const confirmNoTools = await prompts.confirm({
          message: 'No tools selected. Continue without installing any tools?',
          default: false,
        });

        if (!confirmNoTools) {
          return this.promptToolSelection(projectDir, options);
        }

        return { ides: [], skipIde: true };
      }

      // Display selected tools
      await this.displaySelectedTools(selectedIdes, preferredIdes, allTools);

      return { ides: selectedIdes, skipIde: false };
    }

    // -------------------------------------------------------------------------------
    // NEW INSTALL: Show all tools with search
    // -------------------------------------------------------------------------------
    const allTools = [...preferredIdes, ...otherIdes];

    const allToolOptions = allTools.map((ide) => {
      const isPreferred = preferredIdes.some((p) => p.value === ide.value);
      let label = ide.name;
      if (isPreferred) label += ' ⭐';
      return {
        label,
        value: ide.value,
      };
    });

    let selectedIdes = [];

    // Check if tools are provided via command-line
    if (options.tools) {
      // Check for explicit "none" value to skip tool installation
      if (options.tools.toLowerCase() === 'none') {
        await prompts.log.info('Skipping tool configuration (--tools none)');
        return { ides: [], skipIde: true };
      } else {
        selectedIdes = options.tools
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        await prompts.log.info(`Using tools from command-line: ${selectedIdes.join(', ')}`);
        await this.displaySelectedTools(selectedIdes, preferredIdes, allTools);
        return { ides: selectedIdes, skipIde: false };
      }
    } else if (options.yes) {
      // If --yes flag is set, skip tool prompt and use previously configured tools or empty
      if (configuredIdes.length > 0) {
        await prompts.log.info(`Using previously configured tools (--yes flag): ${configuredIdes.join(', ')}`);
        await this.displaySelectedTools(configuredIdes, preferredIdes, allTools);
        return { ides: configuredIdes, skipIde: false };
      } else {
        await prompts.log.info('Skipping tool configuration (--yes flag, no previous tools)');
        return { ides: [], skipIde: true };
      }
    }

    // Interactive mode
    const interactiveSelectedIdes = await prompts.autocompleteMultiselect({
      message: 'Integrate with:',
      options: allToolOptions,
      initialValues: configuredIdes.length > 0 ? configuredIdes : undefined,
      required: false,
      maxItems: 8,
    });

    selectedIdes = interactiveSelectedIdes || [];

    // -------------------------------------------------------------------------------
    // STEP 3: Confirm if no tools selected
    // -------------------------------------------------------------------------------
    if (selectedIdes.length === 0) {
      const confirmNoTools = await prompts.confirm({
        message: 'No tools selected. Continue without installing any tools?',
        default: false,
      });

      if (!confirmNoTools) {
        // User wants to select tools - recurse
        return this.promptToolSelection(projectDir, options);
      }

      return {
        ides: [],
        skipIde: true,
      };
    }

    // Display selected tools
    await this.displaySelectedTools(selectedIdes, preferredIdes, allTools);

    return {
      ides: selectedIdes,
      skipIde: selectedIdes.length === 0,
    };
  }

  /**
   * Prompt for update configuration
   * @returns {Object} Update configuration
   */
  async promptUpdate() {
    const backupFirst = await prompts.confirm({
      message: 'Create backup before updating?',
      default: true,
    });

    const preserveCustomizations = await prompts.confirm({
      message: 'Preserve local customizations?',
      default: true,
    });

    return { backupFirst, preserveCustomizations };
  }

  /**
   * Confirm action
   * @param {string} message - Confirmation message
   * @param {boolean} defaultValue - Default value
   * @returns {boolean} User confirmation
   */
  async confirm(message, defaultValue = false) {
    return await prompts.confirm({
      message,
      default: defaultValue,
    });
  }

  /**
   * Get confirmed directory from user
   * @returns {string} Confirmed directory path
   */
  async getConfirmedDirectory() {
    let confirmedDirectory = null;
    while (!confirmedDirectory) {
      const directoryAnswer = await this.promptForDirectory();
      await this.displayDirectoryInfo(directoryAnswer.directory);

      if (await this.confirmDirectory(directoryAnswer.directory)) {
        confirmedDirectory = directoryAnswer.directory;
      }
    }
    return confirmedDirectory;
  }

  /**
   * Get existing installation info and installed modules
   * @param {string} directory - Installation directory
   * @returns {Object} Object with existingInstall, installedModuleIds, and bmadDir
   */
  async getExistingInstallation(directory) {
    const { ExistingInstall } = require('./core/existing-install');
    const { Installer } = require('./core/installer');
    const installer = new Installer();
    const { bmadDir } = await installer.findBmadDir(directory);
    const existingInstall = await ExistingInstall.detect(bmadDir);
    const installedModuleIds = new Set(existingInstall.moduleIds);

    return { existingInstall, installedModuleIds, bmadDir };
  }

  /**
   * Collect all module configurations.
   * All interactive prompting happens here in the UI layer.
   * @param {string} directory - Installation directory
   * @param {string} module - Module to configure
   * @param {Object} options - Command-line options
   * @returns {Object} Collected module configurations keyed by module name
   */
  async collectModuleConfigs(directory, module, options = {}) {
    const { OfficialModules } = require('./modules/builtin-modules');
    const configCollector = new OfficialModules();

    // Seed bmad config from CLI options if provided
    if (options.userName || options.communicationLanguage || options.documentOutputLanguage || options.outputFolder) {
      const bmadConfig = {};
      if (options.userName) {
        bmadConfig.user_name = options.userName;
        await prompts.log.info(`Using user name from command-line: ${options.userName}`);
      }
      if (options.communicationLanguage) {
        bmadConfig.communication_language = options.communicationLanguage;
        await prompts.log.info(`Using communication language from command-line: ${options.communicationLanguage}`);
      }
      if (options.documentOutputLanguage) {
        bmadConfig.document_output_language = options.documentOutputLanguage;
        await prompts.log.info(`Using document output language from command-line: ${options.documentOutputLanguage}`);
      }
      if (options.outputFolder) {
        bmadConfig.output_folder = options.outputFolder;
        await prompts.log.info(`Using output folder from command-line: ${options.outputFolder}`);
      }

      // Load existing config to merge with provided options
      await configCollector.loadExistingConfig(directory);
      const existingConfig = configCollector.collectedConfig.bmad || {};
      configCollector.collectedConfig.bmad = { ...existingConfig, ...bmadConfig };

      // If not all options are provided, collect the missing ones interactively (unless --yes flag)
      if (
        !options.yes &&
        (!options.userName || !options.communicationLanguage || !options.documentOutputLanguage || !options.outputFolder)
      ) {
        await configCollector.collectModuleConfig('bmad', directory, false, true);
      }
    } else if (options.yes) {
      // Use all defaults when --yes flag is set
      await configCollector.loadExistingConfig(directory);
      const existingConfig = configCollector.collectedConfig.bmad || {};

      if (Object.keys(existingConfig).length === 0) {
        let safeUsername;
        try {
          safeUsername = os.userInfo().username;
        } catch {
          safeUsername = process.env.USER || process.env.USERNAME || 'User';
        }
        const defaultUsername = safeUsername.charAt(0).toUpperCase() + safeUsername.slice(1);
        configCollector.collectedConfig.bmad = {
          user_name: defaultUsername,
          communication_language: 'English',
          document_output_language: 'English',
          output_folder: '_bmad-output',
        };
        await prompts.log.info('Using default configuration (--yes flag)');
      }
    }

    // Collect all module configs - bmad is skipped if already seeded above
    await configCollector.collectAllConfigurations([module], directory, {
      skipPrompts: options.yes || false,
    });

    return configCollector.collectedConfig;
  }

  // Module selection helpers removed: installer now supports only `bmad`.

  /**
   * Prompt for directory selection
   * @returns {Object} Directory answer from prompt
   */
  async promptForDirectory() {
    // Use sync validation because @clack/prompts doesn't support async validate
    const directory = await prompts.text({
      message: 'Installation directory:',
      default: process.cwd(),
      placeholder: process.cwd(),
      validate: (input) => this.validateDirectorySync(input),
    });

    // Apply filter logic
    let filteredDir = directory;
    if (!filteredDir || filteredDir.trim() === '') {
      filteredDir = process.cwd();
    } else {
      filteredDir = this.expandUserPath(filteredDir);
    }

    return { directory: filteredDir };
  }

  /**
   * Display directory information
   * @param {string} directory - The directory path
   */
  async displayDirectoryInfo(directory) {
    await prompts.log.info(`Resolved installation path: ${directory}`);

    const dirExists = await fs.pathExists(directory);
    if (dirExists) {
      // Show helpful context about the existing path
      const stats = await fs.stat(directory);
      if (stats.isDirectory()) {
        const files = await fs.readdir(directory);
        if (files.length > 0) {
          // Check for any bmad installation (any folder with _config/manifest.yaml)
          const { Installer } = require('./core/installer');
          const installer = new Installer();
          const bmadResult = await installer.findBmadDir(directory);
          const hasBmadInstall =
            (await fs.pathExists(bmadResult.bmadDir)) && (await fs.pathExists(path.join(bmadResult.bmadDir, '_config', 'manifest.yaml')));

          const bmadNote = hasBmadInstall ? ` including existing BMAD installation (${path.basename(bmadResult.bmadDir)})` : '';
          await prompts.log.message(`Directory exists and contains ${files.length} item(s)${bmadNote}`);
        } else {
          await prompts.log.message('Directory exists and is empty');
        }
      }
    }
  }

  /**
   * Confirm directory selection
   * @param {string} directory - The directory path
   * @returns {boolean} Whether user confirmed
   */
  async confirmDirectory(directory) {
    const dirExists = await fs.pathExists(directory);

    if (dirExists) {
      const proceed = await prompts.confirm({
        message: 'Install to this directory?',
        default: true,
      });

      if (!proceed) {
        await prompts.log.warn("Let's try again with a different path.");
      }

      return proceed;
    } else {
      // Ask for confirmation to create the directory
      const create = await prompts.confirm({
        message: `Create directory: ${directory}?`,
        default: false,
      });

      if (!create) {
        await prompts.log.warn("Let's try again with a different path.");
      }

      return create;
    }
  }

  /**
   * Validate directory path for installation (sync version for clack prompts)
   * @param {string} input - User input path
   * @returns {string|undefined} Error message or undefined if valid
   */
  validateDirectorySync(input) {
    // Allow empty input to use the default
    if (!input || input.trim() === '') {
      return; // Empty means use default, undefined = valid for clack
    }

    let expandedPath;
    try {
      expandedPath = this.expandUserPath(input.trim());
    } catch (error) {
      return error.message;
    }

    // Check if the path exists
    const pathExists = fs.pathExistsSync(expandedPath);

    if (!pathExists) {
      // Find the first existing parent directory
      const existingParent = this.findExistingParentSync(expandedPath);

      if (!existingParent) {
        return 'Cannot create directory: no existing parent directory found';
      }

      // Check if the existing parent is writable
      try {
        fs.accessSync(existingParent, fs.constants.W_OK);
        // Path doesn't exist but can be created - will prompt for confirmation later
        return;
      } catch {
        // Provide a detailed error message explaining both issues
        return `Directory '${expandedPath}' does not exist and cannot be created: parent directory '${existingParent}' is not writable`;
      }
    }

    // If it exists, validate it's a directory and writable
    const stat = fs.statSync(expandedPath);
    if (!stat.isDirectory()) {
      return `Path exists but is not a directory: ${expandedPath}`;
    }

    // Check write permissions
    try {
      fs.accessSync(expandedPath, fs.constants.W_OK);
    } catch {
      return `Directory is not writable: ${expandedPath}`;
    }

    return;
  }

  /**
   * Validate directory path for installation (async version)
   * @param {string} input - User input path
   * @returns {string|true} Error message or true if valid
   */
  async validateDirectory(input) {
    // Allow empty input to use the default
    if (!input || input.trim() === '') {
      return true; // Empty means use default
    }

    let expandedPath;
    try {
      expandedPath = this.expandUserPath(input.trim());
    } catch (error) {
      return error.message;
    }

    // Check if the path exists
    const pathExists = await fs.pathExists(expandedPath);

    if (!pathExists) {
      // Find the first existing parent directory
      const existingParent = await this.findExistingParent(expandedPath);

      if (!existingParent) {
        return 'Cannot create directory: no existing parent directory found';
      }

      // Check if the existing parent is writable
      try {
        await fs.access(existingParent, fs.constants.W_OK);
        // Path doesn't exist but can be created - will prompt for confirmation later
        return true;
      } catch {
        // Provide a detailed error message explaining both issues
        return `Directory '${expandedPath}' does not exist and cannot be created: parent directory '${existingParent}' is not writable`;
      }
    }

    // If it exists, validate it's a directory and writable
    const stat = await fs.stat(expandedPath);
    if (!stat.isDirectory()) {
      return `Path exists but is not a directory: ${expandedPath}`;
    }

    // Check write permissions
    try {
      await fs.access(expandedPath, fs.constants.W_OK);
    } catch {
      return `Directory is not writable: ${expandedPath}`;
    }

    return true;
  }

  /**
   * Find the first existing parent directory (sync version)
   * @param {string} targetPath - The path to check
   * @returns {string|null} The first existing parent directory, or null if none found
   */
  findExistingParentSync(targetPath) {
    let currentPath = path.resolve(targetPath);

    // Walk up the directory tree until we find an existing directory
    while (currentPath !== path.dirname(currentPath)) {
      // Stop at root
      const parent = path.dirname(currentPath);
      if (fs.pathExistsSync(parent)) {
        return parent;
      }
      currentPath = parent;
    }

    return null; // No existing parent found (shouldn't happen in practice)
  }

  /**
   * Find the first existing parent directory (async version)
   * @param {string} targetPath - The path to check
   * @returns {string|null} The first existing parent directory, or null if none found
   */
  async findExistingParent(targetPath) {
    let currentPath = path.resolve(targetPath);

    // Walk up the directory tree until we find an existing directory
    while (currentPath !== path.dirname(currentPath)) {
      // Stop at root
      const parent = path.dirname(currentPath);
      if (await fs.pathExists(parent)) {
        return parent;
      }
      currentPath = parent;
    }

    return null; // No existing parent found (shouldn't happen in practice)
  }

  /**
   * Expands the user-provided path: handles ~ and resolves to absolute.
   * @param {string} inputPath - User input path.
   * @returns {string} Absolute expanded path.
   */
  expandUserPath(inputPath) {
    if (typeof inputPath !== 'string') {
      throw new TypeError('Path must be a string.');
    }

    let expanded = inputPath.trim();

    // Handle tilde expansion
    if (expanded.startsWith('~')) {
      if (expanded === '~') {
        expanded = os.homedir();
      } else if (expanded.startsWith('~' + path.sep)) {
        const pathAfterHome = expanded.slice(2); // Remove ~/ or ~\
        expanded = path.join(os.homedir(), pathAfterHome);
      } else {
        const restOfPath = expanded.slice(1);
        const separatorIndex = restOfPath.indexOf(path.sep);
        const username = separatorIndex === -1 ? restOfPath : restOfPath.slice(0, separatorIndex);
        if (username) {
          throw new Error(`Path expansion for ~${username} is not supported. Please use an absolute path or ~${path.sep}`);
        }
      }
    }

    // Resolve to the absolute path relative to the current working directory
    return path.resolve(expanded);
  }

  /**
   * Get configured IDEs from existing installation
   * @param {string} directory - Installation directory
   * @returns {Array} List of configured IDEs
   */
  async getConfiguredIdes(directory) {
    const { ExistingInstall } = require('./core/existing-install');
    const { Installer } = require('./core/installer');
    const installer = new Installer();
    const { bmadDir } = await installer.findBmadDir(directory);
    const existingInstall = await ExistingInstall.detect(bmadDir);
    return existingInstall.ides;
  }

  /**
   * Display installed module versions from the manifest.
   * @param {Array} modules - Module info objects from manifest
   */
  async displayModuleVersions(modules) {
    const builtIn = modules.filter((m) => m.source === 'built-in');
    const other = modules.filter((m) => m.source !== 'built-in');

    const lines = [];
    const formatGroup = (group, title) => {
      if (group.length === 0) return;
      lines.push(title);
      for (const mod of group) {
        const versionDisplay = mod.version || 'unknown';
        lines.push(`  ${mod.name.padEnd(20)} ${versionDisplay} \u2713`);
      }
    };

    formatGroup(builtIn, 'Built-in modules');
    formatGroup(other, 'Other installed modules');

    await prompts.note(lines.join('\n'), 'Module Versions');
  }

  /**
   * Display status of all installed modules
   * @param {Object} statusData - Installation info, modules list, bmad path
   */
  async displayStatus(statusData) {
    const { installation, modules, bmadDir } = statusData;

    const infoLines = [
      `Version:       ${installation.version || 'unknown'}`,
      `Location:      ${bmadDir}`,
      `Installed:     ${new Date(installation.installDate).toLocaleDateString()}`,
      `Last Updated:  ${installation.lastUpdated ? new Date(installation.lastUpdated).toLocaleDateString() : 'unknown'}`,
    ];

    await prompts.note(infoLines.join('\n'), 'BMAD Status');

    await this.displayModuleVersions(modules);
    await prompts.log.success('Status complete');
  }

  /**
   * Display list of selected tools after IDE selection
   * @param {Array} selectedIdes - Array of selected IDE values
   * @param {Array} preferredIdes - Array of preferred IDE objects
   * @param {Array} allTools - Array of all tool objects
   */
  async displaySelectedTools(selectedIdes, preferredIdes, allTools) {
    if (selectedIdes.length === 0) return;

    const preferredValues = new Set(preferredIdes.map((ide) => ide.value));
    const toolLines = selectedIdes.map((ideValue) => {
      const tool = allTools.find((t) => t.value === ideValue);
      const name = tool?.name || ideValue;
      const marker = preferredValues.has(ideValue) ? ' \u2B50' : '';
      return `  \u2022 ${name}${marker}`;
    });
    await prompts.log.message('Selected tools:\n' + toolLines.join('\n'));
  }
}

module.exports = { UI };
