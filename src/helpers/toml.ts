/**
 * TOML conversion utilities
 */

function escapeTomlString(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

function mdToToml(mdContent) {
  let content = mdContent;
  let frontmatter = {};

  // Extract frontmatter
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) {
      const fmContent = content.slice(3, endIdx).trim();
      content = content.slice(endIdx + 3).trim();

      // Parse frontmatter lines
      for (const line of fmContent.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim().replace(/^"/, '').replace(/"$/, '');
          frontmatter[key] = value;
        }
      }
    }
  }

  // Build TOML
  let toml = '';

  // Add frontmatter as TOML sections
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined) {
      const escapedValue = escapeTomlString(value);
      toml += `${key} = "${escapedValue}"\n`;
    }
  }

  // Add body as a heredoc if non-empty
  if (content.trim()) {
    toml += '\n[body]\n';
    toml += '""" \n';
    toml += content + '\n';
    toml += '"""';
  }

  return toml;
}

module.exports = { escapeTomlString, mdToToml };
