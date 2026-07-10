import { collectTabs } from './tab-collector.js';
import { collectBookmarks } from './bookmark-collector.js';
import { indexById, mapGroupResult, mapStaleResult, mapImportantResult, validatePlanItem } from './plan.js';
import { findDuplicateBookmarks, findStaleBookmarks, getVisitsMap, checkDeadLinks } from './bookmark-health.js';
import { applyItem as defaultApplyItem } from './executor.js';
import { recordUndo as defaultRecordUndo } from './undo-log.js';

export function partitionForApply(items, settings) {
  if (settings.automationMode === 'auto') return { autoApply: items, needsReview: [] };
  return { autoApply: [], needsReview: items };
}

// Builds the full plan for the enabled features. `deps` is injectable for tests;
// in production it defaults to real collectors + a native client passed in.
export async function buildPlan(deps) {
  const { settings, nativeClient, chromeApi = chrome, now = Date.now() } = deps;
  const activity = (await chromeApi.storage.local.get('tabActivity')).tabActivity || {};
  const tabs = await collectTabs(chromeApi, activity, now);
  const byId = indexById(tabs);
  const items = [];
  const f = settings.enabledFeatures;

  if (f.groupTabs && tabs.length) {
    const r = await nativeClient.request({ type: 'organize', task: 'group', payload: { tabs } });
    items.push(...mapGroupResult(r.groups));
  }
  if (f.staleTabs && tabs.length) {
    const stale = tabs.filter((t) => t.idleDays >= settings.staleTabDays);
    if (stale.length) {
      const r = await nativeClient.request({ type: 'organize', task: 'stale', payload: { tabs: stale, thresholdDays: settings.staleTabDays } });
      items.push(...mapStaleResult(r.stale, byId));
    }
  }
  if (f.importantBookmarks && tabs.length) {
    const r = await nativeClient.request({ type: 'organize', task: 'important', payload: { tabs } });
    items.push(...mapImportantResult(r.important, byId));
  }
  if (f.cleanBookmarks) {
    const bookmarks = await collectBookmarks(chromeApi);
    const visits = await getVisitsMap(bookmarks, chromeApi);
    items.push(...findDuplicateBookmarks(bookmarks));
    items.push(...findStaleBookmarks(bookmarks, visits, settings.staleBookmarkDays, now));
    items.push(...await checkDeadLinks(bookmarks, {}));
  }

  return items.filter(validatePlanItem);
}

export async function applyItems(items, deps = {}) {
  const applyItem = deps.applyItem || ((item) => defaultApplyItem(item, {}));
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
