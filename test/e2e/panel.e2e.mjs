// End-to-end automation harness for the Browser Organizer extension.
//
// Launches system Chrome (headless=new) with the unpacked extension loaded,
// discovers the extension id from its service worker, opens the side-panel
// page directly, and verifies the native-messaging health check — which
// exercises the whole pipe: panel -> service worker -> native host -> claude.
//
// Run: npm run e2e   (from repo root)
// Requires: `npm run install-host <id> chrome` has registered the native host,
// and `claude` is on PATH.

import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, buildHostManifest, HOST_NAME } from '../../install/install.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const extPath = path.join(repoRoot, 'extension');
const outDir = path.join(repoRoot, 'test-results');
fs.mkdirSync(outDir, { recursive: true });

let failed = false;
const log = (...a) => console.log('[e2e]', ...a);

// The extension id is stable (derived from the manifest's pinned key). Register
// the native host for Chrome for Testing (the build Playwright bundles) so the
// bridge is reachable from this browser. Self-contained: no manual step.
const KNOWN_ID = process.env.BORG_EXT_ID || 'jjacbpnaekkhbfpncfhmignbiocddocc';
// install() writes native-host/run.sh (launcher with the claude path baked in)
// and registers under the user's real config dirs (harmless for normal browsers).
try {
  install({ extensionId: KNOWN_ID, browsers: ['chrome-for-testing'] });
} catch (e) {
  log('host registration warning:', e.message);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'borg-e2e-'));

// Place the native-host manifest where Chrome for Testing (Playwright's bundled
// Chromium) will look, deterministically, by controlling both the user-data dir
// and XDG_CONFIG_HOME rather than guessing the OS default. Cover both schemes.
const launcher = path.join(repoRoot, 'native-host', process.platform === 'win32' ? 'run.bat' : 'run.sh');
const manifestJson = JSON.stringify(buildHostManifest({ execPath: launcher, extensionId: KNOWN_ID }), null, 2);
const xdgConfigHome = path.join(userDataDir, 'xdgcfg');
const candidateDirs = [
  path.join(userDataDir, 'NativeMessagingHosts'),                                   // DIR_USER_DATA scheme
  path.join(xdgConfigHome, 'google-chrome-for-testing', 'NativeMessagingHosts'),    // XDG config scheme
  path.join(xdgConfigHome, 'chromium', 'NativeMessagingHosts'),                     // chromium product fallback
];
for (const d of candidateDirs) {
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `${HOST_NAME}.json`), manifestJson);
}
log('placed native-host manifest in', candidateDirs.length, 'candidate locations');

// Headed under a virtual display (xvfb) is the most reliable way to load an
// MV3 extension in a headless environment like WSL/CI.
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium', // bundled Chromium — Google Chrome branded builds no longer allow --load-extension
  headless: false,
  env: { ...process.env, XDG_CONFIG_HOME: xdgConfigHome },
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
  ],
});

try {
  // 1) Discover the extension id. Prefer the live service worker; fall back to
  //    the id derived from the manifest's pinned key (stable across loads).
  let extId = KNOWN_ID;
  let [sw] = context.serviceWorkers();
  if (!sw) { try { sw = await context.waitForEvent('serviceworker', { timeout: 8000 }); } catch { /* lazy SW */ } }
  if (sw) extId = new URL(sw.url()).host;
  log('extension id:', extId, sw ? '(from service worker)' : '(from pinned key)');

  // 2) Open the side-panel page directly (an extension page has full chrome.* access).
  const page = await context.newPage();
  await page.setViewportSize({ width: 420, height: 900 });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`, { waitUntil: 'domcontentloaded' });

  // Capture the RAW health result (the banner text hides the underlying error).
  const raw = await page.evaluate(() => new Promise((r) => { try { chrome.runtime.sendMessage({ cmd: 'health' }, r); } catch (e) { r({ error: String(e) }); } }));
  log('raw health:', JSON.stringify(raw));

  // 3) Wait for the health banner to populate (checkHealth runs the native bridge).
  const health = page.locator('#health');
  await health.waitFor({ state: 'attached', timeout: 10000 });
  let healthText = '';
  for (let i = 0; i < 30; i++) { // poll up to ~30s
    healthText = (await health.textContent()) || '';
    if (healthText.trim()) break;
    await page.waitForTimeout(1000);
  }
  log('health banner:', JSON.stringify(healthText));

  // 4) Screenshot the panel for a visual record.
  const shot = path.join(outDir, 'panel.png');
  await page.screenshot({ path: shot, fullPage: false });
  log('screenshot:', shot);

  // 5) Assert the bridge is connected.
  const connected = /connected/i.test(healthText);
  if (connected) {
    log('PASS: native host + claude reachable from the extension');
  } else {
    failed = true;
    log('FAIL: health banner did not report connected');
    if (consoleErrors.length) log('console errors:', consoleErrors.slice(0, 10));
  }
} catch (err) {
  failed = true;
  log('ERROR:', err && err.message);
} finally {
  await context.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

process.exit(failed ? 1 : 0);
