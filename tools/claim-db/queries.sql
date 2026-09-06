-- SHADED claim.db canonical query pack.

-- GEFORDERT ∧ NOT VERIFIED
SELECT claim_id, normalized_claim, subject, scope, verification_status
FROM GEFORDERT
WHERE verification_status <> 'VERIFIED'
ORDER BY scope, claim_id;

-- BEHAUPTET ∧ UNVERIFIED
SELECT claim_id, normalized_claim, subject, scope
FROM BEHAUPTET
WHERE verification_status = 'UNVERIFIED'
ORDER BY scope, claim_id;

-- BEHAUPTET ∧ CONTRADICTED
SELECT claim_id, normalized_claim, subject, scope
FROM BEHAUPTET
WHERE verification_status = 'CONTRADICTED'
ORDER BY scope, claim_id;

-- Open gaps / conflicts / staleness.
SELECT *
FROM OFFENE_LUECKEN
ORDER BY severity DESC, finding_type, claim_id;

-- What is missing for a scope?
-- Bind :scope, e.g. 'live-world/surface'.
SELECT
  c.claim_id,
  c.normalized_claim,
  c.verification_status,
  f.finding_type,
  f.severity,
  f.details
FROM claims c
LEFT JOIN audit_findings f
  ON f.claim_id = c.claim_id AND f.status = 'OPEN'
WHERE c.scope = :scope
ORDER BY c.claim_id;

-- Which claims touch a repo path?
-- Bind :repo_path.
SELECT DISTINCT
  c.claim_id,
  c.normalized_claim,
  c.verification_status,
  t.repo_path,
  t.symbol,
  t.subsystem,
  t.owner
FROM claims c
JOIN claim_targets t ON t.claim_id = c.claim_id
WHERE t.repo_path = :repo_path
ORDER BY c.claim_id;

-- Evidence ledger for one claim.
-- Bind :claim_id.
SELECT
  e.evidence_id,
  e.evidence_kind,
  e.repo_path,
  e.symbol,
  e.checked_commit,
  e.result,
  e.details,
  e.checked_at
FROM verification_evidence e
WHERE e.claim_id = :claim_id
ORDER BY e.checked_at;
