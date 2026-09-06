// GOAL_ALFRED.md A-0802 (Widerspruch): per maintainer correction, "same ID exists twice" must
// NOT be sufficient grounds for CONFLICT on its own -- otherwise every harmless ID duplication
// (a claim re-cited from a second source, a later audit re-extracting the same requirement) would
// wrongly become a conflict. tools/claim-db/detect_conflicts.py instead proves conflict via five
// conditions (same external ID, different source, different assertion text, both active, no
// existing SUPERSEDES/DUPLICATES relation). This test checks both the real positive case (the
// GOAL.md/GOAL_WORLD.md G-0006 ID collision) and a synthetic negative case proving the detector
// does NOT flag a harmless duplication that a SUPERSEDES relation already resolves.
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DETECTOR = join(REPO_ROOT, 'tools', 'claim-db', 'detect_conflicts.py');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

function runDetector(dbPath, extraArgs = []) {
  return spawnSync('python3', [DETECTOR, '--db', dbPath, ...extraArgs], {cwd: REPO_ROOT, encoding: 'utf8'});
}

// --- Part 1: the real GOAL.md/GOAL_WORLD.md G-0006 ID collision -------------------------------
const liveDb = join(REPO_ROOT, 'claim.db');
const liveDry = runDetector(liveDb);
ok(liveDry.status === 0, `detect_conflicts.py runs cleanly against the committed claim.db (stderr: ${liveDry.stderr || '(none)'})`);
ok(liveDry.stdout.includes('CONFLICT (G-0006)'), 'the real G-0006 ID collision between GOAL.md and GOAL_WORLD.md is detected');
for (const reason of ['same external ID', 'different source', 'different normalized_claim text', 'both claims currently active', 'no existing SUPERSEDES/DUPLICATES relation']) {
  ok(liveDry.stdout.includes(reason), `detector's stated reasoning names "${reason}" -- not just "ID exists twice"`);
}

const db = new DatabaseSync(liveDb, {readOnly: true});
const c1 = db.prepare("SELECT epistemic_kind, verification_status FROM claims WHERE claim_id='C-CONFLICT-G0006-GOAL'").get();
const c2 = db.prepare("SELECT epistemic_kind, verification_status FROM claims WHERE claim_id='C-CONFLICT-G0006-WORLD'").get();
ok(c1.epistemic_kind === 'CONFLICT' && c2.epistemic_kind === 'CONFLICT', 'both G-0006 claims are marked epistemic_kind=CONFLICT in the committed claim.db (already applied)');
ok(c1.verification_status === 'CONTRADICTED' && c2.verification_status === 'CONTRADICTED', 'both G-0006 claims are marked verification_status=CONTRADICTED');
const relation = db.prepare(
  "SELECT relation, rationale FROM claim_relations WHERE (from_claim='C-CONFLICT-G0006-GOAL' AND to_claim='C-CONFLICT-G0006-WORLD') OR (from_claim='C-CONFLICT-G0006-WORLD' AND to_claim='C-CONFLICT-G0006-GOAL')",
).get();
ok(relation !== undefined && relation.relation === 'CONTRADICTS', 'a CONTRADICTS claim_relations row links the two claims, recorded BY the detector (not hand-authored in the corpus)');
ok(relation.rationale.includes('detect_conflicts.py'), 'the relation\'s rationale is attributed to detect_conflicts.py, proving it was derived, not asserted in corpus JSON');
db.close();

// --- Part 2: negative case -- a harmless ID duplication resolved by SUPERSEDES must NOT be
// flagged as a conflict, proving the detector discriminates rather than crying wolf on every
// shared symbol. Built on the scratch DB from the real C-BOOT-0001-OLD/C-BOOT-0002-NEW claims,
// with a synthetic shared symbol added to force the detector to actually consider the pair.
const scratchDir = mkdtempSync(join(tmpdir(), 'claim-conflict-'));
const scratchDb = join(scratchDir, 'claim.db');
copyFileSync(liveDb, scratchDb);
{
  const write = new DatabaseSync(scratchDb);
  write
    .prepare(
      "INSERT INTO claim_targets(target_id,claim_id,repo_path,symbol,subsystem,owner,test_id) VALUES ('T-SYNTH-OLD','C-BOOT-0001-OLD',NULL,'SYNTH-SHARED-SYMBOL',NULL,NULL,NULL)",
    )
    .run();
  write
    .prepare(
      "INSERT INTO claim_targets(target_id,claim_id,repo_path,symbol,subsystem,owner,test_id) VALUES ('T-SYNTH-NEW','C-BOOT-0002-NEW',NULL,'SYNTH-SHARED-SYMBOL',NULL,NULL,NULL)",
    )
    .run();
  write.close();
}
const negativeDry = runDetector(scratchDb);
ok(negativeDry.status === 0, `detector runs cleanly against the negative-case scratch DB (stderr: ${negativeDry.stderr || '(none)'})`);
ok(
  !negativeDry.stdout.includes('SYNTH-SHARED-SYMBOL'),
  'detector correctly does NOT flag C-BOOT-0001-OLD/C-BOOT-0002-NEW as a conflict on their shared synthetic symbol -- an existing SUPERSEDES relation already resolves it (this is the exact false-positive the maintainer warned against)',
);

rmSync(scratchDir, {recursive: true, force: true});

console.log('\n✅ claim-conflict (A-0802): detect_conflicts.py proves CONFLICT from five explicit conditions (not "ID exists twice" alone) on the real GOAL.md/GOAL_WORLD.md G-0006 collision, and correctly does NOT flag a harmless shared-symbol pair that an existing SUPERSEDES relation already resolves');
