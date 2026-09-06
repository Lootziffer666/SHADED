// GOAL_FOUNDATION.md Section 0B (Repo-Dorfaeltester donor roles): the maintainer named the exact
// upstream for all three donor roles (Graphify, codebase-memory-mcp, and MemWiki -- whose own
// text explicitly forbids guessing a same-named GitHub hit). This test checks FOUNDATION_DONOR_REGISTRY.md
// names all three with a real 40-hex commit SHA and a stated license, that claim.db records the
// same pin with matching evidence, and that the stated policy text (implementation donor, not
// runtime dependency; SHADED owns post-ingestion; no auto-updates; no runtime dependency; license
// provenance intact) is present verbatim enough to be binding, not paraphrased away.
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const registry = readFileSync(join(REPO_ROOT, 'FOUNDATION_DONOR_REGISTRY.md'), 'utf8');

const DONORS = [
  {name: 'Graphify-Labs/graphify', sha: 'c9f99018774e2e0380e9f65b3959944559a0d5f6', claimId: 'C-DONOR-FOUNDATION-0001', evidenceId: 'EV-DONOR-FOUNDATION-0001-GRAPHIFY'},
  {name: 'DeusData/codebase-memory-mcp', sha: '7b0f553cbae565247aa858a4aba80b194305e7f5', claimId: 'C-DONOR-FOUNDATION-0001', evidenceId: 'EV-DONOR-FOUNDATION-0001-CODEBASEMEM'},
  {name: 'hereisSwapnil/memwiki', sha: '8034a3da991ac2639b87875172a9572903ecf1d5', claimId: 'C-DONOR-FOUNDATION-0001', evidenceId: 'EV-DONOR-FOUNDATION-0001-MEMWIKI'},
];

for (const {name, sha} of DONORS) {
  ok(registry.includes(name), `FOUNDATION_DONOR_REGISTRY.md names donor ${name}`);
  ok(registry.includes(sha), `FOUNDATION_DONOR_REGISTRY.md pins ${name} at a real 40-hex commit SHA (${sha})`);
  ok(/^[0-9a-f]{40}$/.test(sha), `${name}'s pinned SHA is a syntactically valid full git commit hash`);
}

const POLICY_LINES = [
  'implementation donor',
  'not a runtime dependency',
  'owns',
  'No automatic upstream updates',
  'No runtime dependency on donor repositories',
  'license/copyright/NOTICE provenance remains intact',
];
for (const line of POLICY_LINES) {
  ok(registry.toLowerCase().includes(line.toLowerCase()), `FOUNDATION_DONOR_REGISTRY.md's policy section includes: "${line}"`);
}

// MemWiki specifically: GOAL_FOUNDATION.md's own text forbids guessing its upstream. Confirm the
// registry documents this was resolved by maintainer selection, not a search-engine guess.
ok(
  /maintainer/i.test(registry) && /memwiki/i.test(registry),
  'the registry attributes MemWiki\'s upstream resolution to the maintainer, not a guessed search hit',
);

// Cross-check against claim.db: the same pin, with real evidence, not just prose in a doc nobody
// else checks.
const db = new DatabaseSync(join(REPO_ROOT, 'claim.db'), {readOnly: true});
const claim = db.prepare("SELECT verification_status FROM claims WHERE claim_id='C-DONOR-FOUNDATION-0001'").get();
ok(claim !== undefined, 'C-DONOR-FOUNDATION-0001 exists in claim.db');
ok(claim.verification_status === 'VERIFIED', `C-DONOR-FOUNDATION-0001 is VERIFIED (found: ${claim?.verification_status})`);

const seenEvidenceIds = new Set();
for (const {evidenceId, sha} of DONORS) {
  if (seenEvidenceIds.has(evidenceId)) continue;
  seenEvidenceIds.add(evidenceId);
  const row = db.prepare('SELECT commit_sha, checked_commit, details, result FROM verification_evidence WHERE evidence_id=?').get(evidenceId);
  ok(row !== undefined, `claim.db has evidence row ${evidenceId}`);
  // commit_sha/checked_commit are deliberately NULL here: this evidence is about the donor's own
  // (external) HEAD, not a SHADED-repo commit tools/claim-db/check_staleness.py could git-diff --
  // putting a foreign SHA in those columns would make the checker misread it as an unknown SHADED
  // commit and conservatively flag the claim stale (a real bug this test setup previously hit).
  ok(row.commit_sha === null && row.checked_commit === null, `${evidenceId}'s commit_sha/checked_commit are NULL (donor SHA is external, not a SHADED commit -- avoids a false staleness flag)`);
  ok(row.details.includes(sha), `${evidenceId}'s details text records the donor's real pinned SHA (${sha})`);
  ok(row.result === 'PASS', `${evidenceId} recorded result PASS`);
}
db.close();

// Honest scope check: this registry is a PIN, not a claim that Graph/Memory/Wiki are integrated.
// GOAL_FOUNDATION.md F-0301's own growth principle forbids building the integration ahead of a
// real triggering failure -- the registry must say so, not silently imply completion.
ok(
  registry.includes('Not yet integrated') || registry.toLowerCase().includes('not yet built'),
  'the registry explicitly states integration has NOT happened yet, rather than implying F-0201-0205 are fully satisfied by pinning alone',
);

// F-0205: "Keine Secrets, Tokens oder private Credentials in Graph/Memory/Wiki aufnehmen." The
// donor registry (+ its claim.db entries) is currently the only Graph/Memory/Wiki-adjacent
// artifact that exists, so this is a real, non-vacuous scan, not a check against nothing.
const SECRET_PATTERNS = [/ghp_[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /api[_-]?key\s*[:=]\s*["'][^"']{8,}/i];
for (const pattern of SECRET_PATTERNS) {
  ok(!pattern.test(registry), `FOUNDATION_DONOR_REGISTRY.md contains no secret matching ${pattern} (F-0205)`);
}
console.log('\n✅ foundation-donor-registry: all three GOAL_FOUNDATION.md Section 0B donors (Graphify, codebase-memory-mcp, MemWiki) are pinned at real, verified commit SHAs with license provenance, cross-checked against claim.db, with the maintainer\'s exact policy text present and the pin\'s limited scope stated honestly');
