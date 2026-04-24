import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  forbiddenManifestPatterns,
  normalizeRelativePath,
  releaseReportPaths,
  requiredProjectFiles,
} from './release-config.mjs';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsRoot, '..');

const npmCommand = 'npm';

const readText = async relativePath =>
  fs.readFile(path.join(repoRoot, relativePath), 'utf8');

const ensureRequiredFiles = async () => {
  const missing = [];

  for (const relativePath of requiredProjectFiles) {
    try {
      await fs.access(path.join(repoRoot, relativePath));
    } catch {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`[preflight] Missing required project files:\n- ${missing.join('\n- ')}`);
  }
};

const scanManifestForInvalidReferences = async relativePath => {
  const content = await readText(relativePath);
  const matchedPattern = forbiddenManifestPatterns.find(pattern => pattern.test(content));

  if (!matchedPattern) {
    return;
  }

  throw new Error(
    `[preflight] Forbidden local dependency or absolute path reference found in ${relativePath}. Remove file: dependencies or local absolute paths before delivery.`
  );
};

const reportWorkspaceArtifacts = async () => {
  const foundArtifacts = [];

  for (const relativePath of releaseReportPaths) {
    try {
      await fs.access(path.join(repoRoot, relativePath));
      foundArtifacts.push(normalizeRelativePath(relativePath));
    } catch {
      // ignore
    }
  }

  const logFiles = [];
  const topLevelEntries = await fs.readdir(repoRoot, { withFileTypes: true });
  for (const entry of topLevelEntries) {
    if (entry.isFile() && /\.log$/i.test(entry.name)) {
      logFiles.push(entry.name);
    }
  }

  if (foundArtifacts.length === 0 && logFiles.length === 0) {
    console.log('[preflight] Workspace artifacts: clean.');
    return;
  }

  console.log('[preflight] Workspace artifacts found (will be excluded from source zip):');
  for (const artifact of foundArtifacts) {
    console.log(`  - ${artifact}`);
  }
  for (const logFile of logFiles) {
    console.log(`  - ${logFile}`);
  }
};

const runCommand = (command, args, cwd, label) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`[preflight] ${label} failed with exit code ${code}.`));
    });
  });

const main = async () => {
  console.log('[preflight] Checking required files...');
  await ensureRequiredFiles();

  console.log('[preflight] Checking package manifests for local path pollution...');
  await scanManifestForInvalidReferences('package.json');
  await scanManifestForInvalidReferences('server/package.json');
  await scanManifestForInvalidReferences('package-lock.json');
  await scanManifestForInvalidReferences('server/package-lock.json');

  await reportWorkspaceArtifacts();

  console.log('[preflight] Building frontend...');
  await runCommand(npmCommand, ['run', 'build'], repoRoot, 'frontend build');

  console.log('[preflight] Building backend...');
  await runCommand(npmCommand, ['--prefix', 'server', 'run', 'build'], repoRoot, 'backend build');

  console.log('[preflight] Delivery preflight passed.');
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
