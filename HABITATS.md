# Habitats

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md), [`DONORS.md`](./DONORS.md), [`WORLD_KERNEL.md`](./WORLD_KERNEL.md), [`VEGETATION.md`](./VEGETATION.md), [`HYDROLOGY.md`](./HYDROLOGY.md).

## These

Kein „ein Tier läuft herum". **Habitate mit Stoff- und Nahrungskreisläufen und eigenständigen Bewohnern.**

## Die Habitat-Matrix

```
SHADED WORLD
        │
   ┌────┼─────────────┐
   │    │             │
 OCEAN TERRESTRIAL  FRESHWATER
   │    │             │
ocean-  lila        SimFish
simulator
   │    │             │
 sea   soil/water/  nutrient loop
 food  life/metabo- plants/waste
 web   lism/ecology fish/snails
                     /shrimp/algae
```

Darunter Land-Fauna, darüber unser eigener Weltkern (Wetter, Wasser, Boden, Licht, Temperatur, Vegetation, Feuer):

```
Weltkern → HABITAT STATE → Bewohner reagieren → Bewohner verändern Habitat
```

## Die drei unbedingt sichern (S++)

| Biom/Rolle | Repo | Was es beweist |
|---|---|---|
| **Marine Habitat** | `forbiddenlink/ocean-simulator` | Wie sich ein Meeres-Habitat verhält: Food Web, Schooling, Hunting, Strömung |
| **Terrestrial Habitat Core** | `hellolifeforms/lila` | Wie ein terrestrisches Ökosystem denkt: Arten als Trait-Vektoren (Körpermasse, Ernährung, Fortbewegung, Thermoregulation) in JSON, daraus abgeleitet Metabolismus und Verhalten; Weltgrid `moisture / temperature / organic_matter / nutrients_fast / nutrients_slow` mit atomarem Effect-System; Godot-3D-Frontend; Apache-2.0; hat sogar Rain + Record als Interaktion |
| **Closed Nutrient / Freshwater** | `mhsenkow/SimFish` | Wie viele kleine Rückkopplungen ein Habitat braucht, damit es nicht nach Spawnliste aussieht: Substrat → Nährstoffe → Pflanzen → Tiere → Waste/Detritus → Substrat; voxelweises Pflanzenwachstum, Genome + Behaviour Trees, Balz/Altern/Tod, Garnelen/Schnecken/Muscheln als Detritus-Kreislauf, Seitentriebe nach apikal Dominanzverlust, Seed Bank, CO₂/O₂-Zyklen, Algen, Temperaturstress; MIT |

## Land-Fauna (A-tier)

| Repo | Ebene | Was wir daraus wollen |
|---|---|---|
| `Yvidge/EcosystemSimulator` | **Verhaltens-Archetypen** | HERBIVORE / PREDATOR / SCAVENGER / HERD ANIMAL / LARGE HERBIVORE als Archetypen, durch Tierdaten parametrisiert; komponentenzerlegte Tiere (Lebenszyklus, Metabolismus, Nahrung, Reproduktion, Stamina); Nahrung kann verfallen → Scavenger werden sinnvoll. UE4 — Technologie egal, Architektur zählt. |
| `shrivastavasamarth22/ecosystem-simulation` | **Population Core** | Data-oriented C++, MIT: sechs Biome mit WFC-Übergängen, Ressourcen getrennt vom Terrain, Hunger, Altern, Verletzungen, Konkurrenz, Herden, Rudel, Pack Hunting, Territorialität, gerichtetes Sichtfeld. Zeigt, wie hunderte Lebewesen laufen, ohne aus jedem Reh einen GameObject-Gott zu machen. |
| `Wornox/AnimalFarmFramework` | **Evolution / Genetics** | Geschlossenes 3D-Ökosystem, Predator/Prey + genetische Evolution, Populationen, Metabolismus, Vererbung; WebGL-Build. Referenz, nicht erster Implementierungsdonor. |
| `ztjhz/EcoVR` | **Habitat-Präsentation** | Begehbarer 3D-Wald, First Person + Vogelperspektive, autonome Wölfe/Beute, Hunger/Durst/Geburt/Tod, Wetter + Tag/Nacht beeinflussen Verhalten. Ökologisch simpler als lila — zeigt, wie ein Habitat als Ort wirkt. |

## luminous-lake: Kohärenz, kein Core

`stas4000/luminous-lake` (Three.js, WebGPU-first, MIT): See, Wald, Fische, Hirsche, Füchse, Vögel, Enten, Wetter, Wind, Tag/Nacht — **ein gemeinsames Wellenfeld** bewegt Wasser, Boot, Enten und Fischinteraktionen, **ein gemeinsamer Wind** treibt Bäume, Wasser und Boot. Aber: keine dokumentierte Nahrungskette/Jagd/Reproduktion. Das ist der Donor für „Wie mache ich ein Habitat visuell kohärent?" — nicht fürs Ökosystem.

## Die eigentliche Erkenntnis

**Biome sind Konfigurationen derselben ökologischen Verfassung** — keine eigenen Maschinen:

- **Wüste:** wenig Niederschlag, hohe Evapotranspiration, große Temperaturamplitude, geringe Biomasse, bestimmte Trait-Ranges
- **Tundra:** Permafrost, kurze Wachstumszeit, Schneepersistenz, geringe Dekomposition
- **Savanne:** saisonaler Regen, Grasdominanz, Feuerregime, große Herbivoren

Es werden nur Habitat-Donors gebraucht, die fehlende Gesetzesklassen beibringen — kein „Desert Simulator", „Tundra Simulator", „Rainforest Simulator".

## Verzahnung mit dem Weltkern

WORLD_KERNEL.md sagt „Fauna: nicht jetzt" — und bleibt richtig. Dieses Dokument bereitet die Donor-Landschaft vor, es sortiert nicht um. Zwei Brücken sind bereits sichtbar:

- **lilas Weltgrid** (`moisture / temperature / organic_matter / nutrients_fast / nutrients_slow`) mappt fast eins zu eins auf unsere GROUND-Gruppe (`WETNESS / HEAT / organisches Material / Nährstoffe`) — derselbe Gedanke, unabhängig gebaut.
- **SimFishs Kreislauf** (Substrat → Nährstoffe → Pflanzen → Tiere → Waste → Substrat) ist der Weltkern-Zyklus in Miniatur — inklusive der Erhaltungsregel aus HYDROLOGY.md.
