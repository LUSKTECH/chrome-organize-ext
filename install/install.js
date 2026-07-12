import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CLI_ADAPTERS } from '../native-host/adapters/catalog.js';

export const HOST_NAME = 'com.browser_organizer.host';

const DIRS = {
  linux: {
    chrome: '.config/google-chrome/NativeMessagingHosts',
    chromium: '.config/chromium/NativeMessagingHosts',
    edge: '.config/microsoft-edge/NativeMessagingHosts',
    // "Chrome for Testing" — the build Playwright uses as its bundled Chromium.
    'chrome-for-testing': '.config/google-chrome-for-testing/NativeMessagingHosts',
  },
  darwin: {
    chrome: 'Library/Application Support/Google/Chrome/NativeMessagingHosts',
    chromium: 'Library/Application Support/Chromium/NativeMessagingHosts',
    edge: 'Library/Application Support/Microsoft Edge/NativeMessagingHosts',
    'chrome-for-testing': 'Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts',
  },
};

export function manifestDir(browser, platform = process.platform, home = os.homedir()) {
  const rel = DIRS[platform]?.[browser];
  if (!rel) throw new Error(`Unsupported platform/browser: ${platform}/${browser}`);
  return path.join(home, rel);
}

export function buildHostManifest({ execPath, extensionId }) {
  return {
    name: HOST_NAME,
    description: 'Browser Organizer native host',
    path: execPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

export function winManifestPath(nativeHostDir) {
  return path.join(nativeHostDir, `${HOST_NAME}.json`);
}

const WIN_REG_ROOTS = {
  chrome: 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts',
  edge: 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts',
  chromium: 'HKCU\\Software\\Chromium\\NativeMessagingHosts',
};

// Returns argv arrays (not shell strings) so they can be run without a shell —
// no metacharacter injection from a manifest path containing " & % etc.
export function registryCommands(browsers, manifestPath) {
  return browsers.map((b) => {
    const root = WIN_REG_ROOTS[b];
    if (!root) throw new Error(`Unsupported browser for win32: ${b}`);
    return ['reg', 'add', `${root}\\${HOST_NAME}`, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'];
  });
}

export function registryDeleteCommands(browsers) {
  return browsers.map((b) => {
    const root = WIN_REG_ROOTS[b];
    if (!root) throw new Error(`Unsupported browser for win32: ${b}`);
    return ['reg', 'delete', `${root}\\${HOST_NAME}`, '/f'];
  });
}

// Resolves the absolute path to the `claude` CLI using the platform's lookup
// tool (which/where). Host-side only — never influenced by extension messages.
export function resolveCliPath(platform = process.platform, spawnSyncFn = spawnSync, binary = 'claude') {
  const finder = platform === 'win32' ? 'where' : 'which';
  try {
    const res = spawnSyncFn(finder, [binary], { encoding: 'utf8' });
    const line = String(res.stdout || '').split(/\r?\n/).find(Boolean);
    return line ? line.trim() : null;
  } catch { return null; }
}

export function buildLauncherScript({ platform, nodePath, hostEntry, vars = [] }) {
  // `vars` is [[ENV_NAME, absolutePath], …] for each CLI found; bake them so the
  // host resolves each adapter's binary even under a bare browser launch env.
  vars = vars.filter(([, v]) => v);
  if (platform === 'win32') {
    const sets = vars.map(([k, v]) => `set "${k}=${v}"\r\n`).join('');
    return `@echo off\r\n${sets}"${nodePath}" "${hostEntry}" %*\r\n`;
  }
  const exports = vars.map(([k, v]) => `${k}="${v}"\nexport ${k}\n`).join('');
  // Prepend common CLI locations so the host finds node and the CLIs even under a bare browser PATH.
  return `#!/bin/sh\nexport PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"\n${exports}exec "${nodePath}" "${hostEntry}"\n`;
}

// Writes a launcher that calls node (absolute path) on host.js, then registers
// the host manifest for each requested browser. Returns the files it wrote.
export function defaultHostDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'native-host');
}

// Removes the native-host manifests (and returns registry-delete argv on win32)
// so users/installers can cleanly unregister. Returns the list of files removed.
export function uninstall({ browsers, platform = process.platform, home = os.homedir(), hostDir } = {}) {
  const nativeHostDir = hostDir || defaultHostDir();
  const removed = [];
  if (platform === 'win32') {
    const manifestPath = winManifestPath(nativeHostDir);
    if (fs.existsSync(manifestPath)) { fs.rmSync(manifestPath); removed.push(manifestPath); }
    removed._registryCommands = registryDeleteCommands(browsers || Object.keys(WIN_REG_ROOTS));
    return removed;
  }
  const list = browsers || Object.keys(DIRS[platform] || {});
  for (const browser of list) {
    const file = path.join(manifestDir(browser, platform, home), `${HOST_NAME}.json`);
    if (fs.existsSync(file)) { fs.rmSync(file); removed.push(file); }
  }
  return removed;
}

export function install({ extensionId, browsers, platform = process.platform, home = os.homedir(), hostDir, nodePath = process.execPath }) {
  if (!extensionId) throw new Error('extensionId is required');
  const nativeHostDir = hostDir || defaultHostDir();
  const hostEntry = path.join(nativeHostDir, 'host.js');

  const isWin = platform === 'win32';
  // Resolve every catalogued adapter's binary path in one pass (declarative).
  const vars = CLI_ADAPTERS.map((a) => [a.cmdEnv, resolveCliPath(platform, spawnSync, a.bin)]);
  const launcher = path.join(nativeHostDir, isWin ? 'run.bat' : 'run.sh');
  fs.writeFileSync(launcher, buildLauncherScript({ platform, nodePath, hostEntry, vars }));
  if (!isWin) fs.chmodSync(launcher, 0o700);

  if (isWin) {
    const manifestPath = winManifestPath(nativeHostDir);
    fs.writeFileSync(manifestPath, JSON.stringify(buildHostManifest({ execPath: launcher, extensionId }), null, 2));
    const written = [launcher, manifestPath];
    written._registryCommands = registryCommands(browsers, manifestPath);
    return written;
  }

  const manifest = buildHostManifest({ execPath: launcher, extensionId });
  const written = [launcher];
  for (const browser of browsers) {
    const dir = manifestDir(browser, platform, home);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${HOST_NAME}.json`);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    written.push(file);
  }
  return written;
}

// CLI entry:
//   node install/install.js <extensionId> [chrome,edge]   → install
//   node install/install.js uninstall [chrome,edge]        → remove
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const runRegistry = (cmds) => {
    for (const argv of cmds || []) {
      console.log('Running: ' + argv.join(' '));
      spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' }); // no shell → no metachar injection
    }
  };
  if (process.argv[2] === 'uninstall') {
    const browsers = (process.argv[3] || 'chrome,edge').split(',');
    const removed = uninstall({ browsers });
    console.log(removed.length ? 'Removed:\n' + removed.map((f) => '  ' + f).join('\n') : 'Nothing to remove.');
    runRegistry(removed._registryCommands);
  } else {
    const extensionId = process.argv[2];
    const browsers = (process.argv[3] || 'chrome,edge').split(',');
    if (!extensionId) {
      console.error('Usage:\n  node install/install.js <extensionId> [chrome,edge,chromium]\n  node install/install.js uninstall [chrome,edge]');
      process.exit(1);
    }
    const files = install({ extensionId, browsers });
    console.log('Wrote:\n' + files.map((f) => '  ' + f).join('\n'));
    runRegistry(files._registryCommands);
  }
}
