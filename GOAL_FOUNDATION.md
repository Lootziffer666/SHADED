# GOAL_FOUNDATION.md — SHADED Pre-Gate: Harness, Repo-Dorfältester, Living Skill

> **Dieses Dokument ist Gate 0 vor allen World-/Runtime-/Snowflow-/Surface-Goals.**
> Kein nachgelagerter Architekturpunkt darf als „fertig“ gelten, solange diese Foundation nicht installiert, verdrahtet und verifiziert ist.
>
> Grund: SHADED besitzt inzwischen sehr viel Kanon, aber Wissen allein verhindert keine Rückfälle. Vor weiterer Architekturarbeit braucht das Repo ein dauerhaftes Gedächtnis, einen deterministischen Claude-Code-Harness und einen failure-getriebenen Living Skill, der aus echten Erfolgen und Fehlern lernt.

---

## F-0001 — Reihenfolge ist bindend

```text
0A  CLAUDE-CODE HARNESS
0B  REPO-DORFÄLTESTER / MEMORY
0C  LIVING SKILL / FAILURE-DRIVEN LEARNING
0D  FOUNDATION SELF-TEST
↓
ERST DANACH
↓
GOAL.md: Dokument-Reconciliation → Ownership → Snowflow-Absorption → World/Surface usw.
```

- [ ] **F-0001** Die Foundation wird vor allen anderen GOAL.md-Kapiteln umgesetzt.
- [ ] **F-0002** Ein Agent darf während dieses Gates keine World-/Material-/UI-Neuentwicklung als Ersatzhandlung beginnen.
- [ ] **F-0003** Das Gate ist erst bestanden, wenn die Foundation auf dem aktiven Branch/Entry-Point nachweislich funktioniert.

---

# 0A. Claude-Code-Harness — Wissen deterministisch durchsetzen

## Control Plane statt Dokument-Dump

- [ ] **F-0101** Root-`CLAUDE.md` wird zur kompakten Control Plane: Projektidentität, aktuelle Entry Points, Autoritätshierarchie, wichtigste Invarianten, Pflicht-Commands und Verweise. Fachwissen bleibt in kanonischen Docs/Skills statt dupliziert zu werden.
- [ ] **F-0102** Root-`CLAUDE.md` wird deutlich entschlackt; Zielgröße ungefähr <200 Zeilen, außer eine belegte projektspezifische Notwendigkeit rechtfertigt mehr.
- [ ] **F-0103** Wiederholte Inhalte werden durch stabile Verweise/Imports ersetzt statt an mehreren Stellen kopiert.
- [ ] **F-0104** Major scopes erhalten nur dort eigene scoped `CLAUDE.md`, wo tatsächlich andere Regeln gelten (z. B. Runtime/Shader, Reconstruction, Tools/Verification); keine künstliche Dateivermehrung.
- [ ] **F-0105** `CLAUDE.local.md` wird als lokaler, nicht versionierter Platz für maschinen-/session-spezifische Hinweise unterstützt und in `.gitignore` aufgenommen.

## Hooks und automatische Gates

- [ ] **F-0110** `.claude/settings.json` existiert und enthält nur nachvollziehbare, dokumentierte Hooks/Permissions.
- [ ] **F-0111** Ein **Stop Hook** verhindert „done“, wenn Pflichtprüfungen für den aktuellen Goal-Scope fehlschlagen oder der Abschlussaudit fehlt.
- [ ] **F-0112** Relevante PostToolUse-/Verification-Hooks führen deterministische Checks aus, wenn betroffene Dateien geändert wurden; sie dürfen nicht bloß LLM-Selbstaussagen akzeptieren.
- [ ] **F-0113** Riskante/destruktive Aktionen erhalten geeignete PreToolUse-/Guard-Regeln; normale Entwicklung darf dadurch nicht unnötig blockiert werden.
- [ ] **F-0114** Hooks haben klare Timeouts, Exit Codes und Fehlermeldungen; kein stiller Failure und kein endloser Hook-Loop.
- [ ] **F-0115** Hook-Verhalten wird selbst getestet: mindestens ein absichtlich fehlschlagender Fixture beweist, dass ein falsches „done“ blockiert wird.

## Plan → Execute → Verify → Learn

- [ ] **F-0120** Jede größere Aufgabe startet mit Branch/SHA, aktivem Browser Entry Point und Owner-Map der betroffenen Verantwortung.
- [ ] **F-0121** Vor Replace/Migrate/Absorb wird der alte aktive Call-Site/Owner benannt.
- [ ] **F-0122** Nach Änderung wird nicht nur der neue Pfad getestet, sondern die Abwesenheit des alten aktiven Owners.
- [ ] **F-0123** Sichtbare Änderungen brauchen echten Runtime-/Browser-Beweis, nicht nur Build/DOM/Unit-Test.
- [ ] **F-0124** Runtime/About/Debug zeigt Commit-/Build-ID; ausgelieferte Instanz und geprüfter Commit sind eindeutig vergleichbar.
- [ ] **F-0125** Multi-Session-/Worktree-/Branch-Arbeit hat einen expliziten Übergabevertrag: Branch, Head SHA, offene Gates, letzte verifizierte Evidence, keine Annahme „die andere Session hat das schon“.

## Lessons ohne zweite Wahrheit

- [ ] **F-0130** Wiederkehrende Prozessfehler werden dauerhaft kodifiziert statt nur im Chat erinnert.
- [ ] **F-0131** Allgemeine Prozess-Lessons werden entweder im Living Skill oder in einer dünnen Lessons-Quelle geführt; es darf **keine zweite konkurrierende Regelwahrheit** neben dem Living Skill entstehen.
- [ ] **F-0132** Ein Lesson-Eintrag braucht Trigger, beobachteten Failure, Ursache, Gegenmaßnahme und Verifikation; keine Motivationssätze/Best-Practice-Sammlung ohne Evidenz.

---

# 0B. Repo-Dorfältester — Graph + Memory + Wiki als ein System

Der Dorfälteste ist **kein Agent, der Architektur erfindet**. Er ist das dauerhafte Erfahrungsgedächtnis des Repos.

Bekannte Donor-/Referenzrollen:

- `Graphify-Labs/graphify` → Struktur-/Beziehungsgraph des Repos.
- `DeusData/codebase-memory-mcp` → persistente codebasebezogene Retrieval-/Memory-Schicht.
- `MemWiki` → lesbare Erfahrungs-/Entscheidungs-/Warum-Schicht. **Das exakte Upstream-Repo muss vor Installation aus der Maintainer-Historie oder expliziter Auswahl gepinnt werden; keinen gleichnamigen GitHub-Treffer erraten.**

Zielbild:

```text
CURRENT REPO / GIT / DOCS / TESTS
          │
          ├── Graphify: WAS hängt womit zusammen?
          ├── codebase-memory-mcp: WAS wissen wir aus früheren Änderungen?
          └── MemWiki: WARUM wurde etwas so entschieden / was scheiterte?
                          │
                          ▼
                 REPO-DORFÄLTESTER
                          │
          ┌───────────────┴────────────────┐
          ▼                                ▼
    PREFLIGHT CONTEXT                  POST-VERIFY MEMORY
    vor Änderung                       nach verifiziertem Ergebnis
```

- [ ] **F-0201** Graph, Memory und Wiki werden als **drei Sichten auf dieselbe Repo-Erfahrung** integriert, nicht als drei konkurrierende Wahrheiten.
- [ ] **F-0202** Source Code, Git-Historie, aktuelle kanonische Dokumente und Tests bleiben Primärevidenz; Memory darf sie nie überschreiben.
- [ ] **F-0203** Jeder Memory-/Graph-/Wiki-Eintrag trägt Herkunft und Freshness (mindestens Commit/Branch/Datei/Entscheidung, soweit zutreffend).
- [ ] **F-0204** Stale oder widersprüchliche Erinnerung wird als solche markiert und gegen aktuellen Code/Kanon reconciled, nicht still verwendet.
- [ ] **F-0205** Keine Secrets, Tokens oder private Credentials in Graph/Memory/Wiki aufnehmen.

## Pflicht-Preflight vor Änderungen

Vor nichttrivialer Änderung soll der Dorfälteste, soweit für den Scope relevant, mindestens liefern:

```text
ACTIVE ENTRY POINT
CURRENT OWNER(S)
DEPENDENCY / RELATION GRAPH
RELEVANT CANONICAL DOCS
RELEVANT PRIOR DECISIONS
RECENT RELATED COMMITS
KNOWN FAILED ATTEMPTS / REGRESSIONS
KNOWN TESTS / VERIFICATION PATH
OPEN CONTRADICTIONS / STALE MEMORY
```

- [ ] **F-0210** Preflight ist bei Architektur-/Ownership-/Migration-/Bug-Tasks verpflichtend.
- [ ] **F-0211** Retrieval ist scopebezogen; nicht das gesamte Projektwissen wird ungefiltert in jeden Prompt gekippt.
- [ ] **F-0212** Der Dorfälteste muss explizit frühere **Fehlversuche** auffindbar machen, nicht nur aktuelle erfolgreiche Architektur.
- [ ] **F-0213** Er muss erklären können, warum ein alter Pfad existiert und ob er aktiv, parked, superseded, donor oder historical ist.
- [ ] **F-0214** Bei widersprüchlichen Erinnerungen eskaliert er zur Primärevidenz statt zu raten.

## Erfahrung nach Verifikation speichern

- [ ] **F-0220** Erst **nach** erfolgreicher Verifikation wird eine Änderung als bewährte Erfahrung gespeichert.
- [ ] **F-0221** Gespeichert werden mindestens Problem/Trigger, relevante Owner, gewählte Lösung, verworfene Alternative(n), Tests/Evidence und resultierender Commit.
- [ ] **F-0222** Bei Replace/Migrate/Absorb werden OLD OWNER, NEW OWNER und entfernte Restpfade gespeichert.
- [ ] **F-0223** Ein später entdeckter Regression-Fall kann frühere „erfolgreiche“ Erfahrung herabstufen/korrigieren; Memory ist versioniert, nicht dogmatisch.
- [ ] **F-0224** Erfolgs-/Fehlerstatistik darf künftige Auswahl priorisieren, aber nie fehlende Evidenz in Wahrheit verwandeln.

## Mechanischer outer loop

SHADED soll hier **nicht „intelligent werden“**. Es übernimmt nur den nützlichen äußeren Lernzyklus:

```text
OBSERVE
  ↓
RETRIEVE EXPERIENCE
  ↓
PREDICT / CHOOSE NEXT ACTION
  ↓
ACT
  ↓
VERIFY
  ↓
STORE VERIFIED EXPERIENCE
```

- [ ] **F-0230** Dieser Loop ist explizit dokumentiert und technisch nachvollziehbar.
- [ ] **F-0231** `VERIFY` ist das Gate zwischen Versuch und dauerhafter Erfahrung.
- [ ] **F-0232** Keine Selbsterzählung/LLM-Zusammenfassung ohne Source/Test-Evidence wird als bewährte Erfahrung gespeichert.

---

# 0C. Living Skill — failure-getriebenes, projektweites Regelgedächtnis

Der bestehende Skill heißt derzeit `.claude/skills/shaded-geometry`, aber **sein Kernprinzip ist nicht auf Geometry beschränkt**. Seine bestehende Struktur ist bereits wertvoll: kleiner stabiler Core, `REFERENCE.md`, wachsendes `RULES.md`, `CORE / LEARNED / CANDIDATE`, Failure-Driven Growth und Gegenproben. Diese Struktur wird zum projektweiten Living Skill generalisiert; Geometry wird ein Fachmodul davon, nicht mehr seine Identität.

## Was erhalten bleiben muss

- [ ] **F-0301** Das bestehende Prinzip `Lerne nicht, weil Wissen verfügbar ist; lerne, weil ein echter SHADED-Failure Wissen vermissen lässt` bleibt kanonisch.
- [ ] **F-0302** Kleiner stabiler CORE statt 17.000-Zeilen-Enzyklopädie bleibt kanonisch.
- [ ] **F-0303** Neue Regeln durchlaufen `CANDIDATE → Originalfall + Gegenproben → LEARNED`; kein direkter Bulk-Import aus Literatur.
- [ ] **F-0304** Jede LEARNED/CANDIDATE-Regel behält Herkunft, Trigger, Tests und Confidence/Evidence.
- [ ] **F-0305** Regeln, die später an Gegenbeispielen scheitern, werden herabgestuft/revidiert/verworfen statt aus Trägheit behalten.

## Generalisieren statt Geometry zerstören

- [ ] **F-0310** `shaded-geometry` wird zu einer projektweiten Living-Skill-Architektur generalisiert/umbenannt; der endgültige Name muss alle Referenzen/Skill-Discovery sauber migrieren. `shaded-living` ist der naheliegende Arbeitsname, aber der Code-/Harness-Vertrag entscheidet die sichere Migration.
- [ ] **F-0311** Die vorhandene Geometry-Denkgrammatik bleibt als **Geometry/Spatial Construction**-Modul erhalten.
- [ ] **F-0312** Der Living Skill darf domain-spezifische Module/Shelves für mindestens Geometry/Spatial Construction, Materials/Surface, Physics, Hydrology, Atmosphere/Light, Vegetation/Life, Reconstruction/Providers, UI/Perception, Performance/Backends und Verification besitzen.
- [ ] **F-0313** Domain-Module teilen denselben Learning-/Evidence-Mechanismus und erfinden keine eigenen konkurrierenden Provenienzsysteme.
- [ ] **F-0314** Ein Failure wird zuerst klassifiziert: fehlende Relation/Operator/Constraint/Materialregel/World Law/Perceptionstrick/Providerentscheidung/Performance-Regel/Verification-Regel etc.; erst danach wird gezielt recherchiert.

## Zwei gekoppelte Loops

Die bestehende Geometry-Grammatik bleibt für räumliches Schließen:

```text
OBSERVE → DECOMPOSE → RELATE → OPERATE → CONSTRAIN → SOLVE → VERIFY
```

Der projektweite Living-Skill-Loop lautet:

```text
OBSERVE FAILURE / NOVEL CASE
        ↓
RETRIEVE: Dorfältester + bestehende RULES + passende Nachschlagewerke
        ↓
IDENTIFY MISSING KNOWLEDGE
        ↓
CANDIDATE RULE / OPERATOR / HEURISTIC
        ↓
APPLY TO ORIGINAL CASE
        ↓
COUNTEREXAMPLES / REGRESSION TESTS
        ↓
VERIFY
  ┌─────┴─────┐
 PASS         FAIL
  │             │
LEARNED       REVISE / DISCARD
  │
STORE IN RULES + DORFÄLTESTER
```

- [ ] **F-0320** Der Living Skill konsultiert zuerst vorhandene Erfahrungen, bevor neue Provider/Spezialcode/Fachliteratur eingeführt werden.
- [ ] **F-0321** Wenn vorhandene Erfahrung nicht reicht, erfolgt **gezielte** Nachschlagewerk-Recherche anhand des konkreten Failures.
- [ ] **F-0322** Mindestens zwei abweichende Gegenproben bleiben Standard für die Promotion einer Candidate Rule, sofern der Regeltyp nicht einen strengeren Test verlangt.
- [ ] **F-0323** Ein positiver Einzelfall ist niemals allein ausreichende Grundlage für LEARNED.
- [ ] **F-0324** Der Dorfälteste speichert die verifizierte Erfahrung; der Living Skill speichert die verallgemeinerbare Regel. Diese Rollen dürfen nicht zu zwei Wahrheiten verschmelzen.

## Nachschlagewerke: problemorientierte Regale, nicht „Geometry-Bibliothek“

Die bestehende `docs/geometry-library/` ist der Anfang, aber das übergeordnete Konzept wird eine **SHADED Reference Library**, geordnet nach Problem/Bedarf. Geometry bleibt ein Regal davon.

Kanonische Problemregale aus der bisherigen Methodik:

```text
CONSTRUCT
PROJECT
INFER
IMPLY
HIDE
DIRECT ATTENTION
VERIFY
ESCALATE
```

Sie werden um weitere SHADED-Bedarfe erweitert, z. B. `MATERIAL RESPONSE`, `FLOW/TRANSPORT`, `STABILITY/CONTACT`, `LIGHT/HEAT`, `LIFE/GROWTH`, `PERFORMANCE/REPRESENTATION`, wenn echte Failures dies verlangen.

- [ ] **F-0330** Bestehende Geometry-Seeds (Architectural Geometry, Shape Grammars, Pattern Design, PCG usw.) bleiben erhalten.
- [ ] **F-0331** Die von Kimi/der Maintainer-Diskussion bereits identifizierten Wahrnehmungs-/Konstruktionsregale werden ausdrücklich aufgenommen: **Scenic Painting/Bühnenmalerei zuerst**, Drawing & Perspective, Descriptive/Architectural Geometry, Set Construction, Matte Painting/VFX und Film/Cinematography.
- [ ] **F-0332** Folgende bereits benannte Nachschlagewerke werden im Bibliotheksindex geführt und nur failure-getrieben konsultiert: Scott Robertson — *How to Draw*; Craig Barron/Mark Cotta Vaz — *The Invisible Art*; David B. Mattingly — *The Digital Matte Painting Handbook*; *The VES Handbook of Visual Effects*; Eran Dinur — *The Filmmaker's Guide to Visual Effects*; Steven D. Katz — *Film Directing: Shot by Shot*.
- [ ] **F-0333** Diese Werke sind **Nachschlagewerke/Index**, nicht automatisch Repo-Volltext. Copyright-/Lizenzstatus wird pro Quelle dokumentiert; keine kommerziellen/restriktiven Bücher illegal spiegeln.
- [ ] **F-0334** Bereits frei/legal gespiegelt vorhandene Primärquellen behalten Source/License/Revision-Metadaten.
- [ ] **F-0335** Neue Literatur wird nicht „vorsorglich komplett gelernt“; sie wird erst bei einem nachgewiesenen Wissensloch gezielt geöffnet.
- [ ] **F-0336** Scenic Painting/Set Construction/Matte Painting/Cinematography werden nicht als bloße Kunstinspiration behandelt, sondern als technische Quellen für **Physical Geometry + Surface Information = Perceived Geometry**, Implikation, Occlusion, Attention, Forced Perspective, Anschluss/Extension und bewusste Repräsentationswechsel.

## Literature-derived Core — derselbe Living-Skill-Mechanismus jenseits von Geometry

Für etablierte Mathematik/Physik ist ein Repo oft nicht die beste Primärquelle. Hier gilt bewusst:

```text
LEHRBUCH / PAPER
      ↓
MATHEMATISCHES VERFAHREN
      ↓
SHADED IR / CORE SEMANTICS
      ↓
CPU / WASM / GPU COMPUTE / NATIVE
      ↓
GEMEINSAMER WORLD STATE
```

- [ ] **F-0337** Die Reference Library führt **Literature-derived Core** als eigene Quellenklasse neben **Implementation-derived Donors**. Bei etablierter Physik wird möglichst direkt zur Literatur gegangen; Donor-Repos bleiben Benchmark/Implementation-Referenz, nicht zwingend Architekturvorlage.
- [ ] **F-0338** Das Physics-Regal wird mit den bereits benannten Seed-Linien indiziert: Christer Ericson — *Real-Time Collision Detection* für Collision/Spatial Queries; Baraff/Witkin + moderne iterative Constraint-Solver-Literatur für Rigid-Body Dynamics/Constraints; Erin Catto — Sequential Impulses für game-orientierte Contact Solver; Müller et al. — Position Based Dynamics für deformierbare/partikelbasierte Materialien; Macklin et al. — XPBD für stabilere Constraints; PBF/PBD als Linie für Fluid-/Unified-Particle-Interaction.
- [ ] **F-0339** Weitere Physics-/Matter-Literatur wird **nicht vorab gesammelt**, sondern failure-getrieben ergänzt, wenn SHADED sie konkret benötigt: granular matter, fracture, soil mechanics, snow, cloth, vegetation mechanics und multiphase coupling. Der Bedarf bestimmt das Regal; kein „Physics Engine Rewrite“-Epic.

## Living Skill ≠ autonomer Architekturautor

- [ ] **F-0340** Der Living Skill darf aus Evidenz Regeln lernen, aber keine Maintainer-Entscheidung, kanonische Semantik oder Provenienzklasse eigenmächtig ersetzen.
- [ ] **F-0341** Gelernte Heuristiken dürfen OBSERVED/MEASURED nicht überschreiben.
- [ ] **F-0342** Eine gelernte Regel ist lokaler Wissensgewinn, kein Vorwand, jeden künftigen Fall in dieselbe Lösung zu pressen.
- [ ] **F-0343** Bei Konflikt gilt: aktuelle Primärevidenz + kanonischer Maintainer-Entscheid > Dorfältesten-Memory > LEARNED-Heuristik > CANDIDATE.

---

# 0D. Foundation Self-Test — bevor World Architecture angefasst wird

- [ ] **F-0401** Eine neue Session kann aus Root-`CLAUDE.md` + scoped Docs/Skills zuverlässig den aktiven Entry Point und die Autoritätshierarchie bestimmen.
- [ ] **F-0402** Dorfältester-Preflight kann für einen bekannten früheren Regression-Fall Owner, relevante Dateien, frühere Entscheidung und Verification Path zurückliefern.
- [ ] **F-0403** Ein absichtlich falscher „done“-Fall wird vom Harness/Stop-Gate blockiert.
- [ ] **F-0404** Ein realer Failure kann durch den Living-Skill-Loop als CANDIDATE erfasst, gegen Originalfall + Gegenproben getestet und sauber LEARNED oder verworfen werden.
- [ ] **F-0405** Der gleiche Fall wird danach vom Dorfältesten als verifizierte Erfahrung wiedergefunden.
- [ ] **F-0406** Keine Foundation-Komponente erzeugt eine zweite Architektur-/World-/Material-Wahrheit.
- [ ] **F-0407** Alle Foundation-Tools können entfernt/neu aufgebaut werden, ohne dass SHADEDs Produkt-Runtime von ihnen technisch abhängig ist; sie sind Development/Knowledge Harness, nicht World Runtime.

## Foundation Definition of Done

Gate 0 ist bestanden, wenn:

1. Claude Code nicht nur weiß, was gelten soll, sondern falsches „done“ deterministisch abfangen kann.
2. Das Repo vor Änderungen seine eigene relevante Geschichte/Struktur/Fehlversuche abrufen kann.
3. Verifizierte Erfahrungen nach Änderungen wieder gespeichert werden.
4. Der bisherige `shaded-geometry`-Mechanismus als **projektweiter Living Skill** funktioniert, ohne seine Geometry-Stärken zu verlieren.
5. Nachschlagewerke problemorientiert und failure-getrieben verfügbar sind, nicht als unkontrollierter Wissensdump.
6. Literature-derived Core und Implementation-derived Donors sind getrennt indexiert und beide durch denselben Evidence-/Learning-Mechanismus nutzbar.
7. Erst danach die eigentlichen SHADED World-/Ownership-/Snowflow-/Surface-Goals beginnen.

## Abschlussnachweis für Foundation

Für **jede** `F-xxxx`-ID:

```text
ID: F-xxxx
DOC: <Datei/Abschnitt oder N/A>
CODE/HARNESS: <aktiver Pfad/Symbol/Config oder N/A>
TEST: <Command/Fixture/Runtime evidence oder N/A>
MEMORY/LEARNING EVIDENCE: <falls relevant>
STATUS: PASS / FAIL / DEFERRED
EVIDENCE: <kurz und konkret>
```

Foundation-relevante Punkte sind **nicht DEFERRED**, wenn ihre Abwesenheit verhindert, dass die nachgelagerten Goals zuverlässig ausgeführt/verifiziert werden können.
