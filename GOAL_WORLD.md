# GOAL.md — SHADED Canon / Architecture / Implementation / Verification Goal

> **Bindende Arbeitsgrundlage.** Dieses Dokument konsolidiert die wiederholt bestätigten SHADED-Anforderungen aus den Projektgesprächen mit den kanonischen Repo-Dokumenten. Es ist keine Ideenliste. Ein Punkt darf erst als erfüllt gelten, wenn Dokumentation, aktiver Codepfad und Verifikation übereinstimmen.

## 0. Autorität, Prüflogik und Umgang mit Widersprüchen

Für jeden Punkt gilt:

```text
DOCUMENTED INTENT
      ↓
ACTIVE IMPLEMENTATION
      ↓
VERIFIED BEHAVIOUR
```

- [ ] **G-0001** Kein Punkt gilt als erfüllt, wenn er nur dokumentiert, aber nicht implementiert ist.
- [ ] **G-0002** Kein Punkt gilt als erfüllt, wenn Code existiert, aber der aktive Produktionspfad ihn nicht benutzt.
- [ ] **G-0003** Kein positiver Test genügt, wenn der ersetzte alte Pfad weiterhin aktiv sein kann.
- [ ] **G-0004** Für REPLACE / MIGRATE / ABSORB gilt immer: `NEW OWNER EXISTS` **und** `OLD OWNER IS GONE`.
- [ ] **G-0005** Jeder Abschlussnachweis nennt pro Anforderung `DOC`, `CODE`, `TEST` oder ein begründetes `N/A`.
- [ ] **G-0006** Widersprüche zwischen Dokumenten werden explizit aufgelöst; es wird nicht stillschweigend das bequemste Dokument gewählt.
- [ ] **G-0007** Neuere, ausdrückliche Maintainer-Entscheidungen überschreiben ältere Notizen, Prototypannahmen und historische Architekturtexte.
- [ ] **G-0008** Historische Dateien, Gesprächsexporte, Donor-Prototypen und alte Branches sind Evidenz/Donor, nicht automatisch Kanon.
- [ ] **G-0009** `CELL_STRIDE`, Texture Packing, Buffers, Dateiformate und Backend-Layouts sind Repräsentation, nicht Bedeutung.
- [ ] **G-0010** Keine Behauptung „done“, solange FAIL/TODO/ungeprüfte Restpfade oder widersprüchliche kanonische Aussagen bestehen.

## 1. Dokument-Hierarchie und Reconciliation

Diese Dokumente müssen gegeneinander und gegen den aktiven Code geprüft werden:

- `GOAL.md` — konsolidierte bindende Ziel-/Compliance-Liste.
- `WORLD_ARCHITECTURE.md` — aktive World-/Runtime-Richtung.
- `WORLD_KERNEL.md` — gemeinsame Weltzustände und Kausalität.
- `MATERIALS.md` — Materialidentität, Zustände, Material Response.
- `STATE.md` — Source, World State, History, Persistenz, Provenienz.
- `OPERATORS.md` — `STATE → OPERATOR → STATE`, forward/inverse.
- `PHYSICS.md` — mechanische Realität und World-State-Kopplung.
- `HYDROLOGY.md` — Wassererhaltung und Reservoir-/Phasentransfer.
- `VEGETATION.md` — Life-State und Umweltkopplung.
- `HABITATS.md` — Habitat-/Populationsebene.
- `GAMEPLAY.md` — Ursachen setzen, Konsequenzen entstehen.
- `STUDIO.md` — Editor/Spiel-/UI-Vertrag.
- `DONORS.md` — Donor-Rollen, Lizenz, Provenienz.
- `SHADER_IR.md` — semantische Übersetzung statt Donor-Repräsentationskopie.
- `VERIFICATION.md` — Beweis-/Prüfvertrag.
- `CLAUDE.md`, `docs/ENTRYPOINTS_AND_CONTRACTS.md`, `docs/EXECUTION_PLAN.md`, `docs/UI_ZERO.md`, `docs/STYLE_DISCOVERY.md` — Status, Entry Points, Ausführungsreihenfolge und historische/parked Verträge; sie dürfen die aktive Maintainer-Richtung nicht widersprechen.
- Rekonstruktionsdokumente unter `docs/` und `.claude/skills/` — Provenienz-/Mess-/Providerverträge.

- [ ] **G-0101** Jedes relevante Dokument ist als `CANONICAL`, `SCOPED`, `HISTORICAL`, `RESEARCH`, `DONOR` oder `EXPERIMENT` erkennbar.
- [ ] **G-0102** Keine alte Aussage darf Snowflow als endgültigen Runtime-Owner führen.
- [ ] **G-0103** `UI_ZERO`/parked-engine-Regeln dürfen die aktive SHADED-Spiel-/Editor-UI nicht versehentlich verbieten.
- [ ] **G-0104** Aussagen über „Snowflow = Appearance/Geometry/Runtime Host“ werden aktualisiert oder als superseded markiert.
- [ ] **G-0105** Aussagen, die die aktuelle Sandbox als 2D behandeln, werden korrigiert: SHADEDs aktive Sandbox ist 3D; Sandspiel ist ein 2D-Technikdonor, kein Raum-/Formdonor.
- [ ] **G-0106** Snowflow-„Surfing“ wird nicht als benötigtes Gameplay-Feature dokumentiert; siehe Scher-/Schichtstabilität.
- [ ] **G-0107** Particles4All wird nicht mehr als kanonischer SHADED-Materialkern geführt; diese frühere Richtung ist ausdrücklich verworfen.
- [ ] **G-0108** Snow-spezifische Regeln werden nicht pauschal zu Sand/Mud/Earth-Regeln umbenannt. **Der Vertrag wird generalisiert, material-spezifische Gesetze bleiben material-spezifisch.**

## 2. Ein Projekt, eine semantische Maschine

- [ ] **G-0201** SHADED ist ein universeller räumlicher World-/Reconstruction-Kernel; konkrete Anwendungen sind Consumer/Rezepte, nicht konkurrierende Wahrheiten.
- [ ] **G-0202** Simulation und Reconstruction benutzen dieselben semantischen Zustände/Operatoren in unterschiedlicher Richtung.
- [ ] **G-0203** Jede 2D-Referenz-/Analyse-/Sandbox-Repräsentation und die 3D-/Physics-Runtime teilen dieselbe `WORLD_LANGUAGE`: gleiche Bedeutungen, Einheiten, Material-IDs, Phasen, Provenienz und Erhaltung; Repräsentation darf verschieden sein.
- [ ] **G-0204** Es gibt keinen semantischen „Converter Layer“ zwischen zwei Wahrheiten. Adapter konvertieren nur Repräsentation.
- [ ] **G-0205** Mindestens ein 2D→3D→2D- bzw. Observation→World→Observation-Roundtrip beweist die gemeinsame Semantik.
- [ ] **G-0206** `WORLD STATE + CONTRACTS + OPERATORS + LAWS + PROVENANCE + RESIDUALS` bilden die kanonische Denkeinheit.
- [ ] **G-0207** Wenn Beobachtung und Modell nicht zusammenpassen, wird der Residual als fehlende/fehlerhafte Hypothese oder Constraint untersucht, nicht durch Überschreiben von Evidenz versteckt.

## 3. Ownership — genau ein aktiver Besitzer pro Verantwortung

- [ ] **G-0301** Für jedes aktive Subsystem ist genau ein Owner identifizierbar.
- [ ] **G-0302** Owner aktiver Runtime-Systeme ist SHADED, niemals ein Donor.
- [ ] **G-0303** Kein Renderer, Shader, Donor-Modul oder UI-Control besitzt eine zweite Material-/World-Wahrheit.
- [ ] **G-0304** Kein alter Pfad bleibt „vorsichtshalber“ parallel aktiv, wenn er ersetzt wurde.
- [ ] **G-0305** Kein Adapter darf verschleiern, dass weiterhin der alte Donor die Autorität besitzt.
- [ ] **G-0306** Kein Compatibility-Toggle darf zwei konkurrierende Wahrheiten dauerhaft erhalten.
- [ ] **G-0307** Für Terrain/Surface, Materials, World State, Physics, Water, Weather, Vegetation, Input und UI ist der aktive Owner eindeutig.
- [ ] **G-0308** Jede Migration dokumentiert `OLD OWNER`, `NEW OWNER`, `REMOVED PATH`, `REMAINING PROVENANCE`.

Prüffrage für jedes Modul:

```text
WHO OWNS THIS?
WHO WRITES THE TRUTH?
WHO READS THE TRUTH?
IS THERE ANOTHER ACTIVE OWNER?
```

## 4. Snowflow vollständig absorbieren

Endzustand: **Snowflow erscheint nur noch in README/About/Credits/Donor-Provenienz als UI- und Schnee-Donor.**

- [ ] **G-0401** Kein Snowflow-Runtime-Entry bleibt erforderlich, um SHADED zu booten.
- [ ] **G-0402** Kein Snowflow-Terrain bleibt als Basiswelt unter SHADED liegen.
- [ ] **G-0403** Kein `snow.fragment.wgsl` oder äquivalenter Snowflow-Schneeshader definiert die allgemeine Terrain-/Surface-Wahrheit.
- [ ] **G-0404** Kein Snowflow-`rockMask` entscheidet unabhängig vom World State über Materialidentität.
- [ ] **G-0405** Kein Snowflow-Deformationsmodell ist implizit das allgemeine Materialgesetz.
- [ ] **G-0406** Keine Snowflow-Spells, Character-, Surf- oder Demo-Systeme bleiben Architekturabhängigkeit.
- [ ] **G-0407** Allgemein nützliche Terrain-/Clipmap-/GPU-/Shadow-/Depth-/Atmosphere-/Camera-Technik darf übernommen werden, wird aber SHADED-owned und neutral benannt.
- [ ] **G-0408** Snowflow-Schnee bleibt als hochwertige Donor-Implementation erhalten und wird später als SHADED-Snow-Zustand/Materialprovider angeschlossen.
- [ ] **G-0409** Snowflow-UI darf als Design-/Interaction-Donor dienen; finale UI ist SHADED-owned.
- [ ] **G-0410** Finaler Grep nach `Snowflow`/`SNOWFLOW` in aktiver generischer Runtime ergibt 0 zulässige Architekturtreffer.
- [ ] **G-0411** Endtest: Snowflow-Credits könnten aus README/About entfernt werden, ohne dass die laufende Runtime technisch davon abhängig wäre.

## 5. SHADED World Surface Contract

Nicht:

```text
Snowflow surface
   + SHADED overlay
```

Sondern:

```text
SHADED WORLD STATE
      ↓
SURFACE RESOLUTION
      ↓
MATERIAL RESPONSE
      ↓
GEOMETRY / NORMALS / LIGHT / DEPTH / SHADOW / COLLISION
```

- [ ] **G-0501** Ein expliziter materialunabhängiger SHADED Surface Contract existiert.
- [ ] **G-0502** Surface Height, Vertex Displacement, Fragment-Normalen, Depth/Prepass, Shadow Casting, Collision und Grounding sehen dieselbe Oberfläche.
- [ ] **G-0503** Surface Gradient/Normals werden aus der tatsächlich simulierten Form abgeleitet.
- [ ] **G-0504** Deformation verändert World/Surface State, nicht nur sichtbare Pixel.
- [ ] **G-0505** Material Response wird aus Surface/World State bestimmt, nicht umgekehrt.
- [ ] **G-0506** Materialidentität wird niemals aus Renderfenster, Donor-Mask, Shader-Fallback oder UI-Zustand abgeleitet.
- [ ] **G-0507** Lokales Simulationsfenster und globale sichtbare Welt benutzen dieselbe Materialsemantik.
- [ ] **G-0508** Mesh-Oberfläche ist eine mögliche Repräsentation, nicht die semantische Wahrheit; beliebige Geometrie kann denselben Materialvertrag erhalten.

## 6. Sand ist die erste vollständige Referenzimplementation

- [ ] **G-0601** Default-Welt ist Wüste/Sand; sichtbare Landschaft darf nicht aus dunklem Snowflow/Fels mit etwas Sandauflage bestehen.
- [ ] **G-0602** Ein 100%-Sand-Test zeigt die komplette sichtbare Landschaft als Sand.
- [ ] **G-0603** `FIELD.SAND` ist physischer Zustand/Masse/Schicht, nicht direkte RGB-Helligkeit.
- [ ] **G-0604** Weniger Sand macht einen Pixel nicht automatisch schwarz oder zu Fels.
- [ ] **G-0605** Surface Material bleibt Sand, solange eine physisch ausreichende Sandschicht den Untergrund bedeckt.
- [ ] **G-0606** Bedrock/Fels wird nur durch tatsächliche Freilegung sichtbar.
- [ ] **G-0607** `colorForCell` bzw. äquivalente 0..255-Farbkomposition ist Debug/Preview oder wird sauber in Materialparameter übersetzt; sie ist nicht die Produktionsmaterialwahrheit.
- [ ] **G-0608** sRGB/linear-HDR ist korrekt; keine 0..255-artigen Werte gelangen ungeprüft als lineare HDR-Werte in den Renderer.
- [ ] **G-0609** Sand besitzt eigene Albedo/Roughness/Optik unter dem SHADED Material Contract; Schnee-Exposure/Schnee-BRDF bestimmen ihn nicht.
- [ ] **G-0610** Sandbox-Höhengradient beeinflusst Fragment-Normalen konsistent mit Vertex/Depth/Collision.
- [ ] **G-0611** Sand läuft vollständig durch `State → Geometry → Normals → Material → Lighting → Depth → Shadows → Collision → Interaction`.
- [ ] **G-0612** Erst wenn Sand diese vertikale Kette vollständig erfüllt, werden weitere Materialien als gleichberechtigte Contract-Implementierungen erweitert.

## 7. Materialzustände statt Spezialeffekte

- [ ] **G-0701** Materialidentität und Materialzustand sind getrennt.
- [ ] **G-0702** Materialien sind World Entities mit veränderlichem Zustand, keine Renderlabels.
- [ ] **G-0703** Holz kann z. B. dry/wet/hot/burning/charred werden, ohne seine Identität durch einen Effekt auszutauschen.
- [ ] **G-0704** Soil kann dry/damp/wet/saturated/mud/cracked werden.
- [ ] **G-0705** Wasser/Schnee/Eis/Dampf sind gekoppelte Phasen/Reservoirzustände, keine isolierten VFX-Schalter.
- [ ] **G-0706** Mud entsteht kausal aus Ground + Water + Materialparametern; kein privates Mud-System.
- [ ] **G-0707** Schnee ist Zustand/Materialprovider, niemals Renderer-Fundament.
- [ ] **G-0708** Schnee-SSS, Glints, Wrap, Thickness, Compression/Sastrugi usw. aktivieren sich nur aus tatsächlichem Snow State.
- [ ] **G-0709** Feuer-Shader ist visuell; World Simulation besitzt Temperatur, Fuel, Ignition, Spread, Smoke, Moisture, Ash.
- [ ] **G-0710** Grass-/Vegetationsshader sind visuelle/Interaktionsdonoren; Life State bleibt World-State-owned.

## 8. Feldtransport / FieldBox / gleiche Ressourcen

- [ ] **G-0801** Semantische Felder bleiben kanonisch unabhängig von ihrer Texture-/Buffer-Packung.
- [ ] **G-0802** `sandboxTex` darf als bestehender Transport/Kompositionskanal erhalten bleiben, wenn seine Rolle klar begrenzt ist.
- [ ] **G-0803** Renderer-facing unabhängige Felder wie `FIELD.SNOW` werden über einen expliziten Auxiliary-Field-Container/`FieldBox` transportiert statt aus Appearance/Temperature neu erfunden.
- [ ] **G-0804** Initiale einfache Repräsentation (z. B. R32F) darf später gepackt/erweitert werden; Semantik bleibt stabil.
- [ ] **G-0805** Alle relevanten Passes konsumieren denselben kanonischen Feldzustand; kein Pass rekonstruiert Snow/Wetness/etc. prozedural aus Bildfarbe.
- [ ] **G-0806** `FIELD.SNOW`, `FIELD.WETNESS`, `FIELD.WATER`, `FIELD.ICE` usw. sind gemeinsame semantische Wahrheit für aktive und später reaktivierte Subsysteme.

## 9. Gemeinsamer World Kernel

Mindestens folgende Zustandsgruppen müssen kohärent gekoppelt sein: `ENERGY`, `AIR`, `WATER`, `GROUND`, `LIFE`, `HISTORY`.

- [ ] **G-0901** Keine private `fireTemperature`, wenn eine gemeinsame Temperaturwelt existiert.
- [ ] **G-0902** Kein separates Vegetationswindfeld neben dem kanonischen Windfeld.
- [ ] **G-0903** Kein privater Wasser-Bodenzustand neben kanonischer Ground Moisture/Saturation.
- [ ] **G-0904** Kein Renderer-Schneezustand neben `FIELD.SNOW`.
- [ ] **G-0905** Keine sichtbare Ash/Char-/Wetness-/Snow-Wahrheit ohne World-State-Ursache.
- [ ] **G-0906** Feldnamen, Einheiten und Bedeutung werden repo-weit vereinheitlicht (`moisture` vs `WETNESS` etc. auditieren).
- [ ] **G-0907** Unterschiedliche Backends dürfen unterschiedliche Speicherlayouts, aber niemals unterschiedliche Feldbedeutungen haben.

## 10. Ground / Soil als Weltgedächtnis

- [ ] **G-1001** Ground besitzt Materialidentität/Substrat, nicht nur Terrain Height.
- [ ] **G-1002** Porosity/Permeability beeinflussen Infiltration/Seepage.
- [ ] **G-1003** Moisture/Saturation sind persistente Zustände.
- [ ] **G-1004** Ground Temperature ist an Energy gekoppelt.
- [ ] **G-1005** Organic Matter/Nutrients oder klar definierte äquivalente Größen existieren dort, wo Life/Decay sie brauchen.
- [ ] **G-1006** Compaction verändert mechanisches/hydrologisches Verhalten.
- [ ] **G-1007** Sediment kann gelöst, transportiert und abgelagert werden.
- [ ] **G-1008** Ash/Char hinterlassen persistente Konsequenzen.
- [ ] **G-1009** Water, Fire, Vegetation und Contacts verändern Ground; Ground beeinflusst sie zurück.

## 11. Hydrologie und Massenerhaltung

- [ ] **G-1101** Wasser besitzt einen gemeinsamen konservierten Ledger über Surface Water, Soil Water, Groundwater, Vapor, Ice, Snow und ggf. Steam.
- [ ] **G-1102** Rain/Snowfall/Condensation/Evaporation/Freezing/Melting sind Transfers, keine Massenerzeugung aus dem Nichts.
- [ ] **G-1103** Infiltration transferiert Surface → Soil.
- [ ] **G-1104** Percolation/Seepage transferiert Soil → Groundwater.
- [ ] **G-1105** Springs/Exfiltration transferieren Groundwater → Surface.
- [ ] **G-1106** Pflanzenaufnahme/Transpiration schließen den biologischen Teil des Kreislaufs.
- [ ] **G-1107** Surface Flow und Subsurface Flow teilen dieselbe Wasserwahrheit.
- [ ] **G-1108** Porosity, Permeability, Capillarity und interne Erosion werden dort berücksichtigt, wo sie kausal relevant sind.
- [ ] **G-1109** Wasser kann Sediment, Nährstoffe und Samen transportieren.
- [ ] **G-1110** Keine isolierten River/Mud/Snow/Coast-Systeme mit eigener Wasserbilanz.

## 12. Atmosphäre, Wetter, Wind, Licht und Wärme

- [ ] **G-1201** Wind ist ein gemeinsames World Field.
- [ ] **G-1202** Derselbe Wind kann Vegetation, Fire/Smoke, Evaporation, Surface Water, Dust/Sand und Seed Dispersal treiben.
- [ ] **G-1203** Temperature und Humidity sind Weltzustände, nicht bloß Shaderparameter.
- [ ] **G-1204** Niederschlag entsteht aus Atmosphären-/Phasenbedingungen, nicht nur dekorativem Random Spawn.
- [ ] **G-1205** Atmosphere ↔ Surface ist bidirektional: Verdunstung, Kondensation, Niederschlag, latente Wärme, Orografie.
- [ ] **G-1206** Das 2D-Weather-Sandbox-Prinzip wird in 3D als volumetrische Atmosphäre erweitert; die aktive SHADED-Sandbox selbst bleibt 3D.
- [ ] **G-1207** Licht ist World State, nicht renderer-only.
- [ ] **G-1208** SHADED besitzt **per-cell light fields** bzw. äquivalente lokale Light/Exposure-Zustände.
- [ ] **G-1209** Licht/Schatten beeinflussen physische/biologische Prozesse wie Feuchte, Trocknung, Evaporation, Snow Melt und Vegetation.
- [ ] **G-1210** Radiant Energy/Heat dürfen auf World Processes wirken; visuelle Beleuchtung ist nicht die einzige Konsequenz.

## 13. Erosion, Transport und Rückkopplung

- [ ] **G-1301** Flowing Water kann Material lösen.
- [ ] **G-1302** Gelöstes Material kann transportiert werden.
- [ ] **G-1303** Material kann an anderer Stelle abgelagert werden.
- [ ] **G-1304** Rinnen/Becken/Hänge verändern sich dadurch real im World State.
- [ ] **G-1305** Roots/Vegetation können Stabilität und Erosion beeinflussen.
- [ ] **G-1306** Veränderte Geometrie verändert späteren Wasserfluss.
- [ ] **G-1307** Wasser kann Seeds/Nutrients verlagern und dadurch spätere Vegetation beeinflussen.
- [ ] **G-1308** Weltprozesse bilden Kausalketten/Rückkopplungen statt einmalige VFX.

## 14. Physics ist Teil derselben Welt

- [ ] **G-1401** Rigid Bodies, Contacts, Constraints, Friction/Restitution, Queries und Movement arbeiten gegen SHADED Surface/World State.
- [ ] **G-1402** Collision liest dieselbe Geometrie/Höhe wie Renderer, Depth und Grounding.
- [ ] **G-1403** Contact Impulse kann Material Stress erzeugen.
- [ ] **G-1404** Contacts können Soil Compaction verursachen.
- [ ] **G-1405** Contacts können Water verdrängen.
- [ ] **G-1406** Contacts können Roots/Vegetation beschädigen.
- [ ] **G-1407** Contacts können Sediment/lose Partikel verschieben.
- [ ] **G-1408** Physics schreibt World-State-Konsequenzen statt nur Body Position.
- [ ] **G-1409** World State beeinflusst umgekehrt Friction, Support, Stability und andere mechanische Response.

### Hang-/Schichtstabilität — ausdrücklich **kein Surfen**

```text
BODY CONTACT
    +
SLOPE
    +
SURFACE MATERIAL
    +
LAYER THICKNESS
    +
MOISTURE / COMPACTION / COHESION
    ↓
SHEAR FAILURE?
    ↓
TOP LAYER MOVES DOWNHILL
    ↓
BODY LOSES SUPPORT / IS CARRIED WITH IT
```

- [ ] **G-1410** Steiles Auf-/Absteigen ist normales Ground Movement; es gibt keinen künstlichen Surf-/Slide-Gameplaymodus als Ursache.
- [ ] **G-1411** Terrainkontakt kennt lokale Hangneigung und belastete oberste Schicht.
- [ ] **G-1412** Lockere obere Schichten besitzen Stabilitäts-/Scherparameter.
- [ ] **G-1413** Spieler/Rigid Bodies können die obere Schicht unter Belastung destabilisieren.
- [ ] **G-1414** Beim steilen Hoch-/Hinabsteigen kann die Schicht hangabwärts rutschen und den Körper mitnehmen bzw. Support entziehen.
- [ ] **G-1415** Sand/Schnee/Geröll/lockerer Boden reagieren gemäß ihren Materialparametern.
- [ ] **G-1416** Moisture/Compaction/Cohesion beeinflussen Stabilität materialabhängig.
- [ ] **G-1417** Verschobene Masse wird real im World State verlagert und bleibt danach verändert.
- [ ] **G-1418** Renderer, Collision und Physics sehen anschließend dieselbe neue Oberfläche.
- [ ] **G-1419** Dieselbe Mechanik gilt auch für andere Lasten (Steine, Tiere, Räder, fallende Objekte), nicht nur den Spieler.

## 15. Vegetation / Life

- [ ] **G-1501** Seeds sind Potentialzustand; „Saat setzen“ spawnt nicht unmittelbar eine fertige Pflanze.
- [ ] **G-1502** Germination hängt von geeigneter Moisture, Temperature, Light und Competition ab.
- [ ] **G-1503** Pflanzen entziehen Ground Water/Nutrients.
- [ ] **G-1504** Pflanzen verändern Licht/Schatten.
- [ ] **G-1505** Pflanzen erzeugen Biomass/Fuel.
- [ ] **G-1506** Pflanzen können beschädigt werden, sterben und zerfallen.
- [ ] **G-1507** Decay führt Material/Nutrients zurück.
- [ ] **G-1508** Roots reagieren auf Ground/Water und verändern Stabilität/Water Paths/Erosion.
- [ ] **G-1509** Life besitzt keine private Parallelwelt neben Ground/Water/Energy.
- [ ] **G-1510** Vorhandene Vegetationsdaten werden genutzt/validiert, statt pauschal als „nicht vorhanden“ verworfen zu werden.

## 16. Persistenz und History

- [ ] **G-1601** Brandnarben, Ash/Char und verbrannte Biomasse verschwinden nicht sofort.
- [ ] **G-1602** Compaction bleibt erhalten.
- [ ] **G-1603** Sedimentablagerungen bleiben erhalten.
- [ ] **G-1604** Mud/Wet Ground trocknet über State + Time.
- [ ] **G-1605** Wasserlöcher, Rinnen und veränderte Hänge bleiben als World History sichtbar/physisch wirksam.
- [ ] **G-1606** Damaged Vegetation besitzt History.
- [ ] **G-1607** Source bleibt von World History unterscheidbar; Current State entsteht aus Source + History/Operators.
- [ ] **G-1608** Persistenz ist Weltmechanik, nicht nur Savegame-Funktion.

## 17. Gameplay: Ursachen statt bestellter Konsequenzen

- [ ] **G-1701** Nutzer setzt Ursachen/Randbedingungen, nicht fertige Konsequenzen.
- [ ] **G-1702** „Wasser setzen/Quelle“ bedeutet Wasserzustand/Quelle, nicht „erzeuge Bach“.
- [ ] **G-1703** „Säen“ schreibt Seeds, nicht „erzeuge Vegetation“.
- [ ] **G-1704** „Hitze“ verändert Energy/Temperature, nicht direkt einen visuellen Melt-Schalter.
- [ ] **G-1705** Fire setzt kausale World States, nicht nur Feuer-VFX.
- [ ] **G-1706** Sichtbare Materialwechsel brauchen eine nachvollziehbare World-State-Ursache.
- [ ] **G-1707** Keine dekorative Emergenz ohne kausalen Pfad nur „weil es gut aussieht“.
- [ ] **G-1708** Leitprinzip: **kausal ausreichend, nicht vollständig** — genug gekoppelte Realität, dass reale Intuition greift und das Fehlende nicht auffällt.

## 18. Editor ist das Spiel / genau eine aktive UI

- [ ] **G-1801** Es gibt genau **eine** user-facing SHADED-UI mit kanonischem Root `/index.html`.
- [ ] **G-1802** Der Editor ist das Spiel selbst: Weltinteraktion ist primäre Bedienung, nicht ein separater Property-Panel-Simulator.
- [ ] **G-1803** Legacy `/editor/index.html`, iframe/launcher, hidden classic UI, zweite Compatibility-UI oder dauerhaft versteckte Ersatzpanels sind keine aktive Architektur.
- [ ] **G-1804** Fähigkeiten aus Legacy UI werden hinter kanonische SHADED Contracts migriert; alte DOM-Struktur wird nicht als API konserviert.
- [ ] **G-1805** DOM ist nicht die semantische Capability-API.
- [ ] **G-1806** Root HTML bleibt dünn; Runtime und UI sind modular getrennt.
- [ ] **G-1807** Kein neuer Giant Legacy Module / keine bloße Verlagerung von Spaghetti.
- [ ] **G-1808** Doppelter State, doppelte Handler und globale Kopplung werden beseitigt.
- [ ] **G-1809** Das aktive Shell-Konzept umfasst Viewport, Tool Rail, Inspector und responsive Mobile/Touch-Nutzung; Style Discovery gehört in dieselbe Shell statt als zweites Produkt daneben.
- [ ] **G-1810** Storyboard/Timeline, Actors, Persistence/Import-Export sowie nützliche World/Camera-Fähigkeiten bleiben als Capabilities erhalten, wenn Legacy UI entfernt wird.
- [ ] **G-1811** Superseded Effects/Shaders/Post-FX/Presets/Hacks und deren UI werden nicht nur aus Kompatibilitätsgründen wiederbelebt.

## 19. Input Ownership / Virtual Joystick Regression

- [ ] **G-1901** Es existiert exakt ein aktiver Touch-Movement-Provider.
- [ ] **G-1902** Es existiert exakt ein aktiver Touch-Look-Provider.
- [ ] **G-1903** Wenn ein neuer Joystick eingeführt wird, ersetzt er den alten aktiven Pfad vollständig.
- [ ] **G-1904** `main.js` bzw. der aktive Entry Point startet nachweislich den gewählten Provider.
- [ ] **G-1905** Alte `.stick-zone`, `.stick-base`, `.stick-knob`, `setupStick()` etc. dürfen nach Replacement nicht weiter mounten.
- [ ] **G-1906** „Library installiert/importiert/instanziierbar“ zählt nicht als Integration.
- [ ] **G-1907** Tests beweisen sowohl Existenz des neuen Controls als auch Abwesenheit des alten aktiven Owners.
- [ ] **G-1908** Move/Look-State folgt einem kanonischen Input Contract unabhängig vom UI-Donor.

## 20. Backend-, Geräte- und Fallback-Vertrag

- [ ] **G-2001** CPU Reference ist korrekt, deterministisch und Golden Behaviour Oracle.
- [ ] **G-2002** WebGPU Compute ist primärer schneller Pfad, aber niemals semantische Voraussetzung einer World Law.
- [ ] **G-2003** Bei WebGPU-Unverfügbarkeit ist der reale schnelle Fallback Rust/WASM Material-/World-Kernel + WebGL, nicht dauerhaft langsames JS als Produktpfad.
- [ ] **G-2004** Alle Backends zeigen dasselbe beobachtbare kausale Verhalten innerhalb definierter Toleranzen.
- [ ] **G-2005** Fallback bedeutet geringere Auflösung/Rate/Qualität, **nicht** deaktivierte Weltgesetze oder andere Logik.
- [ ] **G-2006** GPU ist Beschleunigung, nicht logische Capability-Anforderung.
- [ ] **G-2007** Device-first: Hardware wird profiliert; Budget/Representation/Resolution werden danach gewählt.
- [ ] **G-2008** Szene→Hardwarebedarf und Target-State→optimierter Stack können bestimmt werden; Smartphone-Alternativen werden mitgedacht.
- [ ] **G-2009** Interactive World Runtime läuft browser-local/PWA-fähig; Python-/Cloud-/Server-GPU darf keine Voraussetzung für die laufende Sandbox sein.
- [ ] **G-2010** Optionaler Reconstruction-/Provider-Compute bleibt modular und darf Runtime-Semantik nicht besitzen.

## 21. Simulation Scale / lokale und globale Welt

- [ ] **G-2101** Ein kleines CPU-Grid ist Referenz/Werkzeugfeedback, nicht die globale Weltgrenze.
- [ ] **G-2102** Player-following/toroidale GPU-Grids dürfen hochauflösenden lokalen Zustand halten, ohne außerhalb des Fensters Materialsemantik zu verlieren.
- [ ] **G-2103** Persistenz über Scroll/Region-Wechsel ist definiert; Hard Reset darf keine World History löschen.
- [ ] **G-2104** Sparse Readbacks/Queries dürfen Performance optimieren, ohne CPU/GPU zu zwei Wahrheiten zu machen.
- [ ] **G-2105** CPU owns discrete rigid-body/events/queries; GPU may own continuous fields, aber World-State-Semantik bleibt gemeinsam.

## 22. Reconstruction: Observation → World State → Representation

- [ ] **G-2201** Grundprinzip: `Observation → World State → Representation`.
- [ ] **G-2202** 3D erfindet nicht erneut Informationen, die aus 2D bereits ausreichend extrahiert wurden.
- [ ] **G-2203** `OBSERVED`/`MEASURED` bleiben unverändert; Korrekturen an Beobachtung sind explizit und ziehen abhängige Rekonstruktion neu nach.
- [ ] **G-2204** Regularisierung/Weltgesetze dürfen nur RECONSTRUCTED/INFERRED/GENERATED beeinflussen, nie MEASURED/OBSERVED überschreiben.
- [ ] **G-2205** UNKNOWN bleibt UNKNOWN, wenn Evidenz fehlt; fehlende Werte werden strukturell dokumentiert statt halluziniert.
- [ ] **G-2206** INFERRED Hypothesen bleiben von OBSERVED/MEASURED unterscheidbar.
- [ ] **G-2207** GENERATED Inhalt bleibt provenance-markiert; USER_APPROVED ist eine eigene, nachvollziehbare Klasse.
- [ ] **G-2208** Verdeckte/unbekannte Bereiche dürfen ergänzt werden, aber nicht als beobachtet ausgegeben werden.
- [ ] **G-2209** Rekonstruktion liefert lokal metrisch/geometrisch konsistente sichtbare Ausschnitte; sie erfindet keine unbeobachtete Hallenbreite/-tiefe oder Weltposition nur um ein Modell „vollständig“ zu machen.
- [ ] **G-2210** Externe bekannte Shell/Map/Constraints dürfen Plausibilität begrenzen, aber keine OBSERVED-Evidenz umschreiben.
- [ ] **G-2211** Agree → fuse; Unknown → andere Evidenz/Hypothese darf füllen; Conflict → inspizieren, **nicht mitteln**.
- [ ] **G-2212** Confidence und Provenienz bleiben über Fusion erhalten.
- [ ] **G-2213** Sichtbare Bildsegmente können begradigt/rectified, Beleuchtung getrennt und Texturen mit geometrischer Skala plausibilisiert werden, ohne Semantik zu verlieren.
- [ ] **G-2214** 2D↔3D-Projektion/Reprojektion wird als messbarer Operator behandelt; Perspektive/Isometrie darf nicht durch ad-hoc Pixelverschiebung zur „Wahrheit“ werden, ohne den zugrundeliegenden Kameravertrag zu dokumentieren.

## 23. Provenienz-Taxonomie und Unsicherheit

- [ ] **G-2301** Kanonische Klassen sind mindestens `MEASURED / OBSERVED / RECONSTRUCTED / INFERRED / GENERATED / USER_APPROVED`; zusätzliche Klassen wie `DECLARED` müssen eindeutig definiert und gemappt sein.
- [ ] **G-2302** Rohe Pixel und aus Pixeln gemessene Kanten/Konturen werden nicht vermischt: OBSERVED ≠ MEASURED.
- [ ] **G-2303** Ein vorgegebener Kalibrierungsanker ist DECLARED/Constraint, nicht „gemessen“.
- [ ] **G-2304** Eine numerische Unsicherheit (`±`) darf nur ausgegeben werden, wenn sie durch Ensemble/Sensitivität/Laplace/kalibrierte Methode verdient ist.
- [ ] **G-2305** Residual/Error Metric ist nicht automatisch kalibrierte Unsicherheit.
- [ ] **G-2306** Fehlende Messbarkeit degradiert zu UNKNOWN/DECLINED statt „richtig geraten“.

## 24. Provider-/Evidence-Fusion und Benchmarking

- [ ] **G-2401** Provider-Landschaft wird als mehrdimensionale Matrix geführt, nicht als eindimensionale Bestenliste.
- [ ] **G-2402** Jede registrierte Providerzeile hat traceable Source/Revision, Inputs, Outputs, Capabilities, Benchmarkability, Vergleichsgruppen, Redundanz, Value Classification und Drop Concerns.
- [ ] **G-2403** Keine Kandidaten/Capabilities/Provenienz erfinden, nur um die Matrix zu füllen.
- [ ] **G-2404** Vergleich erfolgt über vollständige Übergänge/Stacks (z. B. depth/point-map → geometry → cleanup → completion), nicht nur isolierte Modelloutputs.
- [ ] **G-2405** Benchmarks erfassen Parameter, Quality, Runtime, Memory, Intermediate Results, Information Loss und Adapterkosten.
- [ ] **G-2406** Inspector beweist pro Komponente Requested/Executed/Contribution/Fallback; stille Fallbacks sind verboten.
- [ ] **G-2407** Debug Contribution kann über feste ID/opaque contrast replacement/Before-After-Delta sichtbar gemacht werden, ohne Dependencies abzuschneiden.
- [ ] **G-2408** Zuerst maximal kumulativ komponierbaren Stack experimentell bauen, danach per Ablation Schichten entfernen.
- [ ] **G-2409** Praktikabilität wird gemessen, nicht vorab angenommen.
- [ ] **G-2410** Negative Contribution wird explizit gemessen und darf zum Entfernen eines Operators führen.
- [ ] **G-2411** GOLD/Baseline wird vor Experimenten eingefroren und reproduzierbar getestet; FULL ist experimentelles Ceiling und darf verlieren.
- [ ] **G-2412** Learned methods konkurrieren mit klassischer/deterministischer Mathematik, Constraints, Procedural Rules und Graph Logic.
- [ ] **G-2413** Schwere Modelle dürfen leichte Residuals lehren; nichts trainieren, was klassische Methoden bereits sauber repräsentieren.
- [ ] **G-2414** Provider, Renderer und Repräsentation bleiben austauschbar; Repräsentation ist Budgetentscheidung, nicht Identität.

## 25. Donor-Vertrag

- [ ] **G-2501** Donor liefert Verhalten, Algorithmus, Shadertechnik, UI-Muster oder Referenz; er übernimmt nicht unbemerkt Architekturhoheit.
- [ ] **G-2502** Donor-Repräsentation, Dateistruktur, API, Sprache und Bufferlayout sind nicht automatisch SHADED-Semantik.
- [ ] **G-2503** Donor-Verhalten wird hinter SHADED Contracts/IR eingebunden.
- [ ] **G-2504** Codeübernahme, Verhaltensreferenz, Literature-derived Core und Implementation-derived Donor bleiben unterscheidbar.
- [ ] **G-2505** Lizenz/Attribution/Provenienz sind dokumentiert.
- [ ] **G-2506** Ein Donor darf nach Absorption technisch verschwinden, während seine Herkunft erhalten bleibt.
- [ ] **G-2507** Sandspiel ist vor allem CA-/Fallback-/Materialregel-Donor; seine 2D-Form ist nicht SHADEDs 3D-Raumarchitektur.
- [ ] **G-2508** niels747/2D-Weather-Sandbox ist Wetter-/Troposphären-Referenz, nicht 3D-Runtime-Owner.
- [ ] **G-2509** Snowflow ist ausschließlich UI-/Snow-Donor plus Credit, nicht Runtime-Owner.
- [ ] **G-2510** Particles4All ist **nicht** kanonische SHADED-Grundarchitektur.

## 26. Style / Darstellung

- [ ] **G-2601** Journey-artige warme Wüstenästhetik ist Skin/Look, keine Material-/World-Wahrheit.
- [ ] **G-2602** Exposure/Tonemapping werden auf die aktive Welt abgestimmt; Schnee-Kalibrierung bleibt nicht globaler Default.
- [ ] **G-2603** Visuelle Qualität soll physische Zustände lesbar machen, nicht sie ersetzen.
- [ ] **G-2604** Shader dürfen nur darstellen, was World State/Material Contract ihnen liefert, außer klar markierten rein visuellen Sekundäreffekten.
- [ ] **G-2605** Per-cell Light/Material Response und Geometrie müssen zusammenpassen; kein „schöner“ Shader darf falsche Physik vortäuschen und dadurch World Truth werden.

## 27. Ausführungsdisziplin

- [ ] **G-2701** Vor Implementierung tatsächlichen Repo-Stand/aktiven Entry Point prüfen; nicht aus Annahmen patchen.
- [ ] **G-2702** `docs/EXECUTION_PLAN.md` und `GOAL.md` vor jedem größeren Migrationsschritt gegenlesen.
- [ ] **G-2703** Nicht-DEFERRED Anforderungen werden vollständig abgearbeitet; Scope wird nicht still erweitert oder verkleinert.
- [ ] **G-2704** Blocker werden nur mit Evidenz erklärt; keine erfundenen Gates.
- [ ] **G-2705** Plan/Code/Test-Widersprüche werden dokumentiert und anhand Evidenz aufgelöst.
- [ ] **G-2706** Architektur-/Ownership-Änderungen werden in getrennten nachvollziehbaren Commits gehalten, soweit praktisch.
- [ ] **G-2707** Keine Stubs, Placeholder, Fake/Synthetic Product Data oder stillen No-ops als Erfüllungsnachweis.
- [ ] **G-2708** Synthetic Data ist nur in ausdrücklich als solche markierten mathematischen/Regressionstests zulässig; echte Behauptungen über Produktverhalten brauchen reale Runtime-/Input-Evidenz.
- [ ] **G-2709** Keine neuen TODOs/Legacy-Restpfade einführen und dann Goal als erledigt markieren.
- [ ] **G-2710** Keine symptomatischen Visual-Fixes, wenn die Ursache Ownership/Contract/State ist.

## 28. Verifikation — positive und negative Beweise

Für jede Migration:

```text
[ ] NEW OWNER EXISTS
[ ] NEW OWNER IS ACTIVE
[ ] OLD OWNER IS NOT ACTIVE
[ ] OLD OWNER CANNOT SILENTLY RETURN
```

- [ ] **G-2801** Tests starten über den tatsächlichen Production Entry Point.
- [ ] **G-2802** Audit/Search findet keine verbotenen alten Imports/Call Sites.
- [ ] **G-2803** Audit/Search findet keine konkurrierenden State Writers für dieselbe semantische Wahrheit.
- [ ] **G-2804** Surface Height = Render Height = Depth Height = Shadow Height = Collision/Grounding Height innerhalb definierter Toleranz.
- [ ] **G-2805** 100%-Sand-Test besteht.
- [ ] **G-2806** Exposed-Bedrock-Test besteht: Fels erst bei echter Freilegung.
- [ ] **G-2807** Snow-only-when-`FIELD.SNOW`-Test besteht.
- [ ] **G-2808** Shared-field/resource-Test beweist, dass relevante Passes denselben Snow/Water/Wetness-State konsumieren.
- [ ] **G-2809** Water-conservation-Test besteht.
- [ ] **G-2810** Contact→World-State-Test besteht.
- [ ] **G-2811** Slope/shear-layer-Test besteht und beweist Materialverschiebung statt Surf-State.
- [ ] **G-2812** Shared-wind-Test besteht.
- [ ] **G-2813** Light/shade→World-State-Test besteht.
- [ ] **G-2814** Seed-does-not-immediately-spawn-plant-Test besteht.
- [ ] **G-2815** Persistence/History-Test besteht.
- [ ] **G-2816** Backend-Semantics-Test vergleicht CPU Reference / WASM-WebGL / WebGPU soweit verfügbar.
- [ ] **G-2817** Build und Shadercompile sind grün.
- [ ] **G-2818** Visuelle GPU-Pfade werden in echtem Browser/GPU-Pfad geprüft; reine DOM-/Unit-Tests ersetzen das nicht.
- [ ] **G-2819** Runtime/About/Debug zeigt Commit-/Build-ID, damit eine ausgelieferte Instanz eindeutig dem geprüften Code zugeordnet werden kann.

## 29. Repo-weite Legacy-/Contradiction-Suche

Mindestens nach folgenden Begriffen/Verantwortungen suchen und jeden Treffer klassifizieren:

```text
Snowflow
SNOWFLOW
snow.fragment
SnowContact
SurfWake
SpellSystem
snowDeform
rockMask
enableSnowPhysics
enableSnowShading
stick-zone
stick-base
stick-knob
setupStick
legacy editor
compatibility UI
hidden UI
private material state
private wind
private temperature
```

- [ ] **G-2901** Jeder Treffer ist entfernt, auf SHADED-Semantik migriert oder ausdrücklich als zulässige Donor-/History-Provenienz markiert.
- [ ] **G-2902** Kein Snowflow-Treffer besitzt aktive generische Runtime-Autorität.
- [ ] **G-2903** Keine alte Touch-Implementation bleibt nach Replacement aktiv.
- [ ] **G-2904** Keine zwei kanonischen Dokumente definieren denselben Zustand widersprüchlich.
- [ ] **G-2905** Keine historische Designentscheidung steht unmarkiert neben ihrer späteren Ablösung.

## 30. Parked Image-to-World Engine / spätere Reaktivierung

- [ ] **G-3001** Der geparkte `runtime/*.mjs` Image-to-World-Pfad ist nicht tot und wird nicht versehentlich gelöscht.
- [ ] **G-3002** Er darf aber nicht als zweite konkurrierende World Truth reaktiviert werden.
- [ ] **G-3003** Vor Reaktivierung migriert er auf die dann aktuelle `WORLD_LANGUAGE`/World-State-/Material-/Provenienz-Semantik.
- [ ] **G-3004** Unterschiede im internen Layout sind erlaubt; Unterschiede in Bedeutung, Einheiten, Material IDs, Phasen, Provenienz oder Erhaltung nicht.
- [ ] **G-3005** `CELL_STRIDE`-Gleichheit ist ausdrücklich **kein** Integrationsziel.
- [ ] **G-3006** Reaktivierung braucht semantischen Roundtrip-/Contract-Test gegen die aktive World Runtime.

## 31. Umsetzungsreihenfolge / Gates

Diese Reihenfolge dient dazu, zuerst Wahrheiten und Owner zu reparieren, dann Breite aufzubauen:

```text
0. DOCUMENT + OWNERSHIP RECONCILIATION
1. SNOWFLOW ABSORPTION / SHADED-OWNED RUNTIME
2. WORLD_LANGUAGE + SURFACE CONTRACT
3. SAND AS COMPLETE SURFACE IMPLEMENTATION
4. GROUND / SUBSTRATE
5. HYDROLOGY + SUBSURFACE
6. ATMOSPHERE / WIND
7. PER-CELL LIGHT / HEAT
8. MATERIAL STATES
9. PHYSICS CONTACT + SLOPE/SHEAR
10. EROSION / TRANSPORT
11. DECAY / HISTORY / PERSISTENCE
12. VEGETATION DEEP COUPLING
13. HABITATS / FAUNA / BREADTH
14. PARKED RECONSTRUCTION RE-INTEGRATION AGAINST SAME WORLD LANGUAGE
```

- [ ] **G-3101** Kein späteres Feature wird als Ablenkung benutzt, solange ein früheres Ownership-/Contract-Gate gebrochen ist.
- [ ] **G-3102** Keine „40 Materialien“, bevor Sand den vollständigen Vertrag beweist.
- [ ] **G-3103** Keine Habitat-/Fauna-Breite, solange Ground/Water/Light/Life konkurrierende Wahrheiten haben.
- [ ] **G-3104** Keine neue spektakuläre Demo-Funktion ersetzt strukturelle Reparatur.

## 32. Definition of Done

Das Goal ist **nicht** erfüllt, wenn SHADED lediglich besser aussieht oder mehr Code besitzt.

Es ist erfüllt, wenn alle folgenden Aussagen wahr und belegt sind:

- [ ] **G-3201** SHADED ist alleiniger Owner der aktiven Runtime.
- [ ] **G-3202** Snowflow ist nur noch UI-/Snow-Donor plus README/About/Credit-Provenienz.
- [ ] **G-3203** Snow ist ein SHADED World State/Materialprovider, kein Rendererfundament.
- [ ] **G-3204** Es gibt genau eine aktive user-facing SHADED-UI am Root Entry.
- [ ] **G-3205** Touch verwendet nur den gewählten aktiven Joystick/Input-Provider.
- [ ] **G-3206** Sand erfüllt den vollständigen Surface Contract über die gesamte sichtbare Welt.
- [ ] **G-3207** World State ist alleinige materielle Wahrheit.
- [ ] **G-3208** Physics, Water, Ground, Atmosphere, Light, Vegetation und History verändern dieselbe Welt.
- [ ] **G-3209** Bei steilen Hängen entsteht Rutschen aus realer Scher-/Schichtinstabilität, nicht aus Surf-Gameplay.
- [ ] **G-3210** Keine sichtbare kausale Weltveränderung ohne nachvollziehbaren World-State-/Operator-Pfad.
- [ ] **G-3211** OBSERVED/MEASURED werden nicht von Inferenz/Regularisierung überschrieben.
- [ ] **G-3212** UNKNOWN wird nicht erfunden.
- [ ] **G-3213** Provider/Renderer/Backend/Repräsentation sind austauschbar, ohne Semantik zu ändern.
- [ ] **G-3214** CPU Reference ist Golden; schnellere Backends matchen dessen beobachtbares Verhalten.
- [ ] **G-3215** Kanonische Repo-Dokumente sind untereinander widerspruchsfrei oder sauber gescoped/superseded.
- [ ] **G-3216** Ersetzte Implementierungen sind tatsächlich aus dem aktiven Pfad verschwunden.
- [ ] **G-3217** Build, Tests, Browser/GPU-Verifikation und Runtime-Build-ID belegen den ausgelieferten Stand.

## Abschlussbericht — Pflichtformat

Vor dem Stoppen muss **jede** `G-xxxx`-ID geprüft werden. Kein Sammel-„PASS“ für ganze Kapitel.

```text
ID: G-xxxx
DOC: <Datei + Abschnitt oder N/A>
CODE: <aktiver Pfad/Symbol oder N/A>
TEST: <Test/Command/Runtime evidence oder N/A>
OLD OWNER REMOVED: PASS / FAIL / N/A
STATUS: PASS / FAIL / DEFERRED
EVIDENCE: <kurz und konkret>
```

`DEFERRED` ist nur zulässig, wenn es in einem kanonischen Plan ausdrücklich als späterer Scope markiert ist und keine frühere Definition-of-Done-Bedingung verletzt. Jeder andere ungeklärte Punkt ist `FAIL`.
