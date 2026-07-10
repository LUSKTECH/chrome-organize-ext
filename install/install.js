import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HOST_NAME = 'com.browser_organizer.host';

const DIRS = {
  linux: {
    chrome: '.config/google-chrome/NativeMessagingHosts',
    chromium: '.config/chromium/NativeMessagingHosts',
    edge: '.config/microsoft-edge/NativeMessagingHosts',
  },
  darwin: {
    chrome: 'Library/Application Support/Google/Chrome/NativeMessagingHosts',
    chromium: 'Library/Application Support/Chromium/NativeMessagingHosts',
    edge: 'Library/Application Support/Microsoft Edge/NativeMessagingHosts',
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

// Writes a launcher that calls node (absolute path) on host.js, then registers
// the host manifest for each requested browser. Returns the files it wrote.
export function install({ extensionId, browsers, platform = process.platform, home = os.homedir(), hostDir, nodePath = process.execPath }) {
  if (!extensionId) throw new Error('extensionId is required');
  const nativeHostDir = hostDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'native-host');
  const hostEntry = path.join(nativeHostDir, 'host.js');

  const isWin = platform === 'win32';
  const launcher = path.join(nativeHostDir, isWin ? 'run.bat' : 'run.sh');
  if (isWin) {
    fs.writeFileSync(launcher, `@echo off\r\n"${nodePath}" "${hostEntry}" %*\r\n`);
  } else {
    fs.writeFileSync(launcher, `#!/bin/sh\nexec "${nodePath}" "${hostEntry}"\n`);
    fs.chmodSync(launcher, 0o755);
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
  console.log('\nWindows users: also add a registry key pointing to the manifest, e.g.\n' +
    `  reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" /ve /t REG_SZ /d "<path-to>\\${HOST_NAME}.json" /f`);
}
