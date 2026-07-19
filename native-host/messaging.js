import { Buffer } from 'node:buffer';

export function encodeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

// Hard cap on a single frame's declared length. Chrome caps inbound native
// messages at ~1 MB; anything past this means the framing is corrupt, so we
// stop trusting the buffer rather than allocating unboundedly.
const MAX_FRAME_BYTES = 16 * 1024 * 1024;

// Stateful reader: feed it raw stdin chunks; it returns any complete messages,
// buffering partial ones until the rest arrives. A single malformed frame does
// NOT discard earlier valid frames from the same chunk — it yields a per-frame
// error sentinel ({ id: null, frameError }) so the caller can respond to just it.
export function createMessageReader() {
  let buffer = Buffer.alloc(0);
  return {
    push(chunk) {
      // Common case: a whole frame arrives in one chunk with an empty residual
      // buffer — adopt it directly instead of allocating a concat copy.
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      const messages = [];
      while (buffer.length >= 4) {
        const len = buffer.readUInt32LE(0);
        if (len > MAX_FRAME_BYTES) {
          buffer = Buffer.alloc(0); // framing is unrecoverable — drop the buffer
          messages.push({ id: null, frameError: `frame length ${len} exceeds ${MAX_FRAME_BYTES}` });
          break;
        }
        if (buffer.length < 4 + len) break;
        const json = buffer.subarray(4, 4 + len).toString('utf8');
        buffer = buffer.subarray(4 + len);
        try {
          messages.push(JSON.parse(json));
        } catch (err) {
          messages.push({ id: null, frameError: `invalid JSON: ${err.message}` });
        }
      }
      return messages;
    },
  };
}
