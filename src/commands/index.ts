// @ts-nocheck

/**
 * Command Registry
 * Registers all CLI commands using Commander pattern
 */

const { registerInit } = require('./init');
const { registerStatus } = require('./status');
const { registerUninstall } = require('./uninstall');

function registerCommands(program) {
  registerInit(program);
  registerStatus(program);
  registerUninstall(program);
}

module.exports = {
  registerCommands,
};
