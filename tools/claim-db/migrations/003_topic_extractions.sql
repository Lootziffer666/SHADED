PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS claim_extractions (
  extraction_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  extracted_at TEXT NOT NULL,
  status TEXT NOT NULL,
  retrieval_anchor TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS extraction_claims (
  extraction_id TEXT NOT NULL REFERENCES claim_extractions(extraction_id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  PRIMARY KEY(extraction_id, claim_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_extractions_source ON claim_extractions(source_id);
CREATE INDEX IF NOT EXISTS idx_claim_extractions_topic ON claim_extractions(topic);
CREATE INDEX IF NOT EXISTS idx_claim_extractions_status ON claim_extractions(status);

INSERT OR IGNORE INTO schema_migrations(version, name, applied_at)
VALUES (3, '003_topic_extractions', '2026-09-06T05:04:00+02:00');
