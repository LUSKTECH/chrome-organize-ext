const LABELS = {
  closeTab: 'Close tab',
  groupTabs: 'Group tabs',
  createBookmark: 'Bookmark tab',
  deleteBookmark: 'Delete bookmark',
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
