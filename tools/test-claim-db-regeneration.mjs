// GOAL_ALFRED.md A-0002: claim.db must be fully regenerable from migrations/ + corpus/ alone.
// This was NOT actually true until this fix: tools/claim-db/build.py's sync() read a chat/
// extraction claim's "targets" and per-claim "evidence" arrays out of the JSON but never wrote
// them to claim_targets/verification_evidence, and never touched "audit"/"findings" at all --
// so those rows in the committed claim.db existed only because a prior session inserted them by
// hand with raw SQL, bypassing the declared regeneration path entirely. This test proves the gap
// is closed: building a claim.db from nothing but migrations/ + corpus/ into a scratch path
// produces the same row counts as the committed database, for every table corpus data feeds.
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const scratchDir = mkdtempSync(join(tmpdir(), 'claim-db-regen-'));
const scratchDb = join(scratchDir, 'claim.db');

const py = `
import sys
sys.path.insert(0, "tools/claim-db")
import build
from pathlib import Path
build.DB = Path(${JSON.stringify(scratchDb)})
a, u, e, v = build.sync()
print(f"{a} {u} {e} {v}")
`;
const result = spawnSync('python3', ['-c', py], {cwd: REPO_ROOT, encoding: 'utf8'});
ok(result.status === 0, `build.sync() runs cleanly against a scratch DB path (stderr: ${result.stderr || '(none)'})`);
ok(/^\d+ \d+ \d+ \d+/.test(result.stdout.trim()), `sync() reports numeric (added, unchanged, extractions, evidence) tuple (got: "${result.stdout.trim()}")`);

const TABLES = ['sources', 'claims', 'claim_targets', 'claim_sources', 'verification_evidence', 'audits', 'audit_findings'];

function countRows(dbPath, table) {
  const db = new DatabaseSync(dbPath, {readOnly: true});
  try {
    return db.prepare(`SELECT count(*) as c FROM ${table}`).get().c;
  } finally {
    db.close();
  }
}

const liveDb = join(REPO_ROOT, 'claim.db');
for (const table of TABLES) {
  const liveCount = countRows(liveDb, table);
  const freshCount = countRows(scratchDb, table);
  ok(liveCount > 0, `sanity: committed claim.db has rows in ${table} to compare against (found ${liveCount})`);
  ok(
    liveCount === freshCount,
    `${table}: fresh rebuild from migrations+corpus alone matches committed claim.db (live=${liveCount}, fresh=${freshCount})`,
  );
}

rmSync(scratchDir, {recursive: true, force: true});

console.log('\n✅ claim.db is fully regenerable from migrations/ + corpus/ alone -- claim_targets, per-claim evidence and audits/audit_findings all reproduce, not just claims/sources');
