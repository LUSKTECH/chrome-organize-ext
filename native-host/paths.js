import os from 'node:os';
import path from 'node:path';

// Pinned Chrome/Edge id derived from the manifest `key` — identical across builds.
export const PROD_EXTENSION_ID = 'jjacbpnaekkhbfpncfhmignbiocddocc';

// Stable per-user directory the host is copied into. Deliberately independent of
// cwd, the repo, and any npx/temp cache so the browser manifest never dangles.
export function hostHome(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'win32') {
    // path.win32 so separators are correct even when computed on a non-Windows host.
    const base = env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local');
    return path.win32.join(base, 'BrowserOrganizer');
  }
  return path.posix.join(home, '.browser-organizer');
}

// The file/binary the manifest `path` points at. Stays host.js until the SEA
// binary lands — kept here so that swap is a one-line change.
export function hostBinName(platform = process.platform) {
  return platform === 'win32' ? 'host.js' : 'host.js';
}
