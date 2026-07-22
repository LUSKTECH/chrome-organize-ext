// The settings form: load current settings into the form, persist on submit,
// and apply an adapter switch immediately (re-checking health so the banner
// tracks the chosen backend). The encrypted OpenAI key is written only when the
// user types one. loadSettings() is exported for the bootstrap's first paint.
import { $, setStatus, flashStatus, setSettings } from './dom.js';
import { getSettings } from '../lib/storage.js';
import { setSecret, hasSecret } from '../lib/secret-store.js';
import { adapterNote } from './viewmodel.js';
import { checkHealth } from './health-view.js';

let advancedExtraArgs = {}; // per-adapter extra CLI flags, loaded from settings

// Point the "extra CLI flags" field at the currently-selected backend.
function syncExtraArgsField(adapter) {
  const form = $('settingsForm');
  form.extraArgs.value = advancedExtraArgs[adapter] || '';
  const label = document.getElementById('extraArgsAdapter');
  if (label) label.textContent = (form.adapter.selectedOptions[0] && form.adapter.selectedOptions[0].text) || adapter;
}

function updateAdapterNote(value) {
  const note = adapterNote(value);
  const el = $('adapterNote');
  el.textContent = note;
  el.hidden = !note;
  $('openaiConfig').hidden = value !== 'openai'; // key/base/model only for the API backend
}

export async function loadSettings() {
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
  form.debugLogging.checked = !!s.debugLogging;
  form.checkHostUpdates.checked = !!(s.advancedCli && s.advancedCli.checkHostUpdates);
  form.loadMcpServers.checked = !!(s.advancedCli && s.advancedCli.loadMcpServers);
  form.loadPluginsSettings.checked = !!(s.advancedCli && s.advancedCli.loadPluginsSettings);
  advancedExtraArgs = { ...((s.advancedCli && s.advancedCli.extraArgs) || {}) };
  syncExtraArgsField(s.adapter);
}

export function initSettingsView() {
  $('openaiKeyShow').addEventListener('change', (e) => { $('openaiApiKey').type = e.target.checked ? 'text' : 'password'; });

  // Switching the AI backend applies immediately (persist + re-check health), so the
  // banner reflects the chosen backend without also having to click "Save settings".
  $('settingsForm').adapter.addEventListener('change', async (e) => {
    updateAdapterNote(e.target.value);
    syncExtraArgsField(e.target.value); // show this backend's extra flags
    setStatus(`Switching to ${e.target.selectedOptions[0].text}…`);
    try {
      await setSettings({ adapter: e.target.value });
      await checkHealth();
      setStatus('');
    } catch (err) { setStatus(`Could not switch adapter: ${err.message}`); }
  });

  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      // Features that need an optional host permission: dead-link scan (<all_urls>)
      // and the opt-in npm update check (registry host). Prompt only for the ones
      // not already granted, in a single dialog. If the user DECLINES, untick those
      // features so we never persist an enabled setting whose permission is missing.
      const permFeatures = [
        ['deadLinkScan', '<all_urls>'],
        ['checkHostUpdates', 'https://registry.npmjs.org/*'],
      ].filter(([f]) => form[f].checked);
      const toRequest = [];
      for (const [feature, origin] of permFeatures) {
        if (!(await chrome.permissions.contains({ origins: [origin] }))) toRequest.push([feature, origin]);
      }
      if (toRequest.length) {
        const granted = await chrome.permissions.request({ origins: toRequest.map(([, o]) => o) });
        if (!granted) {
          for (const [feature] of toRequest) form[feature].checked = false;
          setStatus('Permission declined — that feature stays off.');
        }
      }
      // Persist the API key (encrypted, device-local) only if the user typed one.
      // Trim FIRST: a blank/whitespace-only field means "keep the saved key" — it
      // must not fall through to setSecret('') which would clear the stored key.
      const apiKeyInput = $('openaiApiKey');
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) { await setSecret('openaiApiKey', apiKey); apiKeyInput.value = ''; }
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
        debugLogging: form.debugLogging.checked,
        advancedCli: {
          loadMcpServers: form.loadMcpServers.checked,
          loadPluginsSettings: form.loadPluginsSettings.checked,
          checkHostUpdates: form.checkHostUpdates.checked,
          extraArgs: { ...advancedExtraArgs, [form.adapter.value]: form.extraArgs.value.trim() },
        },
      });
      advancedExtraArgs = { ...advancedExtraArgs, [form.adapter.value]: form.extraArgs.value.trim() };
      // Re-check health so the banner reflects the (possibly changed) AI backend —
      // it queries the newly-saved adapter and updates connected/version or the
      // onboarding card + disables Analyze if the new backend isn't reachable.
      await checkHealth();
      flashStatus('Settings saved.');
    } catch (err) { flashStatus(`Save failed: ${err.message}`); }
  });
}
