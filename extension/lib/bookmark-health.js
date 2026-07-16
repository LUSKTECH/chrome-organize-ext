import { normalizeUrl, isHttpUrl, isPrivateHost } from './url-utils.js';

// `opts.category` ('duplicate' | 'stale' | 'dead' | 'other') and `opts.httpStatus`
// (numeric, dead links only) let the panel group cleanup proposals by reason/status.
export function deleteItem(b, reason, opts = {}) {
  const { category = 'other', httpStatus } = opts || {};
  const data = { bookmarkId: b.id, parentId: b.parentId, index: b.index, title: b.title, url: b.url };
  if (httpStatus != null) data.httpStatus = httpStatus;
  return {
    itemId: `del-${b.id}`,
    action: 'deleteBookmark',
    status: 'pending',
    reason,
    category,
    data,
  };
}

export function findDuplicateBookmarks(bookmarks) {
  const seen = new Map();
  const items = [];
  for (const b of bookmarks) {
    if (!b.url) continue;
    const key = normalizeUrl(b.url);
    if (seen.has(key)) items.push(deleteItem(b, `Duplicate of "${seen.get(key).title || seen.get(key).url}"`, { category: 'duplicate' }));
    else seen.set(key, b);
  }
  return items;
}

export function findStaleBookmarks(bookmarks, visitsMap, thresholdDays, now) {
  const cutoff = now - thresholdDays * 86400000;
  return bookmarks
    .filter((b) => b.url)
    .filter((b) => (visitsMap.get(normalizeUrl(b.url)) ?? b.dateAdded ?? 0) < cutoff)
    .map((b) => deleteItem(b, `Not visited in ${thresholdDays}+ days`, { category: 'stale' }));
}

export async function getVisitsMap(bookmarks, chromeApi = chrome) {
  const map = new Map();
  for (const b of bookmarks) {
    if (!isHttpUrl(b.url)) continue;
    const norm = normalizeUrl(b.url);
    const variants = new Set([b.url, norm, norm.endsWith('/') ? norm.slice(0, -1) : `${norm}/`]);
    let latest = 0;
    for (const v of variants) {
      const visits = await chromeApi.history.getVisits({ url: v });
      for (const visit of visits) latest = Math.max(latest, visit.visitTime);
    }
    if (latest) map.set(norm, latest);
  }
  return map;
}

// Returns the numeric HTTP status, or 0 for an unreachable host (connection/DNS
// error), or -1 for a timeout. Redirects are NOT followed (redirect: 'manual'),
// so the status reflects the bookmark's own URL.
async function probeStatus(url, fetchFn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetchFn(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetchFn(url, { method: 'GET', redirect: 'manual', signal: controller.signal });
    }
    // Under redirect:'manual' the browser returns an opaque-redirect response
    // (type 'opaqueredirect', status 0). That's a live redirect, not a dead host,
    // so report it as a redirect (302) rather than letting status 0 read as unreachable.
    if (res.type === 'opaqueredirect') return 302;
    return res.status;
  } catch (err) {
    if (err && err.name === 'AbortError') return -1; // timeout
    return 0; // unreachable
  } finally {
    clearTimeout(timer);
  }
}

// Maps a probed status to a dead-link reason, or null if the link is alive.
// Dead = a definitive 404/410, or an unreachable host (0). Timeouts (-1) and
// everything else (2xx/3xx/401/403/5xx) are treated as alive (conservative).
function deadReason(status) {
  if (status === 404 || status === 410) return `HTTP ${status}`;
  if (status === 0) return 'unreachable';
  return null;
}

// Increment a strike for each currently-dead id; clear strikes for ids that
// recovered (not in deadIds). Confirm deletion only at >=2 strikes.
// Tracks consecutive "dead" observations per bookmark, confirming deletion only
// at >=2. `scannedIds` are the ids actually checked this pass; ids NOT scanned
// (a different pagination slice) keep their prior strike, and ids scanned but
// found alive are reset. Defaults to `deadIds` for callers that scan everything.
export function recordDeadStrikes(prevStrikes, deadIds, scannedIds = deadIds) {
  const deadSet = new Set(deadIds);
  const strikes = { ...prevStrikes };
  const confirmed = [];
  for (const id of scannedIds) {
    if (deadSet.has(id)) {
      strikes[id] = (prevStrikes[id] || 0) + 1;
      if (strikes[id] >= 2) confirmed.push(id);
    } else {
      delete strikes[id]; // scanned and alive → reset
    }
  }
  return { strikes, confirmed };
}

export function dedupeDeletes(items) {
  const byId = new Map();
  for (const it of items) {
    const key = it.data.bookmarkId;
    if (byId.has(key)) {
      const merged = byId.get(key);
      if (!merged.reason.includes(it.reason)) merged.reason = `${merged.reason}; ${it.reason}`;
    } else {
      byId.set(key, { ...it, reason: it.reason });
    }
  }
  return [...byId.values()];
}

export async function checkDeadLinks(bookmarks, deps = {}) {
  const fetchFn = deps.fetchFn || ((url, opts) => fetch(url, opts));
  const timeoutMs = deps.timeoutMs ?? 8000;
  const concurrency = deps.concurrency ?? 6;
  const queue = bookmarks.filter((b) => isHttpUrl(b.url) && !isPrivateHost(b.url));
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      const b = queue[idx++];
      const status = await probeStatus(b.url, fetchFn, timeoutMs);
      const reason = deadReason(status);
      if (reason) results.push(deleteItem(b, `Dead link (${reason})`, { category: 'dead', httpStatus: status }));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}
