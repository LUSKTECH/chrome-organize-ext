import { getSettings, setSettings } from '../lib/storage.js';
import { ignoreKey } from '../lib/orchestrator.js';
import {
  summarize, groupByAction, toggleSelection, selectedItems, actionLabel,
  excludeMember, renameGroup, recolorGroup, healthMessage, progressLabel, groupUndoByRun, toMarkdown,
} from './viewmodel.js';

const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

let plan = [];
let selection = new Set();
const expandedGroups = new Set();

const $ = (id) => document.getElementById(id);
const setStatus = (t) => { $('status').textContent = t; };

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

let scanPort = null;
function ensureScanPort() {
  if (scanPort) return scanPort;
  scanPort = chrome.runtime.connect({ name: 'scan' });
  scanPort.onMessage.addListener((msg) => {
    if (msg.progress) {
      const { phase, done, total } = msg.progress;
      setStatus(progressLabel(phase, done, total));
    }
  });
  scanPort.onDisconnect.addListener(() => { scanPort = null; });
  return scanPort;
}

// Persists an edited plan item locally and pushes the full plan to the
// service worker so it survives panel reloads.
function updatePlanItem(itemId, updater) {
  plan = plan.map((it) => (it.itemId === itemId ? updater(it) : it));
  send({ cmd: 'updatePlan', items: plan });
  renderPlan();
}

function renderGroupItem(item) {
  const li = document.createElement('li');
  li.className = 'item groupItem';

  const details = document.createElement('details');
  details.open = expandedGroups.has(item.itemId);
  details.addEventListener('toggle', () => {
    if (details.open) expandedGroups.add(item.itemId); else expandedGroups.delete(item.itemId);
  });

  const summaryEl = document.createElement('summary');

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'groupName';
  nameInput.value = item.data.groupName;
  nameInput.addEventListener('click', (e) => e.stopPropagation());
  nameInput.addEventListener('change', () => {
    updatePlanItem(item.itemId, (it) => renameGroup(it, nameInput.value));
  });

  const colorSelect = document.createElement('select');
  colorSelect.className = 'groupColor';
  for (const c of GROUP_COLORS) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    if (c === item.data.color) opt.selected = true;
    colorSelect.appendChild(opt);
  }
  colorSelect.addEventListener('click', (e) => e.stopPropagation());
  colorSelect.addEventListener('change', () => {
    updatePlanItem(item.itemId, (it) => recolorGroup(it, colorSelect.value));
  });

  const countSpan = document.createElement('span');
  countSpan.className = 'itemReason';
  countSpan.textContent = ` (${item.data.tabIds.length} tabs)`;

  summaryEl.append(nameInput, colorSelect, countSpan);
  details.appendChild(summaryEl);

  const memberList = document.createElement('ul');
  memberList.className = 'memberList';
  for (const m of item.data.members) {
    const mLi = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = m.title || m.url;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      expandedGroups.add(item.itemId);
      updatePlanItem(item.itemId, (it) => excludeMember(it, m.tabId));
    });
    mLi.append(label, removeBtn);
    memberList.appendChild(mLi);
  }
  details.appendChild(memberList);

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'applySection';
  applyBtn.textContent = 'Apply this group';
  applyBtn.addEventListener('click', () => applyItems([item.itemId]));
  details.appendChild(applyBtn);

  const ignoreBtn = document.createElement('button');
  ignoreBtn.type = 'button';
  ignoreBtn.className = 'itemIgnore';
  ignoreBtn.title = 'Never suggest this again';
  ignoreBtn.textContent = 'Never suggest this';
  ignoreBtn.addEventListener('click', () => ignoreItem(item));
  details.appendChild(ignoreBtn);

  li.appendChild(details);
  return li;
}

function renderPlan() {
  const container = $('plan');
  container.textContent = '';
  const counts = summarize(plan);
  const summary = $('summary');
  summary.hidden = plan.length === 0;
  summary.textContent = Object.entries(counts).map(([a, n]) => `${actionLabel(a)}: ${n}`).join('  •  ');

  const groups = groupByAction(plan);
  const tpl = $('itemTemplate');
  for (const [action, items] of Object.entries(groups)) {
    const section = document.createElement('div');
    section.className = 'group';
    const h = document.createElement('h2');
    h.textContent = `${actionLabel(action)} (${items.length})`;
    section.appendChild(h);
    const ul = document.createElement('ul');
    for (const item of items) {
      if (action === 'groupTabs') {
        ul.appendChild(renderGroupItem(item));
        continue;
      }
      const node = tpl.content.cloneNode(true);
      const check = node.querySelector('.itemCheck');
      check.checked = selection.has(item.itemId);
      check.addEventListener('change', () => { selection = toggleSelection(selection, item.itemId); });
      node.querySelector('.itemAction').textContent = item.data.groupName || item.data.title || item.data.url || '';
      node.querySelector('.itemReason').textContent = item.reason || '';
      node.querySelector('.itemUrl').textContent = item.data.url || (item.data.tabIds ? `${item.data.tabIds.length} tabs` : '');
      node.querySelector('.itemIgnore').addEventListener('click', () => ignoreItem(item));
      ul.appendChild(node);
    }
    section.appendChild(ul);
    container.appendChild(section);
  }
}

let toastTimer = null;
async function showUndoToast() {
  const { entries } = await send({ cmd: 'getUndo' });
  const runs = groupUndoByRun(entries);
  const toast = $('undoToast');
  if (!runs.length) { toast.hidden = true; return; }
  const latest = runs[0];
  toast.textContent = '';
  const msg = document.createElement('span');
  msg.textContent = `Applied ${latest.entries.length} change${latest.entries.length === 1 ? '' : 's'}.`;
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', async () => {
    await send({ cmd: 'undo', undoIds: latest.entries.map((e) => e.undoId) });
    setStatus(`Reverted ${latest.entries.length}.`);
    toast.hidden = true;
  });
  toast.append(msg, undoBtn);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 8000);
}

// Marks an item as "never suggest again": persists the key server-side and
// drops it from the currently displayed plan immediately.
async function ignoreItem(item) {
  const key = ignoreKey(item);
  await send({ cmd: 'ignore', keys: [key], items: [item] });
  plan = plan.filter((it) => it.itemId !== item.itemId);
  renderPlan();
  setStatus('Won’t suggest that again.');
}

async function currentScopeWindowId() {
  if ($('scope').value !== 'window') return null;
  const win = await chrome.windows.getCurrent();
  return win.id;
}

async function startScan(features) {
  ensureScanPort();
  $('cancelRun').hidden = false;
  setStatus('Analyzing… (running your local Claude CLI)');
  const windowId = await currentScopeWindowId();
  const res = await send({ cmd: 'run', features, windowId });
  $('cancelRun').hidden = true;
  if (!res.ok) { setStatus(`Error: ${res.error}`); return; }
  plan = (await send({ cmd: 'getPlan' })).items;
  selection = new Set();
  renderPlan();
  setStatus(plan.length ? `${plan.length} suggestions.` : 'Nothing to do — your browser looks tidy.');
}

async function applyItems(itemIds) {
  if (!itemIds.length) { setStatus('Nothing selected.'); return; }
  setStatus(`Applying ${itemIds.length}…`);
  const res = await send({ cmd: 'apply', itemIds });
  if (!res.ok) { setStatus(`Error: ${res.error}`); return; }
  plan = (await send({ cmd: 'getPlan' })).items;
  selection = new Set();
  renderPlan();
  setStatus(`Applied ${res.applied.length}. ${res.failed.length ? res.failed.length + ' failed.' : ''}`);
  await showUndoToast();
}

$('run').addEventListener('click', () => startScan());

$('cancelRun').addEventListener('click', () => send({ cmd: 'cancel' }));

// Per-action run buttons: run just one feature without touching settings.
const ALL_FEATURES = ['groupTabs', 'staleTabs', 'importantBookmarks', 'cleanBookmarks'];
for (const btn of $('runOne').querySelectorAll('button[data-feature]')) {
  btn.addEventListener('click', () => {
    const only = btn.dataset.feature;
    const features = Object.fromEntries(ALL_FEATURES.map((f) => [f, f === only]));
    startScan(features);
  });
}

$('commandForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('commandInput');
  const instruction = input.value.trim();
  if (!instruction) return;
  setStatus('Running your command… (local Claude CLI)');
  const windowId = await currentScopeWindowId();
  const res = await send({ cmd: 'command', instruction, windowId });
  if (!res.ok) { setStatus(`Error: ${res.error}`); return; }
  plan = res.items;
  selection = new Set();
  renderPlan();
  setStatus(plan.length ? `${plan.length} suggestions.` : 'No matching tabs found.');
  input.value = '';
});

$('approveSelected').addEventListener('click', () => applyItems([...selection]));
$('approveAll').addEventListener('click', () => applyItems(plan.map((i) => i.itemId)));

$('exportMarkdown').addEventListener('click', async () => {
  const md = toMarkdown(plan);
  try {
    await navigator.clipboard.writeText(md);
    setStatus('Markdown copied to clipboard.');
  } catch {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'browser-organizer-export.md';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Markdown downloaded.');
  }
});

$('showUndo').addEventListener('click', async () => {
  const { entries } = await send({ cmd: 'getUndo' });
  const runs = groupUndoByRun(entries);
  const list = $('undoList');
  list.textContent = '';
  const dlg = $('undoDialog');
  for (const run of runs) {
    const runLi = document.createElement('li');
    runLi.className = 'undoRun';

    const header = document.createElement('div');
    header.className = 'undoRunHeader';
    const ts = document.createElement('span');
    ts.textContent = new Date(run.ts).toLocaleString();
    const undoRunBtn = document.createElement('button');
    undoRunBtn.type = 'button';
    undoRunBtn.textContent = 'Undo this run';
    undoRunBtn.addEventListener('click', async () => {
      await send({ cmd: 'undo', undoIds: run.entries.map((e) => e.undoId) });
      setStatus(`Reverted ${run.entries.length}.`);
      dlg.close();
    });
    header.append(ts, undoRunBtn);
    runLi.appendChild(header);

    const entryList = document.createElement('ul');
    for (const e of run.entries) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = e.undoId;
      label.append(cb, ` ${e.label || actionLabel(e.action)}`);
      li.appendChild(label);
      entryList.appendChild(li);
    }
    runLi.appendChild(entryList);
    list.appendChild(runLi);
  }
  dlg.showModal();
  dlg.querySelector('#closeUndo').onclick = async () => {
    const undoIds = [...list.querySelectorAll('input:checked')].map((c) => c.value);
    if (undoIds.length) { await send({ cmd: 'undo', undoIds }); setStatus(`Reverted ${undoIds.length}.`); }
    dlg.close();
  };
});

async function checkHealth() {
  const res = await send({ cmd: 'health' });
  const { ok, text } = healthMessage(res && res.health, chrome.runtime.id);
  const el = $('health');
  el.style.whiteSpace = 'pre-line'; // render the multi-line guidance
  el.textContent = text;
  el.classList.toggle('healthOk', ok);
  el.classList.toggle('healthBad', !ok);
  $('run').disabled = !ok;
  return ok;
}

async function loadSettings() {
  const s = await getSettings();
  const form = $('settingsForm');
  form.adapter.value = s.adapter;
  form.groupTabs.checked = s.enabledFeatures.groupTabs;
  form.staleTabs.checked = s.enabledFeatures.staleTabs;
  form.importantBookmarks.checked = s.enabledFeatures.importantBookmarks;
  form.cleanBookmarks.checked = s.enabledFeatures.cleanBookmarks;
  form.deadLinkScan.checked = s.enabledFeatures.deadLinkScan;
  form.staleTabDays.value = s.staleTabDays;
  form.staleBookmarkDays.value = s.staleBookmarkDays;
  form.autoMode.checked = s.automationMode === 'auto';
}

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.deadLinkScan.checked) {
    await chrome.permissions.request({ origins: ['<all_urls>'] });
  }
  await setSettings({
    adapter: form.adapter.value,
    enabledFeatures: {
      groupTabs: form.groupTabs.checked,
      staleTabs: form.staleTabs.checked,
      importantBookmarks: form.importantBookmarks.checked,
      cleanBookmarks: form.cleanBookmarks.checked,
      deadLinkScan: form.deadLinkScan.checked,
    },
    staleTabDays: Number(form.staleTabDays.value),
    staleBookmarkDays: Number(form.staleBookmarkDays.value),
    automationMode: form.autoMode.checked ? 'auto' : 'review',
  });
  setStatus('Settings saved.');
});

async function renderSessions() {
  const { sessions } = await send({ cmd: 'listSessions' });
  const list = $('sessionList');
  list.textContent = '';
  for (const s of sessions) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${s.name} (${s.tabs.length} tabs)`;
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', async () => {
      await send({ cmd: 'restoreSession', id: s.sessionId });
      setStatus(`Restored "${s.name}".`);
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      await send({ cmd: 'deleteSession', id: s.sessionId });
      renderSessions();
    });
    li.append(label, restoreBtn, deleteBtn);
    list.appendChild(li);
  }
}

$('saveSessionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = $('sessionName');
  await send({ cmd: 'saveSession', name: nameInput.value.trim() });
  nameInput.value = '';
  setStatus('Session saved and tabs closed.');
  await renderSessions();
});

(async () => {
  await loadSettings();
  await checkHealth();
  plan = (await send({ cmd: 'getPlan' })).items || [];
  renderPlan();
  await renderSessions();
})();
