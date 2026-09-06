# Donors

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md) and [`GOAL.md`](./GOAL.md).

> **Scope note:** The six entries below are the fixed **water / weather / fire** donor set. They are not the complete SHADED donor universe. The binding cross-domain donor registry (Snow/UI, terrain/material, reconstruction, runtime/editor, physics/solver, graph/composer, animation and additional high-priority donor clusters) lives in `GOAL.md` and must be audited together with this file. A donor is a source of behaviour/technique/reference, never an implicit runtime owner.

Sechs feste Donors für diesen Domänenblock, jeder mit genau einer Rolle. Die Ebene-Spalte ist verbindlich — Rendering, Solver und Habitat werden nicht durcheinandergeworfen.

**Shader-Übersetzung:** GLSL/WGSL-Übertragung aus den Donor-Repos läuft über [fragcoor.xyz](https://fragcoor.xyz) — kein manueller Port nötig.

| SHADED-Domäne | Donor | Ebene | Was wir daraus wollen |
|---|---|---|---|
| Ozean-Habitat | `forbiddenlink/ocean-simulator` | **Habitat-Runtime** | bitECS, Populationen, Nahrungsketten, Schwarmverhalten, Räuber/Beute, Strömungseinfluss, 500+ Lebewesen, Unterwasserlicht/Kaustiken. Starker Gesamtspender. |
| Ozean-Oberfläche | `GarrettGunnell/Water` | **Surface-Referenz (strikt)** | Sum-of-Sines/Gerstner klein → FFT/Tessendorf + Dual-JONSWAP groß, analytische Normalen, Fresnel, Microfacet-BRDF, approx. SSS. Der Autor selbst: „Please use as a reference for your own shaders". |
| Süß-/Poolwasser | `idootop/webgl2-water` | **Flachwasser-Renderer** | Klares, begrenztes Wasser: Refraction, Caustics, Soft Shadows, Float-Heightfield-Sim. Für Teiche, Becken, klares flaches Wasser. Evan-Wallace-Linie, WebGL2/Three.js. |
| Stille/leichte Gewässer | `rarietta/WebGL` | **Oberflächen-Bewegung (leicht)** | Sinus-/Noise-Wellen auf der GPU, Normalen, Specular. Billige ruhige Oberflächen. Bewusst enges Label: kein Stillgewässer-Solver. |
| Wetter | `niels747/2D-Weather-Sandbox` | **Atmosphären-Solver** | Der Wettergesetzgeber: Fluidgrid, Druck, Temperatur, Feuchte, Kondensation, Eis/Schnee/Regen, Verdunstung, Downdrafts, Oberflächenwechselwirkung. Nicht bloß hübsche Wolken. |
| Feuer | `niels747/GLFW_fire_simulation` | **Verhaltens-Solver** | Feuer-/Gasphysik: mehrere Gase, Druck, Temperatur, Fluidbewegung. Behaviour-Donor; der finale Feuer-Look wird getrennt behandelt. Bekannte Lücke laut README: keine Vorticity Confinement (wirkt viskos) — der Standard-Fix ist bekannt. |

## Zwei Beobachtungen

1. **ocean-simulator und Garrett überschneiden sich absichtlich.** Ocean Simulator bringt selbst FFT-Oberfläche, Foam/Spray, Beer-Lambert, Caustics mit. Garrett bleibt, weil Garrett das Wasser systematisch zerlegt und ausdrücklich als Shader-/Simulationsreferenz gebaut ist. Das eine ist eine lebende Meereswelt, das andere das Wasser-Oberflächenlehrbuch.
2. **Niels bekommt zwei Plätze zu Recht.** Im Wetter-Entwicklungspfad steht Feuer bereits als Wechselwirkung: Vegetation, Trockenheit, Rauch, Feuer-Ausbreitung, Wind. Wetter und Feuer konsumieren später dieselben Weltfelder, statt zwei unabhängige Effekte zu sein.

## Bewusst unbesetzt

Nicht „noch mehr Wasser", sondern die anderen hydrologischen Zustände:

**Fluss/Strömung → Grund-/Sickerwasser → Schlamm/Nassboden → Eis/Schnee → Küsteninteraktion.**

Dafür wird nicht wieder auf Donor-Jagd gegangen. Diese sechs reichen, um Wasser + Wetter + Feuer als zusammenhängendes System zu definieren. Andere bereits festgelegte SHADED-Donors für Solver/Material/Runtime/Reconstruction bleiben davon unberührt und werden im `GOAL.md`-Registry geführt.