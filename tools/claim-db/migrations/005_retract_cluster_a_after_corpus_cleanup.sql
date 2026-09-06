PRAGMA foreign_keys = ON;

-- Final one-time Cluster A retraction after the summary-seeded corpus files
-- have been removed. This must run only once so future transcript-backed
-- claims may reuse the same topic prefixes safely.
DELETE FROM claims
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = 5
)
AND (
  claim_id LIKE 'C-RECON-%'
  OR claim_id LIKE 'C-GEO-%'
  OR claim_id LIKE 'C-BROWSER-%'
  OR claim_id LIKE 'C-DEV-%'
  OR claim_id LIKE 'C-DONOR-%'
);

DELETE FROM sources
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = 5
)
AND source_id IN (
  'SRC-CHAT-DRAFTSTELLEN-EXP14',
  'SRC-CHAT-8020-ARCH',
  'SRC-CHAT-3D-NOPROVIDER',
  'SRC-CHAT-FABLE-WORLD',
  'SRC-CHAT-CLOUD-PROVIDER',
  'SRC-CHAT-AMBIGUITY-GATE',
  'SRC-CHAT-WASSERNIVELLIERUNG',
  'SRC-CHAT-DRAFTSTELLEN-STYLE'
);

INSERT OR IGNORE INTO schema_migrations(version, name, applied_at)
VALUES (5, '005_retract_cluster_a_after_corpus_cleanup', '2026-09-06T05:32:00+02:00');
