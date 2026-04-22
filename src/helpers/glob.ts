/**
 * Glob matching utility
 */

function matchGlob(pattern, str) {
  // Leading * means "ends with"
  if (pattern.startsWith('*')) {
    const suffix = pattern.slice(1).replace(/\./g, '\\.').replace(/\*/g, '\\*');
    return new RegExp(`${suffix}$`).test(str);
  }

  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\/{{DOUBLE_STAR}}\//g, '(.*/)?')
    .replace(/\/{{DOUBLE_STAR}}/g, '.*');

  return new RegExp(`^${regex}$`).test(str);
}

module.exports = { matchGlob };
