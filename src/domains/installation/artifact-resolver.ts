/**
 * Artifact Resolver
 * Handles artifact type detection and target path calculation
 */

const path = require('node:path');
const fs = require('../../shared/fs-native');

const ARTIFACT_TYPES = ['skills', 'commands', 'agents', 'subagents', 'hooks', 'rules', 'output-styles'];

export class ArtifactResolver {
  /**
   * Get artifact type from relative path
   * e.g., "skills/agent-browser/SKILL.md" → "skills"
   * e.g., "testfile.md" → "skills" (default)
   */
  getArtifactType(relativePath) {
    const parts = relativePath.split(path.sep);
    if (parts.length > 1 && ARTIFACT_TYPES.includes(parts[0])) {
      return parts[0];
    }
    return 'skills';
  }

  /**
   * Calculate target path for an artifact
   * Returns the full path where the file should be installed
   */
  getTargetPath(projectDir, ide, artifact, platformConfig) {
    const platform = platformConfig.platforms[ide];
    const { target_dir } = platform.installer;
    const artifactType = this.getArtifactType(artifact.relativePath);
    const targetBase = path.join(projectDir, target_dir, artifactType);

    const sourceDir = path.dirname(artifact.sourcePath);
    const typeRootDir = path.join(projectDir, 'artifacts', artifactType);

    if (sourceDir === typeRootDir) {
      const fileName = path.basename(artifact.sourcePath);
      const baseName = path.basename(fileName, path.extname(fileName));
      if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
        return path.join(targetBase, `${baseName}.toml`);
      }
      return path.join(targetBase, fileName);
    }

    const sourceBasename = path.basename(sourceDir);
    return path.join(targetBase, sourceBasename);
  }

  /**
   * Determine installed path for manifest (relative to project)
   */
  getInstalledPath(projectDir, ide, artifact, platformConfig) {
    const platform = platformConfig.platforms[ide];
    const { target_dir } = platform.installer;
    const artifactType = this.getArtifactType(artifact.relativePath);
    const sourceDir = path.dirname(artifact.sourcePath);
    const sourceBasename = path.basename(sourceDir);
    const typeRootDir = path.join(projectDir, 'artifacts', artifactType);
    const fileName = path.basename(artifact.sourcePath);
    const baseName = path.basename(fileName, path.extname(fileName));

    if (sourceDir === typeRootDir) {
      // Direct file in type root (e.g., artifacts/agents/atlas.md)
      if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
        return path.join(target_dir, artifactType, `${baseName}.toml`);
      }
      return path.join(target_dir, artifactType, fileName);
    }

    if (sourceDir === path.join(projectDir, 'artifacts')) {
      // File at artifacts root (e.g., testfile.md) → IDE root
      return path.join(target_dir, fileName);
    }

    // Nested skill directory
    if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
      return path.join(target_dir, artifactType, sourceBasename, `${baseName}.toml`);
    }
    return path.join(target_dir, artifactType, sourceBasename, fileName);
  }

  /**
   * Determine installedDir for manifest (parent directory of installed file)
   */
  getInstalledDir(projectDir, ide, artifact, platformConfig) {
    const platform = platformConfig.platforms[ide];
    const { target_dir } = platform.installer;
    const artifactType = this.getArtifactType(artifact.relativePath);
    const sourceDir = path.dirname(artifact.sourcePath);
    const sourceBasename = path.basename(sourceDir);
    const typeRootDir = path.join(projectDir, 'artifacts', artifactType);
    const artifactsDir = path.join(projectDir, 'artifacts');

    // File at artifacts root → IDE root directory
    if (sourceDir === artifactsDir) {
      return path.join(projectDir, target_dir);
    }

    // Nested skill directory → skill-level directory
    if (sourceDir !== typeRootDir) {
      return path.join(projectDir, target_dir, artifactType, sourceBasename);
    }

    // Direct file in type root → type root directory
    return path.join(projectDir, target_dir, artifactType);
  }

  /**
   * Check if source path is valid artifact location
   */
  isValidArtifactLocation(sourceDir, projectDir, artifactType) {
    const typeRootDir = path.join(projectDir, 'artifacts', artifactType);
    const artifactsDir = path.join(projectDir, 'artifacts');
    return sourceDir.startsWith(typeRootDir + path.sep) || sourceDir === typeRootDir || sourceDir === artifactsDir;
  }
}

module.exports = { ArtifactResolver };
