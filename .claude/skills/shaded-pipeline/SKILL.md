---
name: shaded-pipeline
description: Architekturwissen für Änderungen an SHADEDs Analyse-Pipeline, Rendergraph und Shadern – Materialwahrheit, Pass-Verträge, Lastverteilung, Texturbelegung, Uniforms, Klassen/Palette und Andockpunkte. Nutzen, bevor irgendetwas an analyze(), Render-Pässen oder Shadern geändert wird.
---

# SHADED-Pipeline: Wo was lebt

Die aktuelle Runtime liegt in `index.html`. Reihenfolge im File: CSS → Sidebar-DOM → JS
(Palette/Params → Shader-Quelltext → GL-Setup → Analyse → Storyboard → Blitze → UI → Render-Loop → `window.SHADED`).

**Wichtig:** Der heutige große Fragmentshader ist eine funktionierende Ausgangsimplementierung, aber keine dauerhafte Systemgrenze. Die verbindliche Zielarchitektur steht in [`docs/rendergraph-lastverteilung.md`](../../../docs/rendergraph-lastverteilung.md).

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
Gebäudezonen K1 (R: 1=Fachwerk-Gebäude; Saat=Dächer nach Ankern,
  Wachstum W/K/N/R + P-mit-Balken-Beleg; bodenverankerte Komponenten tabu;
  maskiert puddle/riv/creep/mud; Fenster-Validierung via Zonen-Beleg) → Unit 7
Tiefenkarte 2.5D (optional; Weiß=nah; 1×1 schwarz = flach)   → Unit 6
  UV-Versatz `uv += u_parallax * depth` GANZ AM ANFANG von main(), vor allen
  Lookups (eine Material-Wahrheit!). Overlay folgt der Bodenebene (OV_DEPTH),
  nur wenn hasDepth. API: SHADED.parallax{set,get,hasDepth,setDepthImage,clearDepth}.
```

Diese Units beschreiben **nur den aktuellen Legacy-Pass**. Sie sind kein globales SHADED-Limit. Texture Units gelten pro Pass; Zwischenresultate dürfen über Framebuffer-Texturen an weitere Pässe übergeben werden.

## Unverhandelbare Rendergraph-Invariante

1. **Kein neuer Effekt wird automatisch in den bestehenden Fragmentshader geschrieben.** Zuerst wird entschieden, ob er ein eigener Pass, ein geteiltes Feld, ein CPU-Prozess, ein Ereignis oder tatsächlich eine kleine Erweiterung eines bestehenden Passes ist.
2. **Weltzustand ist nicht GPU-Bindung.** Persistente Spuren, Rost, Geruch oder Brandnarben dürfen logisch bestehen, ohne permanent als Textur gebunden zu sein.
3. **Nie alle Weltgesetze gleichzeitig rendern.** Ein World-Law Scheduler bestimmt aktive Gesetze aus Ursache, Sichtbarkeit, mechanischer Relevanz, Abhängigkeiten und Budget.
4. **Texture Slots werden nach Lebensdauer wiederverwendet.** Keine dauerhafte Slot-Zuteilung pro Weltgesetz.
5. **Mehrere Pässe sind ausdrücklich vorgesehen.** Ping-Pong-Buffer, reduzierte Auflösungen, Dirty Regions und unterschiedliche Update-Frequenzen sind Kernarchitektur, keine späteren Optimierungen.
6. **ReShade ist keine Kernabhängigkeit.** Es kann später als Fremdspiel-/Exportadapter dienen, ersetzt aber nicht SHADEDs internen Rendergraph.
7. **Keine zweite Materialwahrheit.** Alle Pässe lesen dieselben aus `analyze()` abgeleiteten Masken oder daraus deterministisch erzeugte Felder.

## Lastverteilung – Pflichtangaben pro Weltgesetz

Jedes neue oder wesentlich erweiterte Weltgesetz dokumentiert vor der Implementierung:

```text
Ursache / Aktivierungsbedingung:
Mechanische Leser:
Sichtbarkeitsbedingung:
Eingaben:
Ausgaben:
Pass-Phase: simulation | material | lighting | atmosphere | composite | post
Update: frame | fixedHz | event | onDirty
Frequenz:
Auflösung: 1.0 | 0.5 | 0.25 | tiles
Lokalität: fullscreen | bounds | dirty-tiles | offscreen-logical
Persistenz: transient | cached | world-state
Abhängigkeiten:
Fallback:
Messgröße / Budget:
Test-Fixture:
```

Fehlen diese Angaben, ist das Weltgesetz architektonisch noch nicht implementierungsbereit.

### Empfohlene Frequenzklassen

- **pro Frame:** finales Composite, Kamera-Parallaxe, schnelle sichtbare Reaktionen.
- **20–30 Hz:** Wasserwellen, aktive Rauchbewegung, Windfelder.
- **10–15 Hz:** Geruch, Nebeldichte, Wärmeausbreitung.
- **1–5 Hz:** Trocknung, Rost, Moos, Materialermüdung, Jahreszeiten.
- **ereignisgesteuert:** Fußabdruck, Berührung, Einschlag, Zündung, Reinigung, Reparatur.
- **beim Laden/Dirty:** Segmentierung, Gebäudezonen, statische Distanzfelder.

Langsamere Prozesse werden zwischen Updates visuell interpoliert. `tickWorld` und `setTime` bleiben deterministisch.

### Degradation unter Last

Reihenfolge der erlaubten Reduktion:

1. Auflösung eines Feldes oder Passes senken,
2. Aktualisierungsfrequenz reduzieren,
3. teure Passvariante gegen Fallback tauschen,
4. nur indirekte Spuren darstellen,
5. Darstellung vorübergehend aussetzen und Zustand persistieren.

**Verboten:** Weltzustand löschen oder Kausalität brechen, nur um Renderbudget einzuhalten.

## Migrationsregel

Der aktuelle Shader wird zunächst als `LegacyCompositePass` behandelt. Neue Infrastruktur muss ihn unverändert ausführen können. Danach werden klar abgegrenzte Teile schrittweise extrahiert – kein Big-Bang-Rewrite.

Bevorzugte erste Extraktionskandidaten:

- finales Grading/Bloom/Glitzern,
- Nebel,
- Hitzeverzug,
- danach ein echtes Ping-Pong-Feld wie Wasser, Rauch oder Reaction Diffusion.

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
- Ohne Map: `classifyScenePixel()` (HSL-Heuristik, Raster `AW`=768) → 2× Majority-
  Filter → Kanon-Detektoren nach `docs/bildkanon.md`:
  (a) Teal-Plausibilität: „Fenster“ im Grünen wird Laub, auf Dächern Dach;
  (b) **Himmel-Regel (K7):** Flood von der Oberkante über {A,P,K}; Region >2 %,
  blau-dominant & hell → inerte Klasse K (kein Wasser, keine Pfützen);
  (c) **Rahmen-Fenster (K3/K4):** Füllungs-Blobs (K/P/A/R **oder roh-blaues
  Glas**, das die Heuristik als F/W einsortiert hätte) im geschlossenen Holzring
  (≥55 % W im Direktring) + Farbtor: sattes Blauglas (`b>g && b>r+15 && sat>35`)
  ODER hell-sattes Warmlicht (`sat>120 && lum>120`). Bewusst KEIN
  „dunkel = Fenster“-Tor. `minArea=2` (Sprossen-Scheiben!).
  (d) Finale N-Validierung (läuft NACH Struktur- und Zonen-Pass): Form +
  **K1-Zonenbeleg** (Zonenanteil > 40 % des Umfelds), wo Zonen existieren;
  Fallback ohne Zonen: Wand-Voting (`wall ≥ 6 %`). Umfeldradius skaliert mit
  `AW` UND Blobgröße; Pink-Marker sind unantastbar.
- **Struktur-Pass (Runde 5, nach den Fensterdetektoren), Adjazenz-Ringe
  (BBox-Ringe lügen bei langgestreckten Formen), `minStruct`-Mindestfläche
  gegen Fragment-Kaskaden:**
  Dach-Anker – R-Komponenten mit grasdominiertem Umfeld (>45 % G+A, keine
  Fenster) sind Boden → P; R-Sprenkel im Pfad werden absorbiert.
  Bodenanker – P-Komponenten mit Dach-Umfeld (>40 % R) und praktisch ohne
  Bodenkontakt (<8 % G+A; Kontur-W neutral) sind Gebäudeoberfläche → K.
  Diagnose via `SHADED.structure()`. Zweitbild-Semantik: neue Szene verwirft
  das alte Overlay/Map automatisch (Bild B nie mit Map von Bild A analysieren!).
- Abgeleitet: Chamfer-Distanz im Pfad (`dPath`) → Pfützentiefe `(dPath/scale)^0.8`;
  geblurrte Pfadmaske → Gradient → Flussfeld (Tangente, y≥0 = „hangabwärts“);
  `blur(path)-path` → Bleed-Halo ins Gras.

## Shader-Uniforms

`u_time, u_aspect, u_px` + die 9 Parameter als `u_dayNight, u_storm, u_rain, u_wet,
u_puddle, u_fog, u_wind, u_glow, u_decay` + `u_flash` (Blitz-Envelope, CPU-seitig
in `tickLightning()`). Alle 0..1. CUR (geblendet) wird gerendert, PARAMS ist der Slider-Zustand.

## Effekt-Reihenfolge im LegacyCompositePass

Diese Reihenfolge gilt für den **heutigen Legacy-Pass**. Sie ist zu bewahren, solange ein Effekt noch nicht kontrolliert in einen eigenen Rendergraph-Pass extrahiert wurde.

1. Wind-Sway (Domain-Warp, nur Vegetation) → Basisfarbe
2. Nässe-Abdunklung (`porous`-Gewichte) + Sättigungs-Boost
3. Specular-Sheen (Luminanz-Gradient)
4. Verfall (Runde 3: Verfallskurven `dWood 0.05–0.55 → dRoof 0.20–0.75 → dPath 0.35–0.90 → dRock 0.60–1.0`; Holz versilbert + Splitter, Dach-Moos + fehlende-Ziegel-Löcher, Pfad-Überwucherung via `phys.a`-Distanzfront im Szenen-Graston `u_grassAvg`, Ranken, Flechten, Risse + Dach-Sag ab decay>0.75; `u_mossBoost` = CPU-Feuchte-Patina, `u_bleach` schaltet Moos→Ausbleichen; Fensterlicht erlischt ab decay 0.6)
5. Wolkenschatten → `grade()` (Tag/Nacht/Sturm; wird AUCH auf Pfützen-Reflexionen angewandt!)
6. Rinnsal-Netz (fbm entlang Flussfeld, nur `mPath*rain*wet*(1-zone)`) + Dach-Ablauf (K2: abwärts wandernde Glanzbahnen, nur `mRoof*rainy` – Dächer schütten ab, sammeln nie)
7. Pfützen (Tiefe+Noise vs. Schwelle `0.95-0.78*puddle`; Reflexion = Szene↑ + Himmel + `u_emis`-Warmlicht)
8. Regenringe, Tropfkanten, Fensterlicht (Kern + Glow + diffuser Schein auf Nässe)
9. Nebel (2×fbm, Rand-gewichtet) → Regenschlieren (3 Parallax-Schichten) → Blitz
10. Glitzern (Tag danach) → Atmen (Mikro-Exposure) → Nacht-Vignette

## Neuen Effekt oder ein neues Weltgesetz andocken

1. **Zuerst Pass-/Lastvertrag ausfüllen.** Nicht mit Shadercode beginnen.
2. Entscheiden: bestehender Pass, eigener Pass, geteiltes Feld, CPU-Logik, Ereignis oder Overlay.
3. Parameter in `PARAMS` + `PARAM_META` ergänzen, wenn es ein echter High-Level-Weltparameter ist. Keine Effekt-Schalter-Sammlung aufbauen.
4. In relevante `ACTS` und Default-Storyboard-Schritte eintragen.
5. Materialbezug immer über kanonische Masken, nie über neue Farbvergleiche im Pass.
6. Bewegungsphasen: Intensitäten (wind/rain/…) NIE in den Phasenterm `t*f(intensität)` multiplizieren – beim Abklingen liefe die Phase rückwärts („Regen-Rewind“). Stattdessen Phase auf der CPU aufsummieren (`u_rainPhase`, `u_windDrift` in `tickWorld`; `setTime` setzt sie deterministisch). Intensität steuert nur Amplitude/Dichte/Deckkraft.
7. Falls eigener Pass: Inputs, Outputs, Format, Auflösung, Frequenz, Lebensdauer, Fallback und Timing-Test definieren.
8. `node tools/verify.js` + Screenshots ansehen (siehe Skill shaded-visual-verify).
9. Bei Rendergraph-Arbeit zusätzlich prüfen: keine unnötigen Pässe bei inaktiven Gesetzen, keine Ressourcenleaks, deterministische Budget-Degradation und visuelle Parität.
