// @ts-nocheck

/**
 * Phase-based installer for QD artifacts → IDE targets
 * 6-Phase Flow:
 * Phase 1: Collect config from module.yaml (format conversion rules)
 * Phase 2: Detect selected IDEs + load platform-codes.yaml
 * Phase 3: Walk artifacts tree (cascade schema.yaml + apply overrides)
 * Phase 4: Copy/convert to IDE targets (apply mappings, format conversion)
 * Phase 5: Create .qd-output/ directory
 * Phase 6: Display summary
 */

const path = require('node:path');
const fs = require('../../shared/fs-native');
const yaml = require('yaml');
const { loadPlatformCodes } = require('../ide/platform-codes');
const { getProjectRoot } = require('./project-root');
const { Manifest } = require('./manifest');
const { ArtifactResolver } = require('./artifact-resolver');
const { matchGlob } = require('../../helpers/glob');
const { mdToToml, escapeTomlString } = require('../../helpers/toml');
const { mergeAgentsTemplate } = require('../../helpers/agents-merge');
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
    this.artifactsDir = null; // Can be injected for remote artifact installation
    this.ideSourceRoot = null; // Root for artifact walking (artifacts/app-dev/.IDE after entering)
  }

  async install(options = {}) {
    const projectDir = path.resolve(options.directory || process.cwd());
    const autoConfirm = options.autoConfirm || false;

    // Support external artifactsDir (for remote download) or default to local
    this.artifactsDir = options.artifactsDir || path.join(projectDir, 'artifacts');
    this.requestedBundle = options.bundle || null; // CLI override for bundle

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
      // Phase 5: no output folder creation needed — history/ created at runtime
      await this.phase6WriteManifest(projectDir, artifacts, platformConfig);
      await this.phaseAddToGitignore(projectDir);
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
    return this.resolver.getTargetPath(projectDir, ide, artifact, this.platformConfig, this.artifactsDir);
  }

  async phase1CollectConfig(projectDir) {
    let modulePath = path.join(this.artifactsDir, 'module.yaml');
    let config = { convert: {} };

    if (await fs.pathExists(modulePath)) {
      try {
        const content = await fs.readFile(modulePath, 'utf8');
        const rootConfig = yaml.parse(content) || {};

        // If module.yaml has default_bundle or CLI --bundle override, resolve to that bundle's module.yaml
        // CLI --bundle takes precedence over default_bundle in module.yaml
        // Only use default_bundle if CLI --bundle was explicitly provided (not null)
        const bundleName = this.requestedBundle ?? rootConfig.default_bundle;
        // Check bundle root first, then .IDE subdir (where actual bundle configs live)
        let bundlePath = bundleName ? path.join(this.artifactsDir, bundleName, 'module.yaml') : null;
        let bundleConfig = null;
        if (bundlePath && await fs.pathExists(bundlePath)) {
          const bundleContent = await fs.readFile(bundlePath, 'utf8');
          bundleConfig = yaml.parse(bundleContent) || { convert: {} };
        } else if (bundleName) {
          // Fallback: check .IDE subdir for bundle config
          const ideBundlePath = path.join(this.artifactsDir, bundleName, '.IDE', 'module.yaml');
          if (await fs.pathExists(ideBundlePath)) {
            const bundleContent = await fs.readFile(ideBundlePath, 'utf8');
            bundleConfig = yaml.parse(bundleContent) || { convert: {} };
          }
        }
        if (bundleConfig) {
          config = bundleConfig;
          config.bundle = bundleName;
        } else {
          config = rootConfig;
          if (bundleName) config.bundle = bundleName;
        }
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
    const artifactsDir = this.artifactsDir;
    const entries = [];

    if (!(await fs.pathExists(artifactsDir))) {
      throw new Error(`Artifacts directory not found: ${artifactsDir}`);
    }

    await this.walkDir(artifactsDir, artifactsDir, config, entries, config);

    return entries;
  }

  async walkDir(currentPath, artifactsRoot, parentSchema, entries, config) {
    
    const dirents = await fs.readdir(currentPath, { withFileTypes: true });
    let currentSchema = parentSchema;
    

    for (const dirent of dirents) {
      const fullPath = path.join(currentPath, dirent.name);

      // Handle .IDE folder - walk INTO it
      if (dirent.isDirectory() && dirent.name === '.IDE') {
        this.ideSourceRoot = fullPath; // Set IDE source root
        // Set artifactsRoot to .IDE folder so relativePath is computed from .IDE
        await this.walkDir(fullPath, fullPath, parentSchema, entries, config);
        continue;
      }

      // At root level (artifacts/), skip bundle directories that are NOT the selected bundle
      // Also skip any other non-bundle, non-.IDE directories at root (e.g., CCGS Skill Testing Framework)
      // But not when inside .IDE/ itself (where artifactsRoot == currentPath for .IDE's children)
      if (currentPath === artifactsRoot && currentPath !== this.ideSourceRoot && dirent.isDirectory() && dirent.name !== '.IDE') {
        const ideFolder = path.join(fullPath, '.IDE');
        if (await fs.pathExists(ideFolder)) {
          // This is a bundle dir
          const bundleName = this.config?.bundle || this.config?.default_bundle;
          if (bundleName && dirent.name !== bundleName) {
            // Bundle specified but this is not the selected bundle - skip it
            continue;
          } else if (!bundleName) {
            // No bundle specified - skip all bundles at root, use default_bundle if set
            const rootDefault = this.config?.default_bundle;
            if (rootDefault && dirent.name !== rootDefault) {
              continue;
            } else if (!rootDefault) {
              // No default_bundle either - skip all bundle dirs
              continue;
            }
          }
        } else {
          // Non-bundle directory at root level (e.g., CCGS Skill Testing Framework) - skip it
          continue;
        }
      }

      // At bundle root level (e.g., artifacts/game-dev/), only walk .IDE/ subdir
      // Skip everything else (CCGS Skill Testing Framework, docs, etc.)
      if (currentPath !== artifactsRoot && currentPath !== this.ideSourceRoot && dirent.isDirectory() && dirent.name !== '.IDE') {
        const ideFolder = path.join(fullPath, '.IDE');
        if (await fs.pathExists(ideFolder)) {
          // This is a nested .IDE in a subdir of a bundle - skip it
          continue;
        }
        // Non-.IDE subdir in bundle root - skip it (e.g., CCGS Skill Testing Framework in game-dev/)
        // But NOT subdirs inside .IDE/ (they're valid artifact directories)
        if (this.config && this.config.bundle) {
          const parentDir = path.dirname(fullPath);
          const isInsideIdeSource = this.ideSourceRoot && fullPath.startsWith(this.ideSourceRoot + path.sep);
          if (parentDir === path.join(artifactsRoot, this.config.bundle) && !isInsideIdeSource) {
            continue;
          }
        }
      }

      // Skip hidden directories but allow hidden files (e.g., .mcp.json) to be installed
      // Exception: .IDE is the source folder and must be walked
      if (dirent.isDirectory() && dirent.name.startsWith('.') && dirent.name !== '.IDE' && dirent.name !== '.gitkeep') continue;
      if (dirent.name === OUTPUT_FOLDER) continue;

      if (dirent.isDirectory()) {
        // Use module.yaml config for all directories - no subdirectory schema.yaml
        await this.walkDir(fullPath, artifactsRoot, parentSchema, entries, config);
        currentSchema = parentSchema;
      } else if (dirent.isFile()) {
        const skipPatterns = config?.skip || [];
        if (skipPatterns.some(p => matchGlob(p, dirent.name))) continue;

        const fileSchema = currentSchema || { supported_ides: null, ignored_ides: null, overrides: {} };
        const overrideKey = dirent.name;
        const fileOverride = fileSchema.overrides?.[overrideKey];
        const targetIdes = this.resolveTargetIdes(fileSchema, fileOverride);
        let relativePath = path.relative(artifactsRoot, fullPath);
        // Strip bundle prefix from relativePath for bundle-root files (e.g., game-dev/CLAUDE.md -> CLAUDE.md)
        // so they get artifact type 'skills' and are installed at .claude/CLAUDE.md, not .claude/game-dev/
        if (this.config?.bundle && relativePath.startsWith(this.config.bundle + '/')) {
          relativePath = relativePath.slice(this.config.bundle.length + 1);
        }
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
        if (matchGlob(pattern, relativePath)) {
          return { ide, format };
        }
      }
    }

    return null;
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
    // Use ideSourceRoot if set (when inside .IDE/), otherwise artifactsDir
    const sourceRoot = this.ideSourceRoot || this.artifactsDir;
    const typeRootDir = path.join(sourceRoot, artifactType);

    const artifactsDir = this.artifactsDir;

    if (!sourceDir.startsWith(typeRootDir + path.sep) && sourceDir !== typeRootDir) {
      // File in artifacts root (like module.yaml, testfile.md) or in untracked nested dir
      // Check if it's directly in artifacts root (not in any type subdirectory)
      if (sourceDir === artifactsDir) {
        // File at artifacts root level
        const sourceFile = artifact.sourcePath;
        const fileName = path.basename(sourceFile);

        // Special case: AGENTS.template.md → AGENTS.md at project root (smart merge)
        if (fileName === 'AGENTS.template.md') {
          const targetFile = path.join(projectDir, 'AGENTS.md');
          await mergeAgentsTemplate(sourceFile, targetFile);
          return;
        }

        // Copy to IDE target (e.g., .claude/testfile.md)
        const targetFile = path.join(projectDir, target_dir, fileName);
        await fs.copy(sourceFile, targetFile, { overwrite: true });
        return;
      }
      // If sourceDir is ideSourceRoot (.IDE/ dir), copy root files directly to target_dir
      if (this.ideSourceRoot && sourceDir === this.ideSourceRoot) {
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
        const tomlContent = mdToToml(content);
        const targetFile = path.join(targetPath, `${baseName}.toml`);
        await fs.writeFile(targetFile, tomlContent, 'utf8');
      } else {
        const targetFile = path.join(targetPath, fileName);
        await fs.copy(sourceFile, targetFile, { overwrite: true });
      }
      return;
    }

    // Nested skill directory (e.g., artifacts/skills/xia/agents) -> copy entire dir preserving structure
    // Compute the relative path from typeRootDir to preserve nested structure
    const relativeToTypeRoot = path.relative(typeRootDir, sourceDir);
    const destSkillDir = path.join(targetPath, relativeToTypeRoot);

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
        const tomlContent = mdToToml(content);
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
      tomlLines.push(`name = "${escapeTomlString(frontmatter.name)}"`);
    }
    if (frontmatter.description) {
      tomlLines.push(`description = "${escapeTomlString(frontmatter.description)}"`);
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

// Phase 5 intentionally empty — history/ created at runtime, not during install

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
        const sourceRoot = this.ideSourceRoot || this.artifactsDir;
        const typeRootDir = path.join(sourceRoot, artifactType);
        const fileName = path.basename(artifact.sourcePath);
        const baseName = path.basename(fileName, path.extname(fileName));


        let installed;
        // Files at .IDE/ root go directly to target_dir/
        if (!artifact.relativePath.includes('/')) {
          installed = path.join(target_dir, fileName);
        } else if (this.ideSourceRoot && sourceDir === this.ideSourceRoot) {
          // File at IDE source root (.IDE/) -> goes to target_dir/filename
          installed = path.join(target_dir, fileName);
        } else if (sourceDir === typeRootDir) {
          // Direct file in type root (e.g., artifacts/agents/atlas.md)
          if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
            installed = path.join(target_dir, artifactType, `${baseName}.toml`);
          } else {
            installed = path.join(target_dir, artifactType, fileName);
          }
        } else if (sourceDir === path.join(projectDir, 'artifacts') || sourceDir === this.artifactsDir) {
          // File directly at artifacts root -> goes to target_dir/filename
          installed = path.join(target_dir, fileName);
        } else {
          // Nested skill directory
          if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
            installed = path.join(target_dir, artifactType, sourceBasename, `${baseName}.toml`);
          } else {
            installed = path.join(target_dir, artifactType, sourceBasename, fileName);
          }
        }
        const installedDir = this.resolver.getInstalledDir(projectDir, ide, artifact, platformConfig, this.artifactsDir, this.ideSourceRoot);

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
    lines.push('  History/ learn ings created at runtime, not during install');
    lines.push('');
    lines.push('  Get started:');
    lines.push('    1. Launch your AI agent');
    lines.push('    2. QD is ready to use!');

    await prompts.box(lines.join('\n'), 'QD Init Complete', {
      rounded: true,
      formatBorder: color.green,
    });
  }

  async phaseAddToGitignore(projectDir) {
    const gitignorePath = path.join(projectDir, '.gitignore');

    // Get all known IDE target directories from platform config
    const allIdeDirs = Object.values(this.platformConfig.platforms)
      .filter(p => p?.installer?.target_dir)
      .map(p => p.installer.target_dir + '/');

    try {
      let content = '';
      if (await fs.pathExists(gitignorePath)) {
        content = await fs.readFile(gitignorePath, 'utf8');
      }

      const existingLines = content.split('\n').map(l => l.trim()).filter(l => !l.startsWith('#'));
      const toAdd = [];

      // Check each known IDE directory - add if it exists in project AND not in gitignore
      for (const dir of allIdeDirs) {
        const fullPath = path.join(projectDir, dir);
        if (await fs.pathExists(fullPath)) {
          if (!existingLines.includes(dir)) {
            toAdd.push(dir);
          }
        }
      }

      if (toAdd.length > 0) {
        const newLine = content.endsWith('\n') || content === '' ? '' : '\n';
        await fs.writeFile(gitignorePath, content + newLine + toAdd.join('\n') + '\n', 'utf8');
      }
    } catch {
      // Silently ignore gitignore errors
    }
  }

  // Methods needed by status/remove commands
  qdFolderName = '.qd';

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

    // Collect ALL parent directories of installed files for cleanup
    // This includes skill directories (depth > 2) AND artifact type dirs like hooks/ (depth == 2)
    const allParentDirs = new Set();
    const ideRootsToClean = new Set();

    for (const entry of installedFiles) {
      // Remove the file
      const targetPath = path.join(projectDir, entry.installed);
      if (await fs.pathExists(targetPath)) {
        await fs.remove(targetPath);
      }

      // Collect all parent directories of installed files (for depth >= 2 dirs)
      // This ensures nested structure directories are removed even at depth == 2
      if (entry.installedDir) {
        allParentDirs.add(entry.installedDir);
      }

      // Track IDE root
      const parts = entry.installed.split(path.sep);
      ideRootsToClean.add(path.join(projectDir, parts[0]));
    }

    // Remove all parent directories (this handles depth == 2 artifact dirs like .claude/hooks/)
    for (const parentDir of allParentDirs) {
      try {
        if (await fs.pathExists(parentDir)) {
          await fs.remove(parentDir);
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
    // .qd-output is now inside .qd/ folder
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
