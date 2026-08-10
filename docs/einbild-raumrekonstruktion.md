# Raum aus einem Bild — der `SingleViewRoomProvider`

Erste reale Umsetzung des Vertrags `GuidedMetricDepthProvider` aus
[`reconstruction-provider-und-world-surface-graph.md`](reconstruction-provider-und-world-surface-graph.md):
RGB-Einzelbild plus **genau ein** metrischer Anker.

```bash
python3 tools/single_view_room.py content/raum/messehalle.png   # -> .room.json
python3 tools/room_to_assets.py content/raum/messehalle.room.json
#   -> _depth.png  .pointcloud.json  -overlay.png  .hall.json
```

## Warum kein Schätznetz

Depth Anything liefert für eine leere Halle ein weiches Relieffeld: der Boden
wölbt sich, die Stützen verschmieren, die Decke wird zur Kuppel. Für Parallaxe
reicht das. Für eine begehbare Szene nicht — dort fällt jede Krümmung sofort auf.

Dieses Bild braucht kein Netz. Es ist eine Manhattan-Welt in Zentralperspektive:
ebener Boden, ebene Decke, frontale Rückwand, lotrechte Stützen. Diese Struktur
lässt sich **ablesen**. Nach der Vorrangregel des Providervertrags

```
gemessen > multiview > engine-bekannt > geführt > monokular
```

ist das die höchstwertige Quelle, die aus einem Einzelbild erreichbar ist — und
sie läuft ohne Modellgewichte und ohne GPU.

## Messkette

| Schritt | Ergebnis | Probe |
|---|---|---|
| Kanten → Hough → TLS → RANSAC | Fluchtpunkt | 31 von 50 Linien tragen, Restfehler 5,0 px |
| Quer- und Senkrechtlinien parallel? | Hauptpunkt **=** Fluchtpunkt | folgt zwingend; das Bild ist ein Ausschnitt |
| Wand-Boden-Fuge über die volle Breite | Rückwandtiefe | 38 Stützstellen, Restfehler 2,4 px → Wand frontal, Boden eben |
| Wand-Decken-Fuge | Deckenhöhe `hc/h` | grober Wert, wird verworfen |
| **Spiegelprobe** | Deckenhöhe `hc/h` = 0,276 | zwei Bänder unabhängig, 5 % Abweichung |
| Stützen im Wandband | Breite, Reihen | Reihenstreuung 0,021 / 0,040 bei X/h ≈ −1,91 / +1,18 |
| Bodenraster (Autokorrelation + Spektrum) | Brennweite | 968 px → 70° Bildwinkel |

### Die Spiegelprobe

Ein Leuchtband in der Höhe `hc` über der Kamera hat im Boden ein Spiegelbild in
der scheinbaren Tiefe `2h + hc`. Aus der Steigung des direkten Bandes folgt
zwingend die Steigung seines Glanzstreifens:

```
k_spiegel = −k_direkt · hc / (2h + hc)
```

Beide gemessenen Bänder treffen ihre Vorhersage auf rund 5 %, und beide rechnen
**dasselbe** `hc/h` zurück. Das ist der stärkste Einzelbeleg der ganzen Kette:
die Deckenhöhe wird aus einer völlig anderen Bildregion bestätigt als der, aus
der sie zuerst kam. Deshalb führt dieser Wert, und die Wandkante ist Gegenprobe.

### Drei Fallen, die hier zuschnappen

1. **Der Fußpunkt einer Stütze ist nicht das Ende ihres dunklen Balkens.** Der
   Boden spiegelt; jede Stütze setzt sich unter ihrem Fuß als Spiegelbild fort,
   und zwar bis zum rund 2,3-fachen der wahren Fußtiefe. Flankenkontrast findet
   deshalb den falschen Punkt. Der Stahl ist aber *dunkler* als seine
   Spiegelung — die Eigenhelligkeit trennt beide sauber.
2. **Die Autokorrelation eines Rasters hat bei jedem Vielfachen einen Gipfel**,
   und ein Vielfaches korreliert oft stärker als die Teilung selbst. Genommen
   wird darum der *kleinste* Versatz nahe am Maximum, nicht der höchste Gipfel.
3. **Der Boden wird zum Horizont hin gleichmäßig dunkler.** Dieser Trend
   korreliert mit jeder langen Periode und zieht die Tiefenteilung immer weiter
   nach oben. Erst nach Abzug des Trends zeigt das Spektrum die echte Fugenfolge.

## Die eine unvermeidliche Annahme

Zentralperspektive kann Tiefe und Brennweite **nicht** trennen: jede Brennweite
erzeugt eine Rekonstruktion, die sich exakt auf das Ausgangsbild zurückbildet.
Erst wer den Blickpunkt verlässt, sieht den Unterschied. Genau eine Formaussage
muss also gesetzt werden.

Gewählt sind **quadratische Bodenfliesen** — ein Baumodul, das man dem Bild
ansieht. Das quadratische Stützenjoch wäre naheliegender, ist hier aber
nachweislich falsch: es ergäbe 28° Bildwinkel, bei dem die Decke nicht mehr über
der Kamera stünde. Sie steht dort. Die verbleibende Bandbreite plausibler
Brennweiten steht als `f_bandbreite_px` im Modell (876 … 1244 px).

## Ergebnis (Anker: Fliese 0,60 m)

| | |
|---|---|
| Kamerahöhe | **1,75 m** — Augenhöhe, also widerspricht der Anker sich nicht selbst |
| lichte Höhe | 2,23 m |
| Rückwand | 16,4 m |
| Stützen | 0,26 m, Reihen bei X = −3,35 m und +2,06 m, Joch 1,87 m |
| Leuchtbänder | Teilung 1,80 m = genau 3 Fliesen |

Der Anker skaliert die Halle, nicht ihre Form. Wer 0,80 m einsetzt, bekommt
dieselbe Halle ein Drittel größer.

## Was nicht messbar ist

* **Die Hallenbreite.** Die Rückwand füllt das Bild bis an beide Ränder; seitlich
  geht der Raum weiter, als das Bild zeigt. Steht im Plan als `breite_m: null`.
* **Alles hinter Rückwand und Stützen.** Ein Einzelbild hat keine Rückseite.
* **Der absolute Maßstab.** Dafür steht der deklarierte Anker.

Diese Liste steht als `nicht_gemessen` **im Artefakt selbst**, nicht nur hier.

## Artefakte

| Datei | Inhalt |
|---|---|
| `.room.json` | vollständiger Messbericht mit Provenienz je Schritt |
| `.hall.json` | `SHADED.hall-plan.v1` — schlanker Bauplan für BEUTELTIER |
| `_depth.png` | Companion-Tiefenkarte, **weiß = nah** (Konvention aus `index.html`) |
| `.pointcloud.json` | `SHADED.metric-point-cloud.v1` — echte Meter |
| `-overlay.png` | Rückprojektion auf das Ausgangsbild — der Sichtbeweis |

Die Tiefenkarte entsteht aus der vermessenen Geometrie, nicht aus einer
Schätzung: jeder Bildpunkt wird gegen Boden, Decke, Rückwand und Stützenkörper
geschnitten. Ebenen bleiben eben, Kanten bleiben Kanten. Sie ist damit ein
regulärer Companion — `messehalle.png` daneben gelegt, findet `index.html` sie
selbst und schaltet 2.5D-Parallaxe samt `SHADED.spatial.pointCloud()` frei.

**Zwei Punktwolkenformate, mit Absicht.** `SHADED.spatial-point-cloud.v1` (in
`index.html`) führt `z` normiert in 0..1 aus einer Companion-Tiefenkarte;
`SHADED.metric-point-cloud.v1` führt Meter aus vermessener Geometrie. Zwei
Formate statt einer überladenen Bedeutung — dieselbe Trennung, die Invariante 2
für Klassen verlangt.

## Weiterverwendung

BEUTELTIER baut aus `.hall.json` die begehbare Halle
(`app/src/halle/einbildhalle.ts`, Betrachter unter `app/halle.html`). Die
Abhängigkeit zeigt in **eine** Richtung — wie bei SWIFT und TRIVIUM. SHADED
richtet sich nie nach BEUTELTIER.
