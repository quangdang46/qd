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
const { ArtifactResolver } = require('./artifact-resolver');
const prompts = require('../../shared/prompts');

const OUTPUT_FOLDER = 'learnings';

class Installer {
  constructor() {
    this.config = null;
    this.platformConfig = null;
    this.selectedIdes = [];
    this.artifacts = [];
    this.results = [];
    this.resolver = new ArtifactResolver();
  }

  async install(options = {}) {
    const projectDir = path.resolve(options.directory || process.cwd());
    const autoConfirm = options.autoConfirm || false;

    try {
      const config = await this.phase1CollectConfig(projectDir);
      const platformConfig = await this.phase2DetectIdes(options.ides || []);
      const artifacts = await this.phase3WalkArtifacts(projectDir, config);

      // Check for existing files before copying
      const conflicts = await this.findConflicts(projectDir, platformConfig, artifacts);
      if (conflicts.length > 0) {
        if (!autoConfirm) {
          await prompts.note(
            conflicts.slice(0, 10).join('\n') + (conflicts.length > 10 ? `\n... and ${conflicts.length - 10} more` : ''),
            `Found ${conflicts.length} existing file(s)`
          );
          const confirmed = await prompts.confirm({
            message: 'Overwrite existing files?',
            initialValue: false,
          });
          if (!confirmed) {
            await prompts.log.info('Installation cancelled');
            return { success: false, projectDir, ides: this.selectedIdes };
          }
        }
      }

      await this.phase4CopyToTargets(projectDir, platformConfig, artifacts, config);
      await this.phase5CreateOutputDir(projectDir);
      await this.phase6WriteManifest(projectDir, artifacts, platformConfig);
      await this.phase6DisplaySummary(platformConfig);

      return { success: true, projectDir, ides: this.selectedIdes };
    } catch (error) {
      await prompts.log.error(`Installation failed: ${error.message}`);
      throw error;
    }
  }

  async findConflicts(projectDir, platformConfig, artifacts) {
    const conflicts = [];
    for (const artifact of artifacts) {
      if (artifact.targetIdes.length === 0) continue;
      for (const ide of artifact.targetIdes) {
        // Only check conflicts for IDEs being installed now
        if (!this.selectedIdes.includes(ide)) continue;
        const platform = platformConfig.platforms[ide];
        if (!platform?.installer) continue;
        const targetPath = this.getTargetPath(projectDir, ide, artifact);
        if (await fs.pathExists(targetPath)) {
          conflicts.push(path.relative(projectDir, targetPath));
        }
      }
    }
    return conflicts;
  }

  getTargetPath(projectDir, ide, artifact) {
    return this.resolver.getTargetPath(projectDir, ide, artifact, this.platformConfig);
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

    await this.walkDir(artifactsDir, artifactsDir, config, entries, config);

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
        // Use module.yaml config for all directories - no subdirectory schema.yaml
        await this.walkDir(fullPath, artifactsRoot, parentSchema, entries, config);
        currentSchema = parentSchema;
      } else if (dirent.isFile()) {
        if (dirent.name.endsWith('.example.yaml')) continue;
        if (dirent.name === 'module.yaml') continue;
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

  resolveTargetIdes(schema, fileOverride) {
    if (fileOverride && 'supported_ides' in fileOverride && fileOverride.supported_ides) {
      if (fileOverride.supported_ides.length === 0) return [];
      // Override must intersect with user's selected IDEs
      return fileOverride.supported_ides.filter(ide => this.selectedIdes.includes(ide));
    }

    if (schema && schema.supported_ides !== undefined && schema.supported_ides) {
      if (schema.supported_ides.length === 0) return [];
      // Intersect with user's selected IDEs (not override, just filter)
      return schema.supported_ides.filter(ide => this.selectedIdes.includes(ide));
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

    const artifactsDir = path.join(projectDir, 'artifacts');

    if (!sourceDir.startsWith(typeRootDir + path.sep) && sourceDir !== typeRootDir) {
      // File in artifacts root (like module.yaml, testfile.md) or in untracked nested dir
      // Check if it's directly in artifacts root (not in any type subdirectory)
      if (sourceDir === artifactsDir) {
        // File at artifacts root level - copy to IDE root directly (e.g., .claude/testfile.md)
        const sourceFile = artifact.sourcePath;
        const fileName = path.basename(sourceFile);
        const targetFile = path.join(projectDir, target_dir, fileName);
        await fs.copy(sourceFile, targetFile, { overwrite: true });
        return;
      }
      // File in a nested directory that doesn't match any artifact type
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
    return this.resolver.getArtifactType(relativePath);
  }

  escapeTomlString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
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

    // Required fields for Codex subagents
    if (frontmatter.name) {
      tomlLines.push(`name = "${this.escapeTomlString(frontmatter.name)}"`);
    }
    if (frontmatter.description) {
      tomlLines.push(`description = "${this.escapeTomlString(frontmatter.description)}"`);
    }

    // developer_instructions is REQUIRED - collect all markdown content
    const sections = [];
    let currentSection = null;
    let sectionContent = [];

    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentSection) {
          sections.push({ name: currentSection, content: sectionContent.join('\n').trim() });
        }
        currentSection = line.slice(3).trim();
        sectionContent = [];
      } else if (currentSection) {
        sectionContent.push(line);
      }
    }
    // Save last section
    if (currentSection) {
      sections.push({ name: currentSection, content: sectionContent.join('\n').trim() });
    }

    // Build developer_instructions block
    if (sections.length > 0) {
      const devInstructions = sections.map(s => {
        const lines2 = s.content.split('\n');
        const indented = lines2.map(l => `  ${l}`).join('\n');
        return `[${s.name}]\n${indented}`;
      }).join('\n\n');

      tomlLines.push('');
      tomlLines.push('[developer_instructions]');
      tomlLines.push('developer_instructions = """');
      tomlLines.push(devInstructions);
      tomlLines.push('"""');
    }

    return tomlLines.join('\n');
  }

  async phase5CreateOutputDir(projectDir) {
    const { qdDir } = await this.findQdDir(projectDir);
    await fs.ensureDir(path.join(qdDir, OUTPUT_FOLDER));
  }

  async phase6WriteManifest(projectDir, artifacts, platformConfig) {
    const { qdDir } = await this.findQdDir(projectDir);
    await fs.ensureDir(path.join(qdDir, '_config'));

    const manifest = new Manifest();
    const existingManifest = await manifest.read(qdDir);
    const existingIdes = existingManifest?.ides || [];
    const existingArtifacts = existingManifest?.artifacts || [];

    // Merge IDEs: keep old ones + add new ones
    const allIdes = [...new Set([...existingIdes, ...this.selectedIdes])];

    // Replace artifacts for current IDEs (remove old, add new)
    const currentIdeArtifacts = [];
    for (const artifact of artifacts) {
      if (artifact.targetIdes.length === 0) continue;
      for (const ide of artifact.targetIdes) {
        const platform = platformConfig.platforms[ide];
        if (!platform?.installer) continue;
        const { target_dir } = platform.installer;
        const artifactType = this.getArtifactType(artifact.relativePath);
        const sourceDir = path.dirname(artifact.sourcePath);
        const sourceBasename = path.basename(sourceDir);
        const typeRootDir = path.join(projectDir, 'artifacts', artifactType);
        const fileName = path.basename(artifact.sourcePath);
        const baseName = path.basename(fileName, path.extname(fileName));


        let installed;
        if (sourceDir === typeRootDir) {
          // Direct file in type root (e.g., artifacts/agents/atlas.md)
          if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
            installed = path.join(target_dir, artifactType, `${baseName}.toml`);
          } else {
            installed = path.join(target_dir, artifactType, fileName);
          }
        } else if (sourceDir === path.join(projectDir, 'artifacts')) {
          // File directly at artifacts root (e.g., testfile.md) -> goes to target_dir/filename
          installed = path.join(target_dir, fileName);
        } else {
          // Nested skill directory
          if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
            installed = path.join(target_dir, artifactType, sourceBasename, `${baseName}.toml`);
          } else {
            installed = path.join(target_dir, artifactType, sourceBasename, fileName);
          }
        }
        const installedDir = this.resolver.getInstalledDir(projectDir, ide, artifact, platformConfig);

        currentIdeArtifacts.push({
          source: artifact.relativePath,
          installed,
          installedDir,
          ide,
          artifactType,
        });
      }
    }

    // Remove old artifacts for current IDEs, keep others
    const artifactEntries = existingArtifacts.filter(a => !this.selectedIdes.includes(a.ide));
    artifactEntries.push(...currentIdeArtifacts);

    await manifest.write(qdDir, {
      version: '1.0.0',
      installDate: new Date().toISOString(),
      ides: allIdes,
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

  // Methods needed by status/remove commands
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

    // Collect skill-level directories to remove (e.g., .claude/hooks/docs, .claude/skills/agent-browser)
    // This ensures ALL files in that skill directory are removed, including duplicates not in manifest
    const skillDirsToRemove = new Set();
    const ideRootsToClean = new Set();

    for (const entry of installedFiles) {
      // Remove the file
      const targetPath = path.join(projectDir, entry.installed);
      if (await fs.pathExists(targetPath)) {
        await fs.remove(targetPath);
      }

      // Use installedDir from manifest - it already contains the correct skill-level directory
      // e.g., for .claude/hooks/notifications/lib/env-loader.cjs, installedDir is .claude/hooks/notifications
      // Only add if it's a nested directory (depth > 2), not the type root itself
      // Type root deletion would delete ALL content including user's custom skills
      if (entry.installedDir) {
        const relDir = path.relative(projectDir, entry.installedDir);
        const depth = relDir.split(path.sep).length;
        if (depth > 2) {
          skillDirsToRemove.add(entry.installedDir);
        }
      }

      // Track IDE root
      const parts = entry.installed.split(path.sep);
      ideRootsToClean.add(path.join(projectDir, parts[0]));
    }

    // Remove all skill-level directories (this removes duplicates and all nested content)
    for (const skillDir of skillDirsToRemove) {
      try {
        if (await fs.pathExists(skillDir)) {
          await fs.remove(skillDir);
        }
      } catch {
        // Ignore errors
      }
    }

    // Clean up intermediate empty directories (e.g., .claude/skills/ after removing nested skills)
    for (const ideRoot of ideRootsToClean) {
      try {
        if (await fs.pathExists(ideRoot)) {
          const cleanEmptyDirs = async (dir) => {
            const items = await fs.readdir(dir);
            for (const item of items) {
              const fullPath = path.join(dir, item);
              const stat = await fs.stat(fullPath);
              if (stat.isDirectory()) {
                await cleanEmptyDirs(fullPath);
                // Check if now empty after cleaning children
                const remaining = await fs.readdir(fullPath);
                if (remaining.length === 0) {
                  await fs.remove(fullPath);
                }
              }
            }
          };
          await cleanEmptyDirs(ideRoot);
          // Final check: remove IDE root if empty
          const rootItems = await fs.readdir(ideRoot);
          if (rootItems.length === 0) {
            await fs.remove(ideRoot);
          }
        }
      } catch {
        // Ignore errors
      }
    }
  }

  async uninstallOutputFolder(projectDir, outputFolder) {
    // _qd-output is now inside _qd/ folder
    const { qdDir } = await this.findQdDir(projectDir);
    const outputPath = path.join(qdDir, outputFolder);
    if (await fs.pathExists(outputPath)) {
      await fs.remove(outputPath);
    }
  }

  async uninstallModules(projectDir) {
    const { qdDir } = await this.findQdDir(projectDir);
    if (await fs.pathExists(qdDir)) {
      await fs.remove(qdDir);
    }
  }
}

module.exports = { Installer };
