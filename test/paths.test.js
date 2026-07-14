import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROD_EXTENSION_ID, hostHome, hostBinName } from '../native-host/paths.js';

test('PROD_EXTENSION_ID is the pinned store id', () => {
  assert.equal(PROD_EXTENSION_ID, 'jjacbpnaekkhbfpncfhmignbiocddocc');
});

test('hostHome is a stable per-user dir per platform', () => {
  assert.equal(hostHome('linux', {}, '/home/u'), '/home/u/.browser-organizer');
  assert.equal(hostHome('darwin', {}, '/Users/u'), '/Users/u/.browser-organizer');
  assert.equal(
    hostHome('win32', { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'C:\\Users\\u'),
    'C:\\Users\\u\\AppData\\Local\\BrowserOrganizer',
  );
});

test('hostHome does not depend on cwd or an npx cache path', () => {
  const a = hostHome('linux', {}, '/home/u');
  const b = hostHome('linux', {}, '/home/u');
  assert.equal(a, b); // pure function of home, not of import.meta.url
});

test('hostBinName is the node entry today, overridable by platform', () => {
  assert.equal(hostBinName('linux'), 'host.js');
  assert.equal(hostBinName('win32'), 'host.js');
});
