// @ts-nocheck

/**
 * Clean install configuration built from user input.
 * User input comes from either UI answers or headless CLI flags.
 */
class Config {
  constructor({ directory, ides, skipPrompts, verbose, actionType, qdConfig, moduleConfigs, quickUpdate }) {
    this.directory = directory;
    this.ides = Object.freeze([...ides]);
    this.skipPrompts = skipPrompts;
    this.verbose = verbose;
    this.actionType = actionType;
    this.qdConfig = qdConfig;
    this.moduleConfigs = moduleConfigs;
    this._quickUpdate = quickUpdate;
    Object.freeze(this);
  }

  /**
   * Build a clean install config from raw user input.
   * @param {Object} userInput - UI answers or CLI flags
   * @returns {Config}
   */
  static build(userInput) {
    return new Config({
      directory: userInput.directory,
      ides: userInput.skipIde ? [] : [...(userInput.ides || [])],
      skipPrompts: userInput.skipPrompts || false,
      verbose: userInput.verbose || false,
      actionType: userInput.actionType,
      qdConfig: userInput.qdConfig || userInput.coreConfig || {},
      moduleConfigs: userInput.moduleConfigs || null,
      quickUpdate: userInput._quickUpdate || false,
    });
  }

  hasQdConfig() {
    return this.qdConfig && Object.keys(this.qdConfig).length > 0;
  }

  isQuickUpdate() {
    return this._quickUpdate;
  }
}

module.exports = { Config };
