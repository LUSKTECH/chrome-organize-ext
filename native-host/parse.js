export function parseJsonBlock(text) {
  const t = String(text).trim();
  try { return JSON.parse(t); } catch { /* try harder */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch { /* fall through */ } }
  const brace = t.match(/[\{\[][\s\S]*[\}\]]/);
  if (brace) { try { return JSON.parse(brace[0]); } catch { /* fall through */ } }
  throw new Error('No JSON found in model output');
}

const COLORS = new Set(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);

export function parseGroupResult(text) {
  const obj = parseJsonBlock(text);
  if (!obj || !Array.isArray(obj.groups)) throw new Error('Expected {"groups":[...]}');
  return obj.groups
    .map((g) => ({
      name: String(g.name ?? 'Group').slice(0, 40),
      color: COLORS.has(g.color) ? g.color : 'grey',
      tabIds: (Array.isArray(g.tabIds) ? g.tabIds : []).map(Number).filter(Number.isInteger),
    }))
    .filter((g) => g.tabIds.length > 0);
}

export function parseStaleResult(text) {
  const obj = parseJsonBlock(text);
  if (!obj || !Array.isArray(obj.close)) throw new Error('Expected {"close":[...]}');
  return obj.close
    .filter((c) => Number.isInteger(Number(c.tabId)))
    .map((c) => ({ tabId: Number(c.tabId), reason: String(c.reason ?? ''), suggestBookmark: !!c.suggestBookmark }));
}

export function parseImportantResult(text) {
  const obj = parseJsonBlock(text);
  if (!obj || !Array.isArray(obj.important)) throw new Error('Expected {"important":[...]}');
  return obj.important
    .filter((i) => Number.isInteger(Number(i.tabId)))
    .map((i) => ({
      tabId: Number(i.tabId),
      folderPath: (Array.isArray(i.folderPath) ? i.folderPath : []).map(String).filter(Boolean),
      reason: String(i.reason ?? ''),
    }));
}
