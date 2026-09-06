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

console.log('\n✅ claim.db: schema, epistemic views, markdown inventory provenance and sand-ownership evidence all hold up under direct query');
