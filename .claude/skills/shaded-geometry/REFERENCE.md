---
name: shaded-geometry
description: AKTIV. Vollständige Methodik zum kurzen Eintragspunkt in SKILL.md — Denkgrammatik (OBSERVE→…→VERIFY), Relations-/Operatorvokabular, Vier Wahrheiten, Constraint-Value-Heuristik, Perceptual Geometry, PREPARE FOR EXTENSION, die Drei Wissenszustände und der Failure-Driven-Growth-Loop, ein nach Problem statt Fachgebiet sortiertes Seed-Curriculum.
---

# SHADED Geometry — vollständige Methodik

## 0. Herkunft und Selbstbeschränkung

Entstanden aus einer langen Maintainer-Diskussion darüber, warum „Geometry
Skill" als Suchbegriff fast nur unbefriedigende Treffer liefert: Das gesuchte
Feld verteilt sich auf Architectural Geometry, Shape Grammars, Procedural
Modeling, Form-Finding, Generative Design, Matte Painting/VFX und Set-Design —
und der eigentliche Fund war nicht „mehr Fachliteratur laden", sondern eine
**Denkgrammatik mit einem failure-getriebenen Wachstumsmechanismus**.

Ausdrücklich **nicht** das Ziel: ein Skill mit 800 Definitionen, der nach drei
Wochen aus 17.000 Zeilen „Best Practices" besteht, in denen das Modell die eine
tatsächlich nötige Regel nicht mehr findet. Deshalb bleibt dieser Skill klein
und stabil; alles Zusätzliche wandert in `RULES.md` — und zwar nur dort hinein,
nachdem es an einem echten SHADED-Fall bewiesen wurde (Abschnitt 6).

## 1. Die Denkgrammatik

Nicht:

```text
roof   = triangle
wall   = rectangle
tree   = cylinder + sphere
```

Sondern:

```text
OBSERVE
  Welche Formen sind tatsächlich sichtbar?

DECOMPOSE
  Punkte · Kanten · Kurven · Flächen · Volumen ·
  Wiederholungen · Symmetrien · Übergänge

RELATE
  siehe Relationsvokabular (2.1)

OPERATE
  siehe Operatorvokabular (2.2)

CONSTRAIN
  Was MUSS wahr bleiben?

SOLVE
  Welche Geometrie erfüllt möglichst viele beobachtete
  Relationen gleichzeitig?

VERIFY
  Closure · Reprojection · Occlusion · Support · Continuity
  (siehe shaded-spatial-primitive-solver: Rückprojektionsfehler
  ist PFLICHT-Beweis, kein optionaler Schritt)

── erst danach ──

INFER / GENERATE
```

Der Kernsatz dahinter: **Lerne, warum eine Form so ist, wie sie ist, und
welche Operationen aus beobachteten Relationen wieder zu dieser Form führen.**
Nicht: lerne Objektlabels.

### 1.1 Relationsvokabular

```text
parallel · orthogonal · koplanar · getragen von (supported-by) ·
schneidet (intersects) · begrenzt (bounds) · verdeckt (occludes) ·
setzt sich fort (continues) · wiederholt sich (repeats) ·
symmetrisch zu (symmetric-to)
```

### 1.2 Operatorvokabular

```text
project · intersect · extrude · offset · sweep · loft · fold ·
split · trim · mirror · repeat · subdivide · relax · grow
```

Diese Verben sind der Prüfstein für jede neue geometrische Konstruktionsidee:
Lässt sie sich als Komposition dieser Operatoren auf beobachteten Relationen
beschreiben? Wenn nicht, fehlt entweder ein Operator (→ CANDIDATE-Kandidat,
Abschnitt 6) oder die Idee ist ein Spezialfall-Hack und gehört nicht in diesen
Skill.

## 2. Vier Wahrheiten (eine Linse, keine neue Provenienzklasse)

`shaded-reconstruction` definiert die verbindlichen Provenienzklassen
(`MEASURED/OBSERVED/RECONSTRUCTED/INFERRED/GENERATED/USER_APPROVED`). Die
folgenden vier Wahrheiten sind **kein** Ersatz oder Zusatz dazu, sondern eine
Analyse-Linse, die erklärt, WOZU eine gegebene Provenienzklasse in einem
konkreten Fall gebraucht wird:

```text
PHYSICAL TRUTH
  Was müsste real geometrisch existieren?
  → treibt MEASURED / RECONSTRUCTED.

PROJECTIVE TRUTH
  Was muss aus DIESER Kamera korrekt erscheinen?
  → Prüfkriterium für RECONSTRUCTED: Rückprojektionsfehler
    (siehe shaded-spatial-primitive-solver, Schritt 7 PFLICHT-Beweis).

PERCEPTUAL TRUTH
  Was muss der Betrachter glauben?
  → rechtfertigt, wann INFERRED/GENERATED genügt oder sogar
    KEIN Geometrie-Artefakt nötig ist (Abschnitt 4).

EXTENSION TRUTH
  Welche Struktur muss der vorhandene (gebaute) Teil besitzen,
  damit ein später GENERIERTER Teil konsistent daran anschließt?
  → Prüfkriterium für alles, was heute MEASURED/RECONSTRUCTED
    gebaut wird, aber morgen erweitert werden soll (Abschnitt 5).
```

Ein Matte Painter fragt nicht „existiert hinter dem Berg wirklich ein
vollständiges Tal?", sondern „sagt der sichtbare Ausschnitt: da geht die Welt
weiter?" — das ist PERCEPTUAL TRUTH, nicht PHYSICAL TRUTH, und beide sind für
SHADED legitime, unterschiedlich einzusetzende Werkzeuge.

## 3. Constraint-Value-Heuristik

Nicht: „welche Fläche kann ich am leichtesten bauen?"
Sondern: „welches bekannte Element reduziert die Unsicherheit des Rests am
stärksten?"

```text
CONSTRAINT VALUE (grob, aufsteigend)
  ein isolierter Punkt        → niedrig
  eine lange gerade Kante     → mittel
  zwei parallele Kanten       → höher
  eine Wandecke                → hoch
  First + zwei Traufen         → sehr hoch
  ein geschlossener Footprint  → extrem hoch
```

Regel: erst die hoch-constrainten Elemente lösen (z. B. bei einem Satteldach
First + beide Traufen + Wandebenen), dann daraus den Rest ableiten — nicht
jede Teilfläche einzeln erraten. Das ist dieselbe Logik, die
`shaded-reconstruction`s Prioritätskette „gemessen > multiview-rekonstruiert >
engine-bekannt > geführt geschätzt > monokular geschätzt" auf Element- statt
Provider-Ebene anwendet.

## 4. Perceptual Geometry — was implizit bleiben darf

> Do not construct what can be reliably implied — aber nur, wenn die
> Implikation den tatsächlichen Bedarf erfüllt.

Werkzeuge, die Geometrie ersetzen können, ohne die Wahrnehmung zu brechen:

```text
OCCLUSION    kann Informationsmangel verdecken
FOG          kann fehlende Ferndetails legitimieren
SHADOW       kann Geometrie implizieren, ohne sie zu zeigen
SILHOUETTE   kann komplexe Oberfläche ersetzen
REFLECTION   kann Raum außerhalb der Kamera suggerieren
DEPTH OF FIELD  kann Detailanforderung lokal reduzieren
LIGHTING     kann Form beschreiben, ohne sie vollständig zu zeigen
```

Bedarfsgesteuerte Wahrnehmungs-LOD (nicht Dreiecks-LOD):

| Bedarf              | zulässige Darstellung        |
|----------------------|-------------------------------|
| nur Silhouette        | Proxy                        |
| reiner Hintergrund    | Matte / Splat / Card         |
| Parallaxe             | Card-Stack / grobe Geometrie |
| wirft Schatten        | Shadow-Proxy                 |
| wird reflektiert      | Reflection-Proxy             |
| begehbar/kollidierbar | echte Oberfläche/Kollisionsgeometrie |
| Physiksimulation      | echte Kollisionsgeometrie    |
| Nahaufnahme           | detaillierte Geometrie       |

Dieselbe Tabelle beantwortet in SHADED konkret: eine entfernte, stark
gegliederte Fassade darf zunächst über Silhouette + wiederholte
Fensterfrequenz + Occlusion repräsentiert werden. Bricht die Illusion später
(näherer Blickwinkel, Kollision, Reflexion), eskaliert genau dieser Bedarf
die Repräsentation — nicht ein pauschaler Vollständigkeitsanspruch von Anfang
an. Ergebnis-Artefakte aus dieser Eskalation bleiben `INFERRED`/`GENERATED`,
nie `MEASURED`.

## 5. PREPARE FOR EXTENSION

Der physische/gebaute Teil ist kein bloßer Content-Container, sondern ein
**Constraint-Generator** für alles, was später daran anschließt (Set-Builder-
Denken statt „baue wenig, KI füllt den Rest"):

```text
BUILD    was jetzt physisch/gemessen nötig ist
  +
PREPARE  welche Constraints die Erweiterung braucht:
         Fluchtlinien, Anschlusskanten, Materialübergänge,
         Maßstab, Lichtquellen/Schattenrichtung, tragende Logik,
         Fenster-/Fassadenrhythmus, mögliche Kamera-/Blickachsen,
         zulässige Occluder, Stellen für den Repräsentationswechsel
  +
HIDE     wo genau der Wechsel zwischen den Repräsentationen liegt
```

Praktische Konsequenz für Rekonstruktion in SHADED: beim Stabilisieren einer
teilweise sichtbaren Struktur zuerst jene Elemente lösen, die den größten
Constraint Value haben (Abschnitt 3) — sie sind es, an denen sich alles
Fehlende später korrekt „aufhängt". Eine Erweiterung, die diese Anschlusspunkte
verletzt, ist ein Fehler, keine Geschmacksfrage.

**Konkretes Beispiel für das PREPARE-Vokabular:**
[`docs/village-site-plan-reference/site-plan-de-anschluss.png`](../../../docs/village-site-plan-reference/site-plan-de-anschluss.png)
(eigenes Referenzbild, siehe README dort) benennt genau diese abstrakten
Begriffe konkret an einem Village-Site-Plan: `ANSCHLUSS NORD-WEST` /
`ANSCHLUSS SÜD-WEST` für Fluchtlinien/Anschlusskanten, eine
`Y-FÖRMIGE HAUPTINFRASTRUKTURTRASSE` als tragende Erschließungslogik, ein
`ORIENTIERUNGS-/INFORMATIONSSIGNAL` als Blickfang-/Referenzpunkt. Kein
Rekonstruktions-Fixture (die Lösung steht als Text im Bild) — eine
Notation-Referenz dafür, wie „Constraint-Generator für den unbebauten Rest"
in einem echten Site-Plan aussieht.

## 6. Drei Wissenszustände und der Failure-Driven-Growth-Loop

```text
GEOMETRY CORE (klein, stabil)
  Abschnitte 1–5 dieses Dokuments + Seed-Vokabular in RULES.md
        │
        ▼
   Versuch an echter SHADED-Szene
        │
   funktioniert?
    ┌───┴────┐
   ja       nein
    │         │
 nichts    FAILURE CASE
 lernen       │
              ▼
     Was fehlt konkret?
     ├─ Operator?
     ├─ Relation?
     ├─ Formprinzip?
     ├─ Projektion?
     └─ Konstruktionsregel?
              │
              ▼
      gezielte Recherche (Abschnitt 7 als Suchraum,
      nicht als Pflichtlektüre)
              │
              ▼
       CANDIDATE RULE
              │
              ▼
   Originalfall + Gegenproben (mind. 2 abweichende
   Szenen/Formen, die die Regel NICHT falsch triggern
   darf)
        ┌─────┴─────┐
      PASS          FAIL
        │             │
   RULES.md +=     verwerfen
   LEARNED-Regel    oder überarbeiten
```

Jede `LEARNED`- oder `CANDIDATE`-Regel in `RULES.md` trägt Herkunft:

```yaml
id: <slug>
tier: LEARNED | CANDIDATE
statement: <ein Satz, was die Regel besagt>
trigger: <welche Beobachtung/Situation sie auslöst>
learned_from:
  - <SHADED-Fall-ID oder kurze Beschreibung>
tests:
  - <Gegenprobe 1>
  - <Gegenprobe 2>
confidence: <0.0–1.0>
```

`CORE` bekommt keine `learned_from`-SHADED-Fälle, sondern `source: seed` plus
Verweis auf Abschnitt 7 — es ist bewusst nicht failure-getrieben, sondern das
Fundament, gegen das Failures überhaupt erkannt werden können.

**Harte Regel:** kein Eintrag wandert direkt von „einmal recherchiert" nach
`LEARNED`. Ohne bestandene Gegenproben bleibt er `CANDIDATE` — ein Zustand, der
schon einmal funktioniert hat, aber noch nicht genug Gegenbeispiele überlebt
hat. Das ist die Sperre gegen unkontrolliertes Literatur-Bulk-Wachstum.

## 7. Seed-Curriculum nach Problem, nicht nach Fachgebiet

Regale nicht nach Disziplin (Architektur/Zeichnen/Film/VFX), sondern nach dem
Problem, das sie lösen. Das ist der Suchraum für Schritt „gezielte Recherche"
in Abschnitt 6 — **kein Pflicht-Leseplan, keine Enzyklopädie**:

```text
CONSTRUCT          Wie wird Form aus einfachen Relationen aufgebaut?
PROJECT             Wie wird 3D auf 2D abgebildet und zurückgelesen?
INFER                Welche Form wird durch unvollständige Evidenz nahegelegt?
IMPLY                Wie suggeriert man Form, ohne sie vollständig zu zeigen?
HIDE                 Wie verbirgt man notwendige Vereinfachungen?
DIRECT ATTENTION     Wie verhindert man, dass die Schwachstelle untersucht wird?
VERIFY               Wann bricht die Illusion?
ESCALATE             Wann reicht Implikation nicht mehr; wann wird echte
                     Geometrie nötig?
```

Sechs Seeds — bewusst klein gehalten, nicht vierzig Bücher. Alle lokal
gespiegelt in [`docs/geometry-library/`](../../../docs/geometry-library/README.md)
(Volltext, Lizenz und Download-Herkunft je Werk dokumentiert):

```text
SEED 1  MIT OCW „Geometric Disciplines and Architecture Skills:
        Reciprocal Methodologies" (4.105) → räumliche Grundoperationen
        (Descriptive Geometry/Projection, Planar Intersections + Folding,
        Curvature, Solid/Surface, Stereotomy/Developability)
        Lokal: mit-ocw-4105-geometric-disciplines/
SEED 2  Pottmann, Eigensatz, Vaxman & Wallner — Architectural Geometry
        (Survey-Paper, nicht das kommerzielle Buch — Autoren-Self-Archiving)
        + Pottmann & Wallner — Geometry and Freeform Architecture (2016)
        → Projektion, Ebenenbeziehungen, Schnitt, Offset, Extrusion,
        Flächenfamilien, konstruktive Formbildung
        Lokal: pottmann-architectural-geometry-survey/
SEED 3  MIT OCW „Introduction to Shape Grammars I" (4.540, George Stiny) —
        Introductory Lecture Slides. **Nicht** das Buch *Shape: Talking
        about Seeing and Doing* selbst: der einzige „freie" Zugang darüber
        ist ein Controlled-Digital-Lending-Leihexemplar auf archive.org
        (`access-restricted-item: true`), keine frei verteilbare Kopie —
        siehe `docs/geometry-library/README.md`.
        → see → decompose → relate → reinterpret → transform;
        Shape Rules statt Objektlabels; Mehrdeutigkeit ist kein Fehler
        Lokal: mit-ocw-4540-shape-grammars/
SEED 4  Lewis F. Day — Pattern Design (1903, public domain)
        → lokale Regeln → komplexe wiederholte Gestaltung
        Lokal: pattern-design-day-1903/
SEED 5  eine Dot-to-Dot-Progression (Abschnitt 8) → Sparse Evidence →
        Structure (konzeptionell, kein einzelnes freies Werk zum Spiegeln
        gefunden)
SEED 6  Shaker, Togelius & Nelson — Procedural Content Generation in Games
        (alle 12 Kapitel, Autoren-Finalfassung frei auf pcgbook.com) —
        vom Maintainer selbst als „Kapitel 4 fast Pflicht" markiert
        (Fraktale/Noise für Terrain, Kapitel 5: Grammars/L-Systems für
        Vegetation/Level)
        Lokal: procedural-content-generation-in-games/
```

Erweiterungskandidaten, ausdrücklich **nicht** vorab geladen, sondern erst
zugreifbar, wenn Abschnitt 6 sie konkret verlangt (Public-Domain-Grundlagen-
texte zu deskriptiver Geometrie und Perspektive liegen bereits lokal vor,
siehe `docs/geometry-library/README.md`: Minifie 1867, Pozzo 1707,
Jamnitzer 1568 — aber ohne eigenen SEED-Rang, weil sie nicht aus dem
ursprünglichen Auftrag stammen, sondern zusätzlich beim Aufbau der
Bibliothek gefunden wurden):

- Reas/McWilliams/LUST — *FORM+CODE* — wenn parametrische/prozedurale
  Operationen (repeat/transform/grow/simulate) fehlen.
- Tedeschi — *AAD: Algorithms-Aided Design* — wenn Form-Finding
  (constraints → parameters → solver → geometry) bei Dächern/Bögen/
  Gewölben gebraucht wird.
- Iwamoto — *Digital Fabrications* (Sectioning/Tessellating/Folding/
  Contouring/Forming) — wenn ein komplexes Dach nicht als Sonderfall,
  sondern als Operatorkette zerlegt werden muss.
- Müller et al. — *Procedural Modeling of Buildings* (CGA Shape Grammar) —
  wenn Fassade/Dach/Unterteilung/Wiederholung strukturell ansteht.
- *Advances in Architectural Geometry*-Proceedings — Fallstudienpool für
  ungewöhnliche Dächer/Ruled Surfaces/Panelisierung, kein Lehrbuch.
- Gips — *Shape Grammars and their Uses* — wenn aus einem beobachteten
  Teilstück eine zulässige Formklasse ohne festes Objektmodell entstehen muss.
- Robertson — *How to Draw* — für das unbewusste Experten-„Warum sieht das
  sonst falsch aus?" bei Primitive → Perspektive → Volumen → Konstruktion.
- Matte-Painting/VFX/Set-Design (Vaz & Barron *The Invisible Art*,
  Mattingly *Digital Matte Painting Handbook*, *VES Handbook of Visual
  Effects*, Dinur *The Filmmaker's Guide to Visual Effects*) — Quelle für
  Abschnitt 4 (IMPLY/HIDE/DIRECT ATTENTION), erst bei konkretem
  Occlusion-/Implikations-Failure.
- Theatre-Set-Design/Forced-Perspective-Literatur — Quelle für Abschnitt 5
  (PREPARE FOR EXTENSION), erst bei konkretem Erweiterungs-Failure.

## 8. Sparse-Evidence-Progression (die „Grundschule")

Dot-to-Dot ist hier kein Scherz: Es reduziert eine Welt auf diskrete
Beobachtungen und stellt exakt die Frage, um die es in Abschnitt 1 geht —
„welche Beziehungen zwischen Beobachtungen ergeben eine sinnvolle Struktur?"

```text
LEVEL 0  Punkte + Reihenfolge gegeben        → Verbindung herstellen
LEVEL 1  Punkte, keine Reihenfolge           → Kontur rekonstruieren
LEVEL 2  Punkte + Distraktoren               → relevante Punkte auswählen
LEVEL 3  Punkte + Lücken                     → fehlende Verbindung inferieren
LEVEL 4  mehrere plausible Verbindungen      → Constraints benutzen
LEVEL 5  teilweise verdeckte Form            → sichtbare/generierte Struktur trennen
LEVEL 6  mehrere Flächen derselben Struktur  → 3D-Relation rekonstruieren
LEVEL 7  Punktwolke                          → willkommen bei SHADED
```

Diese Leiter ist der Prüfstein für neue `CANDIDATE`-Regeln: eine Regel, die
nur bei vollständiger, unverdeckter, geordneter Evidenz funktioniert (Level 0),
aber bei SHADEDs echten Bildern (typischerweise Level 5–7) bricht, hat den
Failure-Driven-Growth-Loop nicht bestanden.

## 9. Geometry-Gym (CANDIDATE-Werkzeug, noch nicht gebaut)

Idee für automatisch skalierbare Gegenproben, damit Abschnitt 6 nicht auf
seltene echte SHADED-Failures warten muss: aus einer bekannten Form (Haus,
Dach, Stuhl, Brücke, Treppe, Baum, Bogen, Gewölbe) vollständige Geometrie
erzeugen, Punkte sampeln, gezielt Anteile entfernen/verdecken/mit Ausreißern
versehen/die Reihenfolge löschen/die Projektion ändern, und prüfen, ob eine
Regel die Struktur zurückfindet oder nur die sichtbare Kontur reproduziert.
Explizit als **CANDIDATE**, nicht `CORE`: erst bauen, wenn Abschnitt 6 wegen
zu weniger echter Gegenproben tatsächlich blockiert.

## 10. Integrationsregeln

1. Keine zweite Provenienzklasse neben `shaded-reconstruction`s
   `MEASURED/OBSERVED/RECONSTRUCTED/INFERRED/GENERATED/USER_APPROVED` — die
   vier Wahrheiten (Abschnitt 2) sind Analyse-Linse, keine neue Kategorie.
2. Keine zweite Materialwahrheit neben `classGrid`/`getMaterialTypeAt`
   (Invariante 2) — dieser Skill erzeugt ausschließlich Geometrie-Hypothesen.
3. `RULES.md` wächst ausschließlich über den Loop in Abschnitt 6. Kein
   direkter Import einer Buchregel ohne bestandene Gegenprobe an einer
   echten SHADED-Szene.
4. Ein `CANDIDATE`-Eintrag, der bei einer neuen Gegenprobe scheitert, wird
   überarbeitet oder entfernt — er bleibt nicht als „vielleicht doch"
   liegen.
5. Perceptual-Geometry-Entscheidungen (Abschnitt 4) sind an den tatsächlichen
   Bedarf gebunden (Tabelle), nicht an Bequemlichkeit — „begehbar" oder
   „kollidierbar" erzwingt immer echte Geometrie, unabhängig davon, wie gut
   eine Implikation aussähe.
6. Neue Verweise auf `shaded-spatial-primitive-solver`, `shaded-reconstruction`
   oder `shaded-sdf` bleiben Verweise, keine Kopien ihrer Algebra/Verträge.

## 11. Vor jeder geometrischen Konstruktion / jedem Skill-Wachstum prüfen

- Lässt sich die Konstruktion als OBSERVE→…→VERIFY beschreiben, oder ist sie
  ein Objektlabel-Shortcut (`roof = triangle`)?
- Welche Elemente haben den höchsten Constraint Value — sind die zuerst
  gelöst?
- Genügt Implikation (Abschnitt 4) für den tatsächlichen Bedarf, oder
  erzwingt der Bedarf echte Geometrie?
- Falls später erweitert wird: welche Anschluss-Constraints muss der jetzt
  gebaute Teil tragen (Abschnitt 5)?
- Bei einem Failure: was genau fehlt — Operator, Relation, Formprinzip,
  Projektion oder Konstruktionsregel?
- Hat eine neue Regel den vollständigen Loop (Abschnitt 6) inklusive
  Gegenproben durchlaufen, bevor sie nach `LEARNED` wandert?
- Verletzt nichts Invariante 2 oder die bestehende Provenienzarchitektur
  (Abschnitt 10)?
