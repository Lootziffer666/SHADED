// Structural lint for content/*.js narrative data (SHADED.dialogue.play() beat arrays).
// Deliberately does NOT touch a browser/DOM - pure data-shape validation, fast, no deps.
// Nutzung: node tools/test-content-lint.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');
const VALID_TYPES = new Set(['direction', 'line', 'lens', 'sound-emit']);

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('✗ FAIL:', msg); failures++; } else { console.log('✓ ok:', msg); } }

function lintBeats(file, beats) {
  assert(Array.isArray(beats) && beats.length > 0, `${file}: ist ein nicht-leeres Array (${Array.isArray(beats) ? beats.length : typeof beats})`);
  if (!Array.isArray(beats)) return;
  let bad = 0;
  beats.forEach((b, i) => {
    if (!b || typeof b !== 'object') { bad++; return; }
    if (!VALID_TYPES.has(b.type)) { console.error(`  ${file}[${i}]: unbekannter type "${b.type}"`); bad++; }
    if ((b.type === 'direction' || b.type === 'line') && (typeof b.text !== 'string' || !b.text.trim())) { console.error(`  ${file}[${i}]: leerer/fehlender text`); bad++; }
    if (b.type === 'line' && (typeof b.speaker !== 'string' || !b.speaker.trim())) { console.error(`  ${file}[${i}]: line ohne speaker`); bad++; }
    if (b.type === 'lens' && (typeof b.n !== 'number' || b.n < 1 || b.n > 5)) { console.error(`  ${file}[${i}]: lens.n außerhalb 1..5`); bad++; }
  });
  assert(bad === 0, `${file}: alle ${beats.length} Beats strukturell gültig (${bad} Probleme)`);
}

const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.js'));
assert(files.length > 0, `content/ enthält mindestens eine .js-Datei (gefunden: ${files.length})`);
for (const file of files) {
  const src = readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  const window = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(window);
  const exported = Object.keys(window).filter((k) => k.startsWith('SHADED_'));
  assert(exported.length > 0, `${file}: exportiert mindestens ein window.SHADED_*`);
  for (const key of exported) lintBeats(`${file}:${key}`, window[key]);
}

console.log(failures === 0 ? '\n✅ ALLE TESTS BESTANDEN' : `\n❌ ${failures} FEHLSCHLAG/FEHLSCHLÄGE`);
process.exitCode = failures === 0 ? 0 : 1;
