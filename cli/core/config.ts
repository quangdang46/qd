// @ts-nocheck

/**
 * Clean install configuration built from user input.
 * User input comes from either UI answers or headless CLI flags.
 */
class Config {
  constructor({ directory, ides, skipPrompts, verbose, actionType, bmadConfig, moduleConfigs, quickUpdate }) {
    this.directory = directory;
    this.ides = Object.freeze([...ides]);
    this.skipPrompts = skipPrompts;
    this.verbose = verbose;
    this.actionType = actionType;
    this.bmadConfig = bmadConfig;
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
      bmadConfig: userInput.bmadConfig || userInput.coreConfig || {},
      moduleConfigs: userInput.moduleConfigs || null,
      quickUpdate: userInput._quickUpdate || false,
    });
  }

  hasBmadConfig() {
    return this.bmadConfig && Object.keys(this.bmadConfig).length > 0;
  }

  isQuickUpdate() {
    return this._quickUpdate;
  }
}

module.exports = { Config };
