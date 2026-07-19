import { TAB_GROUP_COLORS } from './colors.js';
import { ACTION_LABELS } from './labels.js';
import { uniqueId as undoId } from './ids.js';
import { ROOT_IDS } from './bookmark-collector.js';

const COLORS = new Set(TAB_GROUP_COLORS);

export class StaleTabError extends Error {}

function labelFor(item) {
  const name = item.data.title || item.data.groupName || item.data.url || '';
  return `${ACTION_LABELS[item.action] || item.action}: ${name}`.trim();
}

// Walk/create a folder path under `rootId` (default the bookmarks bar '1');
// returns the leaf folder id.
export async function ensureFolder(pathParts, chromeApi, rootId = '1') {
  let parentId = rootId;
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
      if (live.pinned) throw new StaleTabError(`Tab ${tabId} is pinned (protected)`); // never close a pinned tab
      let savedBookmarkId = null;
      if (bookmarkFirst) {
        const folder = await ensureFolder(['Browser Organizer', 'Saved before closing'], c);
        const bm = await c.bookmarks.create({ parentId: folder.id, title: title || url, url });
        savedBookmarkId = bm && bm.id;
      }
      await c.tabs.remove(tabId);
      // Record the safety bookmark so undo is a clean inverse (reopen + delete it).
      return { undoId: undoId(), ts: Date.now(), action: 'closeTab', reverse: { url, windowId, index, pinned, savedBookmarkId } };
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
      // Staleness guard (mirrors closeTab): the plan captured this bookmark at
      // scan time. If the user has since edited its URL, don't delete the now-
      // different bookmark, and don't let undo resurrect a stale snapshot.
      const live = await c.bookmarks.get(bookmarkId).then((r) => r && r[0]).catch(() => null);
      if (!live || live.url !== url) throw new StaleTabError(`Bookmark ${bookmarkId} no longer matches ${url}`);
      await c.bookmarks.remove(bookmarkId);
      return { undoId: undoId(), ts: Date.now(), action: 'deleteBookmark', reverse: { parentId: live.parentId ?? parentId, index: live.index ?? index, title: live.title ?? title, url: live.url } };
    }
    case 'moveBookmark': {
      const { bookmarkId, fromParentId, fromIndex, toParentId, toFolderPath, toRootId } = item.data;
      // Capture the live origin so undo restores correctly even if the plan's
      // fromParentId/fromIndex are stale or missing.
      const cur = await c.bookmarks.get(bookmarkId).then((r) => r && r[0]).catch(() => null) || {};
      const parentId = toParentId || (await ensureFolder(toFolderPath || [], c, toRootId || '2')).id;
      await c.bookmarks.move(bookmarkId, { parentId });
      return { undoId: undoId(), ts: Date.now(), action: 'moveBookmark', reverse: { bookmarkId, parentId: fromParentId ?? cur.parentId, index: fromIndex ?? cur.index } };
    }
    case 'removeFolder': {
      const { folderId, parentId, index, title } = item.data;
      // Guards (independent of the planner): never touch a root (by classic id
      // OR any top-level node — Edge's roots aren't 0/1/2/3), never remove a
      // folder that still has children at apply time (keeps partial-apply safe).
      if (ROOT_IDS.has(folderId) || parentId === '0') return { undoId: undoId(), ts: Date.now(), action: 'removeFolder', reverse: null, skipped: true };
      // The folder may already be gone (user deleted it before apply) — treat a
      // failed lookup as a skip so the batch keeps going.
      const kids = await c.bookmarks.getChildren(folderId).catch(() => null);
      if (!kids || kids.length) return { undoId: undoId(), ts: Date.now(), action: 'removeFolder', reverse: null, skipped: true };
      await c.bookmarks.remove(folderId);
      return { undoId: undoId(), ts: Date.now(), action: 'removeFolder', reverse: { parentId, index, title } };
    }
    case 'discardTab': {
      await c.tabs.discard(item.data.tabId);
      return { undoId: undoId(), ts: Date.now(), action: 'discardTab', reverse: {} };
    }
    default:
      throw new Error(`Unknown action: ${item.action}`);
  }
}
