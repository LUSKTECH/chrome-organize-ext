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
