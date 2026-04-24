import path from 'path';

export const requiredProjectFiles = [
  'package.json',
  'package-lock.json',
  'README.md',
  'IMPLEMENTATION_GUIDE.md',
  '.gitignore',
  '.env.example',
  'server/package.json',
  'server/package-lock.json',
  'server/.env.example',
  'server/sql/init.sql',
  'src/main.tsx',
  'server/src/index.ts',
];

export const forbiddenManifestPatterns = [
  /"file:/i,
  /[A-Za-z]:\\\\/i,
];

export const releaseExcludedDirectories = new Set([
  '.git',
  '.vite',
  '.turbo',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'coverage',
  'release',
]);

export const releaseExcludedRelativePaths = new Set([
  'server/node_modules',
  'server/dist',
]);

export const releaseExcludedFilePatterns = [
  /\.log$/i,
  /\.tmp$/i,
  /\.cache$/i,
  /\.zip$/i,
  /Thumbs\.db$/i,
  /\.DS_Store$/i,
];

export const releaseSecretRelativePaths = new Set([
  '.env',
  '.env.local',
  'server/.env',
]);

export const releaseReportPaths = [
  'node_modules',
  'server/node_modules',
  'dist',
  'server/dist',
  '.vite',
  '.turbo',
  'release',
];

export const normalizeRelativePath = targetPath => targetPath.split(path.sep).join('/');

export const shouldExcludeFromRelease = relativePath => {
  const normalized = normalizeRelativePath(relativePath).replace(/^\.\/+/u, '');

  if (!normalized) {
    return false;
  }

  if (releaseExcludedRelativePaths.has(normalized) || releaseSecretRelativePaths.has(normalized)) {
    return true;
  }

  const segments = normalized.split('/');
  if (segments.some(segment => releaseExcludedDirectories.has(segment))) {
    return true;
  }

  return releaseExcludedFilePatterns.some(pattern => pattern.test(normalized));
};
