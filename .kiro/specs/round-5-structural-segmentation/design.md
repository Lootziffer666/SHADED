# Runde 5 – Strukturelle Segmentierung: Design

## Einordnung in die Pipeline

Neuer **Struktur-Pass** in `analyze()` NACH den Fensterdetektoren und VOR
den weichen Masken / abgeleiteten Karten. Reihenfolge:

```
classify → majority → Teal-Plausibilität → Fensterdetektoren
       → STRUKTUR-PASS (Runde 5)
       → Marker-Overrides (haben weiter das letzte Wort)
       → Masken/Chamfer/Flussfeld/Emissiv
```

## Inkrement 1 – Bodenanker (R1)

Pro P-Komponente (Flood-Fill, 4er-Nachbarschaft):
1. Ring = BBox+3 minus Komponente.
2. Klassenanteile im Ring, **W (Konturen/Holz) wird neutral gezählt**
   (Cartoon-Outlines umranden alles).
3. `ground = G + A`-Anteil, `building = R`-Anteil an Nicht-W-Ringpixeln.
4. Regel: `building > 0.30` UND `ground < 0.20` → Komponente → K.
5. Läuft nur im Heuristik-Modus (nie bei Palette-Map); Marker gewinnen danach.

Wirkung: Terrassen/Decks/Balkone verlieren Pfad-Klasse → kein Chamfer,
kein Flussnetz, keine Pfützen auf Gebäuden. Der echte Pfad (grasgesäumt)
bleibt unberührt.

## Inkrement 2 – Gebäudezonen (R2)

Saat = Dach-Komponenten ≥ minArea. Zone wächst per beschränkter Dilation
(`n` Iterationen ≈ typische Fassadenhöhe, abgeleitet aus der Dachhöhe der
Saat-Komponente) über {W, K, N, P}-Pixel, stoppt an G/A. Ergebnis als
weiche Maske in einen freien Textur-Kanal (Kandidat: `phys`-Umbau auf
zwei Texturen oder Alpha-Sharing mit Distanzfeld). Shader: `puddle`,
`riv`, `creep`, `mud` mit `(1.0 - zone)` maskieren.

## Inkrement 3 – Wand/Boden-Split (R3)

Für P-Pixel innerhalb 0-Zonen-Nähe: vertikaler Kontexttest am Analysegrid –
Anteil {R,W} in Spalte oberhalb (Fenster ±2, Reichweite ~Fassadenhöhe)
hoch UND Bodenklassen unterhalb → Wandpixel → K. Grobkörnig ausreichend;
Feinheit übernimmt Inkrement 2.

## Inkrement 4 – Fenster über Zonen (R4)

`validateWindows` erhält die Zonen-Maske: Kandidat gültig, wenn
Zonenanteil im Blob-Umfeld > 0.4. Ersetzt die Radius-Votings dort, wo
Zonen existieren; Fallback bleibt das bisherige Voting (Szenen ohne
erkennbare Dächer, z. B. reine Landschaften).

## Diagnose (R5)

`SHADED.structure = { components:{path,roof,…}, reclassified:{pathToRock:…},
zones:n }` – befüllt im Struktur-Pass; verify.js loggt pro Szene
`Klassen: {...}` und vergleicht gegen `tools/expected-classes.json`
(±10 % Toleranz).

## Risiken

- Ring-Regel bei Brücken/Stegen über Wasser: ground enthält A → geerdet ✓.
- Höfe/Plätze komplett von Gebäuden umschlossen: building-Anteil hoch,
  ground 0 → würden fälschlich K. Gegenmittel Inkrement 2: Zone endet an
  der Traufkante; Höfe liegen außerhalb. Bis dahin: Overlay-Korrektur.
- Isometrie-Annahme „Fassade unter Dach“ gilt für Top-Down/Iso-Art;
  Seitenansichten später über einen Blickwinkel-Schalter.
