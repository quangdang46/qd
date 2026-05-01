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
  // Strip any existing markers from template content for clean insertion
  const cleanContent = stripMarkers(templateContent);

  if (!(await fs.pathExists(targetFile))) {
    // No existing file - write with markers
    await fs.writeFile(targetFile, '<!-- QD:START -->\n' + cleanContent.trim() + '\n<!-- QD:END -->\n', 'utf8');
    return;
  }

  const existing = await fs.readFile(targetFile, 'utf8');

  if (hasAgentsBlock(existing)) {
    const merged = replaceAgentsBlock(existing, cleanContent);
    await fs.writeFile(targetFile, merged, 'utf8');
  } else {
    const merged = existing.trimEnd() + '\n\n<!-- QD:START -->\n' + cleanContent.trim() + '\n<!-- QD:END -->\n';
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
  // Replace existing block - newBlock is already clean (no markers)
  return existing.slice(0, start) + '<!-- QD:START -->\n' + newBlock.trim() + '\n<!-- QD:END -->\n' + existing.slice(end + '<!-- QD:END -->'.length);
}

function stripMarkers(content) {
  // Remove QD markers from content if present
  let result = content;
  const startMarker = '<!-- QD:START -->';
  const endMarker = '<!-- QD:END -->';
  const startIdx = result.indexOf(startMarker);
  const endIdx = result.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    result = result.slice(0, startIdx) + result.slice(startIdx + startMarker.length, endIdx) + result.slice(endIdx + endMarker.length);
  }
  return result;
}

module.exports = {
  mergeAgentsTemplate,
  extractAgentsBlock,
  hasAgentsBlock,
  replaceAgentsBlock,
};
