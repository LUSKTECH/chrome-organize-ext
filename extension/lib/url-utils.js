export function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Canonical form for duplicate detection: lowercase host, no hash, no trailing
// slash on the path. Query string is preserved (it can be semantically meaningful).
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (u.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1);
    if (u.pathname === '/' && u.search === '') s = `${u.protocol}//${u.host}`;
    return s;
  } catch {
    return url;
  }
}
