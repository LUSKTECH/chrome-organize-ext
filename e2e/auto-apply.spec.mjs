import { test, expect, send, getAlarms, setStoredSettings, createBookmark, searchBookmarks, countTabsWithUrl } from './fixtures.mjs';

// Auto-apply + scheduling are local/deterministic (no CLI).
test.describe.configure({ mode: 'serial' });

test('onInstalled schedules the scan and prune alarms', async ({ panel }) => {
  const names = (await getAlarms(panel)).map((a) => a.name);
  expect(names).toContain('organizer-scan');
  expect(names).toContain('organizer-prune');
});

test('auto mode applies tab actions automatically but never auto-deletes bookmarks', async ({ context, server, panel }) => {
  await setStoredSettings(panel, { automationMode: 'auto' });

  const dupUrl = `${server}/react/docs`;
  await (await context.newPage()).goto(dupUrl);
  await (await context.newPage()).goto(dupUrl);
  await createBookmark(panel, { parentId: '1', title: 'MDN', url: 'https://developer.mozilla.org/en-US/docs/Web' });
  await createBookmark(panel, { parentId: '1', title: 'MDN copy', url: 'https://developer.mozilla.org/en-US/docs/Web/' });
  expect(await countTabsWithUrl(panel, dupUrl)).toBe(2);

  // A scan in auto mode over duplicate tabs + bookmark cleanup.
  const run = await send(panel, { cmd: 'run', features: { dupeTabs: true, cleanBookmarks: true, groupTabs: false, staleTabs: false, importantBookmarks: false, deadLinkScan: false } });
  expect(run.ok, run.error).toBeTruthy();

  // The duplicate tab was auto-closed (no explicit apply call).
  await expect.poll(() => countTabsWithUrl(panel, dupUrl)).toBe(1);

  // The duplicate bookmark was NOT auto-deleted — it was routed to review instead.
  const review = (await send(panel, { cmd: 'getPlan' })).items.filter((i) => i.action === 'deleteBookmark');
  expect(review.length, 'bookmark deletion must require review even in auto mode').toBeGreaterThan(0);
  expect((await searchBookmarks(panel, 'https://developer.mozilla.org/en-US/docs/Web/')).length).toBeGreaterThan(0);

  // The auto-applied close is in the undo log.
  const undo = (await send(panel, { cmd: 'getUndo' })).entries.filter((e) => e.action === 'closeTab');
  expect(undo.length).toBeGreaterThan(0);
});
