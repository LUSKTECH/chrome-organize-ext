import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupPrompt, buildStalePrompt, buildImportantPrompt } from '../native-host/prompts.js';

const tabs = [
  { tabId: 11, title: 'MDN Array', url: 'https://developer.mozilla.org/array', idleDays: 2 },
  { tabId: 12, title: 'Hacker News', url: 'https://news.ycombinator.com', idleDays: 30 },
];

test('group prompt includes tab ids/urls and asks for JSON groups', () => {
  const p = buildGroupPrompt(tabs);
  assert.match(p, /11/);
  assert.match(p, /news\.ycombinator\.com/);
  assert.match(p, /"groups"/);
  assert.match(p, /tabIds/);
});

test('stale prompt embeds the threshold and idle info', () => {
  const p = buildStalePrompt(tabs, 14);
  assert.match(p, /14/);
  assert.match(p, /"close"/);
  assert.match(p, /suggestBookmark/);
});

test('important prompt asks for a folderPath', () => {
  const p = buildImportantPrompt(tabs);
  assert.match(p, /"important"/);
  assert.match(p, /folderPath/);
});
