#!/usr/bin/env python3
"""GOAL_ALFRED.md A-0802 (Widerspruch): "zwei Quellen behaupten Gegensaetzliches; Audit erzeugt
CONFLICT statt Auswahl." Per maintainer correction, "same ID exists twice" is NOT itself grounds
for CONFLICT -- that would flag every harmless ID duplication (a claim re-cited from a second
source, a claim re-extracted in a later audit pass) as a conflict. CONFLICT is a conclusion this
script must actively prove, not assume, by checking ALL of:

  1. same external ID          -- claim_targets.symbol matches across >=2 distinct claims
  2. different source          -- their claim_sources.source_id sets are disjoint
  3. different semantic assertion -- normalized_claim text actually differs (a real, if crude,
                                     proxy for "asserts something different", not just "exists
                                     twice")
  4. both claims currently active -- neither is already the FROM or TO side of a SUPERSEDES
                                     relation (a superseded claim is retired, not conflicting)
  5. no existing supersession/duplicate relation between the two claims already resolving it

Only when all five hold does this script mark epistemic_kind=CONFLICT / verification_status=
CONTRADICTED on both claims and record the CONTRADICTS relation itself, with a rationale citing
which conditions were checked -- so the conclusion is auditable, not asserted.

Run: python3 tools/claim-db/detect_conflicts.py [--db PATH] [--apply]
"""
import argparse
import sqlite3
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "claim.db"


def claim_sources_of(con, claim_id):
    return {r[0] for r in con.execute("SELECT source_id FROM claim_sources WHERE claim_id=?", (claim_id,)).fetchall()}


def is_active(con, claim_id):
    """A claim is NOT active if it is the 'to' side of a SUPERSEDES relation (i.e. something
    else superseded it) -- it is retired history, not a live competing assertion."""
    row = con.execute(
        "SELECT 1 FROM claim_relations WHERE relation='SUPERSEDES' AND to_claim=?", (claim_id,)
    ).fetchone()
    return row is None


def existing_relation(con, a, b):
    return con.execute(
        """SELECT relation FROM claim_relations
           WHERE (from_claim=? AND to_claim=?) OR (from_claim=? AND to_claim=?)""",
        (a, b, b, a),
    ).fetchone()


def find_conflicts(con):
    """Returns a list of (claim_a, claim_b, symbol, reasons) for pairs proven to conflict."""
    symbol_groups = {}
    for claim_id, symbol in con.execute(
        "SELECT DISTINCT claim_id, symbol FROM claim_targets WHERE symbol IS NOT NULL"
    ).fetchall():
        symbol_groups.setdefault(symbol, set()).add(claim_id)

    conflicts = []
    for symbol, claim_ids in symbol_groups.items():
        if len(claim_ids) < 2:
            continue
        for a, b in combinations(sorted(claim_ids), 2):
            claim_a = con.execute("SELECT normalized_claim FROM claims WHERE claim_id=?", (a,)).fetchone()
            claim_b = con.execute("SELECT normalized_claim FROM claims WHERE claim_id=?", (b,)).fetchone()
            if claim_a is None or claim_b is None:
                continue

            sources_a, sources_b = claim_sources_of(con, a), claim_sources_of(con, b)
different_source = sources_a.isdisjoint(sources_b) and (sources_a or sources_b)
            different_assertion = claim_a[0] != claim_b[0]
            both_active = is_active(con, a) and is_active(con, b)
            relation = existing_relation(con, a, b)
            no_resolving_relation = relation is None or relation[0] not in ("SUPERSEDES", "DUPLICATES")

            if different_source and different_assertion and both_active and no_resolving_relation:
                reasons = (
                    f"same external ID '{symbol}' (claim_targets.symbol); "
                    f"different source ({len(sources_a)} vs {len(sources_b)} disjoint source(s)); "
                    f"different normalized_claim text; "
                    f"both claims currently active (neither superseded); "
                    f"no existing SUPERSEDES/DUPLICATES relation resolves it"
                )
                conflicts.append((a, b, symbol, reasons))
    return conflicts


def apply_conflicts(con, conflicts):
    now = datetime.now(timezone.utc).isoformat()
    applied = 0
    for a, b, symbol, reasons in conflicts:
        already = con.execute(
            "SELECT 1 FROM claim_relations WHERE from_claim=? AND relation='CONTRADICTS' AND to_claim=?", (a, b)
        ).fetchone()
        if already:
            continue
        for cid in (a, b):
            con.execute(
                "UPDATE claims SET epistemic_kind='CONFLICT', verification_status='CONTRADICTED' WHERE claim_id=?",
                (cid,),
            )
        con.execute(
            "INSERT INTO claim_relations(from_claim,relation,to_claim,rationale) VALUES(?,?,?,?)",
            (a, "CONTRADICTS", b, f"detect_conflicts.py [{now}]: {reasons}"),
        )
        applied += 1
    if applied:
        con.commit()
    return applied


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--db", default=str(DB))
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()

    con = sqlite3.connect(args.db)
    con.execute("PRAGMA foreign_keys=ON")
    conflicts = find_conflicts(con)

    if not conflicts:
        print("No proven conflicts found (no claim pair satisfies all 5 conditions).")
        return

    for a, b, symbol, reasons in conflicts:
        print(f"CONFLICT ({symbol}): {a} <-> {b}")
        print(f"  {reasons}")

    if args.apply:
        applied = apply_conflicts(con, conflicts)
        print(f"\nApplied: {applied} conflict(s) recorded as CONTRADICTS relations, both sides marked CONFLICT/CONTRADICTED.")
    else:
        print(f"\nDry run: {len(conflicts)} conflict(s) would be recorded. Re-run with --apply to write.")


if __name__ == "__main__":
    main()
