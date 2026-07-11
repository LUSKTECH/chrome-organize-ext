import { test, expect } from './fixtures.mjs';

// Reproduces the reported Edge issue: a `basic` notification without iconUrl
// fails with "required properties are missing". With a generated icon it must
// succeed (no runtime.lastError).
test('basic notification with a generated icon succeeds (no missing-iconUrl error)', async ({ panel }) => {
  const result = await panel.evaluate(async () => {
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, 0, 128, 128);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const iconUrl = `data:image/png;base64,${btoa(bin)}`;
    try {
      const id = await new Promise((res, rej) => {
        chrome.notifications.create({ type: 'basic', iconUrl, title: 'Test', message: 'Hello' }, (nid) => {
          if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message)); else res(nid);
        });
      });
      return { ok: true, id, iconPrefix: iconUrl.slice(0, 22) };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  expect(result.iconPrefix).toBe('data:image/png;base64,');
  expect(result.ok, result.error).toBeTruthy();
  expect(result.id).toBeTruthy();
});
