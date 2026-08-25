# Raum aus einem Bild — der `SingleViewRoomProvider`

Erste reale Umsetzung des Vertrags `GuidedMetricDepthProvider` aus
[`reconstruction-provider-und-world-surface-graph.md`](reconstruction-provider-und-world-surface-graph.md):
RGB-Einzelbild plus **genau ein** metrischer Anker.

```bash
python3 tools/single_view_room.py content/raum/messehalle.png   # -> .room.json
python3 tools/room_to_assets.py content/raum/messehalle.room.json
#   -> _depth.png  .pointcloud.json  -overlay.png  .hall.json

# Anker wählen (Vorgabe: decke -- siehe "Zwei Anker" unten) und mehrere
# Fotos nacheinander messen, einzeln aufgezählt oder als Verzeichnis:
python3 tools/single_view_room.py --anker-quelle decke --anker-m 0.60 content/raum/
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
| Deckenraster (Autokorrelation, seitlich) | Kassetten-/Trägerteilung | Korrelation 0,51 (Boden zum Vergleich: 0,44) |

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

## Zwei Anker, eine Rekonstruktion

Zwei Flächen im Bild tragen je ein eigenes, unabhängig gemessenes
"je Kamerahöhe"-Verhältnis: `bodenraster()` (Autokorrelation über die
sichtbaren Bodenplatten) und `deckenraster()` (dieselbe Autokorrelation über
die Kassetten-/Trägerfugen der Decke, mit den Leuchtbändern ausmaskiert,
weil sie um ein Vielfaches heller sind als jede Fuge). Beide Verhältnisse
sind `MEASURED`; welche der beiden Flächen die deklarierte Länge trägt, ist
eine Sachfrage vor Ort, keine Rechnung.

**Ursprünglich stand hier die Bodenfliese als Anker (0,60 m).** Das war
falsch — nicht als Rechnung, sondern als Zuordnung: am Referenzfoto sind die
Bodenplatten großformatig, das feine ~60-cm-Fugenraster sitzt an der Decke.
`--anker-quelle` steht deshalb jetzt auf `decke`.

## Ergebnis (Anker: Deckenraster 0,60 m)

| | |
|---|---|
| Kamerahöhe | 2,10 m |
| lichte Höhe | 2,68 m |
| Rückwand | 19,7 m |
| Stützen | 0,31 m, Joch 2,25 m |
| Leuchtbänder | Teilung 2,15 m |
| Gegenprobe: Bodenfliese | 0,72 m — größer als der Deckenanker, passt zur Beobachtung "Bodenkacheln riesig" |

Der Anker skaliert die Halle, nicht ihre Form. Wer ihn ändert, bekommt
dieselbe Halle größer oder kleiner — die Gegenprobe-Zeile zeigt, was die
JEWEILS ANDERE Fläche unter dem gewählten Anker messen müsste; das ist eine
Plausibilitätsprüfung am Foto, kein Beweis.

**Offener Widerspruch, nicht stillschweigend geglättet:** BEUTELTIERs
`site.json` führt für Halle 10.1 `clearHeightM: 5.7` mit
`heightSource: "official"`. Diese Messung ergibt 2,68 m lichte Höhe — Faktor
~2,1 daneben. Einer von drei Fällen liegt vor: das Foto zeigt nicht dieselbe
Zone in voller Hallenhöhe (Halle 10 hat mehrere Ebenen, siehe `10.2` mit
`floorElevationMinM: 7.2`), der 0,60-m-Anker ist selbst noch ungenau, oder
BEUTELTIERs Wert ist für diese Fläche nicht zutreffend. Keine dieser drei
Möglichkeiten wird hier entschieden — dafür fehlt eine zweite, unabhängige
Quelle (ein Türmaß, eine amtliche Vermessung vor Ort).

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
