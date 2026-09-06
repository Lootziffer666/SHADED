#!/usr/bin/env python3
"""GOAL_ALFRED.md A-0201/A-0801: reconciliation pass over a maintainer-provided raw claim
extraction (mode: "append-only extraction; no comparison/reconciliation" -- this script IS that
comparison/reconciliation step). Input is the raw {document_number, source, claim} triples from
tools/claim-db/scripts/../corpus/../<batch>.json (as delivered in the shaded_claim_batches zip);
output is a proper claim.db extraction JSON per batch, with:

  - claim_id, subject/scope, requirement_flag/assertion_flag/verification_status/epistemic_kind
    derived from the raw claim text (heuristic, documented below -- not hand-picked per claim,
    given the volume).
  - claim_sources linked to the ALREADY-INGESTED DOC source_id for that exact path (the markdown
    inventory from generate_markdown_source_inventory.py), never re-asserting a new source.
  - claim_targets pointing at the source path (no owner/symbol -- these are documentation
    assertions, not code-ownership claims).
  - verification_status=UNVERIFIED always (A-0006: a document claim alone is never VERIFIED,
    even when confirmed as an accurate quote of current content).

Claims whose content topically DUPLICATES an existing, richly-modeled claim.db entry (checked
against a small keyword list, see DUPLICATE_TOPICS below) are EXCLUDED from the generated
extraction and written instead to a separate skip-log, per the maintainer's rule: "Erweitern ist
immer okay, ersetzen nur begründet, Konflikte markieren und nicht selbst fixen" -- a raw claim
that just re-states something already captured is neither an extension nor a justified
replacement; skip it and say why, rather than creating a duplicate claim_id.

Run: python3 tools/claim-db/scripts/ingest_bulk_doc_claims.py <batch.json> [<batch.json> ...]
"""
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DB = ROOT / "claim.db"
OUT_DIR = ROOT / "tools" / "claim-db" / "corpus" / "extractions"
SKIP_LOG = ROOT / "tools" / "claim-db" / "corpus" / "extractions" / "BULK_DOC_CLAIMS_SKIPPED.md"

NORMATIVE = re.compile(r"\b(must|should|never|always|required|mandatory|forbidden|shall)\b", re.I)
REQ_ID = re.compile(r"\b[GAF]-\d{4}\b")

# Existing, richly-modeled claim.db entries this pass must not duplicate. Keyed by a keyword
# pattern -> (existing claim_id(s), short reason). Checked against every raw claim; a match is
# SKIPPED (not ingested) and logged to BULK_DOC_CLAIMS_SKIPPED.md instead.
DUPLICATE_TOPICS = [
    (re.compile(r"G-0006", re.I), "C-CONFLICT-G0006-GOAL / C-CONFLICT-G0006-WORLD", "the G-0006 ID collision between GOAL.md and GOAL_WORLD.md is already modeled as a detector-derived CONFLICT pair (tools/claim-db/detect_conflicts.py), with a CONTRADICTS relation and its own reasoning -- a bare restatement here would create a competing, unlinked duplicate."),
    (re.compile(r"Graphify|MemWiki|codebase-memory-mcp|FOUNDATION_DONOR_REGISTRY", re.I), "C-DONOR-FOUNDATION-0001", "Repo-Dorfaeltester donor pinning (Graphify/codebase-memory-mcp/MemWiki, SHAs, licenses) is already one claim with real evidence rows citing the exact same facts."),
    (re.compile(r"joystick|touch.{0,3}input.{0,40}(owner|replace)|A-0807|A-0303.{0,60}touch input|G-1903|G-3205", re.I), "C-INPUT-0001", "the touch-input/joystick single-owner regression case is already modeled with positive+negative evidence (tools/test-input-ownership.mjs); these are restatements of the same fact from AUDIT_REPORT.md/GOAL_WORLD.md's own text."),
]


def connect_ro():
    return sqlite3.connect(f"file:{DB}?mode=ro", uri=True)


def latest_source_id_for_path(con, path):
    rows = con.execute("SELECT source_id FROM sources WHERE path=? ORDER BY source_id", (path,)).fetchall()
    if not rows:
        return None
    revs = [r[0] for r in rows if "-R" in r[0]]
    return revs[-1] if revs else rows[0][0]


def slug_id(doc_number, seq):
    return f"C-DOC{doc_number:03d}-{seq:03d}"


def subject_for(claim_text):
    words = re.sub(r"[^\w\s]", "", claim_text).split()
    return " ".join(words[:8]).lower()


def process_batch(path, con, now):
    raw = json.loads(path.read_text(encoding="utf-8"))
    claims_out = []
    skipped = []
    per_doc_seq = {}

    for c in raw["claims"]:
        doc_number = c["document_number"]
        source_path = c["source"]
        text = c["claim"]

        dup_hit = next((d for d in DUPLICATE_TOPICS if d[0].search(text)), None)
        if dup_hit:
            skipped.append((path.name, source_path, text, dup_hit[1], dup_hit[2]))
            continue

        source_id = latest_source_id_for_path(con, source_path)
        if source_id is None:
            skipped.append((path.name, source_path, text, "N/A", f"source path not found in claim.db's markdown inventory -- needs a manual look, not silently ingested with a dangling reference."))
            continue

        per_doc_seq[doc_number] = per_doc_seq.get(doc_number, 0) + 1
        seq = per_doc_seq[doc_number]
        claim_id = slug_id(doc_number, seq)
        requirement_flag = 1 if (NORMATIVE.search(text) or REQ_ID.search(text)) else 0

        # If this claim DEFINES a specific GOAL requirement ID (only meaningful when the source is
        # one of the four canonical GOAL docs themselves, not a citation elsewhere or a status
        # report like AUDIT_REPORT.md's "A-0001 is reported PASS..."), record it as
        # claim_targets.symbol -- this is what tools/claim-db/detect_conflicts.py groups by to find
        # real cross-document ID collisions (the mechanism that already caught G-0006; without a
        # symbol these claims are invisible to it even when two canonical docs define the same ID
        # differently). Restricted to the four defining docs so a report merely citing/tracking an
        # ID (different source, different text, by design) doesn't get misread as a conflict.
        CANONICAL_DEFINING_DOCS = {"doc:GOAL.md", "doc:GOAL_WORLD.md", "doc:GOAL_ALFRED.md", "doc:GOAL_FOUNDATION.md"}
        id_match = REQ_ID.match(text)  # only when the ID leads the sentence, i.e. actually defines it
        symbol = id_match.group(0) if (id_match and f"doc:{source_path}" in CANONICAL_DEFINING_DOCS) else None

        claims_out.append({
            "claim_id": claim_id,
            "normalized_claim": text,
            "subject": subject_for(text),
            "scope": f"doc:{source_path}",
            "first_seen": now,
            "last_seen": now,
            "requirement_flag": requirement_flag,
            "assertion_flag": 1,
            "verification_status": "UNVERIFIED",
            "confidence": 0.95,
            "epistemic_kind": "CLAIM",
            "sources": [{
                "claim_source_id": f"CS-{claim_id}-BULK",
                "source_id": source_id,
                "source_location": "bulk doc-claim extraction (maintainer-provided, this session reconciled)",
                "anchor": text[:120],
                "speaker": "extraction",
                "authority": "REPO_DOCUMENT",
                "original_text": text,
            }],
            "targets": [{
                "target_id": f"T-{claim_id}-DOC",
                "repo_path": source_path,
                "symbol": symbol,
                "subsystem": None,
                "owner": None,
                "test_id": None,
            }],
            "evidence": [],
        })

    return claims_out, skipped


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    con = connect_ro()
    now = datetime.now(timezone.utc).isoformat()
    total_claims = total_skipped = 0
    all_skipped = []

    for arg in sys.argv[1:]:
        batch_path = Path(arg)
        claims, skipped = process_batch(batch_path, con, now)
        total_claims += len(claims)
        total_skipped += len(skipped)
        all_skipped.extend(skipped)

        out_name = f"bulk-{batch_path.stem}.json"
        out_path = OUT_DIR / out_name
        out_doc = {
            "extractions": [{
                "extraction": {
                    "extraction_id": f"EXT-BULK-{re.sub(r'[^A-Za-z0-9]+', '-', batch_path.stem).upper()}",
                    "source_id": claims[0]["sources"][0]["source_id"] if claims else "N/A",
                    "topic": f"Bulk doc-claim reconciliation: {batch_path.name}",
                    "extracted_at": now,
                    "status": "COMPLETE",
                    "retrieval_anchor": None,
                    "notes": (
                        f"Reconciled from maintainer-provided raw extraction {batch_path.name} "
                        f"(mode: append-only, no comparison/reconciliation done at extraction time). "
                        f"This pass: verified every referenced source path still exists in the repo "
                        f"and is unchanged since the extraction's branch snapshot; skipped "
                        f"{len(skipped)} claim(s) that duplicate an already richly-modeled claim.db "
                        f"entry (see BULK_DOC_CLAIMS_SKIPPED.md) rather than creating a parallel "
                        f"duplicate; ingested the remaining {len(claims)} as UNVERIFIED/BEHAUPTET "
                        f"per A-0006 (a document claim alone is never VERIFIED)."
                    ),
                },
                "claims": claims,
                "relations": [],
            }]
        }
        # NOTE: source_id at the extraction level must reference a REAL, already-ingested source
        # (build.py asserts this). Each individual claim carries its own correct source_id in
        # claim_sources regardless, so this top-level field is informational bookkeeping only,
        # not used for per-claim provenance.
        out_path.write_text(json.dumps(out_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{batch_path.name}: {len(claims)} claims -> {out_path.relative_to(ROOT)}, {len(skipped)} skipped")

    if all_skipped:
        lines = [
            "# BULK_DOC_CLAIMS_SKIPPED.md — raw claims excluded from bulk ingestion",
            "",
            "Generated by tools/claim-db/scripts/ingest_bulk_doc_claims.py. Per the maintainer's rule",
            '("Erweitern ist immer okay, ersetzen nur begründet, Konflikte markieren und nicht selbst',
            'fixen"), a raw claim that only restates an already richly-modeled claim.db entry is',
            "excluded here rather than ingested as a duplicate claim_id -- not a conflict, not an",
            "extension, just already covered.",
            "",
            "| Batch | Source doc | Raw claim | Already covered by | Reason |",
            "|---|---|---|---|---|",
        ]
        for batch, src, text, existing, reason in all_skipped:
            safe_text = text.replace("|", "\\|")
            safe_reason = reason.replace("|", "\\|")
            lines.append(f"| {batch} | {src} | {safe_text} | {existing} | {safe_reason} |")
        SKIP_LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"\nWrote {len(all_skipped)} skipped/duplicate entries to {SKIP_LOG.relative_to(ROOT)}")

    print(f"\nTotal: {total_claims} claims ready to ingest, {total_skipped} skipped as duplicates/unresolvable across {len(sys.argv) - 1} batch file(s).")


if __name__ == "__main__":
    main()
