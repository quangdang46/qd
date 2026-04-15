// @ts-nocheck

/**
 * Path transformation utilities for IDE installer standardization
 *
 * Provides utilities to convert hierarchical paths to flat naming conventions.
 *
 * DASH-BASED NAMING (new standard):
 * - Agents: qd-agent-module-name.md (with qd-agent- prefix)
 * - Workflows/Tasks/Tools: qd-module-name.md
 *
 * Example outputs:
 * - bmm/agents/pm.md -> qd-agent-bmm-pm.md
 * - bmm/workflows/plan-project.md -> qd-bmm-plan-project.md
 * - bmm/tasks/create-story.md -> qd-bmm-create-story.md
 * - core/agents/brainstorming.md -> qd-agent-brainstorming.md (core agents skip module name)
 * - standalone/agents/fred.md -> qd-agent-standalone-fred.md
 */

const AGENT_SEGMENT = 'agents';

// QD installation folder name - centralized constant for all installers
const QD_FOLDER_NAME = '_qd';

/**
 * Convert hierarchical path to flat dash-separated name (NEW STANDARD)
 * Converts: 'bmm', 'agents', 'pm' -> 'qd-agent-bmm-pm.md'
 * Converts: 'bmm', 'workflows', 'correct-course' -> 'qd-bmm-correct-course.md'
 * Converts: 'core', 'agents', 'brainstorming' -> 'qd-agent-brainstorming.md' (core agents skip module name)
 * Converts: 'standalone', 'agents', 'fred' -> 'qd-agent-standalone-fred.md'
 *
 * @param {string} module - Module name (e.g., 'bmm', 'core', 'standalone')
 * @param {string} type - Artifact type ('agents', 'workflows', 'tasks', 'tools')
 * @param {string} name - Artifact name (e.g., 'pm', 'brainstorming')
 * @returns {string} Flat filename like 'qd-agent-bmm-pm.md' or 'qd-bmm-correct-course.md'
 */
function toDashName(module, type, name) {
  const isAgent = type === AGENT_SEGMENT;

  // For core module, skip the module name: use 'qd-agent-name.md' instead of 'qd-agent-core-name.md'
  if (module === 'core') {
    return isAgent ? `qd-agent-${name}.md` : `qd-${name}.md`;
  }
  // For standalone module, include 'standalone' in the name
  if (module === 'standalone') {
    return isAgent ? `qd-agent-standalone-${name}.md` : `qd-standalone-${name}.md`;
  }

  // Module artifacts: qd-module-name.md or qd-agent-module-name.md
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- regex replace is intentional here
  const dashName = name.replace(/\//g, '-'); // Flatten nested paths
  return isAgent ? `qd-agent-${module}-${dashName}.md` : `qd-${module}-${dashName}.md`;
}

/**
 * Convert relative path to flat dash-separated name
 * Converts: 'bmm/agents/pm.md' -> 'qd-agent-bmm-pm.md'
 * Converts: 'bmm/agents/tech-writer/tech-writer.md' -> 'qd-agent-bmm-tech-writer.md' (uses folder name)
 * Converts: 'bmm/workflows/correct-course.md' -> 'qd-bmm-correct-course.md'
 * Converts: 'core/agents/brainstorming.md' -> 'qd-agent-brainstorming.md' (core agents skip module name)
 *
 * @param {string} relativePath - Path like 'bmm/agents/pm.md'
 * @returns {string} Flat filename like 'qd-agent-bmm-pm.md' or 'qd-brainstorming.md'
 */
function toDashPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    // Return a safe default for invalid input
    return 'qd-unknown.md';
  }

  // Strip common file extensions to avoid double extensions in generated filenames
  // e.g., 'create-story.xml' -> 'create-story', 'workflow.md' -> 'workflow'
  const withoutExt = relativePath.replace(/\.(md|yaml|yml|json|xml|toml)$/i, '');
  const parts = withoutExt.split(/[/\\]/);

  const module = parts[0];
  const type = parts[1];
  let name;

  // For agents, if nested in a folder (more than 3 parts), use the folder name only
  // e.g., 'bmm/agents/tech-writer/tech-writer' -> 'tech-writer' (not 'tech-writer-tech-writer')
  if (type === 'agents' && parts.length > 3) {
    // Use the folder name (parts[2]) as the name, ignore the file name
    name = parts[2];
  } else {
    // For non-nested or non-agents, join all parts after type
    name = parts.slice(2).join('-');
  }

  return toDashName(module, type, name);
}

/**
 * Create custom agent dash name
 * Creates: 'qd-custom-agent-fred-commit-poet.md'
 *
 * @param {string} agentName - Custom agent name
 * @returns {string} Flat filename like 'qd-custom-agent-fred-commit-poet.md'
 */
function customAgentDashName(agentName) {
  return `qd-custom-agent-${agentName}.md`;
}

/**
 * Check if a filename uses dash format
 * @param {string} filename - Filename to check
 * @returns {boolean} True if filename uses dash format
 */
function isDashFormat(filename) {
  return filename.startsWith('qd-') && filename.includes('-');
}

/**
 * Extract parts from a dash-formatted filename
 * Parses: 'qd-agent-bmm-pm.md' -> { prefix: 'qd', module: 'bmm', type: 'agents', name: 'pm' }
 * Parses: 'qd-bmm-correct-course.md' -> { prefix: 'qd', module: 'bmm', type: 'workflows', name: 'correct-course' }
 * Parses: 'qd-agent-brainstorming.md' -> { prefix: 'qd', module: 'core', type: 'agents', name: 'brainstorming' } (core agents)
 * Parses: 'qd-brainstorming.md' -> { prefix: 'qd', module: 'core', type: 'workflows', name: 'brainstorming' } (core workflows)
 * Parses: 'qd-agent-standalone-fred.md' -> { prefix: 'qd', module: 'standalone', type: 'agents', name: 'fred' }
 * Parses: 'qd-standalone-foo.md' -> { prefix: 'qd', module: 'standalone', type: 'workflows', name: 'foo' }
 *
 * @param {string} filename - Dash-formatted filename
 * @returns {Object|null} Parsed parts or null if invalid format
 */
function parseDashName(filename) {
  const withoutExt = filename.replace('.md', '');
  const parts = withoutExt.split('-');

  if (parts.length < 2 || parts[0] !== 'qd') {
    return null;
  }

  // Check if this is an agent file (has 'agent' as second part)
  const isAgent = parts[1] === 'agent';

  if (isAgent) {
    // This is an agent file
    // Format: qd-agent-name (core) or qd-agent-standalone-name or qd-agent-module-name
    if (parts.length >= 4 && parts[2] === 'standalone') {
      // Standalone agent: qd-agent-standalone-name
      return {
        prefix: parts[0],
        module: 'standalone',
        type: 'agents',
        name: parts.slice(3).join('-'),
      };
    }
    if (parts.length === 3) {
      // Core agent: qd-agent-name
      return {
        prefix: parts[0],
        module: 'core',
        type: 'agents',
        name: parts[2],
      };
    } else {
      // Module agent: qd-agent-module-name
      return {
        prefix: parts[0],
        module: parts[2],
        type: 'agents',
        name: parts.slice(3).join('-'),
      };
    }
  }

  // Not an agent file - must be a workflow/tool/task
  // If only 2 parts (qd-name), it's a core workflow/tool/task
  if (parts.length === 2) {
    return {
      prefix: parts[0],
      module: 'core',
      type: 'workflows', // Default to workflows for non-agent core items
      name: parts[1],
    };
  }

  // Check for standalone non-agent: qd-standalone-name
  if (parts[1] === 'standalone') {
    return {
      prefix: parts[0],
      module: 'standalone',
      type: 'workflows', // Default to workflows for non-agent standalone items
      name: parts.slice(2).join('-'),
    };
  }

  // Otherwise, it's a module workflow/tool/task (qd-module-name)
  return {
    prefix: parts[0],
    module: parts[1],
    type: 'workflows', // Default to workflows for non-agent module items
    name: parts.slice(2).join('-'),
  };
}

/**
 * Resolve the skill name for an artifact.
 * Prefers canonicalId from a qd-skill-manifest.yaml sidecar when available,
 * falling back to the path-derived name from toDashPath().
 *
 * @param {Object} artifact - Artifact object (must have relativePath; may have canonicalId)
 * @returns {string} Filename like 'qd-create-prd.md' or 'qd-agent-bmm-pm.md'
 */
function resolveSkillName(artifact) {
  if (artifact.canonicalId) {
    return `${artifact.canonicalId}.md`;
  }
  return toDashPath(artifact.relativePath);
}

module.exports = {
  toDashName,
  toDashPath,
  resolveSkillName,
  customAgentDashName,
  isDashFormat,
  parseDashName,
  AGENT_SEGMENT,
  QD_FOLDER_NAME,
};
