# Village-Box-Segmentierung: Multikanal-Fusions-Experimente

> **Status:** Forschungsnotiz / Experiment-Log, keine verbindliche Architektur, kein Skill.
> Reine `tools/scratch-*`-Experimente auf der Fake-LiDAR-Punktwolke aus der
> village-cube-Rekonstruktion dieser Session. Nichts hier berührt
> `runtime/shaded-engine.mjs`, `analyze()`, `classGrid` oder `runtime/spatial-kernel/` —
> nur `reconstruction.js`s exportierte, reine Hilfsfunktionen werden gelesen, nie verändert.

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
| **Geometrie + Farbe + Textur** | **35,4 %** |

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

Beide Muster sind eher Implementierungsfragen als Kanal-Eigenschaften — ein zukünftiger Lauf
mit margin-bewusstem VP-Snap und regions-aggregiertem LBP (statt Punktpaar-Vergleich) sollte
beide Kanäle deutlich stärker machen, ohne die Kanäle selbst zu ändern.

## 6. Ausdrücklich offen

- Gabor und 2D-Autokorrelation (die anderen zwei Mikrotextur-Operatoren aus
  `material-geometrie-ohne-farbe.md` §2) sind nicht getestet.
- Region-aggregierte LBP-Histogramme (statt Punktpaar-Vergleich) sind nicht implementiert —
  der naheliegendste nächste Schritt laut §4/§5 hier.
- Margin-bewusstes VP-Snapping (Punkte nahe einer Zellgrenze als ambig markieren) ist nicht
  implementiert.
- Gewichtete Score-Fusion (statt binärem UND) ist nicht getestet — alle Kombinationen hier
  sind harte Konjunktionen.
- Alle Zahlen gelten für GENAU diese eine synthetische Punktwolke aus 6 Häusern; kein
  Anti-Overfit-Benchmark-Lauf (Stufe A–K aus `material-geometrie-ohne-farbe.md` §3) wurde
  durchgeführt.
- Kein Code in `runtime/spatial-kernel/` oder `runtime/shaded-engine.mjs` geändert — alles
  bleibt in `tools/scratch-*`.
