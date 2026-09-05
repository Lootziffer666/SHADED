# Hydrology — Hydrological Continuity

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md), [`DONORS.md`](./DONORS.md), [`WORLD_KERNEL.md`](./WORLD_KERNEL.md), [`VEGETATION.md`](./VEGETATION.md). Beantwortet die in DONORS.md bewusst unbesetzte Liste.

## These

Nicht fünf neue Features. **Ein einziger Stoffkreislauf, der nie „das System wechselt".**

Der Fehler wäre:

```
Fluss-System → Groundwater-System → Mud-System → Snow-System → Coast-System
```

Das wäre wieder eine Sammlung guter Effekte. Stattdessen:

```
WASSER
├─ auf Oberfläche
├─ in Bodenporen
├─ im Grundwasser
├─ gebunden in Schlamm
├─ gefroren als Eis
├─ gefallen als Schnee
├─ verdampft in Luft
└─ salzhaltig an Küste
```

Es bleibt immer dieselbe Materie. Nur Zustand, Ort und Bindung ändern sich.

## Das Wasser-Ledger

Pro Zelle nicht fünf getrennte Wahrheiten, sondern ein Bestand mit Partitionen:

```
water.total
water.surface · water.soil · water.ground · water.ice · water.snow · water.vapor
water.velocity · water.temperature · water.salinity · water.sediment · water.dissolvedMatter
```

Mapping auf den bestehenden Kernel: `surface` → `WATER`, `soil` → `WETNESS`, `ground` → `GROUNDWATER`, `ice` → `ICE`, `snow` → `SNOW`, `vapor` → `VAPOR`/`CLOUD`, `velocity` → `VELOCITY`, `temperature` → `HEAT`, `sediment` → `SEDIMENT`. Neu wären nur `salinity` und `dissolvedMatter`. Was das Ledger hinzufügt, ist keine neue Feldliste, sondern die **Erhaltungsregel**: Transfers verschieben Bestand — sie erzeugen oder vernichten ihn nicht.

## Funktionen sind nur noch Transfers

| Name | Transfer |
|---|---|
| Regen | `vapor → surface` |
| Versickerung | `surface → soil` |
| Perkolation | `soil → ground` |
| Quelle | `ground → surface` |
| Verdunstung | `surface / soil → vapor` |
| Gefrieren | `liquid → ice` |
| Schmelzen | `ice / snow → liquid` |

Das ist der Unterschied zwischen Feature-Katalog und Weltmodell.

## Schlamm ist kein System

`soil + water + particle size + organic matter + compaction = aktueller Bodenzustand`.

- Trocken (`soilWater` niedrig) → fest, staubig
- Feucht (`soilWater` steigt) → dunkler, weicher, Pflanzen profitieren
- Gesättigt (`soilWater ≈ pore capacity`) → Schlamm: Tragfähigkeit sinkt, Sediment wird mobil
- Noch mehr Wasser → `surfaceWater` entsteht: Pfütze, Bach, Überflutung

Kein Umschalten auf „Mud Mode".

## Schnee und Eis

Schnee ist kein weißes Overlay auf Terrain. Er ist Niederschlag + Temperatur → gefrorene Wassermasse auf der Oberfläche. Er kann schmelzen, erneut gefrieren, verdichten, Wasser speichern, Boden isolieren, Abfluss verzögern und beim Schmelzen Grundwasser speisen. Damit wird ein warmer Nachmittag hydrologisch relevant.

Snowflow liefert Eis und Schnee bereits eindrucksvoll — das Ledger gibt diesem Bestand hydrologische Kontinuität, statt ihn zu ersetzen.

## Küste ist kein Spezialfall

Küste ist nur die Stelle, an der mehrere kontinuierliche Felder zusammentreffen:

```
freshWater + saltWater + waves + groundwater + sediment + terrain
```

Daraus entstehen Brackwasser, Sedimenttransport, Erosion, Ablagerung, Strand, Marschland, versalzter Boden, entsprechende Vegetation. Kein `coastInteraction()` — Küsteninteraktion als Konsequenz.

## Die harte Architekturregel

> **SHADED darf Wasser niemals zerstören und als anderes Feature neu erzeugen.**

Ein Liter, der in den Boden sickert, existiert dort weiter. Fließt er dreißig Meter weiter und tritt als Quelle aus: derselbe Bestand. Gefriert er im Winter: derselbe Bestand. Nimmt eine Pflanze ihn auf:

```
soilWater → plantWater → transpiration → atmosphericVapor
```

Hier schließen sich die Wurzeln an (siehe VEGETATION.md): Wurzeln verändern Porosität, schaffen Wasserpfade, ziehen Bodenwasser, stabilisieren Sediment — und verändern dadurch den späteren Oberflächenabfluss.

## Hydrological Continuity

Statt „Fluss → Grundwasser → Schlamm → Eis → Küste":

```
Atmosphäre ↕ Oberfläche ↕ Boden ↕ Grundwasser ↕ Vegetation
+ Temperatur verändert Phase
+ Gelände verändert Bewegung
+ Material verändert Infiltration
+ Salz/Sediment reisen mit
```

## Donor-Rollen neu gelesen

Nicht mehr: welcher Donor simuliert welchen Wassertyp. Sondern: **welcher Donor drückt welchen Ausschnitt desselben Kreislaufs am besten aus.**

| Donor | Ausschnitt desselben Kreislaufs |
|---|---|
| `GarrettGunnell/Water` | Oberflächenzustände, klein → groß |
| `idootop/webgl2-water` | begrenztes klares Wasser |
| Particles4All | Zustand ↔ lokale physische Darstellung |
| `niels747/2D-Weather-Sandbox` | Atmosphäre — Gase, Druck, Phasen inkl. Eis/Schnee bereits vorhanden |

Vier Ansichten eines Bestands.
