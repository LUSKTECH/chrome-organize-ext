import { test, expect, send } from './fixtures.mjs';

// End-to-end proof of the UI-entered, encrypted-at-rest OpenAI key path:
// Settings UI → secret-store (AES-GCM encrypt into storage.local) → service worker
// makeClient (decrypt) → native-client config passthrough → host sanitizeConfig →
// openai adapter uses it → fetch the stubbed local /v1 endpoint. Fully offline.
test('OpenAI backend: key entered in the UI (encrypted) is used by the host', async ({ server, panel }) => {
  await panel.click('#settings summary');
  await panel.selectOption('#settingsForm [name=adapter]', 'openai');
  await expect(panel.locator('#openaiConfig')).toBeVisible(); // config fields appear for the API backend
  await panel.fill('#openaiApiKey', 'test-key-123');
  await panel.fill('#settingsForm [name=openaiBaseUrl]', `${server}/v1`); // loopback http is allowed
  await panel.fill('#settingsForm [name=openaiModel]', 'test-model');
  await panel.click('#settingsForm button[type="submit"]');

  // Wait for the async save to persist the (encrypted) key.
  await expect.poll(async () =>
    panel.evaluate(async () => Boolean((await chrome.storage.local.get('secrets')).secrets?.openaiApiKey)),
  ).toBe(true);

  // The key is stored ENCRYPTED (never plaintext) and NOT in storage.sync.
  const stored = await panel.evaluate(async () => {
    const local = await chrome.storage.local.get('secrets');
    const sync = await chrome.storage.sync.get('settings');
    return { blob: local.secrets.openaiApiKey, syncBlob: JSON.stringify(sync) };
  });
  expect(stored.blob.iv && stored.blob.ct).toBeTruthy();
  expect(JSON.stringify(stored.blob)).not.toContain('test-key-123'); // ciphertext, not plaintext
  expect(stored.syncBlob).not.toContain('test-key-123'); // never synced

  // The host reports the OpenAI backend connected, proving it decrypted + used the key.
  await expect.poll(async () => {
    const r = await send(panel, { cmd: 'health' });
    return r && r.health && r.health.adapter === 'openai' && r.health.ready === true;
  }, { timeout: 15000 }).toBeTruthy();
});
