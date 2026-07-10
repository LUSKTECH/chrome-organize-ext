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
    .filter((b) => (visitsMap.get(normalizeUrl(b.url)) ?? b.dateAdded ?? 0) < cutoff)
    .map((b) => deleteItem(b, `Not visited in ${thresholdDays}+ days`));
}

export async function getVisitsMap(bookmarks, chromeApi = chrome) {
  const map = new Map();
  for (const b of bookmarks) {
    if (!isHttpUrl(b.url)) continue;
    const visits = await chromeApi.history.getVisits({ url: b.url });
    if (visits.length) map.set(normalizeUrl(b.url), Math.max(...visits.map((v) => v.visitTime)));
  }
  return map;
}

async function isDead(url, fetchFn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    if (res.status === 404 || res.status === 410) return `HTTP ${res.status}`;
    return null;
  } catch (err) {
    if (err && err.name === 'AbortError') return null; // timeout != dead (conservative)
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

// Increment a strike for each currently-dead id; clear strikes for ids that
// recovered (not in deadIds). Confirm deletion only at >=2 strikes.
export function recordDeadStrikes(prevStrikes, deadIds) {
  const strikes = {};
  const confirmed = [];
  for (const id of deadIds) {
    strikes[id] = (prevStrikes[id] || 0) + 1;
    if (strikes[id] >= 2) confirmed.push(id);
  }
  // ids in prevStrikes that recovered are simply dropped (strike reset).
  return { strikes, confirmed };
}

export async function checkDeadLinks(bookmarks, deps = {}) {
  const fetchFn = deps.fetchFn || ((url, opts) => fetch(url, opts));
  const timeoutMs = deps.timeoutMs ?? 8000;
  const concurrency = deps.concurrency ?? 6;
  const queue = bookmarks.filter((b) => isHttpUrl(b.url));
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      const b = queue[idx++];
      const dead = await isDead(b.url, fetchFn, timeoutMs);
      if (dead) results.push(deleteItem(b, `Dead link (${dead})`));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}
