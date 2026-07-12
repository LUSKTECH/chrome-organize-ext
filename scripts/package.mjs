// Builds the Web Store / Edge Add-ons upload zip from extension/ ONLY.
// The native host, tests, docs, and git are siblings of extension/ and are never
// included. Dependency-free ZIP writer (zlib deflate + CRC32). Run: npm run package
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'extension');
const version = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).version;
const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `browser-organizer-${version}.zip`);

const EXCLUDE = new Set(['.DS_Store', 'Thumbs.db']);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (EXCLUDE.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

const DOS_DATE = 0x5221; // fixed (2021-01-01) → reproducible zips
const files = walk(SRC);
const parts = [];
const central = [];
let offset = 0;
for (const f of files) {
  const data = fs.readFileSync(f.full);
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(f.rel, 'utf8');
  const crc = crc32(data);
  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0); lfh.writeUInt16LE(20, 4); lfh.writeUInt16LE(0, 6);
  lfh.writeUInt16LE(8, 8); lfh.writeUInt16LE(0, 10); lfh.writeUInt16LE(DOS_DATE, 12);
  lfh.writeUInt32LE(crc, 14); lfh.writeUInt32LE(comp.length, 18); lfh.writeUInt32LE(data.length, 22);
  lfh.writeUInt16LE(name.length, 26); lfh.writeUInt16LE(0, 28);
  parts.push(lfh, name, comp);
  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0); cdh.writeUInt16LE(20, 4); cdh.writeUInt16LE(20, 6);
  cdh.writeUInt16LE(0, 8); cdh.writeUInt16LE(8, 10); cdh.writeUInt16LE(0, 12); cdh.writeUInt16LE(DOS_DATE, 14);
  cdh.writeUInt32LE(crc, 16); cdh.writeUInt32LE(comp.length, 20); cdh.writeUInt32LE(data.length, 24);
  cdh.writeUInt16LE(name.length, 28); cdh.writeUInt32LE(0, 30); cdh.writeUInt32LE(0, 34);
  cdh.writeUInt32LE(0, 38); cdh.writeUInt32LE(offset, 42);
  central.push(cdh, name);
  offset += lfh.length + name.length + comp.length;
}
const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(offset, 16);
fs.writeFileSync(outPath, Buffer.concat([...parts, centralBuf, eocd]));
console.log(`Packaged ${files.length} files → ${path.relative(ROOT, outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
for (const f of files) console.log(`  ${f.rel}`);
