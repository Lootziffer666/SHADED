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
kein perspektivischer Fluchtpunkt). Für die 12 Fixtures unten steht diese Messung noch aus
— die Einschätzung ist ein Ausgangshypothese, keine bestätigte Tatsache, und darf nicht
ungeprüft in einen Solver einfließen (gleiche Regel wie im `shaded-reconstruction`-Skill:
"Ist die Skalierung relativ oder metrisch?" / Provenienzpflicht gilt auch für
Projektionsannahmen).

**Quelle der 12 Bilder:** auf `main` am Repo-Root abgelegt (`git show
"origin/main:<Dateiname>"`), commits `c5d47da`..`690b9ae`. Dieser Branch (fortgesetzt von
der village-Cube-Untersuchung) hat sie noch nicht im eigenen Baum — siehe Hinweis am Ende
dieses Dokuments.

---

## 1. Fixture-Tabelle

| ID | Datei (main, Root) | Szenenfamilie | Projektionscharakter (observed) | Himmel? | dominante Ground-Fläche | dominante Baukörper | Wasser? | Raumhülle? |
|---|---|---|---|---|---|---|---|---|
| VLG-01 | `Download - 2026-06-30T103502.860.jpeg` | Village (Sonderfall: 1 verbundener Saalbau) | top-down/isometrisch | nein | Gras + Steinpflaster-Vorplatz | 1 Baukörper, 3 sichtbare Giebel | nein | nein |
| VLG-02 | `Download - 2026-06-30T085846.444.jpeg` | Village | top-down/isometrisch | nein | Gras + Sandweg | 6 Einzelhäuser | nein | nein |
| VLG-03 | `Download - 2026-06-30T085813.619.jpeg` | Village (Establishing Shot) | **abweichend: eher perspektivisch**, Horizont sichtbar | **ja** | Gras + Pflasterweg | mehrere Häuser + 1 Turm, in die Tiefe gestaffelt | nein | nein |
| VLG-04 | `Download (100).jpeg` | Village (Kirschblüten-Variante) | top-down/isometrisch | nein | Gras + Sandweg | ≥3 Häuser, mind. 2 randbeschnitten | nein | nein |
| VLG-05 | `Download (98).jpeg` | Village (degenerierter Fall, N=1) | top-down/isometrisch | nein | Gras + kurzer Steinweg | 1 Turm/Ruine | nein | nein (Außenansicht) |
| TER-01 | `Download - 2026-06-30T090340.899.jpeg` | Open Terrain (Waldpfad) | top-down/isometrisch | nein | Erdpfad + Gras/Moos | keiner | nein | nein |
| TER-02 | `Download - 2026-06-30T090109.776.jpeg` | Open Terrain (Waldpfad, Blüten) | top-down/isometrisch | nein | Erdpfad + Gras | keiner | nein | nein |
| TER-03 | `Download (33).jpeg` | Open Terrain (Schnee/Fels) | top-down/isometrisch | nein | Schnee + Steinpfad | keiner | nein | nein |
| XNG-01 | `Download (96).jpeg` | Crossing/Brücke | eher isometrisch/affin | nein | Sandweg beidseitig + Brückenfläche | Brücke (begehbar) + Felsufer | **ja** (Fluss) | nein |
| INT-01 | `Download - 2026-06-30T103324.836.jpeg` | Interior Cutaway (Taverne) | top-down (Cutaway) | n/a | Steinfliesenboden | Raumhülle, rechteckig, 1 Öffnung | nein | **ja**, regulär |
| INT-02 | `Download - 2026-06-30T101119.768.jpeg` | Interior Cutaway (Schlafzimmer) | top-down (Cutaway) | n/a | Fliesenboden + Teppiche | Raumhülle, unregelmäßiger Grundriss | (Badewanne, s.u.) | **ja**, unregelmäßig |
| CAV-01 | `Download (72).jpeg` | Enclosed Passage (Höhle/Mine) | top-down/isometrisch, organische Wandform | nein | Fels-/Sandboden | Felshülle + künstliche Einbauten | **ja** (2 Becken) | **ja**, mehrfach vernetzt |

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

Daraus ergeben sich **5 minimale Familien**, aufsteigend nach Primitiv-Komplexität:

1. **Open Terrain** — `Ground + Hindernisse(punktuell) + Pfad`. Kein Baukörper, kein
   Wasser, keine Hülle. (TER-01, TER-02, TER-03)
2. **Settlement / Village** — `Baukörper(N≥1) + Ground + Wegenetz + Nachbarschaft`.
   Fügt gegenüber (1) hinzu: Footprint-Segmentierung pro Baukörper, Wegenetz als
   Verbindungsgraph zwischen Baukörpern statt nur eine Pfadfläche. (VLG-01…05)
3. **Crossing** — `Pfad + nicht-begehbare Fläche(Wasser) + Übergangsbauwerk + Ufer`.
   Fügt gegenüber (1) hinzu: eine explizit NICHT-begehbare Bodenklasse und ein
   Bauwerk, das selbst begehbar ist (anders als Village-Baukörper, die es nicht sind).
   (XNG-01)
4. **Interior Cutaway** — `Hülle(geschlossen) + Boden + Öffnung(en) + optionale
   Möbelhindernisse`. Andere Grundannahme als (2): die Hülle ist von INNEN gesehen
   (Boden + umlaufende Wandgrenze), nicht von außen (Footprint + Dach). (INT-01, INT-02)
5. **Enclosed Passage** — `Hülle(irregulär) + Boden + mehrere vernetzte Öffnungen +
   optional Wasser/Hindernis-Inseln`. Teilt mit (4) die Innensicht, unterscheidet sich
   durch: keine rechteckige Grundform, mehr als eine Passage/Öffnung (Graph statt
   Einzeltür), und eine potenzielle nicht-begehbare Fläche im Inneren. (CAV-01)

Familie (4) und (5) teilen denselben Kern (Hülle+Boden+Öffnung) und könnten später zu
einer Familie mit einem "irregular"-Flag verschmelzen — das jetzt schon zu tun wäre eine
Vorwegnahme, die (2)/(3) genauso treffen würde (auch "begehbar ja/nein" ist im Grunde ein
Flag auf `Ground`). Absichtlich noch nicht zusammengeführt, bis mehr Fixtures pro Familie
zeigen, ob der Unterschied strukturell oder nur graduell ist.

**VLG-03 fällt aus dem Muster:** einziges Fixture mit sichtbarem Himmel und einer
Kameraperspektive, die eher zu einem endlichen Fluchtpunkt passt als zu den übrigen elf
(alle top-down/isometrisch). Das ist kein Ausreißer, der ignoriert werden sollte — es ist
der einzige Datenpunkt im Korpus, der die Village-Familie mit einem ANDEREN
Projektionsmodell kombiniert (echte Perspektive statt affin), und damit der einzige Test
dafür, ob "Village-Rekonstruktion" und "affines Kameramodell" im bisherigen Code
versehentlich verwechselt wurden (die village-Cube-Fixture hat beide Eigenschaften
gleichzeitig, VLG-03 trennt sie).

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

---

## 4. Vorgeschlagener Benchmark-Split

Leitgedanke: jede der 5 Familien braucht mindestens einen Development- und einen
Validation-Fall; die strukturell ungewöhnlichsten/am weitesten von der bisherigen Arbeit
entfernten Fixtures gehören in Holdout, damit sie nicht beiläufig beim Development-Tuning
mitoptimiert werden.

**Development** (regulär angefasst, geeignet zum Aufbau der Grundprimitive):
- VLG-02 — nächstliegender Nachfolger der bereits bearbeiteten village-Cube-Fixture
  (gleiche Familie, andere Bildsprache: Spitzdach statt Flachdach).
- TER-01 — einfachster Open-Terrain-Fall, keine Ambiguität, guter Ausgangspunkt für die
  Ground+Pfad-Extraktion überhaupt erst zu bauen.
- INT-01 — regulärster Interior-Fall (rechteckig, 1 Öffnung), guter Ausgangspunkt für die
  Hülle+Boden+Öffnung-Extraktion.

**Validation** (gleiche Familie, härtere Variante — prüft Generalisierung statt Passung
auf das Development-Fixture):
- VLG-04 — wie VLG-02, aber mit randbeschnittenen Häusern (Analogon zu house5/house6 im
  village-Cube-Fixture) und dichterer Vegetations-Okklusion.
- VLG-01 — Village-Familie, aber EIN verbundener Baukörper mit 3 Giebeln statt N
  getrennter Häuser; prüft, ob die Baukörper-Segmentierung verbundene Dachsegmente
  korrekt als ein Gebäude erkennt statt künstlich zu trennen.
- TER-02 — wie TER-01, andere Vegetations-/Blütenpalette; prüft, ob die Ground+Pfad-
  Erkennung an eine bestimmte Farbpalette gekoppelt wurde.
- INT-02 — Interior-Familie, aber unregelmäßiger Grundriss, höhere Möbeldichte, eine
  kleine Nicht-Boden-Insel (Badewanne); prüft, ob "grobe Möbelhindernisse optional"
  wirklich robust degradiert statt zu brechen.

**Holdout** (selten/nur bei Freigabe-Gates angefasst — bewusst die Fälle, die am
wenigsten wie die bisherige Arbeit aussehen):
- VLG-03 — einziges Fixture mit abweichendem Projektionscharakter (Himmel, eher
  Fluchtpunkt-Perspektive); Freigabe-Test dafür, dass Projektionserkennung nicht
  stillschweigend "immer affin" annimmt, nur weil bisher jedes Village-Fixture affin war.
- XNG-01 — führt eine im bisherigen Code nicht vorhandene Bodenklasse ein
  (nicht-begehbares Wasser) und ein selbst begehbares Bauwerk; strukturell am weitesten
  von "Baukörper stehen auf Boden" entfernt.
- CAV-01 — strukturell ungewöhnlichstes Fixture im ganzen Korpus: irreguläre Hülle,
  Mehrfach-Passage-Graph, interne Wasser-Inseln, künstliche Einbauten in einer sonst
  natürlichen Höhle.
- VLG-05 — der degenerierte N=1-Fall der Village-Familie; Freigabe-Test dafür, dass die
  Familie bei einem einzigen Gebäude nicht bricht oder eine "Nachbarschaft" erfindet, wo
  keine ist.
- TER-03 — Open-Terrain-Familie mit Schnee/Fels statt Wald/Erde; Freigabe-Test dafür,
  dass Ground+Pfad-Erkennung nicht implizit "grün = begehbar" gelernt hat.

---

## 5. Ausdrücklich außerhalb dieses Dokuments

- Keine Solver- oder Extraktionsänderung. Diese Taxonomie beschreibt einen Methodenraum,
  sie optimiert kein einzelnes Bild.
- Keine Aussage darüber, ob die village-Cube-affine-Pipeline (`tools/scratch-village-
  reconstruct-affine.mjs`) auf einer der 5 Familien überhaupt lauffähig ist — sie wurde
  nur gegen die Village-Familie gebaut und dort auch nur gegen EIN Fixture geprüft.
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
