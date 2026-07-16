export function flattenBookmarks(nodes, path = []) {
  const out = [];
  for (const n of nodes) {
    if (n.url) {
      out.push({
        id: n.id,
        parentId: n.parentId,
        index: n.index,
        title: n.title || '',
        url: n.url,
        dateAdded: n.dateAdded || 0,
        path,
      });
    }
    if (n.children) {
      const childPath = n.title ? [...path, n.title] : path;
      out.push(...flattenBookmarks(n.children, childPath));
    }
  }
  return out;
}

export async function collectBookmarks(chromeApi = chrome) {
  const tree = await chromeApi.bookmarks.getTree();
  return flattenBookmarks(tree);
}

// Special root folder ids (stable across Chrome/Edge). '0' is the invisible
// root; '1' Bookmarks Bar, '2' Other Bookmarks, '3' Mobile Bookmarks.
export const ROOT_IDS = new Set(['0', '1', '2', '3']);
export const BAR_ID = '1';
export const OTHER_ID = '2';

// A bookmark is "not in a folder" when it sits directly under a root.
export function isUnfiled(b) { return ROOT_IDS.has(b.parentId); }

function walkTree(nodes, path, out) {
  for (const n of nodes) {
    if (n.url) {
      out.bookmarks.push({ id: n.id, parentId: n.parentId, index: n.index, title: n.title || '', url: n.url, dateAdded: n.dateAdded || 0, path });
    } else if (n.id === '0') {
      if (n.children) walkTree(n.children, path, out); // invisible root: recurse, don't emit
    } else {
      const selfPath = [...path, n.title || ''];
      out.folders.push({ id: n.id, parentId: n.parentId, index: n.index, title: n.title || '', path: selfPath, childCount: (n.children || []).length, isRoot: ROOT_IDS.has(n.id) });
      if (n.children) walkTree(n.children, selfPath, out);
    }
  }
}

// Like collectBookmarks but keeps folder nodes too. Returns { bookmarks, folders }.
export async function collectTree(chromeApi = chrome) {
  const tree = await chromeApi.bookmarks.getTree();
  const out = { bookmarks: [], folders: [] };
  walkTree(tree, [], out);
  return out;
}
