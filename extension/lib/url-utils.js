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

export function redactUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    u.username = ''; // never ship embedded basic-auth credentials to the model
    u.password = '';
    return u.toString();
  } catch {
    return url;
  }
}

// Extract a dotted-quad IPv4 embedded in an IPv6 literal, covering the mapped
// (::ffff:a.b.c.d), compressed-hex (::ffff:aabb:ccdd), and NAT64 (64:ff9b::…)
// forms the URL parser can produce. Returns 'a.b.c.d' or ''.
function embeddedV4(h) {
  const dotted = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  // Trailing two hextets encode the 32-bit v4 (e.g. ::ffff:a9fe:a9fe → 169.254.169.254).
  const hex = h.match(/:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex && /^(::ffff:|64:ff9b:|::)/.test(h)) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return '';
}

// True for hosts that must not be sent to a remote model (egress coarsening) and
// must not be fetched by the dead-link checker (SSRF guard). Fails CLOSED:
// unparseable/ambiguous hosts are treated as private.
export function isPrivateHost(url) {
  let h;
  try { h = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase(); }
  catch { return true; }
  if (!h) return true;
  if (h.includes(':')) { // IPv6
    if (h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true; // loopback, unspecified, ULA (fc00::/7), link-local (fe80::/10)
    // IPv4-mapped/embedded forms (::ffff:a.b.c.d, ::ffff:aabb:ccdd, NAT64
    // 64:ff9b::/96) would otherwise slip past the v4 checks below — a real SSRF
    // hole to 127.x / 10.x / 169.254.x. Pull out the trailing embedded v4 (dotted
    // or the last two hextets) and re-run the dotted-quad checks on it.
    const v4 = embeddedV4(h);
    if (v4) return isPrivateHost(`http://${v4}`);
    return false;
  }
  if (h === 'localhost' || h.endsWith('.local')) return true;
  if (h === '0.0.0.0') return true;
  // Non-dotted-decimal IPv4 encodings (decimal/hex integer hosts) can smuggle
  // internal targets past dotted-quad checks — treat any bare-integer host as private.
  if (/^0x[0-9a-f]+$/.test(h) || /^\d+$/.test(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}
