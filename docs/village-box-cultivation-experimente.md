# Village-Box-Segmentierung: Multikanal-Fusions-Experimente

> **Status:** Forschungsnotiz / Experiment-Log, keine verbindliche Architektur, kein Skill.
> Reine `tools/scratch-*`-Experimente auf der Fake-LiDAR-Punktwolke aus der
> village-cube-Rekonstruktion dieser Session. Nichts hier berührt
> `runtime/shaded-engine.mjs`, `analyze()`, `classGrid` oder `runtime/spatial-kernel/` —
> nur `reconstruction.js`s exportierte, reine Hilfsfunktionen werden gelesen, nie verändert.
>
> **Wichtige Einschränkung, jetzt teilweise aufgelöst (s. §4g–§4i, §4t): die meisten
> Prozentzahlen (§1–§4s) stammen aus EINEM Quellbild** (LOD0, `file_
> 000000006d188210a9bb1129089a7b29.png`), keine allgemeingültigen Aussagen über
> LBP/Gabor/Autokorrelation/VP als Operatoren. §4t liefert den ersten methodisch sauberen
> Kreuz-Beleg: derselbe, aus LOD0 gemessene VP-Fit erreicht auf LOD1 (strukturell anderes
> Bild, Giebeldächer statt Flachdach) 6/6 korrekt getrennte Häuser. §4g zeigt zusätzlich eine
> Holdout-Kreuzvalidierung, die die Zirkularität der Schwellenwertwahl entschärft (43,8 % vs.
> 38,6 %). §4h testete (methodisch falsch, s. §4i) ob VLG-02s FESTE Farbwerte auf ein zweites
> Bild übertragen —
> null verwertbare Häuser. §4i korrigiert die Fragestellung: rein bild-lokale, nicht auf
> VLG-02 verweisende Größe+Geometrie-Suche findet auf VLG-04 mindestens eine echte,
> strukturell kohärente dachartige Region — aber kein vollständig rekonstruiertes Haus.
> **§4w klärt eine bis dahin offene Grundannahme:** ob alle 6 Häuser wirklich dieselbe
> Ausrichtung teilen (Voraussetzung des gesamten Affine-Solvers seit Runde 1) ließ sich aus
> dem 2D-Bild allein nicht beweisen (§4w Schritt 4) — ein Rotations-Invarianz-Test (starre
> Rotation erhält den 60/60/60-Achsabstand eines Objekts immer) zeigt aber, dass der über alle
> Häuser gepoolte Fit 8×–45× näher am orthogonalen Ideal liegt als jedes einzelne Haus für
> sich — Indiz für gemeinsame Ausrichtung + Extraktionsrauschen, nicht für echte individuelle
> Rotation. Weiterhin kein strenger Beweis, aber jetzt eine begründete, getestete Einschätzung
> statt einer offenen Frage.

## 0. Ausgangsfrage

Ausgelöst durch die Beobachtung, dass `runtime/spatial-kernel/reconstruction.js`s generische
`connectedComponents3D` (Distanz + Normalenwinkel, kein Farbkanal) Hauskörper sauber trennt,
aber an den 90°-Kanten der Boxen zwischen benachbarten Flächen desselben Hauses leckt (siehe
Commit `74811a3`). Frage: hilft ein zweiter, dritter, vierter unabhängiger Beleg-Kanal — und
wenn ja, wie genau, mit welchen Grenzen? Kein Kanal wird hier als Ersatz für einen anderen
behandelt — das ist der ganze Punkt (s. §5).

Alle vier Experimente laufen auf derselben synthetischen Punktwolke: 6 Häuser aus der affinen
Rekonstruktion, je 6 Flächen (3 gemessen, 3 konstruiert/parallel-kopiert), 225 Punkte pro
Fläche (`GRID=14`), 8100 Punkte gesamt. Reinheit wird punktgewichtet gemessen (Anteil aller
Punkte, die in einer Komponente landen, die genau einer (Haus, Fläche)-Kombination entspricht)
— Komponentenzahl allein täuscht bei Fragmentierung (s. §3).

## 1. Kanal 1: Geometrie allein (Baseline)

`tools/scratch-village-fake-lidar-segment.mjs`. Distanz + Normalenwinkel (28°), exakt
`reconstruction.js`s eigene Logik nachgebildet.

- **Hausebene: sauber.** 0 Komponenten überspannen mehrere Häuser.
- **Flächenebene: leckt.** Nur 8/40 Komponenten sind rein; 19 mischen mehrere Flächen
  desselben Hauses. Ursache: lokale PCA-Normalenschätzung mittelt über Kanten hinweg, der
  28°-Schwellenwert wird durch viele kleine Schritte ("Staircase") umgangen.
- Punktgewichtet: **6,3 % reine Punkte.**

## 2. Kanal 2: + Farbe

`tools/scratch-village-fake-lidar-segment-color.mjs`. Echte RGB-Werte (gemessene Flächen aus
dem Quellbild gesampelt, konstruierte Flächen parallel-kopiert von der gegenüberliegenden
Fläche, s. `synthetic-visual-reverse-engineering.md` §4.6).

- Farbe allein: 24/53 Komponenten rein — löst ANDERE Fälle als Geometrie, nicht dieselben.
- Fusion (Geometrie UND Farbe): **28,6 % reine Punkte** — deutliche Verbesserung, aber bei
  einigen Häusern (3, 4, 5) überleben große Mehrflächen-Klumpen, weil das Bild manche
  Hausflächen fast identisch schattiert, unabhängig von der Ausrichtung (Farbdifferenzen
  zwischen wirklich verschiedenen Flächen teils nur 0,2–2,9 von 0–441 möglichen Einheiten).

## 3. Kanal 3: Fluchtpunkt-/Familienrichtungs-Snap

`tools/scratch-village-fake-lidar-segment-vp.mjs`. Der affine Solver hat jedes Haus bereits
auf ein achsenausgerichtetes Weltkoordinatensystem reduziert (`T`/`scale` direkt in
Familienachsen ausgedrückt) — jede echte Flächennormale kann nur eine von 6 Kardinalrichtungen
sein. Die (weiterhin rein lokal aus PCA gewonnene) Normalenschätzung wird auf die nächste
Kardinalrichtung eingerastet; kategorische Übereinstimmung der eingerasteten Achse wird als
Verbindungsbedingung genutzt. Kein Zirkelschluss — nur die Entscheidungsregel wird kategorisch,
nicht die zugrundeliegende Schätzung.

- **VP allein ist schlechter als Geometrie allein:** 1,6 % reine Punkte (vs. 6,3 %). Diagnose:
  das Einrasten auf 6 Achsen teilt die Kugel in ~90°-breite Zellen (Grenze bei 45° zur
  nächsten Achse) — gröber als der direkte 28°-Paarvergleich. Von 56.546 geprüften
  Nachbarpaaren rasten 5.539 (≈10 %) auf dieselbe Achse ein, obwohl ihre rohen Normalen mehr
  als 28° auseinanderliegen. Die Kategorisierung selbst führt zusätzliches Leck ein.
- **Aber als vierte UND-Bedingung zusätzlich zu Geometrie+Farbe hilft es doch:** 33,7 % reine
  Punkte (vs. 28,6 % ohne VP). Ein für sich schwacher Kanal verbessert die fusionierte
  Entscheidung trotzdem — Punkt-weighted-Fusion ist nicht additiv-naiv.
- Naheliegende, hier NICHT umgesetzte Verbesserung: Unsicherheitsmarge am Snap (Punkte nahe
  einer 45°-Zellgrenze als „ambig” markieren statt hart zuzuschlagen).

## 4. Kanal 4: Mikrotextur (LBP)

`tools/scratch-village-fake-lidar-segment-texture.mjs`. Testet direkt die in
`material-geometrie-ohne-farbe.md` §2 als „offene, ungeprüfte Frage” markierte
Mikrotextur-Hypothese — zum ersten Mal empirisch, nur für LBP (nicht Gabor, nicht
Autokorrelation, s. §5 dort). 9×9-Bildpatch pro Punkt (gemessene Flächen: echt gesampelt;
konstruierte Flächen: von der gegenüberliegenden Fläche parallel-kopiert, wie Farbe), 3×3-LBP
pro innerem Patch-Pixel, 256-Bin-Histogramm, L1-Distanz zwischen benachbarten Punkten als
Textur-Kontinuitätsmaß.

- **Das Signal existiert:** direkter Stichprobenvergleich verschiedener Flächen desselben
  Hauses zeigt klare LBP-Unterschiede (1,47–1,67 von max. 2,0), deutlich über dem
  Zufalls-Median (1,39). Die Vermutung aus `material-geometrie-ohne-farbe.md` §2, das Signal
  könnte auf gemalten/cel-shadeten Bildern zu schwach sein, trifft hier **nicht** zu.
- **Trotzdem scheitert `texture-only` komplett:** 0,0 % reine Punkte (100 Komponenten, aber
  keine einzige rein). Kein Signalproblem, sondern ein Granularitätsproblem: der paarweise
  Punkt-zu-Punkt-Vergleich ist die falsche Ebene für LBP. Innerhalb einer einzelnen Fläche
  schwankt das gemalte Bild (Strichlinien, Schattierungsverläufe) stark genug, dass
  benachbarte Punkte auf DERSELBEN Fläche oft über dem Schwellenwert liegen — die klassische
  Verwendung von LBP vergleicht Regionsdeskriptoren (aggregierte Histogramme über eine ganze
  Fläche), nicht einzelne Punktpaare. Das ist der methodische Fehler hier, nicht das Merkmal.
- **In Fusion trotzdem nützlich:** Geometrie+Textur: 10,2 % (besser als Geometrie allein,
  schwächer als Geometrie+Farbe). Geometrie+Farbe+Textur: **35,4 % reine Punkte** — das beste
  Ergebnis aller vier Experimente, besser als Geometrie+Farbe+VP (33,7 %).

## 4b. Runde 5–6: Regions-Aggregation und der Anker-Kontaminations-Effekt

`tools/scratch-village-fake-lidar-segment-texture-region.mjs`. Direkter Test der in §4
selbst vorgeschlagenen Reparatur ("richtige Vergleichsebene ist ein regions-aggregiertes
Histogramm, nicht Punktpaare").

**Runde 5 — laufender Mittelwert (naive Umsetzung):** Region-Wachstum hält ein laufend
aktualisiertes Mittelwert-Histogramm der bisher aufgenommenen Punkte; jeder Kandidat wird
gegen dieses Mittel geprüft, nicht gegen den einzelnen Nachbarpunkt. Ergebnis:
**widerlegt die eigene Hypothese aus §4** — bestenfalls 33,4 % rein (Geometrie+Farbe+
Textur), leicht SCHLECHTER als der naive Punktpaar-Vergleich (35,4 %). Vermuteter Grund:
sobald früh ein falscher Punkt aufgenommen wird, verschiebt er den Mittelwert selbst — ein
klassisches Region-Growing-Kontaminationsproblem (die Region "driftet" in Richtung der
falschen Fläche, was das Aufnehmen weiterer falscher Punkte sogar erleichtert, statt es zu
verhindern).

**Runde 6 — eingefrorener Anker (Test der Kontaminations-Hypothese):** die ersten
`anchorSize` Punkte werden nur unter Geometrie+Farbe aufgenommen (kleiner, vertrauenswürdiger
Kern), das Histogramm wird danach EINGEFROREN (nie wieder aktualisiert), alle weiteren
Kandidaten werden gegen diesen fixen Anker geprüft statt gegen ein driftendes Mittel.

- **`anchorSize=5, textureThreshold=0.9`: 73,0 % reine Punkte** — mit Abstand das beste
  Ergebnis der gesamten Versuchsreihe, mehr als doppelt so gut wie alles vorherige.
- Klarer, mechanistisch erklärbarer Trend über Ankergrößen: **5 → 73,0 % · 20 → 64,0 % ·
  50 → 52,8 %** (bei `textureThreshold=0.9`). Größere Anker haben mehr Zeit, vor dem
  Einfrieren selbst schon eine falsche Fläche mit aufzunehmen — bestätigt die
  Kontaminations-Hypothese aus Runde 5 direkt, statt sie nur zu vermuten.
- Bestätigt: das Problem in Runde 5 war nicht „regions-aggregiert vs. punktweise” an sich,
  sondern **kontinuierliche Aktualisierung vs. eingefrorene Hypothese**. Ein kleiner,
  schnell eingefrorener Anker schützt vor genau der Selbstverstärkung, die eine
  fortlaufend aktualisierte Region-Hypothese anfällig macht.

## 4c. Runde 7–8: eingefrorener Anker auch für VP, dann kombiniert

`tools/scratch-village-fake-lidar-segment-frozen-vp.mjs`,
`tools/scratch-village-fake-lidar-segment-combined-frozen.mjs`. Überträgt das
Anker-Prinzip aus §4b auf den VP-Kanal: statt jeden Punkt einzeln auf die nächste
Kardinalachse einzurasten (Runde 3, dort messbar SCHLECHTER als Geometrie allein), wird die
Achse einmal aus einem kleinen geometrie+farb-vertrauten Kern gemittelt, dann eingefroren;
weitere Kandidaten werden per Skalarprodukt gegen diese EINE feste Achse geprüft (kontinuierlich,
nicht kategorisch neu entschieden).

- **VP mit eingefrorenem Anker: 39,4 % rein** (`anchorSize=5`, 28°-Marge) — besser als der
  alte Wert ohne Anker (33,7 % in Fusion mit Geometrie+Farbe), aber weit unter LBPs Sprung
  auf 73,0 %. Das Anker-Prinzip hilft in die richtige RICHTUNG bei jedem bisher getesteten
  Kanal, aber nicht in gleichem AUSMASS — VPs strukturelles Problem (90°-breite Zellen)
  bleibt ein Nachteil, den Einfrieren allein nicht auflöst.
- Ohne Farbe (nur Geometrie+eingefrorener VP): 8,3 % — kaum besser als Geometrie allein
  (6,3 %). Der Anker-Kern selbst ist ohne Farbunterstützung zu oft schon kontaminiert.
- **Kombiniert (Geometrie+Farbe+eingefrorener-VP+eingefrorenes-LBP): 74,5 % rein** — das
  beste Ergebnis der gesamten Serie, aber nur +1,5 Prozentpunkte über LBP-Anker allein
  (73,0 %). VP trägt einen kleinen zusätzlichen Beitrag, holt aber kaum mehr heraus, weil
  LBP-mit-Anker bereits den Großteil des hier erreichbaren Signals zieht.

## 4d. Runde 9: Benchmark-Ladder Stufe B (Graustufen)

`tools/scratch-village-fake-lidar-segment-combined-frozen.mjs` (Erweiterung). Beantwortet
zum ersten Mal die seit `material-geometrie-ohne-farbe.md`s erster Fassung offene Frage aus
dem Benchmark-Ladder §3 dort: „Stufe B — Dieselbe Szene, Graustufen. Überlebt Cultivation
ohne Objektfarbe?" Farbe wird auf Luminanz reduziert (`r=g=b=Helligkeit`), Geometrie und LBP
(bereits Graustufen-basiert per Konstruktion) bleiben unverändert.

| Konfiguration | Farbig (§4c) | Graustufen | Verlust |
|---|---|---|---|
| Geometrie + Farbe allein | 28,6 % | 11,2 % | −17,4pp (fast Kollaps) |
| + Textur-Anker | 73,0 % | 63,8 % | −9,2pp (moderat) |
| + VP-Anker | 39,4 % | 19,1 % | −20,3pp |
| + beide Anker | 74,5 % | 63,9 % | −10,6pp |

**Antwort: ja, mit Einschränkung.** Die Kombination übersteht Graustufen ohne Kollaps
(73,0 %→63,8 % mit Textur-Anker) — aber NICHT, weil Geometrie allein genug trägt, sondern
weil der Textur-Anker (LBP, selbst schon Graustufen-basiert) den Verlust der Chrominanz
auffängt. Reine Farbe ohne Textur bricht dagegen fast zusammen (28,6 %→11,2 %, nahe am
Geometrie-Baseline von 6,3 %). Der VP-Anker verliert in Graustufen fast seinen ganzen
Fusionsbeitrag (63,8 %→63,9 % mit vs. ohne VP, praktisch kein Unterschied mehr) — sein
Anker-Kern wird durch die geschwächte Farbprüfung selbst öfter kontaminiert, bevor er
einfriert.

## 4e. Runde 10: Gabor-Filterbank (zweiter Mikrotextur-Operator)

`tools/scratch-village-fake-lidar-segment-gabor.mjs`. Zweiter der drei in
`material-geometrie-ohne-farbe.md` §2 genannten Operatoren (nach LBP, vor Autokorrelation).
8-Orientierungs-Gabor-Filterbank (λ=5px, σ=2px, γ=0,5, ein Maßstab), Magnitudenantwort pro
Orientierung über 9×9-Patch gemittelt → 8-dimensionaler Feature-Vektor pro Punkt,
euklidischer Abstand. Direkt mit dem etablierten Anker-Rezept getestet (kein Umweg über
Punktpaar-Vergleich wie bei LBPs erstem Versuch in Runde 4).

- **Mit Farbe (`threshold=0,15`, Ankergröße 5): 57,7 % rein** — deutlich über der
  Geometrie+Farbe-Baseline (28,6 %), aber klar unter LBPs Bestwert (73,0 %) unter
  vergleichbaren Einstellungen.
- Ohne Farbe: 43,0 % — für sich schon ein starker Kanal, stärker als reine Geometrie oder
  reine Farbe allein.
- **Das Anker-Rezept generalisiert auf einen zweiten, unabhängig implementierten
  Textur-Operator** — nicht LBP-spezifisch. Aber die beiden Operatoren sind nicht
  gleich stark: LBP bleibt für diese Fixture der bessere Kanal.

## 4f. Runde 11: 2D-Autokorrelation (dritter Mikrotextur-Operator) — alle drei komplett

`tools/scratch-village-fake-lidar-segment-autocorr.mjs`. Dritter und letzter der in
`material-geometrie-ohne-farbe.md` §2 genannten Operatoren. Normalisierte 2D-Autokorrelation
an 8 festen Lag-Offsets (Radius 3, dieselben 8 Winkel wie Gabors Orientierungen für einen
fairen Vergleich), über 11×11-Patch berechnet → 8-dimensionaler Feature-Vektor, euklidischer
Abstand, gleiches Anker-Rezept.

- **Mit Farbe (`threshold=0,31`, Ankergröße 5): 65,8 % rein** — zwischen Gabor (57,7 %) und
  LBP (73,0 %).
- Ohne Farbe: 44,3 % — vergleichbar mit Gabor (43,0 %), beide klar unter LBPs
  Ohne-Farbe-Bereich (der in Runde 6 nicht direkt mit Farbe-aus getestet wurde, aber die
  Größenordnung der anderen zwei Operatoren passt zueinander).

**Alle drei aus `material-geometrie-ohne-farbe.md` §2 benannten Mikrotextur-Operatoren sind
jetzt mit derselben Methode (Anker-Rezept, dieselbe Fixture, vergleichbare Einstellungen)
empirisch getestet und geordnet:**

| Operator | Mit Farbe+Anker | Ohne Farbe |
|---|---|---|
| **LBP** | **73,0 %** | — (nicht separat getestet) |
| Autokorrelation | 65,8 % | 44,3 % |
| Gabor | 57,7 % | 43,0 % |

Alle drei liegen weit über der Geometrie+Farbe-Baseline (28,6 %) und bestätigen unabhängig
voneinander, dass die in §2 geäußerte Sorge („gemalte/cel-shadete Illustrationen könnten zu
wenig Mikrotextur enthalten") für diese Fixture nicht zutrifft — jeder der drei Operatoren
trägt echtes, nutzbares Signal, mit LBP als dem stärksten der drei.

## 4g. Runde 12: Methodenkritik — alles bisher ist EIN Bild

Berechtigter Einwand (Maintainer, wörtlich: „wirklich repräsentativ ist das jetzt nicht bei
einem einzigen Bild"): jede Zahl in §1–§4f stammt aus GENAU EINER Punktwolke aus GENAU EINEM
Quellbild (`file_000000006d188210a9bb1129089a7b29.png`, die VLG-02-Fixture, 6 Häuser). Alle
Schwellenwerte (`COLOR_THRESHOLD`, LBP-/Gabor-/Autokorrelations-Schwellen, Ankergröße) wurden
aus Perzentilen DERSELBEN Punktwolke abgeleitet, die dann bewertet wurde — nahe an
„auf den Testdaten kalibriert" und ein direkter Verstoß gegen die eigene Anti-Overfit-Regel
in `material-geometrie-ohne-farbe.md` §3 („jeder Schwellenwert über einen Bereich getestet
und als Intervall statt Einzelwert berichtet"). Ein echtes zweites Bild würde eine eigene
Extraktor-Kalibrierung brauchen (`fixture-taxonomie.md` §6: der Extraktor ist bewusst noch
szenen-/palettenspezifisch, fest verdrahtete `roof`/`wallLight`/`wallDark`-Farbtoleranzen —
kein kurzer Nebenschritt).

**Sofort machbare Teil-Antwort: Holdout-Kreuzvalidierung INNERHALB desselben Bildes.**
`tools/scratch-village-fake-lidar-holdout-crossval.mjs`. Schwellenwerte werden NUR aus 3 der
6 Häuser gelernt (Fit-Set: house1–3), Reinheit wird NUR an den anderen 3, beim Lernen nie
gesehenen Häusern gemessen (Holdout-Set: house4–6).

| | Fit-Häuser | Holdout-Häuser |
|---|---|---|
| Reine Punkte | 43,8 % | 38,6 % |

Ein moderater, kein katastrophaler Rückgang (~12 % relativ). Die aus 3 Häusern gelernten
Schwellenwerte übertragen sich einigermaßen auf 3 nie gesehene Häuser desselben Bildes — ein
Hinweis, dass das Rezept (Geometrie+Farbe+eingefrorener LBP-Anker) etwas Reales über
Material-/Texturtrennung erfasst, nicht nur exakte Eigenheiten einzelner Häuser auswendig
lernt.

**Was das NICHT beweist, ausdrücklich:** dieselbe Kunststil-, Palette- und
Beleuchtungsannahme gilt für alle 6 Häuser (dasselbe Bild). Diese Kreuzvalidierung behebt
NUR die Zirkularität der Schwellenwertwahl (Schwellen aus Daten X, gemessen auf Daten X) —
NICHT die eigentliche, tiefere Sorge des Einwands: ob dasselbe Rezept auf einem strukturell
anderen Bild (andere Kunstrichtung, andere Materialpalette, andere Lichtstimmung) überhaupt
noch funktioniert. Das bleibt ungeprüft, bis eine zweite, unabhängig kalibrierte Fixture
existiert (VLG-01/04/05 sind laut `fixture-taxonomie.md` die nächstliegenden Kandidaten,
noch nicht extrahiert).

## 4h. Runde 13: echter Versuch eines zweiten Bildes — und warum er hier abgebrochen wird

Direkte Folge von §4g: der Maintainer-Einwand verlangt eine zweite, unabhängig kalibrierte
Bildquelle, nicht nur eine Holdout-Aufteilung innerhalb eines Bildes. Kandidat: VLG-04
„Kirschblüten-Dorf" (`file_0000000029f871f4bc597d92064d2e97.png`) — laut
`fixture-taxonomie.md` derselbe Struktur-Signatur-Typ (SC-2, `polyedrisch-N`), gleicher
Zeichenstil, aber ein anderes Bild mit anderer Verdeckung (Blütenbäume) und
randbeschnittenen Häusern.

`tools/scratch-sample-colors-vlg04.mjs` — statt Farben blind an geschätzten Koordinaten
abzutasten (erster Versuch, siehe Commit-Historie: traf wiederholt Fenster/Schatten/
Fachwerk statt Dach/Wand), Farb-Histogramm über das GESAMTE Bild.

> **Korrektur einer methodischen Selbsttäuschung (Maintainer-Einwand, direkt zutreffend):**
> die erste Fassung dieses Abschnitts filterte nach „orange-artigen" Clustern und meldete
> dann überrascht, dass sich ein orangener Cluster nahe am bekannten Dachton fand. Das ist
> zirkulär — der Filter WAR auf Orange zugeschnitten, weil bereits bekannt war, dass Dächer
> orange sind (aus dem Originalbild, aus der Original-Palette). Ein Treffer beweist dabei
> nichts über Übertragbarkeit, nur dass die Suche das fand, wonach sie suchte. Der faire
> Test unten ersetzt das: die UNVERÄNDERTE Original-Palette (keine Anpassung, keine nach
> VLG-04 geschaute Farbwahl) direkt gegen VLG-04 laufen lassen und ungeschönt berichten.

**Fairer Test:** `tools/scratch-village-extract-vlg04-blind.mjs` — exakt dieselben drei
`MATERIALS`-Werte aus `scratch-village-extract-v2.mjs` (`roof: [225,126,69] tol 35`,
`wallLight: [198,166,109] tol 22`, `wallDark: [141,125,81] tol 22`), Byte für Byte kopiert,
null Anpassung, gegen VLG-04 statt VLG-02 laufen gelassen — keine einzige Zahl wurde
angeschaut, bevor sie gewählt wurde.

**Ungeschöntes Ergebnis: vollständiges Scheitern.**

| Material | Gefundene Komponenten | Erwartung (VLG-02-Maßstab) |
|---|---|---|
| `roof` | 120 (Größen 300–1200px) | ~9 Häuser, deutlich größere Flächen |
| `wallLight` | **0** | ~9 |
| `wallDark` | 1 (355px) | ~9 |

120 winzige „Dach"-Fragmente statt ~9 echter Dachflächen — vermutlich einzelne
Ziegel-Glanzlichter oder zufällig ins Toleranzband fallende Blütenfarbtöne (VLG-04 hat viel
Kirschblüten-Vegetation, die VLG-02 nicht hat), keine echten Häuser. `wallLight` findet
buchstäblich NICHTS im gesamten Bild. Kein einziges Haus wird mit allen drei Teilen
zusammengesetzt — die nachgelagerte `findAttachedWall`/Sechseck-Rekonstruktion hat schlicht
nichts, worauf sie aufbauen könnte.

**Das ist die eigentliche, unbequeme Antwort auf den Einwand vom Sessionbeginn:** nicht "die
Zahlen sind ein bisschen anders", sondern die komplette Pipeline (Extraktor UND alles
danach) ist auf VLG-02 zugeschnitten und liefert auf einem strukturell ähnlichen, aber
visuell anderen Bild **null verwertbare Häuser** — nicht 73 % Reinheit, nicht 28,6 %, NULL,
weil die Vorstufe (Extraktion) schon nichts liefert, das die spätere Fusions-Pipeline
überhaupt erreichen könnte. Jede Zahl in §1–§4g ist real gemessen, aber sie ist eine Aussage
über EIN Bild, nicht über die Methode allgemein — der Maintainer-Einwand war von Anfang an
richtig, und die erste (verworfene) Version dieses Abschnitts hat das mit einer zirkulären
Suche verschleiert, statt es zu zeigen.

## 4i. Runde 14: Korrektur der Fragestellung selbst — Cultivation testet man nicht mit Werten aus einem anderen Bild

Berechtigter zweiter Einwand direkt im Anschluss an §4h (Maintainer, wörtlich: „Wofür haben
wir die Cultivation entwickelt? Nicht nach vergleichbaren Pattern zum vorherigen Bild
suchen. Gemeinsamkeiten FINDEN"). §4h testete, ob VLG-02s FEST KODIERTE Farbwerte auf VLG-04
übertragen — das ist gar kein Cultivation-Test. Cultivations ganze Prämisse
(`material-geometrie-ohne-farbe.md` §3) ist das Gegenteil: lokale Kohärenz AUS DEM BILD
SELBST finden, ohne Vorwissen über konkrete Farbwerte — genau wie schon Runden 1–12 jeden
Schwellenwert aus Perzentilen der jeweils eigenen Punktwolke abgeleitet haben, nie aus einer
importierten festen Zahl. §4h hat diese Disziplin gebrochen, indem es VLG-02s Zahlen
importierte. Diese Runde macht das rückgängig.

`tools/scratch-vlg04-cultivation-fresh.mjs` — läuft NUR auf VLG-04, ohne jeden Bezug zu
VLG-02s konkreten Farbwerten:

1. Farb-Quantisierung des GESAMTEN Bildes, Connected-Component-Labeling OHNE
   Farbton-Vorfilterung (anders als der verworfene „roof-ish"-Filter aus §4h) — einfach die
   größten Komponenten, unabhängig von ihrer Farbe.
2. Für die größten Komponenten: die bereits etablierte geometrische Signatur
   (`fixture-taxonomie.md`s „polyedrisch-N" — Kanten fallen in ~3 dominante
   Richtungsfamilien, alternierendes Muster) — ein GEOMETRISCHER Test, kein Farbnamen-Test.
3. `MIN_COMPONENT_SIZE` aus der eigenen Bildgröße abgeleitet (0,01 % der Pixel), nicht aus
   VLG-02s festem 300px-Wert kopiert.

**Ergebnis, mit Größenfilter (>2000px) auf die Signatur-Treffer:** genau EINE Region
überlebt — 14.702 Pixel (mit Abstand die größte aller 519 gefundenen Komponenten), 8 Ecken,
4 Kantenrichtungs-Cluster, 92 % der Kantenlänge in den Top-3-Familien. Ihre mittlere Farbe
(`rgb(245,188,110)`, hell-orange) wurde dabei NIE als Suchkriterium verwendet — sie ergab
sich rein aus Größe+Geometrie, und passt trotzdem zu einem dachziegelartigen Farbton.

**Was das zeigt, ehrlich begrenzt:** ein rein bild-lokaler, nicht-zirkulärer Mechanismus
findet mindestens EINE echte, strukturell kohärente, dachartige Region in VLG-04 — ohne
irgendeine von VLG-02 importierte Zahl. Das bestätigt die Grundthese direkt (Geometrie statt
Farbnamen trägt über Bilder hinweg), aber NUR partiell: eine gefundene Region ist kein
vollständig rekonstruiertes Haus (keine zugehörigen Wandflächen gesucht, keine Prüfung, ob
mehrere Häuser gefunden werden oder nur dieses eine, keine Affine-Solver-Rekonstruktion
versucht). Ohne Größenfilter meldet dieselbe Signatur 27 „Treffer" — die meisten davon
winzige (600–1300px), farblich völlig verschiedene Blobs (auch Grün/Grau, vermutlich
Vegetation), die die Douglas-Peucker-Vereinfachung zufällig auf wenige Kanten reduziert.
Die geometrische Signatur allein ist ohne Größenfilter zu lasch — ein ehrliches, eigenes
Ergebnis, keine vollständige Cultivation-Lösung.

## 4j. Runde 15: die eine gefundene Region ist vermutlich kein einzelnes Haus

Direkte Folge von §4i. `tools/scratch-vlg04-attach-structure.mjs` — sucht zur gefundenen
14.702px-Region eine strukturell plausible „Wand" darunter, rein über Position
(x-Überlappung, unterhalb, Nähe — dieselbe Logik wie `findAttachedWall` im
Original-Extraktor), ohne jede Farbannahme.

**Ergebnis: kein plausibler Treffer.** Die zwei räumlich passendsten Kandidaten sind beide
grünlich (Vegetationsfarbton, `rgb(114,145,28)`/`rgb(91,124,29)`) und winzig gegen die
Dachregion (682px/487px gegen 14.702px). Das spricht dafür, dass die in §4i gefundene
„eine Region" vermutlich KEIN einzelnes Hausdach ist, sondern mehrere benachbarte
Dach-Glanzlicht-Flächen, die die grobe Farb-Quantisierung (`STEP=20`) über kleine Lücken
hinweg fälschlich zu einer einzigen Komponente verschmolzen hat — ein bekanntes
Fehlerbild grober Quantisierung, nicht widerlegt, nur jetzt konkret belegt.

**Einordnung:** §4i bleibt in dem, was es tatsächlich zeigt (Größe+Geometrie ohne
Farbvorwissen findet etwas Reales und Großes), aber die Interpretation „das ist ein
einzelnes Haus" war zu optimistisch. Ein echter nächster Schritt bräuchte eine feinere
Quantisierung oder einen zusätzlichen Trennschritt (z. B. lokale Farbvarianz innerhalb der
großen Region prüfen, ob sie in Wirklichkeit mehrere leicht unterschiedlich schattierte
Teilflächen enthält) — nicht in dieser Runde umgesetzt.

## 4k. Runde 16: DA2-Tiefe als fünfter Fusionskanal

Direkte Umsetzung der am Ende der DA2-Rotationsgrenzen-Untersuchung versprochenen Fusion.
`tools/scratch-village-fake-lidar-segment-depth-fusion.mjs` — für jeden bereits
rekonstruierten 3D-Punkt (village-fake-lidar-Wolke) wird über dieselbe `screenPoint()`-
Projektion, die der affine Solver selbst nutzt, die zugehörige 2D-Bildposition
zurückgerechnet, dort der reale DA2-Tiefenwert gesampelt, und als fünfter Kanal (nach
Geometrie, Farbe, LBP, Gabor, Autokorrelation, VP) mit demselben Anker-Rezept getestet
(kleiner geometrie+farb-vertrauter Kern, Tiefenwert gemittelt, eingefroren, Kandidaten
kontinuierlich dagegen geprüft).

| Konfiguration | Reine Punkte |
|---|---|
| Geometrie + Farbe (Baseline) | 28,6 % |
| Geometrie + Farbe + eingefrorener DA2-Tiefen-Anker | 34,7 % |
| DA2-Tiefen-Anker allein (keine Farbe, keine Geometrieprüfung) | **0,2 %** |

**DA2-Tiefe allein ist bei dieser Punktauflösung fast nutzlos** — deutlich schwächer als
jeder andere bisher getestete Kanal, sogar schwächer als VP allein (1,6 %). Das ist
mechanistisch erklärbar, kein Fehler: Tiefe kodiert Kameraabstand, und zwei Flächen
DESSELBEN kleinen Hauses (z. B. Dach vs. Wand) unterscheiden sich darin kaum — genau das
Gegenteil dessen, wofür Tiefe stark ist (Objekte in unterschiedlicher Entfernung
auseinanderhalten, nicht Flächen desselben Objekts trennen). In Fusion mit Geometrie+Farbe
trägt sie trotzdem einen echten, moderaten Zugewinn (28,6 %→34,7 %, +6,1 Prozentpunkte —
ähnliche Größenordnung wie VPs Beitrag, deutlich schwächer als LBP/Gabor/Autokorrelation).

**Einordnung, konsistent mit der Rotationsgrenzen-Untersuchung:** DA2-Tiefe ist der einzige
hier getestete Kanal, der JEDEN Bildinhalt abdeckt (nicht nur die gemessenen Boxflächen),
aber genau bei der Aufgabe, für die diese Session ihn hier testet (Flächentrennung
INNERHALB eines kleinen Objekts), strukturell schwach. Seine eigentliche Stärke — Objekte
unterschiedlicher Entfernung auseinanderhalten, beliebiger Bildinhalt — wurde hier nicht
gemessen, weil alle 6 Häuser in der village-cube-Fixture ähnlich weit von der Kamera
entfernt sind. Ein Test mit tatsächlich unterschiedlich weit entfernten Objekten
(Vordergrund/Hintergrund) würde vermutlich ein anderes Bild zeigen — nicht durchgeführt.

## 4l. Runde 17: Pipeline-Umsortierung — Tiefenkanten statt Farbmasken, dann VP

Direkter Vorschlag des Maintainers: „Die Depthmap können wir anstelle der color masks zur
direkten Kantenfindung nutzen. Darauf können wir die VP legen. Innerhalb dieser Constraints
lassen wir die Operatoren los... Dann hätten wir immer noch mindestens Geometrie und Farbe
als möglichen Folgeschritt." Anders als Runde 16 (Tiefe als schwacher Zusatzfilter auf
bereits vorhandenen Punkten) ersetzt das den farbmasken-basierten ersten Schritt komplett —
genau die in `fixture-taxonomie.md` §6 als tiefste Schwäche geflaggte
Szenen-/Palettenspezifität des Extraktors.

**Erster Versuch (`tools/scratch-depth-edge-pipeline.mjs`) scheitert ehrlich:** Sobel-Gradient
auf der DISPLAY-quantisierten Tiefenkarte (0–255), Schwellenwert + Flood-Fill. Größte
gefundene Region: 78–98 % des gesamten Bildes, je nach Schwellenwert/Dilation — keine
brauchbare Trennung. Visuelle Diagnose (`depth-edge-visual-diagnostic.png`) zeigt die Ursache:
**Quantisierungs-Banding**. Der glatt abfallende Bodenverlauf erzeugt beim Runden auf 256
Stufen Tausende dünner Konturlinien-Kanten mit ähnlicher Gradientenstärke wie die echten
Haussilhouetten — ein reiner Schwellenwert kann beides nicht unterscheiden.

**Fix, real und einfach:** die transformers.js-Pipeline liefert neben der
Display-quantisierten `depth` auch den unquantisierten `predicted_depth`-Tensor (Float32,
kontinuierlich, geprüft in `tools/scratch-depth-edge-raw-check.mjs`). Mit diesem statt der
quantisierten Version (`tools/scratch-depth-edge-raw-visualize.mjs`) verschwindet das Banding
komplett (`depth-edge-raw-diagnostic.png`) — mehrere Häuser werden jetzt sauber als eigene,
farbunabhängige Regionen erkannt (5 von ~9 sichtbaren Objekten im geprüften Bildausschnitt),
andere bleiben mit dem Boden verschmolzen, weil ihre Silhouettenkante an einer Stelle zu
schwach/lückig ist, um den Flood-Fill zu stoppen.

**VP-Ausrichtungs-Prüfung, bevor der volle Lückenschluss gebaut wird**
(`tools/scratch-depth-edge-vp-alignment.mjs`) — testet direkt die Prämisse hinter dem
nächsten Vorschlag des Maintainers („erst Fluchtpunkte, dann flood fill... die Grenzen den
Operatoren bewusst machen, oder wir schneiden da sauber ab"): stimmen die Kanten der bereits
sauber gefundenen Tiefenregionen überhaupt mit den 3 bekannten VP-Richtungen überein (aus
`dirF`, demselben affinen Solver)?

**Ja, deutlich:** durchschnittliche gewichtete Winkelabweichung zwischen den gefundenen
Kanten und der jeweils nächsten der 3 bekannten Fluchtpunkt-Richtungen: **9,1°** (Bereich
3,3°–15,0° über 7 geprüfte Regionen) — bei zufälligen, unabhängigen Kanten wäre eher ~45 %
des maximal möglichen Fehlers (≈22,5° bei 3 gleichverteilten Familien) zu erwarten. Die
Tiefenkanten-Silhouetten fallen also real in dieselben 3 Richtungsfamilien, die der affine
Solver längst aus den Farbmasken-Vertices kennt — das rechtfertigt den vorgeschlagenen
nächsten Schritt (VP-Linien zum Schließen der Silhouetten-Lücken nutzen), ist aber noch keine
Umsetzung davon.

**Noch nicht gebaut:** das eigentliche Lückenschluss-Verfahren (offene Tiefenkanten-Konturen
mit Liniensegmenten in den 3 bekannten Richtungen verbinden, dann neu flood-fillen) — ein
eigener, größerer nächster Schritt, hier nur durch die Ausrichtungs-Prüfung vorbereitet und
gerechtfertigt, nicht implementiert. Ebenso nicht gebaut: die Operatoren (LBP/Gabor/
Autokorrelation) innerhalb der so gefundenen Grenzen laufen zu lassen, wie vom Maintainer
vorgeschlagen.

## 4m. Runde 18: das Lückenschluss-Verfahren selbst — 5/6 Häuser korrekt getrennt

Direkte Umsetzung des in §4l vorbereiteten nächsten Schritts.
`tools/scratch-depth-edge-vp-gapclose.mjs` — **gerichtetes morphologisches Schließen**
statt isotroper Dilation (die in Runde 17 entweder zu wenig brachte oder wieder Rauschen
einführte): für jede der 3 bekannten VP-Richtungen wird durch jeden vorhandenen Kantenpixel
ein kurzes Liniensegment in genau dieser Richtung gezogen (Länge gedeckelt auf
`gapLength`). Das überbrückt echte Lücken entlang einer bekannten Wandrichtung, ohne
Kanten in unbeteiligten Richtungen zu verschmieren — die geometrische Vorwissen-Grenze wird
den Operatoren „bewusst gemacht", statt sie aus verrauschten Pixeldaten neu zu erraten.

**Validiert gegen echten Ground Truth** (nicht nur Komponentenzahl): die 6 Hauszentren
werden exakt aus der affinen Rekonstruktion zurückgerechnet (Box-Mittelpunkt, lokal
(0,5, 0,5, 0,5) — NICHT `T` selbst, das ist die lokal (0,0,0)-Ecke, laut den eigenen
Session-Notizen die vollständig verdeckte Ecke; deren Projektion fiel fälschlich außerhalb
jeder sichtbaren Haussilhouette und hätte 0/6 Treffer vorgetäuscht, bis korrigiert).

| Konfiguration | Getrennte Häuser (von 6) |
|---|---|
| Ohne Lückenschluss (Runde 17, `p90/dilate=1`) | 3/6 (house4, 5, 6) |
| **Gerichtetes Schließen, `gapLength=8px`** | **5/6** (alle außer house1) |
| Gerichtetes Schließen, `gapLength=15px` | 5/6 (dieselben 5) |
| Gerichtetes Schließen, `gapLength=25px` | 3/6 (Rückgang — Über-Schließen) |
| Gerichtetes Schließen, `gapLength=40px` | 0/6 (kompletter Kollaps) |

**Echter, quantifizierter Erfolg:** von 3/6 auf 5/6 korrekt getrennte Häuser, komplett
farbunabhängig (keine Farbmaske, keine Objektbezeichnung, nur Tiefenkante + die 3 bereits
aus der affinen Rekonstruktion bekannten Richtungen). Es gibt ein klares Optimum
(8–15px) — zu kurz hilft nicht genug, zu lang verbindet falsch benachbarte Strukturen und
lässt das Ergebnis wieder kollabieren (0/6 bei 40px). Das bestätigt: Lückenschluss ist
wirksam, aber nicht beliebig aggressiv anwendbar — die Lückengröße muss zur tatsächlichen
Objektgröße passen (hier ~8–15px bei Häusern von ~150–400px Breite).

**Offen:** house1 trennt sich bei KEINER getesteten Einstellung — nicht untersucht, warum
(schwache Tiefendifferenz zum Boden an dieser Stelle? Randlage? eine eigene, spätere Prüfung
wert). Die Operatoren (LBP/Gabor/Autokorrelation) innerhalb der jetzt gefundenen 5 Grenzen
laufen zu lassen — der ursprünglich vorgeschlagene dritte Schritt — ist noch nicht
umgesetzt.

## 4n. Runde 19: Operatoren innerhalb der gefundenen Grenzen — Fortschritt, kein sauberer Erfolg

Direkte Umsetzung des dritten, ursprünglich vorgeschlagenen Schritts: LBP (der stärkste
Operator aus §4b/§4f) innerhalb einer der in Runde 18 gefundenen Grenzen (house4, robust in
allen Konfigurationen getroffen) laufen lassen, um Dach von Wand zu trennen — diesmal direkt
auf 2D-Bildpixeln statt auf der synthetischen 3D-Punktwolke aus §1–§4c.
`tools/scratch-depth-vp-lbp-fine-segment.mjs`.

**Zwei echte Implementierungsfehler unterwegs gefunden und korrigiert, kein
LBP-Versagen:**

1. Erstes Sampling filterte „jeden 9. Punkt" nach LISTENINDEX der DFS-Besuchsreihenfolge
   der Flood-Fill, nicht nach räumlicher Position — ergab kein echtes Gitter, sondern
   zufällig verteilte Lücken. Ergebnis: 755 Sub-Komponenten bei nur 4361 Punkten.
   Korrigiert auf echtes räumliches Rastern → kaum Besserung (743 Komponenten) — zeigte,
   dass das nicht die Hauptursache war.
2. **Der eigentliche Fehler:** der LBP-Schwellenwert (0,9) wurde blind aus Runde 6
   übernommen — dort aber für eine völlig andere Abtastskala kalibriert (Punkte auf der
   synthetischen 3D-Boxwolke, Dutzende Pixel auseinander, nicht 3–14 Pixel wie hier). Genau
   die Anti-Overfit-Regel, die diese Session selbst mehrfach befolgt hat („Schwellenwert aus
   der eigenen Verteilung, nicht importiert"), wurde hier zunächst verletzt. Korrektur:
   Schwellenwert aus dem 40.-Perzentil der Zufallspaar-Verteilung INNERHALB von house4
   selbst berechnet (wie überall sonst in dieser Session).

**Nach beiden Korrekturen: 10 Sub-Komponenten statt 743/41** — deutlicher Fortschritt, aber
noch kein sauberer Erfolg. Die größte Komponente (117 von 202 Punkten, 58 %) ist eindeutig
das Dach, mehrere kleinere, farblich fast identische Fragmente (28, 17, 13, 8, 7, 2 Punkte)
hätten mit ihr verschmelzen sollen, taten es aber nicht vollständig. Genau EINE Komponente
(8 Punkte, `rgb(179,102,53)`, deutlich anderer Ton) sieht nach einer echten, separaten
Wandfläche aus — aber winzig gegen die Dach-Region, kein sauberer 2–3-Flächen-Split.

**Ehrlich offen:** die Fine-Segmentierung innerhalb bekannter Grenzen funktioniert damit
prinzipiell besser als vorher, ist aber noch nicht so weit wie die 73–74,5%-Ergebnisse der
3D-Punktwolken-Fusion aus §4b–§4c. Naheliegende nächste Schritte (nicht umgesetzt): Ankergröße
und Rasterabstand systematisch statt einmalig durchsuchen, oder — konsistent mit dem Rest
dieser Session — Farbe als zusätzlichen Kanal neben LBP hinzunehmen, statt LBP allein
arbeiten zu lassen.

## 4o. Runde 20a: Tiefenkanten-Pipeline auf einem echten zweiten Bild mit Giebeldächern

`tools/scratch-gable-village-depth-test.mjs` — testet Runden 17–18s Depth-Edge+VP-Ansatz auf
`file_000000002b2871f4891c9f18768440ca.png`: isometrisches Dorf, gleicher Zeichenstil wie
VLG-02, aber mit echten Giebeldächern (Firstlinie, Giebeldreieck) statt flacher
Hexagon-Boxen — strukturell komplexer, echtes zweites Bild, keine Wiederverwendung von
VLG-02-Werten.

**Wichtiger Unterschied zu §4l–§4m:** für dieses Bild existiert KEIN gemessener VP-Fit
(`dirF`) — der würde eine eigene Extraktion brauchen. Getestet wurde stattdessen eine
generische isometrische Winkel-Annahme (0°/60°/120°), schwächer als ein echter Fit.

**Ergebnis: gemischt, ehrlich kein sauberer Erfolg.** Fragmentierung sinkt deutlich
(82,6 %→30,7 % größte Region), und 4 der 5 sichtbaren Dächer bekommen reale
Teilflächen-Treffer, sichtbar korrekt auf dem jeweiligen Dach positioniert
(`gable-village-depth-components.png`) — aber jeweils nur ein PARTIELLER Bereich, kein
sauberes Vollflächen-Polygon. Das graue Dach (ein Haus) wird komplett verfehlt. Zusätzlich
echtes Rauschen im Baumkronen-Hintergrund (mehrere falsch-positive Flecken in der
Vegetation) — die generische Winkelannahme ohne echten Fit ist erwartbar schwächer als
VLG-02s gemessene `dirF`.

**Einordnung:** kein Widerspruch zu §4h/§4i (dort schlug der Farbmasken-Transfer komplett
fehl) — hier zeigt sich stattdessen, dass der Tiefenkanten-Ansatz selbst ohne bildspezifische
Kalibrierung ein reales, wenn auch unvollständiges Signal liefert. Für ein sauberes
Ergebnis bräuchte dieses Bild seine eigene VP-Messung (z. B. aus den jetzt gefundenen
Teilflächen-Kanten selbst extrahiert) statt der generischen Annahme — nicht umgesetzt.

## 4p. Runde 20b: der Tron-Bike-Grenzverfolger — echter Teilerfolg

Wörtlicher Vorschlag des Maintainers: Operatoren sollen „wie Tron Bikes ein Stück entlang
der bekannten Grenze fahren und dann im 90°-Winkel abbiegen, bis sie auf die nächste Grenze
stoßen... Flood fill, aber gemessen bzw. exakt hergeleitet." Anderer Mechanismus als Runde
18s gerichtetes Schließen (das blind JEDEN Kantenpixel verlängert, ein Weichzeichner-artiger
Vorgang): ein gerichteter Lauf, der einer echten Kante entlang einer der 3 bekannten
Richtungen folgt, solange der Tiefengradient sie stützt, und bei Signalverlust aktiv nach
einer Fortsetzung in den ANDEREN bekannten Richtungen sucht (eine Ecke), statt zu stoppen
oder zu verschmieren. `tools/scratch-tron-boundary-tracer.mjs`, getestet auf VLG-02 (echter
`dirF`-Fit vorhanden).

**Ergebnis: kein geschlossenes Polygon, aber ein echter, funktionierender Abbiege-Vorgang.**
Von 6 Startrichtungen aus keine schließt eine Schleife. Die beste Spur läuft 28 Schritte
sauber entlang einer Kante (Startrichtung 331°), erkennt dann eine Ecke und biegt korrekt auf
eine neue Richtung ab (sichtbar am Richtungswechsel in den letzten Pfadpunkten: von
schräg-diagonaler Bewegung zu nahezu reiner Y-Bewegung, konsistent mit einem ~90°-Wechsel
zwischen zwei der bekannten Familien) — bricht aber kurz danach ab (kein weiterer
Fortsetzungs-Fund).

**Einordnung:** das ist der erste echte Beweis, dass der Kern-Mechanismus (Kante folgen,
bei Signalverlust aktiv nach einer anderen bekannten Richtung suchen, abbiegen) funktioniert
— nicht nur Theorie. Für ein geschlossenes Polygon fehlt noch: bessere Fortsetzungssuche nach
einem Abbiegen (aktuell bricht der Lauf ab, sobald auch die zweite Richtung keine Stütze mehr
findet), und vermutlich ein zweiter Durchlauf mit anderen Startpunkten/-richtungen. Nicht
weiter optimiert in dieser Runde — echter erster Schritt, kein fertiges Verfahren.

## 4q. Runde 21: SHADEDs eigene Tiefenkarte gegen DA2, gleiche Aufgabe

Korrektur unterwegs: eine gefundene Tiefenkarte (`file_0000000098bc71f49c057d54182386e6.png`)
wurde zunächst für externen Ground Truth gehalten — Maintainer korrigiert: „Diese Depthmap
ist von shaded selbst." Kein Wahrheitsvergleich also, sondern ein echter Werkzeugvergleich:
SHADEDs eigene Tiefenschätzung gegen DA2, dieselbe Kanten-Segmentierungsaufgabe, auf der
gemalten Giebeldach-Kreuzungsversion (`file_00000000c40471f4859a10d6bf3ac39b.png`).
`tools/scratch-shaded-vs-da2-depth-edges.mjs`.

| Quelle | Komponenten (p85) | Größte Region |
|---|---|---|
| SHADEDs eigene Tiefe | 45 | 60,5 % |
| DA2 | 23 | 69,2 % |

Mehr Komponenten bei SHADEDs eigener Tiefe bedeutet NICHT bessere Kanten — der visuelle
Vergleich (`shaded-vs-da2-depth-components.png`) zeigt: DA2 erfasst ein zusätzliches echtes
Dach korrekt (grüner Treffer auf dem dritten Haus), das SHADEDs eigene Schätzung verpasst,
trotz insgesamt fast doppelt so vieler Komponenten — die zusätzlichen SHADED-Komponenten
sind größtenteils verteiltes Rauschen im Baumkronen-Hintergrund, kein zusätzliches echtes
Signal. Keine der beiden Quellen segmentiert die Häuser dieses Bildes sauber und vollständig.

## 4r. Runde 20c: die LOD-Stufen des Demo-Dorfs — Bildzuordnung zunächst ungeklärt

Der Maintainer bestätigte: es gibt mehrere LOD-Stufen (Detailgrad-Stufen) DERSELBEN
Dorf-Szene im Repo. **Meine erste Zuordnung, welche konkreten Dateien das sind, war falsch**
(Maintainer: „Das ist das falsche Dorf" — bezogen auf die in §4o–§4q verwendete gemalte
Giebeldach-Kreuzungsversion, `file_00000000c40471f4859a10d6bf3ac39b.png`). Die §4o–§4q-Befunde
(Fragmentierung, SHADED-vs-DA2-Vergleich, Tron-Tracer-Teilerfolg) bleiben als Methodik-Beweis
gültig, sagen aber nichts über echte LOD-Übertragbarkeit aus — sie liefen versehentlich gegen
ein anderes, nur oberflächlich ähnliches Giebeldach-Dorf.

**Aufgelöst in §4t:** der Maintainer lieferte die exakte, verifizierte Dateizuordnung für
5 LOD-Stufen (0–4, LOD3/4 mit mehreren Stil-/Wettervarianten). Zwei der Dateien
(LOD1/LOD2) lagen zunächst nicht im lokalen Checkout, nur auf `origin/main` — per
`git checkout origin/main -- <Dateien>` nachgeholt. Der damit mögliche, methodisch saubere
Test steht in §4t.

## 4s. Runde 22: Kreuzungsregel nach Masse statt Kantenstütze (Tron-Tracer-Verbesserung)

Direkte Umsetzung einer Präzisierung aus `docs/billige-raumhypothesen-tiefengrenzen.md`
(„Tron-Bike / Boundary Tracing", Schritt 5): an Kreuzungen soll der Tracer nicht irgendeiner
Richtung mit ein paar Kantenpixeln voraus folgen (Runde 20bs Regel), sondern der Seite,
deren lokale Fläche die stärkste zusammenhängende KOMPATIBLE Masse trägt.
`tools/scratch-tron-tracer-mass-rule.mjs` — für jeden Richtungskandidaten an einer
Stockung wird ein begrenzter Flood-Fill auf der Innenseite ausgeführt (Tiefen-Toleranzband,
gedeckelter Radius), die Richtung mit der größten erreichbaren Masse gewinnt, statt nur
„hat 2 von 3 Schritten Kantenstütze". Getestet auf VLG-02, gleicher Startpunkt wie Runde 20b.

**Ergebnis: kein Fortschritt gegenüber Runde 20b, sondern eine neue, andere Fehlerart.**
Statt früh abzubrechen (Runde 20bs Problem), pendelt der Tracer jetzt endlos zwischen genau
zwei Positionen hin und her (8-mal abgebogen, exakt alternierend zwischen `(27,303)` und
`(153,234)`, immer dieselbe Masse=120 auf beiden Seiten) — ein Oszillations-Fallstrick: an
diesem Punktepaar bewertet die Massenregel beide Richtungen als gleich gut, sodass der
Tracer ewig zwischen ihnen pendelt statt fortzuschreiten. Ehrlich ungelöst, nicht in dieser
Runde behoben — bräuchte eine Tie-Breaking-Regel oder ein Besucht-Gedächtnis, das ein
erneutes Abbiegen an einem bereits besuchten Punkt verbietet.

## 4t. Runde 23: die echte LOD-Leiter — 6/6 mit echtem VP-Fit auf einem anderen Bild

**Korrektur der Bildzuordnung** (Maintainer, nach mehreren Fehlversuchen in §4o–§4r): es
gibt 5 LOD-Stufen derselben Dorf-Szene im Repo, exakt identifiziert:
- **LOD0** `file_000000006d188210a9bb1129089a7b29.png` — die durchgehend in §1–§4s
  verwendete Fixture (flache Box-Dächer), 1536×1024.
- **LOD1** `file_00000000e96c8243b8a6e17ae2ac3bf2.png` — Low-Poly-Giebeldächer, 1536×1024.
- **LOD2** `file_000000008390820abdec286d1496006f.png` — Low-Poly mit mehr Detail (Fenster,
  Türen, Kamin), 1536×1024.
- **LOD3** (3 Stilvarianten, 1672×941): Demobild `file_00000000974871f49fe71f6b456f9579.png`,
  Frühling `file_0000000029f871f4bc597d92064d2e97.png` (fälschlich als „VLG-04" behandelt in
  §4h–§4j — es ist keine andere Szene, sondern dieselbe Szene in einer Jahreszeiten-Variante),
  Überwuchert `1782826101420.png`.
- **LOD4** (2 Wetter-Varianten, 1672×941): Nach dem Sturm
  `file_00000000b27471f4a8aeb27484b46720.png`, Nasser Morgen
  `file_00000000fbc472438dcc92aff24bed6e.png`.

LOD1/LOD2 lagen zunächst nicht im lokalen Checkout (nur auf `origin/main`, dort im selben
Upload-Commit wie LOD0 hinzugefügt) — per `git checkout origin/main -- <Dateien>` geholt,
nichts Bestehendes verändert.

**Der eigentlich saubere Test, den diese Session seit Runde 13 gesucht hat:** LOD0/1/2 haben
exakt dieselbe Auflösung UND exakt dieselbe Kamera-/Objektanordnung — also gilt der ECHTE,
aus LOD0 gemessene `dirF`-Fit (Fluchtpunktrichtungen) und die echten Hauszentren-Koordinaten
UNVERÄNDERT auch für LOD1/2. Kein genereller Winkel-Rateversuch mehr (Runde 20a/20c), keine
falsch zugeordnete zweite Szene (Runde 13, 20a–21) — ein echter, gemessener Fit auf einem
strukturell ANDEREN Bild (Giebeldächer statt Flachbox-Dächer) derselben Szene.
`tools/scratch-lod-crosslevel-gapclose.mjs` — Runde 18s Depth-Edge+VP-Lückenschluss-Pipeline,
unverändert, gegen LOD0/1/2.

| LOD | Ohne Lückenschluss | gapLength=8px | gapLength=15px |
|---|---|---|---|
| LOD0 (Baseline, Flachdach) | 3/6 | 5/6 | 5/6 |
| **LOD1 (Low-Poly-Giebeldach)** | 2/6 | 4/6 | **6/6** |
| LOD2 (Low-Poly, mehr Detail) | 3/6 | 5/6 | 5/6 |

**LOD1 erreicht 6/6 — perfekte Trennung aller sechs Häuser**, mit einem VP-Fit, der nicht
für dieses Bild, sondern für ein STRUKTURELL ANDERES Bild derselben Szene gemessen wurde.
LOD0 reproduziert exakt den bekannten 3/6→5/6-Wert aus Runde 18 (Methodik stabil). LOD2
liegt nah an LOD0 (3/6→5/6). Das ist der methodisch sauberste und stärkste
Generalisierungsbeleg dieser gesamten Session — kein geratenes zweites Bild, kein
Farbwert-Transfer, sondern ein echter geometrischer Fit, der über Detailstufen hinweg trägt,
weil er auf Kamera-/Szenengeometrie beruht, nicht auf Farbe oder Renderstil.

**Ausdrücklich offen:** LOD3/LOD4 haben eine andere Auflösung (1672×941) und vermutlich
einen anderen Bildausschnitt — der direkte Fit-Transfer wie bei LOD1/2 funktioniert dort
nicht ohne Umrechnung (Skalierung/Neuzentrierung), nicht in dieser Runde versucht. Der
Lückenschluss mit der neuen Massen-Kreuzungsregel (§4s) wurde noch nicht mit diesem
LOD-Kreuztest kombiniert.

## 4u. Runde 24: echte 3D-Ebenen-Fits statt 2D-Pixel-Heuristik — die fehlende Stufe

Direkte Reaktion auf eine detaillierte Pipeline-Spezifikation des Maintainers
(„Rohbild → Depth-Sobel+Laplacian+Varianz → DepthBoundaryMap → ... → Region Growing im
Bildraum → **RANSAC-/Least-Squares-Plane-Fit im rückprojizierten Raum** → **Plane Residual
Map** → Split/Merge/Expand → Flächengraph → ...", mit dem expliziten Kommentar: „So ist das
nicht mehr das, was wir erarbeitet haben. Das hier sollte viel genauer und
informationsreicher sein."). Berechtigt: alles in §1–§4t blieb im 2D-Pixelraum
(Kantenmasken, Flood-Fill-Blobs, Bounding-Boxen) — keine der bisherigen „gefundenen
Regionen" wurde je tatsächlich nach 3D rückprojiziert und geometrisch geprüft.

`tools/scratch-plane-residual-fit.mjs` — für jede der in Runde 23 gegen echten Ground Truth
gematchten Hausregionen (LOD0): Pixel per Pinhole-Modell nach 3D rückprojiziert (gleiches
Modell wie die Rotationsgrenzen-Untersuchung), Ebene per PCA/Least-Squares gefittet
(kleinster Eigenwert der Kovarianzmatrix als Normale), Residuum (senkrechter Abstand
Punkt–Ebene) pro Punkt berechnet.

| Haus | Regionsgröße | Planarität | Residuum (Mittel/Median/p90/Max) |
|---|---|---|---|
| house2 | 24.186px | 0,9999 | 0,34 / 0,29 / 0,70 / 1,46 |
| house3 | 20.895px | 0,9999 | 0,38 / 0,32 / 0,75 / 1,84 |
| house4 | 39.242px | 1,0000 | 0,02 / 0,01 / 0,03 / 0,45 |
| house5 | 17.497px | 1,0000 | 0,06 / 0,05 / 0,10 / 0,26 |
| house6 | 29.820px | 1,0000 | 0,02 / 0,02 / 0,05 / 0,19 |

**Auffällig sauber — und das war zunächst nur eine Vermutung, keine Prüfung.** Die erste
Fassung dieses Abschnitts leitete aus der Fast-Perfektion der Ebenen-Fits her, die Region
erfasse „vermutlich" nur das Dach — Maintainer-Einwand zu Recht: „Eine Vermutung ist kein
Beweis." Nachgeholt in Runde 25.

**Runde 25 — direkt gegen echten Ground Truth geprüft, nicht mehr aus der Planarität
geraten.** `tools/scratch-verify-region-roof-or-wall.mjs`: die ORIGINAL-Farbmasken-Extraktion
(`scratch-village-extract-v2.mjs`, echte, verifizierte Material-Pixel, keine Ableitung) liefert
für house4 die tatsächlichen Dach- (51.205px) und Wand-Pixelmengen (wallLight 22.660px +
wallDark 32.528px). Jeder Pixel der Runde-23/24-Region wurde direkt gegen diese echten Mengen
klassifiziert:

| | Pixelanteil |
|---|---|
| Dach | **98,5 %** |
| Wand | **0,0 %** |
| weder/noch (Rand, Kante, Antialiasing) | 1,5 % |

**Jetzt bestätigt, nicht mehr vermutet:** die Region erfasst tatsächlich (nahezu) exklusiv
das Dach, keinen einzigen Wandpixel. Die frühere Schlussfolgerung war in der Sache richtig,
aber falsch begründet — aus einem Planaritäts-Wert hergeleitet statt direkt gemessen. Das
ist der Unterschied zwischen einer plausiblen Vermutung und einem geprüften Befund, und der
Maintainer-Einwand war berechtigt, unabhängig davon, dass die Vermutung sich bestätigte.

**Ausdrücklich offen — der Rest der spezifizierten Pipeline ist NICHT umgesetzt:**
Laplacian/lokale Varianz als Zusatzkanal zur `DepthBoundaryMap` (bisher nur Sobel-Gradient),
VP-/Linienfamilien in homogenen Koordinaten (bisher einfache Winkel-Familien), Seed-Regionen
aus Varianz+VP-Kompatibilität statt „größte Restregion", Split/Merge/Expand basierend auf
der Residuen-Karte (bisher keine Rückkopplung — die Regionen aus Runde 18/23 wurden nicht
anhand ihres Residuums weiter geteilt), und der eigentliche Flächengraph (Knoten=Ebenen,
Kanten=Nachbarschaft/Faltung/Öffnung) als strukturierte Ausgabe. Diese Runde liefert die
erste funktionierende Instanz der EINEN fehlenden Kernstufe (Rückprojektion→Ebenen-Fit→
Residuum), nicht die vollständige spezifizierte Kette.

## 4v. Runde 26: Bodenebene — Ausrichtung/Neigung, plus Wand-via-Differenz mit Vegetations-Ausschluss

Direkte Anfrage des Maintainers: „Versuche als nächstes bitte die Bodenfläche, ihre
Ausrichtung und ihre mögliche Neigung zu ermitteln. Im Idealfall lassen sich die Kanten der
Hauswände aus der Differenz aus Dachmaske und Bodenmaske ziehen. Vegetation muss dabei
ignoriert werden. Büsche oder andere Verdeckende Objekte dürfen nicht die angenommene
Flächenbegrenzung beeinflussen." Zwei Teilaufgaben, `tools/scratch-ground-plane-and-walls.mjs`
(LOD0, gleiches Pinhole-Rückprojektionsmodell wie Runde 24, gleicher `fitPlane`-PCA-Code).

**Vegetations-Ausschluss (Vorstufe für beide Teilaufgaben).** Gras-Referenzfarbe direkt aus
dem Bild gesampelt (`rgb(101,136,48)` bei 50%/85% Bildposition). Büsche NICHT angenommen,
sondern gemessen: Farbproben in einem Ring um jeden Haus-Mittelpunkt, gefiltert auf
grün-dominant UND farblich von Gras unterscheidbar (`rgbDist` 15–90), gemittelt zu
`rgb(134,165,61)`. Damit per Flood-Fill 4 echte Busch-Komponenten gefunden und aus Boden- UND
Wand-Kandidatenmengen ausgeschlossen (gleiche Methode wie die Farbmasken-Extraktion selbst,
keine geratenen Werte).

**Bodenebene: gefittet, nicht angenommen.** 20.455 grasfarbene Pixel (Dach/Busch
ausgeschlossen), 5.114 für den Ebenen-Fit gesampelt, per Pinhole-Modell nach 3D
rückprojiziert, PCA-Ebenen-Fit:

| Größe | Wert |
|---|---|
| Planarität | 1,0000 |
| Residuum (Mittel/Median/p90/Max) | 0,21 / 0,14 / 0,39 / 2,09 (Weltmodell-Einheiten) |
| Gefittete Normale | `[0.0003, 0.0194, -0.9998]` |
| Analytisch vorhergesagte Normale | `[0, 1, 0]` |
| Winkel gefittet↔vorhergesagt | **88,89°** |

Die gesampelten Bodenpixel bilden im Rückprojektionsraum selbst eine fast perfekt ebene
Fläche (Planarität 1,0000, Residuen klein gegenüber dem 200–900-Einheiten-Tiefenbereich) —
**das ist ein echter, gemessener Befund**: der Boden ist in dieser Rückprojektion tatsächlich
eben, keine sichtbare Welligkeit.

**Aber die Ausrichtungs-Vorhersage ist damit widerlegt, nicht bestätigt.** Die analytische
Vorhersage stammte aus einer Annahme dieser Runde: die Familienrichtung des affinen Solvers,
die auf dem Bildschirm am nächsten an 90° liegt (`familyAnglesDeg[1]=90,1°`), sei die
„Höhen"-Achse, und deren Weltrichtung entspreche direkt der Kamera-Y-Achse `[0,1,0]` im
Pinhole-Rückprojektionsraum. Gemessen kommt stattdessen eine Normale heraus, die fast
vollständig in der Kamera-Z-Richtung liegt (Blickrichtung/Tiefe), 88,89° von der Vorhersage
entfernt — praktisch orthogonal, keine kleine Neigung. **Das ist kein Beleg für eine reale
Boden-Neigung von ~89°** (das wäre eine absurde, im Bild nicht sichtbare Kippung) — es zeigt,
dass die Vorhersage-Methode selbst nicht funktioniert: der affine Solver arbeitet in seinem
eigenen, aus Box-`T`/`scale`-Daten gefitteten abstrakten Weltkoordinatensystem, das nie gegen
die Kamerakonvention des Pinhole-Rückprojektionsmodells (Bildschirm-X, Bildschirm-Y-als-oben,
Z-als-Tiefe) kalibriert wurde. Eine Familienachse als „näher an 90° auf dem Bildschirm" zu
benennen sagt nichts darüber, wie die zugehörige 3D-Weltrichtung in einem UNABHÄNGIG
gewählten Kamera-Raum orientiert ist — zwei verschiedene Koordinatensysteme, naiv
gleichgesetzt. **Unbewiesene Zusatzhypothese, nicht getestet:** die schmale, überwiegend in
der Bildtiefe verteilte Streuung der Grasproben (viele Pixel bei ähnlicher Bildschirmposition,
aber unterschiedlicher DA2-Tiefenschätzung durch Textur-/Rauschartefakte) könnte den Fit
zusätzlich in Richtung einer tiefenlastigen Scheinebene ziehen. Nicht geprüft — nur genannt,
damit sie nicht stillschweigend als Erklärung durchgeht.

**Ergebnis dieser Teilaufgabe: die Ebenenmessung selbst ist erfolgreich (echte Ebene, echtes
Residuum), die Neigungsaussage ist NICHT möglich**, weil die Vergleichsgrundlage (analytische
Vorhersage) methodisch ungeklärt ist. Eine echte Tilt-Aussage bräuchte einen direkten Vergleich
mit einer bereits bekannten Weltgröße (z. B. den echten Haus-`T`/`scale`-Bodenkanten aus dem
affinen Solver selbst, im SELBEN Koordinatensystem wie die Häuser, statt einer neu erfundenen
Kamera-Konvention) — nicht in dieser Runde umgesetzt.

**Wand-via-Differenz (Dach-Maske minus Boden-Maske, Vegetation ausgeschlossen).** Pro Haus:
Kandidatenspalte unterhalb der Dach-Bounding-Box (gleiche Spaltenbreite wie das Dach, Höhe =
Dachhöhe), abzüglich Dach-, Boden- und Busch-Pixel. Direkt gegen die echten
`wallLight`+`wallDark`-Ground-Truth-Pixel (Runde 25s Farbmasken-Extraktion) geprüft:

| Haus | Kandidatengröße | echte Wandpixel | Treffer | Precision | Recall |
|---|---|---|---|---|---|
| house1 | 41.689 | 23.052 | 17.074 | 41,0 % | 74,1 % |
| house2 | 60.763 | 33.777 | 24.036 | 39,6 % | 71,2 % |
| house3 | 41.548 | 33.923 | 25.574 | 61,6 % | 75,4 % |
| house4 | 78.120 | 55.188 | 36.975 | 47,3 % | 67,0 % |
| house5 | 25.441 | 23.049 | 18.391 | 72,3 % | 79,8 % |
| house6 | 11.521 | 25.789 | 9.263 | 80,4 % | 35,9 % |

**Echter Teilerfolg, kein sauberes Wand-Extraktionsverfahren.** Für 5 von 6 Häusern werden
67–80 % der echten Wandpixel gefunden (Recall) — die Grundidee (Wand liegt zwischen Dach und
Boden) trägt. Aber Precision liegt bei nur 40–80 %: die simple „Spalte unter der Dach-Bbox"-
Heuristik fasst deutlich mehr Fläche als die echte Wand (Schatten, perspektivisch verzerrter
Boden vor dem Haus, angrenzende Nachbarflächen landen mit in der Kandidatenmenge). house6
fällt mit 35,9 % Recall deutlich ab (kleinstes/am stärksten verdecktes Haus der Szene). Keine
Kantenverfeinerung (z. B. Tiefenkanten-Grenze statt Bounding-Box-Spalte) wurde in dieser Runde
ergänzt — das wäre der naheliegende nächste Schritt, aber nicht Teil dieser Anfrage.

**Ausdrücklich offen:**
- Die Boden-Neigungsfrage bleibt unbeantwortet; die hier verwendete Vergleichsmethode
  (Familien-Achse → geratene Kamera-Y-Achse) ist als ungültig erkannt, nicht durch eine
  bessere ersetzt.
- Der Busch-Ausschluss wurde nicht unabhängig gegen eine echte Busch-Ground-Truth geprüft (es
  gibt keine) — nur visuell/farblich plausibel, nicht pixelgenau verifiziert.
- Wand-Kandidaten sind grob (Bounding-Box-Spalte), keine Kantenverfeinerung; Precision bleibt
  in 5/6 Fällen unter 75 %.

## 4w. Runde 27: Metrik-Anker, Fluchtpunkt-Debatte, und der entscheidende Rotations-Test

Ein längerer, direkter Schlagabtausch mit dem Maintainer, hier vollständig nachdokumentiert
(bisher nur im Gespräch, nicht im Log). Fünf Teilschritte, jeder hat den vorigen korrigiert
oder geschärft — das wird bewusst so gezeigt, nicht geglättet.

**1) Metrik-Anker über eine einzige Reallänge.** Direkte Reaktion auf die Kalibrierungslücke
aus §4v: der Affine-Solver (`scratch-village-reconstruct-affine.mjs`) ist NICHT das
willkürlich reskalierte DA2-Pinhole-Modell aus §4u/§4v — seine `scale[name][f]`-Werte sind
bereits pixelkonsistente Längen entlang der gemessenen Familienrichtung `dirF[f]` (Zitat aus
dem Solver-Kommentar: „P's three COLUMNS are simply the three families' own measured 2D screen
directions"). Unter Orthographie ist Bildverschiebung entlang einer Familie überall im Bild ein
KONSTANTES Vielfaches der Realdistanz — eine einzige bekannte (oder angenommene) Reallänge
kalibriert die GESAMTE Rekonstruktion in einem linearen Schritt, ohne Kreuzverhältnis. LOD0 hat
kein Tür/Fenster-Feature (visuell geprüft, reine Farbboxen) — Anker musste daher ERFUNDEN
werden (house1-Dachhöhe ≈ 3 m, explizit INVENTED, nicht OBSERVED). Korrekt umgesetzt als EIN
globaler Skalierungsfaktor aus EINEM Referenzhaus, auf alle anderen angewendet (nicht pro Haus
neu geankert — das würde nur die Annahme zirkulär reproduzieren):

| Haus | Breite | Höhe | Tiefe |
|---|---|---|---|
| house1 (Anker) | 6,16 m | 3,00 m | 5,03 m |
| house2 | 6,14 m | 4,03 m | 6,82 m |
| house3 | 6,81 m | 4,48 m | 5,25 m |
| house4 | 9,28 m | 5,17 m | 7,57 m |
| house5 | 7,05 m | 5,26 m | 6,59 m |
| house6 | 8,37 m | 4,27 m | 6,26 m |

Kein Ausreißer (keine 40-m- oder 20-cm-Häuser), plausibler Wohnhaus-Maßstab — ein bestandener,
nicht-zirkulärer Sanity-Check, kein Beweis (keine unabhängige Ground Truth für die
„beabsichtigte" Realgröße dieses synthetischen Assets existiert).

**2) Maintainer-Einwand: „die affine Perspektive bedeutet bloß, dass jedes Haus seine eigenen 3
Fluchtpunkte hat".** Wörtlich falsch (ein Fluchtpunkt gehört einer 3D-RICHTUNG, nicht einem
Objekt — bei gleicher Richtung teilen sich beliebig viele Objekte denselben VP), aber mit einem
echten Kern: die pro-Haus gemessene Winkelabweichung (schon in §4v/`scratch-village-reconstruct-
affine.mjs`-Kommentar als Rauschen behandelt) könnte STRUKTURIERT statt zufällig sein. Test:
pro-Haus-lokale Familienwinkel gegen Bildposition (dx/dy vom Bildzentrum) korreliert:

| Familie | corr(Abw., dx) | corr(Abw., dy) |
|---|---|---|
| 0 | -0,83 | -0,77 |
| 1 (vertikal) | +0,72 | +0,23 |
| 2 | -0,49 | +0,54 (house4 Ausreißer) |

Zwei von drei Familien zeigen deutliche, vorzeichenkonsistente Korrelation — kein
Zufallsrauschen-Muster, eher das Signaturmuster eines echten, aber sehr weit entfernten,
gemeinsamen Fluchtpunkts.

**3) Maintainer-Gegeneinwand: „bei frei rotierten, ungleich großen Quadern auf einer Ebene
funktionieren 3 gemeinsame Fluchtpunkte für alle nicht mehr — eine angewinkelte Linie läuft nie
auf denselben Fluchtpunkt wie eine parallele. Das ist unmöglich."** Der allgemeine Satz ist
unbestreitbar richtig. Direkter Test, ob er HIER zutrifft: eine starre Rotation (Häuser stehen
auf gemeinsamer Bodenebene, „frei rotiert" heißt praktisch Gieren um die Vertikale) ändert NIE
die paarweisen WinkelABSTÄNDE zwischen den 3 Achsen eines Hauses — nur ihren gemeinsamen
Absolutwert. Gemessen: die Abstände selbst streuen 10–17° zwischen Häusern (0-1: 53,0°–67,3°,
0-2: 51,4°–67,7°) — unvereinbar mit reiner starrer Rotation.

**4) Ehrliches Eingeständnis auf direkte Nachfrage („Zeig mir, dass sie gleich ausgerichtet
sind. Kannst du nicht.").** Zu Recht — aus einem einzigen 2D-Bild ohne unabhängige
3D-Ground-Truth ist NICHT entscheidbar, ob die Restabweichung von (a) individueller Rotation,
(b) echter, sehr entfernter Perspektive, oder (c) Extraktionsrauschen stammt. Alle drei
erzeugen ähnliche 2D-Muster. Auch die identische `famAssignment`-Struktur `[0,2,1,0,2,1]` über
alle Häuser ist KEIN Beleg für gleiche Ausrichtung — nur ein Artefakt des
Nächste-Familie-Zuordnungsalgorithmus, der so labelt, egal ob die Häuser wirklich gleich
ausgerichtet sind.

**5) Der Ausweg und die entscheidende Prüfgröße.** Maintainer: reale Bilder liefern so gut wie
nie sichtbar konvergente Fluchtpunkte („Die Welt ist kein Anime") — Single-View-Metrology
funktioniert in der Praxis nie ohne eine zusätzlich EINGEBRACHTE Annahme (bekannte Länge,
angenommener rechter Winkel). Statt eines frei erfundenen VP-Orts (ein unbeschränkter, will­
kürlicher Freiheitsgrad) wurde eine schwächere, physikalisch begründete Alternative
vorgeschlagen: Orthogonalität der 3 Achsen als expliziter INVENTED-Constraint. Fünf klassische
Perspektive-Konstruktionsdiagramme vom Maintainer (u. a. die Grundriss/Aufriss/Horizont-
Konstruktion mit F1/F2/Augpunkt O') lieferten die entscheidende Klärung: **F1/F2 sind eine
Funktion von (Objektausrichtung im Grundriss, Augpunkt)** — löst den scheinbaren Widerspruch
zwischen Schritt 2 (VPs sind pro Richtung global) und Schritt 3 (unterschiedlich rotierte
Objekte haben unterschiedliche VPs) vollständig auf: beides ist gleichzeitig wahr, je nachdem
ob die Objekte dieselbe Ausrichtung teilen.

Direkt aus dieser Klärung folgt die in Schritt 3 verwendete Prüfgröße nochmal geschärft: eine
starre Rotation erhält den paarweisen Winkelabstand der 3 Achsen eines Objekts IMMER — bei
echter Isometrie (3 orthogonale Achsen) muss dieser Abstand exakt 60°/60°/60° sein. Vergleich
pro-Haus-lokal gegen global gepoolt (Summe der quadrierten Abweichungen von 60°):

| | house1 | house2 | house3 | house4 | house5 | house6 | **global (gepoolt)** |
|---|---|---|---|---|---|---|---|
| SumSq-Abweichung von 60/60/60 | 128,4 | 34,6 | 22,7 | 66,0 | 87,6 | 90,2 | **2,82** |

Jedes einzelne Haus weicht 8×–45× stärker vom orthogonalen Idealmuster ab als der über alle 6
Häuser gepoolte globale Fit. Das ist das Gegenteil von dem, was echte individuelle Rotation
vorhersagen würde (die pro Haus die 60/60/60-Struktur erhalten müsste, nur verschoben) — es
spricht dafür, dass die wahre zugrunde liegende Geometrie eine gemeinsame, echte Orthogonalität
ist, und die große Streuung PRO Haus überwiegend aus Extraktionsrauschen kommt (nur 6 Kanten je
Haus, Hüllkurven-Ungenauigkeit), das sich beim Poolen über alle Häuser weitgehend heraus
mittelt.

**Ehrliche Grenze:** das beweist nicht, dass gar keine reale Rotationsdifferenz zwischen
Häusern existiert — eine kleine echte Differenz könnte im Rauschen versteckt sein. Aber es
macht „jedes Haus ist bedeutsam individuell rotiert" als DOMINANTE Erklärung unwahrscheinlich
und dreht die in Schritt 4 festgestellte Unentscheidbarkeit in eine evidenzbasierte, weiterhin
vorsichtige Schlussfolgerung um: die gemeinsame-Ausrichtung-Annahme, auf der der gesamte
Affine-Solver seit Runde 1 beruht, ist jetzt eher gestützt als widerlegt — aber weiterhin nicht
bewiesen im strengen Sinn von Schritt 4.

**Ausdrücklich offen:** die Orthogonalitäts-Constraint-Version des Solvers (Schritt 5s
INVENTED-Alternative zum freien Fit) ist vorgeschlagen, aber nicht implementiert — der jetzige
freie globale Fit liegt mit 2,82 SumSq-Abweichung bereits so nah am Ideal, dass eine erzwungene
Orthogonalität wahrscheinlich nur eine kleine Korrektur wäre, nicht die vermutete große. Die
5 Referenzbilder (Perspektive-Tutorials, keine Fotos des Dorfs) wurden nur konzeptionell
genutzt, nicht pixelgenau vermessen (keine Datei, keine verlässliche Koordinatenextraktion aus
eingefügten Bildern).

## 4x. Runde 28: erste befahrbare 3D-Rekonstruktion (LOD0)

Direkte Reaktion auf den Wunsch, tatsächlich „in dieses Bild eintauchen" zu können. Die Runde-
27-Bestätigung (echte Isometrie, Pitch 35,26°/Yaw 45°, keine 2:1-Dimetrie) macht die bereits
gelösten `T`/`scale`-Werte erstmals direkt in eine echte 3D-Szene übersetzbar — vorher war
`dirF` nur eine 2D-Projektionsrichtung ohne bekannte 3D-Kamera dahinter.

**Rechnung (`tools/verify-out/village-scene-3d.json`, nicht committet, s. u.):** pro Haus alle
8 lokalen Eckkoordinaten (0/1 je Achse) über `T[f] + a[f]*scale[f]` in Weltkoordinaten
umgerechnet, Weltachse == Familienindex (0=X, 1=Y/vertikal, 2=Z), mit dem Runde-27-Metrik-Anker
(`metersPerUnit = 3 / scale['house1'][1] = 0,03496`) in Meter skaliert, pro Haus Boden auf
globales Minimum-Y normalisiert.

**Ursprünglich hier vermuteter Nebenbefund, INZWISCHEN WIDERLEGT — Korrektur direkt im
Anschluss dokumentiert statt still gefixt (s. „Korrektur" unten):** eine erste Fassung dieses
Abschnitts berichtete eine Boden-Y-Streuung von 0 bis 2,26 m zwischen den 6 Häusern und
markierte sie als UNKNOWN (echtes Gefälle oder Solver-Rauschen). Der Maintainer bemerkte den
sichtbaren Effekt direkt im Viewer als „4 von 6 schweben" — das führte zur Prüfung unten, die
zeigt: es war kein Solver-Befund, sondern ein eigener Fehler in genau dieser Szenenberechnung.

**Artefakt:** `tools/verify-out/village-3d-viewer.html`, als Artifact veröffentlicht
(https://claude.ai/code/artifact/f8a99da5-8718-438a-a5fc-b3f5b61d8379) — echte Three.js-Szene,
6 Boxen an den berechneten Positionen/Größen, Kamera-Startpose entlang der bestätigten
Isometrie-Richtung, danach frei per OrbitControls navigierbar (Drehen/Zoomen/Verschieben),
Klick auf ein Haus fliegt die Kamera dorthin. Rechtes Panel zeigt reale Maße pro Haus und
markiert die Herkunft jeder Zahl explizit mit den Session-eigenen Provenance-Tags
(INVENTED für den Metrik-Anker, DERIVED für Position/Größe/Kamera, UNKNOWN für die
Boden-Streuung) — keine Zahl wird als sicherer ausgegeben, als sie ist.

**Ausdrücklich offen:**
- Wege und Büsche sind nicht rekonstruiert (nur die 6 Häuser + eine ebene Bodenplatte) — im
  Viewer als Lücke benannt, nicht verschwiegen.
- Die Kamera-Startpose ist eine PerspectiveCamera aus großer Distanz mit engem Sichtfeld, keine
  echte OrthographicCamera — nähert die Isometrie nur an, reproduziert sie nicht exakt.
- `tools/verify-out/*` ist laut `.gitignore` nicht committet (Projektregel) — die Szene lebt
  ausschließlich im veröffentlichten Artifact, nicht im Repo.

**Korrektur (noch Runde 28, direkt im Anschluss):** Maintainer meldete den sichtbaren Effekt
im Artifact direkt: „4 von 6 schweben". Nachgeprüft statt vermutet — `T[house][1] + scale
[house][1]` (nicht `T[house][1]` allein) ergibt für ALLE 6 Häuser exakt `0,0000`. Das IST die
vom Solver tatsächlich durchgesetzte gemeinsame Bodenreferenz (`GROUND_WEIGHT`-Constraint
funktioniert exakt wie vorgesehen — testweise um den Faktor 10.000 erhöht, Ergebnis identisch,
weil die Bindung bereits nahezu exakt erfüllt war). Der Fehler lag ausschließlich in der
Szenenberechnung dieser Runde: nach dem E4-Vorzeichen-Gauge-Fix des Solvers (Invariante:
`T[axis]+a*L[axis] ≡ T'[axis]+(1-a)*L'[axis]`) hat sich bei ALLEN 6 Häusern die lokale
Ecke 1 mit der Ecke 0 vertauscht — die geteilte Bodenecke liegt danach bei `a'=1`
(`T[1]+scale[1]`), nicht bei `a'=0` (`T[1]` allein), wie ich angenommen hatte. Ich hatte
schlicht die falsche der beiden Ecken als „Boden" behandelt und dann noch zusätzlich über alle
Häuser hinweg falsch normalisiert — daraus kam die scheinbare 0–2,26-m-Streuung. Kein
Solver-Fehler, keine reale Boden-Neigung, kein ungeklärter Rest: eine falsche Ecken-Auswahl in
`village-3d-viewer.html`. Korrigiert (`y=0` für alle 6 Häuser direkt aus `scale[1]` als Höhe),
Artifact neu veröffentlicht (gleicher Link), Viewer-Panel zeigt die Korrektur jetzt offen an
statt sie zu verstecken. `tools/scratch-affine-gw-test.mjs` (die `GROUND_WEIGHT`-Diagnose, die
den Solver als unschuldig entlarvt hat) bleibt als Beleg im Repo.

Bezug zu §4v: das ist NICHT dieselbe offene Frage wie §4v's Boden-Neigung (dort ging es um eine
andere, seither ebenfalls als methodisch ungültig erkannte DA2-Pinhole-vs-Solver-Ebenenfit-
Verrechnung) — dieser Abschnitt korrigiert nur den in Runde 28 selbst neu eingeführten Fehler,
§4v bleibt weiterhin offen.

## 4y. Runde 29: echte Bodentextur (Wege, Büsche) — autonome Nachtiteration

Der Maintainer ist schlafen gegangen, mit der Bitte, das Vorgehen mit allem Verfügbaren
eigenständig weiter zu verbessern (`/loop`, dynamischer Modus). Direkt anschließend an
Runde 28s offenen Punkt „Wege und Büsche sind nicht rekonstruiert" bearbeitet — ohne dafür
Pfad-/Busch-Geometrie neu zu erfinden, sondern mit bereits verifizierten Bausteinen dieser
Session.

**Methode.** Für einen Bodenpunkt (Welt-Y=0, die in Runde 28 bestätigte gemeinsame
Bodenreferenz) ist die Vorwärtsabbildung des affinen Solvers linear:
`screen = X*dirF[0] + Z*dirF[2]`. Das 2×2-System ist direkt invertierbar — für JEDEN
Bildpixel lässt sich exakt (nicht approximativ) die reale Boden-Weltposition berechnen,
per Rundreise-Test bestätigt (`tools/scratch-ground-texture-project.mjs`).

**Ein sofort gefundener eigener Denkfehler, bevor überhaupt etwas gebaut wurde:** die erste
Idee war, die Bodenfläche als achsenausgerichtetes Rechteck um die Häuser zu legen und das
Quellbild einfach draufzuprojizieren. Das versagt sofort messbar — unter der Isometrie-Kamera
bildet ein Weltrechteck sich auf ein SCHIEFES PARALLELOGRAMM im Bild ab, nicht umgekehrt.
Projiziert man das Bild auf ein Weltrechteck, liegen die meisten UV-Koordinaten weit außerhalb
[0,1] (gemessen: -0,72 bis 1,91). Richtig ist der umgekehrte Weg: die 4 Bild-Ecken (0,0)/(W,0)/
(0,H)/(W,H) über die inverse Abbildung zurück nach Welt-(X,Z) — das ergibt das tatsächliche
Boden-Parallelogramm, das die 3D-Bodenfläche jetzt ist (kein Rechteck).

**Hausflächen aus der Textur herausgerechnet**, nicht nur draufgelegt: dieselben echten
Dach-/Wandfarben aus Runde 25 (`roof:[225,126,69], wallLight:[198,166,109],
wallDark:[141,125,81]`) identifizieren Hauspixel, die vor dem Einbetten mit der gemessenen
Grasfarbe (`rgb(101,136,48)`, gleicher Punkt wie Runde 26) übermalt werden — sonst würde unter
jeder echten 3D-Box ein doppeltes, flach projiziertes 2D-Geisterhaus durchscheinen.

**Zwei echte Bugs beim ersten lokalen Testrender gefunden (Playwright ließ sich nur mit lokal
gespiegelten CDN-Skripten prüfen — der Sandbox-Netzwerkzugang bricht bei Chromium-eigenen
Requests an cdnjs/jsdelivr ab, `curl` funktioniert, das ist eine Umgebungs-Eigenheit, keine
Eigenschaft dieser Seite):**
1. `texture.colorSpace` gesetzt — falsche API für das gepinnte three.js r128 (das nutzt noch
   `texture.encoding`); `.colorSpace` existiert dort nicht und tut still gar nichts. Behoben.
2. Direktlicht+Umgebungslicht waren von Anfang an zu hell eingestellt (Dach erschien
   cremeweiß statt orange) — unabhängig vom Textur-Bug, seit Runde 28 unbemerkt, weil nie
   ein echter Screenshot angesehen wurde. `sun` 1,15→0,85, Ambient 0,55→0,35, Hemisphere
   0,4→0,25. Sichtbar per lokalem Testrender bestätigt, nicht nur angenommen.

**Ergebnis:** Wege und Büsche sind jetzt sichtbar, korrekt positioniert (an denselben
Koordinaten wie die Häuser, exakt derselbe Abbildung) — aber weiterhin FLACHE Textur, keine
3D-Geometrie. Das steht auch im Viewer-Panel so, nicht nur im Log. Artifact aktualisiert
(gleicher Link).

**Ausdrücklich offen:**
- Der Nahtübergang zwischen dem texturierten Parallelogramm und der einfarbigen
  Rand-Bodenfläche ist nach der Farbkorrektur unauffällig, aber nicht perfekt unsichtbar.
- `renderer.outputEncoding=sRGBEncoding` wurde gesetzt, ohne die gesamte r128-Farbpipeline
  systematisch durchzuprüfen — nur so weit korrigiert, bis Dach und Wege im Testrender
  plausibel aussahen, kein Farbmess-Beweis wie bei den geometrischen Befunden dieser Session.
- Kein Zugriff auf reale Netzwerk-CDN-Ressourcen in dieser Sandbox für Playwright-Renders
  (nur `curl` funktioniert) — jede zukünftige visuelle Prüfung eines Artifacts braucht
  denselben Umweg (CDN-Skripte lokal spiegeln, URLs für den Test umbiegen, danach zurück).

## 5. Synthese — der eigentliche Befund

| Kombination | Reine Punkte |
|---|---|
| Geometrie allein | 6,3 % |
| VP allein | 1,6 % |
| Textur allein | 0,0 % |
| Geometrie + VP | 8,3 % |
| Geometrie + Textur | 10,2 % |
| Geometrie + Farbe | 28,6 % |
| Geometrie + Farbe + VP | 33,7 % |
| Geometrie + Farbe + Textur (Punktpaar) | 35,4 % |
| Geometrie + Farbe + Textur (laufender Mittelwert) | 33,4 % |
| Geometrie + Farbe + VP (eingefrorener Anker) | 39,4 % |
| Geometrie + Farbe + Textur (eingefrorener Anker, size=5) | 73,0 % |
| Geometrie + Farbe + Textur + VP (beide eingefrorene Anker) | 74,5 % |
| Geometrie + Farbe + eingefrorener DA2-Tiefen-Anker | 34,7 % |
| **Geometrie + Farbe + Textur + VP** (bestes Ergebnis, DA2-Tiefe nicht mit einkombiniert) | **74,5 %** |

Kein einzelner Kanal ist für sich brauchbar (0–6 %); zwei der drei Zusatzkanäle sind sogar
für sich SCHLECHTER als der Geometrie-Baseline (VP: 1,6 %, Textur: 0,0 %). Trotzdem verbessert
jeder einzelne davon das fusionierte Ergebnis, wenn er zu Geometrie+Farbe hinzukommt. Das ist
die direkte, jetzt mit echten Zahlen belegte Bestätigung des Multimodal-Prinzips aus §3 dieser
Session (und wortgleich der Cultivation-Referenz in `material-geometrie-ohne-farbe.md` §3:
„Kein einzelner Evidenzkanal besitzt die Cultivation”) — UND eine Präzisierung, die über die
bloße Prinzip-Aussage hinausgeht: ein Kanal, der isoliert eingesetzt schlechter ist als gar
kein Zusatzkanal, ist trotzdem kein guter Grund, ihn auszuschließen. Die Bewertung „nützlich
oder nicht” darf sich nie am Alleinstand eines Kanals orientieren, nur an seinem Beitrag zur
Fusion.

Zwei konkrete, wiederkehrende Fehlermuster über alle vier Kanäle hinweg:

1. **Naive Quantisierung/Diskretisierung ist gröber als der zugrundeliegende kontinuierliche
   Vergleich** (VP-Snap: 90°-Zellen statt 28°-Paarvergleich) — schafft neue Lecks, statt
   welche zu schließen.
2. **Falsche Vergleichsgranularität** (LBP: Punktpaar statt Regions-Aggregat) — verdeckt ein
   echtes Signal fast vollständig, obwohl es nachweislich da ist.

Beide Muster sind eher Implementierungsfragen als Kanal-Eigenschaften. Für LBP ist das jetzt
mehr als eine Vermutung: der Sprung von 35,4 % (Punktpaar) über 33,4 % (naives laufendes
Mittel, sogar leicht schlechter) auf 73,0 % (eingefrorener Anker) zeigt, dass die
Aggregations-FORM (kontinuierlich driftend vs. früh eingefroren) mehr Wirkung hat als die
Aggregation an sich. Ein analoger „eingefrorener Anker" für den VP-Snap (Kardinalachse aus
einem kleinen vertrauenswürdigen Kern bestimmen, statt pro Punkt neu einzurasten) ist der
naheliegende nächste Test, aber noch nicht durchgeführt.

## 6. Ausdrücklich offen

- Gabor und 2D-Autokorrelation (die anderen zwei Mikrotextur-Operatoren aus
  `material-geometrie-ohne-farbe.md` §2) sind nicht getestet.
- **Erledigt seit der ersten Fassung:** regions-aggregierte LBP-Histogramme sind implementiert
  und getestet (§4b) — sowohl als laufender Mittelwert (kein klarer Vorteil) als auch als
  eingefrorener Anker (73,0 % rein, bestes Ergebnis der Session). `anchorSize`/
  `textureThreshold` sind nur grob gerastert (5/20/50 × 0,9/1,1/1,265) durchsucht, keine
  systematische Optimierung.
- **Erledigt:** eingefrorener Anker für VP-Snap getestet (§4c) — hilft (33,7 %→39,4 % in
  Fusion), aber deutlich schwächer als bei LBP. Kombination beider eingefrorener Anker
  (§4c) erreicht 74,5 %, das beste Ergebnis der Serie.
- Warum der eingefrorene Anker bei LBP so viel stärker wirkt als bei VP, ist nur qualitativ
  erklärt (VPs 90°-Zellen bleiben grob, auch wenn die Achse nur einmal statt pro Punkt
  bestimmt wird) — keine direkte Kontaminations-Zähler-Messung (wie oft ist der gefrorene
  Anker selbst schon über eine Kante gewachsen?) für beide Kanäle durchgeführt.
- **Erledigt:** alle drei benannten Mikrotextur-Operatoren getestet (§4e/§4f) — LBP 73,0 %,
  Autokorrelation 65,8 %, Gabor 57,7 % (jeweils mit Farbe+Anker, Ankergröße 5). Das
  Anker-Rezept generalisiert auf alle drei; die Operatoren sind unterschiedlich stark, keiner
  scheitert.
- **Stufe B ist jetzt beantwortet** (§4d, erstmals empirisch statt nur als offene Frage im
  Benchmark-Ladder): Cultivation übersteht Graustufen moderat (−9,2pp mit Textur-Anker),
  aber nur weil Textur den Farbverlust auffängt, nicht weil Geometrie allein reicht.
- Stufen C–K des Benchmark-Ladders bleiben ungetestet. Stufe C (Graustufen, unterschiedliche
  Mikrotexturen) wäre der nächste logische Schritt nach B, mit dieser Fixture aber nicht
  direkt prüfbar (alle Häuserflächen stammen aus demselben Quellbild ohne gezielt
  unterschiedliche Texturen) — bräuchte eine eigens präparierte Testszene.
- Gewichtete Score-Fusion (statt binärem UND) ist nicht getestet — alle Kombinationen hier
  sind harte Konjunktionen.
- **Teilweise adressiert (§4g), zweimal korrigiert (§4h→§4i):** Alle Zahlen gelten weiterhin
  für GENAU EIN Quellbild. Eine Holdout-Kreuzvalidierung INNERHALB dieses Bildes (§4g: 43,8 %
  vs. 38,6 %) zeigt, dass die Schwellenwerte nicht auf einzelne Häuser überangepasst sind.
  §4h testete fälschlich, ob VLG-02s feste Farbwerte auf VLG-04 übertragen (null Treffer) —
  §4i korrigiert die Fragestellung selbst: bild-lokale Größe+Geometrie-Suche ohne jeden
  VLG-02-Bezug findet auf VLG-04 mindestens eine echte, strukturell kohärente Region. Noch
  offen: mehrere Häuser gleichzeitig finden, zugehörige Wandflächen zuordnen, tatsächlich
  bis zur Affine-Solver-Rekonstruktion durchziehen — §4i liefert Regionsfindung, nicht
  vollständige Häuser. Kein Anti-Overfit-Benchmark-Lauf über mehrere Bilder mit vollständiger
  Rekonstruktion wurde durchgeführt.
- Kein Code in `runtime/spatial-kernel/` oder `runtime/shaded-engine.mjs` geändert — alles
  bleibt in `tools/scratch-*`.
- **Neu seit §4v:** Boden-Neigung ist weiterhin unbeantwortet — die in Runde 26 verwendete
  Vergleichsmethode (affine-Solver-Familienachse → angenommene Kamera-Y-Achse) ist widerlegt
  (88,89° statt einer kleinen Neigung), nicht durch eine funktionierende Methode ersetzt. Eine
  echte Tilt-Aussage bräuchte einen Vergleich im SELBEN Koordinatensystem wie die
  Haus-Rekonstruktion selbst (`T`/`scale`), nicht eine neu erfundene Kamerakonvention. Die
  Wand-via-Differenz-Heuristik (Dach-Bbox-Spalte minus Boden/Busch) liefert brauchbaren Recall
  (67–80 % bei 5/6 Häusern), aber schwache Precision (40–80 %) — keine Kantenverfeinerung
  versucht.
