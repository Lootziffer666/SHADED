---
name: shaded-visual-verify
description: Pflicht-Workflow zur visuellen Verifikation von SHADED nach jeder Shader- oder Analyse-Änderung – headless Screenshots aller Akte erzeugen und gegen die Zielbilder im Repo vergleichen. Ohne bestandenen Durchlauf wird nicht committet.
---

# SHADED visuell verifizieren

## Ablauf

```bash
npm i playwright           # einmalig; NICHT committen (.gitignore deckt das ab)
node tools/verify.js       # Screenshots -> tools/verify-out/shot_<akt>.png
```

Das Skript startet einen lokalen Server, lädt `index.html` in headless Chromium,
injiziert das Ausgangsbild, klickt „Erstellen“, fährt deterministisch alle sechs
Akte an (`SHADED.applyAct(...)` + `SHADED.setTime(...)`) und schreibt PNGs.
Danach folgt ein zweiter Lauf mit der gemalten Material-Map (`1782824829119.png`).
Eigener Browserpfad: `CHROMIUM=/pfad/zu/chromium node tools/verify.js`.

## Bewertung (Screenshots IMMER mit dem Bild-Tool ansehen!)

| Screenshot | Vergleichen mit | Muss zeigen |
|---|---|---|
| `shot_sturmnacht.png` | `file_00000000b27471f4a8aeb27484b46720.png` | Dunkle, blaustichige Nacht; Regen; Flussnetz auf Pfaden; warme Fenster; Warmlicht spiegelt in Nässe; Nebel |
| `shot_danach.png` | `file_00000000fbc472438dcc92aff24bed6e.png` | Heller Tag; Pfad dunkel-nass; Pfützen in Senken; Glitzern; Restnebel |
| `shot_tag.png` | Ausgangsbild | Nahezu unverändert (nur sanfte Wolkenschatten) |
| `shot_verfall.png` | `1782826101420.png` | Moosdächer, überwucherte Pfadränder, entsättigt |
| `shot_map_sturmnacht.png` | Nacht-Zielbild | Wie Sturmnacht, Lichter an den in der Map teal markierten Öffnungen |
| Physik generell | `1782823262240.png` / `1782823374309.png` | Puddle Collection in Senken, Bleed-out ins Gras, Warmlichtreflexionen |

Zusätzlich prüft das Skript:
- **Konsole-Fehler müssen leer sein** (ein favicon-404 ist harmlos).
- Materialproben via `SHADED.getMaterialTypeAt`: Pfadmitte→`path`, Dach→`roof`, Baum→`foliage`.

## Häufige Fehlerbilder

- **Gelbe Glut-Blobs an Bildrändern:** Fenster-Klasse frisst dunkle Baumschatten →
  Plausibilitäts-Pässe in `analyze()` prüfen (Umfeld-Voting, Blob-Größenlimit).
- **Ganze Fassade leuchtet:** `maxArea`-Limit der Connected Components zu groß.
- **Weiß ausbrennende Lichter im Map-Modus:** Energie-Normalisierung des Emissiv prüfen.
- **Keine Pfützen:** Pfützenschwelle (`0.95-0.78*puddle`) vs. `phys.r`-Tiefe; Chamfer-`scale`.
- **Szene wirkt statisch:** Wind-Sway, Wolkenschatten, Mikro-Exposure nie gleichzeitig deaktivieren.
