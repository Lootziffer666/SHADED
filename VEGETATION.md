# Vegetation

Companion document to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md).

## Prinzip

**Erst Leben/Zustand/Wachstum, dann Geometrie und Visuals.**

SHADEDs bestehender Triebkern ist der **Runtime Growth Core** — externe Repos sind **Law Donors**, keine Growth Engines.

## Sieben Ebenen

| Ebene | Donor | Rolle |
|---|---|---|
| **Runtime Growth Core** | **SHADED selbst** | Triebe entstehen, Segmente wachsen, Verzweigung passiert, anschließend bewegen Wind/Gewicht die gewachsene Struktur. |
| **Wachstums-/Verzweigungsgesetze** | `GoodPie/modular_tree` | Meristeme, Vigor/Energie pro Ast, apikale Dominanz, Schwellen für Wachsen/Teilen/Absterben, laterale Knospenaktivierung, Gravitropismus, mechanisches Durchhngen, Blütenbildung. Alles iterativ. |
| **Umwelt → Pflanzenphysiologie** | `CPlantBox` | FSPM: Wurzeln/Stngel/Blter als evolvierende Organe, Wasser-/Kohlenstoffdynamik, Bodeninteraktion. Weltfelder → plant state → growth. |
| **Gras-/Kraut-Morphogenese** | `OpenAlea CNW-Grass / L-Grass` | 3D-FSPM: Triebmorphogenese, Blatt-/Internodienverlngerung, Wurzelwachstum, Photosynthese, Wasserfluss, Transpiration, Seneszenz, C/N-Allokation. |
| **Baum-/Pflanzenmorphologie + LOD** | `SeedThree` | Weber-Penn + L-Systeme, Artenparameter, Blattkarten, Translucency, Wind, LOD0→LOD1→Branch Cards→Billboard, instanzierte Wlder. |
| **Blatt-/Feinwind** | `VegetationGeneratorThreeJS` | Efeu über Meshes; Blatt als starre Flche mit Scharnier, Winddruck, wandernde Ben, individuell verstimmtes Flutter. |
| **Bestehende Wind-/Grass-Shader** | unsere bisherigen Grass-Donors | Weiterhin verwendet, klar als reine Optik eingeordnet. |

## Keine weitere Donor-Jagd

Diese sieben Ebenen decken das gesamte Vegetations-Spektrum ab. Das Modell ist richtig herum gebaut: Leben/Zustand/Wachstum zuerst, Geometrie/Visuals danach.
