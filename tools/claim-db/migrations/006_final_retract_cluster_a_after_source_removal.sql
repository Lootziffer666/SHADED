PRAGMA foreign_keys = ON;

-- Final one-time cleanup after all invalid Cluster A source/extraction corpus
-- files have been removed. Guarded so future transcript-backed claims using
-- these prefixes are untouched on subsequent syncs.
DELETE FROM claims
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = 6
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
  SELECT 1 FROM schema_migrations WHERE version = 6
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
VALUES (6, '006_final_retract_cluster_a_after_source_removal', '2026-09-06T05:36:00+02:00');
