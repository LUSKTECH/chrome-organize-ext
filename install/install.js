import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

export function registryCommands(browsers, manifestPath) {
  return browsers.map((b) => {
    const root = WIN_REG_ROOTS[b];
    if (!root) throw new Error(`Unsupported browser for win32: ${b}`);
    return `reg add "${root}\\${HOST_NAME}" /ve /t REG_SZ /d "${manifestPath}" /f`;
  });
}

// Resolves the absolute path to the `claude` CLI using the platform's lookup
// tool (which/where). Host-side only — never influenced by extension messages.
export function resolveCliPath(platform = process.platform, spawnSyncFn = spawnSync) {
  const finder = platform === 'win32' ? 'where' : 'which';
  try {
    const res = spawnSyncFn(finder, ['claude'], { encoding: 'utf8' });
    const line = String(res.stdout || '').split(/\r?\n/).find(Boolean);
    return line ? line.trim() : null;
  } catch { return null; }
}

export function buildLauncherScript({ platform, nodePath, hostEntry, cliPath }) {
  if (platform === 'win32') {
    const cli = cliPath ? `set "BROWSER_ORGANIZER_CLI=${cliPath}"\r\n` : '';
    return `@echo off\r\n${cli}"${nodePath}" "${hostEntry}" %*\r\n`;
  }
  const cli = cliPath ? `BROWSER_ORGANIZER_CLI="${cliPath}"\nexport BROWSER_ORGANIZER_CLI\n` : '';
  // Prepend common CLI locations so the host finds node/claude even under a bare browser PATH.
  return `#!/bin/sh\nexport PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"\n${cli}exec "${nodePath}" "${hostEntry}"\n`;
}

// Writes a launcher that calls node (absolute path) on host.js, then registers
// the host manifest for each requested browser. Returns the files it wrote.
export function install({ extensionId, browsers, platform = process.platform, home = os.homedir(), hostDir, nodePath = process.execPath }) {
  if (!extensionId) throw new Error('extensionId is required');
  const nativeHostDir = hostDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'native-host');
  const hostEntry = path.join(nativeHostDir, 'host.js');

  const isWin = platform === 'win32';
  const cliPath = resolveCliPath(platform);
  const launcher = path.join(nativeHostDir, isWin ? 'run.bat' : 'run.sh');
  fs.writeFileSync(launcher, buildLauncherScript({ platform, nodePath, hostEntry, cliPath }));
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

// CLI entry: node install/install.js <extensionId> [chrome,edge]
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const extensionId = process.argv[2];
  const browsers = (process.argv[3] || 'chrome,edge').split(',');
  if (!extensionId) {
    console.error('Usage: node install/install.js <extensionId> [chrome,edge,chromium]');
    process.exit(1);
  }
  const files = install({ extensionId, browsers });
  console.log('Wrote:\n' + files.map((f) => '  ' + f).join('\n'));
  if (files._registryCommands) {
    for (const cmd of files._registryCommands) {
      console.log('Running: ' + cmd);
      spawnSync(cmd, { shell: true, stdio: 'inherit' });
    }
  }
}
