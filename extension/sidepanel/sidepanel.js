import { getSettings, setSettings } from '../lib/storage.js';
import {
  summarize, groupByAction, toggleSelection, selectedItems, actionLabel,
  excludeMember, renameGroup, recolorGroup, healthMessage,
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
      ul.appendChild(node);
    }
    section.appendChild(ul);
    container.appendChild(section);
  }
}

async function applyItems(itemIds) {
  if (!itemIds.length) { setStatus('Nothing selected.'); return; }
  setStatus(`Applying ${itemIds.length}…`);
  const res = await send({ cmd: 'apply', itemIds });
  if (!res.ok) { setStatus(`Error: ${res.error}`); return; }
  plan = (await send({ cmd: 'getPlan' })).items;
  selection = new Set();
  renderPlan();
  setStatus(`Applied ${res.applied.length}. ${res.failed.length ? res.failed.length + ' failed.' : ''} Undo available.`);
}

$('run').addEventListener('click', async () => {
  setStatus('Analyzing… (running your local Claude CLI)');
  const res = await send({ cmd: 'run' });
  if (!res.ok) { setStatus(`Error: ${res.error}`); return; }
  plan = (await send({ cmd: 'getPlan' })).items;
  selection = new Set();
  renderPlan();
  setStatus(plan.length ? `${plan.length} suggestions.` : 'Nothing to do — your browser looks tidy.');
});

$('approveSelected').addEventListener('click', () => applyItems([...selection]));
$('approveAll').addEventListener('click', () => applyItems(plan.map((i) => i.itemId)));

$('showUndo').addEventListener('click', async () => {
  const { entries } = await send({ cmd: 'getUndo' });
  const list = $('undoList');
  list.textContent = '';
  for (const e of entries.slice().reverse()) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = e.undoId;
    label.append(cb, ` ${actionLabel(e.action)} — ${new Date(e.ts).toLocaleString()}`);
    li.appendChild(label);
    list.appendChild(li);
  }
  const dlg = $('undoDialog');
  dlg.showModal();
  dlg.querySelector('#closeUndo').onclick = async () => {
    const undoIds = [...list.querySelectorAll('input:checked')].map((c) => c.value);
    if (undoIds.length) { await send({ cmd: 'undo', undoIds }); setStatus(`Reverted ${undoIds.length}.`); }
    dlg.close();
  };
});

async function checkHealth() {
  const res = await send({ cmd: 'health' });
  const { ok, text } = healthMessage(res && res.health);
  const el = $('health');
  el.textContent = text;
  el.classList.toggle('healthOk', ok);
  el.classList.toggle('healthBad', !ok);
  $('run').disabled = !ok;
  return ok;
}

async function loadSettings() {
  const s = await getSettings();
  const form = $('settingsForm');
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

(async () => {
  await loadSettings();
  await checkHealth();
  plan = (await send({ cmd: 'getPlan' })).items || [];
  renderPlan();
})();
