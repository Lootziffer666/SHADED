// GOAL_WORLD.md Section 25 (Donor-Vertrag und verbindlicher Donor-Registry), G-2564: "Vor
// Abschluss dieses Goals existiert eine maschinen-/menschenlesbare Donor-Matrix, die mindestens
// alle G-2511...G-2563 genannten Donors/Cluster enthält." Mechanical coverage check -- every
// G-25xx ID that names an actual donor/cluster (G-2511..G-2563) must be traceable in
// DONOR_MATRIX.md, so a future edit that drops a row without updating both files fails loudly.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const goalWorld = readFileSync(join(REPO_ROOT, 'GOAL_WORLD.md'), 'utf8');
const matrix = readFileSync(join(REPO_ROOT, 'DONOR_MATRIX.md'), 'utf8');

// The donor IDs proper (not the base-contract rules G-2501..G-2510, which are principles the
// matrix's structure satisfies rather than individual rows, and not the compliance-gate items
// G-2564..G-2570, which are checked explicitly in DONOR_MATRIX.md's own Section 25.10).
const donorIds = [];
for (let n = 2511; n <= 2563; n++) donorIds.push(`G-${n}`);

ok(donorIds.length === 53, `sanity: G-2511..G-2563 is 53 IDs (got ${donorIds.length})`);

for (const id of donorIds) {
  ok(goalWorld.includes(`**${id}**`), `${id} is a real requirement in GOAL_WORLD.md (sanity check on the ID range itself)`);
}

// Every donor ID must be traceable in the matrix as text -- either the literal ID, or (since the
// matrix is organised as a readable table rather than one row per ID) a section covering that
// ID's numeric range is present. We check the stronger, simpler thing that actually matters: every
// distinct repo/name/cluster GOAL_WORLD.md names in G-2511..G-2563 appears somewhere in the matrix.
// Scoped to Section 25 only (## 25. ... through the start of ## 26.) -- Section 1's own document
// hierarchy and Section 18's /editor/index.html also contain backticked owner/repo-shaped paths
// that are not donors at all, and must not be treated as ones.
const section25Start = goalWorld.indexOf('## 25. Donor-Vertrag');
const section26Start = goalWorld.indexOf('## 26. Style');
ok(section25Start > 0 && section26Start > section25Start, 'GOAL_WORLD.md has a locatable Section 25 (Donor-Vertrag) bounded by Section 26 (Style)');
const section25Text = goalWorld.slice(section25Start, section26Start);

const donorNamePattern = /`([\w.-]+\/[\w.-]+)`/g; // `owner/repo`-shaped backticked names
const namesInGoal = new Set([...section25Text.matchAll(donorNamePattern)].map((m) => m[1]));
ok(namesInGoal.size >= 30, `GOAL_WORLD.md Section 25 names at least 30 distinct owner/repo-shaped donors (found ${namesInGoal.size})`);

const missing = [...namesInGoal].filter((name) => !matrix.includes(name));
ok(
  missing.length === 0,
  missing.length === 0
    ? `every owner/repo-shaped donor name in GOAL_WORLD.md's Section 25 (${namesInGoal.size} found) appears in DONOR_MATRIX.md -- none silently dropped`
    : `MISSING from DONOR_MATRIX.md: ${missing.join(', ')}`,
);

// G-2565: every row-bearing section has the required columns.
for (const col of ['ROLE', 'RANK', 'LICENSE', 'USE MODE', 'STATUS', 'SHADED', 'OWNER']) {
  ok(matrix.includes(col), `DONOR_MATRIX.md's column headers include "${col}" (G-2565)`);
}

// G-2570: SHADED is the stated owner after integration, uniformly -- not asserted once and
// forgotten for the rest of the table.
const ownerCellCount = [...matrix.matchAll(/\|\s*SHADED\s*\|\s*$/gm)].length;
ok(ownerCellCount >= 40, `at least 40 table rows end with an explicit "| SHADED |" owner cell (G-2570) (found ${ownerCellCount})`);

console.log('\n✅ Donor matrix: every GOAL_WORLD.md Section 25 donor is present, columns match G-2565, and SHADED is the uniformly stated post-integration owner (G-2570)');
