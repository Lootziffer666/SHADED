#!/usr/bin/env python3
"""GOAL_ALFRED.md A-0101/A-0103: inventory and ingest every versioned *.md in the repo as an
Alfred source, with stable source_id, path, revision (git commit at generation time), content
hash and ingest timestamp -- so the corpus inventory step (registering that a document exists,
with real provenance) is complete and regenerable, separate from the much larger, ongoing atomic
claim-extraction step (A-0201/A-0402), which happens per-document, incrementally, as each is
actually read and analysed -- not fabricated in bulk for all ~130 documents in one pass.

A-0002/A-0104: this output file IS the corpus -- the append-only historical ledger of every
source ever seen, not a live snapshot recomputed from claim.db. A fresh `claim.db` built from
nothing but migrations/ + corpus/ (tools/test-claim-db-regeneration.mjs) must reproduce every row,
including sources for paths that were later renamed or edited away -- so this script never drops
or rewrites a previously-written entry, only appends to it. (An earlier version compared against
the LIVE claim.db to decide whether a path's content had changed; that broke regenerability,
because a from-scratch rebuild has no live DB yet to compare against and so silently lost every
historical entry a rename or edit had produced. Fixed by reading the EXISTING corpus JSON as the
history instead.)

Regenerable, not hand-maintained: re-run this whenever a markdown file is added, removed, or its
content changes, then `python3 tools/claim-db/build.py` to sync. Re-running is idempotent for
unchanged files (same content hash -> same source_id -> insert_source() in build.py treats it as
unchanged) and additive for changed ones (new content -> new, deterministic revision id; the prior
entry for that path is kept exactly as it was).

Run: python3 tools/claim-db/scripts/generate_markdown_source_inventory.py
"""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "tools" / "claim-db" / "corpus" / "sources" / "0002-full-markdown-inventory.json"

EXCLUDE_DIRS = {"node_modules", ".git"}


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def commit_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip()


def title_for(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return path.stem


def load_existing() -> list[dict]:
    if not OUT.exists():
        return []
    return json.loads(OUT.read_text(encoding="utf-8")).get("sources", [])


def main():
    sha = commit_sha()
    now = datetime.now(timezone.utc).isoformat()
    md_files = sorted(
        p for p in ROOT.rglob("*.md")
        if not any(part in EXCLUDE_DIRS for part in p.parts)
    )

    existing = load_existing()
    existing_by_id = {s["source_id"]: s for s in existing}
    # base_id -> most recent known content_hash among ANY entry (base or revision) for that path,
    # so a second consecutive edit of the same file also gets detected as a further revision.
    latest_hash_by_base = {}
    for s in existing:
        base = s["source_id"].split("-R", 1)[0]
        latest_hash_by_base[base] = s["content_hash"]

    new_entries = []
    revisions = 0
    for path in md_files:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        content_hash = sha256_text(text)
        base_id = "SRC-DOC-" + hashlib.sha256(rel.encode("utf-8")).hexdigest()[:16].upper()

        if base_id not in latest_hash_by_base:
            source_id = base_id  # genuinely new path
        elif latest_hash_by_base[base_id] == content_hash:
            source_id = base_id if base_id in existing_by_id else f"{base_id}-R{content_hash[:8].upper()}"
            # already recorded (as base or as a prior identical revision) -- nothing new to add
            if source_id in existing_by_id:
                continue
        else:
            # A-0104: content changed since the last recorded entry for this path. Mint a new,
            # deterministic (content-hash-derived) revision id; the prior entry(ies) for this path
            # stay in `existing`, untouched, below.
            source_id = f"{base_id}-R{content_hash[:8].upper()}"
            if source_id in existing_by_id:
                continue  # this exact revision was already recorded in an earlier run
            revisions += 1

        new_entries.append({
            "source_id": source_id,
            "source_key": f"doc:{rel}",
            "path": rel,
            "title": title_for(path),
            "source_type": "DOC",
            "revision": sha if source_id != base_id else None,
            "commit_sha": sha,
            "export_time": None,
            "author_role": "REPO_DOCUMENT",
            "content_hash": content_hash,
            "ingested_at": now,
            "tags": ["markdown", "full-corpus-inventory"],
        })

    sources = existing + new_entries  # append-only: never drop or rewrite a prior entry

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"sources": sources}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"wrote {len(sources)} markdown source entries total "
        f"({len(new_entries)} new this run, {revisions} of them a revision of a previously-seen path) "
        f"to {OUT.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
