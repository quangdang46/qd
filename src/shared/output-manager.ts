// @ts-nocheck

/**
 * Output Manager - JSON/verbose output control
 */

let _verbose = false;
let _json = false;
let _jsonBuffer = [];

const output = {
  configure(options = {}) {
    if (options.verbose !== undefined) _verbose = options.verbose;
    if (options.json !== undefined) _json = options.json;
  },

  isVerbose() {
    return _verbose;
  },

  isJson() {
    return _json;
  },

  verbose(message) {
    if (_verbose) {
      console.log(message);
    }
  },

  addJson(entry) {
    if (_json) {
      _jsonBuffer.push(entry);
    }
  },

  async flushJson() {
    if (_json && _jsonBuffer.length > 0) {
      console.log(JSON.stringify(_jsonBuffer, null, 2));
      _jsonBuffer = [];
    }
  },
};

module.exports = { output };
