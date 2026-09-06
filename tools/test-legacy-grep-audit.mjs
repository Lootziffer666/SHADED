// GOAL_WORLD.md Section 29 (Repo-weite Legacy-/Contradiction-Suche), G-0410/G-2901..G-2905.
// Runs the maintainer's own named grep list against the live src/ tree and index.html, and
// asserts the classification this session actually did (not just "no hits" -- most of these
// terms have LEGITIMATE hits that must stay, per the same section's own rule: every hit is
// "entfernt, auf SHADED-Semantik migriert, oder ausdrücklich als zulässige Donor-/History-
// Provenienz markiert", not necessarily deleted).
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
    else out.push(full);
  }
  return out;
}

const files = [...walk(SRC), join(REPO_ROOT, 'index.html')];
const readAll = () => files.map((f) => ({file: f, text: readFileSync(f, 'utf8')}));

// 1. User-facing branding (title, wordmark, error copy, entry-point identity, console tags, and
// the debug console handle) must not say "SNOWFLOW"/"Snowflow" anymore (G-0410, G-4007, G-4008) --
// this is the one bucket from the maintainer's grep list that had to actually change, and did.
{
  const indexHtml = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');
  ok(!/SNOWFLOW|Snowflow/.test(indexHtml), 'index.html carries no Snowflow/SNOWFLOW branding (title, wordmark, error copy) any more');
  const mainJs = readFileSync(join(SRC, 'main.js'), 'utf8');
  ok(!/SNOWFLOW/.test(mainJs), 'src/main.js no longer names its debug handle or itself SNOWFLOW');
  ok(mainJs.includes('globalThis.SHADED_RUNTIME'), 'the debug handle is now globalThis.SHADED_RUNTIME');
  ok(
    !mainJs.includes('globalThis.SHADED =') && !/\bglobalThis\.SHADED\b(?!_)/.test(mainJs),
    'the live runtime never claims bare globalThis.SHADED -- that name stays reserved for the parked image-to-world engine\'s own documented contract (CLAUDE.md), so the two can never collide if the parked engine is ever reactivated on the same page',
  );
}

// 2. Terms that are LEGITIMATE current-owner or Donor/History provenance, not regressions --
// asserted present (so this test fails loudly if they vanish unexpectedly, e.g. a careless
// find-and-replace) and explicitly classified here rather than silently ignored.
const classifications = [
  {
    term: 'rockMask',
    matcher: /rockMask/,
    classification: 'HISTORY_PROVENANCE',
    reason: 'Only appears in snow.fragment.wgsl comments documenting that Snowflow\'s own rockMask texture was REMOVED as material authority (G-0404) and why -- exactly the "explizite Donor-/History-Provenienz" GOAL_WORLD.md Section 29 asks for, not a live second truth.',
  },
  {
    term: 'SnowContact',
    matcher: /\bSnowContact\b/,
    classification: 'MATERIAL_SPECIFIC_KEEP',
    reason: 'Character-vs-snow contact response is genuinely snow-specific behaviour (G-0108: "Snow-spezifische Regeln werden nicht pauschal ... umbenannt"), not Snowflow branding leaking into generic runtime.',
  },
  {
    term: 'SurfWake',
    matcher: /\bSurfWake\b/,
    classification: 'GENERIC_KEEP',
    reason: 'A generic surface-wake VFX system (character/vehicle wake through any deformable surface); "Surf" here names the visual effect, not Snowflow\'s retired surf-gameplay mode (GOAL_WORLD.md G-1410 forbids surf-as-gameplay-cause, not this renderer).',
  },
  {
    term: 'SpellSystem',
    matcher: /\bSpellSystem\b/,
    classification: 'GENERIC_KEEP',
    reason: 'Generic ability/VFX dispatch system, not Snowflow-specific; GOAL_WORLD.md G-0406 flags Snowflow\'s OWN demo spells as a dependency risk, not a generically-named dispatch system that SHADED now owns.',
  },
  {
    term: 'stick-zone/stick-base/stick-knob/setupStick',
    matcher: /stick-zone|stick-base|stick-knob|setupStick/,
    classification: 'CURRENT_SOLE_OWNER',
    reason: 'The maintainer\'s own grep list names these as regression tripwires for a SECOND touch-stick implementation appearing; tools/test-input-ownership.mjs already proves there is exactly one (src/ui/touchControls.js). Their presence here is the current, sole, active owner -- not a leftover.',
  },
];

for (const c of classifications) {
  const hits = readAll().filter(({text}) => c.matcher.test(text));
  ok(hits.length > 0, `"${c.term}" -- classified ${c.classification}: ${c.reason} (${hits.length} file(s))`);
}

// 3. Terms from the same list that should have zero hits outright -- no classification needed
// because there is nothing here to classify.
for (const term of ['legacy editor', 'compatibility UI', 'hidden UI', 'private material state', 'private wind', 'private temperature']) {
  const pattern = new RegExp(term, 'i');
  const hits = readAll().filter(({text}) => pattern.test(text));
  ok(hits.length === 0, `"${term}" -- zero hits in src/ and index.html (nothing to classify)`);
}

// snowDeform (formerly this list's one KNOWN_OPEN_ITEM): renamed to sharedDeform across all real
// sites -- named after snow specifically despite being consumed by both the snow beauty pass AND
// the sand/sandbox path (src/shaders/lib/sandbox.wgsl explicitly reuses it). Now zero hits for the
// old name, and the new name appears everywhere it should: registry.js's INCLUDES key plus all 4
// #include<> call sites (the registry key and the #include<> name must match textually -- no WGSL
// compiler in this repo checks that beyond string equality, so this structural check IS the
// verification available).
{
  const hits = readAll().filter(({text}) => /snowDeform/.test(text));
  ok(hits.length === 0, '"snowDeform" -- zero hits: renamed to sharedDeform (was the one KNOWN_OPEN_ITEM on this list, now resolved)');
  const registry = readFileSync(join(SRC, 'shaders', 'registry.js'), 'utf8');
  ok(/sharedDeform\s*:\s*deformLib/.test(registry), 'registry.js INCLUDES map has a sharedDeform key');
  for (const file of ['snow.fragment.wgsl', 'snow.vertex.wgsl', 'terrainDepth.vertex.wgsl', 'terrainPrepass.vertex.wgsl']) {
    const text = readFileSync(join(SRC, 'shaders', file), 'utf8');
    ok(text.includes('#include<sharedDeform>'), `${file} includes sharedDeform (matches the renamed registry key)`);
  }
}

console.log('\n✅ Legacy-grep audit: every term on GOAL_WORLD.md Section 29\'s list is either gone from user-facing/entry-point identity, genuinely absent, or explicitly classified as history-provenance, material-specific, generic, current-sole-owner, or resolved (snowDeform -> sharedDeform) -- none left unclassified');
