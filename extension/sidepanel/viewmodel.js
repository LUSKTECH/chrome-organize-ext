const LABELS = {
  closeTab: 'Close tab',
  groupTabs: 'Group tabs',
  createBookmark: 'Bookmark tab',
  deleteBookmark: 'Delete bookmark',
  discardTab: 'Suspend tab',
};

export function actionLabel(action) { return LABELS[action] || action; }

export function summarize(items) {
  const out = {};
  for (const it of items) out[it.action] = (out[it.action] || 0) + 1;
  return out;
}

export function groupByAction(items) {
  const out = {};
  for (const it of items) (out[it.action] ||= []).push(it);
  return out;
}

export function toggleSelection(selected, itemId) {
  const next = new Set(selected);
  if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
  return next;
}

export function selectedItems(selected, items) {
  return items.filter((it) => selected.has(it.itemId));
}

export function excludeMember(item, tabId) {
  const members = item.data.members.filter((m) => m.tabId !== tabId);
  return { ...item, data: { ...item.data, members, tabIds: members.map((m) => m.tabId) } };
}

export function renameGroup(item, name) {
  return { ...item, data: { ...item.data, groupName: name } };
}

export function recolorGroup(item, color) {
  return { ...item, data: { ...item.data, color } };
}

export function itemsForAction(items, action) {
  return items.filter((it) => it.action === action);
}

export function healthMessage(health, extensionId = '<your-extension-id>') {
  if (health && health.ready) return { ok: true, text: `Claude CLI connected (${health.version || 'ok'})` };
  const err = String((health && health.error) || '');
  // Two very different causes need two different fixes. Native-messaging
  // connection failures ("host not found/disconnected") mean the helper isn't
  // registered; anything else from a reachable helper means the CLI itself
  // failed to start.
  const hostMissing = err === '' || /not found|disconnected|not allowed|forbidden|no such|specified native|host/i.test(err);
  if (hostMissing) {
    return {
      ok: false,
      text: [
        "Can't reach the helper app that runs Claude for this extension.",
        'Fix: open a terminal in the extension’s project folder and run:',
        `    npm run install-host ${extensionId} chrome,edge`,
        'Then click the reload icon on this extension and reopen this panel.',
      ].join('\n'),
    };
  }
  return {
    ok: false,
    text: [
      'The helper app is running, but the Claude CLI did not start.',
      'Fix: make sure the "claude" command is installed and signed in',
      '(run "claude --version" in a terminal), then reopen this panel.',
    ].join('\n'),
  };
}

export function progressLabel(phase, done, total) {
  return `${phase}… (${done}/${total})`;
}

export function digestText(items) {
  if (!items.length) return 'Your browser looks tidy — nothing to review.';
  const c = summarize(items);
  const parts = [];
  if (c.closeTab) parts.push(`${c.closeTab} tabs to close`);
  if (c.discardTab) parts.push(`${c.discardTab} tabs to suspend`);
  if (c.groupTabs) parts.push(`${c.groupTabs} group${c.groupTabs > 1 ? 's' : ''}`);
  if (c.createBookmark) parts.push(`${c.createBookmark} to bookmark`);
  if (c.deleteBookmark) parts.push(`${c.deleteBookmark} bookmarks to clean`);
  return `${parts.join(', ')} — open to review.`;
}

export function toMarkdown(items) {
  const groups = itemsForAction(items, 'groupTabs');
  const lines = ['# Browser Organizer export', ''];
  for (const g of groups) {
    lines.push(`## ${g.data.groupName}`);
    for (const m of g.data.members || []) lines.push(`- [${m.title || m.url}](${m.url})`);
    lines.push('');
  }
  return lines.join('\n');
}

export function groupUndoByRun(entries) {
  const byRun = new Map();
  for (const e of entries) {
    if (!byRun.has(e.runId)) byRun.set(e.runId, { runId: e.runId, ts: e.ts, entries: [] });
    const r = byRun.get(e.runId);
    r.entries.push(e);
    r.ts = Math.max(r.ts, e.ts);
  }
  return [...byRun.values()].sort((a, b) => b.ts - a.ts);
}
