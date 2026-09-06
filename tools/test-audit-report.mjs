// AUDIT_REPORT.md is the artifact GOAL.md's Stop-hook condition ("report every G-xxxx item
// individually as PASS with concrete evidence") is judged against. A committed report that has
// drifted from the GOAL docs, or that marks something PASS with a TEST cell nobody actually runs,
// is worse than no report -- it launders unverified claims as verified ones. This test enforces
// that every PASS row is backed by a real, registered, on-disk test.
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

// 1. Regenerating must byte-match what's committed -- if this fails, AUDIT_REPORT.md has drifted
// from the current GOAL.md/GOAL_ALFRED.md/GOAL_FOUNDATION.md/GOAL_WORLD.md and was not refreshed.
const before = readFileSync(join(REPO_ROOT, 'AUDIT_REPORT.md'), 'utf8');
const gen = spawnSync('python3', ['tools/claim-db/scripts/generate_audit_report.py'], {cwd: REPO_ROOT, encoding: 'utf8'});
ok(gen.status === 0, `generate_audit_report.py runs cleanly (stderr: ${gen.stderr || '(none)'})`);
const after = readFileSync(join(REPO_ROOT, 'AUDIT_REPORT.md'), 'utf8');
ok(before === after, 'regenerating AUDIT_REPORT.md from the current GOAL docs byte-matches the committed file (no drift)');

// 2. Parse the table and validate every PASS row.
const behaviorSrc = readFileSync(join(REPO_ROOT, 'tools', 'check-ui-zero.mjs'), 'utf8');
const rows = after
  .split('\n')
  .filter((l) => l.startsWith('| ') && !l.startsWith('| ID ') && !l.startsWith('|---'))
  .map((l) => l.split('|').map((c) => c.trim()).filter((c, i, arr) => !(i === 0 || i === arr.length - 1)));

ok(rows.length > 400, `parsed a substantial number of requirement rows from AUDIT_REPORT.md (found ${rows.length})`);

const FORBIDDEN = ['n/a', 'N/A', '', 'this session'];
function testPathsFrom(cell) {
  // strip parentheticals like "(positive+negative)" or "(rockMask-absence check)" before splitting
  // on "+" -- only the leading path segment(s) are real file references.
  return cell.replace(/\(.*?\)/g, '').split('+').map((s) => s.trim()).filter(Boolean);
}

let passCount = 0;
for (const [id, , status, code, test] of rows) {
  if (!status.includes('PASS')) continue;
  passCount += 1;
  for (const cell of [code, test]) {
    ok(
      !FORBIDDEN.includes(cell.trim()),
      `PASS row ${id}: CODE/TEST cell is not a placeholder ("${cell}")`,
    );
  }
  const candidatePaths = testPathsFrom(test).filter((p) => /^tools\//.test(p) || /\.mjs$/.test(p));
  ok(candidatePaths.length > 0, `PASS row ${id}: TEST cell names at least one tools/*.mjs path ("${test}")`);
  for (const p of candidatePaths) {
    ok(existsSync(join(REPO_ROOT, p)), `PASS row ${id}: TEST path exists on disk (${p})`);
    ok(behaviorSrc.includes(p), `PASS row ${id}: TEST path ${p} is registered in check-ui-zero.mjs's behavior array (actually re-run, not just present)`);
  }
}
ok(passCount > 0, 'at least one PASS row was checked (sanity: the PASS-row loop above actually ran)');

// 3. POLICY discipline: a POLICY row exists to honestly cover a standing behavior that cannot be
// proven PASS the way a built artifact can -- but it must not become a place to dump work that
// COULD have a real test. Every POLICY row needs a substantive rationale (not a placeholder), and
// nothing already covered by a real EVIDENCE-backed PASS test may also appear as POLICY (that
// would mean the "unguardable" claim was false).
const policyRows = rows.filter(([, , status]) => status.includes('POLICY'));
ok(policyRows.length > 0, `at least one POLICY row exists to check (found ${policyRows.length})`);
const passIds = new Set(rows.filter(([, , status]) => status.includes('PASS')).map(([id]) => id));
for (const row of policyRows) {
  const [id, , , code, test, detail] = row;
  ok(!FORBIDDEN.includes((detail || '').trim()) && (detail || '').length > 40, `POLICY row ${id}: has a substantive rationale, not a placeholder (${(detail || '').length} chars)`);
  ok(code.includes('standing behavior'), `POLICY row ${id}: CODE cell is explicitly marked as a standing behavior, not left ambiguous with a real artifact's N/A`);
  ok(!passIds.has(id), `POLICY row ${id}: is not ALSO a PASS row (a rule can't be both "unguardable" and mechanically proven)`);
}

// 4. DEFERRED discipline: A-xxxx/F-xxxx items must never be DEFERRED (both GOAL_ALFRED.md and
// GOAL_FOUNDATION.md explicitly forbid deferring on size/difficulty grounds), and every section
// marker the generator treats as legitimately staged-later must be a real, verbatim heading in
// GOAL_WORLD.md (so the deferred set can't silently grow via a typo'd or invented marker).
const deferredRows = rows.filter(([, , status]) => status.includes('DEFERRED'));
ok(deferredRows.length > 0, `at least one DEFERRED row exists to check (found ${deferredRows.length})`);
const nonWorldDeferred = deferredRows.filter(([id]) => !id.startsWith('G-'));
ok(
  nonWorldDeferred.length === 0,
  nonWorldDeferred.length === 0
    ? 'no A-xxxx or F-xxxx row is ever marked DEFERRED (Alfred/Foundation forbid deferring on difficulty grounds)'
    : `A-xxxx/F-xxxx rows illegitimately marked DEFERRED: ${nonWorldDeferred.map((r) => r[0]).join(', ')}`,
);

const generatorSrc = readFileSync(join(REPO_ROOT, 'tools', 'claim-db', 'scripts', 'generate_audit_report.py'), 'utf8');
const goalWorld = readFileSync(join(REPO_ROOT, 'GOAL_WORLD.md'), 'utf8');
const markerMatches = [...generatorSrc.matchAll(/^\s*"(## .+?)",$/gm)];
ok(markerMatches.length > 0, `generator's DEFERRED_SECTION_MARKERS list is parseable (found ${markerMatches.length} entries)`);
for (const [, marker] of markerMatches) {
  ok(goalWorld.includes(marker), `DEFERRED_SECTION_MARKERS entry is a verbatim heading in GOAL_WORLD.md: "${marker}"`);
}

console.log(`\n✅ AUDIT_REPORT.md: no drift from source docs, ${passCount} PASS rows all cite a real registered test, DEFERRED discipline holds`);
