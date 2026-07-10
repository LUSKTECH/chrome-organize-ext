#!/usr/bin/env node
import { createMessageReader, encodeMessage } from './messaging.js';
import { handle } from './dispatch.js';

function send(obj) { process.stdout.write(encodeMessage(obj)); }

const reader = createMessageReader();

process.stdin.on('data', async (chunk) => {
  let messages;
  try {
    messages = reader.push(chunk);
  } catch (err) {
    send({ id: null, ok: false, error: `Bad frame: ${err.message}` });
    return;
  }
  for (const msg of messages) {
    try {
      const result = await handle(msg);
      send({ id: msg.id, ok: true, result });
    } catch (err) {
      send({ id: msg.id, ok: false, error: String((err && err.message) || err) });
    }
  }
});

process.stdin.on('end', () => process.exit(0));
