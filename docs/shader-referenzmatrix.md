# SHADED – Kanonische Shader-Referenzmatrix

**Stand:** 2026-07-25  
**Zweck:** Technische und visuelle Referenzen für die 60 sichtbaren Weltgesetze aus [`vision-weltgesetze.md`](./vision-weltgesetze.md).

> Nicht der schönste Shader gewinnt. Eine Referenz ist für SHADED dann wertvoll, wenn sie einen sichtbaren Zustand **lesbar, übertragbar und mechanisch nutzbar** macht.

Die ausgelieferte SHADED-Basis bleibt WebGL 1, ein Fragment-Pass und ohne Build-Step. Das ist jedoch nur die kleinste eigenständig lauffähige Runtime – **nicht die Obergrenze des Gesamtsystems**. Darüber liegt perspektivisch eine Bridge zu externen Render- und Post-Processing-Schichten, mindestens ReShade. Diese Bridge darf zusätzliche Texturen, Zustandsfelder und Effekt-Pässe bedarfsgesteuert von außen einspeisen.

---

## 1. Bewertungsmodell

### Referenzrolle

| Kürzel | Rolle | Frage |
|---|---|---|
| **Z** | Zielbild | Wie soll der Zustand aussehen und sich anfühlen? |
| **A** | Algorithmus | Welches mathematische Verfahren erzeugt ihn? |
| **I** | Implementierung | Gibt es nachvollziehbaren, portierbaren Quellcode? |

### Portierbarkeit nach SHADED

| Stufe | Bedeutung |
|---|---|
| **A** | Direkt oder stark vereinfacht im vorhandenen WebGL-1-Fragmentshader nutzbar |
| **B** | Braucht ein zusätzliches Feld, eine CPU-Akkumulation oder eine dynamisch gebundene Textur |
| **C** | Mehrpass-, Compute-, volumetrische oder Geometrie-Technik; über Bridge, ReShade oder eine spätere Engine-Schicht nutzbar |

Die Einstufung beschreibt nicht, ob ein Verfahren „zu groß für SHADED“ ist. Sie beschreibt nur, **in welcher Schicht es ausgeführt werden sollte**.

### Lizenzampel

| Status | Verwendung |
|---|---|
| **Grün** | MIT, CC0 oder vergleichbar klar: Code kann nach Prüfung adaptiert werden |
| **Gelb** | Attribution, getrennte Asset-Lizenz oder projektspezifische Bedingungen prüfen |
| **Rot** | Unklare, nichtkommerzielle oder restriktive Lizenz: nur ansehen und selbst neu implementieren |

**ShaderToy-Regel:** Die Lizenz steht im jeweiligen Shader-Metadatensatz beziehungsweise Quelltext. Ohne explizit passende Lizenz bleibt der Shader **nur visuelle oder algorithmische Referenz**. Insbesondere Arbeiten von Inigo Quilez sind häufig CC BY-NC-SA und damit kein Code-Spender für ein kommerziell nutzbares Produkt.

---

## 2. Goldstandard – die wichtigsten Referenzen

Diese Sammlung bildet den Kern. Weitere Links sind nur dann sinnvoll, wenn sie eine echte Lücke schließen.

| Bereich | Referenz | Rolle | Port | Lizenz | Wert für SHADED |
|---|---|---:|:---:|:---:|---|
| Distanzfelder | [WebGL Jump Flood Algorithm](https://github.com/patricklbell/jsjfa) | A/I | B | Grün | Senken, Randabstände, Ausbreitung, Grenzen, Reparaturränder, Fußspuren |
| Reaktionsmuster | [ReactionDiffusionShader](https://github.com/amandaghassaei/ReactionDiffusionShader) | A/I | B–C | Grün | Rost, Moos, Kristalle, Krankheit, Magie, Risse und organische Migration |
| Advektion | [FluidsGL](https://github.com/rogerlucena/FluidsGL) | A/I | C | Grün | Rauch, Geruch, Blut, Schlamm, Tinte und Wärme als wandernde Felder |
| Interaktives Wasser | [Three.js GPGPU Water](https://threejs.org/examples/#webgl_gpgpu_water) | A/I | C | Grün | Störungen, Wellen, Druck- und Klangringe |
| Wasser-Wissensbasis | [water-resources](https://github.com/wave-harmonic/water-resources) | A | A–C | Grün | Gerstner, FFT, Schaum, Fluss, Küste und dynamische Wellen systematisch erklärt |
| Großes Wassersystem | [Crest](https://github.com/wave-harmonic/crest) | A/I | C | Gelb | LOD, Schaum, Strömung, Interaktion und Unterwasser als Systemarchitektur |
| Meer-Zielbild | [Seascape](https://www.shadertoy.com/view/Ms2SD1) | Z/A | C | Prüfen | Kompaktes prozedurales Wasser, Reflexion, Wellenform und Licht |
| Regen-Aufschläge | [Rainier Mood](https://www.shadertoy.com/view/ldfyzl) | Z/A | A–B | Prüfen | Regentropfen, Ringwellen und zeitlich versetzte Aufschläge |
| Nasse Oberfläche | [Wet Sand](https://www.shadertoy.com/view/ldfXzS) | Z/A | A | Prüfen | Materialabhängiger Glanz, Nässe, Mikrostruktur und Reflexionsdämpfung |
| Nasse Oberfläche | [Wet Concrete](https://www.shadertoy.com/view/tsjXDV) | Z/A | A | Prüfen | Pfützeninseln, Glanzbruch und nasser mineralischer Untergrund |
| Wolken-Zielbild | [Protean Clouds](https://www.shadertoy.com/view/3l23Rh) | Z/A | C | Prüfen | Bewegte volumetrische Schichtung und Lichtabsorption |
| Wolken-Algorithmus | [Clouds](https://www.shadertoy.com/view/XslGRr) | Z/A | C | Rot | Kanonische FBM-Wolken; Technik verstehen, nicht übernehmen |
| Physischer Himmel | [Godot Sky Shaders 3D Demo](https://store.godotengine.org/asset/godot-foundation/sky-shaders-3d-demo/) | A/I | C | Grün | Tageszeit, Atmosphäre, Sonnen- und Mondlicht, volumetrische Wolken |
| Nebel | [Godot Volumetric Fog Demo](https://godotengine.org/asset-library/asset/2754) | A/I | C | Grün | Dichtevolumen, Lichtkegel, Schichtung und temporale Stabilisierung |
| Leichter Wolkenbau | [CloudSkybox](https://github.com/keijiro/CloudSkybox) | A/I | B–C | Grün | Kompaktere prozedurale Wolken als Alternative zur Vollvolumetrik |
| Schnee/Deformation | [GDQuest Godot Shaders](https://github.com/Excoh/gdquest-godot-shaders) | A/I | B–C | Grün/Gelb | Interaktiver Schnee, Feuer, Wasserfall, Dissolve; Code und Assets getrennt prüfen |
| Gras-Interaktion | [InteractiveGrass](https://github.com/mozankatip/InteractiveGrass) | A/I | B–C | Grün | Wind, lokale Verdrängung und Rückfederung; CC0 |
| Gras-Biegung | [GrassBending](https://github.com/Elringus/GrassBending) | A/I | B–C | Grün | Berührung als räumliches Biegefeld; MIT |
| Gras/Fell-Schalen | [Unity-GrassAndFur](https://github.com/Propagant/Unity-GrassAndFur) | A/I | C | Grün | Shell-Texturing für Gras, Fell, Moos und Druckwellen |
| Feuer/Partikel | [Godot Visual Effects](https://github.com/marinho/godot-visual-effects) | Z/I | B–C | Prüfen | Feuer, Rauch, Regen, Funken und Partikel-Layer |
| Shader-Bausteine | [Godot-Shaders](https://github.com/gamedevserj/Godot-Shaders) | A/I | A–B | Grün | Wasser, Gras-Sway, Dissolve, Verzerrung und wiederverwendbare Kleinbausteine |
| Wald/Biom-Zielbild | [Rainforest](https://www.shadertoy.com/view/4ttSWf) | Z/A | C | Rot/Prüfen | Prozedurales Terrain, Vegetationsdichte, atmosphärische Tiefenstaffelung |

---

## 3. Gerettete ShaderToy-Referenzen: kanonische Verwendung

Die bereits lokal gesicherten Shader sind kein zufälliger Bilderordner mehr. Jeder erhält eine feste Rolle.

| Shader | Primäre Rolle in SHADED |
|---|---|
| [Seascape](https://www.shadertoy.com/view/Ms2SD1) | Wasseroberfläche, Wellen, Reflexionsgewicht |
| [Snail](https://www.shadertoy.com/view/ld3Gz2) | Nasse organische Materialien, Schleim, Mikroglanz |
| [Happy Jumping](https://www.shadertoy.com/view/3lsSzf) | Weiche Körperverformung, Gewicht und Landungsimpuls |
| [Protean Clouds](https://www.shadertoy.com/view/3l23Rh) | Wolken, Rauchschichtung, wandernde Regelzonen |
| [Tribute – Journey!](https://www.shadertoy.com/view/ldlcRf) | Sand, Wind, Fernsicht und Environmental Storytelling |
| [Rainier Mood](https://www.shadertoy.com/view/ldfyzl) | Regenringe und Wasseraufprall |
| [Where the River Goes](https://www.shadertoy.com/view/Xl2XRW) | Fließrichtungen und Advektion |
| [VolumetricIntegration](https://www.shadertoy.com/view/XlBSRz) | Lichtabsorption in Nebel und Rauch |
| [Volumetric Explosion](https://www.shadertoy.com/view/lsySzd) | Feuerwolke, Glut, Rauch und Konsequenz-Narbe |
| [Perspex Web Lattice](https://www.shadertoy.com/view/Mld3Rn) | Brechung, Magiefehler, transparente Grenzen |
| [TIE Fighters](https://www.shadertoy.com/view/WlcyD7) | Schnee-Lesbarkeit, Silhouetten und Bewegungsinszenierung |
| [Sparks Drifting](https://www.shadertoy.com/view/MlKSWm) | Funken, Windrichtung und Restenergie |
| [Hexagonal Grid Traversal](https://www.shadertoy.com/view/WtSfWK) | Besitzgrenzen, Runenraster und diskrete Zonen |
| [Luminescence](https://www.shadertoy.com/view/4sXBRn) | Biolumineszenz, Unterwasser-Nebel und lebende Indikatoren |
| [Simple Greeble – Split4](https://www.shadertoy.com/view/4tXcRl) | Prozedurale Materialdetails und technische Oberflächen |
| [Another Cloudy Tunnel 2](https://www.shadertoy.com/view/XlSSzV) | Nebel als Raum und Informationsfilter |
| [Storm in a Teacup](https://www.shadertoy.com/view/tsVcWt) | Sturmkomposition, Meer, Wolken und globale Stimmung |
| [301’s Fire Shader](https://www.shadertoy.com/view/4ttGWM) | Flammenform, Turbulenz und Hitzeverzug |
| [Voxel Corridor](https://www.shadertoy.com/view/MdVSDh) | Tiefenstaffelung und materialisierte Dunkelheit |
| [Bender](https://www.shadertoy.com/view/4slSWf) | Metallreflexion, Materialtrennung und Rost-Grundlage |
| [Electro](https://www.shadertoy.com/view/4scGWj) | Blitz, Energieadern und magisches Materialgedächtnis |
| [Awesome Star](https://www.shadertoy.com/view/4lfSzS) | Hitze, Emission, Sonnenlicht und Energiegradienten |
| [Synthwave Canyon](https://www.shadertoy.com/view/slcXW8) | Biomgrenzen, Farbtemperatur und stilisierte Tiefe |
| [Desert Sand](https://www.shadertoy.com/view/ld3BzM) | Sandkorn, Windrichtung, Spuren und Trocknung |
| [Over the Moon](https://www.shadertoy.com/view/4s33zf) | Mondlicht, Schnee und kalte Nachtpalette |
| [Iceberg](https://www.shadertoy.com/view/4tdSDX) | Eis, Frost, Kristallwachstum und Unterwasser-Trennung |
| [Snow Is Falling](https://www.shadertoy.com/view/4lfcz4) | Schneefall, Tiefenstaffelung und Winddrift |
| [Cosmic Marble](https://www.shadertoy.com/view/llSSWW) | Brechung, Linsenfehler, Magie und Unsichtbarkeit |
| [Worley Noise Waters](https://www.shadertoy.com/view/llS3RK) | Zellrauschen für Wasser, Risse, Salz und Flecken |
| [Optical Deconstruction 5b](https://www.shadertoy.com/view/4tscR8) | Runen, Energiepfade und sichtbare Sprach-/Magiespuren |
| [Wet Sand](https://www.shadertoy.com/view/ldfXzS) | Nässe, Trocknungsrand, Abdunklung und Mikroreflexion |
| [Wet Concrete](https://www.shadertoy.com/view/tsjXDV) | Feuchtigkeit im Mauerwerk, Pfützen und Reinigung |

---

## 4. Vollständige Zuordnung der 60 Weltgesetze

| # | Weltgesetz | Primäre Referenzen | Technischer Kern |
|---:|---|---|---|
| 1 | Schmutz, Staub, Ruß | Wet Concrete · FluidsGL · dynamisches Kontaminationsfeld | Ablagerung + Übertragung + langsamer Decay |
| 2 | Fußspuren | GDQuest Interactive Snow · JFA · Desert Sand | Störtextur, Distanzfeld, materialabhängige Rückbildung |
| 3 | Material-Ermüdung | Reaction Diffusion · JFA · Worley Waters | Spannungskeime → wachsende Rissadern |
| 4 | Druck/Gewicht | Interactive Snow · Happy Jumping · GrassBending | lokaler Impuls, Delle, Rückfederung |
| 5 | Wind | InteractiveGrass · Protean Clouds · Sparks Drifting | gemeinsames Richtungsfeld für Vegetation, Partikel und Wetter |
| 6 | Geruch | FluidsGL · Godot Fog | advektiertes, diffundierendes Dichtefeld |
| 7 | Klang als Wellen | Three.js GPGPU Water · Rainier Mood | zeitlich abfallende Ringimpulse und Reflexionen |
| 8 | Feuchtigkeit im Mauerwerk | Wet Concrete · Reaction Diffusion | kapillares Wachstum entlang poröser Struktur |
| 9 | Rost | Reaction Diffusion · Bender · Wet Concrete | Feuchte × Metallmaske × Zeit; organische Oxidationsränder |
| 10 | Öl/Fett/Harz | Wet Sand · FluidsGL · Fire VFX | viskoses Transferfeld, Glanz, Brennbarkeit und Rutschigkeit |
| 11 | Schatten als Besitz | Godot Sky · JFA | Licht-/Schattenmaske akkumuliert Alterung unterschiedlich |
| 12 | Erinnerung des Bodens | Interactive Snow · dynamisches Gedächtnisfeld · JFA | langfristige Nutzungskarte statt flüchtiger Spur |
| 13 | Angst/Stress | Cosmic Marble · Godot-Shaders | kontrollierte Brechung, Vignette, Frequenz und Atemkopplung |
| 14 | Krankheit/Gift | Reaction Diffusion · Luminescence | adernartige Migration + falsche Emission/Farbtrennung |
| 15 | Pflanzen reagieren | InteractiveGrass · GrassBending · GrassAndFur | Wind-, Nähe-, Wasser- und Hitzeantwort aus demselben Feld |
| 16 | Insekten/Kleintiere | Godot Visual Effects · Luminescence | Partikelschwärme folgen Geruch, Licht, Leichen und Wind |
| 17 | Blut als Information | FluidsGL · Wet Sand · Rainier Mood | Transfer, Verdünnung, Glanzverlust und Trocknungsalter |
| 18 | Magie als Brechungsfehler | Cosmic Marble · Perspex Web Lattice · Electro | UV-Verzug, falsche Lichtkante, verzögerte Reflexion |
| 19 | Tageszeit als Materialverhalten | Godot Sky · Over the Moon | nicht nur Grading: Tau, Trocknung, Pilze, Emission |
| 20 | Temperaturgradienten | Awesome Star · Fire Shader · Godot VFX | Abstand und Sichtlinie zur Wärmequelle erzeugen warm/kalt-Feld |
| 21 | Kälte als Kristallwachstum | Iceberg · Reaction Diffusion · Worley Waters | randgestütztes Kristallwachstum, Versiegelung, Sprödigkeit |
| 22 | Wasserströmung | water-resources · Crest · Where the River Goes | Flussfeld, Senken, Tiefe, Schaum und Transport |
| 23 | Kleidung als Zustandsträger | Wet Sand · Godot-Shaders | Materialmaske speichert Nässe, Tropfen, Verdunstung und Schmutz |
| 24 | NPC-Stimmung | Godot Sky · Storm in a Teacup | lokale Farbtemperatur, Schattenhärte und Partikelruhe |
| 25 | Besitz/Verbot | JFA · Hexagonal Grid Traversal | Distanz zur Grenze steuert Kante, Kälte, Klarheit und Verfall |
| 26 | Lärm-/Lichtverschmutzung | Godot Fog · Awesome Star | Emission färbt Nebel und verdrängt Nachtinformation |
| 27 | Jahreszeitenmigration | InteractiveGrass · Snow Is Falling · Rainforest | langsam wandernde Material- und Vegetationsgrenzen |
| 28 | Hunger/Durst/Erschöpfung | Godot Fog · Actor-World-State-Sheets | Atem, Haltung, Haut-/Kleidungszustand statt HUD |
| 29 | Unsichtbarkeit | Cosmic Marble · Rainier Mood · Snow Is Falling | Figur fehlt optisch, bleibt aber in Regen, Staub, Schnee und Brechung lesbar |
| 30 | Reparatur als Eingriff | Wet Concrete · JFA · dynamisches Strukturfeld | frisches Material unterscheidet sich und altert ab Reparaturzeitpunkt |
| 31 | Reinigung als Mechanik | Wet Concrete · JFA · dynamisches Kontaminationsfeld | Lösungsmittel-/Feuchtefeld entfernt Schichten, legt andere frei |
| 32 | Oberflächen-Alphabet | Optical Deconstruction · JFA · Hex Grid | Pfade und Glyphen reagieren auf Nässe, Mondlicht und Berührung |
| 33 | Lokale Gravitation | FluidsGL · Godot Visual Effects | Partikel-, Rauch- und Flüssigkeitsvektoren zeigen lokale Schwere |
| 34 | Biom-Mischzonen | JFA · Rainforest · Iceberg | Distanzfelder mischen Materialien kausal statt per harter Grenze |
| 35 | Karte als Shader-Objekt | Wet Sand · Reaction Diffusion | Papier saugt Wasser; Tinte diffundiert, bleicht und reagiert auf Licht |
| 36 | Feuer-Nachwirkungen | Godot VFX · Volumetric Explosion · Reaction Diffusion | Glut→Asche→Ruß→schwarze Erde→Wachstum als Zustandskette |
| 37 | Nebel als Informationsfilter | Godot Volumetric Fog · Cloudy Tunnel | Dichte verändert Sicht, Silhouetten, Feuchte und Lichtkegel |
| 38 | Sternen-/Mondlicht | Godot Sky · Over the Moon | silberne Kanten und materialabhängige Nachtreaktionen |
| 39 | Wolken als Regelzonen | Protean Clouds · Clouds · CloudSkybox | wandernde Deckungsmaske steuert Licht, Feuchte und Solarenergie |
| 40 | Falsche Sauberkeit | Wet Concrete · dynamisches Gedächtnisfeld | fehlende Materialgeschichte wird selbst zum lesbaren Widerspruch |
| 41 | Hitzeverzug | Fire Shader · Godot-Shaders · ReShade-Pass | lokaler, bandbegrenzter UV-Domain-Warp über Wärmequellen |
| 42 | Trocknung als Zeitmesser | Wet Sand · Wet Concrete · Rainier Mood | Glanz→Randring→Mattheit; Zeit seit letzter Nässe sichtbar |
| 43 | Rauchschichtung | Godot Fog · Volumetric Explosion · FluidsGL | Dichte folgt Decke, Ritzen, Temperatur und Luftströmung |
| 44 | Atem als Wahrheit | Godot Fog · Sparks Drifting | kurze gerichtete Dichteimpulse, gekoppelt an Kälte und Zustand |
| 45 | Berührungsspuren | Wet Concrete · dynamisches Gedächtnisfeld · JFA | Politur, Staubfreiheit und Griffmuster akkumulieren |
| 46 | Soziale Wärme | Godot Sky · Wet Sand · Storm in a Teacup | lokale Wärme, Lichtstreuung und Partikelaktivität erzählen Bewohnung |
| 47 | Lügen als Materialfehler | Cosmic Marble · JFA · Perspex Lattice | Schatten-/Reflexionsversatz und inkonsistente Distanzkanten |
| 48 | Schuld als Anhaftung | Blood Field · Wet Concrete · persistentes Gedächtnisfeld | Reinigung reduziert, löscht aber bestimmte Kanäle nie vollständig |
| 49 | Segen/Fluch | Reaction Diffusion · Luminescence · Electro | Materialparameter verändern Wachstum, Nässe, Emission und Verfall |
| 50 | Müdigkeit der Welt | InteractiveGrass · Godot Sky | geringere Bewegung, flachere Farben, schwächere Feuer und hängende Pflanzen |
| 51 | Überpflege | Wet Concrete · JFA | unnatürliche Gleichförmigkeit und fehlende Störhistorie markieren Illusion |
| 52 | Magisches Materialgedächtnis | Reaction Diffusion · Electro · dynamisches Magiefeld | Zaubertyp hinterlässt dauerhaften, materialabhängigen Zustand |
| 53 | Gewohnheitspfade | InteractiveGrass · GrassBending · JFA | Nutzung akkumuliert Wege, verdichtet Boden und verändert Vegetation |
| 54 | Angstzonen bei Tieren | InteractiveGrass · Godot VFX | Natur reagiert zuerst; Fluchtvektoren machen Unsichtbares lokalisierbar |
| 55 | Metall als Erinnerung | Bender · Reaction Diffusion · Wet Concrete | Blut, Wärme, Feuchte, Einschlag und Besitz verändern Reflexion und Oxidation |
| 56 | Nahrung als Weltzustand | Reaction Diffusion · Godot VFX | Trocknung, Druckstellen, Dampf, Fliegen und Giftglanz |
| 57 | Sprache als Abdruck | GPGPU Water · Rainier Mood · Sparks | Worte erzeugen Impulse in Staub, Rauch, Wasser, Licht und Tierverhalten |
| 58 | Alterung durch Nähe | JFA · Reaction Diffusion | Entfernung zu Feuer, Wasser, Menschen, Magie oder Leichen treibt Alterung |
| 59 | Grenzen als Spannung | JFA · Hex Grid · Biom-Mischzonen | keine UI-Linie: Richtungen, Feuchte, Schnee und Pflanzen kippen sichtbar |
| 60 | Konsequenz-Narben | Reaction Diffusion · GrassAndFur · persistente Zustandsfelder | langfristige Zustandsketten und Regeneration statt einmaliger Decals |

---

## 5. Architekturentscheidung: dynamische Weltgesetz-Pipeline statt fester Slot-Deckel

Die bisherige Aussage „sieben von acht Textur-Slots sind belegt, also muss der letzte Slot dauerhaft einem gemeinsamen `WorldField` gehören“ war falsch. Sie verwechselt die Grenze **eines einzelnen WebGL-Passes** mit der Kapazität des gesamten SHADED-Systems.

Für SHADED gelten stattdessen vier Ebenen:

1. **SHADED Base Runtime**  
   Die kleinste eigenständig lauffähige WebGL-1-Version. Sie enthält nur die gerade gebundenen Basiseffekte und bleibt Single-File-fähig.

2. **World-Law Scheduler**  
   Er bestimmt aus Szene, Storyboard, Wetter, Materialklassen und Gameplayzustand, welche Weltgesetze aktuell relevant sind. Nie alle 60 Gesetze müssen gleichzeitig GPU-aktiv sein.

3. **Bridge Layer**  
   Ein versionierter Vertrag überträgt aktive Gesetze, Uniforms, Masken und Texturbeschreibungen zwischen SHADED, Host-Anwendung und externen Renderern.

4. **ReShade-/External-Pass Layer**  
   Bildschirmraum-, Mehrpass- und zusätzliche Texturverfahren können von außen zugeschaltet werden. Externe Texturen werden nur für die Dauer ihrer aktiven Gesetze injiziert und danach freigegeben oder anderweitig belegt.

### Konsequenz

**Textur-Slots werden vermietet, nicht dauerhaft vererbt.**

Ein Slot kann während eines Schneesturms ein Schnee-/Spurenfeld tragen, später im Innenraum einem Rauch-/Geruchsfeld gehören und in einer magischen Szene als Brechungs- oder Runenmaske dienen. Persistente Zustände müssen deshalb logisch gespeichert werden, aber nicht permanent als GPU-Textur gebunden bleiben.

---

## 6. Dynamische Field-Bank

Statt eines einzigen universellen RGBA-Feldes erhält SHADED eine Bibliothek spezialisierter Feldprofile. Der Scheduler lädt nur die benötigten Profile.

| Feldprofil | Beispielkanäle | Aktiv bei |
|---|---|---|
| **HydroField** | Nässe · Flussrichtung · Tiefe · Trocknungsalter | Regen, Pfützen, Flut, nasse Kleidung |
| **TraceField** | Blut/Schlamm · Ruß/Öl · Berührung · Spurgedächtnis | Verfolgung, Reinigung, Tatort, Gewohnheitspfade |
| **StructureField** | Druck · Risse · Frost · Rost/Reparatur | Belastung, Verfall, Kälte, Schmiede |
| **AtmosField** | Rauch/Geruch · Temperatur · Druck · Gift | Feuer, Nebel, Jagd, Krankheit |
| **BioField** | Wachstum · Krankheit · Pollen · Tierreaktion | Wald, Leichen, Heilung, Jahreszeiten |
| **ArcaneField** | Brechung · Runen · Segen/Fluch · Materialgedächtnis | Magie, Grenzen, Lügen, Rituale |

Diese Felder sind **logische Profile**, keine fest verdrahteten Textur-Slots. Sie können je nach Zielsystem realisiert werden als:

- CPU-Array mit bedarfsgesteuertem Upload,
- gepackte RGBA-Textur,
- mehrere niedrig aufgelöste Texturen,
- Ping-Pong-Buffer,
- ReShade-injizierte externe Ressource,
- engine-native Render- oder Compute-Texture.

### Persistenz ist nicht Bindung

Ein Weltzustand kann gespeichert bleiben, obwohl sein Feld gerade nicht auf der GPU liegt:

- Schnee-Spuren bleiben im Szenenzustand erhalten, während der Spieler ein Gebäude betritt.
- Rost akkumuliert logisch weiter, obwohl kein Metall sichtbar ist.
- Geruch wird nur dort hochgeladen, wo Tiere oder Wind ihn gerade mechanisch relevant machen.
- Alte Brandnarben werden erst beim erneuten Betreten der Region wieder als Textur materialisiert.

---

## 7. Bridge-Vertrag

Die Bridge darf keine zweite Materialwahrheit erzeugen. `classGrid`, Materialmasken und Weltzustände bleiben kanonisch in SHADED beziehungsweise seinem Host-State. Externe Renderer erhalten daraus abgeleitete Ressourcen.

Minimaler Bridge-Snapshot:

```json
{
  "bridgeVersion": "1.0",
  "sceneId": "village-001",
  "frame": 18420,
  "activeLaws": [2, 5, 17, 21, 37, 41],
  "params": {
    "rain": 0.8,
    "wet": 1.0,
    "snow": 0.65,
    "wind": 0.4,
    "temperature": 0.18
  },
  "fields": [
    {
      "name": "HydroField",
      "version": 12,
      "channels": ["wetness", "flow", "depth", "dryAge"]
    },
    {
      "name": "TraceField",
      "version": 31,
      "channels": ["blood", "dirt", "touch", "memory"]
    }
  ],
  "externalPasses": [
    "heat-distortion",
    "fog-information-filter"
  ]
}
```

Der genaue Transportweg ist Implementierungsdetail. Der Vertrag muss jedoch garantieren:

- identische Szenen- und Materialkoordinaten,
- versionierte Feldinhalte,
- eindeutige Lebensdauer jeder injizierten Ressource,
- Aktivieren und Deaktivieren ohne Zustandsverlust,
- deterministische Wiederherstellung für Tests und Storyboards,
- keine unabhängige Klassifikation außerhalb der kanonischen SHADED-Analyse.

---

## 8. Aktivitäts-Scheduler

Ein Weltgesetz wird nicht aktiviert, weil es existiert, sondern weil seine Voraussetzungen erfüllt sind.

Beispiel:

```text
Schnee aktiv
  → Snow/Trace Field laden
  → Fußspuren + Winddrift + Blutkontrast aktivieren

Feuer im Schnee aktiv
  → zusätzlich Heat/Atmos Field laden
  → Schmelze + Dampf + Rauch + Lichtbrechung aktivieren

Innenraum betreten
  → volumetrischen Schneefall abschalten
  → persistente Außenspuren entbinden, nicht löschen
  → Rauchschichtung und Mauerfeuchte nach Bedarf binden
```

### Auswahlkriterien

- **Sichtbarkeit:** Ist das betroffene Material oder Gebiet überhaupt im Bild?
- **Mechanische Relevanz:** Kann Spieler, NPC oder Simulation mit dem Zustand interagieren?
- **Kausalität:** Existiert eine Quelle für das Gesetz, etwa Feuer, Wasser, Wind oder Magie?
- **Priorität:** Welche Effekte tragen gerade die Szene und welche wären nur visuelles Rauschen?
- **Budget:** Welche Gesetze laufen in der Base Runtime, welche über ReShade und welche bleiben logisch inaktiv?

### Degradationsregel

Wenn das Budget nicht reicht, wird nicht der Weltzustand gelöscht. Nur seine Darstellung wird abgestuft:

1. mechanisch + vollständig sichtbar,
2. mechanisch + vereinfachte Darstellung,
3. logisch simuliert + nur indirekte Spuren,
4. persistiert, aber bis zur nächsten Relevanz nicht gerendert.

---

## 9. Nächster sinnvoller Architektur-Sprint

Vor dem massenhaften Portieren weiterer Shader braucht SHADED nicht zuerst ein Shader-Rewrite, sondern den verbindenden Rücken:

1. **Bridge-Schema definieren** – aktive Gesetze, Parameter, Feldbeschreibungen, Versionen.
2. **World-Law Scheduler bauen** – Aktivierung aus Sichtbarkeit, Ursache, Gameplay und Budget.
3. **Field-Bank einführen** – Hydro, Trace, Structure, Atmos, Bio und Arcane zunächst als logische Profile.
4. **ReShade-Adapter-Prototyp** – mindestens ein externes Feld und ein externer Post-Pass.
5. **Ressourcen-Lebenszyklus testen** – injizieren, austauschen, entbinden, später deterministisch wiederherstellen.
6. **Beweislevel fahren** – Schnee + Fußspuren + Wind + Blut + Fackellicht.

Der Beweislevel eignet sich besonders gut, weil er dynamisches Umschalten erzwingt:

- Schnee und Wind benötigen andere Ressourcen als Feuer und Rauch.
- Blut muss logisch persistent bleiben und je nach Untergrund anders dargestellt werden.
- Hitzeverzug kann über den externen Pass laufen.
- Beim Wechsel zwischen Außen- und Innenraum müssen Felder gebunden und entbunden werden, ohne Weltgeschichte zu verlieren.

Danach folgen als erste inhaltliche Feldpakete:

1. **#7 Klangwellen** – Impuls-/Trail-Logik.
2. **#8 Mauerfeuchte** – Nässe, Trocknung, Moos und Frost.
3. **#10 Öl/Fett/Harz** – Transfer, Brennbarkeit und Reinigung.
4. **#12 Bodengedächtnis** – langfristige Weltgeschichte.
5. **#14 Krankheit/Gift** – Reaction-Diffusion als biologisches Feld.
6. **#17 Blut vervollständigen** – Alter, Verdünnung, Übertragung und Restschuld.
7. **#18 Magie als Brechungsfehler** – externes Post-Processing plus ArcaneField.
8. **#21 Kristallwachstum** – Frost, Sprödigkeit und Kälte.
9. **#31 Reinigung** – Gegenmechanik für Blut, Öl, Ruß, Gift und verborgene Hinweise.

---

## 10. Übernahmeregel

Für jede neue Referenz werden künftig genau diese Felder dokumentiert:

```text
Name:
URL:
Rolle: Zielbild | Algorithmus | Implementierung
Weltgesetze:
Ausführungsschicht: Base Runtime | Bridge Field | ReShade | Engine-native
Portierbarkeit: A | B | C
Aktivierungsbedingungen:
Benötigte Felder/Texturen:
Persistenz:
Lizenz:
Übernehmbarer Kern:
Nicht übernehmen:
SHADED-Testszene:
```

Ein Shader ohne diese Einordnung wird nicht Teil des Kanons. So bleibt die Sammlung eine **Blaupausenbibliothek** statt eines Friedhofs schöner Links.