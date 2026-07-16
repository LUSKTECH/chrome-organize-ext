import { test, expect, send, runFeature, createBookmark, getBookmark, setStoredSettings } from './fixtures.mjs';

// Organizing existing bookmarks goes through the real CLI (the AI picks the
// folders), so this is CLI-backed, tolerant, and skippable in offline/fast CI
// via BORG_SKIP_CLI=1 — same as grouping/command/stale-tabs. The protection and
// mapping logic are covered deterministically by the unit suites.
test.describe.configure({ mode: 'serial' });

test('sorts loose bookmarks into a folder via the CLI, and undo restores them', async ({ panel }) => {
  test.skip(process.env.BORG_SKIP_CLI === '1', 'CLI tests disabled via BORG_SKIP_CLI');
  test.setTimeout(150000);

  // additive: keep existing folders, sort loose bookmarks; bar left untouched.
  await setStoredSettings(panel, { organizeMode: 'additive', protectBookmarkBar: true });

  // Two clearly-topical bookmarks sitting loose directly under Other Bookmarks ('2').
  const b1 = await createBookmark(panel, { parentId: '2', title: 'React – A JavaScript library', url: 'https://react.dev/learn' });
  const b2 = await createBookmark(panel, { parentId: '2', title: 'React Hooks reference', url: 'https://react.dev/reference/react' });
  expect(b1.id && b2.id).toBeTruthy();

  const run = await runFeature(panel, 'organizeBookmarks');
  expect(run.ok, `run error: ${run.error}`).toBeTruthy();

  const moves = (await send(panel, { cmd: 'getPlan' })).items.filter((i) => i.action === 'moveBookmark');
  expect(moves.length, 'the model should propose moving at least one loose bookmark').toBeGreaterThan(0);
  const mv = moves.find((m) => m.data.bookmarkId === b1.id || m.data.bookmarkId === b2.id);
  expect(mv, 'a seeded loose bookmark should be proposed for a move').toBeTruthy();
  expect(mv.data.fromParentId).toBe('2'); // came from Other Bookmarks, not the bar

  const applied = await send(panel, { cmd: 'apply', itemIds: [mv.itemId] });
  expect(applied.applied.length).toBe(1);

  // Now filed under a different, non-root parent.
  await expect.poll(async () => (await getBookmark(panel, mv.data.bookmarkId))?.parentId).not.toBe('2');

  // Undo puts it back under Other Bookmarks.
  const undo = (await send(panel, { cmd: 'getUndo' })).entries.filter((e) => e.action === 'moveBookmark');
  expect(undo.length).toBeGreaterThan(0);
  await send(panel, { cmd: 'undo', undoIds: undo.map((e) => e.undoId) });
  await expect.poll(async () => (await getBookmark(panel, mv.data.bookmarkId))?.parentId).toBe('2');
});
