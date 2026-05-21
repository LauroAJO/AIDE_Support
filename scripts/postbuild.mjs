// Pages Advanced Mode requires _worker.js inside the build output dir.
// Vite ignores it at the project root, so copy it into dist/ after the build.
// Running after `vite build` also keeps it out of the Workbox precache glob.
import { copyFileSync, existsSync } from 'node:fs';

const SRC = '_worker.js';
const DEST = 'dist/_worker.js';

if (!existsSync(SRC)) {
  console.error(`postbuild: ${SRC} not found at project root`);
  process.exit(1);
}

copyFileSync(SRC, DEST);
console.log(`postbuild: copied ${SRC} -> ${DEST}`);
