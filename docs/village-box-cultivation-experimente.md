# Village-Box-Segmentierung: Multikanal-Fusions-Experimente

> **Status:** Forschungsnotiz / Experiment-Log, keine verbindliche Architektur, kein Skill.
> Reine `tools/scratch-*`-Experimente auf der Fake-LiDAR-Punktwolke aus der
> village-cube-Rekonstruktion dieser Session. Nichts hier berührt
> `runtime/shaded-engine.mjs`, `analyze()`, `classGrid` oder `runtime/spatial-kernel/` —
> nur `reconstruction.js`s exportierte, reine Hilfsfunktionen werden gelesen, nie verändert.
>
> **Wichtige Einschränkung (s. §4g): ALLE Prozentzahlen in diesem Dokument stammen aus
> EINEM einzigen Quellbild** (der VLG-02-„6-Häuser-Dorf"-Fixture, `file_
> 000000006d188210a9bb1129089a7b29.png`). Die Zahlen sind reale Messungen an dieser einen
> Fixture, keine allgemeingültigen Aussagen über LBP/Gabor/Autokorrelation/VP als Operatoren.
> §4g zeigt eine Holdout-Kreuzvalidierung, die zumindest die Zirkularität der
> Schwellenwertwahl entschärft (Schwellen aus 3 Häusern gelernt, Reinheit an den anderen 3
> gemessen: 43,8 % vs. 38,6 %, moderater statt kollabierender Rückgang) — aber keine
> zweite, unabhängige Bildquelle ersetzt.

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
| **Geometrie + Farbe + Textur + VP (beide eingefrorene Anker)** | **74,5 %** |

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
- **Teilweise adressiert (§4g):** Alle Zahlen gelten weiterhin für GENAU EIN Quellbild.
  Eine Holdout-Kreuzvalidierung INNERHALB dieses Bildes (Schwellen aus 3 Häusern gelernt,
  Reinheit an den anderen 3 gemessen: 43,8 % vs. 38,6 %) zeigt zumindest, dass die
  Schwellenwerte nicht auf einzelne Häuser überangepasst sind. Eine echte zweite,
  unabhängig kalibrierte Bildquelle fehlt weiterhin — kein Anti-Overfit-Benchmark-Lauf
  (Stufe A–K aus `material-geometrie-ohne-farbe.md` §3) über mehrere Bilder wurde
  durchgeführt.
- Kein Code in `runtime/spatial-kernel/` oder `runtime/shaded-engine.mjs` geändert — alles
  bleibt in `tools/scratch-*`.
