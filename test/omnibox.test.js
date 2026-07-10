import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOmnibox } from '../extension/lib/omnibox.js';

test('parseOmnibox trims to the instruction', () => {
  assert.deepEqual(parseOmnibox('  close travel tabs '), { instruction: 'close travel tabs' });
  assert.deepEqual(parseOmnibox(''), { instruction: '' });
});
