import { test, expect, send, runFeature, countTabsWithUrl } from './fixtures.mjs';

// Duplicate open-tab detection is fully local (no CLI), so this is the
// deterministic core behavioral test: detect -> apply(close) -> undo(reopen).
test.describe.configure({ mode: 'serial' });

test('detects a duplicate open tab, closes it on apply, and restores it on undo', async ({ context, server, panel }) => {
  const dupUrl = `${server}/react/docs`;

  // Open two identical tabs plus one distinct tab.
  await (await context.newPage()).goto(dupUrl);
  await (await context.newPage()).goto(dupUrl);
  await (await context.newPage()).goto(`${server}/news/sports`);

  expect(await countTabsWithUrl(panel, dupUrl)).toBe(2);

  // Run only duplicate detection.
  const run = await runFeature(panel, 'dupeTabs');
  expect(run.ok, run.error).toBeTruthy();

  // The plan should contain exactly one closeTab for the duplicated url.
  const plan = (await send(panel, { cmd: 'getPlan' })).items;
  const dupItems = plan.filter((i) => i.action === 'closeTab' && i.data.url === dupUrl);
  expect(dupItems.length).toBe(1);

  // Apply it -> one of the duplicates is closed.
  const applied = await send(panel, { cmd: 'apply', itemIds: dupItems.map((i) => i.itemId) });
  expect(applied.applied.length).toBe(1);
  await expect.poll(() => countTabsWithUrl(panel, dupUrl)).toBe(1);

  // Undo -> the closed tab is reopened.
  const undo = (await send(panel, { cmd: 'getUndo' })).entries.filter((e) => e.action === 'closeTab');
  expect(undo.length).toBeGreaterThan(0);
  await send(panel, { cmd: 'undo', undoIds: undo.map((e) => e.undoId) });
  await expect.poll(() => countTabsWithUrl(panel, dupUrl)).toBe(2);
});
