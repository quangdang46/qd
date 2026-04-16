// @ts-nocheck

/**
 * Phase-based installer for QD artifacts → IDE targets
 * 6-Phase Flow:
 * Phase 1: Collect config from module.yaml (format conversion rules)
 * Phase 2: Detect selected IDEs + load platform-codes.yaml
 * Phase 3: Walk artifacts tree (cascade schema.yaml + apply overrides)
 * Phase 4: Copy/convert to IDE targets (apply mappings, format conversion)
 * Phase 5: Create _qd-output/ directory
 * Phase 6: Display summary
 */

const path = require('node:path');
const fs = require('../../shared/fs-native');
const yaml = require('yaml');
const { loadPlatformCodes } = require('../ide/platform-codes');
const { getProjectRoot } = require('./project-root');
const { Manifest } = require('./manifest');
const prompts = require('../../shared/prompts');

const OUTPUT_FOLDER = '_qd-output';

class Installer {
  constructor() {
    this.config = null;
    this.platformConfig = null;
    this.selectedIdes = [];
    this.artifacts = [];
    this.results = [];
  }

  async install(options = {}) {
    const projectDir = path.resolve(options.directory || process.cwd());

    try {
      const config = await this.phase1CollectConfig(projectDir);
      const platformConfig = await this.phase2DetectIdes(options.ides || []);
      const artifacts = await this.phase3WalkArtifacts(projectDir, config);
      await this.phase4CopyToTargets(projectDir, platformConfig, artifacts, config);
      await this.phase5CreateOutputDir(projectDir);
      await this.phase6WriteManifest(projectDir, artifacts);
      await this.phase6DisplaySummary(platformConfig);

      return { success: true, projectDir, ides: this.selectedIdes };
    } catch (error) {
      await prompts.log.error(`Installation failed: ${error.message}`);
      throw error;
    }
  }

  async phase1CollectConfig(projectDir) {
    const modulePath = path.join(projectDir, 'artifacts', 'module.yaml');
    let config = { convert: {} };

    if (await fs.pathExists(modulePath)) {
      try {
        const content = await fs.readFile(modulePath, 'utf8');
        config = yaml.parse(content) || { convert: {} };
      } catch (error) {
        await prompts.log.warn(`Warning: Could not read module.yaml: ${error.message}`);
      }
    }

    this.config = config;
    return config;
  }

  async phase2DetectIdes(requestedIdes = []) {
    const platformConfig = await loadPlatformCodes();
    this.platformConfig = platformConfig;

    this.selectedIdes = [];

    for (const ideKey of requestedIdes) {
      const lowerIde = ideKey.toLowerCase();
      const platform = platformConfig.platforms[lowerIde];
      if (platform && platform.installer) {
        this.selectedIdes.push(lowerIde);
      } else {
        await prompts.log.warn(`IDE '${ideKey}' not supported or has no installer config`);
      }
    }

    if (this.selectedIdes.length === 0) {
      throw new Error('No valid IDEs selected');
    }

    return platformConfig;
  }

  async phase3WalkArtifacts(projectDir, config) {
    const artifactsDir = path.join(projectDir, 'artifacts');
    const entries = [];

    if (!(await fs.pathExists(artifactsDir))) {
      throw new Error('artifacts/ directory not found');
    }

    await this.walkDir(artifactsDir, artifactsDir, null, entries, config);
    return entries;
  }

  async walkDir(currentPath, artifactsRoot, parentSchema, entries, config) {
    const dirents = await fs.readdir(currentPath, { withFileTypes: true });
    let currentSchema = parentSchema;

    for (const dirent of dirents) {
      const fullPath = path.join(currentPath, dirent.name);

      if (dirent.name.startsWith('.') && dirent.name !== '.gitkeep') continue;
      if (dirent.name === OUTPUT_FOLDER) continue;

      if (dirent.isDirectory()) {
        const schemaPath = path.join(fullPath, 'schema.yaml');
        if (await fs.pathExists(schemaPath)) {
          currentSchema = await this.readSchema(schemaPath);
        }
        await this.walkDir(fullPath, artifactsRoot, currentSchema, entries, config);
      } else if (dirent.isFile()) {
        if (!dirent.name.endsWith('.md') && !dirent.name.endsWith('.yaml')) continue;
        if (dirent.name === 'schema.yaml') continue;

        const fileSchema = currentSchema || { supported_ides: null, ignored_ides: null, overrides: {} };
        const overrideKey = dirent.name;
        const fileOverride = fileSchema.overrides?.[overrideKey];
        const targetIdes = this.resolveTargetIdes(fileSchema, fileOverride);
        const relativePath = path.relative(artifactsRoot, fullPath);
        const convertFormat = this.getConvertFormat(relativePath, config);

        entries.push({
          sourcePath: fullPath,
          relativePath,
          targetIdes,
          convertFormat,
        });
      }
    }
  }

  async readSchema(schemaPath) {
    try {
      const content = await fs.readFile(schemaPath, 'utf8');
      return yaml.parse(content) || {};
    } catch {
      return {};
    }
  }

  resolveTargetIdes(schema, fileOverride) {
    if (fileOverride && 'supported_ides' in fileOverride && fileOverride.supported_ides) {
      if (fileOverride.supported_ides.length === 0) return [];
      return fileOverride.supported_ides;
    }

    if (schema && schema.supported_ides !== undefined && schema.supported_ides) {
      if (schema.supported_ides.length === 0) return [];
      return schema.supported_ides;
    }

    if (schema && schema.ignored_ides) {
      return this.selectedIdes.filter(ide => !schema.ignored_ides.includes(ide));
    }

    return [...this.selectedIdes];
  }

  getConvertFormat(relativePath, config) {
    const convertRules = config.convert || {};

    for (const [ide, rules] of Object.entries(convertRules)) {
      if (!rules || typeof rules !== 'object') continue;

      for (const [pattern, format] of Object.entries(rules)) {
        if (this.matchGlob(pattern, relativePath)) {
          return { ide, format };
        }
      }
    }

    return null;
  }

  matchGlob(pattern, str) {
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\/{{DOUBLE_STAR}}\//g, '(.*/)?')
      .replace(/\/{{DOUBLE_STAR}}/g, '.*');

    return new RegExp(`^${regex}$`).test(str);
  }

  async phase4CopyToTargets(projectDir, platformConfig, artifacts, config) {
    for (const artifact of artifacts) {
      if (artifact.targetIdes.length === 0) continue;

      for (const ide of artifact.targetIdes) {
        await this.installArtifact(projectDir, ide, platformConfig, artifact, config);
      }
    }
  }

  async installArtifact(projectDir, ide, platformConfig, artifact, config) {
    const platform = platformConfig.platforms[ide];
    if (!platform || !platform.installer) return;

    const { target_dir } = platform.installer;

    // Determine artifact type from relativePath (e.g., "skills/agent-browser/SKILL.md")
    const artifactType = this.getArtifactType(artifact.relativePath);

    // Target path: .claude/<artifactType> (e.g., .claude/skills)
    const targetPath = path.join(projectDir, target_dir, artifactType);
    await fs.ensureDir(targetPath);

    // Source is the directory containing the artifact file
    const sourceDir = path.dirname(artifact.sourcePath);
    const sourceBasename = path.basename(sourceDir);

    // Check if sourceDir is directly the artifact type root (e.g., artifacts/agents)
    // vs a nested skill directory (e.g., artifacts/skills/agent-browser)
    const typeRootDir = path.join(projectDir, 'artifacts', artifactType);

    if (!sourceDir.startsWith(typeRootDir + path.sep) && sourceDir !== typeRootDir) {
      // File at artifacts root (like module.yaml) - skip, not a content artifact
      return;
    }

    if (sourceDir === typeRootDir) {
      // Direct file in type root (e.g., artifacts/agents/atlas.md) -> copy or convert
      const sourceFile = artifact.sourcePath;
      const fileName = path.basename(sourceFile);
      const baseName = path.basename(fileName, path.extname(fileName));

      // Check if format conversion is needed (e.g., codex agents -> toml)
      if (artifact.convertFormat && artifact.convertFormat.ide === ide && artifact.convertFormat.format === 'toml') {
        const content = await fs.readFile(sourceFile, 'utf8');
        const tomlContent = this.mdToToml(content);
        const targetFile = path.join(targetPath, `${baseName}.toml`);
        await fs.writeFile(targetFile, tomlContent, 'utf8');
      } else {
        const targetFile = path.join(targetPath, fileName);
        await fs.copy(sourceFile, targetFile, { overwrite: true });
      }
      return;
    }

    // Nested skill directory (e.g., artifacts/skills/agent-browser) -> copy entire dir
    const destSkillDir = path.join(targetPath, sourceBasename);

    // Clean target skill dir before copy to prevent stale files
    if (await fs.pathExists(destSkillDir)) {
      await fs.remove(destSkillDir);
    }
    await fs.ensureDir(destSkillDir);

    // Apply format conversion if configured for this IDE
    if (artifact.convertFormat && artifact.convertFormat.ide === ide && artifact.convertFormat.format === 'toml') {
      // Convert to TOML: extract frontmatter fields and write TOML file
      const mdFile = path.join(sourceDir, 'SKILL.md');
      if (await fs.pathExists(mdFile)) {
        const content = await fs.readFile(mdFile, 'utf8');
        const tomlContent = this.mdToToml(content);
        const baseName = path.basename(mdFile, '.md');
        const targetFile = path.join(destSkillDir, `${baseName}.toml`);
        await fs.writeFile(targetFile, tomlContent, 'utf8');
      }
    } else {
      // Copy all files in skill directory, filtering OS/editor artifacts
      const skipPatterns = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
      const skipSuffixes = ['~', '.swp', '.swo', '.bak'];
      const filter = (src) => {
        const name = path.basename(src);
        if (src === sourceDir) return true;
        if (skipPatterns.has(name)) return false;
        if (name.startsWith('.') && name !== '.gitkeep') return false;
        if (skipSuffixes.some((s) => name.endsWith(s))) return false;
        return true;
      };
      await fs.copy(sourceDir, destSkillDir, { filter, overwrite: true });
    }
  }

  getArtifactType(relativePath) {
    const parts = relativePath.split(path.sep);
    if (parts.length > 1 && ['skills', 'commands', 'agents', 'subagents'].includes(parts[0])) {
      return parts[0];
    }
    return 'skills';
  }

  changeExtension(filename, newExt) {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return `${filename}.${newExt}`;
    return `${filename.slice(0, lastDot)}.${newExt}`;
  }

  mdToToml(mdContent) {
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

    const tomlLines = [];

    // Add frontmatter fields (required for Codex subagents)
    if (frontmatter.name) {
      tomlLines.push(`name = "${frontmatter.name}"`);
    }
    if (frontmatter.description) {
      tomlLines.push(`description = "${frontmatter.description}"`);
    }
    if (frontmatter.name || frontmatter.description) {
      tomlLines.push('');
    }

    // Process markdown content
    const lines = content.split('\n');
    let inSection = null;

    for (const line of lines) {
      if (line.startsWith('# ')) {
        // Main title - use as developer_instructions header
        if (tomlLines.length > 0 && tomlLines[tomlLines.length - 1] !== '') {
          tomlLines.push('');
        }
        tomlLines.push('# ' + line.slice(2).trim());
      } else if (line.startsWith('## ')) {
        const sectionName = line.slice(3).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        if (sectionName) {
          tomlLines.push(`[${sectionName}]`);
          inSection = sectionName;
        }
      } else if (line.trim() && inSection) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('```') && !trimmed.startsWith('|')) {
          tomlLines.push(`${inSection}.${trimmed}`);
        }
      }
    }

    return tomlLines.join('\n');
  }

  async phase5CreateOutputDir(projectDir) {
    const outputPath = path.join(projectDir, OUTPUT_FOLDER);
    await fs.ensureDir(outputPath);
    await fs.ensureDir(path.join(outputPath, 'learnings'));
  }

  async phase6WriteManifest(projectDir, artifacts) {
    const { qdDir } = await this.findQdDir(projectDir);
    await fs.ensureDir(path.join(qdDir, '_config'));

    const manifest = new Manifest();
    const artifactEntries = [];

    for (const artifact of artifacts) {
      if (artifact.targetIdes.length === 0) continue;

      for (const ide of artifact.targetIdes) {
        const platform = this.platformConfig?.platforms?.[ide];
        if (!platform?.installer) continue;

        const { target_dir } = platform.installer;
        const artifactType = this.getArtifactType(artifact.relativePath);
        const targetPath = path.join(projectDir, target_dir, artifactType);

        // Determine actual installed file path (may have different extension for TOML)
        const sourceFile = artifact.sourcePath;
        const fileName = path.basename(sourceFile);
        const baseName = path.basename(fileName, path.extname(fileName));
        let installedFile;

        if (artifact.convertFormat && artifact.convertFormat.ide === ide && artifact.convertFormat.format === 'toml') {
          installedFile = path.join(targetPath, `${baseName}.toml`);
        } else {
          installedFile = path.join(targetPath, fileName);
        }

        // Store relative path from projectDir for portability
        const relativeInstalledPath = path.relative(projectDir, installedFile);

        artifactEntries.push({
          source: artifact.relativePath,
          installed: relativeInstalledPath,
          ide,
          artifactType,
        });
      }
    }

    await manifest.write(qdDir, {
      version: '1.0.0',
      installDate: new Date().toISOString(),
      ides: this.selectedIdes,
      artifacts: artifactEntries,
    });
  }

  async phase6DisplaySummary(platformConfig) {
    const color = await prompts.getColor();

    const lines = [];
    lines.push('');
    lines.push(`  Selected IDEs: ${this.selectedIdes.join(', ')}`);

    const ideTargets = [];
    for (const ide of this.selectedIdes) {
      const platform = platformConfig.platforms[ide];
      if (platform?.installer?.target_dir) {
        const star = platform.preferred ? ' ★' : '';
        ideTargets.push(`${platform.name}${star} → ${platform.installer.target_dir}`);
      }
    }

    if (ideTargets.length > 0) {
      lines.push('');
      lines.push('  Target directories:');
      for (const target of ideTargets) {
        lines.push(`    ${target}`);
      }
    }

    lines.push('');
    lines.push(`  Output folder: ${OUTPUT_FOLDER}/`);
    lines.push('');
    lines.push('  Get started:');
    lines.push('    1. Launch your AI agent');
    lines.push('    2. QD is ready to use!');

    await prompts.box(lines.join('\n'), 'QD Init Complete', {
      rounded: true,
      formatBorder: color.green,
    });
  }

  // Methods needed by status/uninstall commands
  qdFolderName = '_qd';

  async findQdDir(projectDir) {
    return { qdDir: path.join(projectDir, this.qdFolderName) };
  }

  async getStatus(projectDir) {
    const { qdDir } = await this.findQdDir(projectDir);
    const exists = await fs.pathExists(qdDir);

    if (!exists) {
      return {
        installed: false,
        version: '1.0.0',
        moduleIds: [],
        ides: [],
      };
    }

    const manifest = new Manifest();
    const manifestData = await manifest.read(qdDir);

    return {
      installed: true,
      version: manifestData?.installation?.version || '1.0.0',
      moduleIds: [],
      ides: manifestData?.ides || [],
    };
  }

  async getOutputFolder(projectDir) {
    return OUTPUT_FOLDER;
  }

  async uninstallIdeConfigs(projectDir, existingInstall, options) {
    const { qdDir } = await this.findQdDir(projectDir);
    const manifest = new Manifest();
    const manifestData = await manifest.read(qdDir);

    // Use IDEs from manifest if available, otherwise fall back to existingInstall
    const ides = manifestData?.ides || existingInstall?.ides || [];
    const installedFiles = manifestData?.artifacts || [];

    // Only delete files that QD actually installed (from manifest)
    // This preserves user's custom files in the same directories
    for (const entry of installedFiles) {
      const targetPath = path.join(projectDir, entry.installed);
      if (await fs.pathExists(targetPath)) {
        await fs.remove(targetPath);
      }
    }

    // Clean up empty artifact type directories after removing files
    const platformConfig = await loadPlatformCodes();
    const cleanedDirs = new Set();

    for (const entry of installedFiles) {
      const dir = path.dirname(path.join(projectDir, entry.installed));
      if (!cleanedDirs.has(dir)) {
        cleanedDirs.add(dir);
        // Only remove if it's an artifact type directory and empty
        const artifactTypes = ['skills', 'commands', 'agents', 'subagents'];
        const dirName = path.basename(dir);
        if (artifactTypes.includes(dirName)) {
          try {
            const entries = await fs.readdir(dir);
            if (entries.length === 0) {
              await fs.remove(dir);
            }
          } catch {
            // Ignore errors - directory might not exist or not be empty
          }
        }
      }
    }
  }

  async uninstallOutputFolder(projectDir, outputFolder) {
    // TODO: implement
  }

  async uninstallModules(projectDir) {
    const { qdDir } = await this.findQdDir(projectDir);
    if (await fs.pathExists(qdDir)) {
      await fs.remove(qdDir);
    }
  }
}

module.exports = { Installer };
