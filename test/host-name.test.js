import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST_NAME as clientName } from '../extension/lib/native-client.js';
import { HOST_NAME as installName } from '../native-host/installer.js';

// The two live in different realms (extension vs Node installer) and must stay
// byte-identical or connectNative silently fails; this guards against a rename
// in one place only.
test('native-client and installer agree on the native host name', () => {
  assert.equal(clientName, installName);
});
