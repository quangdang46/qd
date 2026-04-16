// @ts-nocheck

/**
 * Prompts - UI utilities using @clack/prompts
 * Extracted from cli/prompts.ts
 */

const prompts = require('@clack/prompts');
const chalk = require('chalk');

const color = {
  cyan: (s) => chalk.cyan(s),
  green: (s) => chalk.green(s),
  yellow: (s) => chalk.yellow(s),
  red: (s) => chalk.red(s),
  gray: (s) => chalk.gray(s),
};

async function getColor() {
  return color;
}

async function intro(title) {
  console.log(color.cyan(`\n◆ ${title}\n`));
}

async function outro(text) {
  console.log(color.gray(`\n✔ ${text}\n`));
}

async function box(text, title, options = {}) {
  const borderStyle = options.formatBorder || color.cyan;
  const border = options.rounded ? '─' : '─';
  const lines = text.split('\n');
  const width = Math.max(...lines.map((l) => l.length));

  console.log(borderStyle(`┌─ ${title} ${border.repeat(Math.max(0, width - title.length - 1))}─┐`));
  for (const line of lines) {
    const padded = line.padEnd(width);
    console.log(borderStyle('│') + ' ' + line + ' '.repeat(Math.max(0, width - line.length)) + ' ' + borderStyle('│'));
  }
  console.log(borderStyle(`└${border.repeat(width + 2)}─┘`));
}

async function note(text, title) {
  const lines = text.split('\n');
  console.log(color.cyan(`\n● ${title}`));
  for (const line of lines) {
    console.log(color.gray(`  ${line}`));
  }
  console.log('');
}

async function spin(message) {
  const s = prompts.spinner();
  s.start(message);
  return s;
}

const log = {
  info: async (msg) => {
    console.log(color.cyan('ℹ'), msg);
  },
  warn: async (msg) => {
    console.log(color.yellow('⚠'), msg);
  },
  error: async (msg) => {
    console.log(color.red('✖'), msg);
  },
  success: async (msg) => {
    console.log(color.green('✔'), msg);
  },
  message: async (msg) => {
    console.log(color.gray(msg));
  },
};

const select = async (options) => {
  const result = await prompts.select({
    message: options.message,
    options: options.choices.map((c) => ({
      label: c.name || c.value,
      value: c.value,
    })),
    initialValue: options.initialValue,
  });
  if (prompts.isCancel(result)) process.exit(0);
  return result;
};

const text = async (options) => {
  const result = await prompts.text({
    message: options.message,
    placeholder: options.placeholder,
    validate: options.validate,
  });
  if (prompts.isCancel(result)) process.exit(0);
  return result;
};

const confirm = async (options) => {
  const result = await prompts.confirm({
    message: options.message,
    initialValue: options.default,
  });
  if (prompts.isCancel(result)) process.exit(0);
  return result;
};

const multiselect = async (options) => {
  const result = await prompts.multiselect({
    message: options.message,
    options: options.options.map((o) => ({
      label: o.label,
      value: o.value,
      hint: o.hint,
    })),
    initialValues: options.initialValues,
    required: options.required,
  });
  if (prompts.isCancel(result)) process.exit(0);
  return result;
};

module.exports = {
  getColor,
  intro,
  outro,
  box,
  note,
  spin,
  log,
  select,
  text,
  confirm,
  multiselect,
};
