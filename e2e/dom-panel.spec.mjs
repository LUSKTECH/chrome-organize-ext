import { test, expect, send, createBookmark, searchBookmarks, queryTabs, queryGroups } from './fixtures.mjs';

// Exercises the side-panel DOM directly (clicks, form edits) rather than the
// message API, so the rendering and event handlers are actually tested.
test.describe.configure({ mode: 'serial' });

const DUP_URL = 'https://developer.mozilla.org/en-US/docs/Web/';

test('UI: "Clean bookmarks" surfaces a duplicate, "Apply all" deletes it, toast "Undo" restores it', async ({ panel }) => {
  await createBookmark(panel, { parentId: '1', title: 'MDN', url: 'https://developer.mozilla.org/en-US/docs/Web' });
  await createBookmark(panel, { parentId: '1', title: 'MDN copy', url: DUP_URL });

  await panel.click('#runOne button[data-feature="cleanBookmarks"]');
  await expect(panel.locator('#plan')).toContainText(/Delete bookmark/i, { timeout: 15000 });

  await panel.click('#approveAll');
  await expect(panel.locator('#undoToast')).toBeVisible();
  await expect(panel.locator('#undoToast')).toContainText(/Applied 1 change/i);
  await expect.poll(async () => (await searchBookmarks(panel, DUP_URL)).length).toBe(0);

  await panel.click('#undoToast button');
  await expect.poll(async () => (await searchBookmarks(panel, DUP_URL)).length).toBeGreaterThan(0);
});

test('UI: edit a proposed group (rename + drop a tab) and apply just that group', async ({ context, server, panel }) => {
  await (await context.newPage()).goto(`${server}/react/docs`);
  await (await context.newPage()).goto(`${server}/react/hooks`);
  await (await context.newPage()).goto(`${server}/react/router`);
  const tabs = (await queryTabs(panel)).filter((t) => t.url.startsWith(server));
  expect(tabs.length).toBe(3);

  // Inject a synthetic group plan referencing the real tabs, then reload so the panel renders it.
  const members = tabs.map((t) => ({ tabId: t.id, title: t.title, url: t.url }));
  const item = {
    itemId: 'group-0-0', action: 'groupTabs', status: 'pending', reason: 'test',
    data: { groupName: 'Temp', color: 'blue', windowId: tabs[0].windowId, tabIds: members.map((m) => m.tabId), members },
  };
  await send(panel, { cmd: 'updatePlan', items: [item] });
  await panel.reload({ waitUntil: 'domcontentloaded' });

  const groupItem = panel.locator('.groupItem');
  await expect(groupItem).toBeVisible();
  // Opening the <details> registers it as expanded, so re-renders keep it open;
  // re-assert open before each interaction inside it to be robust.
  const openDetails = () => panel.evaluate(() => { const d = document.querySelector('.groupItem details'); if (d) d.open = true; });

  await openDetails();
  await groupItem.locator('input.groupName').fill('Renamed');
  await groupItem.locator('input.groupName').blur();

  await openDetails();
  await expect(groupItem.locator('.memberList li button').first()).toBeVisible();
  await groupItem.locator('.memberList li button').first().click(); // remove one member

  await openDetails();
  await groupItem.locator('button.applySection').click();

  await expect.poll(async () => (await queryGroups(panel)).length).toBeGreaterThan(0);
  const groups = await queryGroups(panel);
  expect(groups[0].title).toBe('Renamed');
  const grouped = (await queryTabs(panel)).filter((t) => t.groupId === groups[0].id);
  expect(grouped.length).toBe(2); // the dropped tab was not grouped
});

test('UI: settings form persists auto mode and thresholds', async ({ panel }) => {
  await panel.click('#settings summary');
  const form = panel.locator('#settingsForm');
  await form.locator('input[name="groupTabs"]').uncheck();
  await form.locator('input[name="autoMode"]').check();
  await form.locator('input[name="staleTabDays"]').fill('30');
  await form.locator('button[type="submit"]').click();
  await expect(panel.locator('#status')).toContainText(/Settings saved/i);

  const settings = await panel.evaluate(() => new Promise((r) => chrome.storage.sync.get('settings', ({ settings }) => r(settings))));
  expect(settings.automationMode).toBe('auto');
  expect(settings.staleTabDays).toBe(30);
  expect(settings.enabledFeatures.groupTabs).toBe(false);
});
