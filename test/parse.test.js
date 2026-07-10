import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonBlock, parseGroupResult, parseStaleResult, parseImportantResult } from '../native-host/parse.js';

test('parseJsonBlock reads plain JSON', () => {
  assert.deepEqual(parseJsonBlock('{"a":1}'), { a: 1 });
});

test('parseJsonBlock strips a code fence', () => {
  assert.deepEqual(parseJsonBlock('```json\n{"a":1}\n```'), { a: 1 });
});

test('parseJsonBlock finds JSON amid prose', () => {
  assert.deepEqual(parseJsonBlock('Here you go: {"a":1} done'), { a: 1 });
});

test('parseJsonBlock throws when no JSON present', () => {
  assert.throws(() => parseJsonBlock('nothing here'), /No JSON/);
});

test('parseGroupResult coerces tabIds to ints and drops empty groups', () => {
  const g = parseGroupResult('{"groups":[{"name":"A","color":"blue","tabIds":["1",2]},{"name":"B","tabIds":[]}]}');
  assert.deepEqual(g, [{ name: 'A', color: 'blue', tabIds: [1, 2] }]);
});

test('parseStaleResult defaults suggestBookmark to false', () => {
  const s = parseStaleResult('{"close":[{"tabId":5,"reason":"old"}]}');
  assert.deepEqual(s, [{ tabId: 5, reason: 'old', suggestBookmark: false }]);
});

test('parseImportantResult keeps folderPath as string array', () => {
  const i = parseImportantResult('{"important":[{"tabId":9,"folderPath":["Dev","X"],"reason":"ref"}]}');
  assert.deepEqual(i, [{ tabId: 9, folderPath: ['Dev', 'X'], reason: 'ref' }]);
});
