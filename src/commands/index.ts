// @ts-nocheck

/**
 * Command Registry
 * Registers all CLI commands using Commander pattern
 */

const { registerInit } = require('./init');

function registerCommands(program) {
  registerInit(program);
}

module.exports = {
  registerCommands,
};
