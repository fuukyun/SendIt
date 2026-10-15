import { fileURLToPath } from 'node:url';

/** Where `pnpm dev` records its process id for `pnpm stop`. */
export const PID_FILE = fileURLToPath(new URL('../.dev.pid', import.meta.url));
