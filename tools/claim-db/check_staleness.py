#!/usr/bin/env python3
"""GOAL_ALFRED.md A-0805 (Staleness): "Aenderung an betroffener Primaerevidenz markiert fruehere
Verification zur erneuten Pruefung." -- an audit-time pass, separate from build.py's corpus sync,
because staleness is relative to the CURRENT git HEAD (a moving target), not a fixed corpus
snapshot. For every VERIFIED claim, every verification_evidence row's checked_commit is compared
against HEAD for the repo_path(s) the claim's targets/evidence name; if that path changed since
checked_commit, the claim is demoted to STALE_NEEDS_RECHECK and an audit_findings row records why
-- never silently left VERIFIED on outdated evidence.

Run: python3 tools/claim-db/check_staleness.py [--db PATH] [--apply]
Without --apply, only reports what WOULD change (dry run). With --apply, writes the demotion and
an audit/audit_findings row.
"""
import argparse
import subprocess
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "claim.db"


def changed_since(commit, repo_path):
    """True if repo_path has any commit after `commit` up to HEAD."""
    result = subprocess.run(
        ["git", "log", "--oneline", f"{commit}..HEAD", "--", repo_path],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode != 0:
        # Unknown commit (e.g. a placeholder/test SHA) -- can't prove freshness, so treat as stale
        # rather than silently trusting evidence that can't be checked against real git history.
        return True
    return bool(result.stdout.strip())


def find_stale_claims(con):
    """A claim's freshness baseline is the MOST RECENT verification_evidence check across all its
    evidence rows (by checked_at) -- an old evidence row superseded by a fresher recheck (A-0805's
    own recheck cycle) must not keep flagging the claim forever just because history still
    contains the earlier, now-superseded check. Every claim_target path is then checked for
    changes since that one freshness-baseline commit."""
    stale = {}  # claim_id -> list of (evidence_id, repo_path, checked_commit)
    claim_ids = [r[0] for r in con.execute("SELECT claim_id FROM claims WHERE verification_status='VERIFIED'").fetchall()]
    for claim_id in claim_ids:
        latest = con.execute(
            """SELECT evidence_id, checked_commit FROM verification_evidence
               WHERE claim_id=? AND checked_commit IS NOT NULL
               ORDER BY checked_at DESC LIMIT 1""",
            (claim_id,),
        ).fetchone()
        if latest is None:
            continue  # VERIFIED with no commit-bearing evidence at all -- nothing to check freshness against
        evidence_id, checked_commit = latest

        target_paths = {
            r[0] for r in con.execute(
                "SELECT repo_path FROM claim_targets WHERE claim_id=? AND repo_path IS NOT NULL",
                (claim_id,),
            ).fetchall()
        }
        for path in target_paths:
            if changed_since(checked_commit, path):
                stale.setdefault(claim_id, []).append((evidence_id, path, checked_commit))
    return stale


def apply_staleness(con, stale):
    audit_id = f"AUD-STALE-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    now = datetime.now(timezone.utc).isoformat()
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip()
    con.execute(
        "INSERT INTO audits(audit_id,corpus_snapshot,repo_commit,created_at,previous_audit_id) VALUES(?,?,?,?,?)",
        (audit_id, "staleness-check", head, now, None),
    )
    for i, (claim_id, entries) in enumerate(stale.items(), start=1):
        con.execute("UPDATE claims SET verification_status='STALE_NEEDS_RECHECK' WHERE claim_id=?", (claim_id,))
        detail = "; ".join(f"{eid}: {path} changed since {commit}" for eid, path, commit in entries)
        finding_id = f"F-STALE-{audit_id}-{i:03d}"
        con.execute(
            """INSERT INTO audit_findings(finding_id,audit_id,claim_id,finding_type,severity,details,status,created_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (finding_id, audit_id, claim_id, "STALE_EVIDENCE", "MEDIUM", detail, "OPEN", now),
        )
    con.commit()
    return audit_id


def resolve_stale_findings_for_fresh_claims(con, stale_claim_ids):
    """A claim that was previously flagged STALE_EVIDENCE but has since been rechecked (its
    verification_status moved back to VERIFIED via fresh evidence, e.g. an A-0805 recheck cycle)
    should not leave its old finding sitting OPEN forever -- that would make OFFENE_LUECKEN lie
    about an already-resolved gap."""
    resolved = 0
    open_stale = con.execute(
        "SELECT DISTINCT claim_id FROM audit_findings WHERE finding_type='STALE_EVIDENCE' AND status='OPEN'"
    ).fetchall()
    for (claim_id,) in open_stale:
        if claim_id in stale_claim_ids:
            continue  # still genuinely stale -- leave the finding open
        status = con.execute("SELECT verification_status FROM claims WHERE claim_id=?", (claim_id,)).fetchone()
        if status and status[0] == "VERIFIED":
            con.execute(
                "UPDATE audit_findings SET status='RESOLVED' WHERE finding_type='STALE_EVIDENCE' AND status='OPEN' AND claim_id=?",
                (claim_id,),
            )
            resolved += 1
    if resolved:
        con.commit()
    return resolved


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--db", default=str(DB))
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()

    con = sqlite3.connect(args.db)
    stale = find_stale_claims(con)

    if args.apply:
        resolved = resolve_stale_findings_for_fresh_claims(con, set(stale.keys()))
        if resolved:
            print(f"Resolved {resolved} previously-open STALE_EVIDENCE finding(s) for claim(s) rechecked back to VERIFIED.")

    if not stale:
        print("No VERIFIED claims are stale relative to HEAD.")
        return

    for claim_id, entries in stale.items():
        print(f"STALE: {claim_id}")
        for eid, path, commit in entries:
            print(f"  {eid}: {path} changed since {commit}")

    if args.apply:
        audit_id = apply_staleness(con, stale)
        print(f"\nApplied: {len(stale)} claim(s) demoted to STALE_NEEDS_RECHECK under {audit_id}.")
    else:
        print(f"\nDry run: {len(stale)} claim(s) would be demoted. Re-run with --apply to write.")


if __name__ == "__main__":
    main()
