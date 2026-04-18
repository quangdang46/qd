/**
 * Glob matching utility
 */

function matchGlob(pattern, str) {
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
