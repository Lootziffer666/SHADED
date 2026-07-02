# Runde 2 – Jahreszeiten & Klima: Requirements

## Einleitung

SHADED bekommt ein Klima-System: Temperatur und Jahreszeit werden High-Level-
Parameter im Stil der bestehenden 9 (alle 0..1 bzw. °C), vollständig in Akte
und Storyboard integriert. Die Effekte des eingefrorenen Prototyps (Schnee,
Eis, Herbst, Frühling, Sonnenbleiche) werden NEU auf der Runde-1-Architektur
implementiert – nicht kopiert.

## Anforderungen (EARS)

### R1 – Schneedecke
**WENN** `snow > 0` **DANN SOLL** das System Schnee materialabhängig akkumulieren:
Dächer und Gras zuerst (volle Deckung ab `snow ≥ 0.8`), Pfade später und
fleckig, Wasser-/Pfützenflächen gar nicht (sie gefrieren stattdessen, R3).
Die Schneedecke nutzt die vorhandenen Masken-Texturen; keine neue Klassifikation.

### R2 – Schneefall
**WENN** `snowfall > 0` **DANN SOLL** ein mehrschichtiges Parallax-Flockensystem
(analog Regenschlieren, aber träge, windverdriftet, taumelnd) rendern.
**WENN** gleichzeitig `rain > 0` **DANN SOLL** Schneeregen entstehen (beide gedimmt).

### R3 – Frost & Eis
**WENN** `temperature < 0 °C` **DANN SOLLEN** Pfützen und Wasserflächen zu Eis
werden: heller, matter Spiegel mit Frostmuster statt Ripples; Warmlicht-
Reflexionen bleiben, aber gedämpft und statisch.
**WÄHREND** `temperature < 0` **SOLL** Nebel zu Bodennebel/Atemdunst-Optik wechseln.

### R4 – Herbst
**WENN** `autumn > 0` **DANN SOLLEN** foliage- und grass-Masken hue-verschoben
werden (grün → gold/rot, noise-variiert pro Baumkrone) und ein Laubfall-
Partikellayer (Shader, analog Schneefall) aktiv sein. Gefallenes Laub sammelt
sich sichtbar an Pfadrändern (Bleed-Halo aus `phys.b` wiederverwenden).

### R5 – Frühling & Sonnenbleiche
**WENN** `bloom > 0` **DANN SOLLEN** Blütenakzente auf grass/foliage sprenkeln.
**WENN** `bleach > 0` **DANN SOLL** die Szene material-gewichtet entsättigen
und aufhellen (Dächer/Holz stärker als Vegetation).

### R6 – Integration
- Alle neuen Parameter erscheinen automatisch als Experten-Slider und Uniforms
  (PARAMS/PARAM_META-Mechanik) und sind in `window.SHADED.setParams` verfügbar.
- Es gibt mindestens zwei neue Akte (z. B. „Erster Schnee“, „Goldener Herbst“)
  und ein saisonales Beispiel-Storyboard.
- `tools/verify.js` erhält Screenshots der neuen Akte; Verifikation gemäß
  Steering `visual-verification.md`.

### R7 – Regression
Die Runde-1-Akte (tag, aufzug, sturmnacht, morgen, danach, verfall) müssen
pixel-stimmungsgleich bleiben, solange alle neuen Parameter 0 sind.
