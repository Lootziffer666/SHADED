// Best-effort classic SCUMM v5 "COST" costume decoder — structural layer is solid
// (reuses the already-tested chunk-walking approach from lab-scumm-v5-probe.mjs /
// lab-source-materializer.mjs), the cel pixel RLE codec is experimental: no byte-exact
// primary source for the format was available, only lossy secondary summaries. Self-tested
// for internal round-trip consistency (see tools/test-cost-format.mjs) against synthetic
// fixtures, NOT validated against real game data. Pure functions, no DOM/Node dependency —
// usable in Node (tests) and in the browser (tools/costume-browser.html embeds a copy of
// this same logic, since file:// pages can't reliably ES-import a sibling file).

export function xorDecode(bytes) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ 0x69;
  return out;
}

function tagAt(dv, off) {
  return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
}
export function headerAt(dv, offset, end) {
  if (offset + 8 > end) throw new Error(`truncated chunk header at ${offset}`);
  const tag = tagAt(dv, offset);
  const size = dv.getUint32(offset + 4, false); // big-endian, matches lab-scumm-v5-probe
  if (!/^[A-Z0-9 ]{4}$/.test(tag)) throw new Error(`invalid chunk tag ${JSON.stringify(tag)} at ${offset}`);
  if (size < 8 || offset + size > end) throw new Error(`invalid ${tag} size ${size} at ${offset}`);
  return { tag, size, offset, dataOffset: offset + 8, end: offset + size };
}
export function parseStream(dv, start, end) {
  const chunks = []; let offset = start;
  while (offset < end) { const c = headerAt(dv, offset, end); chunks.push(c); offset = c.end; }
  return chunks;
}

// Walks the full decoded resource buffer (LECF -> LFLF -> {children, ROOM->children, nested})
// and returns every COST chunk found, tagged with which room (LFLF offset) it belongs to.
export function findCostChunks(decodedResource) {
  const dv = new DataView(decodedResource.buffer, decodedResource.byteOffset, decodedResource.byteLength);
  const root = headerAt(dv, 0, decodedResource.length);
  if (root.tag !== 'LECF') throw new Error('not a SCUMM LECF resource file');
  const top = parseStream(dv, root.dataOffset, root.end);
  const costChunks = [];
  const ROOM_CONTAINERS = new Set(['ROOM', 'RMIM', 'OBIM', 'OBCD']);
  for (const lflf of top.filter(c => c.tag === 'LFLF')) {
    let children;
    try { children = parseStream(dv, lflf.dataOffset, lflf.end); } catch { continue; }
    for (const c of children) if (c.tag === 'COST') costChunks.push({ ...c, room: lflf.offset });
    const room = children.find(c => c.tag === 'ROOM');
    if (!room) continue;
    let roomChildren;
    try { roomChildren = parseStream(dv, room.dataOffset, room.end); } catch { continue; }
    for (const c of roomChildren) if (c.tag === 'COST') costChunks.push({ ...c, room: lflf.offset });
    for (const c of roomChildren) {
      if (!ROOM_CONTAINERS.has(c.tag)) continue;
      try {
        for (const n of parseStream(dv, c.dataOffset, c.end)) if (n.tag === 'COST') costChunks.push({ ...n, room: lflf.offset });
      } catch { /* payload chunk, not a container - fine */ }
    }
  }
  return costChunks;
}

// --- Header (fields we're reasonably confident about: byte-oriented, small, self-consistent) ---
export function parseCostumeHeader(decoded, chunk) {
  const dv = new DataView(decoded.buffer, decoded.byteOffset + chunk.dataOffset, chunk.size - 8);
  const numAnim = dv.getUint8(0);
  const formatByte = dv.getUint8(1);
  const mirror = (formatByte & 0x80) !== 0;
  const format = formatByte & 0x7f;
  // 0x58-class -> 16 colors (4 bits/pixel), 0x59-class -> 32 colors (experimental bit-width).
  const numColors = (format & 0x01) ? 32 : 16;
  const bitsPerPixel = numColors === 16 ? 4 : 5;
  const palette = [];
  for (let i = 0; i < numColors && 2 + i < dv.byteLength; i++) palette.push(dv.getUint8(2 + i));
  const cmdOffset = 2 + numColors;
  return { numAnim, format, mirror, numColors, bitsPerPixel, palette, cmdOffset, byteLength: dv.byteLength };
}

// --- Cel pixel decode: EXPERIMENTAL, see file header. Byte-oriented RLE: control byte =
// repeat-flag (bit7) + run length (bits0-6, 0 means 128); indices packed at bitsPerPixel
// each, byte-aligned per run (matches the paired encoder used only in the self-test).
export function decodeCel(decoded, celByteOffset, maxBytes, bitsPerPixel) {
  const avail = decoded.byteLength - celByteOffset;
  if (avail < 10) throw new Error('too few bytes for a cel header');
  const dv = new DataView(decoded.buffer, decoded.byteOffset + celByteOffset, Math.min(maxBytes, avail));
  const width = dv.getUint16(0, true);
  const height = dv.getUint16(2, true);
  if (width === 0 || height === 0 || width > 512 || height > 512) {
    throw new Error(`implausible cel dimensions ${width}x${height} - offset likely wrong`);
  }
  const relX = dv.getInt16(4, true), relY = dv.getInt16(6, true);
  const pixels = new Uint8Array(width * height);
  let src = 10; // past width/height/relX/relY (skip moveX/moveY at 8/10 if present - best effort)
  let dst = 0;
  const mask = (1 << bitsPerPixel) - 1;
  let bitBuf = 0, bitCount = 0;
  function readIndex() {
    while (bitCount < bitsPerPixel) {
      if (src >= dv.byteLength) throw new Error('cel stream exhausted before width*height pixels decoded');
      bitBuf |= dv.getUint8(src++) << bitCount;
      bitCount += 8;
    }
    const v = bitBuf & mask;
    bitBuf >>>= bitsPerPixel; bitCount -= bitsPerPixel;
    return v;
  }
  let guard = pixels.length * 4 + 64; // against infinite loops on corrupt/misaligned data
  while (dst < pixels.length) {
    if (guard-- <= 0) throw new Error('decoder safety guard tripped (too many iterations)');
    if (src >= dv.byteLength) throw new Error('cel stream exhausted (control byte)');
    const ctrl = dv.getUint8(src++);
    const repeat = (ctrl & 0x80) !== 0;
    let run = ctrl & 0x7f;
    if (run === 0) run = 128;
    if (repeat) {
      const idx = readIndex();
      for (let i = 0; i < run && dst < pixels.length; i++) pixels[dst++] = idx;
    } else {
      for (let i = 0; i < run && dst < pixels.length; i++) pixels[dst++] = readIndex();
    }
    // Each run is byte-aligned independently (mirrors the encoder's flush-per-run
    // convention) - drop any leftover sub-byte bits before the next control byte.
    bitBuf = 0; bitCount = 0;
  }
  return { width, height, relX, relY, pixels, bytesUsed: src };
}

// RNAM room-name table (index file), same logic as DECOMPILE's lab-scumm-v5-probe.mjs.
export function parseRoomNames(decodedIndex) {
  const dv = new DataView(decodedIndex.buffer, decodedIndex.byteOffset, decodedIndex.byteLength);
  const chunks = parseStream(dv, 0, decodedIndex.length);
  const rnam = chunks.find(c => c.tag === 'RNAM');
  const map = new Map();
  if (!rnam) return map;
  const data = decodedIndex.subarray(rnam.dataOffset, rnam.end);
  for (let off = 0; off + 10 <= data.length; off += 10) {
    const id = data[off];
    if (id === 0) break;
    const enc = data.subarray(off + 1, off + 10);
    const chars = [];
    for (const v of enc) { const ch = v ^ 0xff; if (ch === 0) break; chars.push(ch); }
    map.set(id, String.fromCharCode(...chars));
  }
  return map;
}
