import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { checkDeadLinks } from '../extension/lib/bookmark-health.js';

// Integration test: exercises the real dead-link HTTP logic (HEAD requests,
// manual redirect handling, status interpretation) against a live server —
// more realistic than the mocked unit test. The bookmark URLs use a non-private
// host (loopback is intentionally skipped); fetchFn maps it to the real server,
// which is the only indirection. Covers the fetch path that the in-browser flow
// can't automate (the <all_urls> permission bubble isn't grantable headless).
test('checkDeadLinks against a real server: flags 404/410, spares 200/redirects, skips private hosts', async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === '/dead') { res.writeHead(404); res.end(); return; }
    if (req.url === '/gone') { res.writeHead(410); res.end(); return; }
    if (req.url === '/redir') { res.writeHead(302, { location: '/ok' }); res.end(); return; }
    if (req.url === '/forbidden') { res.writeHead(403); res.end(); return; }
    res.writeHead(200); res.end('ok');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();

  // Map the non-private test host to the loopback server (loopback bookmarks are
  // skipped by isPrivateHost, so we can't point bookmarks straight at 127.0.0.1).
  const fetchFn = (url, opts) => {
    const u = new URL(url);
    return fetch(`http://127.0.0.1:${port}${u.pathname}`, opts);
  };

  const bms = [
    { id: '1', url: 'http://deadlink.test/ok', parentId: '1', index: 0, title: 'ok' },
    { id: '2', url: 'http://deadlink.test/dead', parentId: '1', index: 1, title: 'dead' },
    { id: '3', url: 'http://deadlink.test/gone', parentId: '1', index: 2, title: 'gone' },
    { id: '4', url: 'http://deadlink.test/redir', parentId: '1', index: 3, title: 'redirect' },
    { id: '5', url: 'http://deadlink.test/forbidden', parentId: '1', index: 4, title: 'forbidden' },
    { id: '6', url: 'http://192.168.0.1/dead', parentId: '1', index: 5, title: 'private' },
  ];

  try {
    const items = await checkDeadLinks(bms, { fetchFn, concurrency: 3 });
    const ids = items.map((i) => i.data.bookmarkId).sort();
    // Only definitive 404/410 are dead. 200, 3xx (not followed), 403, and the
    // private host are all left alone.
    assert.deepEqual(ids, ['2', '3']);
  } finally {
    srv.closeAllConnections?.();
    await new Promise((r) => srv.close(r));
  }
});
