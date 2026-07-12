// Generates the extension's 16/48/128 px PNG icons from the brand mark (the
// 2x2 rounded-square "organize" grid, green accent). Dependency-free: a tiny
// PNG encoder (zlib + CRC32) so no canvas/sharp is needed. Run: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4, 0); // transparent
  const [r, g, b] = [0x16, 0xa3, 0x4a]; // --accent green
  const pad = Math.round(size * 0.14);
  const gap = Math.max(1, Math.round(size * 0.08));
  const sq = Math.floor((size - 2 * pad - gap) / 2);
  const rad = Math.max(1, Math.round(sq * 0.28));
  const inRounded = (lx, ly) => {
    const cx = lx < rad ? rad : (lx > sq - 1 - rad ? sq - 1 - rad : lx);
    const cy = ly < rad ? rad : (ly > sq - 1 - rad ? sq - 1 - rad : ly);
    const dx = lx - cx, dy = ly - cy;
    return dx * dx + dy * dy <= rad * rad;
  };
  const origins = [[pad, pad], [pad + sq + gap, pad], [pad, pad + sq + gap], [pad + sq + gap, pad + sq + gap]];
  for (const [x0, y0] of origins) {
    for (let ly = 0; ly < sq; ly++) {
      for (let lx = 0; lx < sq; lx++) {
        if (!inRounded(lx, ly)) continue;
        const i = ((y0 + ly) * size + (x0 + lx)) * 4;
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, encodePng(size, draw(size)));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
