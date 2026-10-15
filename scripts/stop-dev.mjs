// Stops the API and web dev servers started with `pnpm dev` / `pnpm start`, together with every
// process they spawned (TypeScript watchers, Next.js, the API).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { PID_FILE } from './pid-file.mjs';

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Child process ids, recursively (Unix). */
function descendants(pid) {
  let children = [];
  try {
    children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map(Number);
  } catch {
    // pgrep exits with 1 when there are no children.
  }
  return children.flatMap((child) => [...descendants(child), child]);
}

function killTree(pid) {
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  for (const id of [...descendants(pid), pid]) {
    try {
      process.kill(id, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

const pid = existsSync(PID_FILE) ? Number(readFileSync(PID_FILE, 'utf8')) : NaN;
if (Number.isInteger(pid) && isRunning(pid)) {
  killTree(pid);
  console.log('Đã dừng API và web.');
} else {
  console.log('API và web không chạy.');
}
rmSync(PID_FILE, { force: true });
