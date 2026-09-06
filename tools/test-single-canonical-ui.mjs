// GOAL_WORLD.md Section 18 (G-1801/G-1803): "Es gibt genau EINE user-facing SHADED-UI mit
// kanonischem Root /index.html" and legacy/compatibility UI is not active architecture. Existing
// guards (verify-no-legacy-ui.mjs, verify-pwa.mjs) prove the deleted editor/ tree stays deleted,
// but nothing enumerated the *other* HTML files already in this repo and checked whether any of
// them is quietly acting as a second production entry point. CLAUDE.md's UI-zero rule 7
// ("Isolated research/solver labs are not production UI and may remain") is the one legitimate
// exception -- this test makes that exception explicit and closed, instead of implicit and
// unchecked, so a new stray *.html file some future change adds must be deliberately classified
// here rather than silently existing as an uncounted second UI.
import {readFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const CANONICAL = 'index.html';

// CLAUDE.md UI-zero rule 7: isolated research/solver labs may remain. Each entry here is a
// concrete, named exception with a reason -- not a wildcard.
const EXEMPT = new Map([
  ['sandbox/index.html', 'isolated WebGPU sandbox research lab (UI-zero rule 7)'],
  ['solver-lab/erosion/index.html', 'isolated solver-lab research page (UI-zero rule 7)'],
  ['solver-lab/coupled/index.html', 'isolated solver-lab research page (UI-zero rule 7)'],
  ['solver-lab/granular/index.html', 'isolated solver-lab research page (UI-zero rule 7)'],
  ['rendergraph/demo.html', 'isolated rendergraph research/demo page (UI-zero rule 7)'],
  ['webgpu-depth-anything/test-webgpu-inference.html', 'isolated inference test harness, not production UI'],
  ['tools/sprite-exporter.html', 'developer tool page under tools/, not shipped production UI'],
  ['tools/test-actor-visual.html', 'developer/test tool page under tools/, not shipped production UI'],
  ['tools/costume-browser.html', 'developer tool page under tools/, not shipped production UI'],
  ['tools/scratch-face-mirror-editor.html', 'developer tool page under tools/, not shipped production UI'],
  [
    'gaime_shader_editor_pro_v2_6_bio_physics_edition.html',
    'CLAUDE.md: "remains an ideas reference only, not an active runtime source"',
  ],
]);

const gitFiles = execSync('git ls-files -- "*.html"', {cwd: REPO_ROOT, encoding: 'utf8'})
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

ok(gitFiles.includes(CANONICAL), 'index.html is tracked and present (the one canonical UI root, G-1801)');

const unclassified = gitFiles.filter((f) => f !== CANONICAL && !EXEMPT.has(f));
ok(
  unclassified.length === 0,
  unclassified.length === 0
    ? `every non-canonical *.html file in the repo (${EXEMPT.size} found) is an explicitly classified, named exception under CLAUDE.md's research-lab rule (G-1801/G-1803)`
    : `unclassified *.html file(s) exist that are neither index.html nor a named exception -- a possible second production UI: ${unclassified.join(', ')}`,
);

// G-1803: none of the exempt research/dev pages may be wired into index.html as an alternate
// entry point -- being exempt means "may remain in isolation," not "may be promoted."
const indexHtml = readFileSync(join(REPO_ROOT, CANONICAL), 'utf8');
for (const exemptPath of EXEMPT.keys()) {
  ok(!indexHtml.includes(exemptPath), `index.html does not link/embed the exempt page ${exemptPath} (it stays isolated, not promoted to production UI)`);
}

// G-1806: root HTML stays thin; runtime/UI logic lives in modules, not inlined into the host.
const scriptTags = [...indexHtml.matchAll(/<script\b[^>]*>/gi)];
ok(scriptTags.length === 1, `index.html has exactly one <script> tag (found ${scriptTags.length}), not an accumulating inline-logic host (G-1806)`);
ok(/type="module"\s+src="\/src\/main\.js"/.test(indexHtml), 'index.html\'s single script tag is a module import of /src/main.js, not inline logic (G-1806)');
const lineCount = indexHtml.split('\n').length;
ok(lineCount < 300, `index.html stays thin (${lineCount} lines, threshold 300) -- runtime/UI logic is modular, not accumulating in the host (G-1806)`);

console.log(`\n✅ single-canonical-UI: index.html is the sole, thin production entry point; all ${EXEMPT.size} other *.html files are named, isolated research/dev exceptions per CLAUDE.md, none wired in as a second UI (G-1801/G-1803/G-1806)`);
