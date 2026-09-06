// GOAL_ALFRED.md A-0803 (Supersession): per maintainer correction, "a newer claim exists" is not
// itself sufficient -- there must be a real relationship: old claim -> replaced by -> new claim
// -> with provenance -> old claim retained historically -> current truth resolves to new claim.
// This test checks every one of those five parts against the real Snowflow-boot-chain
// supersession (commit ec32657, documented in CLAUDE.md's own "Status" section).
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = join(REPO_ROOT, 'claim.db');
const GAP_QUERY = join(REPO_ROOT, 'tools', 'claim-db', 'gap_query.py');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const db = new DatabaseSync(DB_PATH, {readOnly: true});

// 1. old claim -> replaced by -> new claim: a real SUPERSEDES relation exists.
const relation = db
  .prepare("SELECT from_claim, to_claim, rationale FROM claim_relations WHERE relation='SUPERSEDES' AND to_claim='C-BOOT-0001-OLD'")
  .get();
ok(relation !== undefined, 'a SUPERSEDES claim_relations row points from a newer claim to C-BOOT-0001-OLD');
ok(relation.from_claim === 'C-BOOT-0002-NEW', `the superseding claim is C-BOOT-0002-NEW (found: ${relation.from_claim})`);

// 2. with provenance: the rationale cites the real commit that made the change, not a vague claim.
ok(relation.rationale.includes('ec3265749dd2648d74327bbc51ef8d21648a0c88'), 'the SUPERSEDES relation\'s rationale cites the real commit SHA that made the switch');
const newClaimSource = db.prepare("SELECT original_text FROM claim_sources WHERE claim_id='C-BOOT-0002-NEW'").get();
ok(newClaimSource !== undefined && newClaimSource.original_text.includes('ec32657'), 'C-BOOT-0002-NEW\'s own claim_sources citation also carries real commit provenance');
const oldClaimSource = db.prepare("SELECT original_text FROM claim_sources WHERE claim_id='C-BOOT-0001-OLD'").get();
ok(oldClaimSource !== undefined && oldClaimSource.original_text.includes('681213a7e0726171ec8e92bba1038b3df6e3fdbe'), 'C-BOOT-0001-OLD\'s own claim_sources citation carries the pre-switch commit as provenance (verifiable via git show)');

// 3. old claim retained historically: not deleted, still a real, queryable row.
const oldClaim = db.prepare("SELECT claim_id, verification_status FROM claims WHERE claim_id='C-BOOT-0001-OLD'").get();
ok(oldClaim !== undefined, 'C-BOOT-0001-OLD still exists as a row in claims -- supersession did not delete it');
ok(oldClaim.verification_status === 'VERIFIED', 'C-BOOT-0001-OLD is VERIFIED as the historical fact it was (checkable via git show at the cited commit), not silently marked invalid');
db.close();

// 4. current truth resolves to new claim: tools/claim-db/gap_query.py --resolve must walk the
// SUPERSEDES chain from the OLD claim and land on the NEW one, not require already knowing the answer.
const resolved = spawnSync('python3', [GAP_QUERY, '--resolve', 'C-BOOT-0001-OLD'], {cwd: REPO_ROOT, encoding: 'utf8'});
ok(resolved.status === 0, `gap_query.py --resolve C-BOOT-0001-OLD exits 0 (stderr: ${resolved.stderr || '(none)'})`);
ok(resolved.stdout.includes('Current truth: C-BOOT-0002-NEW'), '--resolve starting from the OLD claim correctly walks the chain to the NEW claim as current truth');
ok(resolved.stdout.includes('History (oldest -> newest): C-BOOT-0001-OLD -> C-BOOT-0002-NEW'), '--resolve reports the full chain, oldest to newest, not just the endpoint');
ok(resolved.stdout.includes('Superseded history (retained, not deleted):'), '--resolve explicitly surfaces the superseded claim as retained history, not silently hidden');
ok(resolved.stdout.includes('C-BOOT-0001-OLD (superseded)'), '--resolve labels the old claim as superseded rather than presenting it as equally current');

// 5. sanity: resolving from the NEW claim directly is a no-op (it IS already current truth).
const resolvedFromNew = spawnSync('python3', [GAP_QUERY, '--resolve', 'C-BOOT-0002-NEW'], {cwd: REPO_ROOT, encoding: 'utf8'});
ok(resolvedFromNew.stdout.includes('Current truth: C-BOOT-0002-NEW'), '--resolve starting already at the current claim returns itself (terminal chain of length 1)');
ok(!resolvedFromNew.stdout.includes('Superseded history'), 'resolving the already-current claim reports no superseded history section (nothing further supersedes it)');

console.log('\n✅ claim-supersession (A-0803): a real SUPERSEDES relation with commit-level provenance links C-BOOT-0002-NEW to C-BOOT-0001-OLD, the old claim is retained (not deleted), and gap_query.py --resolve walks the chain from either end to the correct current truth');
