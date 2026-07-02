# Runde 3 – Material Fatigue & Verfall: Requirements

## Einleitung

Der bestehende `decay`-Parameter (Runde 1: Moos + Überwucherung + Entsättigung)
wird zu einem kontinuierlichen, materialabhängigen Zeitprozess ausgebaut.
Referenzbild: `1782826101420.png` (überwuchertes Dorf). Verfall soll erzählbar
sein: eine Szene kann in Echtzeit vor den Augen des Betrachters altern.

## Anforderungen (EARS)

### R1 – Materialabhängige Verfallskurven
**WÄHREND** `decay` steigt **SOLLEN** Materialien in realistischer Reihenfolge
altern: Holz zuerst (vergraut, wirft Splitter-Textur), dann Dächer (Moos,
fehlende Ziegel als dunkle Lücken), dann Pfad (Überwucherung von den Rändern,
Distanzfeld `phys.a` steuert die Front), Fels zuletzt (nur Flechten).
Fenster verlieren ihr Licht (`glow`-Dämpfung) ab `decay > 0.6`.

### R2 – Feuchte-Kopplung
**WENN** `wet > 0.5` über längere Storyboard-Zeit **DANN SOLL** Mooswachstum
beschleunigt sichtbar werden (Nässe × Verfall-Interaktion, kein separater Pfad).
**WENN** `bleach > 0` (Runde 2) **DANN SOLL** Verfall als Ausbleichen statt
Bemoosung erscheinen (trockenes Klima).

### R3 – Strukturelle Erzählung
**WENN** `decay > 0.75` **DANN SOLLEN** erzählende Details erscheinen:
Risse (dünne dunkle Linien entlang Luminanz-Kanten), durchhängende Dachlinien
(vertikaler Domain-Warp auf der Dachmaske), Ranken an Fassaden (noise-gesteuerte
vertikale Strähnen auf Wandflächen).

### R4 – Zeitraffer-Akt
Es **SOLL** ein Akt `zeitraffer` existieren, der `decay` über die Akt-Dauer
kontinuierlich von 0 auf 1 fährt (Storyboard-Feature „animierter Parameter
innerhalb eines Schritts“), begleitet von Jahreszeiten-Flackern (Runde 2).

### R5 – Integration & Regression
- Kein neuer Textur-Slot; alles aus vorhandenen Masken + `phys` ableiten.
- `verify.js`-Screenshot `shot_verfall.png` wird gegen `1782826101420.png`
  bewertet; Runde-1/2-Akte bleiben bei `decay=0` unverändert.
