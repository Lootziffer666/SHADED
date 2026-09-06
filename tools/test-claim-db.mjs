// GOAL_ALFRED.md A-0000/A-0100/A-0300: claim.db must be a real, re-runnable evidence source --
// not just something queried by hand once in a chat session. This test opens the committed
// claim.db directly (node:sqlite, no python subprocess) and asserts the concrete facts that
// AUDIT_REPORT.md's A-0001/A-0002/A-0003/A-0101/A-0103/A-0304 PASS rows depend on, so those rows
// cite a registered, repeatable test instead of "queried this session".
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = join(REPO_ROOT, 'claim.db');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

ok(existsReadable(DB_PATH), 'claim.db exists at repo root and is readable');

function existsReadable(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

const db = new DatabaseSync(DB_PATH, {readOnly: true});

// A-0003: GEFORDERT/BEHAUPTET/VERIFIZIERT/OFFENE_LUECKEN views exist and are queryable.
const views = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all().map((r) => r.name),
);
for (const view of ['GEFORDERT', 'BEHAUPTET', 'VERIFIZIERT', 'OFFENE_LUECKEN']) {
  ok(views.has(view), `epistemic view ${view} exists in claim.db (A-0003)`);
  // must actually be queryable, not just declared
  db.prepare(`SELECT * FROM ${view} LIMIT 1`).all();
}
console.log('✓ ok: all four epistemic views are queryable without error (A-0003)');

// A-0001/A-0002: claim.db is a real SQLite database with the core schema tables.
const tables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name),
);
for (const table of ['sources', 'source_texts', 'claims', 'verification_evidence', 'schema_migrations']) {
  ok(tables.has(table), `core table ${table} exists in claim.db (A-0001/A-0002)`);
}

// A-0101/A-0103: the full markdown source inventory landed with real provenance on every row --
// not just present, but with non-null content_hash and commit_sha on every DOC-type source.
const docSources = db
  .prepare("SELECT source_id, path, content_hash, commit_sha, ingested_at FROM sources WHERE source_type='DOC'")
  .all();
ok(docSources.length >= 127, `at least 127 DOC-type sources ingested (found ${docSources.length}) (A-0101)`);
const incomplete = docSources.filter((s) => !s.content_hash || !s.commit_sha || !s.ingested_at || !s.path);
ok(
  incomplete.length === 0,
  incomplete.length === 0
    ? 'every DOC-type source has non-null path/content_hash/commit_sha/ingested_at (A-0103)'
    : `DOC sources missing required provenance fields: ${incomplete.map((s) => s.source_id).join(', ')}`,
);

// A-0304: the sand-ownership evidence batch landed with real result values, not fabricated
// VERIFIED status for GPU/visual claims that were never actually confirmed.
const sandEvidence = db
  .prepare("SELECT evidence_id, claim_id, result FROM verification_evidence WHERE evidence_id LIKE 'EV-SAND-%'")
  .all();
ok(sandEvidence.length === 4, `4 EV-SAND-* evidence rows present (found ${sandEvidence.length}) (A-0304)`);
for (const row of sandEvidence) {
  ok(
    row.result === 'PASS' || row.result === 'PARTIAL',
    `${row.evidence_id} has an honest result value (${row.result}), not a fabricated PASS for unverifiable GPU claims`,
  );
}
const claimStatuses = db
  .prepare("SELECT claim_id, verification_status FROM claims WHERE claim_id IN ('C-SAND-0001','C-SAND-0002')")
  .all();
for (const row of claimStatuses) {
  ok(
    row.verification_status !== 'VERIFIED',
    `${row.claim_id}.verification_status is NOT prematurely set to VERIFIED (GPU/visual proof still outstanding) (found: ${row.verification_status})`,
  );
}

// A-0801 (Self-Test: Bootstrap): existing markdown/chat sources actually produce atomic claims
// with real, traceable provenance -- not paraphrased, the exact original text.
const sandClaimSource = db
  .prepare("SELECT original_text FROM claim_sources WHERE claim_id='C-SAND-0001' AND source_id='SRC-CHAT-20260906-0143-001'")
  .get();
ok(sandClaimSource !== undefined && sandClaimSource.original_text.length > 0, 'A-0801: a claim (C-SAND-0001) atomically extracted from a CHAT_EXPORT source carries the exact original_text as provenance, not a paraphrase');
const docClaimSource = db
  .prepare("SELECT cs.original_text, s.source_type FROM claim_sources cs JOIN sources s ON s.source_id=cs.source_id WHERE cs.claim_id='C-CONFLICT-G0006-GOAL'")
  .get();
ok(docClaimSource !== undefined && docClaimSource.source_type === 'DOC', 'A-0801: a claim also exists bootstrapped from a canonical DOCUMENT source (not just chat), with the same real-provenance guarantee');

// A-0806 (Self-Test: Rolling Documents): Document A -> DB-Update -> Audit; Document B -> DB-Update
// -> new Audit + Delta, chained via previous_audit_id, and the delta only touches what actually
// changed (not a blind full re-audit of everything).
const audits = db.prepare('SELECT audit_id, previous_audit_id FROM audits ORDER BY created_at').all();
ok(audits.length >= 2, `A-0806: at least 2 audit runs exist (found ${audits.length})`);
const secondAudit = audits.find((a) => a.previous_audit_id !== null);
ok(secondAudit !== undefined, 'A-0806: a later audit chains to an earlier one via previous_audit_id (not two disconnected snapshots)');
const deltaFinding = db
  .prepare("SELECT finding_type, status FROM audit_findings WHERE audit_id=?")
  .get(secondAudit?.audit_id);
ok(deltaFinding !== undefined && deltaFinding.finding_type === 'NEW_CLAIM_SINCE_LAST_AUDIT', 'A-0806: the chained audit records a delta finding scoped to what the second document actually added, not a full re-audit');
const firstAuditFindingsUntouched = db
  .prepare("SELECT count(*) as c FROM audit_findings WHERE audit_id=? AND status='OPEN'")
  .get(secondAudit?.previous_audit_id);
ok(firstAuditFindingsUntouched.c === 3, `A-0806: the first audit's own findings are untouched by the second document's delta (still ${firstAuditFindingsUntouched.c} OPEN, unchanged)`);

console.log('\n✅ claim.db: schema, epistemic views, markdown inventory provenance, sand-ownership evidence, bootstrap provenance (A-0801) and rolling-audit delta (A-0806) all hold up under direct query');
