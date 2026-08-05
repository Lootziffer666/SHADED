# SHADED-Fähigkeiten: mehr als Rendering-Effekte

SHADED ist nicht „ein Shader-Editor mit vielen Effekten“.

SHADED ist eine deterministische 2D-Weltsimulation, die ein einzelnes Bild semantisch zerlegt, materialabhängig altern lässt, räumlich inszeniert und als interaktive, erzählbare Szene betreibt.

Godrays, Bloom, Normal Maps, Partikel und Distortion sind dabei nur die sichtbaren Werkzeuge. Das eigentliche Alleinstellungsmerkmal ist: **Zustände hinterlassen Folgen**. Regen schaltet nicht bloß einen Filter an – er füllt Senken, verändert Materialien, löscht Feuer, erzeugt Spuren und beeinflusst spätere Zustände.

## Kernprinzip

SHADED arbeitet auf einer Ebene oberhalb klassischer Rendering-Techniken:

1. Das Bild wird in Materialien und Raumhinweise zerlegt.
2. Jedes Material reagiert anders auf Wetter, Temperatur, Zeit, Feuer, Druck und Interaktion.
3. Der Shader zeigt nicht nur Effekte, sondern die Konsequenzen dieser Zustände.
4. CPU-Klassifikation und GPU-Darstellung bleiben dieselbe Materialwahrheit.
5. Storyboard, Interaktion und Actors greifen auf dieselbe laufende Welt zu.

## Fähigkeiten nach Systembereich

| Bereich | Fähigkeiten |
|---|---|
| Hydrologie | Materialabhängige Nässe, Pfützenbildung in Senken, Wasserflussnetze, Rinnsale, Tropfkanten, Regeneinschläge, Ausbluten von Wasser in Grasränder, Spiegelung von Himmel und Fensterlicht, Verdunstung und Trocknungsränder |
| Wetter | Regen, Sturmaufzug, Blitz-Doppelschläge, Nebel, Wolkenschatten, Rauch, Windbewegung und atmosphärische Sichtweitenänderung |
| Tageszeit & Licht | Tag-Nacht-Zyklus, Mondlicht, Fensterflackern, Emissivlicht, Warmlichtreflexionen, Lichtverschmutzung, lokale Temperaturbeleuchtung und Mikro-Exposure |
| Jahreszeiten | Schneefall, Schneebedeckung, Schneedellen, Schmelze, Frost, Eisflächen, Eiszapfen, Herbstfärbung, Laubfall, Frühlingswachstum und Sonnenbleiche |
| Materialverhalten | Gras, Blattwerk, Dach, Pfad, Holz, Fenster, Wasser und Fels reagieren unterschiedlich auf Wasser, Temperatur, Alterung, Feuer und Belastung |
| Verfall | Moos, Überwucherung, Rost, Risse, morsches Holz, Weltmüdigkeit, Berührungsabnutzung, Brandspuren und sichtbare Reparaturstellen |
| Interaktion | Laufende Spielfigur, Sprint, Fußspuren, Trampelpfade, Schneedellen, aufgewirbeltes Laub, fallende Früchte, Lagerfeuer, Brandausbreitung und Löschen durch Regen |
| Lebewesen | Atmung, Frostatem, Nässezustand sowie animierte Katzen, NPCs, Gegner und Helden mit Animationen und Tiefenschichten |
| Räumlichkeit | Tiefenkarten-Parallaxe, Vorder-/Mittel-/Hintergrundsortierung, tiefenabhängige Actor-Helligkeit, Gebäudezonen, Dach- und Bodenanker, lokaler Depth→Point-Cloud-Export |
| Inspektion | Umschaltbare Linsen für Abnutzung, Belastung, Klangwellen, unveränderte Materialansicht und Kantenerkennung |
| Shader-Fidelity | Godrays, abgeleitetes Bump-/Normal-Mapping, Ambient Occlusion, mehrstufige Lichtquantisierung, volumetrische Wolken/Lichtschächte, Bloom-Halos, Spatial Distortion, Chromatic Aberration und depth-aware Point-Cloud-Motes |

## Ungewöhnliche Weltgesetze

SHADED simuliert auch Zustände, die normalerweise nicht in einer Shader-Demo erwartet werden:

- Druck und Gewicht verdunkeln belastete Bodenbereiche.
- Geruch wird als driftende Diffusionswolke sichtbar.
- Schattenbesitz beeinflusst, wie schnell Flächen altern.
- Biomgrenzen werden räumlich sichtbar.
- Verbotene Bereiche erhalten eine kalte Grenzreaktion.
- Oberflächenrunen können auf Wasser oder Flächen erscheinen.
- NPC-Stimmung färbt die Welt atmosphärisch.
- Segen und Fluch verändern Helligkeit, Bloom und Verfall.
- Vegetation reagiert auf Wind und Regen.
- Hitze verzerrt die Luft, Rauch bildet Schichten und Temperaturen erzeugen lokale Warm-Kalt-Gradienten.

Der dokumentierte Phase-C-Stand nennt 31 von 60 Weltgesetzen als aktiv implementiert. Einige davon sind bewusst visuelle Simulationen, keine vollständige mechanische Physik oder Gameplay-Logik.

## Bildverstehen und Korrektur

Das Bildverständnis ist mindestens so wichtig wie die Shader-Fidelity:

1. Automatische Materialsegmentierung eines beliebigen Bildes.
2. Fenstererkennung über Holzrahmen, statt „dunkler Fleck = Fenster“.
3. Himmelserkennung, damit blaue obere Bildbereiche nicht versehentlich zu Wasser oder Fenstern werden.
4. Gebäudeerkennung über Fachwerk- und Nachbarschaftsstrukturen.
5. Marker-Overlay-Korrektur: Nur falsch erkannte Stellen werden angemalt; der Rest bleibt automatisch.
6. Licht-Material-Trennung: Eingebackene Beleuchtung wird von Oberflächenfarbe getrennt, damit Wetter und Schatten nicht auf bereits vorhandene Schatten draufmultipliziert werden.
7. Companion-Dateien für Tiefen-, Shading-, Emissiv- und Actor-Zustände.
8. Lokaler Point-Cloud-Export aus sichtbarer Szenenfarbe und Tiefenkarte, ausdrücklich ohne behauptete Rückseitengeometrie.

CPU-Klassifikation und GPU-Darstellung stammen aus derselben Materialwahrheit. Dadurch wird ausdrücklich verhindert, dass der Shader eine Fläche als Stein behandelt, während Gameplay und Tools dort Gras sehen.

## Szenen- und Erzählwerkzeug

SHADED kann außerdem:

- filmische Akte und Presets abspielen,
- eigene Storyboards aus Parameter-Keyframes bauen,
- Übergänge zeitlich interpolieren und loopen,
- Dialoge mit Schreibmaschinen-Effekt und Trigger-Beats abspielen,
- Parameter live einstellen und Presets speichern,
- Marker direkt malen,
- Actors platzieren und animieren,
- Szenen als PNG aufnehmen,
- WebM-Aufzeichnungen erzeugen,
- Projekte über Orchestrator- beziehungsweise CLI-Verträge laden und exportieren,
- Sprite-Sheets und Manifeste lokal erzeugen beziehungsweise bearbeiten.

Der separate Editor steuert dieselbe Engine, statt eine zweite Shader-Version zu duplizieren.

## Ehrliche Einordnung

SHADED ist nicht fertig „physikalisch korrekt“. Es ist eine deterministische visuelle Weltmaschine: materialbewusst, zeitorientiert, interaktiv, erzählbar und offline ausführbar.

Das Ziel ist nicht, möglichst viele Renderbuzzwords zu stapeln. Das Ziel ist, dass jedes sichtbare Phänomen aus einem Zustand entsteht und wiederum Spuren für spätere Zustände hinterlässt.
