function newId() { return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function buildSession(name, tabs, now = Date.now()) {
  return {
    sessionId: newId(),
    name: name || `Session ${new Date(now).toLocaleString()}`,
    ts: now,
    tabs: tabs.map((t) => ({ url: t.url, title: t.title || '', pinned: !!t.pinned })),
  };
}

export function addSession(store, session) { return [...store, session]; }
export function removeSession(store, id) { return store.filter((s) => s.sessionId !== id); }
export function renameSession(store, id, name) {
  return store.map((s) => (s.sessionId === id ? { ...s, name: name || s.name } : s));
}

export async function listSessions() {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  return sessions;
}
export async function saveSessions(sessions) {
  await chrome.storage.local.set({ sessions });
}

// Saves the current window's http tabs as a session. Closes them unless
// deps.close === false ("Save & keep open").
export async function saveCurrentWindowSession(name, deps = {}) {
  const c = deps.chrome || chrome;
  const now = deps.now || Date.now();
  const close = deps.close !== false;
  const win = await c.windows.getCurrent({ populate: true });
  const httpTabs = win.tabs.filter((t) => /^https?:/i.test(t.url || ''));
  const session = buildSession(name, httpTabs, now);
  await saveSessions(addSession(await listSessions(), session));
  if (close) await c.tabs.remove(httpTabs.map((t) => t.id));
  return session;
}

export async function restoreSession(id, deps = {}) {
  const c = deps.chrome || chrome;
  const session = (await listSessions()).find((s) => s.sessionId === id);
  if (!session) return null;
  const win = await c.windows.create({});
  for (const t of session.tabs) await c.tabs.create({ windowId: win.id, url: t.url, pinned: t.pinned, active: false });
  return session;
}
