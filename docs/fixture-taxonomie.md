# SHADED Struktur-Taxonomie — Geometrie, nicht Szenenerkennung

> **Status:** Forschungsnotiz / Referenz, keine verbindliche Architektur, kein Skill.
> **Zweck dieses Dokuments:** den vorhandenen Bildkorpus nach geometrischer/topologischer
> Struktur einordnen — **nicht** danach, was ein Mensch in der Szene erkennt — und daraus
> die minimalen Rekonstruktions-Strukturklassen ableiten, **bevor** an irgendeinem Solver
> weiter optimiert wird. Kein Bild hier ist "das Zielbild".

## 0. Korrektur: dieses Dokument war selbst am falschen Maßstab sortiert

Die erste Fassung organisierte die Fixture-Tabelle über eine Spalte "Szenenfamilie":
Village, Ruin, Interior, Cave, Bridge, Terrain. Das ist eine Einordnung danach, was ein
Mensch in der Szene *erkennt* — und genau das darf SHADEDs Rekonstruktion laut Maintainer
nicht tun: *"Shaded muss völlig egal sein, was es rekonstruiert."* Es geht um Geometrie,
nicht um Dorf-Erkennung, Haus-Erkennung oder Baum-Erkennung.

Die vorher schon bearbeitete village-Cube-Pipeline
(`tools/scratch-village-reconstruct-affine.mjs`) verletzt diese Regel tatsächlich NICHT —
sie weiß nichts von "Häusern", nur von: einer Silhouette mit 6 Ecken, die in ein festes
kombinatorisches Muster aus 3 Kantenrichtungsfamilien fällt (die Hexagon-Box-Signatur).
Dieselbe Rekonstruktion liefe identisch auf 6 Frachtkisten oder 6 Grabsteinen. **Der
Fehler steckte nur in diesem Dokument selbst**, nicht im bisher gebauten Solver-Code: die
Tabelle machte "Szenenfamilie" zur primären Spalte und lud damit ein, künftige
Klassifikationslogik an Szenenerkennung statt an gemessene Struktur zu koppeln.

Zwei Ebenen der Korrektur:

1. **Dieses Dokument** (unten): Primärachse ist jetzt eine rein geometrische
   Struktursignatur, berechnet aus Silhouettenform, Hüllentopologie, Bodentopologie und
   Objekt-Adjazenz — nichts davon braucht einen Namen für das, was die Region "ist".
   Szenennamen (Dorf, Ruine, Höhle, …) bleiben nur als menschenlesbare Mnemonics in
   Klammern, ausdrücklich NICHT Teil der Klassifikation.
2. **Der Extraktor** (`tools/scratch-village-extract-v2.mjs`, offene Frage, s. Ende): Der
   ist tatsächlich noch szenen-/paletten-spezifisch (feste `roof`/`wallLight`/`wallDark`-
   Farbtoleranzen). Das ist ein zweiter, tieferer Fall desselben Problems — aber ein
   größerer Umbau, der eine eigene Entscheidung braucht, s. §6.

---

## 1. Geometrisches Primitiv-Vokabular

Vier Achsen, jede für sich aus einer Region oder einem Regionen-Graphen messbar, ohne
irgendeine Farbe/Klasse zu benennen:

**A. Silhouetten-Signatur** (Form der vereinfachten Randkontur einer Region):

- `blob` — kein verlässliches Geradenkanten-Muster (organisch: Baumkrone, Busch, Pfütze).
  Kein Kandidat für starre 3D-Rekonstruktion, bestenfalls 2D-Decal/Punkt-Hindernis.
- `linienförmig` — dünn, lang gestreckt, ggf. verzweigend, kein geschlossenes Inneres
  (Pfad-Mittellinie, Mauerfragment, Riss). 1D-Kurven-/Band-Primitiv.
- `planar-quad` — 4 dominante Geradenkanten, näherungsweise konvex. Eine einzelne
  ebene Fläche.
- `polyedrisch-N` — N-Eck mit Kanten in genau 3 dominanten Richtungsfamilien und
  alternierendem Muster (die bereits verwendete Hexagon-Box-Signatur ist der Fall N=6).
  Silhouette eines starren konvexen Polyeders.
- `irregulär-geschlossen` — ein geschlossener Loop aus (halbwegs) geraden Kanten, der
  KEIN kleines-N-Polyeder-Muster trifft. Trotzdem eine geschlossene 2D-Fläche, aber ohne
  angenommenes 3D-Primitiv.

**B. Hüllentopologie der Szene** (schließt irgendeine Menge von Grenzregionen zusammen
eine Innenfläche ein):

- `keine` — nirgends ein geschlossener Grenz-Loop.
- `fragmentiert` — Grenz-/Mauer-artige `linienförmig`-Regionen vorhanden, schließen
  aber keinen Loop.
- `einfach geschlossen` — genau ein geschlossener Loop, K≥1 Öffnungen darin.
- `mehrfach vernetzt` — mehrere über Öffnungen verbundene geschlossene Loops (im
  aktuellen Korpus noch kein Beleg, nächste Stufe nach `einfach geschlossen`).

**C. Bodentopologie** (Zusammenhang der begehbaren Fläche(n), unabhängig vom Materialnamen):

- `eine Fläche` — eine zusammenhängende begehbare Region.
- `eine Fläche mit Inseln` — begehbare Region mit eingebetteten nicht-begehbaren Löchern.
- `getrennte Flächen, gleiche Ebene` — zwei+ begehbare Regionen ohne Bodenkontakt
  zueinander, keine Höhendifferenz erkennbar.
- `getrennte Flächen, verschiedene Ebene` — Höhendiskontinuität (Klippenkante, Treppe,
  hängende Plattform).

**D. Objekt-Adjazenzgraph** (nur für `polyedrisch-N`/`planar-quad`-Regionen): wie viele
solcher Regionen gibt es, und welche Paare sind über eine `linienförmig`-Region (Pfad,
Steg) verbunden.

Diese vier Achsen sind orthogonal zum **Projektionscharakter** (affin/isometrisch vs.
eher perspektivisch mit endlichem Fluchtpunkt) — das bestätigt sich im Korpus direkt:
VLG-03 hat dieselbe Struktursignatur wie VLG-02 (Achse A–D identisch), unterscheidet sich
NUR in der Projektion. Projektion und Struktur dürfen im Solver nie an derselben Stelle
entschieden werden, sonst wiederholt sich genau der Fehler aus der village-Cube-Pipeline
(dort war "Village" zufällig immer affin, und Code hätte das leicht verwechseln können).

---

## 2. Fixture-Tabelle

`ID` und `Mnemonic` sind reine Menschen-Label zum Reden über die Fixtures — keine
Solver-Eingabe. `Strukturklasse` (s. §3) ist die einzige Spalte, die eine
Rekonstruktionsentscheidung tragen dürfte.

| ID | Mnemonic (nicht Teil der Klassifikation) | Strukturklasse | Silhouette(n) | Hülle | Boden | Projektionscharakter (observed) |
|---|---|---|---|---|---|---|
| VLG-01 | "Saalbau" | SC-2 | polyedrisch-N (1 Region, komplexe Mehrfach-Giebel-Kontur) | keine | eine Fläche | top-down/isometrisch |
| VLG-02 | "6-Häuser-Dorf" | SC-2 | polyedrisch-6 ×6 | keine | eine Fläche + Wegenetz | top-down/isometrisch |
| VLG-03 | "Dorf-Establishing-Shot" | SC-2 | polyedrisch-N ×mehrere | keine | eine Fläche + Wegenetz | **abweichend: eher perspektivisch** |
| VLG-04 | "Kirschblüten-Dorf" | SC-2 | polyedrisch-N ×≥3, teils randbeschnitten | keine | eine Fläche + Wegenetz | top-down/isometrisch |
| VLG-05 | "Einzelturm" | SC-2 (N=1) | polyedrisch-N ×1 | keine | eine Fläche | top-down/isometrisch |
| TER-01 | "Waldpfad" | SC-1 | nur blob + linienförmig | keine | eine Fläche | top-down/isometrisch |
| TER-02 | "Waldpfad, Blüten" | SC-1 | nur blob + linienförmig | keine | eine Fläche | top-down/isometrisch |
| TER-03 | "Schneepfad" | SC-1 | nur blob + linienförmig | keine | eine Fläche | top-down/isometrisch |
| XNG-01 | "Steinbrücke" | SC-5 | linienförmig (Übergang) | keine | getrennt, gleiche Ebene, 1 durchgehender Connector | eher isometrisch/affin |
| INT-01 | "Taverne" | SC-4 | irregulär-geschlossen (Hülle, hier: Rechteck) | einfach geschlossen, 1 Öffnung | eine Fläche | top-down (Cutaway) |
| INT-02 | "Schlafzimmer" | SC-4 | irregulär-geschlossen | einfach geschlossen, 1 Öffnung | eine Fläche mit 1 Insel (Wanne) | top-down (Cutaway) |
| CAV-01 | "Höhle/Mine" | SC-4 | irregulär-geschlossen | einfach geschlossen, ≥2 Öffnungen | eine Fläche mit 2 Inseln | top-down/isometrisch |
| RUI-01 | "Torbogen-Ruine" | SC-3 | linienförmig (nicht geschlossen) | fragmentiert | eine Fläche | eher perspektivisch |
| VLG-06 | "Wassermühle" | SC-2 + SC-5 (komposit) | polyedrisch-N ×1 + linienförmig | keine | eine Fläche + getrennt via Trittstein-Inseln | eher perspektivisch |
| ENC-02 | "Brunnen-Ruine" | SC-4, enthält SC-5 (komposit) | irregulär-geschlossen (kreisförmig) | einfach geschlossen, 2 Öffnungen | eine Fläche mit 2 Inseln + 1 Steg-Connector | top-down/isometrisch |
| VRT-01 | "Kran-Klippe" | SC-6 | planar-quad (Plattformen) | keine | getrennt, verschiedene Ebene, mechanischer Connector | eher perspektivisch |
| CAV-02 | "Höhle/Rohre" | SC-4 | irregulär-geschlossen | einfach geschlossen, ≥2 Öffnungen | eine Fläche mit Insel | top-down/isometrisch |

**Himmel (Horizont vs. Öffnung, aus der vorigen Fassung):** bleibt gültig und bleibt eine
eigene, von Struktur UND von Projektion unabhängige dritte Beobachtung. Horizont-Fälle:
VLG-03, RUI-01, VLG-06, VRT-01 (fallen alle auch unter "eher perspektivisch" — dieselben
4). Öffnung-Fälle: ENC-02, CAV-02 (bleiben top-down/isometrisch trotz sichtbarem Himmel).

**Bilder, Quellen, Provenienz** unverändert gegenüber der vorigen Fassung: 12 Fixtures auf
`main` (Repo-Root, Commits `c5d47da`..`690b9ae`, nicht auf diesem Branch), 5 weitere
(RUI-01/VLG-06/ENC-02/VRT-01/CAV-02) nur im Chat gezeigt, nirgends im Repo. Der
Projektionscharakter ist für alle 17 **OBSERVED**, nicht **MEASURED** — für das
village-Cube-Fixture allein wurde er durch echte Kantenwinkel-Messung bestätigt.

---

## 3. Die 6 Strukturklassen (abgeleitet, nicht die alten 7 "Familien")

Reklassifikation nach §1 statt nach Szenenname löst zwei alte Fragen auf einmal — nicht
durch neue Annahmen, sondern weil die alte Aufteilung selbst nie geometrisch begründet war:

- **"Interior Cutaway" und "Enclosed Passage" waren nie zwei Familien.** Beide sind
  `Hülle: einfach geschlossen`. Was vorher als kategorialer Unterschied verkauft wurde
  ("rechteckig" vs. "irregulär", "1 Tür" vs. "mehrere Öffnungen", "keine Wasser-Insel" vs.
  "Wasser-Insel") sind drei GRADUELLE Parameter derselben Struktur (Wand-Regularität,
  Öffnungszahl K, Boden-Inseln-Anzahl) — keine Kategoriegrenze. INT-01, INT-02, CAV-01,
  CAV-02, ENC-02 sind alle SC-4 mit unterschiedlichen Parameterwerten.
- **"Village" war nie durch Häuser definiert.** SC-2 ist "N≥1 Regionen mit geschlossener
  polyedrischer/planarer Silhouette auf einer Bodenebene, optional durch ein Wegenetz
  verbunden" — trifft auf 6 Fachwerkhäuser genauso zu wie auf einen einzelnen Turm
  (VLG-05, N=1) oder auf 6 Frachtkisten in einem Lagerhof, die niemand als "Dorf"
  bezeichnen würde. Die alte "degenerierter N=1-Fall"-Formulierung war schon auf dem
  richtigen Weg, hat es aber nicht zu Ende gedacht: N war nie ein Sonderfall-Parameter,
  N ist einfach eine Zahl, wie jede andere Regionenzahl auch.
- **"Ruin Exterior" bleibt tatsächlich eigenständig** — aber aus einem geometrischen, nicht
  thematischen Grund: `linienförmig` (offene Kantenkette) ist eine andere
  Silhouetten-Signatur als `polyedrisch-N` (geschlossene Kantenkette). Ein Torbogen ist
  keine "kaputte" Version von SC-2, er hat eine andere Randtopologie, die eine andere
  Repräsentation braucht (Sicht-/Bewegungsgrenze statt Footprint-Polygon).
- **"Crossing" bleibt eigenständig**, aus demselben Grund: SC-5 ist über die
  BODENTOPOLOGIE definiert (getrennte Flächen + nicht-begehbares Band + Connector), nicht
  über ein Bauwerk namens "Brücke". Ein Connector kann ein durchgehendes Bauwerk sein
  (XNG-01) oder mehrere disjunkte Trittstein-Inseln (VLG-06) — das ist ein echter
  topologischer Unterschied (ein zusammenhängender Connector vs. mehrere), den die
  Struktursignatur festhalten sollte, keine Geschmacksfrage.

**Die 6 Klassen:**

1. **SC-1 Freie Fläche** — `Silhouette: nur blob/linienförmig`, `Hülle: keine`,
   `Boden: eine Fläche`. (TER-01, TER-02, TER-03)
2. **SC-2 Objekte auf freier Fläche** — `Silhouette: polyedrisch-N/planar-quad ×N≥1`,
   `Hülle: keine`, `Boden: eine Fläche (+ Wegenetz optional)`. (VLG-01, VLG-02, VLG-03,
   VLG-04, VLG-05)
3. **SC-3 Fragmentierte Grenzstruktur** — `Silhouette: linienförmig, nicht geschlossen`,
   `Hülle: fragmentiert`. (RUI-01)
4. **SC-4 Geschlossene Hülle mit Öffnungen** — `Hülle: einfach geschlossen, K≥1
   Öffnungen`, `Boden: eine Fläche (+ 0..M Inseln)`. Parameter: Wand-Regularität
   (rechteckig ↔ irregulär, graduell), K, M. (INT-01, INT-02, CAV-01, CAV-02, ENC-02)
5. **SC-5 Getrennte Flächen über nicht-begehbarem Band** — `Boden: getrennte Flächen,
   gleiche Ebene`, verbunden durch 1 (durchgehend) oder N (disjunkt) begehbare
   Connector-Region(en). (XNG-01 eigenständig; VLG-06 komponiert mit SC-2; ENC-02
   komponiert innerhalb von SC-4)
6. **SC-6 Mehrebenen-Struktur** — `Boden: getrennte Flächen, verschiedene Ebene`,
   Connector ist KEIN Bodenkontakt (mechanisch/Treppe/Sprung). (VRT-01)

**Klassen komponieren, sie partitionieren nicht.** VLG-06 ist SC-2 UND SC-5 gleichzeitig
im selben Regionen-Graphen; ENC-02 ist SC-4, dessen Boden-Teilgraph zusätzlich die SC-5-
Struktur zeigt. Eine Szene bekommt so viele Klassen-Tags, wie ihr Regionen-Graph
Teilstrukturen davon enthält — "die Szene ist EINE Familie" war die falsche Frage.

---

## 4. Vertiefte Fälle — ein Repräsentant pro Strukturklasse

### SC-1 (Freie Fläche) → TER-01

- **Beobachtete Evidenz:** durchgehende helle Fläche zwischen `blob`-Regionen (Bäume,
  Steine), keine `polyedrisch-N`- oder `irregulär-geschlossen`-Region im ganzen Bild.
- **Wahrscheinliche Projektionsfamilie:** top-down/isometrisch (observed) — es gibt kaum
  Geradenkanten, um das zu falsifizieren.
- **Zulässige Rekonstruktionsfamilie:** eine begehbare Bodenfläche + diskrete
  Punkt-Hindernisse aus den `blob`-Regionen. Keine Hülle, kein Objekt-Footprint nötig.
- **Verbotene erfundene Information:** jede Wand- oder Objekt-Footprint-Hypothese (es
  gibt keine geschlossene Region dafür); eine Pfadfortsetzung über den Bildrand hinaus.

### SC-2 (Objekte auf freier Fläche) → VLG-02

- **Beobachtete Evidenz:** 6 `polyedrisch-6`-Regionen mit paarweise unterschiedlicher
  Rotation im Bild, eine `linienförmig`-Region (Wegenetz), die einige, aber nicht alle
  Objekt-Regionen verbindet.
- **Wahrscheinliche Projektionsfamilie:** top-down/isometrisch (observed, ungemessen).
- **Zulässige Rekonstruktionsfamilie:** pro `polyedrisch-N`-Region ein Footprint + grobe
  Höhe, unabhängig von den anderen (keine erzwungene gleiche Größe — 6 Regionen können 6
  verschiedene Maße haben, das ist eine Messung, kein Fehler); Wegenetz als Graph über die
  Regionen, die eine `linienförmig`-Region tatsächlich berührt.
- **Verbotene erfundene Information:** eine feste Größe/Form, die für alle N Regionen
  gilt, nur weil sie zur selben Klasse gehören; ein Innenraum für eine Region, die nur von
  außen sichtbar ist; eine Verbindung zwischen zwei Regionen, die keine `linienförmig`-
  Region tatsächlich berührt.

### SC-3 (Fragmentierte Grenzstruktur) → RUI-01

- **Beobachtete Evidenz:** mehrere `linienförmig`-Regionen (Torbogen, Säulenstümpfe,
  Mauerrest), von denen keine zwei gemeinsam eine Fläche einschließen; dazwischen eine
  durchgehend begehbare Fläche.
- **Wahrscheinliche Projektionsfamilie:** eher perspektivisch (Horizont sichtbar,
  Fassadenhöhe erkennbar) — observed.
- **Zulässige Rekonstruktionsfamilie:** eine durchgehende Bodenfläche (wie SC-1) plus die
  `linienförmig`-Regionen als lineare Sicht-/Bewegungsgrenzen — NICHT als geschlossene
  Footprint-Polygone, weil ihre eigene Randtopologie nicht geschlossen ist.
- **Verbotene erfundene Information:** ein ursprünglicher vollständiger Grundriss, den die
  Fragmente angeblich andeuten; ein Dach; eine Begehbarkeits-Grenze, die aus keiner
  gemessenen Kante folgt.

### SC-4 (Geschlossene Hülle mit Öffnungen) → INT-01

- **Beobachtete Evidenz:** eine `irregulär-geschlossen`-Region (hier: 4 gerade Kanten,
  Sonderfall Rechteck) mit genau einer Lücke in der Kantenkette (Tür).
- **Wahrscheinliche Projektionsfamilie:** top-down-Cutaway — die Frage Fluchtpunkt vs.
  parallel stellt sich anders, weil die Hüllenkanten selbst die Kameraausrichtung
  vorgeben, unabhängig von jeder Interpretation als "Raum".
- **Zulässige Rekonstruktionsfamilie:** Bodenfläche = die eingeschlossene Fläche selbst,
  Wandgrenze = die Hüllenkontur, Öffnung = die Lücke(n) darin, `blob`/`planar-quad`-
  Regionen im Inneren optional als grobe Hindernisboxen.
- **Verbotene erfundene Information:** fotometrisch exakte Geometrie der inneren
  `blob`/`planar-quad`-Regionen; ein zweites Stockwerk oder eine zweite Hülle, die nicht
  gemessen ist.

### SC-5 (Getrennte Flächen über nicht-begehbarem Band) → XNG-01

- **Beobachtete Evidenz:** zwei begehbare Regionen ohne gemeinsame Kante, dazwischen eine
  Region mit klar anderer Textur/Farbe (nicht-begehbar), eine `linienförmig`-Region
  überspannt die Lücke durchgehend und berührt beide Seiten.
- **Wahrscheinliche Projektionsfamilie:** eher isometrisch/affin (observed).
- **Zulässige Rekonstruktionsfamilie:** eine begehbare Hauptkurve (beide Seiten + Connector
  als EIN zusammenhängender Pfad), die nicht-begehbare Region als eigene Bodenklasse mit
  anderer Begehbarkeits-Eigenschaft, keine Sonderrolle für "Brücke" als Objekttyp.
- **Verbotene erfundene Information:** die Unterseite/Statik des Connectors; eine
  Wassertiefe oder Strömungsrichtung der nicht-begehbaren Fläche.

### SC-6 (Mehrebenen-Struktur) → VRT-01

- **Beobachtete Evidenz:** eine begehbare Region endet sichtbar an einer Kante ohne
  Fortsetzung; eine zweite begehbare Region (Plattform) hat ebenfalls keinen Bodenkontakt
  zur ersten, ist aber über eine `linienförmig`-Mechanik (Seilzug) mit ihr verbunden.
- **Wahrscheinliche Projektionsfamilie:** eher perspektivisch (Horizont + entfernte
  Bergketten sichtbar) — observed.
- **Zulässige Rekonstruktionsfamilie:** jede begehbare Region einzeln wie in SC-1/SC-2,
  plus einen expliziten Nicht-Boden-Connector zwischen zwei Regionen unterschiedlicher
  Höhe, statt eine gemeinsame Bodenebene zu erzwingen (die es hier nachweislich nicht
  gibt).
- **Verbotene erfundene Information:** die Tiefe/den Wasserstand der weit entfernten
  nicht-begehbaren Fläche unten; einen dritten, nicht sichtbaren Verbindungsweg zwischen
  den Ebenen.

---

## 5. Vorgeschlagener Benchmark-Split

Unverändert im Prinzip gegenüber der vorigen Fassung (jede Strukturklasse braucht
mindestens einen Development- und, sobald ≥2 Belege vorliegen, einen Validation-Fall; die
strukturell am weitesten entfernten Fixtures gehören in Holdout), nur die Gruppierung
folgt jetzt §3 statt Szenennamen.

**Development:**
- VLG-02 (SC-2) — nächstliegender Nachfolger der bereits bearbeiteten village-Cube-Fixture.
- TER-01 (SC-1) — einfachster Fall, guter Ausgangspunkt für Boden+Pfad-Extraktion.
- INT-01 (SC-4) — regulärster Fall (Rechteck, K=1, M=0), guter Ausgangspunkt für
  Hülle+Boden+Öffnung-Extraktion.
- RUI-01 (SC-3) — einziger Beleg, muss früh angefasst werden, um die
  Linienfragment-Repräsentation überhaupt erst zu bauen.
- VRT-01 (SC-6) — einziger Beleg, aus demselben Grund.

**Validation** (gleiche Strukturklasse, andere Parameterwerte):
- VLG-01 (SC-2, N=1 aber komplexe Mehrfach-Kontur statt N getrennter einfacher Silhouetten).
- TER-02 (SC-1, andere Vegetations-/Farbpalette — prüft Paletten-Unabhängigkeit).
- INT-02 (SC-4, irreguläre Wand, K=1, M=1 — höhere Parameterwerte als INT-01).
- VLG-03 (SC-2, aber Projektionscharakter abweichend — prüft, ob Struktur- und
  Projektionserkennung wirklich unabhängig sind).
- VLG-06 (SC-2+SC-5 komponiert, UND Horizont-Projektion — zweiter Beleg dafür).
- ENC-02 (SC-4 mit eingebettetem SC-5 — prüft, ob Komposition wirklich unabhängig
  implementiert werden kann statt sich gegenseitig auszuschließen).

**Holdout:**
- XNG-01 (SC-5 eigenständig) — führt eine Bodenklasse ein, die in den Development-Fällen
  nicht vorkommt (explizit nicht-begehbar).
- CAV-01 (SC-4, K≥2, M=2, irreguläre Hülle) — höchste Parameterwerte innerhalb SC-4 unter
  den Fixtures mit echtem Repo-Pfad. (CAV-02 als zweiter SC-4-Hochparameter-Beleg in
  Reserve für spätere Validation.)
- VLG-05 (SC-2, N=1) — Freigabe-Test, dass SC-2 bei N=1 nicht bricht oder ein Wegenetz
  erfindet, wo keins ist.
- TER-03 (SC-1, andere Palette: Schnee statt Wald) — wie TER-02, aber als Freigabe-Gate
  statt Validation, da Schnee zusätzlich die Kontrastverhältnisse ändert.
- VLG-04 (SC-2, randbeschnittene Regionen UND dichte `blob`-Okklusion gleichzeitig) —
  kumulierter Schwierigkeitsfall.

---

## Notation-Referenz (kein Fixture)

[`docs/village-site-plan-reference/`](village-site-plan-reference/README.md)
enthält drei eigene, bereits beschriftete Village-Site-Pläne (Gebäude-
Positionsnamen, Maßstabsbalken, bei der deutschen Variante zusätzlich
Erschließungs-/Anschlussvokabular). **Kein Eintrag für die Fixture-Tabelle
oben** — die Lösung steht dort als Text im Bild, das entwertet sie als
Rekonstruktions-Testfall. Wert haben sie als Notation-Referenz für genau die
zwei Dinge, die der Fixture-Tabelle bisher fehlen: eine Positions-
Namenskonvention für mehrere Baukörper in einer Szene, und ein echter
Maßstabsbalken (0/5/10 m) — während die Skalierung der VLG-Fixtures oben laut
Provenienz-Hinweis am Dokumentanfang noch ungemessen ist.

## 5. Ausdrücklich außerhalb dieses Dokuments

**Offene, hier bewusst nicht entschiedene Frage:** `tools/scratch-village-extract-v2.mjs`
klassifiziert Pixel über feste Farbtoleranzen für `roof`/`wallLight`/`wallDark` — das ist
selbst szenen-/paletten-spezifisch und würde auf keiner der anderen 16 Fixtures ohne neue
Handarbeit funktionieren. Das ist derselbe Fehler wie der in diesem Dokument korrigierte,
nur eine Ebene tiefer (Pixelklassifikation statt Bild-Klassifikation) und ein deutlich
größerer Umbau (echter Code, nicht nur ein Dokument). Ob und wann das angegangen wird,
ist eine eigene Entscheidung — nicht Teil dieser Taxonomie-Korrektur.

## Hinweis: Bilder noch nicht auf diesem Branch

Die 12 Fixtures liegen auf `main` (Commits `c5d47da`..`690b9ae`), nicht auf
`claude/village-cube-reconstruction-review`.

**Korrektur einer früheren Fehleinschätzung in dieser Zeile:** hier stand vorher, `main`
habe u. a. `docs/synthetic-visual-reverse-engineering.md`,
`runtime/spatial-kernel/cellular-geometry-solver.js`, `runtime/style/production-adapter.js`
und die `shaded-spatial-primitive-solver`-Skill "entfernt". Das war falsch — forensisch
geprüft (`git merge-base --is-ancestor`, Existenzprüfung an `e27558c`): keine dieser
Dateien existierte jemals auf `main`s eigener Linie. Alle wurden erst NACH dem
gemeinsamen Vorfahren `e27558c` erzeugt, und zwar ausschließlich auf diesem
Branch (Commit `227bf4b` für `production-adapter.js`/die Skill/`CLAUDE.md`/
`runtime/shaded-engine.mjs`, `bc5d36d` für `cellular-geometry-solver.js`, `825b808` für
das Dokument) — `main` hat sie nie erhalten, weil dieser Branch nie zurückgemerged wurde,
nicht weil sie dort gelöscht wurden. Nichts davon ist verloren; alles steht unverändert
auf diesem Branch. Wer mit den Bilddateien selbst arbeiten will, braucht vorerst `main`
oder `git show origin/main:<Dateiname>`.

Die 5 Fixtures `RUI-01`/`VLG-06`/`ENC-02`/`VRT-01`/`CAV-02` liegen bislang **nirgends** im
Repo — sie wurden nur im Chat gezeigt, ihre Einträge oben beruhen auf visueller Prüfung
ohne Dateizugriff.
