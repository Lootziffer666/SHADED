#!/usr/bin/env python3
"""GOAL_ALFRED.md A-0101/A-0103: inventory and ingest every versioned *.md in the repo as an
Alfred source, with stable source_id, path, revision (git commit at generation time), content
hash and ingest timestamp -- so the corpus inventory step (registering that a document exists,
with real provenance) is complete and regenerable, separate from the much larger, ongoing atomic
claim-extraction step (A-0201/A-0402), which happens per-document, incrementally, as each is
actually read and analysed -- not fabricated in bulk for all ~118 documents in one pass.

Regenerable, not hand-maintained: re-run this whenever a markdown file is added, removed, or its
content changes, then `python3 tools/claim-db/build.py` to sync. Re-running is idempotent (same
content hash -> insert_source() in build.py treats it as unchanged).

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


def main():
    sha = commit_sha()
    now = datetime.now(timezone.utc).isoformat()
    md_files = sorted(
        p for p in ROOT.rglob("*.md")
        if not any(part in EXCLUDE_DIRS for part in p.parts)
    )
    sources = []
    for path in md_files:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        source_id = "SRC-DOC-" + hashlib.sha256(rel.encode("utf-8")).hexdigest()[:16].upper()
        sources.append({
            "source_id": source_id,
            "source_key": f"doc:{rel}",
            "path": rel,
            "title": title_for(path),
            "source_type": "DOC",
            "revision": None,
            "commit_sha": sha,
            "export_time": None,
            "author_role": "REPO_DOCUMENT",
            "content_hash": sha256_text(text),
            "ingested_at": now,
            "tags": ["markdown", "full-corpus-inventory"],
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"sources": sources}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(sources)} markdown source entries to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
