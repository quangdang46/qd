/**
 * Artifact Resolver
 * Handles artifact type detection and target path calculation
 * Artifact type is the first directory segment in the relative path
 */

const path = require('node:path');
const fs = require('../../shared/fs-native');

export class ArtifactResolver {
  /**
   * Get artifact type from relative path
   * First segment is the type (e.g., "skills/agent-browser/SKILL.md" → "skills")
   * Files at root go to "skills" by default
   */
  getArtifactType(relativePath) {
    // Always use forward slash since artifact relativePaths always use '/'
    // regardless of OS (paths in artifacts are arch-neutral)
    const parts = relativePath.split('/');
    if (parts.length > 1) {
      return parts[0];
    }
    return 'skills';
  }

  /**
   * Calculate target path for an artifact
   * Returns the full path where the file should be installed
   */
  getTargetPath(projectDir, ide, artifact, platformConfig, artifactsDir) {
    const platform = platformConfig.platforms[ide];
    const { target_dir } = platform.installer;
    const artifactType = this.getArtifactType(artifact.relativePath);
    const actualArtifactsDir = artifactsDir || path.join(projectDir, 'artifacts');
    const targetBase = path.join(projectDir, target_dir, artifactType);

    const sourceDir = path.dirname(artifact.sourcePath);
    const typeRootDir = path.join(actualArtifactsDir, artifactType);

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
  getInstalledPath(projectDir, ide, artifact, platformConfig, artifactsDir, ideSourceRoot) {
    const platform = platformConfig.platforms[ide];
    const { target_dir } = platform.installer;
    const artifactType = this.getArtifactType(artifact.relativePath);
    const sourceDir = path.dirname(artifact.sourcePath);
    const sourceBasename = path.basename(sourceDir);
    const actualArtifactsDir = ideSourceRoot || artifactsDir || path.join(projectDir, 'artifacts');
    const typeRootDir = path.join(actualArtifactsDir, artifactType);
    const fileName = path.basename(artifact.sourcePath);
    const baseName = path.basename(fileName, path.extname(fileName));

    if (sourceDir === typeRootDir) {
      if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
        return path.join(target_dir, artifactType, `${baseName}.toml`);
      }
      return path.join(target_dir, artifactType, fileName);
    }

    if (sourceDir === actualArtifactsDir) {
      return path.join(target_dir, fileName);
    }

    if (artifact.convertFormat?.ide === ide && artifact.convertFormat?.format === 'toml') {
      return path.join(target_dir, artifactType, sourceBasename, `${baseName}.toml`);
    }
    return path.join(target_dir, artifactType, sourceBasename, fileName);
  }

  /**
   * Determine installedDir for manifest (parent directory of installed file)
   */
  getInstalledDir(projectDir, ide, artifact, platformConfig, artifactsDir, ideSourceRoot) {
    const platform = platformConfig.platforms[ide];
    const { target_dir } = platform.installer;
    const artifactType = this.getArtifactType(artifact.relativePath);
    const sourceDir = path.dirname(artifact.sourcePath);
    const sourceBasename = path.basename(sourceDir);
    const actualArtifactsDir = ideSourceRoot || artifactsDir || path.join(projectDir, 'artifacts');
    const typeRootDir = path.join(actualArtifactsDir, artifactType);

    if (sourceDir === actualArtifactsDir) {
      return path.join(projectDir, target_dir);
    }

    if (sourceDir !== typeRootDir) {
      return path.join(projectDir, target_dir, artifactType, sourceBasename);
    }

    return path.join(projectDir, target_dir, artifactType);
  }

  /**
   * Check if source path is valid artifact location
   */
  isValidArtifactLocation(sourceDir, projectDir, artifactType, artifactsDir) {
    const typeRootDir = (artifactsDir ? path.join(artifactsDir, artifactType) : path.join(projectDir, 'artifacts', artifactType));
    const artifactsRootDir = artifactsDir || path.join(projectDir, 'artifacts');
    return sourceDir.startsWith(typeRootDir + path.sep) || sourceDir === typeRootDir || sourceDir === artifactsRootDir;
  }
}

module.exports = { ArtifactResolver };