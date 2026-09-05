# World Architecture

## Ziel

SHADED verfrachtet die Troposphären-Simulation der 2D-Weather-Sandbox (niels747) in die dritte Dimension — als Spiel. Nicht als Demo, nicht als Harness: eine kleine Welt, die aussieht und sich anfühlt wie ein Spiel. **Der Editor ist das Spiel selbst.**

Stil: Journey als Skin. Richtung: Der Nutzer gibt die Vision vor. Kein LLM, kein Harness, keine Stubs zweifeln sie an, bevor sie nicht bewiesen falsch ist. **Es ist mein Projekt.**

---

## Die Referenz: 2D-Weather-Sandbox (niels747)

Das Repo simuliert die Erd-Troposphäre in Echtzeit, interaktiv, mit einem klaren Hauptziel: **Wolken und Niederschlag**. Konkret:

- **Wasser-Phasenwechsel** als vereinfachte echte Gleichungen: Verdunsten, Kondensieren, Gefrieren, Schmelzen — jeder Übergang tauscht Wärme aus
- **Latente Wärme als Motor:** Kondensation setzt Wärme frei und treibt Aufwinde; Schmelzen und Verdunsten nehmen Wärme und erzeugen Abwinde — so entstehen geschlossene Konvektionszellen
- **Staggered-Grid-Fluid:** Druck in Zellzentren, Geschwindigkeiten auf Zellkanten; Iteration = Druck berechnen → Geschwindigkeiten berechnen → Advektion
- **Niederschlag** als diskrete Partikel, darstellbar als Partikel oder glatte Vorhänge
- **Sturmzellen** mit Kaltfronten, die neue Warmluft anheben; Taupunkt, CAPE, Soundings als Forcing
- **Blitze und Gewitter**
- ~5000 Zeilen: 2800 JS + 2000 GLSL, WebGL2

**Seine eigene Limitation ist unser Auftrag:** 2D kann keine dreidimensionalen Wirbel — keine Tornados, keine Staubteufel, keine Hurricanes, nur lineare Sturmsysteme. Die Verfrachtung in 3D hebt exakt diese Grenze auf.

---

## Was SHADED bereits hat

2D gab es in SHADED nur sehr kurz, in der Frühphase — davon existiert kein Repo. Die Sandbox war bereits 3D: vollständiges Terraforming, Saat, rudimentäre Vegetation. Diese 3D-Sandbox ist der Bestand, in den die Wetter-Simulation hineinwächst.

Der Kernel (`src/sandbox/world-sandbox-reference.mjs`) hält pro Oberflächen-Zelle 24 Felder:

| Feld | Bedeutung |
|---|---|
| `BEDROCK` | Fels-Basis |
| `SAND` | Dünen, loser Boden — Terraforming-Masse |
| `COMPACTION` | Verdichtung |
| `WETNESS` | Nässe des Bodens |
| `WATER` | Oberflächenwasser |
| `VELOCITY` (2 Komponenten) | Fließgeschwindigkeit des Wassers |
| `SEDIMENT` | Transportiertes Sediment |
| `BIOMASS` | Vegetationsmasse |
| `SEEDS` | Samen — Saat-Tool schreibt hier |
| `HEAT` | Wärme im Boden |
| `DISTURBANCE` | Störung / Bearbeitung |
| `VAPOR` | Wasserdampf |
| `CLOUD` | Kondensat |
| `ICE` | Eis |
| `SNOW` | Schneedecke |
| `FIRE` | Feuer |
| `SMOKE` | Rauch |
| `ASH` | Asche — fruchtbarer Boden danach |
| `GROUNDWATER` | Grundwasser |
| `WIND_X`, `WIND_Z` | Windfeld |
| `PLANT_TYPE` | Pflanzenart |
| `PLANT_AGE` | Pflanzenalter — Sukzession |

`colorForCell` liest diese Felder bereits als **Komposition**: Schnee hoch → weiß, Sand hoch → Düne, Biomass → Grün, Feuer → Glut, Asche → Grau. Das ist das Muster, das der Terrain-Shader übernehmen muss: **Zustand → Eigenschaften**, nicht „Farbe in Schnee-BRDF mischen".

---

## Die 3D-Verfrachtung

Der Architektur-Schritt ist keine Ebene mehr, sondern eine Kopplung:

**Oberflächen-Grid (existiert) + Volumen-Atmosphäre (neu).**

Die Weather-Sandbox ist eine 2D-Vertikalschnitt (x, Höhe). SHADEDs Kernel ist ein Oberflächen-Grid (x, z). Die 3D-Version koppelt beide zu einem **volumetrischen Atmosphären-Grid (x, z, Höhe)** über dem Oberflächen-Grid:

- Verdunstung liest `WATER`/`WETNESS`/`HEAT` der Oberfläche darunter
- Kondensation schreibt `CLOUD` ins Volumen, Niederschlag schreibt `WATER`/`SNOW` auf die Oberfläche
- Latente Wärme treibt vertikale Geschwindigkeiten — Konvektionszellen werden dreidimensional
- Orografie: Terrain-Höhe zwingt Wind nach oben (Stauregen, Föhn) — in 3D um Berge herum, nicht nur darüber
- **Was niels747 nicht kann, wird möglich: echte Wirbel.** Tornados, Staubteufel, rotierende Superzellen
- Blitze: Ladungstrennung im Volumen, Entladung auf die Oberfläche — Feuer kann so natürlich entstehen (`FIRE` ohne Spieler-Hand)

Umsetzung folgt dem bewiesenen Muster des Deform-Buffers: toroidal gescrollt, spielerfolgend, GPU-Compute. Der gedroppte 2160-Zeilen-WebGPU-Backend (Commit `d0109b74`) ist die Referenz dafür, den Step in Compute zu heben.

---

## Erweiterungen über die Referenz hinaus

Die Referenz endet an der Troposphäre. SHADED geht weiter — die Konsequenzen:

| Neuer Zustand | Physik | Folge in der Welt |
|---|---|---|
| `MAGMA` | Hitze + Druck aus Gestein (`BEDROCK` + `HEAT`) | Glühend, flüssig, Lichtquelle |
| `LAVA` | Fließendes Magma an der Oberfläche | Kruste, Kühlung → neue `BEDROCK` |
| `STEAM` | `WATER` trifft Hitze / Magma | Dampfsäulen, Druck, Rückkondensation |
| Wurzeln | `PLANT_TYPE`/`PLANT_AGE` unter der Oberfläche | Wasser-Transport, Bodenstabilität |
| Gras / Blumen / Sträucher / Bäume | `PLANT_TYPE` differenziert, `PLANT_AGE` treibt Sukzession | Höhe, Schatten, Wind-Reaktion, Brennstoff-Gradient |
| Ozean | Habitat-System (s. nächster Abschnitt) | Strömung, Wellen, Küsten-Interaktion, Leben |

---

## Ozean als Habitat-System

Referenz: `forbiddenlink/ocean-simulator` — fotorealistisches Unterwasser-Ökosystem in Three.js + bitECS, 500+ Meeresbewohner, komplexe Nahrungsketten, emergentes Verhalten.

Der Ozean in SHADED ist kein „Wasser als Fläche", sondern das **erste Habitat-System**: Strömung, Wellen, Nahrungskette, Küste als Übergangszone zum Oberflächen-Grid (Verdunstung, Sediment, Nährstoffe). Weitere Habitate (Sumpf, Tundra, …) folgen später auf dieselbe Architektur: Zustandsfelder + Populationen, gekoppelt an dieselbe Welt.

---

## Stil: Journey als Skin

Journey ist keine Schicht und kein Terrain-Typ, sondern eine Look-Entscheidung über allem:

- Warme Sand-Albedo (linear ≈ `vec3f(0.55, 0.32, 0.13)`), Roughness ≈ 0.86
- Niedrige Sonne, weicher kühler Himmel, AgX, Exposure auf Sand abgestimmt (≈ 0.19–0.22 statt 0.105)
- Schnee-SSS/Glints/Bounce sind **kein Default**, sondern Zustand: `SNOW` hoch → Schnee-Property-Modell fadet herein
- Magma-Ausbruch → Szene wird dunkler, Magma wird Lichtquelle — der Stil bleibt derselbe

Die Welt startet als Wüste (`SNOW` = 0 nach dem Seed-Fix `74b5c44`). Winter ist etwas, das der Kreislauf **tun kann** — Kälte, Wolken, Niederschlag unter dem Gefrierpunkt — nicht etwas, das der Renderer **ist**.

---

## Editor als Spiel

Die Welt ist der Editor. Tools sind Spielverben, keine Menüs:

- **Graben** → `BEDROCK` freilegen, `SAND` bewegen
- **Säen** → `SEEDS` → `PLANT_TYPE` → `BIOMASS` → Sukzession zu Blumen, Sträuchern, Bäumen
- **Wasser setzen** → `WATER` → `GROUNDWATER` → Quellen; Verdunstung → Wolken → Regen woanders
- **Feuer legen** → `FIRE` frisst Biomasse → `ASH` → fruchtbarer Boden
- **Hitze bringen** → `HEAT` → `MAGMA`/`LAVA` → neue `BEDROCK`
- **Wetter beobachten** → Konvektionszelle, Sturmfront, Blitzschlag, Waldbrand — emergent, ungewollt, echt

Keine Property-Panels. Die Welt reagiert auf das, was du tust — und auf das, was sie selbst tut.

---

## Technische Konsequenzen (offene Punkte, keine Gates)

1. **Fragment-Normalen aus dem Sim-State:** Vertex/Depth/Prepass addieren `sandboxHeight` bereits; der Fragment-Shader muss denselben Gradienten in `grad` aufnehmen (Zentraldifferenz aus `sandboxSampleBilinear`), sonst beleuchtet er die alte Form.
2. **sRGB → Linear:** `colorForCell`-Werte kommen als 0..255, werden durch 255 geteilt und landen unverwandelt in linearer HDR-Pipeline; Dünenkamm-Rot liegt bei ~283 (> 1.0). Konvertieren oder lineare Werte autorisieren.
3. **Skala:** 64²-CPU-Grid über 80 m mit Hard-Reset bei 26 m reicht für Werkzeug-Feedback, nicht für eine Welt. Ziel: toroidal gescrollte, persistente GPU-Compute-Grids — Oberfläche und Atmosphäre.
4. **Schnee-Property-Modell an Zustand hängen**, nicht löschen: SSS, Glints, Wrap, blaue Schatten bleiben als Schnee-Zustand erhalten.

---

## Prinzipien

- **Keine paternalisierenden Bremsen.** Dieses Doc beschreibt die Zielarchitektur, nicht wann was erlaubt ist.
- **Fails sind erlaubt.** Ideen werden umgesetzt, nicht angezweifelt, bevor sie nicht bewiesen falsch sind.
- **Kein Claude.md.** Die Richtung gibt der Nutzer vor.

---

## Referenzen

- Wetter: `niels747/2D-Weather-Sandbox` — 2D-Troposphäre in Echtzeit, Wolken/Niederschlag als Hauptziel, GPL-3.0
- Ozean-Habitat: `forbiddenlink/ocean-simulator` — Three.js + bitECS, 500+ Meeresbewohner, Nahrungsketten
- Kernel: `src/sandbox/world-sandbox-reference.mjs` (SHA `1c444f9`)
- CPU-Backend: `src/sandbox/world-sandbox-cpu-backend.mjs` (SHA `9e754d1`)
- Fragment: `src/shaders/snow.fragment.wgsl` (SHA `08d4298`)
- Vertex: `src/shaders/snow.vertex.wgsl` (SHA `22b2436`)
- Terrain: `src/terrain/terrain.js` (SHA `9bc1b82`)

*Dieses Dokument ist ein Werkzeug, kein Wächter. Es beschreibt, was gebaut wird — nicht, was erlaubt ist.*
