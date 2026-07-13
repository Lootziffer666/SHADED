# Produkt: SHADED

**Ein Bild. Erstellen. Lebendig.**

SHADED verwandelt EIN einzelnes 2D-Bild per WebGL-Shader in eine atmende Szene –
Environmental Storytelling ohne 3D-Assets, ohne Backend, ohne Build-Step.

## Kernversprechen

Bild laden → **„✨ Erstellen“** → die Szene durchlebt einen filmischen Bogen:
Goldener Tag → Sturm zieht auf → Sturmnacht (Regen, Wasserflussnetz, Blitze,
warm erleuchtete Fenster, die sich in Pfützen spiegeln) → Morgengrauen → der
glitzernd nasse Tag danach. Im Loop, im Kino-Modus, ohne weiteres Zutun.

## Qualitätsanspruch

- Nicht oberflächlich animiert, sondern **atmend**: Wind, Wolkenschatten,
  Nebeldrift, Fensterflackern, Mikro-Exposure – die Szene steht nie still.
- Physikalisch glaubwürdig im Cartoon-Rahmen: Nässe dunkelt poröse Materialien
  stark ab, Wasser sammelt sich in Senken und blutet in Grasränder aus,
  Warmlicht reflektiert in nassen Flächen (siehe Referenzbilder im Repo-Root).
- Maßstab sind die Zielbilder: `file_00000000b274…png` (Sturmnacht) und
  `file_00000000fbc4…png` (Tag danach).

## Zielgruppe & Nutzung

Weltenbauer, TTRPG-Spielleiter, Game-Jam-Teams: eigene Karten/Illustrationen
laden und als lebendige Szenen präsentieren oder als WebM/PNG exportieren.
Optional kann eine selbstgemalte Material-Map (kanonische Palette, siehe
tech.md) die automatische Analyse übersteuern.

## Fahrplan

1. ✅ Runde 1: Wasser, Sturm & Atmosphäre (`index.html`)
2. Runde 2: Jahreszeiten & Klima → Spec `round-2-seasons-climate`
3. Runde 3: Material Fatigue & Verfall → Spec `round-3-material-fatigue`
4. Runde 4: Interaktion & Ökosystem → Spec `round-4-interaction-ecosystem`
5. ✅ Runde 8: Wally-Monokel (Inspektions-Linsen) → Spec `round-8-inspection-lenses`
6. ✅ Runde 9: Asset-Pipeline (Kostüm-Browser, Szenen-Projekt-Zusammenbau) → Spec `round-9-asset-pipeline`

Die Specs in `.kiro/specs/` sind verbindlich („Build by specs“:
requirements → design → tasks).
