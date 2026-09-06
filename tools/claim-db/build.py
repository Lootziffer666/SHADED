#!/usr/bin/env python3
"""Rebuild SHADED's repo-local claim.db from versioned migrations + corpus entries."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "claim.db"
MIGRATIONS = Path(__file__).resolve().parent / "migrations"
CHAT_CORPUS = Path(__file__).resolve().parent / "corpus" / "chats"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def rebuild() -> None:
    if DB.exists():
        DB.unlink()

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")

    for migration in sorted(MIGRATIONS.glob("*.sql")):
        con.executescript(migration.read_text(encoding="utf-8"))

    for path in sorted(CHAT_CORPUS.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        source = doc["source"]
        raw_text = doc["raw_text"]

        assert source["content_hash"] == sha256_text(raw_text), path

        con.execute(
            """INSERT INTO sources(
                 source_id, source_key, path, title, source_type, revision,
                 commit_sha, export_time, author_role, content_hash, ingested_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(source_id) DO NOTHING""",
            (
                source["source_id"], source["source_key"], source.get("path"),
                source["title"], source["source_type"], source.get("revision"),
                source.get("commit_sha"), source.get("export_time"),
                source["author_role"], source["content_hash"], source["ingested_at"],
            ),
        )
        con.execute(
            """INSERT INTO source_texts(source_id, content, content_hash)
               VALUES(?,?,?)
               ON CONFLICT(source_id) DO NOTHING""",
            (source["source_id"], raw_text, source["content_hash"]),
        )

        for c in doc.get("claims", []):
            con.execute(
                """INSERT INTO claims(
                     claim_id, normalized_claim, subject, scope, first_seen, last_seen,
                     requirement_flag, assertion_flag, verification_status,
                     confidence, epistemic_kind
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(claim_id) DO UPDATE SET
                     normalized_claim=excluded.normalized_claim,
                     subject=excluded.subject,
                     scope=excluded.scope,
                     last_seen=excluded.last_seen,
                     requirement_flag=MAX(claims.requirement_flag, excluded.requirement_flag),
                     assertion_flag=MAX(claims.assertion_flag, excluded.assertion_flag),
                     confidence=MAX(claims.confidence, excluded.confidence)""",
                (
                    c["claim_id"], c["normalized_claim"], c["subject"], c["scope"],
                    c["first_seen"], c["last_seen"], c["requirement_flag"],
                    c["assertion_flag"], c["verification_status"],
                    c["confidence"], c["epistemic_kind"],
                ),
            )

            for s in c.get("sources", []):
                con.execute(
                    """INSERT OR IGNORE INTO claim_sources(
                         claim_source_id, claim_id, source_id, source_location,
                         anchor, speaker, authority, original_text
                       ) VALUES(?,?,?,?,?,?,?,?)""",
                    (
                        s["claim_source_id"], c["claim_id"], source["source_id"],
                        s.get("source_location"), s.get("anchor"), s.get("speaker"),
                        s.get("authority"), s["original_text"],
                    ),
                )

            for t in c.get("targets", []):
                con.execute(
                    """INSERT OR IGNORE INTO claim_targets(
                         target_id, claim_id, repo_path, symbol, subsystem, owner, test_id
                       ) VALUES(?,?,?,?,?,?,?)""",
                    (
                        t["target_id"], c["claim_id"], t.get("repo_path"),
                        t.get("symbol"), t.get("subsystem"), t.get("owner"),
                        t.get("test_id"),
                    ),
                )

            for e in c.get("evidence", []):
                con.execute(
                    """INSERT OR IGNORE INTO verification_evidence(
                         evidence_id, claim_id, evidence_kind, repo_path, symbol,
                         commit_sha, test_id, runtime_artifact, checked_at,
                         checked_commit, result, details
                       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        e["evidence_id"], c["claim_id"], e["evidence_kind"],
                        e.get("repo_path"), e.get("symbol"), e.get("commit_sha"),
                        e.get("test_id"), e.get("runtime_artifact"), e["checked_at"],
                        e.get("checked_commit"), e["result"], e.get("details"),
                    ),
                )

        audit = doc.get("audit")
        if audit:
            con.execute(
                """INSERT OR IGNORE INTO audits(
                     audit_id, corpus_snapshot, repo_commit, created_at, previous_audit_id
                   ) VALUES(?,?,?,?,?)""",
                (
                    audit["audit_id"], audit["corpus_snapshot"], audit["repo_commit"],
                    audit["created_at"], audit.get("previous_audit_id"),
                ),
            )
            for f in audit.get("findings", []):
                con.execute(
                    """INSERT OR IGNORE INTO audit_findings(
                         finding_id, audit_id, claim_id, finding_type,
                         severity, details, status, created_at
                       ) VALUES(?,?,?,?,?,?,?,?)""",
                    (
                        f["finding_id"], audit["audit_id"], f["claim_id"],
                        f["finding_type"], f["severity"], f["details"],
                        f.get("status", "OPEN"), f["created_at"],
                    ),
                )

    con.execute("INSERT OR REPLACE INTO db_meta(key,value) VALUES('project','SHADED')")
    con.execute("INSERT OR REPLACE INTO db_meta(key,value) VALUES('repo','Lootziffer666/SHADED')")
    con.execute("INSERT OR REPLACE INTO db_meta(key,value) VALUES('schema_version','1')")
    con.execute(
        "INSERT OR REPLACE INTO db_meta(key,value) VALUES('builder','tools/claim-db/build.py')"
    )
    con.commit()
    con.execute("PRAGMA integrity_check")
    con.close()


if __name__ == "__main__":
    rebuild()
