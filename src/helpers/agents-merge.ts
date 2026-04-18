const fs = require('../shared/fs-native');

/**
 * Merge AGENTS.template.md content into existing AGENTS.md
 * - If existing AGENTS.md has QD block (AGENTS:START/END), replace it
 * - If no QD block, append the QD block at the end
 * - If no existing AGENTS.md, copy template as-is
 */
async function mergeAgentsTemplate(sourceFile, targetFile) {
  const template = await fs.readFile(sourceFile, 'utf8');
  const templateBlock = extractAgentsBlock(template);

  if (!(await fs.pathExists(targetFile))) {
    await fs.copy(sourceFile, targetFile);
    return;
  }

  const existing = await fs.readFile(targetFile, 'utf8');

  if (hasAgentsBlock(existing)) {
    const merged = replaceAgentsBlock(existing, templateBlock);
    await fs.writeFile(targetFile, merged, 'utf8');
  } else {
    const merged = existing.trimEnd() + '\n\n' + templateBlock + '\n';
    await fs.writeFile(targetFile, merged, 'utf8');
  }
}

function extractAgentsBlock(content) {
  const start = content.indexOf('<!-- AGENTS:START -->');
  const end = content.indexOf('<!-- AGENTS:END -->') + '<!-- AGENTS:END -->'.length;
  if (start === -1 || end === -1) return content;
  return content.slice(start, end);
}

function hasAgentsBlock(content) {
  return content.includes('<!-- AGENTS:START -->') && content.includes('<!-- AGENTS:END -->');
}

function replaceAgentsBlock(existing, newBlock) {
  const start = existing.indexOf('<!-- AGENTS:START -->');
  const end = existing.indexOf('<!-- AGENTS:END -->') + '<!-- AGENTS:END -->'.length;
  if (start === -1) return existing.trimEnd() + '\n\n' + newBlock + '\n';
  return existing.slice(0, start) + newBlock + '\n';
}

module.exports = {
  mergeAgentsTemplate,
  extractAgentsBlock,
  hasAgentsBlock,
  replaceAgentsBlock,
};
