import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manifest is MV3 with a pinned key and required permissions', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.equal(m.manifest_version, 3);
  assert.ok(typeof m.key === 'string' && m.key.length > 0, 'needs pinned key');
  for (const p of ['tabs', 'tabGroups', 'bookmarks', 'history', 'storage', 'alarms', 'sidePanel', 'nativeMessaging']) {
    assert.ok(m.permissions.includes(p), `missing permission: ${p}`);
  }
  assert.ok(m.background.service_worker, 'needs service worker');
  assert.equal(m.background.type, 'module');
  assert.ok(m.side_panel && m.side_panel.default_path, 'needs side panel');
});

test('all_urls is optional, not a standing host permission', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.ok(!(m.host_permissions || []).includes('<all_urls>'), 'should not grant <all_urls> at install');
  assert.ok((m.optional_host_permissions || []).includes('<all_urls>'), 'should request <all_urls> optionally');
});

test('manifest declares commands and an omnibox keyword', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.ok(m.commands && m.commands['run-scan'], 'run-scan command');
  assert.equal(m.omnibox.keyword, 'org');
});
