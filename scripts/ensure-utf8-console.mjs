import { execSync } from 'node:child_process';

if (process.platform === 'win32') {
  try {
    execSync('chcp 65001>nul', { stdio: 'ignore', shell: true });
  } catch {
    // Best-effort only. If this fails, the app can still run.
  }
}
