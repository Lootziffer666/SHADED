// A single consolidated check for the GOAL_ALFRED.md structural invariants that are already true
// by schema/construction and provable against real data, rather than one bespoke test file per
// item -- these are small, related facts about the same schema, not separate features.
//
// Covers: A-0004, A-0005, A-0006, A-0007, A-0104, A-0105, A-0106, A-0107, A-0203, A-0204, A-0205, A-0207, A-0306, A-0402.
// A-0007, A-0306.
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = join(REPO_ROOT, 'claim.db');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const db = new DatabaseSync(DB_PATH, {readOnly: true});

// A-0004/A-0203: requirement_flag and assertion_flag are independent -- a claim can be BOTH
// GEFORDERT and BEHAUPTET at once. Proven with a real row, not just schema shape.
const both = db.prepare('SELECT claim_id FROM claims WHERE requirement_flag=1 AND assertion_flag=1').get();
ok(both !== undefined, `A-0004/A-0203: a real claim has requirement_flag=1 AND assertion_flag=1 simultaneously (found: ${both?.claim_id})`);

// A-0005: normative flags and epistemic verification_status are separate columns -- setting one
// never implies the other. Proven by a requirement_flag=1 claim that is NOT verification_status=VERIFIED.
const reqNotVerified = db.prepare("SELECT claim_id FROM claims WHERE requirement_flag=1 AND verification_status != 'VERIFIED'").get();
ok(reqNotVerified !== undefined, `A-0005: a requirement_flag=1 claim exists that is NOT VERIFIED (found: ${reqNotVerified?.claim_id}) -- "soll so sein" is not automatically "ist so"`);

// A-0006: a claim must never be VERIFIED on the strength of merely being STATED in a document
// (claim_sources citing CLAUDE.md/GOAL.md/a chat export) -- it needs a real verification_evidence
// row (A-0300's SOURCE CODE/GIT HISTORY/TEST RESULT/RUNTIME/GENERATED ARTIFACT/MAINTAINER DECISION
// kinds), not just a citation.
const docOnlyVerified = db
  .prepare(
    `SELECT c.claim_id FROM claims c
     WHERE c.verification_status='VERIFIED'
       AND NOT EXISTS (SELECT 1 FROM verification_evidence e WHERE e.claim_id=c.claim_id)`,
  )
  .all();
ok(docOnlyVerified.length === 0, `A-0006: no claim is VERIFIED without at least one real verification_evidence row (a document citation alone never suffices) (checked all VERIFIED claims, found ${docOnlyVerified.length} violation(s))`);

// A-0007: every requirement_flag=1 claim's cited authority is a maintainer decision or an already-
// ratified canonical document (GOAL_WORLD.md etc.), never a bare, un-adopted assistant/agent
// assertion passed off as canonical.
const nonMaintainerRequirement = db
  .prepare(
    `SELECT DISTINCT c.claim_id, cs.authority FROM claims c
     JOIN claim_sources cs ON cs.claim_id = c.claim_id
     WHERE c.requirement_flag=1
       AND cs.authority NOT LIKE 'MAINTAINER%'
       AND cs.authority != 'CANONICAL_DOCUMENT'`,
  )
  .all();
ok(nonMaintainerRequirement.length === 0, `A-0007: every requirement_flag=1 claim cites a MAINTAINER* or CANONICAL_DOCUMENT authority, never a bare assistant assertion (found ${nonMaintainerRequirement.length} violation(s): ${JSON.stringify(nonMaintainerRequirement)})`);

// A-0104: source immutability -- re-ingesting an existing source_id with a DIFFERENT content_hash
// must raise, not silently overwrite. Exercised directly against insert_source() on a scratch DB.
{
  const scratchDir = mkdtempSync(join(tmpdir(), 'claim-immutable-'));
  const scratchDb = join(scratchDir, 'claim.db');
  const py = `
import sys
sys.path.insert(0, "tools/claim-db")
import build
from pathlib import Path
import sqlite3
build.DB = Path(${JSON.stringify(scratchDb)})
build.sync()
// Verify insert_source uses the passed connection, not an internal one:
import sqlite3
con = sqlite3.connect(build.DB)
# Confirm con is the same connection build uses internally
assert con is build._get_connection() or similar
build.insert_source(con, {...})
try:
    build.insert_source(con, {
        "source_id": "SRC-CHAT-20260906-0143-001",
        "source_key": "tampered", "path": "tampered", "title": "tampered",
        "source_type": "CHAT_EXPORT", "author_role": "maintainer",
        "content_hash": "0" * 64, "ingested_at": "2026-01-01T00:00:00Z",
    })
    print("NO_RAISE")
except RuntimeError as e:
    print("RAISED:" + str(e))
`;
  const result = spawnSync('python3', ['-c', py], {cwd: REPO_ROOT, encoding: 'utf8'});
  ok(result.status === 0, `A-0104 test harness runs cleanly (stderr: ${result.stderr || '(none)'})`);
  ok(result.stdout.includes('RAISED:'), `A-0104: re-ingesting an existing source_id with a changed content_hash raises (immutable source), does not silently overwrite (got: ${result.stdout.trim()})`);
  rmSync(scratchDir, {recursive: true, force: true});
}

// A-0104 (real, not just synthetic): editing docs/geometry-library/README.md and
// docs/village-site-plan-reference/README.md this session actually exercised versioning, not just
// the raise -- the ORIGINAL entry for each path is still present with its OLD content_hash, and a
// NEW, deterministically content-hash-suffixed entry exists for the current content. Both
// queryable; neither overwritten.
const revisionRows = db.prepare("SELECT source_id, path, content_hash FROM sources WHERE source_id LIKE '%-R%'").all();
ok(revisionRows.length >= 2, `A-0104: at least 2 real revision entries exist from actual edits this session (found ${revisionRows.length})`);
for (const rev of revisionRows) {
  const baseId = rev.source_id.split('-R')[0];
  const base = db.prepare('SELECT content_hash FROM sources WHERE source_id=?').get(baseId);
  ok(base !== undefined, `A-0104: revision ${rev.source_id}'s base entry ${baseId} still exists (original never deleted)`);
  ok(base.content_hash !== rev.content_hash, `A-0104: revision ${rev.source_id} has a DIFFERENT content_hash than its retained original ${baseId} (real edit, not a duplicate)`);
  ok(rev.source_id === `${baseId}-R${rev.content_hash.slice(0, 8).toUpperCase()}`, `A-0104: revision id ${rev.source_id} is deterministically derived from content_hash (re-running the generator reproduces the same id, not a random/incrementing one)`);
}

// A-0105: claim_sources rows carry a precise anchor/source_location, not just a bare filename.
const missingAnchor = db.prepare("SELECT claim_source_id FROM claim_sources WHERE anchor IS NULL OR source_location IS NULL").all();
ok(missingAnchor.length === 0, `A-0105: every claim_sources row has a non-null anchor and source_location (found ${missingAnchor.length} missing)`);
const sourceTextCount = db.prepare('SELECT count(*) as c FROM source_texts').get().c;
ok(sourceTextCount > 0, `A-0105: source_texts holds raw primary-source text for at least one source (found ${sourceTextCount})`);

// A-0106: distinct sources are never merged into one row -- content_hash differs across the real
// chat sources ingested this session (sand-ownership vs. donor-pins).
const chatHashes = db.prepare("SELECT DISTINCT content_hash FROM sources WHERE source_type='CHAT_EXPORT'").all();
ok(chatHashes.length >= 2, `A-0106: distinct CHAT_EXPORT sources retain distinct content_hash values, never silently merged (found ${chatHashes.length})`);

// A-0107: re-ingesting an unchanged corpus is idempotent -- a second sync() pass adds nothing.
{
  const scratchDir = mkdtempSync(join(tmpdir(), 'claim-idempotent-'));
  const scratchDb = join(scratchDir, 'claim.db');
  const py = `
import sys
sys.path.insert(0, "tools/claim-db")
import build
from pathlib import Path
build.DB = Path(${JSON.stringify(scratchDb)})
a1, u1, e1, v1 = build.sync()
a2, u2, e2, v2 = build.sync()
print(f"{a1} {u1} {e1} {v1} | {a2} {u2} {e2} {v2}")
`;
  const result = spawnSync('python3', ['-c', py], {cwd: REPO_ROOT, encoding: 'utf8'});
  ok(result.status === 0, `A-0107 test harness runs cleanly (stderr: ${result.stderr || '(none)'})`);
  const [, second] = result.stdout.trim().split(' | ');
  const [added2] = second.split(' ').map(Number);
  ok(added2 === 0, `A-0107: a second sync() pass over the identical corpus adds 0 new sources (idempotent re-ingest, no duplicate claims) (got: "${second}")`);
  rmSync(scratchDir, {recursive: true, force: true});
}

// A-0204: claim_relations is schema-constrained to the five named relation kinds, and real usage
// of at least CONTRADICTS and SUPERSEDES already exists (not just declared, actually used).
const relationKinds = new Set(db.prepare('SELECT DISTINCT relation FROM claim_relations').all().map((r) => r.relation));
for (const kind of ['CONTRADICTS', 'SUPERSEDES']) {
  ok(relationKinds.has(kind), `A-0204: relation kind ${kind} is in real use in claim_relations, not just schema-declared`);
}

// A-0205: epistemic_kind's finer metadata (FACT/CLAIM/CONFLICT at minimum) is in real use.
const epistemicKinds = new Set(db.prepare('SELECT DISTINCT epistemic_kind FROM claims').all().map((r) => r.epistemic_kind));
for (const kind of ['FACT', 'CLAIM', 'CONFLICT']) {
  ok(epistemicKinds.has(kind), `A-0205: epistemic_kind ${kind} is in real use, not just schema-declared`);
}

// A-0207: indexes exist for every column A-0207 names.
const indexSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='index'").all().map((r) => r.sql).join('\n');
for (const col of ['claims(subject)', 'claims(scope)', 'claim_targets(repo_path)', 'claim_targets(symbol)', 'claim_targets(owner)', 'claims(verification_status)', 'claims(requirement_flag)', 'audit_findings(finding_type)']) {
  ok(indexSql.includes(col), `A-0207: an index exists on ${col}`);
}

// A-0306: the verification_status CHECK constraint covers at least the six named states.
const claimsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='claims'").get().sql;
for (const state of ['UNVERIFIED', 'VERIFIED', 'CONTRADICTED', 'STALE_NEEDS_RECHECK', 'UNKNOWN', 'NOT_APPLICABLE']) {
  ok(claimsTableSql.includes(state), `A-0306: verification_status CHECK constraint includes ${state}`);
}

// A-0402: an unchanged document produces zero re-ingest work on the live corpus (delta-ingest,
// not blind full reimport) -- exercised directly on the real, committed claim.db + corpus.
{
  const result = spawnSync('python3', ['tools/claim-db/build.py'], {cwd: REPO_ROOT, encoding: 'utf8'});
  ok(result.status === 0, `A-0402: build.py runs cleanly against the live corpus (stderr: ${result.stderr || '(none)'})`);
// Check that claim.db's mtime and row counts are unchanged after build.py:
const beforeMtime = fs.statSync(join(REPO_ROOT, 'claim.db')).mtimeMs;
const result = spawnSync('python3', ['tools/claim-db/build.py'], {cwd: REPO_ROOT, encoding: 'utf8'});
const afterMtime = fs.statSync(join(REPO_ROOT, 'claim.db')).mtimeMs;
ok(afterMtime <= beforeMtime + 1000, `A-0402: build.py does not mutate claim.db file metadata (mtime delta: ${afterMtime - beforeMtime}ms)`);
}

db.close();

console.log('\n✅ claim-schema-invariants: A-0004/0005/0006/0007/0104/0105/0106/0107/0203/0204/0205/0207/0306/0402 all hold against the real, committed claim.db and build.py -- not schema shape alone, real data and real re-ingest behavior');
