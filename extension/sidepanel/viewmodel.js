const LABELS = {
  closeTab: 'Close tab',
  groupTabs: 'Group tabs',
  createBookmark: 'Bookmark tab',
  deleteBookmark: 'Delete bookmark',
  discardTab: 'Suspend tab',
};

export function actionLabel(action) { return LABELS[action] || action; }

// Human-readable label for an ignore-list key ("closeTab:https://a.com/x").
export function describeIgnoreKey(key) {
  const idx = String(key).indexOf(':');
  if (idx < 0) return String(key);
  return `${actionLabel(key.slice(0, idx))}: ${key.slice(idx + 1)}`;
}

// The exact host-registration command for the onboarding screen.
export function installCommand(extensionId) {
  return `npm run install-host ${extensionId} chrome,edge`;
}

// Reassign a member tab from one proposed group to another (used by the editor).
export function moveMember(items, fromId, toId, tabId) {
  const from = items.find((i) => i.itemId === fromId);
  const member = from && from.data.members && from.data.members.find((m) => m.tabId === tabId);
  if (!member) return items;
  return items.map((it) => {
    if (it.itemId === fromId) {
      const members = it.data.members.filter((m) => m.tabId !== tabId);
      return { ...it, data: { ...it.data, members, tabIds: members.map((m) => m.tabId) } };
    }
    if (it.itemId === toId) {
      const members = [...it.data.members, member];
      return { ...it, data: { ...it.data, members, tabIds: members.map((m) => m.tabId) } };
    }
    return it;
  });
}

// Live client-side filter over open tabs (no AI): matches title, url, or host.
export function filterTabs(tabs, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return tabs;
  return tabs.filter((t) => {
    const host = (() => { try { return new URL(t.url).hostname.toLowerCase(); } catch { return ''; } })();
    return `${t.title}`.toLowerCase().includes(q) || `${t.url}`.toLowerCase().includes(q) || host.includes(q);
  });
}

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

const ADAPTER_LABELS = { claude: 'Claude CLI', antigravity: 'Antigravity CLI', kiro: 'Kiro CLI', copilot: 'Copilot CLI', codex: 'Codex CLI', ollama: 'Ollama' };
const ADAPTER_CMDS = { claude: 'claude', antigravity: 'agy', kiro: 'kiro-cli', copilot: 'copilot', codex: 'codex', ollama: 'ollama' };

export function healthMessage(health, extensionId = '<your-extension-id>') {
  const key = health && health.adapter;
  const label = ADAPTER_LABELS[key] || 'Claude CLI';
  const cmd = ADAPTER_CMDS[key] || 'claude';
  if (health && health.ready) return { ok: true, text: `${label} connected (${health.version || 'ok'})` };
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
        `Can't reach the helper app that runs your AI CLI (${label}).`,
        'Fix: open a terminal in the extension’s project folder and run:',
        `    npm run install-host ${extensionId} chrome,edge`,
        'Then click the reload icon on this extension and reopen this panel.',
      ].join('\n'),
    };
  }
  return {
    ok: false,
    text: [
      `The helper app is running, but ${label} did not start.`,
      `Fix: make sure the "${cmd}" command is installed and signed in`,
      `(run "${cmd} --version" in a terminal), then reopen this panel.`,
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
  const lines = ['# Browser Organizer export', ''];
  for (const [action, list] of Object.entries(groupByAction(items))) {
    lines.push(`## ${actionLabel(action)}`);
    for (const it of list) {
      if (action === 'groupTabs') {
        lines.push(`- **${it.data.groupName}**`);
        for (const m of it.data.members || []) lines.push(`  - [${m.title || m.url}](${m.url})`);
      } else {
        const label = it.data.title || it.data.url || '';
        const reason = it.reason ? ` — ${it.reason}` : '';
        lines.push(it.data.url ? `- [${label}](${it.data.url})${reason}` : `- ${label}${reason}`);
      }
    }
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
