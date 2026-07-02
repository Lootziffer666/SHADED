# Runde 4 – Interaktion & Ökosystem: Requirements

## Einleitung

Die Szene wird begehbar und reagiert auf den Betrachter. Alle interaktiven
Ideen des eingefrorenen Prototyps (Spieler, Trampelpfade, Lagerfeuer,
Partikel-Ökosystem, Bio-Charakter) werden auf der SHADED-Architektur neu
gebaut. Kernstück ist die bislang reservierte **Trail-/Störungstextur auf
Texture-Unit 5** – der einzige veränderliche Zustand der Welt.

## Anforderungen (EARS)

### R1 – Trail-Textur (Fundament)
Das System **SOLL** eine 512²-RGBA-Trail-Textur führen (Unit 5):
R = transiente Störung (Fußabdruck/Schneedelle), G = Impuls (Schütteln),
B = permanenter Trampelpfad, A = Hitze/Brandspur.
**WÄHREND** jedes Frames **SOLL** R/G mit echtem, verifiziert wirksamem Decay
abklingen (getestet: Wert halbiert sich in ≤ 2 s) – NICHT das Screen-Composite-
Muster des Prototyps. B ist permanent, A klingt sehr langsam ab.

### R2 – Spieler
**WENN** WASD/Pfeiltasten gedrückt werden **DANN SOLL** eine Spielfigur
(Canvas-2D-Overlay, deckungsgleich zum GL-Canvas!) sich materialabhängig
bewegen (`SHADED.getMaterialTypeAt`: Gras langsamer, Eis rutschig) und
Fußspuren in R/B schreiben. Leertaste = Dash mit Laub-/Wasser-Stoß (G-Impuls).
Der Spieler ist optional: ohne Tastendruck bleibt SHADED reines Ambient-Stück.

### R3 – Trampelpfade
**WÄHREND** B-Werte steigen **SOLL** der Shader Gras zu Matsch abdunkeln
(Runde-1-Nässe-Logik wiederverwenden) und bei hohem B die Grass-Maske lokal
Richtung path-Verhalten verschieben (Pfützenfähig!).

### R4 – Lagerfeuer & Brand
**WENN** per Feuer-Tool (Button + **funktionierender Click-Handler** auf dem
Canvas, korrekt koordinaten-gemappt) ein Feuer gesetzt wird **DANN SOLL** es:
Licht wie ein Fenster emittieren (Emissiv-Komposition zur Laufzeit), Rauch-
und Funkenpartikel erzeugen, Schnee im Umkreis schmelzen (A-Kanal) und sich
**WENN** `wet < 0.3` auf wood/roof/foliage ausbreiten; Nässe/Regen löschen.

### R5 – Partikel-Ökosystem
Laub, Früchte und Grasbüschel **SOLLEN** als Canvas-2D-Partikel existieren,
die auf Wind (`wind`-Parameter), Dash, Schütteln und Material reagieren –
Positionen ausschließlich via `SHADED.getMaterialTypeAt` validiert.

### R6 – Bio-Charakter
Die Spielfigur **SOLL** Atmung (Frequenz ∝ Anstrengung), Frost-Atemdampf
(`temperature < 5 °C`), Nässe-Zustand und einfache Alterung zeigen –
als Canvas-2D-Rendering, Parameter über `SHADED.setParams`-Erweiterung.

### R7 – Integration & Regression
- Kino-Modus ohne Eingaben bleibt exakt das Runde-1-3-Erlebnis.
- Overlay-Canvas wird in PNG-Snapshot & WebM-Aufnahme mit-komponiert.
- `verify.js` erhält einen Interaktionstest (simulierte Tastendrücke →
  Trampelpfad sichtbar, Decay messbar).
