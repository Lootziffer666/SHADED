// Minimal STORE-only (uncompressed) ZIP writer. No dependency, browser-safe (Uint8Array only).
// Self-tested (tools/test-minizip.mjs): CRC32 against the standard "123456789" test vector,
// and round-tripped through Python's independent stdlib zipfile reader.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) { return [n & 255, (n >> 8) & 255]; }
function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }
function nameBytes(name) { return Array.from(name).map(c => c.charCodeAt(0) & 0xff); }

// files: [{name: string, data: Uint8Array}]
export function buildZipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const DOS_TIME = [0, 0], DOS_DATE = [0x21, 0x00]; // fixed placeholder timestamp, deterministic output
  for (const f of files) {
    const name = nameBytes(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0,
      ...DOS_TIME, ...DOS_DATE,
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(name.length), ...u16(0),
      ...name,
    ]);
    chunks.push(local, f.data);
    central.push({ name, crc, size: f.data.length, offset });
    offset += local.length + f.data.length;
  }
  const cdStart = offset;
  const cdChunks = [];
  for (const e of central) {
    const rec = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0,
      ...DOS_TIME, ...DOS_DATE,
      ...u32(e.crc), ...u32(e.size), ...u32(e.size),
      ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(e.offset),
      ...e.name,
    ]);
    cdChunks.push(rec);
    offset += rec.length;
  }
  const cdSize = offset - cdStart;
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0,
    ...u16(central.length), ...u16(central.length),
    ...u32(cdSize), ...u32(cdStart),
    ...u16(0),
  ]);
  const total = chunks.reduce((s, c) => s + c.length, 0) + cdChunks.reduce((s, c) => s + c.length, 0) + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...cdChunks, eocd]) { out.set(c, p); p += c.length; }
  return out;
}
