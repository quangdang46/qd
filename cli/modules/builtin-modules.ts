// @ts-nocheck

const path = require('node:path');
const fs = require('../fs-native');
const yaml = require('yaml');
const prompts = require('../prompts');
const { getProjectRoot, getArtifactsPath } = require('../project-root');
const { CLIUtils } = require('../cli-utils');

class OfficialModules {
  constructor(options = {}) {
    this.collectedConfig = {};
    this._existingConfig = null;
    this.currentProjectDir = null;
  }

  get moduleConfigs() {
    return this.collectedConfig;
  }

  get existingConfig() {
    return this._existingConfig;
  }

  static async build(config, paths) {
    const instance = new OfficialModules();

    if (config.moduleConfigs) {
      instance.collectedConfig = config.moduleConfigs;
      await instance.loadExistingConfig(paths.projectRoot);
      return instance;
    }

    if (config.hasQdConfig()) {
      instance.collectedConfig.qd = config.qdConfig;
      instance.allAnswers = {};
      for (const [key, value] of Object.entries(config.qdConfig)) {
        instance.allAnswers[`qd_${key}`] = value;
      }
    }

    const toCollect = config.hasQdConfig() ? [] : [config.module];

    await instance.collectAllConfigurations(toCollect, paths.projectRoot, {
      skipPrompts: config.skipPrompts,
    });

    return instance;
  }

  async copyFile(sourcePath, targetPath, overwrite = true) {
    await fs.copy(sourcePath, targetPath, { overwrite });
  }

  async copyDirectory(sourceDir, targetDir, overwrite = true) {
    await fs.ensureDir(targetDir);
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath, overwrite);
      } else {
        await this.copyFile(sourcePath, targetPath, overwrite);
      }
    }
  }

  async listAvailable() {
    const modules = [];
    const artifactsPath = getArtifactsPath();

    if (await fs.pathExists(artifactsPath)) {
      const moduleConfigPath = path.join(artifactsPath, 'module.yaml');
      if (await fs.pathExists(moduleConfigPath)) {
        try {
          const configContent = await fs.readFile(moduleConfigPath, 'utf8');
          const config = yaml.parse(configContent);

          modules.push({
            id: config.code || 'qd',
            path: artifactsPath,
            name: config.name || 'QD Framework',
            description: config.description || 'QD Module',
            version: config.version || '1.0.0',
            source: 'artifacts',
            defaultSelected: config.default_selected !== undefined ? config.default_selected : true,
          });
        } catch (error) {
          await prompts.log.warn(`Failed to read module.yaml: ${error.message}`);
        }
      }
    }

    return { modules };
  }

  async getModuleInfo(modulePath, defaultName, sourceDescription) {
    const moduleConfigPath = path.join(modulePath, 'module.yaml');

    if (!(await fs.pathExists(moduleConfigPath))) {
      return null;
    }

    const moduleInfo = {
      id: defaultName,
      path: modulePath,
      name: defaultName.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      description: 'QD Module',
      version: '1.0.0',
      source: sourceDescription,
    };

    try {
      const configContent = await fs.readFile(moduleConfigPath, 'utf8');
      const config = yaml.parse(configContent);

      if (config.code) moduleInfo.id = config.code;
      moduleInfo.name = config.name || moduleInfo.name;
      moduleInfo.description = config.description || moduleInfo.description;
      moduleInfo.version = config.version || moduleInfo.version;
      moduleInfo.dependencies = config.dependencies || [];
      moduleInfo.defaultSelected = config.default_selected === undefined ? false : config.default_selected;
    } catch (error) {
      await prompts.log.warn(`Failed to read config for ${defaultName}: ${error.message}`);
    }

    return moduleInfo;
  }

  async findModuleSource(moduleCode) {
    if (moduleCode === 'qd') {
      const artifactsPath = getArtifactsPath();
      if (await fs.pathExists(artifactsPath)) {
        return artifactsPath;
      }
    }
    return null;
  }

  async install(moduleName, qdDir, fileTrackingCallback = null, options = {}) {
    const sourcePath = await this.findModuleSource(moduleName);
    // Direct copy to qdDir - no subdirectory nesting
    const targetPath = qdDir;

    if (!sourcePath) {
      throw new Error(
        `Source for artifacts is not available.`,
      );
    }

    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath);
    }

    await this.copyModuleWithFiltering(sourcePath, targetPath, fileTrackingCallback, options.moduleConfig);

    if (!options.skipModuleInstaller) {
      await this.createModuleDirectories(moduleName, qdDir, options);
    }

    const { Manifest } = require('../core/manifest');
    const manifestObj = new Manifest();
    const versionInfo = await manifestObj.getModuleVersionInfo(moduleName, qdDir, sourcePath);

    await manifestObj.addModule(qdDir, moduleName, {
      version: versionInfo.version,
      source: versionInfo.source,
    });

    return { success: true, module: moduleName, path: targetPath, versionInfo };
  }

  async update(moduleName, qdDir) {
    const sourcePath = await this.findModuleSource(moduleName);
    // Direct copy - no subdirectory nesting
    const targetPath = qdDir;

    if (!sourcePath) {
      throw new Error(`Module '${moduleName}' not found in any source location`);
    }

    if (!(await fs.pathExists(targetPath))) {
      throw new Error(`Module '${moduleName}' is not installed`);
    }

    await this.syncModule(sourcePath, targetPath);

    return { success: true, module: moduleName, path: targetPath };
  }

  async remove(moduleName, qdDir) {
    // Direct remove - no subdirectory
    const targetPath = qdDir;

    if (!(await fs.pathExists(targetPath))) {
      throw new Error(`Module '${moduleName}' is not installed`);
    }

    await fs.remove(targetPath);

    return { success: true, module: moduleName };
  }

  async isInstalled(moduleName, qdDir) {
    // Direct check - no subdirectory nesting
    return await fs.pathExists(qdDir);
  }

  async getInstalledInfo(moduleName, qdDir) {
    // Direct access - no subdirectory nesting
    const targetPath = qdDir;

    if (!(await fs.pathExists(targetPath))) {
      return null;
    }

    const configPath = path.join(targetPath, 'config.yaml');
    const moduleInfo = { id: moduleName, path: targetPath, installed: true };

    if (await fs.pathExists(configPath)) {
      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = yaml.parse(configContent);
        Object.assign(moduleInfo, config);
      } catch (error) {
        await prompts.log.warn(`Failed to read installed module config: ${error.message}`);
      }
    }

    return moduleInfo;
  }

  async copyModuleWithFiltering(sourcePath, targetPath, fileTrackingCallback = null, moduleConfig = {}) {
    const sourceFiles = await this.getFileList(sourcePath);

    for (const file of sourceFiles) {
      if (file.startsWith('sub-modules/')) continue;

      const isInSidecarDirectory = path.dirname(file).split('/').some((dir) => dir.toLowerCase().endsWith('-sidecar'));
      if (isInSidecarDirectory) continue;

      if (file === 'module.yaml') continue;
      if (file === 'module-help.csv') continue;
      if (file === 'config.yaml') continue;

      const sourceFile = path.join(sourcePath, file);
      const targetFile = path.join(targetPath, file);

      if (file.startsWith('agents/') && file.endsWith('.md')) {
        const content = await fs.readFile(sourceFile, 'utf8');
        const agentMatch = content.match(/<agent[^>]*\slocalskip="true"[^>]*>/);
        if (agentMatch) {
          await prompts.log.message(`  Skipping web-only agent: ${path.basename(file)}`);
          continue;
        }
      }

      await this.copyFile(sourceFile, targetFile);

      if (fileTrackingCallback) {
        fileTrackingCallback(targetFile);
      }
    }
  }

  async createModuleDirectories(moduleName, qdDir, options = {}) {
    const moduleConfig = options.moduleConfig || {};
    const existingModuleConfig = options.existingModuleConfig || {};
    const projectRoot = path.dirname(qdDir);
    const emptyResult = { createdDirs: [], movedDirs: [], createdWdsFolders: [] };

    const sourcePath = await this.findModuleSource(moduleName);
    if (!sourcePath) return emptyResult;

    const moduleYamlPath = path.join(sourcePath, 'module.yaml');
    if (!(await fs.pathExists(moduleYamlPath))) return emptyResult;

    let moduleYaml;
    try {
      const yamlContent = await fs.readFile(moduleYamlPath, 'utf8');
      moduleYaml = yaml.parse(yamlContent);
    } catch (error) {
      await prompts.log.warn(`Invalid module.yaml for ${moduleName}: ${error.message}`);
      return emptyResult;
    }

    if (!moduleYaml || !moduleYaml.directories) return emptyResult;

    const directories = moduleYaml.directories;
    const wdsFolders = moduleYaml.wds_folders || [];
    const createdDirs = [];
    const movedDirs = [];
    const createdWdsFolders = [];

    for (const dirRef of directories) {
      const varMatch = dirRef.match(/^\{([^}]+)\}$/);
      if (!varMatch) continue;

      const configKey = varMatch[1];
      const dirValue = moduleConfig[configKey];
      if (!dirValue || typeof dirValue !== 'string') continue;

      let dirPath = dirValue.replace(/^\{project-root\}\/?/, '');
      dirPath = dirPath.replaceAll('{project-root}', '');
      const fullPath = path.join(projectRoot, dirPath);

      const normalizedPath = path.normalize(fullPath);
      const normalizedRoot = path.normalize(projectRoot);
      if (!normalizedPath.startsWith(normalizedRoot + path.sep) && normalizedPath !== normalizedRoot) {
        const color = await prompts.getColor();
        await prompts.log.warn(color.yellow(`${configKey} path escapes project root, skipping: ${dirPath}`));
        continue;
      }

      const oldDirValue = existingModuleConfig[configKey];
      let oldFullPath = null;
      let oldDirPath = null;
      if (oldDirValue && typeof oldDirValue === 'string') {
        let normalizedOld = oldDirValue.replace(/^\{project-root\}\/?/, '');
        normalizedOld = path.normalize(normalizedOld.replaceAll('{project-root}', ''));
        const normalizedNew = path.normalize(dirPath);

        if (normalizedOld !== normalizedNew) {
          oldDirPath = normalizedOld;
          oldFullPath = path.join(projectRoot, oldDirPath);
          const normalizedOldAbsolute = path.normalize(oldFullPath);
          if (!normalizedOldAbsolute.startsWith(normalizedRoot + path.sep) && normalizedOldAbsolute !== normalizedRoot) {
            oldFullPath = null;
          }

          if (oldFullPath) {
            const normalizedNewAbsolute = path.normalize(fullPath);
            if (normalizedOldAbsolute.startsWith(normalizedNewAbsolute + path.sep) || normalizedNewAbsolute.startsWith(normalizedOldAbsolute + path.sep)) {
              const color = await prompts.getColor();
              await prompts.log.warn(
                color.yellow(`${configKey}: cannot move between parent/child paths (${oldDirPath} / ${dirPath}), creating new directory instead`),
              );
              oldFullPath = null;
            }
          }
        }
      }

      const dirName = configKey.replaceAll('_', ' ');

      if (oldFullPath && (await fs.pathExists(oldFullPath)) && !(await fs.pathExists(fullPath))) {
        try {
          await fs.ensureDir(path.dirname(fullPath));
          await fs.move(oldFullPath, fullPath);
          movedDirs.push(`${dirName}: ${oldDirPath} -> ${dirPath}`);
        } catch (moveError) {
          const color = await prompts.getColor();
          await prompts.log.warn(
            color.yellow(`Failed to move ${oldDirPath} -> ${dirPath}: ${moveError.message}\n  Creating new directory instead.`),
          );
          await fs.ensureDir(fullPath);
          createdDirs.push(`${dirName}: ${dirPath}`);
        }
      } else if (oldFullPath && (await fs.pathExists(oldFullPath)) && (await fs.pathExists(fullPath))) {
        const color = await prompts.getColor();
        await prompts.log.warn(
          color.yellow(`${dirName}: path changed but both directories exist:\n  Old: ${oldDirPath}\n  New: ${dirPath}\n  Please review manually.`),
        );
      } else if (!(await fs.pathExists(fullPath))) {
        createdDirs.push(`${dirName}: ${dirPath}`);
        await fs.ensureDir(fullPath);
      }

      if (configKey === 'design_artifacts' && wdsFolders.length > 0) {
        for (const subfolder of wdsFolders) {
          const subPath = path.join(fullPath, subfolder);
          if (!(await fs.pathExists(subPath))) {
            await fs.ensureDir(subPath);
            createdWdsFolders.push(subfolder);
          }
        }
      }
    }

    return { createdDirs, movedDirs, createdWdsFolders };
  }

  async syncModule(sourcePath, targetPath) {
    const sourceFiles = await this.getFileList(sourcePath);

    for (const file of sourceFiles) {
      const sourceFile = path.join(sourcePath, file);
      const targetFile = path.join(targetPath, file);

      if (await fs.pathExists(targetFile)) {
        const sourceStats = await fs.stat(sourceFile);
        const targetStats = await fs.stat(targetFile);
        if (targetStats.mtime > sourceStats.mtime) continue;
      }

      await this.copyFile(sourceFile, targetFile);
    }
  }

  async getFileList(dir, baseDir = dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.getFileList(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        files.push(path.relative(baseDir, fullPath));
      }
    }

    return files;
  }

  // Config collection methods (simplified for single module)

  async findQdDir(projectDir) {
    if (!(await fs.pathExists(projectDir))) {
      return path.join(projectDir, 'qd');
    }

    try {
      const entries = await fs.readdir(projectDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(projectDir, entry.name, '_config', 'manifest.yaml');
          if (await fs.pathExists(manifestPath)) {
            return path.join(projectDir, entry.name);
          }
        }
      }
    } catch {}

    return path.join(projectDir, 'qd');
  }

  async detectExistingQdFolder(projectDir) {
    if (!(await fs.pathExists(projectDir))) return null;

    try {
      const entries = await fs.readdir(projectDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(projectDir, entry.name, '_config', 'manifest.yaml');
          if (await fs.pathExists(manifestPath)) {
            return entry.name;
          }
        }
      }
    } catch {}

    return null;
  }

  async loadExistingConfig(projectDir) {
    this._existingConfig = {};

    if (!(await fs.pathExists(projectDir))) return false;

    const qdDir = await this.findQdDir(projectDir);
    if (!(await fs.pathExists(qdDir))) return false;

    let foundAny = false;
    const entries = await fs.readdir(qdDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === '_config' || entry.name === '_memory') continue;

        const moduleConfigPath = path.join(qdDir, entry.name, 'config.yaml');
        if (await fs.pathExists(moduleConfigPath)) {
          try {
            const content = await fs.readFile(moduleConfigPath, 'utf8');
            const moduleConfig = yaml.parse(content);
            if (moduleConfig) {
              this._existingConfig[entry.name] = moduleConfig;
              foundAny = true;
            }
          } catch {}
        }
      }
    }

    return foundAny;
  }

  async scanModuleSchemas(modules) {
    const metadataFields = new Set(['code', 'name', 'header', 'subheader', 'default_selected']);
    const results = [];

    for (const moduleName of modules) {
      const artifactsPath = getArtifactsPath();
      const moduleConfigPath = path.join(artifactsPath, 'module.yaml');

      if (!moduleConfigPath || !(await fs.pathExists(moduleConfigPath))) continue;

      try {
        const content = await fs.readFile(moduleConfigPath, 'utf8');
        const moduleConfig = yaml.parse(content);
        if (!moduleConfig) continue;

        const displayName = moduleConfig.header || `${moduleName.toUpperCase()} Module`;
        const configKeys = Object.keys(moduleConfig).filter((key) => key !== 'prompt');
        const questionKeys = configKeys.filter((key) => {
          if (metadataFields.has(key)) return false;
          const item = moduleConfig[key];
          return item && typeof item === 'object' && item.prompt;
        });

        const hasFieldsWithoutDefaults = questionKeys.some((key) => {
          const item = moduleConfig[key];
          return item.default === undefined || item.default === null || item.default === '';
        });

        results.push({
          moduleName,
          displayName,
          questionCount: questionKeys.length,
          hasFieldsWithoutDefaults,
        });
      } catch (error) {
        await prompts.log.warn(`Could not read schema for module "${moduleName}": ${error.message}`);
      }
    }

    return results;
  }

  async collectAllConfigurations(modules, projectDir, options = {}) {
    this.skipPrompts = options.skipPrompts || false;
    this.modulesToCustomize = undefined;
    await this.loadExistingConfig(projectDir);

    const qdAlreadyCollected = this.collectedConfig.qd && Object.keys(this.collectedConfig.qd).length > 0;
    const allModules = qdAlreadyCollected ? modules.filter((m) => m !== 'qd') : [...modules];

    if (!this.allAnswers) this.allAnswers = {};

    let scannedModules = [];
    if (!this.skipPrompts && allModules.length > 0) {
      scannedModules = await this.scanModuleSchemas(allModules);
      const customizableModules = scannedModules.filter((m) => m.questionCount > 0);

      if (customizableModules.length > 0) {
        const configMode = await prompts.select({
          message: 'Module configuration',
          choices: [
            { name: 'Express Setup', value: 'express', hint: 'accept all defaults (recommended)' },
            { name: 'Customize', value: 'customize', hint: 'choose modules to configure' },
          ],
          default: 'express',
        });

        if (configMode === 'customize') {
          const choices = customizableModules.map((m) => ({
            name: `${m.displayName} (${m.questionCount} option${m.questionCount === 1 ? '' : 's'})`,
            value: m.moduleName,
            hint: m.hasFieldsWithoutDefaults ? 'has fields without defaults' : undefined,
            checked: m.hasFieldsWithoutDefaults,
          }));
          const selected = await prompts.multiselect({
            message: 'Select modules to customize:',
            choices,
            required: false,
          });
          this.modulesToCustomize = new Set(selected);
        } else {
          this.modulesToCustomize = new Set();
        }
      } else {
        this.modulesToCustomize = new Set();
      }
    }

    if (this.modulesToCustomize === undefined) {
      for (const moduleName of allModules) {
        await this.collectModuleConfig(moduleName, projectDir);
      }
    } else {
      const defaultModules = allModules.filter((m) => !this.modulesToCustomize.has(m));
      const customizeModules = allModules.filter((m) => this.modulesToCustomize.has(m));

      if (defaultModules.length > 0) {
        const displayNameMap = new Map();
        for (const m of scannedModules) {
          displayNameMap.set(m.moduleName, m.displayName);
        }

        const configSpinner = await prompts.spinner();
        configSpinner.start('Configuring modules...');
        try {
          for (const moduleName of defaultModules) {
            const displayName = displayNameMap.get(moduleName) || moduleName.toUpperCase();
            configSpinner.message(`Configuring ${displayName}...`);
            try {
              this._silentConfig = true;
              await this.collectModuleConfig(moduleName, projectDir);
            } finally {
              this._silentConfig = false;
            }
          }
        } finally {
          configSpinner.stop(customizeModules.length > 0 ? 'Module defaults applied' : 'Module configuration complete');
        }
      }

      for (const moduleName of customizeModules) {
        await this.collectModuleConfig(moduleName, projectDir);
      }

      if (customizeModules.length > 0) {
        await prompts.log.step('Module configuration complete');
      }
    }

    this.collectedConfig._meta = {
      version: require(path.join(getProjectRoot(), 'package.json')).version,
      installDate: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };

    return this.collectedConfig;
  }

  async collectModuleConfigQuick(moduleName, projectDir, silentMode = true) {
    this.currentProjectDir = projectDir;
    if (!this._existingConfig) await this.loadExistingConfig(projectDir);
    if (!this.allAnswers) this.allAnswers = {};

    const artifactsPath = getArtifactsPath();
    const moduleConfigPath = path.join(artifactsPath, 'module.yaml');

    if (!(await fs.pathExists(moduleConfigPath))) {
      if (this._existingConfig && this._existingConfig[moduleName]) {
        if (!this.collectedConfig[moduleName]) this.collectedConfig[moduleName] = {};
        this.collectedConfig[moduleName] = { ...this._existingConfig[moduleName] };
      }
      return false;
    }

    const configContent = await fs.readFile(moduleConfigPath, 'utf8');
    const moduleConfig = yaml.parse(configContent);
    if (!moduleConfig) return false;

    const configKeys = Object.keys(moduleConfig).filter((key) => key !== 'prompt');
    const existingKeys = this._existingConfig && this._existingConfig[moduleName] ? Object.keys(this._existingConfig[moduleName]) : [];

    const metadataFields = new Set(['code', 'name', 'header', 'subheader', 'default_selected']);
    const actualConfigKeys = configKeys.filter((key) => !metadataFields.has(key));
    const hasNoConfig = actualConfigKeys.length === 0;

    if (hasNoConfig && moduleConfig.subheader) {
      const moduleDisplayName = moduleConfig.header || `${moduleName.toUpperCase()} Module`;
      await prompts.log.step(moduleDisplayName);
      await prompts.log.message(`  \u2713 ${moduleConfig.subheader}`);
      return false;
    }

    const newKeys = configKeys.filter((key) => {
      const item = moduleConfig[key];
      return item && typeof item === 'object' && item.prompt && !existingKeys.includes(key);
    });

    const newStaticKeys = configKeys.filter((key) => {
      const item = moduleConfig[key];
      return item && typeof item === 'object' && !item.prompt && item.result && !existingKeys.includes(key);
    });

    if (silentMode && newKeys.length === 0 && newStaticKeys.length === 0) {
      if (this._existingConfig && this._existingConfig[moduleName]) {
        if (!this.collectedConfig[moduleName]) this.collectedConfig[moduleName] = {};
        this.collectedConfig[moduleName] = { ...this._existingConfig[moduleName] };
        if (moduleName === 'qd' && (!this.collectedConfig[moduleName].user_name || this.collectedConfig[moduleName].user_name === '[USER_NAME]')) {
          this.collectedConfig[moduleName].user_name = this.getDefaultUsername();
        }
        for (const [key, value] of Object.entries(this._existingConfig[moduleName])) {
          let finalValue = value;
          if (moduleName === 'qd' && key === 'user_name' && (!value || value === '[USER_NAME]')) {
            finalValue = this.getDefaultUsername();
          }
          this.allAnswers[`${moduleName}_${key}`] = finalValue;
        }
      } else if (moduleName === 'qd') {
        if (!this.collectedConfig[moduleName]) this.collectedConfig[moduleName] = {};
        if (!this.collectedConfig[moduleName].user_name) {
          this.collectedConfig[moduleName].user_name = this.getDefaultUsername();
          this.allAnswers[`${moduleName}_user_name`] = this.getDefaultUsername();
        }
      }
      await prompts.log.message(`  \u2713 ${moduleName.toUpperCase()} module already up to date`);
      return false;
    }

    if (newKeys.length > 0 || newStaticKeys.length > 0) {
      const questions = [];
      const staticAnswers = {};

      for (const key of newKeys) {
        const item = moduleConfig[key];
        const question = await this.buildQuestion(moduleName, key, item, moduleConfig);
        if (question) questions.push(question);
      }

      for (const key of newStaticKeys) {
        staticAnswers[`${moduleName}_${key}`] = undefined;
      }

      let allAnswers = { ...staticAnswers };

      if (questions.length > 0 && silentMode) {
        for (const q of questions) {
          allAnswers[q.name] = typeof q.default === 'function' ? q.default({}) : q.default;
        }
        await prompts.log.message(`  \u2713 ${moduleName.toUpperCase()} module configured with defaults`);
      } else if (questions.length > 0) {
        await CLIUtils.displayModuleConfigHeader(moduleName, moduleConfig.header, moduleConfig.subheader);
        await prompts.log.message('');
        const promptedAnswers = await prompts.prompt(questions);
        Object.assign(allAnswers, promptedAnswers);
      } else if (newStaticKeys.length > 0) {
        await prompts.log.message(`  \u2713 ${moduleName.toUpperCase()} module configuration updated`);
      }

      Object.assign(this.allAnswers, allAnswers);

      if (this._existingConfig && this._existingConfig[moduleName]) {
        this.collectedConfig[moduleName] = { ...this._existingConfig[moduleName] };
      } else {
        this.collectedConfig[moduleName] = {};
      }

      for (const key of Object.keys(allAnswers)) {
        const originalKey = key.replace(`${moduleName}_`, '');
        const item = moduleConfig[originalKey];
        const value = allAnswers[key];

        let result;
        if (Array.isArray(value)) {
          result = value;
        } else if (item.result) {
          result = this.processResultTemplate(item.result, value);
        } else {
          result = value;
        }

        this.collectedConfig[moduleName][originalKey] = result;
      }
    }

    if (this._existingConfig && this._existingConfig[moduleName]) {
      if (!this.collectedConfig[moduleName]) this.collectedConfig[moduleName] = {};
      for (const [key, value] of Object.entries(this._existingConfig[moduleName])) {
        if (!this.collectedConfig[moduleName][key]) {
          this.collectedConfig[moduleName][key] = value;
          this.allAnswers[`${moduleName}_${key}`] = value;
        }
      }
    }

    await this.displayModulePostConfigNotes(moduleName, moduleConfig);
    return newKeys.length > 0 || newStaticKeys.length > 0;
  }

  processResultTemplate(resultTemplate, value) {
    let result = resultTemplate;

    if (typeof result === 'string' && value !== undefined) {
      if (typeof value === 'string') {
        result = result.replace('{value}', value);
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        if (result === '{value}') {
          result = value;
        } else {
          result = result.replace('{value}', value);
        }
      } else {
        result = value;
      }

      if (typeof result === 'string') {
        result = result.replaceAll(/{([^}]+)}/g, (match, configKey) => {
          if (configKey === 'project-root') return '{project-root}';
          if (configKey === 'value') return match;

          let configValue = this.allAnswers[configKey] || this.allAnswers[`${configKey}`];
          if (!configValue) {
            for (const [answerKey, answerValue] of Object.entries(this.allAnswers)) {
              if (answerKey.endsWith(`_${configKey}`)) {
                configValue = answerValue;
                break;
              }
            }
          }

          if (!configValue) {
            for (const mod of Object.keys(this.collectedConfig)) {
              if (mod !== '_meta' && this.collectedConfig[mod] && this.collectedConfig[mod][configKey]) {
                configValue = this.collectedConfig[mod][configKey];
                if (typeof configValue === 'string' && configValue.includes('{project-root}/')) {
                  configValue = configValue.replace('{project-root}/', '');
                }
                break;
              }
            }
          }

          return configValue || match;
        });
      }
    }

    return result;
  }

  getDefaultUsername() {
    let result = 'QD';
    try {
      const os = require('node:os');
      const userInfo = os.userInfo();
      if (userInfo && userInfo.username) {
        result = userInfo.username.charAt(0).toUpperCase() + userInfo.username.slice(1);
      }
    } catch {}
    return result;
  }

  async collectModuleConfig(moduleName, projectDir, skipLoadExisting = false, skipCompletion = false) {
    this.currentProjectDir = projectDir;
    if (!skipLoadExisting && !this._existingConfig) await this.loadExistingConfig(projectDir);
    if (!this.allAnswers) this.allAnswers = {};

    const artifactsPath = getArtifactsPath();
    const moduleConfigPath = path.join(artifactsPath, 'module.yaml');

    if (!(await fs.pathExists(moduleConfigPath))) return;

    const configContent = await fs.readFile(moduleConfigPath, 'utf8');
    const moduleConfig = yaml.parse(configContent);
    if (!moduleConfig) return;

    const questions = [];
    const staticAnswers = {};
    const configKeys = Object.keys(moduleConfig).filter((key) => key !== 'prompt');

    for (const key of configKeys) {
      const item = moduleConfig[key];

      if (!item || typeof item !== 'object') continue;

      if (!item.prompt && item.result) {
        staticAnswers[`${moduleName}_${key}`] = undefined;
        continue;
      }

      if (item.prompt) {
        const question = await this.buildQuestion(moduleName, key, item, moduleConfig);
        if (question) questions.push(question);
      }
    }

    let allAnswers = { ...staticAnswers };

    if (questions.length > 0) {
      const moduleDisplayName = moduleConfig.header || `${moduleName.toUpperCase()} Module`;

      if (this.skipPrompts) {
        await prompts.log.info(`Using default configuration for ${moduleDisplayName}`);
        for (const question of questions) {
          const hasDefault = question.default !== undefined && question.default !== null && question.default !== '';
          if (hasDefault && typeof question.default !== 'function') {
            allAnswers[question.name] = question.default;
          }
        }
      } else {
        if (!this._silentConfig) await prompts.log.step(`Configuring ${moduleDisplayName}`);
        let useDefaults = true;
        if (moduleName === 'qd') {
          useDefaults = false;
        } else if (this.modulesToCustomize === undefined) {
          const customizeAnswer = await prompts.prompt([{ type: 'confirm', name: 'customize', message: 'Accept Defaults (no to customize)?', default: true }]);
          useDefaults = customizeAnswer.customize;
        } else {
          useDefaults = !this.modulesToCustomize.has(moduleName);
        }

        if (useDefaults && moduleName !== 'qd') {
          const questionsWithoutDefaults = questions.filter((q) => q.default === undefined || q.default === null || q.default === '');
          if (questionsWithoutDefaults.length > 0) {
            await prompts.log.message(`  Asking required questions for ${moduleName.toUpperCase()}...`);
            const promptedAnswers = await prompts.prompt(questionsWithoutDefaults);
            Object.assign(allAnswers, promptedAnswers);
          }
          const questionsWithDefaults = questions.filter((q) => q.default !== undefined && q.default !== null && q.default !== '');
          for (const question of questionsWithDefaults) {
            if (typeof question.default === 'function') continue;
            allAnswers[question.name] = question.default;
          }
        } else {
          const promptedAnswers = await prompts.prompt(questions);
          Object.assign(allAnswers, promptedAnswers);
        }
      }
    }

    Object.assign(this.allAnswers, allAnswers);

    if (Object.keys(allAnswers).length > 0 || Object.keys(staticAnswers).length > 0) {
      const answers = allAnswers;

      for (const key of Object.keys(answers)) {
        const originalKey = key.replace(`${moduleName}_`, '');
        const item = moduleConfig[originalKey];
        const value = answers[key];

        let result;
        if (Array.isArray(value)) {
          result = value;
        } else if (item.result) {
          result = item.result;

          if (typeof result === 'string' && value !== undefined) {
            if (typeof value === 'string') {
              result = result.replace('{value}', value);
            } else if (typeof value === 'boolean' || typeof value === 'number') {
              if (result === '{value}') {
                result = value;
              } else {
                result = result.replace('{value}', value);
              }
            } else {
              result = value;
            }

            if (typeof result === 'string') {
              result = result.replaceAll(/{([^}]+)}/g, (match, configKey) => {
                if (configKey === 'project-root') return '{project-root}';
                if (configKey === 'value') return match;

                let configValue = answers[`${moduleName}_${configKey}`];
                if (!configValue) {
                  for (const [answerKey, answerValue] of Object.entries(this.allAnswers)) {
                    if (answerKey.endsWith(`_${configKey}`)) {
                      configValue = answerValue;
                      break;
                    }
                  }
                }

                if (!configValue) {
                  for (const mod of Object.keys(this.collectedConfig)) {
                    if (mod !== '_meta' && this.collectedConfig[mod] && this.collectedConfig[mod][configKey]) {
                      configValue = this.collectedConfig[mod][configKey];
                      break;
                    }
                  }
                }

                return configValue || match;
              });
            }
          }
        } else {
          result = value;
        }

        if (!this.collectedConfig[moduleName]) this.collectedConfig[moduleName] = {};
        this.collectedConfig[moduleName][originalKey] = result;
      }
    } else {
      const moduleDisplayName = moduleConfig.header || `${moduleName.toUpperCase()} Module`;
      const metadataFields = new Set(['code', 'name', 'header', 'subheader', 'default_selected']);
      const actualConfigKeys = configKeys.filter((key) => !metadataFields.has(key));
      const hasNoConfig = actualConfigKeys.length === 0;

      if (!this._silentConfig) {
        if (hasNoConfig && (moduleConfig.subheader || moduleConfig.header)) {
          await prompts.log.step(moduleDisplayName);
          if (moduleConfig.subheader) await prompts.log.message(`  \u2713 ${moduleConfig.subheader}`);
          else await prompts.log.message(`  \u2713 No custom configuration required`);
        } else {
          await prompts.log.message(`  \u2713 ${moduleName.toUpperCase()} module configured`);
        }
      }
    }

    if (!this.collectedConfig[moduleName]) this.collectedConfig[moduleName] = {};

    await this.displayModulePostConfigNotes(moduleName, moduleConfig);
  }

  replacePlaceholders(str, currentModule = null, moduleConfig = null) {
    if (typeof str !== 'string') return str;

    return str.replaceAll(/{([^}]+)}/g, (match, configKey) => {
      if (configKey === 'project-root' || configKey === 'value' || configKey === 'directory_name') return match;
      const configValue = this.resolveConfigValue(configKey, currentModule, moduleConfig);
      return configValue || match;
    });
  }

  cleanPromptValue(value) {
    if (typeof value === 'string' && value.startsWith('{project-root}/')) {
      return value.replace('{project-root}/', '');
    }
    return value;
  }

  resolveConfigValue(configKey, currentModule = null, moduleConfig = null) {
    let configValue = this.allAnswers?.[configKey] || this.allAnswers?.[`qd_${configKey}`];

    if (!configValue && this.allAnswers) {
      for (const [answerKey, answerValue] of Object.entries(this.allAnswers)) {
        if (answerKey.endsWith(`_${configKey}`)) {
          configValue = answerValue;
          break;
        }
      }
    }

    if (!configValue && currentModule && this._existingConfig?.[currentModule]?.[configKey] !== undefined) {
      configValue = this._existingConfig[currentModule][configKey];
    }

    if (!configValue) {
      for (const mod of Object.keys(this.collectedConfig)) {
        if (mod !== '_meta' && this.collectedConfig[mod] && this.collectedConfig[mod][configKey]) {
          configValue = this.collectedConfig[mod][configKey];
          break;
        }
      }
    }

    if (!configValue && this._existingConfig) {
      for (const mod of Object.keys(this._existingConfig)) {
        if (mod !== '_meta' && this._existingConfig[mod] && this._existingConfig[mod][configKey]) {
          configValue = this._existingConfig[mod][configKey];
          break;
        }
      }
    }

    if (!configValue && currentModule && moduleConfig && moduleConfig[configKey]) {
      const referencedItem = moduleConfig[configKey];
      if (referencedItem && referencedItem.default !== undefined) {
        configValue = referencedItem.default;
      }
    }

    return this.cleanPromptValue(configValue);
  }

  normalizeExistingValueForPrompt(existingValue, moduleName, item, moduleConfig = null) {
    const cleanedValue = this.cleanPromptValue(existingValue);

    if (typeof cleanedValue !== 'string' || typeof item?.result !== 'string' || !item.result.includes('{value}')) {
      return cleanedValue;
    }

    const [prefixTemplate = '', suffixTemplate = ''] = item.result.split('{value}');
    const prefix = this.cleanPromptValue(this.replacePlaceholders(prefixTemplate, moduleName, moduleConfig));
    const suffix = this.cleanPromptValue(this.replacePlaceholders(suffixTemplate, moduleName, moduleConfig));

    if ((prefix && !cleanedValue.startsWith(prefix)) || (suffix && !cleanedValue.endsWith(suffix))) {
      return cleanedValue;
    }

    const startIndex = prefix.length;
    const endIndex = suffix ? cleanedValue.length - suffix.length : cleanedValue.length;
    if (endIndex < startIndex) return cleanedValue;

    let promptValue = cleanedValue.slice(startIndex, endIndex);
    if (promptValue.startsWith('/')) promptValue = promptValue.slice(1);
    if (promptValue.endsWith('/')) promptValue = promptValue.slice(0, -1);

    return promptValue || cleanedValue;
  }

  async buildQuestion(moduleName, key, item, moduleConfig = null) {
    const questionName = `${moduleName}_${key}`;

    let existingValue = null;
    if (this._existingConfig && this._existingConfig[moduleName]) {
      existingValue = this._existingConfig[moduleName][key];
      existingValue = this.normalizeExistingValueForPrompt(existingValue, moduleName, item, moduleConfig);
    }

    if (moduleName === 'qd' && key === 'user_name' && !existingValue) {
      item.default = this.getDefaultUsername();
    }

    let questionType = 'input';
    let defaultValue = item.default;
    let choices = null;

    const hasSameModuleReference = typeof defaultValue === 'string' && defaultValue.match(/{([^}]+)}/);
    let dynamicDefault = false;

    if (typeof defaultValue === 'string') {
      if (defaultValue.includes('{directory_name}') && this.currentProjectDir) {
        const dirName = path.basename(this.currentProjectDir);
        defaultValue = defaultValue.replaceAll('{directory_name}', dirName);
      }

      if (hasSameModuleReference && moduleConfig) {
        const matches = defaultValue.match(/{([^}]+)}/g);
        if (matches) {
          for (const match of matches) {
            const fieldName = match.slice(1, -1);
            if (moduleConfig[fieldName]) {
              dynamicDefault = true;
              break;
            }
          }
        }
      }

      if (!dynamicDefault) {
        defaultValue = this.replacePlaceholders(defaultValue, moduleName, moduleConfig);
      }

      if (defaultValue.includes('{project-root}/')) {
        defaultValue = defaultValue.replace('{project-root}/', '');
      }
    }

    if (item['single-select']) {
      questionType = 'list';
      choices = item['single-select'].map((choice) => {
        if (typeof choice === 'object' && choice.label && choice.value !== undefined) {
          return { name: choice.label, value: choice.value };
        }
        return { name: choice, value: choice };
      });
      if (existingValue) defaultValue = existingValue;
    } else if (item['multi-select']) {
      questionType = 'checkbox';
      choices = item['multi-select'].map((choice) => {
        if (typeof choice === 'object' && choice.label && choice.value !== undefined) {
          return {
            name: choice.label,
            value: choice.value,
            checked: existingValue ? existingValue.includes(choice.value) : item.default && Array.isArray(item.default) ? item.default.includes(choice.value) : false,
          };
        }
        return {
          name: choice,
          value: choice,
          checked: existingValue ? existingValue.includes(choice) : item.default && Array.isArray(item.default) ? item.default.includes(choice) : false,
        };
      });
    } else if (typeof defaultValue === 'boolean') {
      questionType = 'confirm';
    }

    let message = '';
    if (Array.isArray(item.prompt)) {
      message = item.prompt.join('\n');
    } else {
      message = item.prompt;
    }

    if (typeof message === 'string') {
      message = this.replacePlaceholders(message, moduleName, moduleConfig);
    }

    const color = await prompts.getColor();
    if (existingValue !== null && existingValue !== undefined) {
      if (typeof existingValue === 'boolean') {
        message += color.dim(` (current: ${existingValue ? 'true' : 'false'})`);
      } else if (Array.isArray(existingValue)) {
        message += color.dim(` (current: ${existingValue.join(', ')})`);
      } else if (questionType !== 'list') {
        message += color.dim(` (current: ${existingValue})`);
      }
    } else if (item.example && questionType === 'input') {
      let exampleText = typeof item.example === 'string' ? item.example : JSON.stringify(item.example);
      if (typeof exampleText === 'string') {
        exampleText = this.replacePlaceholders(exampleText, moduleName, moduleConfig);
        exampleText = exampleText.replace('{project-root}/', '');
      }
      message += color.dim(` (e.g., ${exampleText})`);
    }

    const question = { type: questionType, name: questionName, message };

    if (existingValue !== null && existingValue !== undefined && questionType !== 'list') {
      question.default = existingValue;
    } else if (dynamicDefault && typeof item.default === 'string') {
      const originalDefault = item.default;
      question.default = (answers) => {
        let resolved = originalDefault;
        resolved = resolved.replaceAll(/{([^}]+)}/g, (match, fieldName) => {
          const answerKey = `${moduleName}_${fieldName}`;
          if (answers[answerKey] !== undefined) return answers[answerKey];
          return this.collectedConfig[moduleName]?.[fieldName] || match;
        });
        if (resolved.includes('{project-root}/')) resolved = resolved.replace('{project-root}/', '');
        return resolved;
      };
    } else {
      question.default = defaultValue;
    }

    if (choices) question.choices = choices;

    if (questionType === 'input') {
      question.validate = (input) => {
        if (!input && item.required) return 'This field is required';
        if (input && item.regex) {
          const regex = new RegExp(item.regex);
          if (!regex.test(input)) return `Invalid format. Must match pattern: ${item.regex}`;
        }
        return true;
      };
    }

    if (questionType === 'checkbox' && item.required) {
      question.validate = (answers) => {
        if (!answers || answers.length === 0) return 'At least one option must be selected';
        return true;
      };
    }

    return question;
  }

  async displayModulePostConfigNotes(moduleName, moduleConfig) {
    if (this._silentConfig) return;
    if (!moduleConfig || !moduleConfig['post-install-notes']) return;

    const notes = moduleConfig['post-install-notes'];
    const color = await prompts.getColor();

    if (typeof notes === 'string') {
      await prompts.log.message('');
      for (const line of notes.trim().split('\n')) {
        await prompts.log.message(color.dim(line));
      }
      return;
    }

    if (typeof notes === 'object') {
      const config = this.collectedConfig[moduleName];
      if (!config) return;

      let hasOutput = false;
      for (const [configKey, valueMessages] of Object.entries(notes)) {
        const selectedValue = config[configKey];
        if (!selectedValue || !valueMessages[selectedValue]) continue;

        if (hasOutput) await prompts.log.message('');
        hasOutput = true;

        const message = valueMessages[selectedValue];
        for (const line of message.trim().split('\n')) {
          const trimmedLine = line.trim();
          if (trimmedLine.endsWith(':') && !trimmedLine.startsWith(' ')) {
            await prompts.log.info(color.bold(trimmedLine));
          } else {
            await prompts.log.message(color.dim('  ' + trimmedLine));
          }
        }
      }
    }
  }

  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          result[key] = source[key];
        }
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

module.exports = { OfficialModules };
