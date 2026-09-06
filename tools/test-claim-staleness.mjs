// GOAL_ALFRED.md A-0805 (Staleness): "Aenderung an betroffener Primaerevidenz markiert fruehere
// Verification zur erneuten Pruefung." Two things must be true: (1) the checker generically
// detects staleness when a claim's evidenced file changed since it was last checked, and (2) it
// does NOT keep flagging a claim forever once a fresher recheck superseded the outdated evidence
// -- which is exactly the real cycle this session went through with C-INPUT-0001 (see
// tools/claim-db/corpus/evidence/0002-input-ownership-recheck.json).
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(REPO_ROOT, 'tools', 'claim-db', 'check_staleness.py');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

function runChecker(dbPath, extraArgs = []) {
  return spawnSync('python3', [CHECKER, '--db', dbPath, ...extraArgs], {cwd: REPO_ROOT, encoding: 'utf8'});
}

// --- Part 1: the real, historical detect -> recheck cycle on the committed claim.db -----------
const liveDb = join(REPO_ROOT, 'claim.db');
const liveDry = runChecker(liveDb);
ok(liveDry.status === 0, `check_staleness.py runs cleanly against the committed claim.db (stderr: ${liveDry.stderr || '(none)'})`);
ok(
  liveDry.stdout.includes('No VERIFIED claims are stale relative to HEAD'),
  'the committed claim.db has no stale VERIFIED claims right now -- C-INPUT-0001\'s recheck evidence (checked at HEAD c4bfd88) is fresh, superseding the original 9ecd208-dated evidence',
);

const db = new DatabaseSync(liveDb, {readOnly: true});
const inputEvidence = db.prepare(
  "SELECT evidence_id, checked_commit FROM verification_evidence WHERE claim_id='C-INPUT-0001' ORDER BY checked_at",
).all();
ok(inputEvidence.length === 4, `C-INPUT-0001 carries both the original evidence and the A-0805 recheck evidence (found ${inputEvidence.length} rows)`);
ok(
  inputEvidence.some((r) => r.evidence_id.includes('RECHECK')),
  'C-INPUT-0001 has at least one RECHECK evidence row, proving the stale->recheck->reverified cycle actually happened, not just the mechanism existing in the abstract',
);
db.close();

// --- Part 2: generic detection on a synthetic scratch DB, using a REAL file we know changed ----
// (src/main.js changed after commit 9ecd208 per git history -- see EV-INPUT-0001-POSITIVE's
// original checked_commit). This proves the checker's git-diff-based detection is not a stub.
const scratchDir = mkdtempSync(join(tmpdir(), 'claim-staleness-'));
const scratchDb = join(scratchDir, 'claim.db');
copyFileSync(liveDb, scratchDb);

const oldCommit = '9ecd2085928c955ad335ae0b62f695d5f431d308';
{
  const scratchWrite = new DatabaseSync(scratchDb);
  scratchWrite
    .prepare("UPDATE verification_evidence SET checked_commit=?, checked_at='2020-01-01T00:00:00Z' WHERE claim_id='C-INPUT-0001'")
    .run(oldCommit);
  scratchWrite.close();
}

const dryRun = runChecker(scratchDb);
ok(dryRun.status === 0, `dry run against the synthetic stale scratch DB exits 0 (stderr: ${dryRun.stderr || '(none)'})`);
ok(dryRun.stdout.includes('STALE: C-INPUT-0001'), 'checker correctly flags C-INPUT-0001 as stale once its evidence is rolled back to the pre-recheck commit (real git history: src/main.js changed after that commit)');
ok(dryRun.stdout.includes('src/main.js'), 'the flagged staleness names the actual changed path (src/main.js), not a vague claim-level flag');
ok(dryRun.stdout.includes('Dry run'), 'without --apply, the checker reports what would change but does not write it (dry run by default)');

const beforeApply = new DatabaseSync(scratchDb, {readOnly: true}).prepare(
  "SELECT verification_status FROM claims WHERE claim_id='C-INPUT-0001'",
).get();
ok(beforeApply.verification_status === 'VERIFIED', 'sanity: before --apply, the scratch claim is still VERIFIED (dry run made no DB change)');

const applied = runChecker(scratchDb, ['--apply']);
ok(applied.status === 0, `--apply run exits 0 (stderr: ${applied.stderr || '(none)'})`);
const afterApply = new DatabaseSync(scratchDb, {readOnly: true});
const claimAfter = afterApply.prepare("SELECT verification_status FROM claims WHERE claim_id='C-INPUT-0001'").get();
ok(claimAfter.verification_status === 'STALE_NEEDS_RECHECK', `--apply demotes the claim to STALE_NEEDS_RECHECK (found: ${claimAfter.verification_status})`);
const findingRow = afterApply.prepare("SELECT finding_type, status FROM audit_findings WHERE claim_id='C-INPUT-0001' AND finding_type='STALE_EVIDENCE'").get();
ok(findingRow !== undefined, '--apply records an audit_findings row (finding_type=STALE_EVIDENCE) explaining the demotion, not a silent status flip');
afterApply.close();

// --- Part 3: a stale->recheck cycle must auto-resolve the earlier OPEN finding, not leave it
// sitting forever once the claim is fresh again (OFFENE_LUECKEN must not lie about a closed gap).
{
  const write = new DatabaseSync(scratchDb);
  write.exec(`
    INSERT INTO audits(audit_id,corpus_snapshot,repo_commit,created_at,previous_audit_id)
    VALUES ('AUD-STALE-TESTFIXTURE','staleness-check','deadbeef','2020-01-01T00:00:00Z',NULL)
  `);
  write
    .prepare(
      `INSERT INTO audit_findings(finding_id,audit_id,claim_id,finding_type,severity,details,status,created_at)
       VALUES ('F-STALE-TESTFIXTURE-001','AUD-STALE-TESTFIXTURE','C-INPUT-0001','STALE_EVIDENCE','MEDIUM','synthetic pre-existing open finding','OPEN','2020-01-01T00:00:00Z')`,
    )
    .run();
  write.close();
}
// restore fresh (HEAD-dated) evidence so the claim is NOT currently stale, matching the real
// post-recheck state, then run --apply: the synthetic OPEN finding above should resolve.
const headSha = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: REPO_ROOT, encoding: 'utf8'}).stdout.trim();
{
  const write = new DatabaseSync(scratchDb);
  write
    .prepare("UPDATE verification_evidence SET checked_commit=?, checked_at='2099-01-01T00:00:00Z' WHERE claim_id='C-INPUT-0001'")
    .run(headSha);
  // Part 2's --apply demoted the claim to STALE_NEEDS_RECHECK. A real recheck restores VERIFIED
  // via fresh evidence's set_verification_status (see corpus/evidence/0002-input-ownership-recheck.json);
  // simulate that same restoration here before checking that the OPEN finding auto-resolves.
  write.prepare("UPDATE claims SET verification_status='VERIFIED' WHERE claim_id='C-INPUT-0001'").run();
  write.close();
}
const applyAgain = runChecker(scratchDb, ['--apply']);
ok(applyAgain.status === 0, `second --apply run (claim now fresh again) exits 0 (stderr: ${applyAgain.stderr || '(none)'})`);
ok(
  applyAgain.stdout.includes('Resolved 1 previously-open STALE_EVIDENCE finding'),
  `--apply auto-resolves the earlier OPEN STALE_EVIDENCE finding once its claim is fresh/VERIFIED again (stdout: ${applyAgain.stdout.trim()})`,
);
const finalDb = new DatabaseSync(scratchDb, {readOnly: true});
const fixtureFinding = finalDb.prepare("SELECT status FROM audit_findings WHERE finding_id='F-STALE-TESTFIXTURE-001'").get();
ok(fixtureFinding.status === 'RESOLVED', `the synthetic finding's status is RESOLVED, not left OPEN forever (found: ${fixtureFinding.status})`);
finalDb.close();

rmSync(scratchDir, {recursive: true, force: true});

console.log('\n✅ claim-staleness (A-0805): check_staleness.py demonstrably detects real file changes since a claim was last checked, demotes to STALE_NEEDS_RECHECK with a recorded finding, and the real C-INPUT-0001 recheck cycle in the committed claim.db proves the recovery path (stale -> fresh recheck -> re-VERIFIED) actually happened, not just the mechanism existing in the abstract');
