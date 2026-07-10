import { normalizeUrl, isHttpUrl } from './url-utils.js';

export function deleteItem(b, reason) {
  return {
    itemId: `del-${b.id}`,
    action: 'deleteBookmark',
    status: 'pending',
    reason,
    data: { bookmarkId: b.id, parentId: b.parentId, index: b.index, title: b.title, url: b.url },
  };
}

export function findDuplicateBookmarks(bookmarks) {
  const seen = new Map();
  const items = [];
  for (const b of bookmarks) {
    if (!b.url) continue;
    const key = normalizeUrl(b.url);
    if (seen.has(key)) items.push(deleteItem(b, `Duplicate of "${seen.get(key).title || seen.get(key).url}"`));
    else seen.set(key, b);
  }
  return items;
}

export function findStaleBookmarks(bookmarks, visitsMap, thresholdDays, now) {
  const cutoff = now - thresholdDays * 86400000;
  return bookmarks
    .filter((b) => b.url)
    .filter((b) => (visitsMap.get(b.url) ?? b.dateAdded ?? 0) < cutoff)
    .map((b) => deleteItem(b, `Not visited in ${thresholdDays}+ days`));
}

export async function getVisitsMap(bookmarks, chromeApi = chrome) {
  const map = new Map();
  for (const b of bookmarks) {
    if (!isHttpUrl(b.url)) continue;
    const visits = await chromeApi.history.getVisits({ url: b.url });
    if (visits.length) map.set(b.url, Math.max(...visits.map((v) => v.visitTime)));
  }
  return map;
}
