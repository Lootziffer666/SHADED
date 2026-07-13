// Self-test for the experimental COST costume decoder (tools/cost-format.mjs).
// Validates: (1) internal encoder<->decoder round-trip consistency on a synthetic cel
// (proves the bit-packing/RLE logic is self-consistent — NOT that it matches the real
// 1990/1991 LucasArts format, since no primary source was available to verify against),
// (2) the outer LECF/LFLF/COST chunk walk and header parsing against a synthetic container.
// Nutzung: node tools/test-cost-format.mjs
import { xorDecode, findCostChunks, parseCostumeHeader, decodeCel, parseRoomNames } from './cost-format.mjs';

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('✗ FAIL:', msg); failures++; } else { console.log('✓ ok:', msg); } }

function be32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function chunk(tag, bodyBytes) {
  const body = Array.from(bodyBytes);
  return [...tag.split('').map(c => c.charCodeAt(0)), ...be32(8 + body.length), ...body];
}

// --- encoder used ONLY here, to produce a synthetic fixture for the round-trip test ---
function encodeCel(width, height, relX, relY, indices, bitsPerPixel) {
  const runs = [];
  let i = 0;
  while (i < indices.length) {
    let j = i;
    while (j + 1 < indices.length && indices[j + 1] === indices[i] && (j - i) < 127) j++;
    if (j > i) { runs.push({ repeat: true, run: j - i + 1, values: [indices[i]] }); i = j + 1; }
    else {
      let k = i; const vals = [];
      while (k < indices.length && vals.length < 127) {
        if (k + 1 < indices.length && indices[k + 1] === indices[k]) break;
        vals.push(indices[k]); k++;
      }
      runs.push({ repeat: false, run: vals.length, values: vals });
      i = k;
    }
  }
  const bytes = [];
  let bitBuf = 0, bitCount = 0;
  const mask = (1 << bitsPerPixel) - 1;
  function pushIndex(v) {
    bitBuf |= (v & mask) << bitCount; bitCount += bitsPerPixel;
    while (bitCount >= 8) { bytes.push(bitBuf & 0xff); bitBuf >>>= 8; bitCount -= 8; }
  }
  function flush() { if (bitCount > 0) { bytes.push(bitBuf & 0xff); bitBuf = 0; bitCount = 0; } }
  for (const r of runs) {
    bytes.push((r.repeat ? 0x80 : 0) | (r.run & 0x7f));
    if (r.repeat) { flush(); pushIndex(r.values[0]); flush(); }
    else { flush(); for (const v of r.values) pushIndex(v); flush(); }
  }
  const header = [width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255,
    relX & 255, (relX >> 8) & 255, relY & 255, (relY >> 8) & 255, 0, 0];
  return new Uint8Array([...header, ...bytes]);
}

console.log('Test 1: Cel-Pixel-RLE Encoder<->Decoder Round-Trip (synthetisch, 4bpp)');
const W = 8, H = 6, BPP = 4;
const testIndices = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) testIndices.push((x < 3) ? 2 : (x < 6 ? 5 : (x + y) % 15 + 1));
const celBytes = encodeCel(W, H, 1, -2, testIndices, BPP);
const wrapped = new Uint8Array(celBytes.length + 4);
wrapped.set([0xAA, 0xBB, 0xCC, 0xDD], 0);
wrapped.set(celBytes, 4);
const cel = decodeCel(wrapped, 4, wrapped.length - 4, BPP);
assert(cel.width === W && cel.height === H, `Cel-Maße (${cel.width}x${cel.height})`);
assert(cel.relX === 1 && cel.relY === -2, `relX/relY (${cel.relX},${cel.relY})`);
assert(cel.pixels.length === testIndices.length, 'Pixelanzahl == width*height');
const mismatches = testIndices.filter((v, i) => cel.pixels[i] !== v).length;
assert(mismatches === 0, `alle ${testIndices.length} Pixel-Indizes exakt gleich (Round-Trip)`);

console.log('\nTest 2: LECF/LFLF/COST Chunk-Walk + Header-Parsing (synthetisch)');
const fakeCostBody = [3, 0x58, ...Array.from({ length: 16 }, (_, i) => (i + 1) * 10)];
const costChunk = chunk('COST', fakeCostBody);
const lecf = chunk('LECF', chunk('LFLF', costChunk));
const scrambled = new Uint8Array(lecf).map(b => b ^ 0x69);
const decoded = xorDecode(scrambled);
assert(decoded.every((b, i) => b === lecf[i]), 'xorDecode invertiert das 0x69-Scrambling exakt');
const found = findCostChunks(decoded);
assert(found.length === 1, `findCostChunks findet genau 1 synthetisches COST-Chunk (${found.length})`);
if (found.length === 1) {
  const hdr = parseCostumeHeader(decoded, found[0]);
  assert(hdr.numAnim === 3, `numAnim (${hdr.numAnim})`);
  assert(hdr.format === 0x58, `Format-Byte (0x${hdr.format.toString(16)})`);
  assert(hdr.numColors === 16 && hdr.bitsPerPixel === 4, `numColors/bpp (${hdr.numColors}/${hdr.bitsPerPixel})`);
  assert(hdr.palette.length === 16 && hdr.palette[0] === 10 && hdr.palette[15] === 160, 'Palette-Bytes in Reihenfolge gelesen');
}

console.log('\nTest 3: RNAM Raumnamen-Tabelle (synthetisch, gleiche Logik wie DECOMPILEs SCUMM-Probe)');
function rnamEntry(id, name) {
  const enc = Array.from(name).map(c => c.charCodeAt(0) ^ 0xff);
  while (enc.length < 9) enc.push(0 ^ 0xff);
  return [id, ...enc.slice(0, 9)];
}
const rnamBody = [...rnamEntry(1, 'bar'), ...rnamEntry(2, 'wharf'), 0, ...Array(9).fill(0)];
const rnamChunk = chunk('RNAM', rnamBody);
const idxScrambled = new Uint8Array(rnamChunk).map(b => b ^ 0x69);
const idxDecoded = xorDecode(idxScrambled);
const names = parseRoomNames(idxDecoded);
assert(names.get(1) === 'bar', `Raum 1 == "bar" (war "${names.get(1)}")`);
assert(names.get(2) === 'wharf', `Raum 2 == "wharf" (war "${names.get(2)}")`);

console.log(failures === 0 ? '\n✅ ALLE TESTS BESTANDEN' : `\n❌ ${failures} FEHLSCHLAG/FEHLSCHLÄGE`);
process.exitCode = failures === 0 ? 0 : 1;
