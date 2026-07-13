// Self-test for tools/minizip.mjs (the STORE-only ZIP writer used by sprite-exporter.html).
// Validates CRC32 against the standard reference vector, then round-trips a built archive
// through Python's independent stdlib zipfile reader (python3 already assumed available -
// this project's own "serve" script uses it) so the format claim isn't just self-checked.
// Nutzung: node tools/test-minizip.mjs
import { crc32, buildZipStore } from './minizip.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('✗ FAIL:', msg); failures++; } else { console.log('✓ ok:', msg); } }

console.log('Test 1: CRC32 gegen Standard-Testvektor');
const knownVector = new TextEncoder().encode('123456789');
assert(crc32(knownVector) === 0xcbf43926, `crc32("123456789") == 0xCBF43926 (0x${crc32(knownVector).toString(16)})`);
assert(crc32(new Uint8Array(0)) === 0, `crc32("") == 0 (${crc32(new Uint8Array(0))})`);

console.log('\nTest 2: ZIP bauen, mit Pythons unabhängigem zipfile-Reader validieren');
const OUT = path.join(import.meta.dirname, 'verify-out');
mkdirSync(OUT, { recursive: true });
const files = [
  { name: 'guybrush-idle.json', data: new TextEncoder().encode(JSON.stringify({ hello: 'world', n: 42 })) },
  { name: 'stan-talk.png', data: new Uint8Array(5000).map((_, i) => i % 256) }, // größere, nicht-repetitive Datei
];
const zipBytes = buildZipStore(files);
const zipPath = path.join(OUT, 'test-minizip.zip');
writeFileSync(zipPath, zipBytes);

try {
  const py = `
import zipfile, sys, json
with zipfile.ZipFile(${JSON.stringify(zipPath)}) as z:
    bad = z.testzip()
    assert bad is None, f"corrupt entry: {bad}"
    names = z.namelist()
    assert names == ${JSON.stringify(files.map(f => f.name))}, names
    d0 = z.read(names[0])
    assert d0 == ${JSON.stringify(JSON.stringify({ hello: 'world', n: 42 }))}.encode(), d0
    d1 = z.read(names[1])
    assert len(d1) == 5000 and d1[0]==0 and d1[255]==255 and d1[256]==0, (len(d1), d1[:3])
print("PYTHON_ZIPFILE_OK")
`;
  const result = execFileSync('python3', ['-c', py], { encoding: 'utf8' });
  assert(result.includes('PYTHON_ZIPFILE_OK'), 'Python zipfile: alle CRCs, Namen und Inhalte exakt korrekt');
} catch (err) {
  assert(false, `Python-Validierung fehlgeschlagen: ${err.message}`);
}

console.log(failures === 0 ? '\n✅ ALLE TESTS BESTANDEN' : `\n❌ ${failures} FEHLSCHLAG/FEHLSCHLÄGE`);
process.exitCode = failures === 0 ? 0 : 1;
