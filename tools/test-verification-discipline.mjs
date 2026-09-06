// GOAL_ALFRED.md A-0807 (Regression): "'neuer Joystick installiert' darf nicht VERIFIED sein,
// solange der alte aktive Owner weiterhin gemountet wird." Generalized as a standing invariant
// over claim.db rather than a one-off story: any claim about ownership/replacement/installation
// that is marked VERIFIED must have at least one verification_evidence row proving the OLD owner's
// absence (evidence_kind containing ABSENCE or NEGATIVE) -- positive existence evidence alone is
// not enough to promote such a claim.
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = join(REPO_ROOT, 'claim.db');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const db = new DatabaseSync(DB_PATH, {readOnly: true});

// The concrete regression instance A-0807 names: proves the invariant has real teeth, not just an
// empty pass because no ownership claim exists yet.
const inputClaim = db.prepare("SELECT verification_status FROM claims WHERE claim_id='C-INPUT-0001'").get();
ok(inputClaim !== undefined, 'C-INPUT-0001 (the input-ownership regression claim) exists in claim.db');
ok(inputClaim.verification_status === 'VERIFIED', 'C-INPUT-0001 is legitimately VERIFIED (has both positive and negative-absence evidence)');

const OWNERSHIP_PATTERN = '%owner%';
const REPLACEMENT_PATTERNS = ['%replac%', '%install%', '%owner%'];

// Every VERIFIED claim whose subject/normalized_claim reads as an ownership/replacement claim
// must have at least one NEGATIVE/ABSENCE evidence row -- this is the mechanical form of A-0807.
const candidateClaims = db
  .prepare(
    `SELECT claim_id, subject, normalized_claim, verification_status FROM claims
     WHERE verification_status='VERIFIED'
       AND (subject LIKE ? OR subject LIKE ? OR subject LIKE ?
            OR normalized_claim LIKE ? OR normalized_claim LIKE ? OR normalized_claim LIKE ?)`,
  )
  .all(...REPLACEMENT_PATTERNS, ...REPLACEMENT_PATTERNS.map((p) => p));

ok(candidateClaims.length > 0, `at least one VERIFIED ownership/replacement/install claim exists to check (found ${candidateClaims.length})`);

const negEvidenceStmt = db.prepare(
  "SELECT count(*) as c FROM verification_evidence WHERE claim_id=? AND (evidence_kind LIKE '%ABSENCE%' OR evidence_kind LIKE '%NEGATIVE%')",
);
for (const claim of candidateClaims) {
  const {c} = negEvidenceStmt.get(claim.claim_id);
  ok(
    c > 0,
    `VERIFIED ownership claim ${claim.claim_id} ("${claim.subject}") has a negative/absence evidence row proving the old owner is gone (A-0807) (found ${c})`,
  );
}

// Cross-check the invariant actually discriminates: the sand-ownership claims mention "ownership"
// too, but are correctly left UNVERIFIED precisely because they have no NEGATIVE_ABSENCE evidence
// (only PARTIAL code/test evidence -- see tools/claim-db/corpus/evidence/0001-sand-ownership-fix.json).
// If this ever flipped to VERIFIED without absence evidence, that would be exactly the regression
// A-0807 exists to catch.
const sandClaim = db.prepare("SELECT verification_status FROM claims WHERE claim_id='C-SAND-0002'").get();
ok(sandClaim !== undefined, 'sanity: C-SAND-0002 ("sand material ownership") exists for the negative cross-check');
const sandNegEvidence = negEvidenceStmt.get('C-SAND-0002').c;
ok(sandNegEvidence === 0, 'sanity: C-SAND-0002 has no negative/absence evidence yet (found 0)');
ok(
  sandClaim.verification_status !== 'VERIFIED',
  `C-SAND-0002 correctly stays ${sandClaim.verification_status}, not VERIFIED, given it has no negative/absence evidence -- the invariant is not vacuously true`,
);

// A-0804: "reine Dokumentbehauptung bleibt UNVERIFIED; Code/Test/Runtime-Evidence promotet zu
// VERIFIED." Mechanical invariant: no claim with zero verification_evidence rows may be VERIFIED
// (a bare claim_sources citation -- a document/chat assertion -- is never enough by itself), and
// at least one real claim demonstrates the positive path (evidence present -> promoted).
const allClaims = db.prepare('SELECT claim_id, verification_status FROM claims').all();
ok(allClaims.length > 0, `sanity: claim.db has claims to check for A-0804 (found ${allClaims.length})`);
const evidenceCountStmt = db.prepare('SELECT count(*) as c FROM verification_evidence WHERE claim_id=?');
let noEvidenceCount = 0;
let verifiedWithEvidenceCount = 0;
for (const claim of allClaims) {
  const {c} = evidenceCountStmt.get(claim.claim_id);
  if (c === 0) {
    noEvidenceCount += 1;
    ok(
      claim.verification_status !== 'VERIFIED',
      `${claim.claim_id}: has zero verification_evidence rows (document/chat assertion only) and correctly is NOT VERIFIED (found: ${claim.verification_status}) (A-0804)`,
    );
  } else if (claim.verification_status === 'VERIFIED') {
    verifiedWithEvidenceCount += 1;
  }
}
ok(noEvidenceCount > 0, `sanity: at least one doc/chat-only claim with zero evidence exists to check (found ${noEvidenceCount})`);
ok(verifiedWithEvidenceCount > 0, `A-0804 positive path: at least one claim was actually promoted to VERIFIED by real evidence (found ${verifiedWithEvidenceCount})`);

console.log('\n✅ verification-discipline (A-0804/A-0807): document-only claims stay UNVERIFIED, evidence-backed claims promote to VERIFIED, the concrete input-ownership regression claim is legitimately VERIFIED via positive+negative evidence, the general A-0807 invariant holds over every VERIFIED ownership claim in claim.db, and the sand-ownership counter-example confirms the check is not vacuous');
