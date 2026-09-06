PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_tags (
  source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(source_id, tag)
);

CREATE TABLE IF NOT EXISTS claim_tags (
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(claim_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_source_tags_tag ON source_tags(tag);
CREATE INDEX IF NOT EXISTS idx_claim_tags_tag ON claim_tags(tag);

INSERT OR IGNORE INTO schema_migrations(version, name, applied_at)
VALUES (2, '002_tags', '2026-09-06T04:00:00+02:00');
