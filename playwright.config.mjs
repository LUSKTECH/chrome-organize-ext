import { defineConfig } from '@playwright/test';

// The extension + native host require a single, serialized persistent context,
// so run one worker with no parallelism. Browser launch is handled entirely by
// the custom `context` fixture in e2e/fixtures.mjs (no built-in browser project).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // Headed Chromium under xvfb can transiently drop the page/context in CI; retry
  // there so a flake doesn't fail the job. Locally, fail fast (no retries).
  retries: process.env.CI ? 2 : 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
});
