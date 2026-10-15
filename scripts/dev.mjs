// Runs the API and web dev servers (`pnpm dev`) and records this process's id, so that
// `pnpm stop` can shut them down from another terminal.
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { PID_FILE } from './pid-file.mjs';

writeFileSync(PID_FILE, String(process.pid));
const cleanup = () => rmSync(PID_FILE, { force: true });

const child = spawn('pnpm -r --parallel dev', { stdio: 'inherit', shell: true });

// Ctrl+C reaches the child directly (same terminal); just wait for it to finish.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {});

child.on('exit', (code, signal) => {
  cleanup();
  process.exit(signal ? 1 : (code ?? 0));
});
