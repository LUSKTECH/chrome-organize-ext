import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sea-config points at the bundled entry and enables snapshot-free build', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'native-host', 'sea-config.json'), 'utf8'));
  assert.equal(cfg.main, 'dist/host/host-bundle.cjs');
  assert.equal(cfg.output, 'dist/host/sea-prep.blob');
  assert.equal(cfg.disableExperimentalSEAWarning, true);
});
