import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/chrome-mock.js';
import { buildSession, addSession, removeSession, listSessions, saveSessions } from '../extension/lib/sessions.js';

beforeEach(() => installChromeMock());

test('buildSession captures url/title/pinned', () => {
  const s = buildSession('Research', [{ url: 'https://a.com', title: 'A', pinned: false, id: 1, windowId: 1, index: 0 }], 123);
  assert.equal(s.name, 'Research');
  assert.equal(s.ts, 123);
  assert.equal(s.tabs[0].url, 'https://a.com');
  assert.ok(s.sessionId);
});

test('add/remove/list round-trips through storage', async () => {
  const s = buildSession('X', [], 1);
  await saveSessions(addSession([], s));
  assert.equal((await listSessions()).length, 1);
  await saveSessions(removeSession(await listSessions(), s.sessionId));
  assert.equal((await listSessions()).length, 0);
});
