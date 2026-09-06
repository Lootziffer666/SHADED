#!/usr/bin/env python3
"""GOAL_ALFRED.md A-0511/A-0512/A-0808: a real query interface over claim.db that can answer
"what is missing" questions and point at concrete files/symbols -- not just store claims.

Every answer for a claim includes: Claim-ID, Forderungsquelle (source it came from), current
STATUS, missing evidence (or "keine Evidence hinterlegt" if genuinely none), and affected
files/symbols (from claim_targets) -- exactly the fields A-0512 requires.

Modes (A-0511's own example questions):
  --about TERM        "Was fehlt fuer <TERM>?"            -- claims whose subject/scope/text match TERM
  --file PATH         "Welche Claims betreffen <PATH>?"    -- claims with a claim_target under PATH
  --unverified TERM    "Welche Requirements zu <TERM> sind nicht verifiziert?"
  --old-owners         "Welche alten Owner sind noch behauptet/aktiv?" -- claim_targets whose owner
                       is not SHADED and whose claim is not VERIFIED (i.e. still the asserted owner)

Run: python3 tools/claim-db/gap_query.py --about sand
"""
import argparse
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "claim.db"


def connect():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def render_claim(con, claim_id):
    claim = con.execute("SELECT * FROM claims WHERE claim_id=?", (claim_id,)).fetchone()
    if claim is None:
        return f"{claim_id}: <no such claim>"

    sources = con.execute(
        """SELECT s.path, s.title, s.source_id, cs.source_location
           FROM claim_sources cs JOIN sources s ON s.source_id = cs.source_id
           WHERE cs.claim_id=?""",
        (claim_id,),
    ).fetchall()
    source_strs = [
        f"{(r['path'] or r['source_id'])}" + (f" ({r['source_location']})" if r["source_location"] else "")
        for r in sources
    ] or ["<keine Forderungsquelle verknuepft>"]

    targets = con.execute(
        "SELECT repo_path, symbol, owner FROM claim_targets WHERE claim_id=?", (claim_id,)
    ).fetchall()
    target_strs = [
        f"{(t['repo_path'] or '?')} :: {(t['symbol'] or '?')} (owner: {t['owner'] or '?'})" for t in targets
    ] or ["<keine Datei/Symbol-Ziele hinterlegt>"]

    evidence = con.execute(
        "SELECT evidence_id, result FROM verification_evidence WHERE claim_id=?", (claim_id,)
    ).fetchall()
    evidence_strs = [f"{e['evidence_id']}={e['result']}" for e in evidence] or ["keine Evidence hinterlegt"]

    lines = [
        f"{claim_id} [{claim['verification_status']}] -- {claim['normalized_claim']}",
        f"  subject/scope: {claim['subject']} / {claim['scope']}",
        f"  Forderungsquelle: {'; '.join(source_strs)}",
        f"  fehlende/vorhandene Evidence: {'; '.join(evidence_strs)}",
        f"  betroffene Dateien/Symbole: {'; '.join(target_strs)}",
    ]
    return "\n".join(lines)


def query_about(con, term):
    rows = con.execute(
        """SELECT DISTINCT claim_id FROM claims
           WHERE subject LIKE ? OR scope LIKE ? OR normalized_claim LIKE ?
           ORDER BY claim_id""",
        (f"%{term}%", f"%{term}%", f"%{term}%"),
    ).fetchall()
    return [r["claim_id"] for r in rows]


def query_by_file(con, path_substr):
    rows = con.execute(
        """SELECT DISTINCT claim_id FROM claim_targets WHERE repo_path LIKE ? ORDER BY claim_id""",
        (f"%{path_substr}%",),
    ).fetchall()
    return [r["claim_id"] for r in rows]


def query_unverified(con, term):
    rows = con.execute(
        """SELECT DISTINCT claim_id FROM claims
           WHERE verification_status != 'VERIFIED'
             AND (subject LIKE ? OR scope LIKE ? OR normalized_claim LIKE ?)
           ORDER BY claim_id""",
        (f"%{term}%", f"%{term}%", f"%{term}%"),
    ).fetchall()
    return [r["claim_id"] for r in rows]


def query_old_owners(con):
    rows = con.execute(
        """SELECT DISTINCT ct.claim_id FROM claim_targets ct
           JOIN claims c ON c.claim_id = ct.claim_id
           WHERE ct.owner IS NOT NULL AND ct.owner NOT LIKE '%SHADED%'
             AND c.verification_status != 'VERIFIED'
           ORDER BY ct.claim_id"""
    ).fetchall()
    return [r["claim_id"] for r in rows]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--about", help='"Was fehlt fuer <TERM>?"')
    p.add_argument("--file", help='"Welche Claims betreffen <PATH>?"')
    p.add_argument("--unverified", help='"Welche Requirements zu <TERM> sind nicht verifiziert?"')
    p.add_argument("--old-owners", action="store_true", help='"Welche alten Owner sind noch behauptet/aktiv?"')
    args = p.parse_args()

    if not any([args.about, args.file, args.unverified, args.old_owners]):
        p.error("pass at least one of --about/--file/--unverified/--old-owners")

    con = connect()
    claim_ids = []
    if args.about:
        claim_ids = query_about(con, args.about)
    elif args.file:
        claim_ids = query_by_file(con, args.file)
    elif args.unverified:
        claim_ids = query_unverified(con, args.unverified)
    elif args.old_owners:
        claim_ids = query_old_owners(con)

    if not claim_ids:
        print("Keine passenden Claims gefunden.")
        return

    for cid in claim_ids:
        print(render_claim(con, cid))
        print()


if __name__ == "__main__":
    main()
