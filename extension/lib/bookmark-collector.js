// The single leaf-bookmark record shape, shared by both tree walks below so the
// fields can't drift between collectBookmarks and collectTree.
function leafRecord(n, path) {
  return { id: n.id, parentId: n.parentId, index: n.index, title: n.title || '', url: n.url, dateAdded: n.dateAdded || 0, path };
}

export function flattenBookmarks(nodes, path = []) {
  const out = [];
  for (const n of nodes) {
    if (n.url) {
      out.push(leafRecord(n, path));
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

// A bookmark is "not in a folder" when it sits directly under a root. Pass the
// real root-id set from collectTree; defaults to Chrome's ids for callers/tests
// that don't have the live set.
export function isUnfiled(b, rootIds = ROOT_IDS) { return rootIds.has(b.parentId); }

function walkTree(nodes, path, out, rootIds) {
  for (const n of nodes) {
    if (n.url) {
      out.bookmarks.push(leafRecord(n, path));
    } else {
      const selfPath = [...path, n.title || ''];
      out.folders.push({ id: n.id, parentId: n.parentId, index: n.index, title: n.title || '', path: selfPath, childCount: (n.children || []).length, isRoot: rootIds.has(n.id) });
      if (n.children) walkTree(n.children, selfPath, out, rootIds);
    }
  }
}

// Like collectBookmarks but keeps folder nodes and reports the real root ids.
// The permanent top-level folders vary by browser (Chrome: 1/2/3; Edge:
// 1/203/722 including "Workspaces"), so we read them from the tree instead of
// assuming Chrome's ids. Returns { bookmarks, folders, rootIds, barId, otherId }
// where barId is the toolbar/bar root and otherId is the default target for new
// folders (the first non-bar root, i.e. "Other bookmarks"/"Other favourites").
export async function collectTree(chromeApi = chrome) {
  const tree = await chromeApi.bookmarks.getTree();
  const topLevel = (tree[0] && tree[0].children) || [];
  const rootIds = new Set(topLevel.map((n) => n.id));
  const barId = rootIds.has(BAR_ID) ? BAR_ID : ((topLevel[0] && topLevel[0].id) || BAR_ID);
  const otherNode = topLevel.find((n) => n.id !== barId);
  const otherId = (otherNode && otherNode.id) || barId;
  const out = { bookmarks: [], folders: [], rootIds, barId, otherId };
  walkTree(topLevel, [], out, rootIds);
  return out;
}
