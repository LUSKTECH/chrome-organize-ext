// Plan summarization shared by the background worker (digest notification) and
// the panel UI. Lives in lib/ so the background never depends on the UI layer.
export function summarize(items) {
  const out = {};
  for (const it of items) out[it.action] = (out[it.action] || 0) + 1;
  return out;
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
  if (c.moveBookmark) parts.push(`${c.moveBookmark} to sort`);
  if (c.removeFolder) parts.push(`${c.removeFolder} empty folder${c.removeFolder > 1 ? 's' : ''}`);
  // Defensive: never emit a leading " — open to review." if some future action
  // type isn't itemized above.
  if (!parts.length) parts.push(`${items.length} change${items.length > 1 ? 's' : ''}`);
  return `${parts.join(', ')} — open to review.`;
}
