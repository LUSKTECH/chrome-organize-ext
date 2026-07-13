import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptWith, decryptWith } from '../extension/lib/crypto-box.js';

async function genKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

test('encryptWith/decryptWith round-trips and produces ciphertext, not plaintext', async () => {
  const key = await genKey();
  const blob = await encryptWith(key, 'sk-super-secret-123');
  assert.ok(blob.iv && blob.ct, 'returns iv + ct');
  assert.doesNotMatch(blob.ct, /sk-super-secret-123/); // actually encrypted
  assert.equal(await decryptWith(key, blob), 'sk-super-secret-123');
});

test('a different key cannot decrypt (GCM auth fails)', async () => {
  const blob = await encryptWith(await genKey(), 'secret');
  const otherKey = await genKey();
  await assert.rejects(() => decryptWith(otherKey, blob));
});

test('each encryption uses a fresh IV (non-deterministic ciphertext)', async () => {
  const key = await genKey();
  const a = await encryptWith(key, 'same');
  const b = await encryptWith(key, 'same');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});
