// Builds a single-file executable of the native host for the current OS/arch
// using Node's Single Executable Applications (SEA) support.
//
// Requires the build-time devDependencies `esbuild` and `postject`. They are
// NEVER shipped: esbuild only bundles the ESM host graph into one CJS file so
// SEA can consume it, and postject injects the SEA blob into a copy of the Node
// binary. The runtime host and the published npm package stay dependency-free.
//
// Run: `npm run build:sea` (i.e. `node scripts/build-sea.mjs`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const outDir = 'dist/host';
fs.mkdirSync(outDir, { recursive: true });

// 1) Bundle the ESM host graph (native-host/host.js + local imports) into one
//    CommonJS file. SEA needs a single self-contained entry.
execFileSync(npx, ['--yes', 'esbuild', 'native-host/host.js', '--bundle', '--platform=node',
  '--format=cjs', `--outfile=${outDir}/host-bundle.cjs`], { stdio: 'inherit' });

// 2) Generate the SEA preparation blob from the bundle.
execFileSync(process.execPath, ['--experimental-sea-config', 'native-host/sea-config.json'],
  { stdio: 'inherit' });

// 3) Copy the running Node binary and inject the blob into it.
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const bin = path.join(outDir, isWin ? 'browser-organizer-host.exe' : 'browser-organizer-host');
fs.copyFileSync(process.execPath, bin);

const postjectArgs = [bin, 'NODE_SEA_BLOB', `${outDir}/sea-prep.blob`,
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
// macOS Mach-O binaries need a named segment for the injected resource.
if (isMac) postjectArgs.push('--macho-segment-name', 'NODE_SEA');
execFileSync(npx, ['--yes', 'postject', ...postjectArgs], { stdio: 'inherit' });

if (!isWin) fs.chmodSync(bin, 0o700);
console.log(`SEA host built → ${bin}`);
