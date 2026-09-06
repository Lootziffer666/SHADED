#!/usr/bin/env python3
"""Generates AUDIT_REPORT.md: one row per G-xxxx/F-xxxx/A-xxxx requirement across GOAL.md,
GOAL_ALFRED.md, GOAL_FOUNDATION.md and GOAL_WORLD.md (518 IDs total).

This is deliberately mechanical, not another round of hand-picked examples: every ID is
extracted from the source documents themselves, so none can be silently skipped. STATUS is
assigned by explicit rule, not vibes:

  PASS      -- listed in EVIDENCE below, with a real repo path / test / commit backing it.
  DEFERRED  -- falls in a GOAL_WORLD.md range Section 31 itself stages for later (sections 9-17,
              22-25 [reconstruction/provenance/provider-fusion, which concern the PARKED engine],
              30), justified by G-3101-3105's own text, not invented here.
  OPEN      -- everything else: not yet done, and not legitimately deferrable. This is the
              honest majority, especially for Alfred and Foundation, whose own documents state
              their items may NOT be marked DEFERRED just because they're hard.

Run: python3 tools/claim-db/scripts/generate_audit_report.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "AUDIT_REPORT.md"

FILES = ["GOAL.md", "GOAL_ALFRED.md", "GOAL_FOUNDATION.md", "GOAL_WORLD.md"]

# Real, evidenced PASS items from this session's actual work. Each maps an ID to a short
# (doc, code, test) evidence triple. Anything not in this dict defaults to OPEN or DEFERRED below.
EVIDENCE = {
    "G-1901": ("GOAL_WORLD.md Sec.19", "src/ui/touchControls.js (sole provider)", "tools/test-input-ownership.mjs"),
    "G-1902": ("GOAL_WORLD.md Sec.19", "src/ui/touchControls.js setupStick() x2", "tools/test-input-ownership.mjs"),
    "G-1903": ("GOAL_WORLD.md Sec.19", "no prior joystick ever existed (git history checked)", "tools/test-input-ownership.mjs"),
    "G-1904": ("GOAL_WORLD.md Sec.19", "src/main.js:initTouchControls() x1 call", "tools/test-input-ownership.mjs"),
    "G-1905": ("GOAL_WORLD.md Sec.19", "stick-zone/base/knob/setupStick: 1 file only", "tools/test-input-ownership.mjs"),
    "G-1906": ("GOAL_WORLD.md Sec.19", "test asserts active call path, not just import", "tools/test-input-ownership.mjs"),
    "G-1907": ("GOAL_WORLD.md Sec.19", "src/ui/touchControls.js (new owner) + git history (old owner never existed)", "tools/test-input-ownership.mjs (positive+negative)"),
    "G-1908": ("GOAL_WORLD.md Sec.19", "touchState is the canonical move/look contract", "tools/test-input-ownership.mjs"),
    "G-0404": ("GOAL_WORLD.md Sec.4", "snow.fragment.wgsl: rockMask no longer read", "tools/test-world-sandbox-physics.mjs (rockMask-absence check)"),
    "G-0410": ("GOAL_WORLD.md Sec.4", "index.html/main.js Snowflow branding removed", "tools/test-legacy-grep-audit.mjs"),
    "G-0601": ("GOAL_WORLD.md Sec.6", "worldDefaultSandDepth=1.0 default (terrain.js)", "tools/test-world-sandbox-physics.mjs (default-state sweep)"),
    "G-0602": ("GOAL_WORLD.md Sec.6", "rockExposed=(1-worldDefaultSandDepth)*slope", "tools/test-world-sandbox-physics.mjs (slope sweep, N.y in [0,1])"),
    "G-0603": ("GOAL_WORLD.md Sec.6", "FIELD.SAND already a world-state amount, not RGB (world-sandbox-reference.mjs)", "tools/test-world-sandbox-physics.mjs"),
    "G-0606": ("GOAL_WORLD.md Sec.6", "rockExposed only nonzero when worldDefaultSandDepth<1 AND slope exceeds threshold", "tools/test-world-sandbox-physics.mjs"),
    "G-0708": ("GOAL_WORLD.md Sec.7", "worldDefaultSnowCoverage=0.0 default; snow mixed in only on top of default", "tools/test-world-sandbox-physics.mjs"),
    "G-2819": ("GOAL_WORLD.md Sec.28", "vite.config.js __SHADED_COMMIT_SHA__ from real git rev-parse HEAD", "tools/test-build-identifier.mjs"),
    "G-2901": ("GOAL_WORLD.md Sec.29", "every named term classified (removed/kept/logged)", "tools/test-legacy-grep-audit.mjs"),
    "G-2902": ("GOAL_WORLD.md Sec.29", "SNOWFLOW absent from index.html/main.js", "tools/test-legacy-grep-audit.mjs"),
    "G-2903": ("GOAL_WORLD.md Sec.29", "single touch provider proven", "tools/test-input-ownership.mjs"),
    "G-2564": ("GOAL_WORLD.md Sec.25", "DONOR_MATRIX.md", "tools/test-donor-matrix.mjs"),
    "G-2565": ("GOAL_WORLD.md Sec.25", "DONOR_MATRIX.md columns", "tools/test-donor-matrix.mjs"),
    "G-2570": ("GOAL_WORLD.md Sec.25", "DONOR_MATRIX.md OWNER column = SHADED throughout", "tools/test-donor-matrix.mjs"),
    "F-0124": ("GOAL_FOUNDATION.md 0A", "vite.config.js + main.js buildInfo", "tools/test-build-identifier.mjs"),
    "A-0001": ("GOAL_ALFRED.md A-0000", "claim.db (SQLite, core tables verified present)", "tools/test-claim-db.mjs"),
    "A-0002": ("GOAL_ALFRED.md A-0000", "migrations/ + corpus/ versioned; build.py now syncs claim_targets/per-claim evidence/audits (previously silently dropped)", "tools/test-claim-db-regeneration.mjs"),
    "A-0003": ("GOAL_ALFRED.md A-0000", "GEFORDERT/BEHAUPTET/VERIFIZIERT/OFFENE_LUECKEN SQL views exist and are queryable", "tools/test-claim-db.mjs"),
    "A-0101": ("GOAL_ALFRED.md A-0100", "127 markdown sources ingested via generate_markdown_source_inventory.py", "tools/test-claim-db.mjs"),
    "A-0103": ("GOAL_ALFRED.md A-0100", "sources table: source_id/path/type/commit_sha/hash/ingested_at all populated on every DOC row", "tools/test-claim-db.mjs"),
    "A-0304": ("GOAL_ALFRED.md A-0300", "verification_evidence rows store evidence_kind/result; sand claims left UNVERIFIED (GPU proof outstanding), not fabricated", "tools/test-claim-db.mjs"),
    "A-0511": ("GOAL_ALFRED.md A-0500", "tools/claim-db/gap_query.py --about/--file/--unverified/--old-owners", "tools/test-gap-query.mjs"),
    "A-0512": ("GOAL_ALFRED.md A-0500", "gap_query.py output: Claim-ID + Forderungsquelle + STATUS + Evidence + betroffene Dateien/Symbole per claim", "tools/test-gap-query.mjs"),
    "A-0808": ("GOAL_ALFRED.md A-0800", "gap_query.py names missing evidence and points at real claim_targets files/symbols for a chosen scope", "tools/test-gap-query.mjs"),
    "G-1801": ("GOAL_WORLD.md Sec.18", "index.html is the sole tracked canonical UI root; all other *.html files are named, isolated exceptions", "tools/test-single-canonical-ui.mjs"),
    "G-1803": ("GOAL_WORLD.md Sec.18", "no editor/ tree, no gui.html, no exempt research page wired into index.html", "tools/test-single-canonical-ui.mjs + tools/verify-no-legacy-ui.mjs + tools/verify-no-legacy-ui-meta.mjs"),
    "G-1805": ("GOAL_WORLD.md Sec.18", "index.html contains no authored button/input/select/textarea/nav/aside control", "tools/verify-no-legacy-ui.mjs"),
    "G-1806": ("GOAL_WORLD.md Sec.18", "index.html: 1 <script type=module> importing /src/main.js, <300 lines", "tools/test-single-canonical-ui.mjs"),
    "A-0804": ("GOAL_ALFRED.md A-0800", "invariant: zero-evidence claims never VERIFIED (C-SAND-0003); evidence-backed claims promote (C-INPUT-0001)", "tools/test-verification-discipline.mjs"),
    "A-0805": ("GOAL_ALFRED.md A-0800", "tools/claim-db/check_staleness.py: real detect (C-INPUT-0001 vs src/main.js post-9ecd208 changes) -> STALE_NEEDS_RECHECK -> recheck evidence -> re-VERIFIED", "tools/test-claim-staleness.mjs"),
    "A-0807": ("GOAL_ALFRED.md A-0800", "C-INPUT-0001 (claim.db) VERIFIED only via positive+NEGATIVE_ABSENCE evidence; sand-ownership cross-check proves the invariant is not vacuous", "tools/test-verification-discipline.mjs"),
}

# GOAL_WORLD.md section -> (start line marker, DEFERRED reason) for the sections Section 31
# itself stages for later. Anything with a G-xxxx number that falls textually between these
# markers and the next '## ' heading is DEFERRED.
DEFERRED_SECTION_MARKERS = [
    "## 9. Gemeinsamer World Kernel",
    "## 10. Ground / Soil als Weltgedächtnis",
    "## 11. Hydrologie und Massenerhaltung",
    "## 12. Atmosphäre, Wetter, Wind, Licht und Wärme",
    "## 13. Erosion, Transport und Rückkopplung",
    "## 14. Physics ist Teil derselben Welt",
    "## 15. Vegetation / Life",
    "## 16. Persistenz und History",
    "## 17. Gameplay: Ursachen statt bestellter Konsequenzen",
    "## 22. Reconstruction: Observation → World State → Representation",
    "## 23. Provenienz-Taxonomie und Unsicherheit",
    "## 24. Provider-/Evidence-Fusion und Benchmarking",
    "## 30. Parked Image-to-World Engine / spätere Reaktivierung",
]
DEFERRED_REASON = (
    "GOAL_WORLD.md Section 31's own staged execution order (G-3101: \"Kein späteres Feature wird "
    "als Ablenkung benutzt, solange ein früheres Ownership-/Contract-Gate gebrochen ist\") places "
    "this section at stage 4 or later (ground/hydrology/atmosphere/erosion/physics-slope/"
    "vegetation/persistence/gameplay-causation) or as parked-engine reconstruction (stage 14, "
    "gated on G-3001..G-3006's own reactivation contract). Not started this session; not a scope "
    "reduction invented here."
)


def extract_ids_with_section(text, filename):
    section = "(preamble)"
    deferred = False
    rows = []
    for line in text.splitlines():
        m = re.match(r"^##\s+(.*)", line)
        if m:
            section = m.group(1).strip()
            heading = "## " + section
            deferred = any(heading.startswith(marker) for marker in DEFERRED_SECTION_MARKERS)
            continue
        for idm in re.finditer(r"\*\*([AFG]-\d{4})\*\*", line):
            rid = idm.group(1)
            rows.append((rid, filename, section, deferred))
    return rows


def collect_rows():
    all_rows = []
    seen_in_file = {}  # rid -> filename it was first seen in, to detect CROSS-FILE collisions
    collisions = []
    for fname in FILES:
        text = (ROOT / fname).read_text(encoding="utf-8")
        for rid, filename, section, deferred in extract_ids_with_section(text, fname):
            display_id = rid
            if rid in seen_in_file and seen_in_file[rid] != filename:
                # GOAL_WORLD.md's own G-0006 requires contradictions be explicitly resolved, not
                # silently papered over -- GOAL.md's top-level gate-pointer numbering (G-0000..
                # G-0015) collides with GOAL_WORLD.md's OWN, unrelated Section-0 numbering
                # (also G-0001..G-0015). These are two different requirements sharing one ID
                # across documents -- kept as separate rows rather than one silently winning.
                collisions.append(rid)
                display_id = f"{rid} [{filename}]"
            elif rid not in seen_in_file:
                seen_in_file[rid] = filename
            all_rows.append((display_id, rid, filename, section, deferred))
    all_rows.sort(key=lambda r: r[1])
    return all_rows, collisions


def main():
    all_rows, collisions = collect_rows()

    # First pass: classify every row and count, before writing anything (so the summary line at
    # the top can report final totals instead of being patched in by fragile line-index inserts).
    classified = []
    deferred_count = pass_count = open_count = 0
    for display_id, rid, filename, section, deferred in all_rows:
        if rid in EVIDENCE:
            doc, code, test = EVIDENCE[rid]
            for cell in (doc, code, test):
                if "|" in cell:
                    raise ValueError(
                        f"{rid}: EVIDENCE cell contains a raw '|', which corrupts the markdown "
                        f"table row (test-audit-report.mjs splits rows on '|'): {cell!r}"
                    )
            status = "PASS"
            pass_count += 1
            detail = "See DOC/CODE/TEST columns."
        elif deferred:
            doc, code, test = filename + " / " + section, "N/A", "N/A"
            status = "DEFERRED"
            deferred_count += 1
            detail = DEFERRED_REASON
        else:
            doc, code, test = filename + " / " + section, "N/A", "N/A"
            status = "OPEN"
            open_count += 1
            detail = "Not yet started, or started without repo/test evidence to cite honestly."
        classified.append((display_id, doc, status, code, test, detail))

    lines = [
        "# AUDIT_REPORT.md — GOAL.md / GOAL_ALFRED.md / GOAL_FOUNDATION.md / GOAL_WORLD.md",
        "",
        "Generated by `tools/claim-db/scripts/generate_audit_report.py` -- every `A-xxxx`/`F-xxxx`/",
        "`G-xxxx` ID across all four documents, extracted mechanically (not hand-picked), so none",
        "can be silently skipped. Re-run after any real progress to refresh.",
        "",
        f"**Total requirement rows: {len(all_rows)}. PASS: {pass_count} · DEFERRED: {deferred_count} · OPEN: {open_count}.**",
        "",
        "STATUS rules: `PASS` only with a real repo path + test/command in `EVIDENCE`; `DEFERRED`",
        "only for GOAL_WORLD.md sections Section 31 itself stages later (see reason column);",
        "everything else is honestly `OPEN` -- not started, or started but not yet evidenced.",
        "Alfred and Foundation items are essentially never `DEFERRED`: both documents state their",
        "own items may not be deferred just because they are large (GOAL_FOUNDATION.md's own",
        "closing line; GOAL_ALFRED.md is Gate -1, blocking everything downstream by the top-level",
        "GOAL.md's own rule).",
        "",
    ]

    if collisions:
        lines += [
            f"**Found {len(set(collisions))} ID collision(s) across documents "
            f"(GOAL_WORLD.md's own G-0006: contradictions are resolved explicitly, never silently):** "
            + ", ".join(sorted(set(collisions))) + ". "
            "GOAL.md's top-level gate-pointer numbering (G-0000..G-0015, referencing the Alfred/"
            "Foundation/World gates) independently reuses the same ID range GOAL_WORLD.md's own "
            "Section 0 (\"Autorität, Prüflogik und Umgang mit Widersprüchen\") uses for unrelated "
            "content. Both are kept below as separate rows, tagged with their source file, rather "
            "than one silently overwriting the other.",
            "",
        ]

    lines += [
        "| ID | Doc/Section | STATUS | CODE | TEST | EVIDENCE detail |",
        "|---|---|---|---|---|---|",
    ]

    for display_id, doc, status, code, test, detail in classified:
        lines.append(f"| {display_id} | {doc} | **{status}** | {code} | {test} | {detail} |")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {len(all_rows)} rows to {OUT.relative_to(ROOT)}: PASS={pass_count} DEFERRED={deferred_count} OPEN={open_count}")


if __name__ == "__main__":
    main()
