import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { shouldExcludeFromRelease } from './release-config.mjs';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsRoot, '..');
const releaseRoot = path.join(repoRoot, 'release');

const packageJson = JSON.parse(await fsp.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
const releaseVersion = packageJson.version || '0.0.0';
const zipName = `VXStudio-${releaseVersion}-source.zip`;
const zipPath = path.join(releaseRoot, zipName);

const addDirectoryToArchive = async (archive, absoluteDir, relativeDir = '') => {
  const entries = await fsp.readdir(absoluteDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const nextRelativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

    if (shouldExcludeFromRelease(nextRelativePath)) {
      continue;
    }

    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      await addDirectoryToArchive(archive, absolutePath, nextRelativePath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    archive.file(absolutePath, { name: nextRelativePath.split(path.sep).join('/') });
  }
};

const ensureReleaseDirectory = async () => {
  await fsp.mkdir(releaseRoot, { recursive: true });
  await fsp.rm(zipPath, { force: true });
};

const createArchive = async () =>
  new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(archive.pointer()));
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);

    addDirectoryToArchive(archive, repoRoot)
      .then(() => archive.finalize())
      .catch(reject);
  });

const main = async () => {
  await ensureReleaseDirectory();
  const totalBytes = await createArchive();
  console.log(`[package-source] Created ${zipName} (${Math.ceil(totalBytes / 1024)} KB).`);
  console.log(`[package-source] Output: ${zipPath}`);
};

main().catch(error => {
  console.error('[package-source] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
