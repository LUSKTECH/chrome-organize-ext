import { getSettings, setSettings } from '../lib/storage.js';
import { setSecret, hasSecret } from '../lib/secret-store.js';
import { ignoreKey } from '../lib/orchestrator.js';
import {
  summarize, groupByAction, toggleSelection, selectedItems, actionLabel,
  excludeMember, renameGroup, recolorGroup, healthMessage, progressLabel, groupUndoByRun, toMarkdown, filterTabs,
  describeIgnoreKey, installCommand, moveMember,
  allItemIds, filterPlan, needsBulkConfirm, destructiveCount, adapterNote, formatElapsed,
  groupByStatus, statusLabel,
} from './viewmodel.js';

import { TAB_GROUP_COLORS as GROUP_COLORS } from '../lib/colors.js';

let plan = [];
let selection = new Set();
const expandedGroups = new Set();
let openTabs = [];
let tabSelection = new Set();
let planFilter = '';
let groupBookmarksByStatus = false; // panel-local pref: bucket the Delete-bookmark group by status

// Fixed display order for the bookmark status buckets (see viewmodel.statusBucket).
const BUCKET_ORDER = ['http-404', 'http-410', 'unreachable', 'dead-other', 'duplicate', 'stale', 'other'];
const collapsedBuckets = new Set(); // status sub-groups the user has collapsed

const $ = (id) => document.getElementById(id);
const setStatus = (t) => { $('status').textContent = t; };
// Like setStatus but re-triggers a brief highlight on every call, so a repeated
// confirmation (e.g. pressing Save twice) is still visibly acknowledged.
function flashStatus(t) {
  const el = $('status');
  el.textContent = t;
  el.classList.remove('flash');
  void el.offsetWidth; // reflow so the CSS animation restarts even if text is unchanged
  el.classList.add('flash');
}

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

// Bring a tab to the foreground (used by click-to-focus on a suggestion).
function focusTab(tabId) { if (tabId != null) send({ cmd: 'focusTab', tabId }); }

// A live elapsed-time heartbeat so long scans visibly progress even between
// phase updates. lastScanLabel holds the most recent phase text; the ticker
// appends the running clock to it once a second.
let scanTimer = null;
let scanStartTs = 0;
let lastScanLabel = '';
function tickScan() { setStatus(`${lastScanLabel} · ${formatElapsed(Date.now() - scanStartTs)}`); }
function startScanClock(label) { scanStartTs = Date.now(); lastScanLabel = label; tickScan(); clearInterval(scanTimer); scanTimer = setInterval(tickScan, 1000); }
function stopScanClock() { clearInterval(scanTimer); scanTimer = null; }

let scanPort = null;
function ensureScanPort() {
  if (scanPort) return scanPort;
  scanPort = chrome.runtime.connect({ name: 'scan' });
  scanPort.onMessage.addListener((msg) => {
    if (msg.progress) {
      const { phase, done, total } = msg.progress;
      lastScanLabel = progressLabel(phase, done, total);
      tickScan();
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

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'itemCheck';
  check.checked = selection.has(item.itemId);
  check.setAttribute('aria-label', `Select group ${item.data.groupName}`);
  check.addEventListener('click', (e) => e.stopPropagation()); // don't toggle the <details>
  check.addEventListener('change', () => { selection = toggleSelection(selection, item.itemId); });

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

  summaryEl.append(check, nameInput, colorSelect, countSpan);
  details.appendChild(summaryEl);

  const memberList = document.createElement('ul');
  memberList.className = 'memberList';
  for (const m of item.data.members) {
    const mLi = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = m.title || m.url;
    // Click a member to jump to that tab.
    label.className = 'focusable';
    label.setAttribute('role', 'link');
    label.setAttribute('tabindex', '0');
    label.title = 'Go to this tab';
    label.addEventListener('click', () => focusTab(m.tabId));
    label.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusTab(m.tabId); } });
    // "Move to" another proposed group.
    const otherGroups = plan.filter((i) => i.action === 'groupTabs' && i.itemId !== item.itemId);
    const moveSel = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = 'Move to…';
    moveSel.appendChild(placeholder);
    for (const g of otherGroups) {
      const opt = document.createElement('option');
      opt.value = g.itemId; opt.textContent = g.data.groupName;
      moveSel.appendChild(opt);
    }
    moveSel.addEventListener('change', () => {
      if (!moveSel.value) return;
      expandedGroups.add(item.itemId);
      expandedGroups.add(moveSel.value);
      plan = moveMember(plan, item.itemId, moveSel.value, m.tabId);
      send({ cmd: 'updatePlan', items: plan });
      renderPlan();
    });
    if (!otherGroups.length) moveSel.style.display = 'none';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      expandedGroups.add(item.itemId);
      updatePlanItem(item.itemId, (it) => excludeMember(it, m.tabId));
    });
    mLi.append(label, moveSel, removeBtn);
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

function renderPlan(animate = false) {
  const container = $('plan');
  container.textContent = '';
  let enterIdx = 0; // staggers the entrance animation for fresh results only
  const shown = filterPlan(plan, planFilter);
  const counts = summarize(shown);
  const summary = $('summary');
  summary.hidden = plan.length === 0;
  const filterNote = planFilter && shown.length !== plan.length ? `  (filtered from ${plan.length})` : '';
  summary.textContent = Object.entries(counts).map(([a, n]) => `${actionLabel(a)}: ${n}`).join('  •  ') + filterNote;
  $('planTools').hidden = plan.length === 0;
  $('planActions').hidden = plan.length === 0; // contextual: apply/clear only when there's a plan

  const groups = groupByAction(shown);
  const tpl = $('itemTemplate');
  const stagger = (el) => {
    if (!animate) return;
    el.classList.add('enter');
    el.style.setProperty('--i', Math.min(enterIdx++, 10));
  };
  const appendItem = (ul, item) => {
    if (item.action === 'groupTabs') {
      const gEl = renderGroupItem(item);
      stagger(gEl);
      ul.appendChild(gEl);
      return;
    }
    const node = buildItemNode(item, tpl);
    stagger(node.querySelector('.item'));
    ul.appendChild(node);
  };
  for (const [action, items] of Object.entries(groups)) {
    const section = document.createElement('div');
    section.className = 'group';
    const h = document.createElement('h2');
    h.textContent = `${actionLabel(action)} (${items.length})`;
    section.appendChild(h);
    // Bookmark cleanup can optionally split into per-status sub-groups.
    if (action === 'deleteBookmark' && groupBookmarksByStatus) {
      const buckets = groupByStatus(items);
      for (const key of BUCKET_ORDER) {
        const bItems = buckets[key];
        if (!bItems || !bItems.length) continue;
        // <details> so each status sub-group collapses independently and the
        // Expand/Collapse-groups buttons can drive it.
        const sub = document.createElement('details');
        sub.className = 'subgroup';
        sub.open = !collapsedBuckets.has(key);
        sub.addEventListener('toggle', () => { if (sub.open) collapsedBuckets.delete(key); else collapsedBuckets.add(key); });
        const sm = document.createElement('summary');
        sm.textContent = `${statusLabel(key)} (${bItems.length})`;
        sub.appendChild(sm);
        const subUl = document.createElement('ul');
        for (const item of bItems) appendItem(subUl, item);
        sub.appendChild(subUl);
        section.appendChild(sub);
      }
    } else {
      const ul = document.createElement('ul');
      for (const item of items) appendItem(ul, item);
      section.appendChild(ul);
    }
    container.appendChild(section);
  }
}

// Builds one suggestion row (checkbox, title/reason/url, ignore, optional
// go-to-tab) from the shared <template>. Returns the cloned fragment.
function buildItemNode(item, tpl) {
  const node = tpl.content.cloneNode(true);
  const check = node.querySelector('.itemCheck');
  check.checked = selection.has(item.itemId);
  check.addEventListener('change', () => { selection = toggleSelection(selection, item.itemId); });
  node.querySelector('.itemAction').textContent = item.data.groupName || item.data.title || item.data.url || '';
  node.querySelector('.itemReason').textContent = item.reason || '';
  node.querySelector('.itemUrl').textContent = item.data.url || (item.data.tabIds ? `${item.data.tabIds.length} tabs` : '');
  node.querySelector('.itemIgnore').addEventListener('click', () => ignoreItem(item));
  // Click-to-focus: only meaningful when the suggestion targets a live tab.
  if (item.data.tabId != null) {
    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'itemFocus';
    goBtn.textContent = 'Go to tab';
    goBtn.setAttribute('aria-label', `Go to tab: ${item.data.title || item.data.url || ''}`);
    goBtn.addEventListener('click', () => focusTab(item.data.tabId));
    node.querySelector('.item').appendChild(goBtn);
  }
  return node;
}

let toastTimer = null;
async function showUndoToast() {
  const res = await send({ cmd: 'getUndo' });
  if (!res || !res.ok) return;
  const runs = groupUndoByRun(res.entries);
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

// ---- Direct tab list / search / bulk-close (no AI) ----
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
  openTabs = (res && res.tabs) || [];
  tabSelection = new Set([...tabSelection].filter((id) => openTabs.some((t) => t.id === id)));
  drawTabs();
}

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

async function currentScopeWindowId() {
  if ($('scope').value !== 'window') return null;
  const win = await chrome.windows.getCurrent();
  return win.id;
}

async function startScan(features) {
  ensureScanPort();
  $('cancelRun').hidden = false;
  startScanClock('Analyzing… (running your local AI CLI)');
  const windowId = await currentScopeWindowId();
  const res = await send({ cmd: 'run', features, windowId });
  stopScanClock();
  $('cancelRun').hidden = true;
  if (!res.ok) { setStatus(`Error: ${res.error}`); return; }
  plan = (await send({ cmd: 'getPlan' })).items;
  selection = new Set();
  renderPlan(true);
  setStatus(plan.length ? `${plan.length} suggestions.` : 'Nothing to do — your browser looks tidy.');
}

// Confirms a large destructive batch via a modal before applying. Resolves true
// to proceed, false to cancel (Cancel button or Esc).
function confirmBulk(items) {
  const dlg = $('confirmDialog');
  $('confirmMsg').textContent = `Apply ${items.length} changes — ${destructiveCount(items)} will close, suspend, or delete tabs/bookmarks. This can be undone, but continue?`;
  return new Promise((resolve) => {
    const onCancel = () => done(false); // Esc / backdrop dismiss
    const done = (val) => {
      dlg.removeEventListener('cancel', onCancel); // don't let listeners stack across calls
      $('confirmOk').onclick = null;
      $('confirmCancel').onclick = null;
      dlg.close();
      resolve(val);
    };
    $('confirmOk').onclick = () => done(true);
    $('confirmCancel').onclick = () => done(false);
    dlg.addEventListener('cancel', onCancel);
    dlg.showModal();
  });
}

async function applyItems(itemIds) {
  if (!itemIds.length) { setStatus('Nothing selected.'); return; }
  const chosen = selectedItems(new Set(itemIds), plan);
  if (needsBulkConfirm(chosen)) {
    const ok = await confirmBulk(chosen);
    if (!ok) { setStatus('Cancelled — nothing applied.'); return; }
  }
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
const ALL_FEATURES = ['groupTabs', 'staleTabs', 'importantBookmarks', 'cleanBookmarks', 'organizeBookmarks'];
for (const btn of $('runOne').querySelectorAll('button[data-feature]')) {
  btn.addEventListener('click', () => {
    const only = btn.dataset.feature;
    const features = Object.fromEntries(ALL_FEATURES.map((f) => [f, f === only]));
    startScan(features);
  });
}

$('clearPlan').addEventListener('click', async () => {
  plan = [];
  selection = new Set();
  planFilter = '';
  $('planFilter').value = '';
  await send({ cmd: 'updatePlan', items: [] }); // also clear the stored plan so it doesn't reappear on reload
  renderPlan();
  setStatus('Cleared.');
});

// ---- Plan toolbar: filter, bulk-select, expand/collapse ----
$('planFilter').addEventListener('input', (e) => { planFilter = e.target.value; renderPlan(); });
$('selectAll').addEventListener('click', () => { selection = new Set(allItemIds(filterPlan(plan, planFilter))); renderPlan(); });
$('selectNone').addEventListener('click', () => { selection = new Set(); renderPlan(); });
$('expandAll').addEventListener('click', () => {
  for (const it of plan) if (it.action === 'groupTabs') expandedGroups.add(it.itemId);
  collapsedBuckets.clear(); // status sub-groups all open
  renderPlan();
});
$('collapseAll').addEventListener('click', () => {
  expandedGroups.clear();
  for (const key of BUCKET_ORDER) collapsedBuckets.add(key); // status sub-groups all closed
  renderPlan();
});

// "Group bookmarks by status" toggle — panel-local pref persisted in storage.local.
$('groupByStatus').addEventListener('change', (e) => {
  groupBookmarksByStatus = e.target.checked;
  chrome.storage.local.set({ groupBookmarksByStatus });
  renderPlan();
});
chrome.storage.local.get('groupBookmarksByStatus').then(({ groupBookmarksByStatus: pref }) => {
  groupBookmarksByStatus = !!pref;
  $('groupByStatus').checked = groupBookmarksByStatus;
  if (groupBookmarksByStatus) renderPlan();
});

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
  renderPlan(true);
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
  const undoRes = await send({ cmd: 'getUndo' });
  if (!undoRes || !undoRes.ok) { setStatus('Could not load undo history.'); return; }
  const runs = groupUndoByRun(undoRes.entries);
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
  // Gate every backend-dependent control on health, not just Analyze, so the CLI
  // being down surfaces the onboarding guidance instead of a raw error.
  for (const btn of $('runOne').querySelectorAll('button[data-feature]')) btn.disabled = !ok;
  $('commandInput').disabled = !ok;
  $('commandForm').querySelector('button[type="submit"]').disabled = !ok;
  // First-run onboarding: show the connect card until the CLI is reachable.
  $('onboarding').hidden = ok;
  if (!ok) $('installCmd').textContent = installCommand(chrome.runtime.id);
  return ok;
}

$('copyCmd').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(installCommand(chrome.runtime.id)); setStatus('Command copied.'); }
  catch { setStatus('Copy failed — select and copy manually.'); }
});
$('recheck').addEventListener('click', () => checkHealth());

// Shows a caution note for lower-assurance adapters (e.g. Copilot).
function updateAdapterNote(value) {
  const note = adapterNote(value);
  const el = $('adapterNote');
  el.textContent = note;
  el.hidden = !note;
  $('openaiConfig').hidden = value !== 'openai'; // key/base/model only for the API backend
}
$('openaiKeyShow').addEventListener('change', (e) => { $('openaiApiKey').type = e.target.checked ? 'text' : 'password'; });
// Switching the AI backend applies immediately (persist + re-check health), so the
// banner reflects the chosen backend without also having to click "Save settings".
$('settingsForm').adapter.addEventListener('change', async (e) => {
  updateAdapterNote(e.target.value);
  setStatus(`Switching to ${e.target.selectedOptions[0].text}…`);
  await setSettings({ adapter: e.target.value });
  await checkHealth();
  setStatus('');
});

async function loadSettings() {
  const s = await getSettings();
  const form = $('settingsForm');
  form.adapter.value = s.adapter;
  updateAdapterNote(s.adapter);
  form.openaiBaseUrl.value = s.openaiBaseUrl || '';
  form.openaiModel.value = s.openaiModel || '';
  $('openaiApiKey').value = '';
  $('openaiApiKey').placeholder = (await hasSecret('openaiApiKey'))
    ? '•••••••• saved — leave blank to keep'
    : 'sk-… (stored encrypted on this device)';
  form.groupTabs.checked = s.enabledFeatures.groupTabs;
  form.staleTabs.checked = s.enabledFeatures.staleTabs;
  form.importantBookmarks.checked = s.enabledFeatures.importantBookmarks;
  form.cleanBookmarks.checked = s.enabledFeatures.cleanBookmarks;
  form.dupeTabs.checked = s.enabledFeatures.dupeTabs;
  form.deadLinkScan.checked = s.enabledFeatures.deadLinkScan;
  form.organizeBookmarks.checked = s.enabledFeatures.organizeBookmarks;
  form.organizeMode.value = s.organizeMode || 'additive';
  form.protectBookmarkBar.checked = s.protectBookmarkBar !== false;
  form.removeEmptyFolders.checked = !!s.removeEmptyFolders;
  form.protectedFolders.value = (s.protectedFolders || []).join('\n');
  form.staleTabDays.value = s.staleTabDays;
  form.staleBookmarkDays.value = s.staleBookmarkDays;
  form.scanIntervalHours.value = Math.round(s.scanIntervalMinutes / 60);
  form.undoRetentionDays.value = s.undoRetentionDays;
  form.autoMode.checked = s.automationMode === 'auto';
  form.whitelist.value = (s.whitelist || []).join('\n');
}

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.deadLinkScan.checked) {
    await chrome.permissions.request({ origins: ['<all_urls>'] });
  }
  // Persist the API key (encrypted, device-local) only if the user typed one;
  // an empty field means "keep the saved key". Never round-trips the stored key.
  const apiKeyInput = $('openaiApiKey');
  if (apiKeyInput.value) { await setSecret('openaiApiKey', apiKeyInput.value.trim()); apiKeyInput.value = ''; }
  await setSettings({
    adapter: form.adapter.value,
    openaiBaseUrl: form.openaiBaseUrl.value.trim(),
    openaiModel: form.openaiModel.value.trim(),
    enabledFeatures: {
      groupTabs: form.groupTabs.checked,
      staleTabs: form.staleTabs.checked,
      importantBookmarks: form.importantBookmarks.checked,
      cleanBookmarks: form.cleanBookmarks.checked,
      dupeTabs: form.dupeTabs.checked,
      deadLinkScan: form.deadLinkScan.checked,
      organizeBookmarks: form.organizeBookmarks.checked,
    },
    organizeMode: form.organizeMode.value,
    protectBookmarkBar: form.protectBookmarkBar.checked,
    removeEmptyFolders: form.removeEmptyFolders.checked,
    protectedFolders: form.protectedFolders.value.split('\n').map((s) => s.trim()).filter(Boolean),
    staleTabDays: Number(form.staleTabDays.value),
    staleBookmarkDays: Number(form.staleBookmarkDays.value),
    scanIntervalMinutes: Math.max(1, Number(form.scanIntervalHours.value)) * 60,
    undoRetentionDays: Number(form.undoRetentionDays.value),
    automationMode: form.autoMode.checked ? 'auto' : 'review',
    whitelist: form.whitelist.value.split('\n').map((s) => s.trim()).filter(Boolean),
  });
  // Re-check health so the banner reflects the (possibly changed) AI backend —
  // it queries the newly-saved adapter and updates connected/version or the
  // onboarding card + disables Analyze if the new backend isn't reachable.
  await checkHealth();
  flashStatus('Settings saved.');
});

async function renderSessions() {
  const sessRes = await send({ cmd: 'listSessions' });
  const sessions = (sessRes && sessRes.sessions) || [];
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
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = s.name;
      const commit = async () => {
        const name = input.value.trim();
        if (name && name !== s.name) await send({ cmd: 'renameSession', id: s.sessionId, name });
        renderSessions();
      };
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); });
      input.addEventListener('blur', commit);
      li.replaceChild(input, label);
      input.focus();
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      await send({ cmd: 'deleteSession', id: s.sessionId });
      renderSessions();
    });
    li.append(label, restoreBtn, renameBtn, deleteBtn);
    list.appendChild(li);
  }
}

$('exportSessions').addEventListener('click', async () => {
  const sessRes = await send({ cmd: 'listSessions' });
  const sessions = (sessRes && sessRes.sessions) || [];
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'browser-organizer-sessions.json'; a.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${sessions.length} session${sessions.length === 1 ? '' : 's'}.`);
});

// ---- Muted & learned management ----
async function renderMuted() {
  const s = await getSettings();
  const list = $('mutedList');
  list.textContent = '';
  const ignore = s.ignore || [];
  if (!ignore.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = 'Nothing muted.';
    list.appendChild(li);
  }
  for (const key of ignore) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = describeIgnoreKey(key);
    span.title = key;
    const unmute = document.createElement('button');
    unmute.type = 'button';
    unmute.textContent = 'Unmute';
    unmute.addEventListener('click', async () => {
      const cur = await getSettings();
      await setSettings({ ignore: (cur.ignore || []).filter((k) => k !== key) });
      renderMuted();
    });
    li.append(span, unmute);
    list.appendChild(li);
  }
}

$('mutedPanel').addEventListener('toggle', () => { if ($('mutedPanel').open) renderMuted(); });
$('resetLearning').addEventListener('click', async () => {
  await setSettings({ decisions: {} });
  setStatus('Learning reset.');
});

$('saveSessionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = $('sessionName');
  const keepOpen = $('keepTabsOpen').checked;
  await send({ cmd: 'saveSession', name: nameInput.value.trim(), close: !keepOpen });
  nameInput.value = '';
  setStatus(keepOpen ? 'Session saved (tabs kept open).' : 'Session saved and tabs closed.');
  await renderSessions();
});

// chrome.i18n scaffolding: replace the text of any [data-i18n] element with its
// localized message. Static English remains in the HTML as the fallback.
function applyI18n() {
  if (!chrome.i18n) return;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  }
}

(async () => {
  applyI18n();
  await loadSettings();
  await checkHealth();
  plan = (await send({ cmd: 'getPlan' })).items || [];
  renderPlan(true);
  await renderSessions();
})();
