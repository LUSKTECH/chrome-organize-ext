// Builds a single-file executable of the native host for the current OS/arch
// using Node's Single Executable Applications (SEA) support.
//
// Uses two build-time tools that are lockfile-tracked devDependencies (esbuild,
// postject), so `npm ci` installs them with integrity verification before this
// runs — the release toolchain that produces the SIGNED binary is integrity-pinned
// rather than fetched unverified at build time. esbuild bundles the ESM host graph
// into one CJS file so SEA can consume it; postject injects the SEA blob into a copy
// of the Node binary. The runtime host and the published npm package stay dep-free
// (these are devDependencies, never shipped).
//
// Run: `npm ci && npm run build:sea` (i.e. `node scripts/build-sea.mjs`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isWin = process.platform === 'win32';
// Resolve the locally-installed tool binaries (node_modules/.bin) rather than
// fetching them on demand. npx runs the local install when present (no network,
// pinned by the lockfile).
const npx = isWin ? 'npx.cmd' : 'npx';
// Node 20.12+ refuses to spawn .cmd files without shell:true (EINVAL), so run
// npx through the shell on Windows. Args here have no spaces/metachars.
const npxOpts = { stdio: 'inherit', shell: isWin };
const outDir = 'dist/host';
fs.mkdirSync(outDir, { recursive: true });

// 1) Bundle the ESM host graph (native-host/host.js + local imports) into one
//    CommonJS file. SEA needs a single self-contained entry.
execFileSync(npx, ['esbuild', 'native-host/host.js', '--bundle', '--platform=node',
  '--format=cjs', `--outfile=${outDir}/host-bundle.cjs`], npxOpts);

// 2) Generate the SEA preparation blob from the bundle.
execFileSync(process.execPath, ['--experimental-sea-config', 'native-host/sea-config.json'],
  { stdio: 'inherit' });

// 3) Copy the running Node binary and inject the blob into it.
const isMac = process.platform === 'darwin';
const bin = path.join(outDir, isWin ? 'browser-organizer-host.exe' : 'browser-organizer-host');
fs.copyFileSync(process.execPath, bin);

const postjectArgs = [bin, 'NODE_SEA_BLOB', `${outDir}/sea-prep.blob`,
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
// macOS Mach-O binaries need a named segment for the injected resource.
if (isMac) postjectArgs.push('--macho-segment-name', 'NODE_SEA');
execFileSync(npx, ['postject', ...postjectArgs], npxOpts);

if (!isWin) fs.chmodSync(bin, 0o700);
console.log(`SEA host built → ${bin}`);
