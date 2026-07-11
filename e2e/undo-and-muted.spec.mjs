import { test, expect, send, runFeature, countTabsWithUrl } from './fixtures.mjs';

// Safety flows that had no coverage: the undo-history dialog and the muted list.
// Uses the local dupeTabs feature so the plan is deterministic (no CLI).
test.describe.configure({ mode: 'serial' });

test('undo-history dialog reverts an applied run', async ({ context, server, panel }) => {
  const dup = `${server}/react/docs`;
  await (await context.newPage()).goto(dup);
  await (await context.newPage()).goto(dup); // duplicate

  const run = await runFeature(panel, 'dupeTabs');
  expect(run.ok, run.error).toBeTruthy();
  await panel.reload({ waitUntil: 'domcontentloaded' });

  await expect(panel.locator('#plan .item')).toHaveCount(1);
  await panel.click('#approveSelected'); // nothing selected yet -> select then apply
  await panel.click('#selectAll');
  await panel.click('#approveAll');
  await expect.poll(() => countTabsWithUrl(panel, dup)).toBe(1); // one duplicate closed

  // Open the undo-history dialog and revert the run.
  await panel.click('#showUndo');
  await expect(panel.locator('#undoDialog')).toBeVisible();
  const runBtn = panel.locator('#undoList .undoRun button', { hasText: 'Undo this run' }).first();
  await expect(runBtn).toBeVisible();
  await runBtn.click();
  await expect.poll(() => countTabsWithUrl(panel, dup)).toBe(2); // reopened
});

test('muting a suggestion moves it to the muted list, and unmute clears it', async ({ context, server, panel }) => {
  const dup = `${server}/react/hooks`;
  await (await context.newPage()).goto(dup);
  await (await context.newPage()).goto(dup);

  const run = await runFeature(panel, 'dupeTabs');
  expect(run.ok, run.error).toBeTruthy();
  await panel.reload({ waitUntil: 'domcontentloaded' });

  await expect(panel.locator('#plan .item')).toHaveCount(1);
  await panel.click('#plan .itemIgnore'); // "Never suggest this"
  await expect(panel.locator('#plan .item')).toHaveCount(0); // dropped from the plan

  await panel.click('#mutedPanel summary');
  const muted = panel.locator('#mutedList li');
  await expect(muted).toHaveCount(1);
  await expect(muted.first()).not.toHaveClass(/hint/); // a real entry, not "Nothing muted."

  await panel.click('#mutedList li button'); // Unmute
  await expect(panel.locator('#mutedList li.hint')).toBeVisible(); // "Nothing muted."
});
