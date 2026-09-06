PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS db_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  path TEXT,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  revision TEXT,
  commit_sha TEXT,
  export_time TEXT,
  author_role TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  UNIQUE(source_key, revision, content_hash)
);

CREATE TABLE IF NOT EXISTS source_texts (
  source_id TEXT PRIMARY KEY REFERENCES sources(source_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  normalized_claim TEXT NOT NULL,
  subject TEXT NOT NULL,
  scope TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  requirement_flag INTEGER NOT NULL DEFAULT 0 CHECK(requirement_flag IN (0,1)),
  assertion_flag INTEGER NOT NULL DEFAULT 0 CHECK(assertion_flag IN (0,1)),
  verification_status TEXT NOT NULL CHECK(
    verification_status IN (
      'UNVERIFIED','VERIFIED','CONTRADICTED',
      'STALE_NEEDS_RECHECK','UNKNOWN','NOT_APPLICABLE'
    )
  ),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),
  epistemic_kind TEXT NOT NULL DEFAULT 'CLAIM' CHECK(
    epistemic_kind IN ('FACT','CLAIM','HYPOTHESIS','INFERENCE','CONFLICT','UNKNOWN','STALE')
  )
);

CREATE TABLE IF NOT EXISTS claim_sources (
  claim_source_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  source_location TEXT,
  anchor TEXT,
  speaker TEXT,
  authority TEXT,
  original_text TEXT NOT NULL,
  UNIQUE(claim_id, source_id, source_location, original_text)
);

CREATE TABLE IF NOT EXISTS claim_relations (
  from_claim TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK(
    relation IN ('SUPPORTS','CONTRADICTS','SUPERSEDES','REFINES','DUPLICATES')
  ),
  to_claim TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  rationale TEXT,
  PRIMARY KEY(from_claim, relation, to_claim)
);

CREATE TABLE IF NOT EXISTS claim_targets (
  target_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  repo_path TEXT,
  symbol TEXT,
  subsystem TEXT,
  owner TEXT,
  test_id TEXT
);

CREATE TABLE IF NOT EXISTS verification_evidence (
  evidence_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  evidence_kind TEXT NOT NULL,
  repo_path TEXT,
  symbol TEXT,
  commit_sha TEXT,
  test_id TEXT,
  runtime_artifact TEXT,
  checked_at TEXT NOT NULL,
  checked_commit TEXT,
  result TEXT NOT NULL,
  details TEXT
);

CREATE TABLE IF NOT EXISTS audits (
  audit_id TEXT PRIMARY KEY,
  corpus_snapshot TEXT NOT NULL,
  repo_commit TEXT NOT NULL,
  created_at TEXT NOT NULL,
  previous_audit_id TEXT REFERENCES audits(audit_id)
);

CREATE TABLE IF NOT EXISTS audit_findings (
  finding_id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(audit_id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject);
CREATE INDEX IF NOT EXISTS idx_claims_scope ON claims(scope);
CREATE INDEX IF NOT EXISTS idx_claims_verification ON claims(verification_status);
CREATE INDEX IF NOT EXISTS idx_claims_requirement ON claims(requirement_flag);
CREATE INDEX IF NOT EXISTS idx_claims_assertion ON claims(assertion_flag);
CREATE INDEX IF NOT EXISTS idx_targets_repo_path ON claim_targets(repo_path);
CREATE INDEX IF NOT EXISTS idx_targets_symbol ON claim_targets(symbol);
CREATE INDEX IF NOT EXISTS idx_targets_owner ON claim_targets(owner);
CREATE INDEX IF NOT EXISTS idx_findings_type ON audit_findings(finding_type);
CREATE INDEX IF NOT EXISTS idx_findings_status ON audit_findings(status);
CREATE INDEX IF NOT EXISTS idx_evidence_commit ON verification_evidence(checked_commit);

CREATE VIEW IF NOT EXISTS GEFORDERT AS
SELECT c.*
FROM claims c
WHERE c.requirement_flag = 1;

CREATE VIEW IF NOT EXISTS BEHAUPTET AS
SELECT c.*
FROM claims c
WHERE c.assertion_flag = 1;

CREATE VIEW IF NOT EXISTS VERIFIZIERT AS
SELECT c.*
FROM claims c
WHERE c.verification_status = 'VERIFIED';

CREATE VIEW IF NOT EXISTS OFFENE_LUECKEN AS
SELECT
  f.finding_id,
  f.finding_type,
  f.severity,
  f.details,
  c.claim_id,
  c.normalized_claim,
  c.subject,
  c.scope,
  c.verification_status
FROM audit_findings f
JOIN claims c ON c.claim_id = f.claim_id
WHERE f.status = 'OPEN';

INSERT OR IGNORE INTO schema_migrations(version, name, applied_at)
VALUES (1, '001_init', '2026-09-06T03:37:00+02:00');
