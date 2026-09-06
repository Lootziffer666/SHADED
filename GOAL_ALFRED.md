# GOAL_ALFRED.md — Gefordert / Behauptet / Verifiziert

> **Pre-Gate vor allen anderen SHADED-Goals.** Alfred bleibt ein standalone Repo-Gedächtnis/Systemkarte und wird nicht Teil der SHADED-Produkt-Runtime. Für SHADED muss Alfred jedoch vor weiterer großer Architekturarbeit einen belastbaren Claim-Ledger besitzen.
>
> Kernproblem: Markdown, Chatexporte, README, Pläne und Agent-Aussagen enthalten gleichzeitig Anforderungen, Behauptungen, alte Zwischenstände und echte Belege. Solange diese Ebenen nicht getrennt und fortlaufend gegeneinander geprüft werden, kann jede neue Session eine alte Behauptung wieder zur vermeintlichen Wahrheit machen.

---

# A-0000 — Drei sichtbare Sichten, eine Claim-Datenbank

Alfred erhält drei primäre Sichten:

```text
GEFORDERT
Was soll gelten / was wurde verbindlich verlangt?

BEHAUPTET
Was behauptet irgendeine Quelle über Architektur, Stand, Verhalten oder Ergebnis?

VERIFIZIERT
Was ist durch aktuelle Primärevidenz tatsächlich belegt?
```

- [ ] **A-0001** `GEFORDERT`, `BEHAUPTET` und `VERIFIZIERT` werden als erstklassige Alfred-Sichten umgesetzt.
- [ ] **A-0002** Diese drei Begriffe sind **keine exklusiven Lebenszykluszustände**. Ein Claim kann gleichzeitig GEFORDERT und VERIFIZIERT sein. Eine BEHAUPTUNG kann UNVERIFIED, VERIFIED, CONTRADICTED oder STALE sein.
- [ ] **A-0003** Normative Forderung und epistemischer Wahrheitsstatus werden getrennt gespeichert. „Soll so sein“ ist niemals automatisch „ist so“.
- [ ] **A-0004** Eine Dokumentaussage über Implementierungsstand ist zunächst BEHAUPTET. Sie wird nicht allein dadurch VERIFIZIERT, dass sie in `CLAUDE.md`, `GOAL.md`, README oder einem Chatexport steht.
- [ ] **A-0005** Explizite Maintainer-Entscheidungen dürfen kanonische Anforderungen setzen. Assistant-/Agent-Aussagen bleiben Behauptungen, solange der Maintainer sie nicht übernimmt oder Primärevidenz sie bestätigt.

---

# A-0100 — Vollständiger Corpus-Ingest

Initial werden **alle verfügbaren Markdown-Dokumente und Chatexporte** des Projekts in Alfred aufgenommen.

- [ ] **A-0101** Alle versionierten `*.md` im Repo werden inventarisiert und ingestiert, einschließlich Root-Dokumente, `docs/`, Skills, Architektur-, Donor-, Verification-, Goal- und historische Dokumente.
- [ ] **A-0102** Alle für das Projekt vorhandenen Chatexporte werden ingestiert; Herkunft, Zeit, Gespräch/Export und Autorrolle bleiben erhalten.
- [ ] **A-0103** Jeder Source-Datensatz besitzt stabile Source-ID, Pfad/Titel, Typ, Revision/Commit oder Export-Zeit, Autorrolle und Ingest-Zeit.
- [ ] **A-0104** Quellen werden versioniert statt überschrieben. Frühere Fassungen bleiben für History/Audit auffindbar.
- [ ] **A-0105** Source-Text bleibt als Primärbeleg referenzierbar; Claim-Einträge speichern präzise Fundstelle/Range/Anchor, nicht nur Dateinamen.
- [ ] **A-0106** Deduplizierung darf identische Inhalte verbinden, aber niemals unterschiedliche Quellen oder zeitliche Fassungen unsichtbar zusammenwerfen.

---

# A-0200 — Claim Extraction und Normalisierung

Aus dem Corpus wird eine Claim-DB aufgebaut.

Minimaler Claim-Datensatz:

```text
claim_id
normalized_claim
subject / scope
source_id + source_location
source_kind
speaker/authority
first_seen / last_seen
requirement_flag
assertion_flag
verification_status
verification_evidence[]
contradicts[]
supports[]
supersedes[] / superseded_by[]
affected_files/symbols[]
verified_at_commit / verified_at_time
notes
```

- [ ] **A-0201** Aussagen werden möglichst atomar extrahiert: eine überprüfbare Aussage pro Claim statt komplette Absätze als „Claim“ zu speichern.
- [ ] **A-0202** Semantisch gleiche Claims werden verknüpft/normalisiert, ohne ihre einzelnen Source-Provenienzen zu verlieren.
- [ ] **A-0203** Anforderungen werden als GEFORDERT markiert, Behauptungen als BEHAUPTET; beides kann auf denselben normalisierten Claim zeigen.
- [ ] **A-0204** Widerspruch, Unterstützung, Supersession und Scope-Beziehung sind explizite Relationen, keine Freitextnotizen.
- [ ] **A-0205** Bestehende Alfred-Klassen wie FACT/CLAIM/HYPOTHESIS/CONFLICT/UNKNOWN/STALE dürfen als feinere epistemische Metadaten erhalten bleiben, aber sie ersetzen die drei Hauptsichten nicht.
- [ ] **A-0206** Kein LLM darf einen nicht in einer Source vorhandenen Projekt-Claim als historischen Claim erfinden. Modell-Inferenz wird als INFERENCE/HYPOTHESIS separat gekennzeichnet.

---

# A-0300 — Was „VERIFIZIERT“ bedeutet

VERIFIZIERT verlangt aktuelle Primärevidenz.

Mögliche Evidence:

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
- [ ] **A-0303** Für Replace/Migrate/Absorb gilt auch in Alfred: `NEW OWNER EXISTS` + `OLD OWNER IS GONE`.
- [ ] **A-0304** Verification speichert Evidence-Referenz, Zeitpunkt und Commit/Snapshot, gegen den geprüft wurde.
- [ ] **A-0305** Ändert sich relevante Primärevidenz, darf ein früher VERIFIED-Claim automatisch auf `STALE_NEEDS_RECHECK` fallen.
- [ ] **A-0306** Mögliche Verification-States mindestens: `UNVERIFIED`, `VERIFIED`, `CONTRADICTED`, `STALE_NEEDS_RECHECK`, `UNKNOWN`, `NOT_APPLICABLE`.
- [ ] **A-0307** Ein CONTRADICTED-Claim wird nicht gelöscht. Er bleibt als historisch behauptete Aussage samt Widerlegung sichtbar.

---

# A-0400 — Der Rolling-Audit-Loop

Alfred arbeitet inkrementell. Nicht einmalig „Corpus importiert, fertig“.

```text
BOOTSTRAP
alle Markdown + Chatexporte
      ↓
Claims extrahieren / normalisieren
      ↓
gegen aktuelle Primärevidenz auditieren
      ↓
AUDIT SNAPSHOT

NEUES / GEÄNDERTES DOKUMENT
      ↓
Delta ingestieren
      ↓
neue/geänderte Claims upserten
      ↓
betroffene bestehende Claims markieren
      ↓
Widerspruch / Supersession / Staleness prüfen
      ↓
Primärevidenz erneut prüfen
      ↓
NEUER AUDIT SNAPSHOT

NÄCHSTES DOKUMENT
      ↓
repeat
```

- [ ] **A-0401** Initialer Full-Corpus-Audit füllt die Claim-DB aus allen vorhandenen Markdown-/Chatquellen.
- [ ] **A-0402** Jedes neue oder geänderte Dokument erzeugt einen **Delta-Ingest** statt eines unkontrollierten Komplett-Neuimports.
- [ ] **A-0403** Nach jedem Dokument-Delta werden relevante Claims neu abgeglichen und ein Audit ausgeführt.
- [ ] **A-0404** Neue Dokumente dürfen ältere Claims bestätigen, widersprechen, präzisieren oder superseden; sie überschreiben History nicht still.
- [ ] **A-0405** Code-/Commit-/Teständerungen können ebenfalls Claim-Revalidation triggern, auch wenn kein Markdown geändert wurde.
- [ ] **A-0406** Ein Audit ist reproduzierbar: gleicher Corpus + gleicher Repo-Snapshot → gleiche Claim-/Conflict-Grundlage, abgesehen von explizit gekennzeichneter Modellunsicherheit bei Extraktion/Normalisierung.

---

# A-0500 — Audit-Ausgaben

Jeder Audit muss mindestens folgende Mengen erzeugen können:

- [ ] **A-0501** `GEFORDERT ∧ NOT VERIFIED` — Anforderungen ohne ausreichenden Nachweis.
- [ ] **A-0502** `BEHAUPTET ∧ UNVERIFIED` — Aussagen, die bislang niemand bewiesen hat.
- [ ] **A-0503** `BEHAUPTET ∧ CONTRADICTED` — Aussagen, denen aktuelle Evidence widerspricht.
- [ ] **A-0504** `VERIFIED ∧ DOC_STALE` — Code/Runtime ist weiter als die Dokumentation oder Dokumentation beschreibt alten Owner/Stand.
- [ ] **A-0505** `CONFLICT` — zwei relevante Quellen behaupten Unvereinbares.
- [ ] **A-0506** `SUPERSEDED` — frühere gültige/behauptete Aussage wurde durch spätere kanonische Entscheidung ersetzt.
- [ ] **A-0507** `STALE_NEEDS_RECHECK` — Verification bezieht sich auf überholten Commit/Evidence-Snapshot.
- [ ] **A-0508** `ORPHAN_IMPLEMENTATION` — aktive Implementation/Owner ohne passende aktuelle Forderung/Dokumentation, sofern der Scope dies sinnvoll bestimmen lässt.
- [ ] **A-0509** `MISSING_IMPLEMENTATION` — Forderung ist klar, aber kein aktiver Codepfad/Artefakt erfüllt sie.
- [ ] **A-0510** Audit-Ergebnis zeigt **Delta zum vorherigen Audit**: neu, gelöst, wieder geöffnet, superseded, stale.

---

# A-0600 — Autorität und zeitliche Auflösung

- [ ] **A-0601** Neuere ausdrückliche Maintainer-Entscheidung schlägt ältere Maintainer-Notiz im selben Scope; ältere Aussage bleibt History.
- [ ] **A-0602** Maintainer-Forderung schlägt Assistant-Vorschlag als normative Autorität.
- [ ] **A-0603** Aktueller Code/Test/Runtime kann eine Dokument-Behauptung widerlegen, ohne dadurch eine normative Maintainer-Forderung aufzuheben.
- [ ] **A-0604** Chatexporte werden nicht pauschal kanonisch. Speaker, Zeitpunkt, Annahme/Verwerfung und spätere Korrekturen werden berücksichtigt.
- [ ] **A-0605** Bei ungeklärter Autorität lautet der Zustand UNKNOWN/CONFLICT, nicht automatische Auswahl des neuesten oder längsten Dokuments.

---

# A-0700 — Verbindung zum Repo-Dorfältesten

Alfreds Claim-Ledger ergänzt den Dorfältesten; er ersetzt nicht Graphify/MCP/MemWiki.

```text
Graphify
  → Wo hängt der Claim technisch?

codebase-memory-mcp
  → Welche frühere Erfahrung/Änderung gehört dazu?

MemWiki
  → Warum wurde entschieden / was ist die verständliche Geschichte?

ALFRED CLAIM LEDGER
  → Was wurde gefordert, was behauptet, was ist aktuell verifiziert?
```

- [ ] **A-0701** Claim ↔ Datei/Symbol/Commit/Test/Decision-Beziehungen können in den Struktur-/Memory-Layern referenziert werden.
- [ ] **A-0702** Dorfältesten-Preflight zeigt relevante GEFORDERT-/BEHAUPTET-/VERIFIZIERT-Claims plus offene Konflikte.
- [ ] **A-0703** Ein Agent darf einen BEHAUPTET-Claim nicht als Tatsache weiterreichen, ohne dessen Verification-Status sichtbar zu machen.
- [ ] **A-0704** VERIFIED-Claims können priorisiert retrieved werden, aber Staleness/Freshness bleibt sichtbar.

---

# A-0800 — Self-Test

- [ ] **A-0801** Bootstrap-Test: mehrere bestehende Markdown-/Chatquellen werden ingestiert und erzeugen atomare Claims mit Source-Provenienz.
- [ ] **A-0802** Widerspruchstest: zwei Quellen behaupten Gegensätzliches; Audit erzeugt CONFLICT statt still eine auszuwählen.
- [ ] **A-0803** Maintainer-Supersession-Test: spätere ausdrückliche Entscheidung supersedet alte Anforderung, ohne History zu löschen.
- [ ] **A-0804** Verification-Test: reine Dokumentbehauptung bleibt UNVERIFIED; erst Code/Test/Runtime-Evidence promotet sie zu VERIFIED.
- [ ] **A-0805** Staleness-Test: Änderung an betroffener Primärevidenz invalidiert/markiert frühere Verification zur erneuten Prüfung.
- [ ] **A-0806** Rolling-Document-Test: neues Dokument → Claims aktualisieren → Audit; zweites neues Dokument → Claims erneut aktualisieren → neuer Audit mit Delta.
- [ ] **A-0807** Regression-Test mit einem bekannten SHADED-Fall: z. B. „neuer Joystick installiert“ darf nicht als VERIFIED gelten, solange der alte aktive Owner weiterhin gemountet wird.

---

# Alfred Definition of Done

Alfreds Claim-Gate ist bestanden, wenn:

1. alle verfügbaren Projekt-Markdowns und Chatexporte im Source-Corpus liegen;
2. daraus eine provenance-fähige Claim-DB erzeugt wurde;
3. `GEFORDERT`, `BEHAUPTET`, `VERIFIZIERT` getrennt und gemeinsam abfragbar sind;
4. Verification nur aus Primärevidenz entsteht;
5. Widerspruch, Supersession und Staleness erhalten bleiben statt überschrieben zu werden;
6. jedes neue/geänderte Dokument den **Ingest → Claim-Update → Audit**-Loop auslöst;
7. Audit-Deltas zeigen, was neu, gelöst, widersprüchlich oder wieder ungeklärt ist;
8. Dorfältesten-Preflight diese Claim-Sicht nutzen kann;
9. Alfred weiterhin standalone Development/Knowledge Infrastructure bleibt und keine SHADED-Runtime-Abhängigkeit erzeugt.
