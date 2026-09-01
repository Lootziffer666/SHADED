# SHADED Fixture-Taxonomie — Methodenraum statt Einzelbild

> **Status:** Forschungsnotiz / Referenz, keine verbindliche Architektur, kein Skill.
> **Zweck dieses Dokuments:** den vorhandenen Bildkorpus strukturiert einordnen und daraus
> die minimalen Rekonstruktionsfamilien ableiten, **bevor** an irgendeinem Solver weiter
> optimiert wird. Kein Bild hier ist "das Zielbild" — das village-Cube-Fixture
> (`file_000000006d188210a9bb1129089a7b29.png`, siehe `tools/scratch-village-reconstruct-
> affine.mjs`) bleibt EIN Datenpunkt unter vielen, nicht der Maßstab für "fertig".

**Scope-Abgrenzung:** Diese Taxonomie deckt SHADEDs Einzelbild-Rekonstruktion ab
(`shaded-reconstruction`-Skill, Single-View-Metrologie/MonocularDepthProvider-
Entscheidungsbaum). Sie deckt **nicht** BEUTELTIER ab (Mehransicht-Rekonstruktion aus
chaotischem Foto-/Videomaterial, `geodata/beuteltier/facade-photos/` — anderes Problem,
andere Provider-Kette, siehe `docs/reconstruction-provider-und-world-surface-graph.md`).

**Provenienz-Hinweis:** Das Feld *Projektionscharakter* unten ist pro Fixture bislang
**OBSERVED** (visuelle Einschätzung anhand des Bildes), nicht **MEASURED**. Für das
village-Cube-Fixture wurde diese Einschätzung durch echte Kantenwinkel-Messung bestätigt
(Familie "vertikal" bei 89–92° über die volle Bildbreite → affine/isometrische Projektion,
kein perspektivischer Fluchtpunkt). Für die übrigen 17 Fixtures unten steht diese Messung
noch aus — die Einschätzung ist eine Ausgangshypothese, keine bestätigte Tatsache, und
darf nicht ungeprüft in einen Solver einfließen (gleiche Regel wie im
`shaded-reconstruction`-Skill: "Ist die Skalierung relativ oder metrisch?" /
Provenienzpflicht gilt auch für Projektionsannahmen).

**Quelle der Bilder:** 12 liegen auf `main` am Repo-Root (`git show
"origin/main:<Dateiname>"`, commits `c5d47da`..`690b9ae`). 5 weitere (`RUI-01`, `VLG-06`,
`ENC-02`, `VRT-01`, `CAV-02`) wurden per Chat gezeigt und sind bislang nirgends im Repo
abgelegt. Dieser Branch (fortgesetzt von der village-Cube-Untersuchung) hat die 12 noch
nicht im eigenen Baum — siehe Hinweis am Ende dieses Dokuments.

**Korrektur (5 weitere, per Chat gezeigte Bilder):** die erste Fassung dieses Dokuments
nannte VLG-03 den "einzigen" Fixture mit sichtbarem Himmel und wertete das als seltenen
Ausreißer. Das war eine verfrühte Verallgemeinerung aus n=1 und ist so falsch — 4 der 5
neu gezeigten Bilder (RUI-01, VLG-06, ENC-02, VRT-01, CAV-02, siehe §1) zeigen ebenfalls
Himmel. Bei genauerem Hinsehen zerfällt "Himmel sichtbar" aber in zwei strukturell
verschiedene Fälle, die die alte Tabellenspalte fälschlich zusammenwarf:

- **Himmel als Horizont** (RUI-01, VLG-06, VRT-01, wie VLG-03): die Kamera steht flach
  genug, dass Wandflächen/Fassaden in echter Höhe sichtbar sind, nicht nur ihre
  Dachfläche von oben — das ist tatsächlich ein Hinweis auf eine andere
  Projektionsfamilie (eher endlicher Fluchtpunkt als affin/parallel), weil hier
  Vertikalen mit meßbarer Neigung im Bild stehen können.
  → Dieser Fall ist **nicht** selten (jetzt 4 von 17 Fixtures), verdient also reguläre
  Entwicklungs-/Validierungs-Abdeckung statt eines einzelnen Holdout-Tokens (§4 unten
  entsprechend revidiert).
- **Himmel als Öffnung** (ENC-02, CAV-02): die Kamera bleibt steil top-down über dem
  Boden/der Passage, sichtbarer Himmel ist ein tatsächliches Loch in der Decke/Felswand
  der Szene selbst (ein begrenzter, von dunklem Rand umgebener Fleck), kein Horizont der
  Kamera. Das ist **kein** Hinweis auf eine andere Projektionsfamilie — CAV-02 misst
  projektiv wie CAV-01, nur mit einem zusätzlichen Umgebungsdetail.

Kurz: "Himmel sichtbar?" als einzelnes Ja/Nein-Feld war die falsche Auflösung. Die Tabelle
unten führt beide Fälle getrennt.

---

## 1. Fixture-Tabelle

| ID | Datei | Szenenfamilie | Projektionscharakter (observed) | Himmel: Horizont / Öffnung / nein | dominante Ground-Fläche | dominante Baukörper | Wasser? | Raumhülle? |
|---|---|---|---|---|---|---|---|---|
| VLG-01 | `Download - 2026-06-30T103502.860.jpeg` | Village (Sonderfall: 1 verbundener Saalbau) | top-down/isometrisch | nein | Gras + Steinpflaster-Vorplatz | 1 Baukörper, 3 sichtbare Giebel | nein | nein |
| VLG-02 | `Download - 2026-06-30T085846.444.jpeg` | Village | top-down/isometrisch | nein | Gras + Sandweg | 6 Einzelhäuser | nein | nein |
| VLG-03 | `Download - 2026-06-30T085813.619.jpeg` | Village (Establishing Shot) | **abweichend: eher perspektivisch** | **Horizont** | Gras + Pflasterweg | mehrere Häuser + 1 Turm, in die Tiefe gestaffelt | nein | nein |
| VLG-04 | `Download (100).jpeg` | Village (Kirschblüten-Variante) | top-down/isometrisch | nein | Gras + Sandweg | ≥3 Häuser, mind. 2 randbeschnitten | nein | nein |
| VLG-05 | `Download (98).jpeg` | Village (degenerierter Fall, N=1) | top-down/isometrisch | nein | Gras + kurzer Steinweg | 1 Turm/Ruine | nein | nein (Außenansicht) |
| TER-01 | `Download - 2026-06-30T090340.899.jpeg` | Open Terrain (Waldpfad) | top-down/isometrisch | nein | Erdpfad + Gras/Moos | keiner | nein | nein |
| TER-02 | `Download - 2026-06-30T090109.776.jpeg` | Open Terrain (Waldpfad, Blüten) | top-down/isometrisch | nein | Erdpfad + Gras | keiner | nein | nein |
| TER-03 | `Download (33).jpeg` | Open Terrain (Schnee/Fels) | top-down/isometrisch | nein | Schnee + Steinpfad | keiner | nein | nein |
| XNG-01 | `Download (96).jpeg` | Crossing/Brücke | eher isometrisch/affin | nein | Sandweg beidseitig + Brückenfläche | Brücke (begehbar) + Felsufer | **ja** (Fluss) | nein |
| INT-01 | `Download - 2026-06-30T103324.836.jpeg` | Interior Cutaway (Taverne) | top-down (Cutaway) | nein | Steinfliesenboden | Raumhülle, rechteckig, 1 Öffnung | nein | **ja**, regulär |
| INT-02 | `Download - 2026-06-30T101119.768.jpeg` | Interior Cutaway (Schlafzimmer) | top-down (Cutaway) | nein | Fliesenboden + Teppiche | Raumhülle, unregelmäßiger Grundriss | (Badewanne, s.u.) | **ja**, unregelmäßig |
| CAV-01 | `Download (72).jpeg` | Enclosed Passage (Höhle/Mine) | top-down/isometrisch, organische Wandform | nein | Fels-/Sandboden | Felshülle + künstliche Einbauten | **ja** (2 Becken) | **ja**, mehrfach vernetzt |
| RUI-01 | *(Chat, noch nicht hochgeladen)* | **Ruin Exterior** (neu, s. §2) | eher perspektivisch, ähnlich VLG-03 | **Horizont** | Gras + Steinplatten, unregelmäßig | Wandfragmente (Torbogen, Säulen), NICHT geschlossen, kein Dach | nein | nein (Fragmente, keine Hülle) |
| VLG-06 | *(Chat, noch nicht hochgeladen)* | Village (N=1) + Crossing-Variante | eher perspektivisch, ähnlich VLG-03 | **Horizont** | Gras + Sandweg | 1 Fachwerkhaus + Wassermühlrad | **ja** (Bach, mit Trittsteinen — s. §2) | nein |
| ENC-02 | *(Chat, noch nicht hochgeladen)* | Enclosed Passage + Crossing (verschachtelt, s. §2) | top-down/isometrisch | **Öffnung** (Deckenloch, kein Horizont) | Steinboden, kreisförmig | Ruinenmauern, geschlossen, 2 Türöffnungen | **ja** (2 Wasserbecken, Steg dazwischen) | **ja**, regulär (kreisförmig) |
| VRT-01 | *(Chat, noch nicht hochgeladen)* | **Vertical Terrain** (neu, s. §2) | eher perspektivisch, ähnlich VLG-03 | **Horizont** | Steinplattform auf Klippenkante, mehrstufig | Holzkran/Seilzug-Konstruktion + Stollen-Eingang | ja (Fluss/Canyon weit unten, nicht auf Ground-Ebene) | nein |
| CAV-02 | *(Chat, noch nicht hochgeladen)* | Enclosed Passage (wie CAV-01) | top-down/isometrisch, organische Wandform | **Öffnung** (Deckenspalt, kein Horizont) | Fels-/Sandboden | Felshülle + Rohrleitungen | **ja** (Becken) | **ja**, mehrfach vernetzt |

---

## 2. Minimale Rekonstruktionsfamilien (abgeleitet)

Zwei Zusammenlegungen sind bewusst, nicht Bequemlichkeit:

- **TER-01/TER-02/TER-03** unterscheiden sich nur in Material-/Klimapalette (Wald-Erde vs.
  Schnee), nicht in Struktur — alle drei sind *Ground + punktuelle Hindernisse + eine
  begehbare Pfadfläche, kein Baukörper*. Eine eigene "Schneegebiet"-Familie wäre eine
  zweite Wahrheit für dieselbe Rekonstruktionsaufgabe.
- **VLG-05** (ein einzelnes Gebäude) ist keine eigene "Ruine"-Familie, sondern der
  degenerierte Fall N=1 der Village-Familie (*Baukörper + Ground + Zugangsweg*). Eine
  Rekonstruktionsfamilie, die bei N=1 bricht, hätte die Baukörper-Segmentierung ohnehin
  falsch modelliert (implizit N≥2 vorausgesetzt).

Die 5 per Chat gezeigten Bilder (§1, `RUI-01`/`VLG-06`/`ENC-02`/`VRT-01`/`CAV-02`) passen
nicht alle in die ursprünglich 5 Familien — zwei brauchen eine eigene, echte
Primitiv-Kombination, keine bloße Bildstil-Variante:

- **RUI-01** hat Wände, aber sie schließen keinen Raum (Torbogen + freistehende Säulen +
  Mauerreste). Das ist weder Settlement (Baukörper haben ein geschlossenes Footprint-
  Polygon) noch Open Terrain (dort gibt es gar keine Wandstruktur) noch Interior Cutaway
  (dort ist die Hülle geschlossen). Die zulässige Repräsentation ist eine dritte Sache:
  Wandfragmente als LINIEN-Hindernisse/Sichtgrenzen, nicht als Footprint- und nicht als
  Punkt-Hindernis-Geometrie.
- **VRT-01** bricht eine Annahme, die bislang JEDE der 5 Familien stillschweigend
  gemeinsam hatte: eine einzige, zusammenhängende begehbare Bodenebene. Hier gibt es eine
  Klippenkante, eine tiefer liegende Wasserfläche und eine mechanisch (Seilzug)
  erreichbare zweite Ebene — kein Fall von "Ground + X", sondern echte Mehrebenen-Struktur.

Daraus ergeben sich **7 minimale Familien** (5 wie zuvor + 2 neu), aufsteigend nach
Primitiv-Komplexität:

1. **Open Terrain** — `Ground + Hindernisse(punktuell) + Pfad`. Kein Baukörper, kein
   Wasser, keine Hülle. (TER-01, TER-02, TER-03)
2. **Settlement / Village** — `Baukörper(N≥1) + Ground + Wegenetz + Nachbarschaft`.
   Fügt gegenüber (1) hinzu: Footprint-Segmentierung pro Baukörper, Wegenetz als
   Verbindungsgraph zwischen Baukörpern statt nur eine Pfadfläche. (VLG-01…06)
3. **Crossing** — `Pfad + nicht-begehbare Fläche(Wasser) + Übergangsbauwerk + Ufer`.
   Fügt gegenüber (1) hinzu: eine explizit NICHT-begehbare Bodenklasse und ein
   Bauwerk, das selbst begehbar ist (anders als Village-Baukörper, die es nicht sind).
   (XNG-01; VLG-06 kombiniert dies mit Settlement — s. u.)
4. **Interior Cutaway** — `Hülle(geschlossen) + Boden + Öffnung(en) + optionale
   Möbelhindernisse`. Andere Grundannahme als (2): die Hülle ist von INNEN gesehen
   (Boden + umlaufende Wandgrenze), nicht von außen (Footprint + Dach). (INT-01, INT-02)
5. **Enclosed Passage** — `Hülle(irregulär) + Boden + mehrere vernetzte Öffnungen +
   optional Wasser/Hindernis-Inseln`. Teilt mit (4) die Innensicht, unterscheidet sich
   durch: keine rechteckige Grundform, mehr als eine Passage/Öffnung (Graph statt
   Einzeltür), und eine potenzielle nicht-begehbare Fläche im Inneren. (CAV-01, CAV-02,
   ENC-02)
6. **Ruin Exterior** *(neu)* — `Ground + Wandfragmente(nicht geschlossen) + Platz/Pfad`.
   Wände als lineare Sicht-/Bewegungsgrenzen statt als Footprint- oder Punkt-Geometrie;
   kein Dach, keine Innen/Außen-Unterscheidung. (RUI-01)
7. **Vertical Terrain** *(neu)* — `mehrere Ground-Ebenen(unterschiedliche Höhe) +
   mechanischer Verbinder + Randabsturz`. Einzige Familie ohne die sonst überall
   (implizit oder explizit) geltende Annahme einer einzigen zusammenhängenden
   Bodenebene. (VRT-01)

**Familien komponieren, sie sind keine Partition.** ENC-02 (Enclosed Passage) enthält
gleichzeitig ein Crossing-Primitiv (Steg über zwei Wasserbecken) — dieselbe
"nicht-begehbare Fläche + Übergang"-Struktur wie XNG-01, nur INNERHALB einer Hülle statt
im Freien. VLG-06 (Settlement) enthält ebenfalls ein Crossing-Primitiv, aber eine andere
Ausprägung davon: eine FURT aus einzelnen Trittsteinen statt einer durchgehenden
Brückenfläche — mehrere kleine, disjunkte begehbare Inseln statt einer Kurve. Beide
Befunde sprechen dagegen, "Familie" als harte Einbahnstraßen-Klassifikation zu behandeln;
richtiger ist ein Primitiv-Baukasten (Ground, Baukörper, Wegenetz, nicht-begehbare
Fläche, Übergangs-Struktur, Hülle, Wandfragment, Mehrebenen), aus dem sich eine Szene als
Kombination zusammensetzt, und die 7 "Familien" oben sind die im Korpus beobachteten
HÄUFIGEN Kombinationen, keine erschöpfende Taxonomie aller möglichen.

**Himmel-als-Horizont ist kein Einzelfall mehr:** VLG-03, RUI-01, VLG-06 und VRT-01 (4 von
17 Fixtures) zeigen eine Kameraführung, die eher zu einem endlichen Fluchtpunkt passt als
zur sonst durchgängigen top-down/isometrischen Mehrheit. Das bleibt der wichtigste
Einzelbefund dieses Dokuments — nicht weil Himmel selten wäre (er ist es nicht), sondern
weil diese 4 Fixtures die einzigen Datenpunkte sind, an denen sich prüfen lässt, ob
"Village/Ruin/Vertical-Rekonstruktion" und "affines Kameramodell" im bisherigen Code
versehentlich verwechselt wurden (die village-Cube-Fixture, die einzige bisher tatsächlich
bearbeitete, hat zufällig beide Eigenschaften gleichzeitig — affine Projektion UND
Village-Familie). Mit jetzt 4 statt 1 Beispielen ist das kein Holdout-Kuriosum mehr,
sondern verdient eigene Entwicklungs-/Validierungs-Abdeckung (§4 revidiert).

---

## 3. Vertiefte Fälle — ein Repräsentant pro Familie

### Open Terrain → TER-01

- **Beobachtete Evidenz:** durchgehende helle Pfadfläche zwischen Bäumen, punktuelle
  dunkle Objekte (Steine, liegende Äste) auf/neben dem Pfad, keine geraden Kanten, kein
  rechter Winkel im Bild, Waldrand als weicher (nicht harter) Bildabschluss.
- **Wahrscheinliche Projektionsfamilie:** top-down/isometrisch (observed) — keine
  strukturellen Kanten vorhanden, um das überhaupt zu falsifizieren; die Klassifikation
  stützt sich hier fast ausschließlich auf den Bildstil, nicht auf Geometrie.
- **Wahrscheinliche Szenenfamilie:** Open Terrain.
- **Zulässige Rekonstruktionsfamilie:** begehbare Bodenfläche (Pfad-Blob) + diskrete
  Hindernispunkte (Steine/Äste, jeweils als kleine Blockier-Fläche) + keine Hülle, keine
  Baukörper-Segmentierung nötig.
- **Verbotene erfundene Information:** eine implizite Gebäude- oder Wandhypothese (es
  gibt keine); eine Pfadbreite/-fortsetzung über den sichtbaren Bildrand hinaus; eine
  Höhenkarte für den Wald (Baumkronen sind hier Deko, keine begehbare oder kollidierbare
  Struktur, solange nichts anderes gemessen ist).

### Settlement → VLG-02

- **Beobachtete Evidenz:** 6 klar getrennte Dach-Silhouetten (unterschiedliche Rotation
  zueinander — kein gemeinsames Bildschirm-Achsenraster wie beim Cube-Village), ein
  verzweigendes helles Wegenetz, das mehrere, aber nicht alle Häuser sichtbar verbindet.
- **Wahrscheinliche Projektionsfamilie:** top-down/isometrisch (observed, ungemessen).
- **Wahrscheinliche Szenenfamilie:** Settlement/Village.
- **Zulässige Rekonstruktionsfamilie:** Footprint + grobe Höhe pro Haus, Wegenetz als
  Graph (Knoten = Hauszugänge/Kreuzungen, Kanten = sichtbare Pfadsegmente), keine
  erzwungene gemeinsame Bodenebenen-Höhe ohne Prüfung (die village-Cube-Untersuchung hat
  gezeigt, dass diese Annahme selbst evidenzbedürftig ist, nicht automatisch wahr).
- **Verbotene erfundene Information:** eine feste Hausgröße/-form über alle 6 Häuser
  hinweg (sie sind sichtbar unterschiedlich rotiert und potenziell unterschiedlich groß —
  exakt der Fehler, den die perspektivische Village-Pipeline vorher gemacht hat); ein
  Rückgebäude/Innenraum für Häuser, die nur von außen sichtbar sind.

### Crossing → XNG-01

- **Beobachtete Evidenz:** ein einzelnes gewölbtes Steinbauwerk verbindet zwei
  Uferabschnitte, sichtbares fließendes Wasser mit anderer Textur/Farbe als jede
  Bodenklasse, Pfad setzt sich beidseitig jenseits der Brücke fort.
- **Wahrscheinliche Projektionsfamilie:** eher isometrisch/affin (observed) — deckt sich
  mit dem Nutzer-Beispiel.
- **Wahrscheinliche Szenenfamilie:** Crossing.
- **Zulässige Rekonstruktionsfamilie:** eine begehbare Hauptfläche (Pfad + Brücken-
  Oberseite als EINE zusammenhängende begehbare Kurve), Wasser als eigene, explizit
  nicht-begehbare Flächenklasse (kein Hindernis-Blob wie ein Stein, sondern eine
  Bodenklasse mit anderer Begehbarkeits-Eigenschaft), Ufer als seitliche Begrenzung.
- **Verbotene erfundene Information:** exakte Steinzahl/-fugen der Brücke; die
  Brückenunterseite/-statik (nicht sichtbar, keine Notwendigkeit für Begehbarkeit); eine
  Wassertiefe oder Strömungsrichtung (nicht aus einem Einzelbild ableitbar).

### Interior Cutaway → INT-01

- **Beobachtete Evidenz:** vier gerade Wandkanten, ein rechteckiger Grundriss, genau eine
  erkennbare Öffnung (Tür oben), Möbel als klar vom Boden abgesetzte Objekte.
- **Wahrscheinliche Projektionsfamilie:** top-down-Cutaway (Dach/Decke entfernt) — kein
  Vergleich zu einem Außenbild möglich/nötig, die Frage "Fluchtpunkt vs. parallel" stellt
  sich hier anders, da die Wände selbst die Kamera-Ausrichtung vorgeben.
- **Wahrscheinliche Szenenfamilie:** Interior Cutaway.
- **Zulässige Rekonstruktionsfamilie:** Bodenfläche als das Rechteck selbst, Wandgrenze
  als seine 4 Kanten, Türöffnung als Lücke in genau einer Kante, Möbel optional als grobe
  Hindernisboxen (User-Vorgabe: "grobe Möbelhindernisse optional").
- **Verbotene erfundene Information:** fotometrisch exakte Tisch-/Stuhlgeometrie;
  Beleuchtungsquellen-Simulation über das sichtbare Fackellicht hinaus; ein zweites
  Stockwerk oder Keller (nicht sichtbar, nicht impliziert).

### Enclosed Passage → CAV-01

- **Beobachtete Evidenz:** unregelmäßige Felskontur (keine geraden Wandkanten wie
  INT-01), mindestens zwei getrennte dunkle Öffnungen an der rechten Wand (mögliche
  Passagen), zwei farblich abgesetzte Wasserflächen unten links und unten, künstliche
  Einbauten (Rohre, Kiste, Holzplattform) die auf eine erweiterte, nicht rein natürliche
  Höhle hindeuten.
- **Wahrscheinliche Projektionsfamilie:** top-down/isometrisch (observed), aber die
  Wandform selbst liefert hier — anders als bei INT-01 — keine verlässlichen geraden
  Kanten zur Bestätigung.
- **Wahrscheinliche Szenenfamilie:** Enclosed Passage.
- **Zulässige Rekonstruktionsfamilie:** Bodenfläche als unregelmäßiges Polygon (nicht
  Rechteck), Öffnungen als mehrere Graph-Knoten statt einer Tür, Wasser als
  nicht-begehbare Inseln INNERHALB der Hülle (anders als XNG-01, wo Wasser die Fläche
  durchschneidet), Einbauten als Hindernisboxen wie bei INT-01/02.
- **Verbotene erfundene Information:** wohin die Passagen führen (nicht sichtbar — ein
  Knoten "Öffnung, Ziel unbekannt" ist zulässig, ein erfundener Nachbarraum nicht); die
  Funktion der Rohre/Maschinerie; eine Wassertiefe oder ob die Becken verbunden sind.

### Ruin Exterior → RUI-01

- **Beobachtete Evidenz:** ein freistehender Torbogen, mehrere isolierte Säulenstümpfe,
  eine Mauer mit Fensteröffnung weiter hinten — keine zwei Wandsegmente schließen
  gemeinsam eine Fläche ein; dazwischen durchgehend begehbarer Platz/Rasen, kein Dach
  über irgendeinem Teil.
- **Wahrscheinliche Projektionsfamilie:** eher perspektivisch (Horizont sichtbar,
  Fassaden in Höhe erkennbar) — observed, ungemessen, wie VLG-03/VLG-06/VRT-01.
- **Wahrscheinliche Szenenfamilie:** Ruin Exterior.
- **Zulässige Rekonstruktionsfamilie:** eine durchgehende begehbare Bodenfläche
  (Platz/Rasen als EIN Blob, wie bei Open Terrain), plus Wandfragmente als lineare
  Sicht-/ggf. Bewegungsgrenzen (nicht als geschlossene Footprint-Polygone — es gibt
  keinen Innenraum, den ein Footprint sinnvoll umschließen würde).
- **Verbotene erfundene Information:** ein ursprünglicher, vollständiger Gebäudegrundriss
  ("was stand hier früher") — das Bild zeigt Fragmente, keine Rekonstruktionsvorlage; ein
  Dach oder eine Deckenhöhe; eine Begehbarkeits-Einschränkung, die nicht aus den
  sichtbaren Fragmenten selbst folgt (z. B. den ganzen Platz hinter dem Torbogen als
  "separaten Raum" zu behandeln, nur weil ein Torbogen davorsteht).

### Vertical Terrain → VRT-01

- **Beobachtete Evidenz:** eine Steinplattform endet sichtbar an einer Kante, darunter
  eine Wasserfläche mehrere Bildhöhen tiefer; ein hölzerner Kran mit Seilzug verbindet die
  Plattform mit einer hängenden zweiten Fläche, die selbst nicht am Boden aufliegt;
  Treppen und ein Stollen-Eingang auf gleicher Ebene wie die Hauptplattform.
- **Wahrscheinliche Projektionsfamilie:** eher perspektivisch (Horizont + entfernte
  Bergketten sichtbar) — observed, ungemessen.
- **Wahrscheinliche Szenenfamilie:** Vertical Terrain.
- **Zulässige Rekonstruktionsfamilie:** die Hauptplattform als reguläre begehbare Fläche
  (wie jede andere Ground-Fläche), die Wasserfläche unten als eigene, weit entfernte
  nicht-begehbare Ebene (kein Kontakt zur Hauptfläche, anders als bei XNG-01/ENC-02, wo
  Wasser UNMITTELBAR an begehbare Fläche grenzt), die hängende Plattform als zweite,
  über den Kran-Mechanismus (nicht über Boden-Kontinuität) verbundene begehbare Fläche.
- **Verbotene erfundene Information:** die Tiefe der Schlucht oder den Wasserstand unten;
  ob der Kran funktionsfähig ist oder wie viel er trägt; einen dritten, nicht sichtbaren
  Verbindungsweg zwischen den Ebenen, nur weil zwei Ebenen sichtbar sind.

---

## 4. Vorgeschlagener Benchmark-Split

Leitgedanke: jede Familie braucht mindestens einen Development- und einen
Validation-Fall; die strukturell ungewöhnlichsten/am weitesten von der bisherigen Arbeit
entfernten Fixtures gehören in Holdout, damit sie nicht beiläufig beim Development-Tuning
mitoptimiert werden. **Revidiert gegenüber der ersten Fassung:** die Horizont-Projektion
(VLG-03/RUI-01/VLG-06/VRT-01) war dort ein einzelnes Holdout-Token — mit jetzt 4 Belegen
ist sie kein Kuriosum mehr, sondern eine wiederkehrende Projektionsvariante, die reguläre
Validation-Abdeckung verdient (nicht nur Holdout). Die beiden neuen Familien (Ruin
Exterior, Vertical Terrain) haben je nur 1 Beleg — für sie bleibt vorerst nur ein
Development-Fall möglich; Validation folgt, sobald weitere Fixtures dieser Familien
vorliegen.

**Development** (regulär angefasst, geeignet zum Aufbau der Grundprimitive):
- VLG-02 — nächstliegender Nachfolger der bereits bearbeiteten village-Cube-Fixture
  (gleiche Familie, andere Bildsprache: Spitzdach statt Flachdach).
- TER-01 — einfachster Open-Terrain-Fall, keine Ambiguität, guter Ausgangspunkt für die
  Ground+Pfad-Extraktion überhaupt erst zu bauen.
- INT-01 — regulärster Interior-Fall (rechteckig, 1 Öffnung), guter Ausgangspunkt für die
  Hülle+Boden+Öffnung-Extraktion.
- RUI-01 — einziger Beleg für Ruin Exterior; muss früh angefasst werden, um die
  Wandfragment-als-Linie-Repräsentation überhaupt erst zu bauen (kein Validation/Holdout
  möglich, solange es der einzige Beleg ist).
- VRT-01 — einziger Beleg für Vertical Terrain, aus demselben Grund.

**Validation** (gleiche Familie, härtere Variante — prüft Generalisierung statt Passung
auf das Development-Fixture):
- VLG-01 — Village-Familie, aber EIN verbundener Baukörper mit 3 Giebeln statt N
  getrennter Häuser; prüft, ob die Baukörper-Segmentierung verbundene Dachsegmente
  korrekt als ein Gebäude erkennt statt künstlich zu trennen.
- TER-02 — wie TER-01, andere Vegetations-/Blütenpalette; prüft, ob die Ground+Pfad-
  Erkennung an eine bestimmte Farbpalette gekoppelt wurde.
- INT-02 — Interior-Familie, aber unregelmäßiger Grundriss, höhere Möbeldichte, eine
  kleine Nicht-Boden-Insel (Badewanne); prüft, ob "grobe Möbelhindernisse optional"
  wirklich robust degradiert statt zu brechen.
- VLG-03 — Village-Familie, aber mit Horizont-Projektion statt affin; jetzt Validation
  statt Holdout (s. Leitgedanke oben), da die Horizont-Variante mit 4 Belegen kein
  Einzelfall mehr ist. Prüft, ob "Village-Rekonstruktion" fälschlich an "affines
  Kameramodell" gekoppelt wurde.
- VLG-06 — zweiter Horizont-Beleg, UND kombiniert Settlement mit einer Crossing-Variante
  (Trittstein-Furt statt durchgehender Brücke); prüft sowohl Projektionserkennung als
  auch, ob "begehbare Fläche" disjunkte Inseln zulässt statt nur zusammenhängende Blobs.
- ENC-02 — Enclosed Passage mit eingebettetem Crossing-Primitiv (Steg über 2 Becken);
  prüft, ob die beiden Familien wirklich unabhängig komponieren oder sich eine
  Implementierung gegenseitig ausschließt.

**Holdout** (selten/nur bei Freigabe-Gates angefasst — bewusst die Fälle, die am
wenigsten wie die bisherige Arbeit aussehen):
- XNG-01 — führt eine im bisherigen Code nicht vorhandene Bodenklasse ein
  (nicht-begehbares Wasser) und ein selbst begehbares Bauwerk; strukturell am weitesten
  von "Baukörper stehen auf Boden" entfernt.
- CAV-01 — strukturell ungewöhnlichstes Fixture unter den 5-Familien-Fällen: irreguläre
  Hülle, Mehrfach-Passage-Graph, interne Wasser-Inseln, künstliche Einbauten in einer
  sonst natürlichen Höhle. (CAV-02 bleibt als zweiter Beleg für spätere Validation in
  Reserve, sobald Enclosed Passage über den ersten Development-Durchgang hinaus ist.)
- VLG-05 — der degenerierte N=1-Fall der Village-Familie; Freigabe-Test dafür, dass die
  Familie bei einem einzigen Gebäude nicht bricht oder eine "Nachbarschaft" erfindet, wo
  keine ist.
- TER-03 — Open-Terrain-Familie mit Schnee/Fels statt Wald/Erde; Freigabe-Test dafür,
  dass Ground+Pfad-Erkennung nicht implizit "grün = begehbar" gelernt hat.
- VLG-04 — Village-Familie mit randbeschnittenen Häusern UND dichter
  Vegetations-Okklusion gleichzeitig (beide Härtegrade kumuliert, statt wie VLG-01/TER-02/
  INT-02 in Validation je nur eine Achse zu variieren); Freigabe-Test für den kumulierten
  Schwierigkeitsfall.

---

## 5. Ausdrücklich außerhalb dieses Dokuments

- Keine Solver- oder Extraktionsänderung. Diese Taxonomie beschreibt einen Methodenraum,
  sie optimiert kein einzelnes Bild.
- Keine Aussage darüber, ob die village-Cube-affine-Pipeline (`tools/scratch-village-
  reconstruct-affine.mjs`) auf einer der 7 Familien überhaupt lauffähig ist — sie wurde
  nur gegen die Village-Familie gebaut und dort auch nur gegen EIN Fixture geprüft. Für
  die Horizont-Projektionsvariante (VLG-03/RUI-01/VLG-06/VRT-01) ist sogar zu erwarten,
  dass sie NICHT lauffähig ist — die Pipeline geht von einer affinen Kamera aus, das ist
  hier gerade nicht die beobachtete Hypothese.
- Keine Messung der hier nur beobachteten Projektionscharaktere. Bevor eine dieser
  Klassifikationen einen Solver-Zweig auswählt, braucht sie dieselbe Kantenwinkel-Messung,
  die für das village-Cube-Fixture bereits gemacht wurde (siehe Provenienz-Hinweis oben).

## Hinweis: Bilder noch nicht auf diesem Branch

Die 12 Fixtures liegen auf `main` (Commits `c5d47da`..`690b9ae`), nicht auf
`claude/village-cube-reconstruction-review`. `main` hat sich seit dem gemeinsamen
Vorfahren (`e27558c`) unabhängig weiterentwickelt und dabei u. a. `docs/synthetic-visual-
reverse-engineering.md`, `runtime/spatial-kernel/cellular-geometry-solver.js`,
`runtime/style/production-adapter.js` und die `shaded-spatial-primitive-solver`-Skill
entfernt sowie `CLAUDE.md` und `runtime/shaded-engine.mjs` geändert — Änderungen, die
dieser Branch nicht hat und die hier nicht automatisch übernommen wurden (kein Merge
durchgeführt, um diese Untersuchung nicht ungefragt mit einer möglicherweise
unbeabsichtigten Historie auf `main` zu vermischen). Wer mit den Bilddateien selbst
arbeiten will, braucht vorerst `main` oder `git show origin/main:<Dateiname>`.

Die 5 Fixtures `RUI-01`/`VLG-06`/`ENC-02`/`VRT-01`/`CAV-02` liegen bislang **nirgends** im
Repo — sie wurden nur im Chat gezeigt, ihre Taxonomie-Einträge oben beruhen auf visueller
Prüfung ohne Dateizugriff. Sollen sie dauerhaft referenzierbar sein (Dateiname, Pfad,
für spätere Solver-Arbeit gegen echte Pixel statt nur Beschreibung), müssten sie wie die
12 anderen ins Repo hochgeladen werden.
