import { test, expect, send } from './fixtures.mjs';

test('native bridge: panel reports the Claude CLI connected', async ({ panel }) => {
  const res = await send(panel, { cmd: 'health' });
  expect(res.ok).toBeTruthy();
  expect(res.health.ready, `health error: ${res.health && res.health.error}`).toBe(true);
  expect(String(res.health.version)).toMatch(/\d+\.\d+/);

  // The onboarding banner should reflect the connected state.
  await expect(panel.locator('#health')).toContainText(/connected/i, { timeout: 10000 });
  await panel.screenshot({ path: 'test-results/panel-connected.png' });
});
