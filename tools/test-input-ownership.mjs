// GOAL_WORLD.md Section 19 (Input Ownership / Virtual Joystick Regression), G-1901..G-1908, and
// Section 29's repo-wide legacy grep for `stick-zone`/`stick-base`/`stick-knob`/`setupStick`.
//
// This is the NEGATIVE test the maintainer flagged as missing: proving a new touch provider
// exists is not proof an old one was removed. There is, as of this commit, only ever been one
// touch-stick implementation in this repo's history (git log confirms no prior joystick file
// under any name, and Snowflow's own original import brought no touch UI at all) -- so this test
// asserts that single-owner invariant holds structurally, and will fail the moment a second
// provider is added without removing the first.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join, relative} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(REPO_ROOT, 'src');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(js|mjs|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const srcFiles = walk(SRC);
const OLD_OWNER_SYMBOLS = ['stick-zone', 'stick-base', 'stick-knob', 'setupStick'];

// 1. Exactly one file defines the touch-stick DOM/handler symbols named in GOAL_WORLD.md's own
// repo-wide legacy grep list -- proves no second provider has been added alongside this one.
const filesWithStickSymbols = srcFiles.filter((f) => {
  const text = readFileSync(f, 'utf8');
  return OLD_OWNER_SYMBOLS.some((sym) => text.includes(sym));
});
ok(
  filesWithStickSymbols.length === 1,
  `exactly one file under src/ defines touch-stick symbols (${OLD_OWNER_SYMBOLS.join(', ')}) -- found: ${filesWithStickSymbols.map((f) => relative(REPO_ROOT, f)).join(', ') || 'none'}`,
);
const provider = filesWithStickSymbols[0];
ok(
  relative(REPO_ROOT, provider) === 'src/ui/touchControls.js',
  `the single touch-stick provider is src/ui/touchControls.js (found: ${relative(REPO_ROOT, provider)})`,
);

// 2. Exactly one file exports a touch-input initializer, and main.js's active production entry
// point imports and calls exactly that one, exactly once (G-1904, G-1908).
const providerText = readFileSync(provider, 'utf8');
ok(/export function initTouchControls\(/.test(providerText), 'touchControls.js exports initTouchControls()');

const mainPath = join(SRC, 'main.js');
const mainText = readFileSync(mainPath, 'utf8');
const importMatches = [...mainText.matchAll(/import\s*\{\s*initTouchControls\s*\}\s*from\s*["']\.\/ui\/touchControls\.js["']/g)];
ok(importMatches.length === 1, `src/main.js imports initTouchControls from ./ui/touchControls.js exactly once (found ${importMatches.length})`);

const callMatches = [...mainText.matchAll(/\binitTouchControls\s*\(/g)];
ok(callMatches.length === 1, `src/main.js calls initTouchControls() exactly once (found ${callMatches.length})`);

// No other module in src/ imports a differently-named touch/joystick initializer -- guards
// against a second provider being wired in under a different function name.
const otherTouchInitImports = srcFiles.filter((f) => {
  if (f === mainPath) return false;
  const text = readFileSync(f, 'utf8');
  return /import\s*\{[^}]*\b(init\w*Touch\w*|init\w*Joystick\w*|init\w*Stick\w*)\b[^}]*\}/.test(text);
});
ok(otherTouchInitImports.length === 0, 'no file other than main.js imports a touch/joystick/stick initializer');

// 3. Move and look state are each produced by exactly one code path within the single provider
// (G-1901, G-1902) -- two setupStick() calls (move, look), not more, not fewer.
const setupStickCalls = [...providerText.matchAll(/\bsetupStick\s*\(/g)];
const setupStickDefs = [...providerText.matchAll(/function\s+setupStick\s*\(/g)];
ok(setupStickDefs.length === 1, `touchControls.js defines setupStick() exactly once (found ${setupStickDefs.length})`);
ok(
  setupStickCalls.length - setupStickDefs.length === 2,
  `touchControls.js invokes setupStick() exactly twice -- one move provider, one look provider (found ${setupStickCalls.length - setupStickDefs.length} invocations)`,
);

console.log('\n✅ Input ownership: exactly one active touch-stick provider, wired exactly once from the real production entry point (src/main.js), no second owner found');
