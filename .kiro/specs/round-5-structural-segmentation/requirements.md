# Runde 5 – Strukturelle Segmentierung: Requirements

## Einleitung

Rein farbbasierte Heuristik verwechselt zwangsläufig Materialien, die gleich
aussehen, aber strukturell verschieden sind (Taverne: holzfarbene Terrasse ↔
sandfarbener Pfad). Runde 5 gibt der Analyse Geometrie- und Nachbarschafts-
verständnis: **Wo etwas liegt, entscheidet mit, was es ist.** Ziel bleibt das
Owner-Versprechen: jedes Bild automatisch so gut wie das Dorf – das Overlay
nur noch als Feinschliff.

## Leitprinzipien

- Struktur-Regeln korrigieren die Farb-Heuristik, ersetzen sie nicht.
- Marker/Map-Overlays behalten IMMER das letzte Wort (Nutzer-Ansage).
- Jede Regel muss auf allen drei Referenzszenen (Dorf neu, Dorf legacy,
  Taverne) verifiziert werden – Verbesserung an einer darf keine andere brechen.

## Anforderungen (EARS)

### R1 – Bodenanker für begehbare Flächen (Inkrement 1)
**WENN** eine als Pfad klassifizierte Zusammenhangskomponente in ihrer
Nachbarschaft (Ring, Konturlinien ignoriert) von Dach dominiert wird und
kaum Gras-/Wasserkontakt hat, **DANN SOLL** sie als Gebäudeoberfläche
(Fels) reklassifiziert werden. Wasser-Karten (Pfützen-Chamfer, Flussfeld,
Bleed) **SOLLEN** ausschließlich aus geerdetem Pfad entstehen.

### R2 – Gebäudezonen aus Dach-Saat
**WENN** Dach-Komponenten existieren, **DANN SOLL** eine Gebäudezonen-Maske
entstehen (Dächer + baulich verbundene Wand-/Holz-/Fensterflächen).
**WÄHREND** eine Zone aktiv ist, **SOLLEN** dort keine Pfützen, Rinnsale,
Trampelpfad-Effekte oder Pfad-Überwucherung gerendert werden; Tropfkanten
und Fensterlichter bleiben.

### R3 – Wand/Boden-Trennung in verbundenen Komponenten
**WENN** Wand und Bodenpfad farblich in EINER Komponente verschmelzen
(Dorf: Cremewände + Sandpfad), **DANN SOLL** ein lokaler Kontext-Test
(Dach/Holz-Anteil ober-/unterhalb) Wandpixel von Bodenpixeln trennen,
sodass Wände keine Pfützentiefe erhalten.

### R4 – Fenster-Plausibilität über Gebäudezonen
Fenster-Kandidaten **SOLLEN** innerhalb bzw. am Rand einer Gebäudezone
liegen; Kandidaten im Freien werden verworfen (ersetzt die bisherigen
lokalen Fassaden-Votings, wo die Zone verfügbar ist).

### R5 – Diagnose & Regression
`window.SHADED` **SOLL** eine Strukturdiagnose liefern (Komponenten- und
Reklassifikationszähler). `tools/verify.js` **SOLL** pro Referenzszene
Klassenzählungen loggen; Abweichungen > 10 % gegen den eingecheckten
Erwartungswert gelten als Regression.
