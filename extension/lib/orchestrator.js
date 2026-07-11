import { collectTabs } from './tab-collector.js';
import { collectBookmarks } from './bookmark-collector.js';
import { reconcile } from './activity-tracker.js';
import { indexById, mapGroupResult, mapStaleResult, mapImportantResult, validatePlanItem } from './plan.js';
import { findDuplicateBookmarks, findStaleBookmarks, getVisitsMap, checkDeadLinks, recordDeadStrikes, dedupeDeletes } from './bookmark-health.js';
import { findDuplicateTabs } from './tab-health.js';
import { applyItem as defaultApplyItem } from './executor.js';
import { recordUndo as defaultRecordUndo } from './undo-log.js';
import { redactUrl } from './url-utils.js';

export function partitionForApply(items, settings) {
  if (settings.automationMode !== 'auto') return { autoApply: [], needsReview: items };
  const autoApply = items.filter((i) => i.action !== 'deleteBookmark');
  const needsReview = items.filter((i) => i.action === 'deleteBookmark');
  return { autoApply, needsReview };
}

// What we actually send to the native host: a minimal, explicit projection so
// no incidental tab fields (or future additions) leak to the model.
export function projectTabsForHost(tabs) {
  return tabs.map((t) => ({ tabId: t.tabId, title: t.title, url: redactUrl(t.url), idleDays: t.idleDays, pinned: !!t.pinned }));
}

// Builds the full plan for the enabled features. `deps` is injectable for tests;
// in production it defaults to real collectors + a native client passed in.
export async function buildPlan(deps) {
  const { settings, nativeClient, chromeApi = chrome, now = Date.now() } = deps;
  const onProgress = deps.onProgress || (() => {});
  const shouldCancel = deps.shouldCancel || (() => false);
  const PHASES = 5;
  let done = 0;
  const step = (label) => { onProgress(label, done++, PHASES); };

  const rawTabs = await chromeApi.tabs.query({});
  const priorActivity = (await chromeApi.storage.local.get('tabActivity')).tabActivity || {};
  const activity = reconcile(priorActivity, rawTabs, now);
  await chromeApi.storage.local.set({ tabActivity: activity });
  const tabs = await collectTabs(chromeApi, activity, now, deps.windowId ?? null);
  const byId = indexById(tabs);
  const items = [];
  const f = { ...settings.enabledFeatures, ...(deps.features || {}) };
  const rules = decisionRules(settings.decisions || {}).keep.join('; ');
  const adapter = settings.adapter || 'claude';

  step('Finding duplicate tabs');
  if (shouldCancel()) return finalizePlan(items, settings);
  if (f.dupeTabs && tabs.length) {
    items.push(...findDuplicateTabs(tabs));
  }

  step('Grouping tabs');
  if (shouldCancel()) return finalizePlan(items, settings);
  if (f.groupTabs && tabs.length) {
    // Respect existing Chrome tab groups: only offer to group currently-ungrouped
    // tabs, so re-running doesn't propose new groups over already-organized ones.
    const ungrouped = tabs.filter((t) => (t.groupId ?? -1) === -1);
    if (ungrouped.length) {
      const r = await nativeClient.request({ type: 'organize', task: 'group', adapter, payload: { tabs: projectTabsForHost(ungrouped), rules } });
      items.push(...mapGroupResult(r.groups, byId));
    }
  }

  step('Finding forgotten tabs');
  if (shouldCancel()) return finalizePlan(items, settings);
  if (f.staleTabs && tabs.length) {
    const stale = tabs.filter((t) => t.idleDays >= settings.staleTabDays && !t.pinned); // never propose closing pinned tabs
    if (stale.length) {
      const candidateIds = new Set(stale.map((t) => t.tabId));
      const r = await nativeClient.request({ type: 'organize', task: 'stale', adapter, payload: { tabs: projectTabsForHost(stale), thresholdDays: settings.staleTabDays, rules } });
      items.push(...mapStaleResult(r.stale, byId, candidateIds));
    }
  }

  step('Finding tabs to bookmark');
  if (shouldCancel()) return finalizePlan(items, settings);
  if (f.importantBookmarks && tabs.length) {
    const r = await nativeClient.request({ type: 'organize', task: 'important', adapter, payload: { tabs: projectTabsForHost(tabs), rules } });
    items.push(...mapImportantResult(r.important, byId));
  }

  step('Cleaning bookmarks');
  if (shouldCancel()) return finalizePlan(items, settings);
  if (f.cleanBookmarks) {
    const bookmarks = await collectBookmarks(chromeApi);
    const visits = await getVisitsMap(bookmarks, chromeApi);
    const deletes = [];
    deletes.push(...findDuplicateBookmarks(bookmarks));
    deletes.push(...findStaleBookmarks(bookmarks, visits, settings.staleBookmarkDays, now));
    if (f.deadLinkScan && await hasAllUrls(chromeApi)) {
      const httpBookmarks = bookmarks.filter((b) => /^https?:/i.test(b.url));
      const cursor = (await chromeApi.storage.local.get('deadCursor')).deadCursor || 0;
      const { slice, nextCursor } = sliceForScan(httpBookmarks, cursor, settings.deadLinkBatchSize);
      await chromeApi.storage.local.set({ deadCursor: nextCursor });
      const deadCandidates = await checkDeadLinks(slice, {});
      const prevStrikes = (await chromeApi.storage.local.get('deadStrikes')).deadStrikes || {};
      // Pass the ids actually scanned this batch so strikes for bookmarks in
      // OTHER (unscanned) slices are carried forward, not silently reset —
      // otherwise pagination means a strike never survives to reach 2.
      const scannedIds = slice.map((b) => b.id);
      const { strikes, confirmed } = recordDeadStrikes(prevStrikes, deadCandidates.map((d) => d.data.bookmarkId), scannedIds);
      await chromeApi.storage.local.set({ deadStrikes: strikes });
      const confirmedSet = new Set(confirmed);
      deletes.push(...deadCandidates.filter((d) => confirmedSet.has(d.data.bookmarkId)));
    }
    items.push(...dedupeDeletes(deletes));
  }

  return finalizePlan(items, settings);
}

// Single tail for every buildPlan return path (including cancellation): dedupe
// tab-close/suspend actions by tab, drop malformed items, apply the ignore-list.
export function dedupeTabActions(items) {
  const seen = new Set();
  return items.filter((it) => {
    if (it.action !== 'closeTab' && it.action !== 'discardTab') return true;
    const key = it.data && it.data.tabId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Drops destructive actions (close/discard/delete) targeting a whitelisted host,
// so users can protect domains ("never touch github.com") outright.
export function applyWhitelist(items, whitelist = []) {
  const hosts = whitelist.map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  if (!hosts.length) return items;
  const PROTECTED = new Set(['closeTab', 'discardTab', 'deleteBookmark']);
  const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };
  const matches = (h) => h && hosts.some((w) => h === w || h.endsWith('.' + w));
  return items.filter((it) => !(PROTECTED.has(it.action) && matches(hostOf(it.data && it.data.url))));
}

export function finalizePlan(items, settings) {
  const s = settings || {};
  const cleaned = applyWhitelist(dedupeTabActions(items).filter(validatePlanItem), s.whitelist || []);
  return applyIgnoreList(cleaned, s.ignore || []);
}

// Runs a free-text natural-language instruction over the current tab set and
// maps the model's response into the same PlanItem shape as buildPlan, so it
// goes through the exact same review/apply/undo path.
export async function runCommand(instruction, deps) {
  const { nativeClient, chromeApi = chrome, now = Date.now(), windowId = null, decisions = {}, adapter = 'claude' } = deps;
  const activity = (await chromeApi.storage.local.get('tabActivity')).tabActivity || {};
  const tabs = await collectTabs(chromeApi, activity, now, windowId);
  const byId = indexById(tabs);
  const candidateIds = new Set(tabs.map((t) => t.tabId));
  const rules = decisionRules(decisions).keep.join('; ');
  const r = await nativeClient.request({ type: 'command', adapter, payload: { instruction, tabs: projectTabsForHost(tabs), rules } });
  return [
    ...mapGroupResult(r.groups, byId),
    ...mapStaleResult(r.close, byId, candidateIds),
    ...mapImportantResult(r.important, byId),
  ].filter(validatePlanItem);
}

export async function hasAllUrls(chromeApi = chrome) {
  if (!chromeApi.permissions) return false;
  return chromeApi.permissions.contains({ origins: ['<all_urls>'] });
}

export function ignoreKey(item) {
  const d = item.data || {};
  const target = d.url || (d.tabIds ? `group:${d.groupName}` : d.bookmarkId || '');
  return `${item.action}:${redactUrl(String(target))}`;
}

// Only rejections drive behavior: repeated "never suggest this" become rules
// fed back into future prompts. (The approve/"relax caution" side was never
// wired and was removed — it risked auto-acting on merely-often-approved targets.)
export function recordDecision(decisions, item, verdict) {
  if (verdict !== 'reject') return decisions;
  const key = ignoreKey(item);
  const prev = decisions[key] || {};
  return { ...decisions, [key]: { reject: (prev.reject || 0) + 1 } };
}

export function decisionRules(decisions) {
  const keep = [];
  for (const [key, v] of Object.entries(decisions)) {
    if (v.reject >= 2) keep.push(`Do not suggest actions on ${key.split(':').slice(1).join(':')}`);
  }
  return { keep };
}

export function applyIgnoreList(items, ignore = []) {
  const set = new Set(ignore);
  return items.filter((it) => !set.has(ignoreKey(it)));
}

export function sliceForScan(items, cursor, batchSize) {
  const start = cursor % Math.max(1, items.length);
  const slice = items.slice(start, start + batchSize);
  const end = start + slice.length;
  return { slice, nextCursor: end >= items.length ? 0 : end };
}

export async function applyItems(items, deps = {}) {
  const runId = deps.runId || `run-${Date.now()}`;
  const applyItem = deps.applyItem || ((item) => defaultApplyItem(item, { runId }));
  const recordUndo = deps.recordUndo || defaultRecordUndo;
  const applied = [];
  const failed = [];
  const undos = [];
  for (const item of items) {
    try {
      const undo = await applyItem(item);
      if (undo) undos.push(undo);
      applied.push(item.itemId);
    } catch {
      failed.push(item.itemId);
    }
  }
  if (undos.length) await recordUndo(undos);
  return { applied, failed };
}
