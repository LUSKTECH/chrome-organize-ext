import { test, expect, send, runFeature, queryGroups } from './fixtures.mjs';

// End-to-end grouping goes through the real Claude CLI, so it is slower and the
// exact clustering is non-deterministic. Assertions are tolerant (at least one
// group forms) and the test is skippable in offline/fast CI via BORG_SKIP_CLI=1.
test.describe.configure({ mode: 'serial' });

test('groups related tabs into a Chrome tab group via the Claude CLI', async ({ context, server, panel }) => {
  test.skip(process.env.BORG_SKIP_CLI === '1', 'CLI tests disabled via BORG_SKIP_CLI');
  test.setTimeout(150000);

  const paths = ['/react/docs', '/react/hooks', '/react/router', '/news/politics', '/news/sports', '/news/tech'];
  for (const p of paths) await (await context.newPage()).goto(`${server}${p}`);

  const run = await runFeature(panel, 'groupTabs');
  expect(run.ok, `run error: ${run.error}`).toBeTruthy();

  const groupItems = (await send(panel, { cmd: 'getPlan' })).items.filter((i) => i.action === 'groupTabs');
  expect(groupItems.length, 'the model should propose at least one group').toBeGreaterThan(0);
  // Every proposed group should have 2+ member tabs in a single window.
  for (const g of groupItems) expect(g.data.tabIds.length).toBeGreaterThanOrEqual(2);

  const applied = await send(panel, { cmd: 'apply', itemIds: groupItems.map((i) => i.itemId) });
  expect(applied.applied.length).toBeGreaterThan(0);

  // A real Chrome tab group should now exist.
  await expect.poll(async () => (await queryGroups(panel)).length, { timeout: 20000 }).toBeGreaterThan(0);
});
