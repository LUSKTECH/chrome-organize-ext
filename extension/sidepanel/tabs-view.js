// The direct open-tabs list: filter, multi-select, and bulk-close — no AI. Owns
// its own openTabs/tabSelection state; the only outward call is showUndoToast()
// after a close so the just-closed tabs are one click from being reopened.
import { $, send, setStatus, currentScopeWindowId } from './dom.js';
import { filterTabs } from './viewmodel.js';
import { showUndoToast } from './undo.js';

let openTabs = [];
let tabSelection = new Set();

function drawTabs() {
  const shown = filterTabs(openTabs, $('tabFilter').value);
  const list = $('tabList');
  list.textContent = '';
  for (const t of shown) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = tabSelection.has(t.id);
    cb.addEventListener('change', () => { if (cb.checked) tabSelection.add(t.id); else tabSelection.delete(t.id); });
    const span = document.createElement('span');
    span.textContent = `${t.pinned ? '📌 ' : ''}${t.title || t.url}`;
    span.title = t.url;
    label.append(cb, span);
    // Non-http tabs (chrome://, edge://, about:, extensions) are shown but tagged
    // so it's clear they're browser pages, not normal sites.
    if (!/^https?:/i.test(t.url || '')) {
      li.classList.add('nonHttp');
      const tag = document.createElement('span');
      tag.className = 'tabTag';
      tag.textContent = 'browser page';
      label.append(tag);
    }
    li.appendChild(label);
    list.appendChild(li);
  }
  $('tabCount').textContent = `${shown.length} of ${openTabs.length} tabs`;
}

async function renderTabs() {
  const res = await send({ cmd: 'listOpenTabs', windowId: await currentScopeWindowId() });
  // Don't blank the list on a dropped/failed reply (SW asleep) — surface it and
  // keep whatever's shown, consistent with the closeTabsBtn handler.
  if (!res || !res.ok) { setStatus(`Error: ${(res && res.error) || 'could not list tabs'}`); return; }
  openTabs = res.tabs || [];
  tabSelection = new Set([...tabSelection].filter((id) => openTabs.some((t) => t.id === id)));
  drawTabs();
}

export function initTabsView() {
  $('tabsPanel').addEventListener('toggle', () => { if ($('tabsPanel').open) renderTabs(); });
  $('tabFilter').addEventListener('input', drawTabs);
  $('closeTabsBtn').addEventListener('click', async () => {
    const ids = [...tabSelection];
    if (!ids.length) { setStatus('No tabs selected.'); return; }
    const res = await send({ cmd: 'closeTabs', tabIds: ids });
    if (!res || !res.ok) { setStatus(`Error: ${(res && res.error) || 'close failed'}`); return; }
    tabSelection = new Set();
    setStatus(`Closed ${res.closed} tab${res.closed === 1 ? '' : 's'}.`);
    await renderTabs();
    await showUndoToast();
  });
}
