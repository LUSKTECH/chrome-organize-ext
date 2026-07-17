import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hostVersion } from '../native-host/version.js';

test('hostVersion reads the native-host package version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../native-host/package.json', import.meta.url), 'utf8'));
  assert.equal(hostVersion(), pkg.version);
  assert.match(hostVersion(), /^\d+\.\d+\.\d+/);
});
