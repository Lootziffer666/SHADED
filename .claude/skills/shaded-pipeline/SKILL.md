---
name: shaded-pipeline
description: Architekturwissen für Änderungen an SHADEDs Analyse-Pipeline und Shader (index.html) – Texturbelegung, Uniforms, Klassen/Palette, wo neue Effekte andocken. Nutzen, bevor irgendetwas an analyze() oder am Fragment-Shader geändert wird.
---

# SHADED-Pipeline: Wo was lebt

Alles ist in `index.html`. Reihenfolge im File: CSS → Sidebar-DOM → JS
(Palette/Params → Shader-Quelltext → GL-Setup → Analyse → Storyboard → Blitze → UI → Render-Loop → `window.SHADED`).

## Datenfluss

```
Bild ──► analyze() [CPU, einmal pro „Erstellen“]
          ├─ classGrid (Uint8, 8 Klassen)  ← EINZIGE Material-Wahrheit
          ├─ maskA  (RGBA: grass, foliage, roof, path)      → Unit 1
          ├─ maskB  (RGBA: wood, window, water, rock)       → Unit 2
          ├─ phys   (RGBA: Pfützentiefe, Flusswinkel/2π,
          │                Bleed-Halo, Pfad-Distanz)        → Unit 3
          └─ emis   (RGB: warmer Glow 2-stufig geblurrt +
                     energie-normalisiert; A: Fenstermaske)  → Unit 4
Szene (Vollauflösung)                                        → Unit 0
Trail-Map (512², CPU-Uint8Array, dirty-Upload)               → Unit 5
  R Delle (HWZ 1.5 s) · G Impuls (0.4 s) · B Trampelpfad (permanent) · A Hitze/Brand (~25 s)
  Decay direkt auf den Pixeldaten (trailTick), Stempel via trailStamp(u,v,rad,ch,strength)
```

Runde-4-Laufzeitwelt (CPU + Overlay-Canvas `#ov`, deckungsgleich über `#gl`):
Spieler (WASD/Dash, materialabhängig via `getMaterialTypeAt`, Eis-Trägheit,
Fußspuren→R/B), Lagerfeuer (max 8, Uniform-Array `u_fires`, Ausbreitung mit
Nässe-Veto, Regen löscht, A-Kanal-Brandspur), Partikel (Laub/Früchte/Rauch/
Funken/Atem – rückwärts splicen!). Welt-Logik läuft in festen 50-ms-Substeps
(`tickWorld`), damit Weltzeit = Echtzeit auch bei niedriger Framerate.
API: `SHADED.player{enable,move,pos,setAge}`, `SHADED.fire{ignite,list}`,
`SHADED.trail{clear,sample}`.

Masken sind weich (1px-Blur) und werden LINEAR gesampelt → saubere Kanten.
Klassen-Indizes: G=0 grass, F=1 foliage, R=2 roof, P=3 path, W=4 wood, N=5 window, A=6 water, K=7 rock.

## Segmentierung

- Mit gemalter Map: Nearest-Neighbor in RGB gegen `PALETTE` (enthält Legacy-Aliase,
  u. a. den Zahlendreher `#F972E9`→roof und Schwarz→grass).
- Ohne Map: `classifyScenePixel()` (HSL-Heuristik) → 2× Majority-Filter →
  zwei Plausibilitäts-Pässe: (a) „Fenster“ im Grünen wird Laub, auf Dächern Dach;
  (b) Tür-/Fenster-Erkennung: dunkle Holz-Blobs → morphologisches Opening (Balken
  verschwinden) → Connected Components mit Flächenlimit (`minArea..maxArea`) →
  Fassaden-Check (Wandanteil am Schwerpunkt) → Klasse N.
- **Struktur-Pass (Runde 5, nach den Fensterdetektoren):** Bodenanker-Regel –
  P-Komponenten mit dachdominiertem Ring (>30 % R) und ohne Bodenkontakt
  (<20 % G+A; Kontur-W neutral) werden Gebäudeoberfläche (K). Diagnose via
  `SHADED.structure()`. Zweitbild-Semantik: neue Szene verwirft das alte
  Overlay/Map automatisch (Bild B nie mit Map von Bild A analysieren!).
- Abgeleitet: Chamfer-Distanz im Pfad (`dPath`) → Pfützentiefe `(dPath/scale)^0.8`;
  geblurrte Pfadmaske → Gradient → Flussfeld (Tangente, y≥0 = „hangabwärts“);
  `blur(path)-path` → Bleed-Halo ins Gras.

## Shader-Uniforms

`u_time, u_aspect, u_px` + die 9 Parameter als `u_dayNight, u_storm, u_rain, u_wet,
u_puddle, u_fog, u_wind, u_glow, u_decay` + `u_flash` (Blitz-Envelope, CPU-seitig
in `tickLightning()`). Alle 0..1. CUR (geblendet) wird gerendert, PARAMS ist der Slider-Zustand.

## Effekt-Reihenfolge im Shader (nicht umsortieren ohne Grund)

1. Wind-Sway (Domain-Warp, nur Vegetation) → Basisfarbe
2. Nässe-Abdunklung (`porous`-Gewichte) + Sättigungs-Boost
3. Specular-Sheen (Luminanz-Gradient)
4. Verfall (Runde 3: Verfallskurven `dWood 0.05–0.55 → dRoof 0.20–0.75 → dPath 0.35–0.90 → dRock 0.60–1.0`; Holz versilbert + Splitter, Dach-Moos + fehlende-Ziegel-Löcher, Pfad-Überwucherung via `phys.a`-Distanzfront im Szenen-Graston `u_grassAvg`, Ranken, Flechten, Risse + Dach-Sag ab decay>0.75; `u_mossBoost` = CPU-Feuchte-Patina, `u_bleach` schaltet Moos→Ausbleichen; Fensterlicht erlischt ab decay 0.6)
5. Wolkenschatten → `grade()` (Tag/Nacht/Sturm; wird AUCH auf Pfützen-Reflexionen angewandt!)
6. Rinnsal-Netz (fbm entlang Flussfeld, nur `mPath*rain*wet`)
7. Pfützen (Tiefe+Noise vs. Schwelle `0.95-0.78*puddle`; Reflexion = Szene↑ + Himmel + `u_emis`-Warmlicht)
8. Regenringe, Tropfkanten, Fensterlicht (Kern + Glow + diffuser Schein auf Nässe)
9. Nebel (2×fbm, Rand-gewichtet) → Regenschlieren (3 Parallax-Schichten) → Blitz
10. Glitzern (Tag danach) → Atmen (Mikro-Exposure) → Nacht-Vignette

## Neuen Effekt andocken

1. Parameter in `PARAMS` + `PARAM_META` ergänzen (Slider & Uniform entstehen automatisch;
   Uniform-Name = `u_<key>`).
2. In relevante `ACTS` und Default-Storyboard-Schritte eintragen.
3. Effekt an der stimmigen Stelle der Shader-Reihenfolge einbauen; Materialbezug immer
   über die Masken, nie über Farbvergleiche im Shader.
4. `node tools/verify.js` + Screenshots ansehen (siehe Skill shaded-visual-verify).
