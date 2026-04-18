// @ts-nocheck

/**
 * Prompts - UI utilities using @clack/prompts + @clack/core
 * Inspired by Claudekit CLI safe-prompts
 */

const {
  isCancel,
  select,
  confirm,
  text,
  spinner,
} = require('@clack/prompts');

const { AutocompletePrompt } = require('@clack/core');
const pc = require('picocolors');

function supportsUnicode() {
  return process.stdout.isTTY && !process.env.CI;
}

const S = supportsUnicode() ? {
  pointer: '›',
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  line: '│',
} : {
  pointer: '>',
  success: '+',
  error: 'x',
  warning: '!',
  info: 'i',
  line: '|',
};

function intro(title) {
  console.log(pc.cyan(`\n${S.pointer} ${title}\n`));
}

function outro(text) {
  console.log(pc.green(`\n${S.success} ${text}\n`));
}

function box(text, title, options = {}) {
  const border = '─';
  const lines = text.split('\n');
  // Calculate width to fit longest line or title
  const contentWidth = Math.max(...lines.map((l) => l.length), title.length);
  const minWidth = 40; // minimum box width
  const width = Math.max(contentWidth, minWidth);

  // Title line: ┌─ Title ────────────────┐
  const titleLine = `┌─ ${title} `;
  const remainingWidth = width - title.length;
  const titleBorder = border.repeat(Math.max(1, remainingWidth));
  console.log(pc.cyan(`${titleLine}${titleBorder}─┐`));

  // Content lines: │ content here              │
  for (const line of lines) {
    console.log(pc.cyan('│') + ' ' + line.padEnd(width) + ' ' + pc.cyan('│'));
  }

  // Bottom line: └───────────────────────────┘
  console.log(pc.cyan('└' + border.repeat(width + 2) + '─┘'));
}

function note(text, title) {
  console.log(pc.cyan(`\n${S.pointer} ${title}`));
  for (const line of text.split('\n')) {
    console.log(pc.gray(`  ${line}`));
  }
  console.log();
}

const log = {
  info: (msg) => console.log(pc.blue(`${S.info} ${msg}`)),
  success: (msg) => console.log(pc.green(`${S.success} ${msg}`)),
  warn: (msg) => console.log(pc.yellow(`${S.warning} ${msg}`)),
  error: (msg) => console.error(pc.red(`${S.error} ${msg}`)),
  step: (msg) => console.log(pc.cyan(`${S.pointer} ${msg}`)),
};

function getColor() {
  return pc;
}

/**
 * Multiselect with scrolling support using AutocompletePrompt
 */
async function multiselect(options) {
  const prompt = new AutocompletePrompt({
    options: options.options,
    multiple: true,
    initialValue: options.initialValues || [],
    validate: () => {
      if (options.required && prompt.selectedValues.length === 0) {
        return 'Please select at least one item';
      }
    },
    render() {
      const title = `${options.message}`;
      const sep = pc.gray('─'.repeat(40));

      const renderOption = (opt, isHighlighted) => {
        const isSelected = this.selectedValues.includes(opt.value);
        const label = opt.label ?? String(opt.value ?? '');
        const checkbox = isSelected ? pc.green('◼') : pc.gray('◻');
        return isHighlighted ? `${checkbox} ${label}` : `${pc.gray(checkbox)} ${pc.gray(label)}`;
      };

      switch (this.state) {
        case 'submit':
          return `${pc.gray('│')} ${this.selectedValues.length} items selected`;
        case 'cancel':
          return `${pc.gray('│')} ${pc.strikethrough(pc.gray('cancelled'))}`;
        default: {
          const header = [`${pc.gray('│')} ${title}`];
          const footer = [
            `${pc.gray('│')} ${pc.dim('↑/↓ navigate · SPACE select · ENTER confirm')}`,
          ];
          const optionLines = [];
          const maxItems = options.maxItems || 10;
          let cursor = this.cursor;
          if (cursor >= this.filteredOptions.length) cursor = this.filteredOptions.length - 1;
          if (cursor < 0) cursor = 0;

          const start = Math.max(0, cursor - Math.floor(maxItems / 2));
          const end = Math.min(start + maxItems, this.filteredOptions.length);

          for (let i = start; i < end; i++) {
            const opt = this.filteredOptions[i];
            const isHighlighted = i === cursor;
            optionLines.push(`${pc.gray('│')} ${renderOption(opt, isHighlighted)}`);
          }
          
          if (this.filteredOptions.length > maxItems) {
            optionLines.push(`${pc.gray('│')} ${pc.dim('...')}`);
          }

          return [...header, ...optionLines, ...footer].join('\n');
        }
      }
    },
  });

  const result = await prompt.prompt();
  if (isCancel(result)) {
    process.exit(0);
  }
  return result;
}

module.exports = {
  isCancel,
  select,
  confirm,
  text,
  multiselect,
  spinner,
  intro,
  outro,
  box,
  note,
  log,
  getColor,
};
