# World Kernel

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md), [`DONORS.md`](./DONORS.md), [`VEGETATION.md`](./VEGETATION.md).

## These

Der nächste Schritt ist nicht noch ein spektakuläres Element. Es ist das, was Feuer, Wasser und Vegetation zu einer Welt macht. Die Illusion bricht nicht an fehlenden Tieren. Sie bricht, sobald der Spieler merkt:

> „Ah. Das sind drei Effekte, die zufällig nebeneinander laufen."

Was fehlt, sind gemeinsame Weltzustände und irreversible Konsequenzen.

## Die Verfassung: sechs geteilte Feldgruppen

| Gruppe | Felder | Mapping auf den bestehenden Kernel |
|---|---|---|
| **ENERGY** | light, temperature | `HEAT` + Lichtfeld |
| **AIR** | wind, humidity | `WIND_X/Z`, `VAPOR`, `CLOUD` |
| **WATER** | waterMass, flow | `WATER`, `VELOCITY` |
| **GROUND** | material, moisture, sediment, nutrients | `BEDROCK`, `SAND`, `WETNESS`, `SEDIMENT`, `GROUNDWATER` |
| **LIFE** | biomass, vitality | `BIOMASS`, `PLANT_TYPE`, `PLANT_AGE`, `SEEDS` |
| **HISTORY** | damage, ash, disturbance, age | `FIRE`, `SMOKE`, `ASH`, `DISTURBANCE` |

**Regel:** Feuer, Wasser und Vegetation besitzen keine privaten Wahrheiten für Zustände, die in eines dieser Felder gehören.

Daraus entsteht ohne Skript eine Geschichte:

Sonne → Boden wird warm → Wasser verdunstet → Boden trocknet → Pflanze verliert Wasser → Vegetation wird brennbarer → Feuer beginnt → Wind treibt Feuer → Pflanze verbrennt → Asche verändert Boden → Regen fällt → Nährstoffe werden verteilt → neues Wachstum.

Keiner dieser Schritte ist geskriptet. Und trotzdem entsteht eine Story.

## Die sieben gemeinsamen Zustände

1. **Boden/Substrat — die größte Lücke, das Gedächtnis des Systems.** Pro Zelle: material, porosity, moisture, temperature, organicMatter, nutrients, compaction, sediment, char/ash. Boden verbindet alles: Wasser versickert, sättigt, erzeugt Schlamm, transportiert Sediment; Feuer trocknet, verbrennt Organisches, hinterlässt Asche, verändert Nährstoffe; Vegetation zieht Wasser, stabilisiert, erzeugt Biomasse, stirbt, wird wieder Boden.
2. **Atmosphäre als Feld, nicht als Wettereffekt.** Ein Wind, fünf sichtbare Beweise: biegt Pflanzen, treibt Feuer, trägt Rauch, verändert Verdunstung, richtet Wasseroberflächen, transportiert Samen. Nicht: Grasshader-Wind A, Feuer-Noise B, Rauch fliegt irgendwohin.
3. **Licht + Wärme als physische Weltfelder.** sunExposure, radiantEnergy, temperature, shade — nicht nur Renderer-Licht. Ein Stein wirft Schatten: darunter bleibt Boden länger feucht, Schnee taut langsamer, Pflanzen wachsen anders, Verdunstung sinkt, Feuer breitet sich schlechter aus. Der Schatten beweist, dass der Stein in der Welt existiert.
4. **Materialzustände statt Spezialeffekte.** WOOD: wet / dry / hot / burning / charred / ash. SOIL: dry / damp / wet / saturated / mud / dried-cracked. WATER: water / mist / steam / ice / snow. Materialien haben Zustände, keine Effekte.
5. **Erosion + Transport — noch vor Fauna.** Wasser löst Material, transportiert es, lagert es ab, vertieft Rinnen, füllt Becken, sättigt Boden, bewegt Samen und Nährstoffe. Die Kette: Wasser → Rinne → Erosion → Sediment unten → feuchtere Senke → Samen bleiben hängen → Pflanzen wachsen → Wurzeln stabilisieren → Wasser nimmt beim nächsten Regen einen anderen Weg. Das ist Welt.
6. **Tod, Zerfall, Nachwuchs.** Vegetation muss keimen, konkurrieren, wachsen, beschädigt werden, sterben, zerfallen, wieder Ressource werden. Nach einem Brand: schwarzer Boden, verkohlte Stämme, Asche, mehr Licht am Boden, Nährstoffspitze, Pionierpflanzen, langsame Wiederbesiedlung. Die Welt erzählt ihre eigene Vergangenheit — Environmental Storytelling fällt gratis aus der Simulation.
7. **Persistenz / History — der unsichtbare Killer.** Der Spieler muss fünf Minuten später erkennen: „Hier war ich." Brandnarben bleiben, Wasserlöcher trocknen langsam, niedergetretene Vegetation richtet sich nicht sofort wieder auf, Schlamm trocknet, Sediment bleibt liegen. Kehrt alles schnell zum Ausgangszustand zurück, erkennt das Gehirn sofort den Spielplatz.

## Wurzeln: unbedingt bidirektional

Nicht nur Boden → Wurzelwachstum, sondern Boden ⇄ Wurzeln. Wurzeln beeinflussen Bodenstabilität (weniger Erosion/Hangrutschung), Porosität, Wasserpfade (alte Wurzelkanäle als Versickerungswege), Feuchtigkeit (Aufnahme + lokale Austrocknung), Bodenstruktur, Nährstoffverteilung, Mechanik (Steine umgehen, Risse erweitern).

Ergebnis: Quelle entsteht → Boden wird feuchter → Pflanze keimt → Wurzeln folgen dem Wasser → Wurzeln stabilisieren das Ufer → Erosion nimmt ab → Bach ändert seinen Verlauf → andere Bereiche trocknen → Vegetation verschiebt sich. Die Pflanze ist dann kein Objekt auf Terrain mehr — sie wird Teil der Terrainentstehung.

## Record & Showcase

**Der Nutzer legt Ursachen an. Die Welt entscheidet, wann daraus etwas wird.**

Ursachen und Randbedingungen setzen — nicht Konsequenzen bestellen. Quelle setzen heißt nicht „mach einen Bach", sondern „hier tritt Wasser aus"; ob Bach, Pfütze, Versickerung oder überlaufendes Becken daraus wird, entscheiden Terrain + Boden + Wasser. Samen setzen heißt nicht „Pflanze spawnen" — ein Samen ist ein Potentialzustand: soilMoisture über Schwelle, Temperatur im Bereich, Licht ausreichend, Dormancy erfüllt, Konkurrenz akzeptabel → Keimung.

Record zeichnet den echten Lauf auf — keine vorgefertigte Choreographie. Optional zusätzlich Seed + Initialzustand + Interventionen als deterministischer Event-Stream (Replay, Benchmark, Regressionstest, Demo-Szene, Shareable World Recipe, Fast-Forward) — das ist Debug-/Replay-Infrastruktur, nicht das Showcase-Prinzip.

Das Showcase selbst ist banal: Record drücken. Rumlaufen. Welt ein bisschen ärgern. Warten, was sie daraus macht. Stop. Samen werfen → Bach ziehen → Berg auftürmen → Quelle setzen → laufen lassen → beobachten. Wenn das beeindruckend aussieht, beweist es gleichzeitig, dass SHADEDs Systeme miteinander funktionieren.

**Harte Designregel: Keine sichtbare Veränderung ohne Ursache im Weltzustand.** Keine aufploppenden Uferpflanzen, weil „Ufer hübsch aussehen soll" — jeder sichtbare Zustand braucht einen nachvollziehbaren Weg, auch wenn dieser Weg für Performance stark abstrahiert wird.

## Nicht jetzt

- **Fauna.** Ein Hirsch, der durch eine Welt rennt, deren Boden, Feuer, Wasser und Pflanzen keine gemeinsame Realität teilen, macht die Fälschung eher sichtbarer.
- **40 Vegetationstypen.** Eine Pflanze, die Licht + Wasser + Temperatur + Boden + Wind + Schaden wirklich versteht, ist wertvoller als hundert dekorative Arten.

## Reihenfolge

Boden/Substrat → gemeinsame Atmosphäre → Light/Heat-Felder → Materialzustände → Erosion/Transport → Zerfall/Persistenz.

Danach Tiere, Schnee, große Ökosysteme und sonstiger Wahnsinn. Mit Feuer + Wasser + Vegetation + Boden + Luft + Licht + Erinnerung spielt jemand zehn Minuten mit einem Hügel — und erzählt plötzlich eine Geschichte darüber. Das ist die Schwelle, die gesucht wird.
