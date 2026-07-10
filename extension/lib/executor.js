const COLORS = new Set(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);

export class StaleTabError extends Error {}

function undoId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const ACTION_LABELS = { closeTab: 'Close tab', groupTabs: 'Group tabs', createBookmark: 'Bookmark', deleteBookmark: 'Delete bookmark' };
function labelFor(item) {
  const name = item.data.title || item.data.groupName || item.data.url || '';
  return `${ACTION_LABELS[item.action] || item.action}: ${name}`.trim();
}

// Walk/create a folder path under the bookmarks bar (id '1'); returns the leaf folder id.
export async function ensureFolder(pathParts, chromeApi) {
  let parentId = '1';
  for (const name of pathParts) {
    const children = await chromeApi.bookmarks.getChildren(parentId);
    let node = children.find((ch) => !ch.url && ch.title === name);
    if (!node) node = await chromeApi.bookmarks.create({ parentId, title: name });
    parentId = node.id;
  }
  return { id: parentId };
}

export async function applyItem(item, deps = {}) {
  const c = deps.chrome || chrome;
  const runId = deps.runId || 'run';
  const entry = await applyItemInner(item, c);
  return entry ? { ...entry, runId, label: labelFor(item) } : entry;
}

async function applyItemInner(item, c) {
  switch (item.action) {
    case 'closeTab': {
      const { tabId, url, title, windowId, index, pinned, bookmarkFirst } = item.data;
      const live = await c.tabs.get(tabId).catch(() => null);
      if (!live || live.url !== url) throw new StaleTabError(`Tab ${tabId} no longer matches ${url}`);
      if (bookmarkFirst) {
        const folder = await ensureFolder(['Browser Organizer', 'Saved before closing'], c);
        await c.bookmarks.create({ parentId: folder.id, title: title || url, url });
      }
      await c.tabs.remove(tabId);
      return { undoId: undoId(), ts: Date.now(), action: 'closeTab', reverse: { url, windowId, index, pinned } };
    }
    case 'groupTabs': {
      const { tabIds, groupName, color } = item.data;
      const groupId = await c.tabs.group({ tabIds });
      await c.tabGroups.update(groupId, { title: groupName, color: COLORS.has(color) ? color : 'grey' });
      return { undoId: undoId(), ts: Date.now(), action: 'groupTabs', reverse: { tabIds } };
    }
    case 'createBookmark': {
      const { url, title, folderPath } = item.data;
      const folder = await ensureFolder(folderPath, c);
      const bm = await c.bookmarks.create({ parentId: folder.id, title: title || url, url });
      return { undoId: undoId(), ts: Date.now(), action: 'createBookmark', reverse: { bookmarkId: bm.id } };
    }
    case 'deleteBookmark': {
      const { bookmarkId, parentId, index, title, url } = item.data;
      await c.bookmarks.remove(bookmarkId);
      return { undoId: undoId(), ts: Date.now(), action: 'deleteBookmark', reverse: { parentId, index, title, url } };
    }
    default:
      throw new Error(`Unknown action: ${item.action}`);
  }
}
