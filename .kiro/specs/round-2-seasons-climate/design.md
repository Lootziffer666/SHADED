# Runde 2 – Jahreszeiten & Klima: Design

## Parameter (neu in PARAMS/PARAM_META)

| Key | Bereich | Bedeutung |
|---|---|---|
| `snow` | 0..1 | Schneedecken-Anteil |
| `snowfall` | 0..1 | Flockendichte |
| `temperature` | 0..1 | 0 = −20 °C, 0.5 = 0 °C, 1 = +30 °C (im Shader auf °C gemappt) |
| `autumn` | 0..1 | Laubfärbung + Laubfall |
| `bloom` | 0..1 | Frühlingsblüten |
| `bleach` | 0..1 | Sonnenbleiche |

Kein neuer Textur-Slot nötig; Unit 5 bleibt für Runde 4 reserviert.

## Shader-Einbau (Reihenfolge aus shader-pipeline.md respektieren)

- **Schneedecke:** nach Schritt 4 (Verfall), vor Wolkenschatten. Akkumulation =
  `smoothstep`-Kaskade pro Maske: `roof: snow*1.2`, `grass: snow*1.1`,
  `path: (snow-0.35)*1.2` mit fbm-Flecken, `rock: snow*0.9`. Schneefarbe leicht
  blau moduliert mit vnoise; Kanten via Masken-Weichheit gratis.
- **Eis:** im Pfützen-Block (Schritt 7): `temperature<0.5` blendet Ripple-Offset
  gegen 0, mischt Frostmuster (`sin·cos`-Interferenz + fbm) und hellt den
  Pfützen-Grund auf; Emissiv-Reflexion mit Faktor 0.5.
- **Schneefall:** eigener Block direkt vor den Regenschlieren, gleiche
  Parallax-Technik, aber `t*(0.4..0.8)`, seitliches Taumeln
  `sin(y*2+t)`, runde Flocken statt Striche.
- **Herbst:** Hue-Shift als Farb-Lerp `mix(col, autumnPalette(vnoise(cell)), autumn*mask)`
  VOR der Nässe-Abdunklung (Schritt 2), damit nasses Herbstlaub dunkel glänzt.
- **Blüten/Bleiche:** Blüten = sparsame hash-Sprenkel auf veg-Maske;
  Bleiche = `mix(col, gray*1.15, bleach*porosityInv)` nach dem Grading.

## CPU/Storyboard

- `tickLightning` unangetastet; neue Akte `erster_schnee`, `goldener_herbst`
  in `ACTS`; Beispiel-Storyboard „Ein Jahr in 60 Sekunden“ als Preset-Knopf.
- `tools/verify.js`: shots für beide neuen Akte ergänzen.

## Risiken

- Parameter-Explosion im UI → Slider in `<details>`-Gruppen bündeln.
- Schnee auf weichen Maskenkanten kann „schweben“ → Kanten mit `smoothstep(0.35,0.65,mask)` härten.
