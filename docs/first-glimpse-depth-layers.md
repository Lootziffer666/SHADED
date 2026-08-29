# First Glimpse: SHADED-eigene Tiefenschicht statt externer Provider

Ausgangspunkt: der Wunsch des Maintainers, so viel räumliche Struktur wie möglich aus
SHADEDs eigenen, bereits vorhandenen, billigen Hinweisen abzuleiten — statt auf einen
großen externen Depth-/3D-Provider als Fundament zu bauen (der bleibt Teacher/Fallback,
nie die Ziel-Runtime, siehe `docs/SHADED_BEUTELTIER_ARCHITEKTUR_REFERENZ_ERWEITERT_CHAT_INTEGRIERT.md`).
Konkreter Auslöser: Regen/Schnee/Hagel wirkten als reines Screen-Space-Overlay ohne
Tiefenbezug zur Szene.

**Wichtige Klarstellung des Maintainers, die diesen Ansatz motiviert (nicht verworfen,
nur eingeordnet):** "Multiple observations" im klassischen SLAM/SfM-Sinn (mehrere Fotos)
sind nicht die einzige Quelle unabhängiger Evidenz. Point Clouds können selbst als Sensor
dienen — mehrere intern abgeleitete, schwache Hypothesen aus DEMSELBEN Bild (z. B. die
Spiegelprobe in `tools/single_view_room.py`, die zwei unabhängig gemessene Leuchtband-Höhen
gegeneinander validiert) können sich gegenseitig einschränken, ohne eine zweite Aufnahme zu
brauchen. Registrierung als Messinstrument (Aufgabe 5 des Maintainer-Briefings) gilt daher
auch innerhalb eines einzigen Bildes. BEUTELTIER ist dabei kein separater "Domain-Owner" für
Raumrekonstruktion, dem SHADED das überlässt — BEUTELTIER ist ein Produkt SHADEDs, das seine
eigene Entstehung mitgeformt hat, indem es SHADEDs Grundannahmen erweitern musste. Die
Trennung "SHADED = ein Bild, BEUTELTIER = viele Fotos" ist eine Vereinfachung für die
Verantwortungsabgrenzung in CLAUDE.md, keine Aussage darüber, welche Verfahren SHADED
grundsätzlich nutzen darf.

## Vorab-Audit (vor jeder Code-Änderung, drei parallele Recherche-Agenten)

Bevor Code geschrieben wurde, wurde der bestehende Code gegen die vom Maintainer
vorgegebene Fähigkeitenliste geprüft (WORKING/PARTIAL/PRESENT-BUT-UNUSED/BROKEN/PLANNED).
Zentrale Befunde:

- `tools/single_view_room.py` — echte, live verifizierte Fluchtpunkt-/Hough-/RANSAC-/
  Spiegelprobe-Vermessung, aber **hart auf die Pixelgeometrie von `messehalle.png`
  verdrahtet** (feste Zeilenbereiche, nicht bild-relativ) und ungeeignet für SHADEDs
  isometrische Illustrationsbilder (keine echten Fluchtpunkte in diesem Stil).
- `runtime/spatial-kernel/` (SDF-Primitive, Voxel-Fusion mit Provenienz-Vertrauen,
  RANSAC-Ebenen-/Primitivfitting, 2D/3D Connected Components, Dijkstra-Freiraum) —
  **echt, getestet, bildunabhängig-generisch — aber nirgendwo an den Hauptrenderer oder
  das Wettersystem angebunden**, nur über den separaten "🧭 POINTS-Raum"-Viewer erreichbar.
- `runtime/shaded-engine.mjs:analyze()` berechnet bereits `classGrid` (Material),
  `skyGrid`/`skyAt` (K7-Himmel-Flood), `zoneGrid`/`zoneAt` (K1-Gebäudezonen) — de facto
  bereits eine grobe Vorder-/Mittel-/Hintergrund-Ordnung, nur nie als solche gerahmt.
- Zwei reale, live reproduzierte Bugs in benannten Providern (`shaded_ransac_planes.py`:
  `float32` nicht JSON-serialisierbar; `shaded_scale_align.py`: fehlender Import), beide
  seit ihrem Einführungscommit unbenutzt kaputt — nicht blockierend für Exp. 1, aber als
  günstige Fixes vermerkt, falls diese Provider in einer späteren Stufe gebraucht werden.
- Mehrere als "REAL provider" dokumentierte Python-Stubs (`_register_torch(...)` in
  `tools/shaded-provider.py`) tun beim echten Lauf nichts außer zwei Logzeilen — Dokumentation
  und Code widersprechen sich dort.

Vollständiges Audit-Protokoll (drei Recherche-Agenten, Chat-Transkript dieser Session).

## Benchmark-Reihenfolge (Ablation, ein Schritt nach dem anderen)

| Exp. | Was | Status |
|---|---|---|
| 0 | Baseline: `classGrid` + optionale Companion-Tiefenkarte + einzelne Flat-Plane-Parallaxe + Wetter als Screen-Space-Overlay mit binärer Landeprüfung | Heutiger Stand vor dieser Datei, per `tools/verify.js` gemessen |
| **1** | **Grobe `NEAR/MID/FAR/STRUCTURAL/UNKNOWN`-Schicht, DERIVED aus `classGrid`/`zoneGrid`/`skyGrid` — keine neue Erkennung** | **✅ Umgesetzt, siehe unten** |
| **2** | **Zusammenhängende Occlusion-/Tiefen-Layer (Connected Components über der Exp.-1-Schicht statt verstreuter Einzelpixel)** | **✅ Umgesetzt, siehe unten** |
| **3** | **Wetterpartikel occluded hinter STRUCTURAL-Regionen statt darüber gemalt; Tiefen-Fallback aus depthLayerAt() statt Math.random() (Aufgabe 2 des Maintainer-Briefings)** | **✅ Umgesetzt, siehe unten** |
| **4** | **Generalisierter (nicht `messehalle.png`-fest verdrahteter) Fluchtpunkt-/Raummess-Detektor in `tools/single_view_room.py` — bild-relative Suchfenster statt hart verdrahteter Pixelwerte, resolutionsskalierte Bodenraster-Schwellen, nie-abstürzende Degradation auf UNKNOWN** | **✅ Umgesetzt, siehe unten — angestoßen, weil künftige Bilder echte Fotos sind, nicht nur SHADEDs isometrische Testbilder** |

## Exp. 1 — Umsetzung

**Regel (Priorität von oben nach unten), pro `classGrid`-Pixel:**

```
skyGrid[j]   == 1  -> FAR
zoneGrid[j]  == 1  -> STRUCTURAL   (K1-Gebäudezone)
classGrid[j] in {roof, window, wood}  -> STRUCTURAL
classGrid[j] in {foliage, rock}       -> MID
classGrid[j] in {path, grass, water}  -> NEAR
sonst                                  -> UNKNOWN  (heute unerreichbar, classGrid deckt
                                                     immer eine der 8 Klassen ab — Feld
                                                     bleibt für künftige Provider mit
                                                     echten Lücken reserviert)
```

Bewusst schwächste Annahmen dieser Stufe (Kandidaten für Exp. 2, nicht für Exp. 1):
Holz gilt IMMER als Struktur (auch freistehende Zäune), Fels IMMER als Mittelgrund (auch
wenn er direkt an eine Gebäudewand lehnt) — beides ohne Adjazenzprüfung, um Exp. 1 auf
eine reine Ableitung ohne neue Konnektivitätsberechnung zu beschränken.

**Code:** `runtime/shaded-engine.mjs` — `buildLayerGrid()` (läuft am Ende von `analyze()`,
vor `ready=true`), öffentlich als `window.SHADED.depthLayerAt(u,v)` (String) und
`window.SHADED.depthLayers()` (Diagnose-Zählung je Schicht). Keine neue Texture-Unit, kein
Shader-Kanal — reine CPU-Abfrage, weil aktuelle Verbraucher (Wetterpartikel) ohnehin
Canvas-2D/CPU-seitig arbeiten (Invariante 7 gilt erst, wenn ein GPU-Kanal gebraucht wird).

**Beweis:** `node tools/verify-depth-layers.js` (9 Prüfungen: sicherer Default vor
`erstellen()`, Layer-Verteilung ohne Himmel-Bild `far==0`, 400-Punkte-Stichprobe konsistent
mit der Prioritätsregel, Layer-Verteilung mit Himmel-Bild `far>0`, kein Altzustand nach
erneutem `erstellen()`, keine Konsolenfehler) — alle bestanden. `tools/verify.js`
(Klassenregression aller fünf Szenen) unverändert grün, da `layerGrid` `classGrid` nur
liest, nie schreibt.

## Nicht Teil von Exp. 1

- Keine Änderung an `runtime/weather-particles.mjs` (das ist Exp. 3).
- Keine Konnektivitäts-/Adjazenzberechnung (das ist Exp. 2).
- Kein neuer Fluchtpunkt-/Hough-Code (Exp. 4, niedrige Priorität für SHADEDs Bildstil).
- Keine der als BROKEN/Stub befundenen Provider wurden repariert — sie werden erst
  angefasst, wenn eine spätere Stufe sie tatsächlich braucht.

## Exp. 2 — Umsetzung

Statt einer dritten Flood-Fill-Implementierung: Wiederverwendung der bereits getesteten
8-Konnektivitäts-Komponentensuche aus `runtime/hall-plan/plan-analyzer.mjs:connectedComponents`
(bisheriger einziger Aufrufer: `PlanAnalyzer.analyze()` für Grundrisse — bild-/domänenunabhängig,
arbeitet nur auf einer 0/255-Maske + `{width,height}`). Erweiterung dort nicht-brechend: die
Funktion hängt jetzt zusätzlich `comps.labelGrid` (das interne Pixel→Komponenten-Label-Array)
an das zurückgegebene Array an, damit Aufrufer, die pro Pixel wissen müssen, zu welcher
Komponente er gehört, die Flood-Fill nicht ein zweites Mal schreiben müssen. Dabei wurde eine
O(Pixel × Anzahl_verworfener_Kleinkomponenten)-Falle vermieden (erster Entwurf scannte bei jeder
unter `minArea` verworfenen Komponente das gesamte Bild neu) — die finale Fassung sammelt
akzeptierte Label in einem `Set` und bereinigt verworfene in einem einzigen abschließenden
O(Pixel)-Durchlauf. `tests/hall-plan-tests.mjs` (34/34) bestätigt: keine Verhaltensänderung für
den bestehenden Aufrufer.

`buildLayerRegions()` (`runtime/shaded-engine.mjs`, läuft direkt nach `buildLayerGrid()`) ruft
`connectedComponents()` einmal pro Exp.-1-Schicht auf (5 Aufrufe, da die Funktion eine binäre
Maske erwartet), sammelt alle Komponenten über alle Schichten in einer global eindeutig
ID-nummerierten Liste (`layerRegions`, größte zuerst) und schreibt die Pixel→Region-Zuordnung in
`componentGrid`. `minArea` skaliert mit der Bildfläche (0,15 % der Pixelzahl, mindestens 16) statt
eines festen Werts — dieselbe relative Rausch-Schwelle bei jeder Analyseauflösung.

**Öffentliches API:** `window.SHADED.depthRegions()` (Kopie der Regionsliste: `{id, layer, pixels,
bbox:{minU,minV,maxU,maxV}, centroid:{u,v}}`, absteigend nach Pixelzahl) und
`window.SHADED.depthRegionAt(u,v)` (Region-ID an einer UV-Position, `null` ohne Szene oder
außerhalb jeder Region).

**Beweis:** `node tools/verify-depth-layers.js`, sieben neue Prüfungen (sichere Defaults vor
`erstellen()`, ≥3 Regionen im himmel-losen Testbild, absteigende Sortierung, bbox/centroid-
Plausibilität, Pixelsumme ≤ Gesamtpixelzahl, `depthRegionAt()` am Schwerpunkt der größten Region
liefert deren eigene ID und stimmt mit `depthLayerAt()` überein, eindeutige IDs) — alle bestanden,
zusammen mit den neun Exp.-1-Prüfungen. `tools/verify.js` unverändert grün (fünf Szenen, keine
Konsolenfehler).

**Reale Messung** (Testbild ohne Himmel, `768×432` Analyseauflösung, 331.776 Pixel): 23 Regionen
gefunden, 318.333 der 331.776 Pixel einer Region zugeordnet (Rest unter `minArea`-Schwelle als
Rauschen verworfen). Größte Region: 93.039 Pixel, Schicht `near`, Bounding-Box deckt fast das
gesamte Bild ab (`minU=0.07…maxU=0.96`, `minV=0.20…maxV=0.97`).

**Bekannte Schwäche dieser Stufe (Kandidat für eine spätere Verfeinerung, nicht für Exp. 3):**
Exp. 1 fasst Pfad, Gras und Wasser alle in EINE `near`-Schicht zusammen; da diese drei Materialien
in der Praxis meist zusammenhängend sind, wird daraus im Testbild EINE große Region, die fast das
ganze Bild überspannt — Connected Components liefert damit hier weniger zusätzliche Struktur, als
die Zahl "23 Regionen" suggeriert (die meisten kleineren Regionen stammen aus `mid`/`structural`,
wo Gebäude/Vegetation tatsächlich in separate Klumpen zerfallen). Für Exp. 3 ausreichend (jedes
Wetterpartikel braucht nur EINEN Landepunkt, keine feingranulare Bodensegmentierung); für eine
belastbarere Occlusion-Hierarchie müsste `near` in Exp. 1 feiner unterteilt werden (z. B. Wasser
separat, da es sich anders verhält als begehbarer Boden).

## Exp. 3 — Umsetzung

Zwei Bausteine in `runtime/weather-particles.mjs`, beide reine Weiterverwendung von Exp. 1/2 —
kein neues 3D-Weltvolumen, keine Kamera-Projektion (das wäre kein "kleinster nächster Schritt"
mehr, siehe Antwort an den Maintainer zu Registrierung/Point-Clouds-als-Sensoren weiter oben):

1. **`weatherPseudoDepthAt(u,v)`:** wenn KEINE echte Companion-Tiefenkarte geladen ist (der
   Regelfall für SHADEDs Testbilder), war die Tiefe von Regen/Schnee/Hagel bisher schlicht
   `Math.random()` — reines Rauschen, kein Szenenbezug. Ersetzt durch einen aus `depthLayerAt()`
   abgeleiteten Wert (near=0.85 am nächsten, far=0.1 am fernsten). Betrifft Spawn UND die
   Pro-Frame-Nachführung aller drei Partikelsysteme (vorher hatte Hagel z. B. gar keine
   Pro-Frame-Nachführung ohne echte Karte — `h.depth` blieb für die gesamte Lebensdauer des
   Korns beim Spawn-Zufallswert eingefroren).
2. **`weatherOccludedAt(u,v)`:** eine `structural`-Region (Gebäude/Dach) gilt als näher als die
   angenommene Wetterebene — fallende Partikel werden dort nicht gezeichnet, verschwinden also
   hinter der Silhouette statt darüber gemalt zu werden. Nur für NICHT-liegenden/liegenden-
   Zustand relevant: liegender Schnee bleibt auf einem Dach sichtbar (er sitzt AUF der Struktur,
   nicht dahinter), genau wie zuvor schon bei Fels/Wald.

**Randfall, gefunden beim Verifizieren, nicht vorher erkennbar:** Regen ist eine ~20–70px lange
Diagonale, Hagel/Schnee sind kleine Kreise — nicht nur ihr Ursprungspunkt zählt. Einen einzelnen
Punkt pro Partikel zu prüfen ließ eine dünne Dachkante mitten auf der Linie bzw. am Kreisrand
durchrutschen (schwaches Antialiasing-Bluten, keine sichtbar falsche Darstellung, aber messbar).
Behoben durch Mehrpunkt-Occlusion: vier Punkte entlang der Regen-Linie (0/33/66/100 %), fünf
Punkte auf dem Hagel-/Schnee-Kreisrand (Mitte + vier Himmelsrichtungen).

**Zweiter, wichtigerer Fund beim Verifizieren:** `elements.trigger('rain')` erhöht sowohl `rain`
als auch `storm` — und `storm*rain` überschreitet `hailTick`s Spawn-Schwelle, sodass das
Regen-Preset NEBENBEI auch Hagel auslöst. Hagel-Aufprall-„Bounces" erzeugen `pressureBursts`
(Druckringe) — ein laut `weather-particles.mjs`s eigenem Kommentar ausdrücklich zum „Element-Labs"-
System gehörendes, NICHT zum Wettersystem gehörendes Feature, das nie für eine Occlusion-Prüfung
vorgesehen war (ein Aufprallring gehört semantisch AUF die getroffene Fläche, wie liegender
Schnee, nicht dahinter). Das ursprüngliche Verify-Skript nutzte `elements.trigger('rain')` als
Testauslöser und maß deshalb fälschlich eine "Occlusion-Verletzung", die tatsächlich ein
unverwandtes System war. Behoben, indem der Test Regen direkt per `setParams({rain:1, storm:0})`
isoliert, statt über das Preset (das auch andere Systeme mit anstößt).

**Beweis:** `node tools/verify-weather-depth.js` — heftiger Regen über ~2,4 s (40 Frames),
gemessen an der tatsächlichen `depthLayerAt()`-Pixelmaske (nicht an Bounding-Boxen, die bei
nicht-konvexen Gebäude-Clustern Lücken einschließen, die selbst nicht `structural` sind):
**maximale Alpha auf `structural`-Pixeln über den gesamten Testlauf: 0/255. Maximale Alpha
außerhalb: 204/255** (deutlich sichtbarer Regen). `npm run check` grün, `tools/verify.js`
(fünf Szenen, Klassenregression + Screenshots) unverändert grün.

**Nachtrag (nach Exp. 4, echter Bug statt nur Test-Flakiness):** derselbe Test schlug unter
System-Last (direkt hintereinander mit den anderen Playwright-Verifys im vollen `npm run
check`) reproduzierbar mit erhöhter Alpha auf `structural`-Pixeln fehl (202/255, 198/255),
obwohl er isoliert zuverlässig 0/255 zeigte. Statt das als reine Test-Flakiness abzutun, per
CDP `Emulation.setCPUThrottlingRate` deterministisch reproduziert (rate 20, isometrisches
Testbild ohne erkannten Himmel) — und damit die tatsächliche Ursache gefunden, keine
Vermutung: die feste 4-Punkt-Stichprobe (Start/33 %/66 %/Ende) auf der ~20–70px langen
Regen-Tropfen-Linie ließ eine SEHR dünne `structural`-Kante zwischen zwei Sample-Punkten
durchrutschen — konkret am oberen Bildrand einer Szene ohne Himmel-Region, wo jede Zeile
bereits Dach/Gebäude ist. Einzeln pro Tropfen fast nie sichtbar (schwaches Antialiasing),
aber unter Last, wenn viele Tropfen gleichzeitig nahe ihrer Spawnzone sind, stapelten sich
genug einzeln blasse Treffer auf demselben Pixel zu klar sichtbarer Deckkraft (bis 204/255,
reproduzierbar gemessen). Behoben durch `lineOccludedAt(u0,v0,u1,v1)`
(`runtime/weather-particles.mjs`): adaptive Schrittweite relativ zur v-Spannweite der Linie
(min. 4, max. 24 Punkte) statt fester Punktzahl — schließt die Lücke unabhängig von der
Tropfenlänge. Fix zweimal unter denselben Throttling-Bedingungen verifiziert (0/255 statt
vorher 204/255), danach `npm run check` erneut vollständig grün (inkl. `verify-weather-depth`
unter realer Last: 0/255 auf `structural`, 224/255 außerhalb).

## Nicht Teil von Exp. 3

- Kein echtes 3D-Weltvolumen (`weatherVolume.width/depth/height`), keine Kamera-Projektion,
  keine `worldPosition(x,y,z)`-Partikel — das wäre eine eigene, größere Architekturentscheidung
  (neuer Renderpfad für den gesamten Partikel-/Kamera-Stack), kein inkrementeller Schritt auf
  Exp. 1/2 auf. Die aktuelle Lösung erreicht denselben AUSSENWIRKUNG (Wetter wirkt räumlich
  verankert, nicht als Overlay) rein durch Occlusion + abgeleitete Pseudo-Tiefe.
- Keine Occlusion durch `mid` (Laub/Fels) — nur `structural` blockt. Kandidat für eine spätere
  Stufe, falls sich zeigt, dass große Baumkronen ebenfalls sichtbar "durchregnet" werden sollten.
- Kein Fix für den Umstand, dass `elements.trigger('rain')` weiterhin Hagel mit auslöst — das ist
  bestehendes, unverändertes Verhalten (Aufgabe des Elements-Systems, nicht dieser Experimentreihe);
  nur das TEST-Skript umgeht es gezielt, um Exp. 3 isoliert zu messen.

## Exp. 4 — Umsetzung

Anlass: nicht mehr "niedrige erwartete Wirkung", wie in der ursprünglichen Tabellenzeile
vermerkt — der Maintainer stellte fest, dass künftige Bilder echte Fotos sind, nicht nur
SHADEDs eigene isometrische Testbilder. `tools/single_view_room.py` (der klassische,
nicht-ML-basierte `SingleViewRoomProvider` aus
`docs/reconstruction-provider-und-world-surface-graph.md`) existierte bereits als
funktionierende Hough-/RANSAC-Fluchtpunkt- und Manhattan-Raummessung — aber Version 1.0.0
hatte jedes Such-Suchfenster (welche Bildzeilen/-spalten nach der Wand-Boden-Fuge, der
Wand-Decken-Fuge, den Leuchtbändern, den Stützen gesucht wird) als absoluten Pixelwert
für GENAU `content/raum/messehalle.png` (1103×1426) hart verdrahtet — lauffähig nur auf
diesem einen Bild. Das ist keine neue Pipeline (Aufgabe 12: "keine große
Kombinationspipeline auf einmal bauen"), sondern die Generalisierung einer bereits
vorhandenen, bereits funktionierenden Fähigkeit — genau die im Maintainer-Briefing
geforderte Priorität "vorhandene Fähigkeit wiederverwenden/verallgemeinern vor neuer
Pipeline erfinden".

**Was gemacht wurde:**

1. **Bild-relative Suchfenster.** Jede vormals absolute Pixelgrenze ist jetzt ein
   Bruchteil von `H`/`W`, kalibriert exakt an `_REF_W, _REF_H = 1103.0, 1426.0` (den
   Referenzbild-Maßen) über eine neue `deklinieren(H, W)`-Funktion. Für `H == _REF_H`
   reproduziert `round(BRUCHTEIL * H)` exakt die alten Version-1.0.0-Werte — bewiesen,
   nicht nur behauptet, siehe `tools/test-single-view-room.py` Test 1 (Fluchtpunkt,
   Deckenhöhe, Bodenraster-Brennweite, Stützenzahl — alle auf 1e-6 relative Toleranz
   bit-identisch zur alten Implementierung).
2. **Nie-abstürzende Degradation statt `SystemExit`.** `vermessen()` gibt jetzt IMMER
   einen strukturierten `bericht`-Dict zurück. `status="declined"` nur, wenn nicht
   einmal ein Fluchtpunkt gefunden wird (< 6 konvergierende Linien — das Bild zeigt
   vermutlich keine Manhattan-Zentralperspektive, z. B. eine isometrische Illustration
   statt eines Fotos). Einzelne optionale Teilmessungen (Deckenhöhe, Leuchtbänder,
   Stützenraster, Bodenraster/Brennweite), deren jeweilige Strukturannahme ein
   konkretes Bild nicht erfüllt, degradieren UNABHÄNGIG voneinander zu `UNKNOWN`
   (mit `"grund"`-Begründung), statt das gesamte Programm abzubrechen — Aufgabe 12
   des Maintainer-Briefings ("Richtig geraten ist nicht gemessen") gilt jetzt auch
   für "lieber abbrechen als raten".
3. **Plausibilitätsguard auf die gemessene Deckenhöhe (`0 < hc_h < 20`).** Gefunden
   beim Testen mit SHADEDs eigenem isometrischen Testbild
   (`file_00000000974871f49fe71f6b456f9579.png`): die ursprüngliche Schwäche-Schwelle
   (`len(kand) < 6`) ließ dieses NICHT-Manhattan-Bild durchrutschen (11 Linien
   gefunden), und die Wand-Decken-Fugen-Rechnung lieferte eine physikalisch
   unsinnige NEGATIVE Deckenhöhe (`hc = -0.6183h`), die trotzdem als `MEASURED`
   ausgegeben wurde. Der Guard wirft jetzt `ValueError`, wenn die gemessene Höhe
   nicht plausibel ist; die umgebende `try/except`-Kapselung degradiert das Feld
   dann korrekt zu `UNKNOWN`.
4. **Bugfix währenddessen: Python rollt lokale Variablenzuweisungen in einem
   `try`-Block bei einer Exception NICHT zurück.** Nach dem Einbau des Guards zeigte
   derselbe isometrische Testlauf die negative Deckenhöhe TROTZDEM noch an — Ursache:
   `hc_h` behielt seinen schlechten Wert aus dem `try`-Block auch im `except`-Handler,
   und der nachgelagerte `if hc_h is not None:`-Gate für Leuchtbänder/Stützen hielt
   ihn fälschlich für gültig. Fix: `hc_h = None` als erste Zeile im `except`-Block.
5. **Resolutionsabhängige Bodenraster-Schwellen — zunächst bewusst NICHT skaliert,
   dann empirisch als nötig erwiesen.** `bodenraster()`s interne Autokorrelations-/
   FFT-Konstanten (`db`, `kanten`, `erlaubt`-Frequenzband) sollten zunächst absichtlich
   unangetastet bleiben (Kommentar im Code: sie seien "empirisch an genau dieses eine
   gekachelte Boden-Foto justiert", ungetestetes Hochrechnen wäre selbst das verbotene
   Raten). Ein 2×-Resize-Test von `messehalle.png` (per PIL/LANCZOS) bewies dann
   empirisch das Gegenteil: OHNE Skalierung fand die Autokorrelation im 2×-Bild die
   FALSCHE Periode — Brennweite 1119 px statt der erwarteten ~1936 px (2× von 967,77 px
   im Original). Erst dieser konkrete Beweis rechtfertigte die Skalierung: `db`/`kanten`
   skalieren mit `1/skala_h`, das `erlaubt`-Frequenzband mit `skala_h`, wobei
   `skala_h = H / _REF_H`. Nach dem Fix: 2×-Resize liefert `f_px = 1959` px (1,2 % Abweichung
   von den erwarteten ~1936 px) statt der vorher falschen 1119 px — siehe
   `tools/test-single-view-room.py` Test 2, das diesen Regressionsfall dauerhaft festhält.

**Gemessene Werte (alle drei Testfälle, `tools/test-single-view-room.py`, 11 Prüfungen, grün):**

```text
messehalle.png (Referenz, skala_h=1):
  Fluchtpunkt        (665.91, 464.82) aus 31/50 Linien, Restfehler 5.05 px
  Deckenhöhe/h        0.2759 (Spiegelprobe bestätigt: 5.4 % / 5.8 % Abweichung)
  Bodenraster f_px    967.77 px
  Stützen             9 gefunden

messehalle_2x.png (2× LANCZOS-Resize, skala_h=2, NICHT committet — im Test on-the-fly erzeugt):
  Fluchtpunkt         (1325.86, 930.28) aus 26/50 Linien
  Deckenhöhe/h        0.2562 (Spiegelprobe: 1.4 % / 0.7 % Abweichung)
  Bodenraster f_px    1959 px  (erwartet ~1936 px, 1.2 % Abweichung)

file_00000000974871f49fe71f6b456f9579.png (SHADEDs isometrisches Testbild, kein Manhattan-Foto):
  Fluchtpunkt         (972.05, 169.20) aus 11/50 Linien — status bleibt "measured"
  Deckenhöhe          UNKNOWN (Plausibilitätsguard: negativer Rohwert verworfen)
  Stützenraster       UNKNOWN ("nicht bestimmbar (zu wenige/kein erkennbares Raster)")
  kein Absturz
```

**Beweis:** `python3 tools/test-single-view-room.py` (11 Prüfungen, neu erstellt, jetzt Teil
von `npm run check`), zusätzlich `python3 -c "import ast; ast.parse(...)"` für beide
`.py`-Dateien. `content/raum/messehalle.room.json` (bereits committeter Beweis-Snapshot)
bleibt nach dem Fix bit-identisch bis auf `version` (1.0.0→1.1.0) und ein neues
`status`-Feld — geprüft per Feld-für-Feld-JSON-Diff. `npm run check` (bestehende
JS/Node-Suite, `tools/verify.js`) unverändert grün, da Exp. 4 ausschließlich
`tools/single_view_room.py` betrifft und keinerlei Berührung mit `runtime/`,
`index.html` oder dem Shader hat.

## Nicht Teil von Exp. 4

- Kein allgemeiner "ist das überhaupt ein Manhattan-Foto?"-Klassifikator über die
  Fluchtpunkt-Linienzahl und die einzelnen Feld-Plausibilitätsguards hinaus — ein Bild
  mit z. B. 7 zufällig konvergierenden Kanten (Rauschen) könnte den `len(kand) >= 6`-Gate
  passieren, ohne dass die Szene tatsächlich Zentralperspektive zeigt; die einzelnen
  Folgeschritte (Wand-Boden-Fuge, Deckenhöhe, Bodenraster) haben zwar jeweils eigene
  Plausibilitäts-/Konvergenzprüfungen, aber es gibt keine EINE vorgeschaltete
  Ja/Nein-Klassifikation "Manhattan-Zentralperspektive vorhanden".
- Kein Ausbau der `deklinieren()`-Fenster über die bereits vorhandenen Fugen-/Leuchtband-/
  Stützen-/Bodenraster-Suchbereiche hinaus, und keine Änderung der eigentlichen
  Mess-Algorithmen (Hough, RANSAC, TLS-Verfeinerung, Autokorrelation selbst) — nur ihre
  Suchfenster und internen Skalen wurden generalisiert.
- Keine Anbindung von `single_view_room.py`s Ausgabe an SHADEDs Laufzeit
  (`depthLayerAt`/`u_parallax`/Companion-Tiefenkarte) — der Provider bleibt ein
  eigenständiges CLI-Werkzeug (`GuidedMetricDepthProvider`-Vertrag), keine automatische
  Erzeugung einer `_depth.png`-Companion-Datei aus seinem Ergebnis. Das wäre ein
  eigener, separater Integrationsschritt.
- Kein zweites Referenzfoto zum Kalibrieren/Verifizieren der Bodenraster-Skalierung —
  der 2×-Resize-Test beweist Resolutionsunabhängigkeit an EINEM realen Foto in zwei
  Auflösungen, nicht Generalisierung über verschiedene Bodenfliesen-Muster/-Größen hinweg.
