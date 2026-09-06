#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "claim.db"
MIGRATIONS = Path(__file__).resolve().parent / "migrations"
CHAT_CORPUS = Path(__file__).resolve().parent / "corpus" / "chats"
SOURCE_CORPUS = Path(__file__).resolve().parent / "corpus" / "sources"
EXTRACTION_CORPUS = Path(__file__).resolve().parent / "corpus" / "extractions"
TAG_CORPUS = Path(__file__).resolve().parent / "corpus" / "tags"
EVIDENCE_CORPUS = Path(__file__).resolve().parent / "corpus" / "evidence"

def sha256_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def insert_source(con, source, raw_text=None):
    row = con.execute("SELECT content_hash FROM sources WHERE source_id=?", (source["source_id"],)).fetchone()
    if row:
        if row[0] != source["content_hash"]:
            raise RuntimeError(f"immutable source changed: {source['source_id']}")
        return False
    con.execute("""INSERT INTO sources(source_id,source_key,path,title,source_type,revision,commit_sha,export_time,author_role,content_hash,ingested_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (source["source_id"], source["source_key"], source.get("path"), source["title"], source["source_type"],
                 source.get("revision"), source.get("commit_sha"), source.get("export_time"), source["author_role"],
                 source["content_hash"], source["ingested_at"]))
    if raw_text is not None:
        con.execute("INSERT INTO source_texts(source_id,content,content_hash) VALUES(?,?,?)",
                    (source["source_id"], raw_text, source["content_hash"]))
    for tag in source.get("tags", []):
        con.execute("INSERT OR IGNORE INTO source_tags(source_id,tag) VALUES(?,?)", (source["source_id"], tag))
    return True

def upsert_claim(con, c):
    row = con.execute("SELECT first_seen,last_seen FROM claims WHERE claim_id=?", (c["claim_id"],)).fetchone()
    if row:
        first_seen, last_seen = row
        inf, inl = c["first_seen"], c["last_seen"]
        if first_seen == "UNKNOWN" and inf != "UNKNOWN":
            first_seen = inf
        elif inf != "UNKNOWN" and first_seen != "UNKNOWN":
            first_seen = min(first_seen, inf)
        if last_seen == "UNKNOWN" and inl != "UNKNOWN":
            last_seen = inl
        elif inl != "UNKNOWN" and last_seen != "UNKNOWN":
            last_seen = max(last_seen, inl)
        con.execute("""UPDATE claims SET normalized_claim=?,subject=?,scope=?,first_seen=?,last_seen=?,
                       requirement_flag=MAX(requirement_flag,?), assertion_flag=MAX(assertion_flag,?),
                       confidence=MAX(confidence,?) WHERE claim_id=?""",
                    (c["normalized_claim"], c["subject"], c["scope"], first_seen, last_seen,
                     c["requirement_flag"], c["assertion_flag"], c["confidence"], c["claim_id"]))
    else:
        con.execute("""INSERT INTO claims(claim_id,normalized_claim,subject,scope,first_seen,last_seen,
                       requirement_flag,assertion_flag,verification_status,confidence,epistemic_kind)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                    (c["claim_id"], c["normalized_claim"], c["subject"], c["scope"], c["first_seen"], c["last_seen"],
                     c["requirement_flag"], c["assertion_flag"], c["verification_status"], c["confidence"], c["epistemic_kind"]))
    for tag in c.get("tags", []):
        con.execute("INSERT OR IGNORE INTO claim_tags(claim_id,tag) VALUES(?,?)", (c["claim_id"], tag))

def insert_claim_sources(con, c, source_id):
    for s in c.get("sources", []):
        con.execute("""INSERT OR IGNORE INTO claim_sources(claim_source_id,claim_id,source_id,source_location,anchor,speaker,authority,original_text)
                       VALUES(?,?,?,?,?,?,?,?)""",
                    (s["claim_source_id"], c["claim_id"], s.get("source_id", source_id), s.get("source_location"),
                     s.get("anchor"), s.get("speaker"), s.get("authority"), s["original_text"]))

def sync():
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys=ON")
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        con.executescript(migration.read_text(encoding="utf-8"))
    added = unchanged = extractions = 0

    for path in sorted(CHAT_CORPUS.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        src, raw = doc["source"], doc["raw_text"]
        assert src["content_hash"] == sha256_text(raw), path
        if insert_source(con, src, raw):
            added += 1
            for c in doc.get("claims", []):
                upsert_claim(con, c)
                insert_claim_sources(con, c, src["source_id"])
        else:
            unchanged += 1

    for path in sorted(SOURCE_CORPUS.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        source_docs = doc.get("sources") or [doc["source"]]
        for src in source_docs:
            if insert_source(con, src):
                added += 1
            else:
                unchanged += 1

    for path in sorted(EXTRACTION_CORPUS.glob("*.json")):
        raw_doc = json.loads(path.read_text(encoding="utf-8"))
        extraction_docs = raw_doc.get("extractions") or [raw_doc]
        for doc in extraction_docs:
            x = doc["extraction"]
            sid = x["source_id"]
            if not con.execute("SELECT 1 FROM sources WHERE source_id=?", (sid,)).fetchone():
                raise RuntimeError(f"unknown source in extraction: {sid}")
            if con.execute("SELECT 1 FROM claim_extractions WHERE extraction_id=?", (x["extraction_id"],)).fetchone():
                continue
            con.execute("""INSERT INTO claim_extractions(extraction_id,source_id,topic,extracted_at,status,retrieval_anchor,notes)
                           VALUES(?,?,?,?,?,?,?)""",
                        (x["extraction_id"], sid, x["topic"], x["extracted_at"], x["status"], x.get("retrieval_anchor"), x.get("notes")))
            for c in doc.get("claims", []):
                upsert_claim(con, c)
                insert_claim_sources(con, c, sid)
                con.execute("INSERT OR IGNORE INTO extraction_claims(extraction_id,claim_id) VALUES(?,?)",
                            (x["extraction_id"], c["claim_id"]))
            for r in doc.get("relations", []):
                con.execute("INSERT OR IGNORE INTO claim_relations(from_claim,relation,to_claim,rationale) VALUES(?,?,?,?)",
                            (r["from_claim"], r["relation"], r["to_claim"], r.get("rationale")))
            extractions += 1

    # A-0304/A-0306/A-0405: verification evidence is how a claim actually moves from UNVERIFIED
    # to VERIFIED (or CONTRADICTED) -- documentation alone never does (A-0301/A-0006). This corpus
    # was the missing half of build.py: claims/extractions could be ingested, but nothing wrote to
    # verification_evidence, so no claim in this DB could ever leave UNVERIFIED. Each file here is
    # {"evidence": [...]}, one entry per (claim_id, evidence_kind) pair; entries are idempotent on
    # evidence_id like every other corpus type.
    evidence_added = 0
    if EVIDENCE_CORPUS.exists():
        for path in sorted(EVIDENCE_CORPUS.glob("*.json")):
            doc = json.loads(path.read_text(encoding="utf-8"))
            for e in doc.get("evidence", []):
                if con.execute("SELECT 1 FROM verification_evidence WHERE evidence_id=?", (e["evidence_id"],)).fetchone():
                    continue
                if not con.execute("SELECT 1 FROM claims WHERE claim_id=?", (e["claim_id"],)).fetchone():
                    raise RuntimeError(f"unknown claim in evidence: {e['claim_id']}")
                con.execute("""INSERT INTO verification_evidence(evidence_id,claim_id,evidence_kind,repo_path,symbol,
                               commit_sha,test_id,runtime_artifact,checked_at,checked_commit,result,details)
                               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                            (e["evidence_id"], e["claim_id"], e["evidence_kind"], e.get("repo_path"), e.get("symbol"),
                             e.get("commit_sha"), e.get("test_id"), e.get("runtime_artifact"), e["checked_at"],
                             e.get("checked_commit"), e["result"], e.get("details")))
                if e.get("set_verification_status"):
                    con.execute("UPDATE claims SET verification_status=? WHERE claim_id=?",
                                (e["set_verification_status"], e["claim_id"]))
                evidence_added += 1

    for path in sorted(TAG_CORPUS.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        sid = doc["source_id"]
        for tag in doc.get("source_tags", []):
            con.execute("INSERT OR IGNORE INTO source_tags(source_id,tag) VALUES(?,?)", (sid, tag))
        for cid, tags in doc.get("claim_tags", {}).items():
            for tag in tags:
                con.execute("INSERT OR IGNORE INTO claim_tags(claim_id,tag) VALUES(?,?)", (cid, tag))

    con.execute("INSERT OR REPLACE INTO db_meta(key,value) VALUES('schema_version','3')")
    con.commit()
    assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    con.close()
    return added, unchanged, extractions, evidence_added

if __name__ == "__main__":
    a,u,e,v = sync()
    print(f"claim.db delta sync: {a} source(s) added, {u} source(s) unchanged, {e} topic extraction(s) applied, {v} evidence record(s) applied")
