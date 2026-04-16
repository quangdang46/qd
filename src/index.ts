#!/usr/bin/env node
// @ts-nocheck

/**
 * QD CLI Entry Point
 */

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const semver = require('semver');
const prompts = require('./shared/prompts');
const { registerCommands } = require('./commands');
const { logger } = require('./shared/logger');
const { output } = require('./shared/output-manager');

// The installer flow uses many sequential @clack/prompts
if (process.stdin?.setMaxListeners) {
  process.stdin.setMaxListeners(Math.max(process.stdin.getMaxListeners(), 50));
}

// Graceful shutdown handlers
let isShuttingDown = false;
const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.error(`\n${signal} received, shutting down...`);
  process.exit(130);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Set proper output encoding
if (process.stdout.setEncoding) process.stdout.setEncoding('utf8');
if (process.stderr.setEncoding) process.stderr.setEncoding('utf8');

// Check for updates asynchronously
const packageJson = require('../package.json');
checkForUpdate().catch(() => {});

async function checkForUpdate() {
  try {
    const isBeta = packageJson.version.includes('Beta') ||
                   packageJson.version.includes('beta') ||
                   packageJson.version.includes('alpha') ||
                   packageJson.version.includes('rc');
    const tag = isBeta ? 'beta' : 'latest';
    const result = execSync(`npm view qd@${tag} version`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
    }).trim();

    if (result && semver.gt(result, packageJson.version)) {
      const color = await prompts.getColor();
      const updateMsg = [
        `You are using version ${packageJson.version} but ${result} is available.`,
        '',
        'To update, exit and first run:',
        `  npm cache clean --force && npx qd@${tag} install`,
      ].join('\n');
      await prompts.box(updateMsg, 'Update Available', {
        rounded: true,
        formatBorder: color.yellow,
      });
    }
  } catch {
    // Silently fail
  }
}

// Create Commander instance
const { program } = require('commander');

// Register commands
registerCommands(program);

// Add global options
program.option('--verbose', 'Enable verbose output');
program.option('--json', 'Output results as JSON');

// Parse arguments
program.parse(process.argv);
const options = program.opts();

// Main execution
(async () => {
  try {
    // If help requested or no command, show help
    if (process.argv.includes('--help') || process.argv.length === 2) {
      program.help();
      process.exit(0);
      return;
    }

    // Configure output
    const isVerbose = options.verbose || process.env.QD_VERBOSE === '1';
    const isJson = options.json || false;

    output.configure({ verbose: isVerbose, json: isJson });

    if (isVerbose) {
      logger.setVerbose(true);
    }

    if (output.isJson()) {
      await output.flushJson();
    }
  } catch (error) {
    console.error('CLI error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
