# GOAL_ALFRED.md — `claim.db`: Gefordert / Behauptet / Verifiziert

> **Pre-Gate vor allen anderen SHADED-Goals.** Alfred bleibt standalone Development-/Knowledge-Infrastruktur und wird nicht Teil der SHADED-Produkt-Runtime. Für SHADED muss Alfred zuerst eine belastbare, abfragbare **`claim.db`** aufbauen.
>
> Kernproblem: Markdown, Chatexporte, README, Pläne und Agent-Aussagen enthalten gleichzeitig Anforderungen, Behauptungen, alte Zwischenstände und echte Belege. Diese Ebenen werden nicht mehr nur als Wiki/Text aufbereitet, sondern in einer strukturierten Claim-Datenbank gegeneinander gehalten.

---

# A-0000 — `claim.db` ist die kanonische Claim-Audit-Datenbank

Alfred erzeugt eine echte, lokal abfragbare Datenbank `claim.db` (SQLite bevorzugt, sofern kein vorhandener Alfred-DB-Layer einen nachweislich besseren kompatiblen Store erzwingt).

Sie muss drei primäre Sichten liefern:

```text
GEFORDERT
Was soll gelten / was wurde verbindlich verlangt?

BEHAUPTET
Was behauptet irgendeine Quelle über Architektur, Stand, Verhalten oder Ergebnis?

VERIFIZIERT
Was ist durch aktuelle Primärevidenz tatsächlich belegt?
```

- [ ] **A-0001** `claim.db` existiert als maschinenabfragbare Datenbank, nicht nur als generiertes Markdown.
- [ ] **A-0002** Schema/Migrationen/Queries sind versioniert; die erzeugte mutable DB darf regenerierbar sein und muss nicht als Binärdatei committed werden.
- [ ] **A-0003** `GEFORDERT`, `BEHAUPTET` und `VERIFIZIERT` sind erstklassige DB-Sichten/Queries.
- [ ] **A-0004** Diese drei Begriffe sind keine exklusiven Lebenszykluszustände. Ein Claim kann gleichzeitig GEFORDERT und VERIFIZIERT sein. Eine Behauptung kann UNVERIFIED, VERIFIED, CONTRADICTED oder STALE sein.
- [ ] **A-0005** Normative Forderung und epistemischer Wahrheitsstatus werden getrennt gespeichert. „Soll so sein“ ist niemals automatisch „ist so“.
- [ ] **A-0006** Eine Dokumentaussage über Implementierungsstand ist zunächst BEHAUPTET. Sie wird nicht allein dadurch VERIFIZIERT, dass sie in `CLAUDE.md`, `GOAL.md`, README oder einem Chatexport steht.
- [ ] **A-0007** Explizite Maintainer-Entscheidungen dürfen kanonische Anforderungen setzen. Assistant-/Agent-Aussagen bleiben Behauptungen, solange der Maintainer sie nicht übernimmt oder Primärevidenz sie bestätigt.

---

# A-0100 — Vollständiger Corpus-Ingest

Initial werden **alle verfügbaren Markdown-Dokumente und Chatexporte** des Projekts aufgenommen.

- [ ] **A-0101** Alle versionierten `*.md` im Repo werden inventarisiert und ingestiert, einschließlich Root-Dokumente, `docs/`, Skills, Architektur-, Donor-, Verification-, Goal- und historische Dokumente.
- [ ] **A-0102** Alle für das Projekt vorhandenen Chatexporte werden ingestiert; Herkunft, Zeit, Gespräch/Export und Autorrolle bleiben erhalten.
- [ ] **A-0103** Jeder Source-Datensatz besitzt stabile Source-ID, Pfad/Titel, Typ, Revision/Commit oder Export-Zeit, Autorrolle, Hash und Ingest-Zeit.
- [ ] **A-0104** Quellen werden versioniert statt überschrieben. Frühere Fassungen bleiben für History/Audit auffindbar.
- [ ] **A-0105** Source-Text bleibt als Primärbeleg referenzierbar; Claim-Einträge speichern präzise Fundstelle/Range/Anchor, nicht nur Dateinamen.
- [ ] **A-0106** Deduplizierung darf identische Inhalte verbinden, aber niemals unterschiedliche Quellen oder zeitliche Fassungen unsichtbar zusammenwerfen.
- [ ] **A-0107** Re-Ingest desselben unveränderten Dokuments ist idempotent und erzeugt keine Claim-Duplikate.

---

# A-0200 — Claim-DB-Schema

`claim.db` muss mindestens folgende normalisierte Informationen abbilden können:

```text
sources
  source_id
  path/title/type
  revision/commit/export_time
  author_role
  content_hash
  ingested_at

claims
  claim_id
  normalized_claim
  subject
  scope
  first_seen / last_seen
  requirement_flag
  assertion_flag
  verification_status
  confidence

claim_sources
  claim_id
  source_id
  source_location / anchor
  speaker / authority
  original_text

claim_relations
  from_claim
  relation: SUPPORTS | CONTRADICTS | SUPERSEDES | REFINES | DUPLICATES
  to_claim

claim_targets
  claim_id
  repo_path
  symbol / subsystem / owner / test_id

verification_evidence
  evidence_id
  claim_id
  evidence_kind
  repo_path / symbol / commit / test / runtime artifact
  checked_at
  checked_commit
  result

audits
  audit_id
  corpus_snapshot
  repo_commit
  created_at

audit_findings
  audit_id
  claim_id
  finding_type
  severity
  details
```

- [ ] **A-0201** Claims werden atomar extrahiert: eine überprüfbare Aussage pro Claim statt ganzer Absätze.
- [ ] **A-0202** Semantisch gleiche Claims werden normalisiert/verknüpft, ohne Source-Provenienz zu verlieren.
- [ ] **A-0203** Anforderungen werden als GEFORDERT markiert, Aussagen als BEHAUPTET; beides kann auf denselben normalisierten Claim zeigen.
- [ ] **A-0204** Widerspruch, Unterstützung, Präzisierung und Supersession sind Relationen, keine Freitextnotizen.
- [ ] **A-0205** FACT/CLAIM/HYPOTHESIS/CONFLICT/UNKNOWN/STALE dürfen als feinere Alfred-Metadaten erhalten bleiben, ersetzen die drei Hauptsichten aber nicht.
- [ ] **A-0206** Modell-Inferenz wird als INFERENCE/HYPOTHESIS getrennt gespeichert und niemals als historisch vorhandener Projekt-Claim ausgegeben.
- [ ] **A-0207** Indizes erlauben gezielte Suche nach `subject`, `scope`, `repo_path`, `symbol`, `owner`, `verification_status`, `requirement_flag` und `finding_type`.

---

# A-0300 — Was „VERIFIZIERT“ bedeutet

VERIFIZIERT verlangt aktuelle Primärevidenz.

```text
SOURCE CODE / ACTIVE CALL PATH
GIT HISTORY / COMMIT
TEST RESULT
REAL RUNTIME / BROWSER / GPU EVIDENCE
GENERATED ARTIFACT WITH TRACEABLE INPUT
EXPLICIT MAINTAINER DECISION (für normative Claims)
```

- [ ] **A-0301** Dokumentation allein beweist keine Implementierung.
- [ ] **A-0302** Ein Build allein beweist keine sichtbare/runtime-semantische Änderung.
- [ ] **A-0303** Für Replace/Migrate/Absorb gilt: `NEW OWNER EXISTS` + `OLD OWNER IS GONE`.
- [ ] **A-0304** Verification speichert Evidence-Referenz, Ergebnis, Zeitpunkt und Commit/Snapshot.
- [ ] **A-0305** Ändert sich relevante Primärevidenz, fällt ein früher VERIFIED-Claim auf `STALE_NEEDS_RECHECK`, bis er erneut geprüft wurde.
- [ ] **A-0306** Verification-States mindestens: `UNVERIFIED`, `VERIFIED`, `CONTRADICTED`, `STALE_NEEDS_RECHECK`, `UNKNOWN`, `NOT_APPLICABLE`.
- [ ] **A-0307** CONTRADICTED wird nicht gelöscht. Behauptung und Widerlegung bleiben gemeinsam auditierbar.

---

# A-0400 — Rolling Audit: jedes Dokument verändert `claim.db`

```text
BOOTSTRAP
alle Markdown + Chatexporte
      ↓
claim.db füllen
      ↓
gegen aktuelle Primärevidenz auditieren
      ↓
AUDIT SNAPSHOT

NEUES / GEÄNDERTES DOKUMENT
      ↓
Delta ingestieren
      ↓
Claims UPSERT / Relations aktualisieren
      ↓
betroffene Claims markieren
      ↓
Conflict / Supersession / Staleness prüfen
      ↓
Primärevidenz gezielt revalidieren
      ↓
NEUER AUDIT SNAPSHOT + DELTA
```

- [ ] **A-0401** Initialer Full-Corpus-Audit füllt `claim.db` aus allen vorhandenen Markdown-/Chatquellen.
- [ ] **A-0402** Jedes neue/geänderte Dokument erzeugt Delta-Ingest statt blindem Komplett-Neuimport.
- [ ] **A-0403** Nach jedem Dokument-Delta werden betroffene Claims neu abgeglichen und auditierbare Findings geschrieben.
- [ ] **A-0404** Neue Dokumente dürfen ältere Claims bestätigen, widersprechen, präzisieren oder superseden; History wird nie still überschrieben.
- [ ] **A-0405** Code-/Commit-/Teständerungen können Claim-Revalidation triggern, auch ohne Markdown-Änderung.
- [ ] **A-0406** Audit ist reproduzierbar: gleicher Corpus + gleicher Repo-Snapshot → gleiche Claim-/Conflict-Grundlage, abgesehen von explizit gekennzeichneter Modellunsicherheit.

---

# A-0500 — Die entscheidende Funktion: „Wo fehlt was?“

`claim.db` muss direkte Gap-Queries erlauben.

Mindestens:

```sql
-- Was ist gefordert, aber nicht verifiziert?
GEFORDERT AND verification_status != VERIFIED

-- Welche Behauptungen sind unbewiesen?
BEHAUPTET AND verification_status = UNVERIFIED

-- Welche Behauptungen sind widerlegt?
BEHAUPTET AND verification_status = CONTRADICTED

-- Wo ist die Doku stale?
VERIFIED implementation + contradictory/stale source claim

-- Was fehlt in einem bestimmten Subsystem / Pfad / Symbol?
WHERE scope = ? OR repo_path = ? OR symbol = ?
AND finding_type IN (...)
```

- [ ] **A-0501** `GEFORDERT ∧ NOT VERIFIED` — Anforderungen ohne ausreichenden Nachweis.
- [ ] **A-0502** `BEHAUPTET ∧ UNVERIFIED` — Aussagen ohne Beweis.
- [ ] **A-0503** `BEHAUPTET ∧ CONTRADICTED` — Aussagen, denen aktuelle Evidence widerspricht.
- [ ] **A-0504** `VERIFIED ∧ DOC_STALE` — Implementation ist belegt, Dokumentation beschreibt aber alten Stand/Owner.
- [ ] **A-0505** `CONFLICT` — relevante Quellen behaupten Unvereinbares.
- [ ] **A-0506** `SUPERSEDED` — frühere Aussage wurde durch spätere kanonische Entscheidung ersetzt.
- [ ] **A-0507** `STALE_NEEDS_RECHECK` — Verification hängt an überholtem Snapshot.
- [ ] **A-0508** `ORPHAN_IMPLEMENTATION` — aktive Implementation ohne passende aktuelle Forderung/Dokumentation, sofern bestimmbar.
- [ ] **A-0509** `MISSING_IMPLEMENTATION` — klare Forderung ohne aktiven erfüllenden Codepfad/Artefakt.
- [ ] **A-0510** Audit zeigt Delta zum vorherigen Audit: neu, gelöst, reopened, superseded, stale.
- [ ] **A-0511** CLI/API/Query-Interface kann Fragen beantworten wie: `Was fehlt für Sand?`, `Welche Claims betreffen src/main.js?`, `Welche Requirements zu Snowflow sind nicht verifiziert?`, `Welche alten Owner sind noch behauptet/aktiv?`.
- [ ] **A-0512** Antworten enthalten Claim-ID + Forderungsquelle + aktuellen Status + fehlende Evidence/Implementation + betroffene Dateien/Symbole, damit „wo was fehlt“ konkret adressierbar ist.

---

# A-0600 — Autorität und zeitliche Auflösung

- [ ] **A-0601** Neuere ausdrückliche Maintainer-Entscheidung schlägt ältere Maintainer-Notiz im selben Scope; History bleibt erhalten.
- [ ] **A-0602** Maintainer-Forderung schlägt Assistant-Vorschlag als normative Autorität.
- [ ] **A-0603** Aktueller Code/Test/Runtime kann eine Dokument-Behauptung widerlegen, ohne eine normative Maintainer-Forderung aufzuheben.
- [ ] **A-0604** Chatexporte werden nicht pauschal kanonisch. Speaker, Zeitpunkt, Annahme/Verwerfung und spätere Korrekturen werden berücksichtigt.
- [ ] **A-0605** Bei ungeklärter Autorität lautet der Zustand UNKNOWN/CONFLICT statt automatisch „neueste/längste Quelle gewinnt“.

---

# A-0700 — Verbindung zum Repo-Dorfältesten

`claim.db` ergänzt Graphify/MCP/MemWiki und wird die **epistemische Abfrageebene** des Dorfältesten:

```text
Graphify
  → Wo hängt der Claim technisch?

codebase-memory-mcp
  → Welche frühere Erfahrung/Änderung gehört dazu?

MemWiki
  → Warum wurde entschieden / was ist die verständliche Geschichte?

claim.db
  → Was wurde GEFORDERT, BEHAUPTET, VERIFIZIERT — und WO FEHLT WAS?
```

- [ ] **A-0701** Claim ↔ Datei/Symbol/Commit/Test/Decision-Beziehungen sind direkt referenzierbar.
- [ ] **A-0702** Dorfältesten-Preflight zeigt relevante Claims plus offene Gaps, Konflikte und Staleness.
- [ ] **A-0703** Ein Agent darf einen BEHAUPTET-Claim nicht als Tatsache weiterreichen, ohne Verification-Status sichtbar zu machen.
- [ ] **A-0704** VERIFIED-Claims können priorisiert retrieved werden, aber Freshness bleibt sichtbar.
- [ ] **A-0705** Living Skill kann einen Failure mit Claim-IDs verknüpfen; nach erfolgreicher Gegenprobe/Verifikation kann `claim.db` den neuen Evidence-Stand übernehmen.

---

# A-0800 — Self-Test

- [ ] **A-0801** Bootstrap: bestehende Markdown-/Chatquellen erzeugen atomare Claims mit Provenienz in `claim.db`.
- [ ] **A-0802** Widerspruch: zwei Quellen behaupten Gegensätzliches; Audit erzeugt CONFLICT statt Auswahl.
- [ ] **A-0803** Supersession: spätere ausdrückliche Maintainer-Entscheidung supersedet alte Anforderung ohne History-Verlust.
- [ ] **A-0804** Verification: reine Dokumentbehauptung bleibt UNVERIFIED; Code/Test/Runtime-Evidence promotet zu VERIFIED.
- [ ] **A-0805** Staleness: Änderung an betroffener Primärevidenz markiert frühere Verification zur erneuten Prüfung.
- [ ] **A-0806** Rolling Documents: Dokument A → DB-Update → Audit; Dokument B → DB-Update → neuer Audit + Delta.
- [ ] **A-0807** Regression: „neuer Joystick installiert“ darf nicht VERIFIED sein, solange der alte aktive Owner weiterhin gemountet wird.
- [ ] **A-0808** Gap Query: für einen gewählten Scope kann Alfred exakt fehlende Requirements/Evidence nennen und auf betroffene Dateien/Symbole zeigen.

---

# Alfred Definition of Done

Alfreds Claim-Gate ist bestanden, wenn:

1. alle verfügbaren Projekt-Markdowns und Chatexporte im Corpus liegen;
2. daraus eine regenerierbare, provenance-fähige `claim.db` aufgebaut wurde;
3. `GEFORDERT`, `BEHAUPTET`, `VERIFIZIERT` getrennt und kombiniert abfragbar sind;
4. Verification nur aus Primärevidenz entsteht;
5. Widerspruch, Supersession und Staleness erhalten bleiben;
6. jedes neue/geänderte Dokument `Ingest → Claim-Update → Audit` auslöst;
7. Code/Test/Runtime-Änderungen betroffene Claims revalidieren können;
8. gezielte Gap-Queries zuverlässig beantworten **wo was fehlt**;
9. Dorfältesten-Preflight `claim.db` als Claim-/Gap-Sicht nutzt;
10. Alfred standalone Development/Knowledge Infrastructure bleibt und keine SHADED-Runtime-Abhängigkeit erzeugt.
