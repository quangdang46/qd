const fs = require('../shared/fs-native');

/**
 * Merge AGENTS.template.md content into existing AGENTS.md
 * - If existing AGENTS.md has QD block (AGENTS:START/END), replace it
 * - If no QD block, append the QD block at the end
 * - If no existing AGENTS.md, copy template as-is
 */
async function mergeAgentsTemplate(sourceFile, targetFile) {
  const template = await fs.readFile(sourceFile, 'utf8');
  const templateContent = extractAgentsBlock(template);

  if (!(await fs.pathExists(targetFile))) {
    // No existing file - write with markers
    await fs.writeFile(targetFile, '<!-- QD:START -->\n' + templateContent.trim() + '\n<!-- QD:END -->\n', 'utf8');
    return;
  }

  const existing = await fs.readFile(targetFile, 'utf8');

  if (hasAgentsBlock(existing)) {
    const merged = replaceAgentsBlock(existing, templateContent);
    await fs.writeFile(targetFile, merged, 'utf8');
  } else {
    const merged = existing.trimEnd() + '\n\n<!-- QD:START -->\n' + templateContent.trim() + '\n<!-- QD:END -->\n';
    await fs.writeFile(targetFile, merged, 'utf8');
  }
}

function extractAgentsBlock(content) {
  const start = content.indexOf('<!-- QD:START -->');
  if (start !== -1) {
    const end = content.indexOf('<!-- QD:END -->') + '<!-- QD:END -->'.length;
    return content.slice(start, end);
  }
  // No markers - treat entire content as the QD block (wrapped with markers on output)
  return content;
}

function hasAgentsBlock(content) {
  return content.includes('<!-- QD:START -->') && content.includes('<!-- QD:END -->');
}

function replaceAgentsBlock(existing, newBlock) {
  const start = existing.indexOf('<!-- QD:START -->');
  const end = existing.indexOf('<!-- QD:END -->');
  if (start === -1 || end === -1) {
    // No existing block - just append new block with markers
    return existing.trimEnd() + '\n\n<!-- QD:START -->\n' + newBlock.trim() + '\n<!-- QD:END -->\n';
  }
  // Replace existing block with new content (wrap with markers if not present)
  const hasMarkers = newBlock.includes('<!-- QD:START -->');
  const blockToInsert = hasMarkers ? newBlock.trim() : '<!-- QD:START -->\n' + newBlock.trim() + '\n<!-- QD:END -->';
  return existing.slice(0, start) + blockToInsert + '\n' + existing.slice(end + '<!-- QD:END -->'.length);
}

module.exports = {
  mergeAgentsTemplate,
  extractAgentsBlock,
  hasAgentsBlock,
  replaceAgentsBlock,
};
