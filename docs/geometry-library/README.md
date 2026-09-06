# SHADED Geometry Library

Lokal gespiegelte, **wirklich frei verfügbare** Primärquellen für das Geometry/Spatial
Construction-Modul des `shaded-living`-Skills (`.claude/skills/shaded-living/`, vormals
`shaded-geometry`, generalisiert per GOAL_FOUNDATION.md F-0310). Lokal, damit
Recherche in Abschnitt 6/7 der `REFERENCE.md` nicht von Live-Internetzugriff
abhängt und damit tatsächlich aus der Primärquelle gearbeitet wird statt aus
einer Trainingsdaten-Paraphrase.

**Aufnahmekriterium: nachweisbar frei, nicht nur „online auffindbar".** Für
jeden Eintrag unten wurde vor dem Download geprüft, ob es sich um Public
Domain, eine vom Autor selbst freigegebene Fassung, offizielles Open-Access-
Material oder Autoren-Self-Archiving auf der eigenen Institutsseite handelt —
nicht um eine Piraterie-Kopie oder ein Controlled-Digital-Lending-Leihexemplar.
**Bewusst NICHT aufgenommen:** George Stinys *Shape: Talking about Seeing and
Doing* — der MIT-OCW-Kurstext behauptet „accessed for free online" und verlinkt
auf `archive.org/details/shapetalkingabou0000stin`, aber dessen Metadaten
(`access-restricted-item: true`, `shapetalkingabou0000stin_encrypted.pdf`)
zeigen ein Controlled-Digital-Lending-Leihexemplar, kein frei herunterladbares
Werk. Ebenso nicht aufgenommen: Pottmanns Buch *Architectural Geometry*
(Bentley Institute Press, kommerziell) — stattdessen die beiden frei vom
Autor selbst gehosteten Survey-Paper unten, die denselben Stoff kondensiert
abdecken.

## Inhalt

| Werk | Autor·en, Jahr | Status/Lizenz | Quelle | Lokaler Pfad | Seed (REFERENCE.md §7) |
|---|---|---|---|---|---|
| The Algorithmic Beauty of Plants | Prusinkiewicz & Lindenmayer, 1990 | vom Autor selbst frei veröffentlicht (algorithmicbotany.org) | [algorithmicbotany.org/papers](https://algorithmicbotany.org/papers/#abop) | `algorithmic-beauty-of-plants/algorithmic-beauty-of-plants-1990.pdf` | Erweiterungskandidat → jetzt lokal, bei Vegetation/Wachstum-Failure |
| Procedural Content Generation in Games (alle 12 Kapitel + Preface + Interviews) | Shaker, Togelius & Nelson, 2016 | „final authors' versions" der Autoren selbst frei veröffentlicht (pcgbook.com) | [pcgbook.com](https://pcgbook.com/) | `procedural-content-generation-in-games/*.pdf` | jetzt SEED 6 (vorher Erweiterungskandidat — vom Maintainer als „fast Pflicht" markiert, Kapitel 4) |
| Geometric Disciplines and Architecture Skills: Reciprocal Methodologies (4.105, Fall 2012) — Exercise 1 + Lecture 2 | MIT OCW / Brandon Clifford | CC BY-NC-SA 4.0 | [MIT OCW 4.105](https://ocw.mit.edu/courses/4-105-geometric-disciplines-and-architecture-skills-reciprocal-methodologies-fall-2012/) | `mit-ocw-4105-geometric-disciplines/` | SEED 1 |
| Introduction to Shape Grammars I (4.540, Fall 2018) — Introductory Lecture Slides | MIT OCW / George Stiny | CC BY-NC-SA 4.0 | [MIT OCW 4.540](https://ocw.mit.edu/courses/4-540-introduction-to-shape-grammars-i-fall-2018/) | `mit-ocw-4540-shape-grammars/introductory-lecture-slides.pdf` | SEED 3 (Ersatz für das nicht verfügbare Buch, s. o.) |
| Pattern Design: A Book for Students … | Lewis F. Day, 1903 | Public Domain (`NOT_IN_COPYRIGHT`, Autor † 1910) | [archive.org](https://archive.org/details/patterndesignboo00dayl) | `pattern-design-day-1903/pattern-design-day-1903.pdf` | SEED 4 |
| Architectural Geometry (Survey) | Pottmann, Eigensatz, Vaxman & Wallner | Autoren-Self-Archiving auf eigener Institutsseite | [geometrie.tugraz.at/wallner/survey.pdf](https://www.geometrie.tugraz.at/wallner/survey.pdf) | `pottmann-architectural-geometry-survey/pottmann-eigensatz-vaxman-wallner-architectural-geometry-survey.pdf` | SEED 2 (Ersatz für das kommerzielle Buch) |
| Geometry and Freeform Architecture | Pottmann & Wallner, 2016 | Autoren-Self-Archiving auf eigener Institutsseite | [geometrie.tuwien.ac.at](https://www.geometrie.tuwien.ac.at/geom/ig/publications/2016/matharch2016/matharch.pdf) | `pottmann-architectural-geometry-survey/pottmann-wallner-geometry-and-freeform-architecture-2016.pdf` | SEED 2 (ergänzend) |
| A Text Book of Geometrical Drawing | William Minifie, 1867 | Public Domain (`NOT_IN_COPYRIGHT`) | [archive.org](https://archive.org/details/textbookofgeomet00minirich) | `geometrical-drawing-minifie-1867/geometrical-drawing-minifie-1867.pdf` | Erweiterungskandidat (deskriptive Geometrie/Projektion, Grundlagentext) |
| Rules and Examples of Perspective proper for Painters and Architects | Andrea Pozzo, 1707 (Project-Gutenberg-Ausgabe) | Public Domain (`NOT_IN_COPYRIGHT`) | [Project Gutenberg #56312](https://www.gutenberg.org/ebooks/56312) via archive.org | `pozzo-rules-examples-perspective-1707/` (`.epub` mit Tafeln + `.txt`) | Erweiterungskandidat (Abschnitt 4/7: Perspektive als Werkzeug) |
| Perspectiva Corporum Regularium | Wenzel Jamnitzer, 1568 | Public Domain (`NOT_IN_COPYRIGHT`) | [archive.org](https://archive.org/details/gri_33125012889602) | `perspectiva-corporum-regularium-jamnitzer-1568/perspectiva-corporum-regularium-1568.pdf` | Erweiterungskandidat (Formtransformation/Polyeder als Bildquelle) |

## Lizenzhinweise (mirror Integrationsregel aus `shaded-reconstruction`)

- **Public Domain** (Day, Minifie, Pozzo, Jamnitzer): keine Einschränkung,
  uneingeschränkt weiterverwendbar.
- **Autoren-Self-Archiving** (Prusinkiewicz/Lindenmayer, PCG-Buch, Pottmann-
  Survey-Paper): von den Autoren selbst auf eigener/institutioneller Seite
  frei veröffentlicht, für Lese-/Referenzzwecke unproblematisch; für jede
  Weiterverbreitung außerhalb dieses Referenzzwecks Originalquelle prüfen.
- **CC BY-NC-SA 4.0** (beide MIT-OCW-Kurse): **NonCommercial**-Klausel
  beachten — Nutzung hier ist nicht-kommerzielle Referenz/Bildung innerhalb
  des Skills. Bei jeder Ableitung: Attribution, Share-Alike, keine kommerzielle
  Nutzung ohne gesonderte Klärung.
- **Ausdrücklich nicht gespiegelt** (Copyright/CDL-geschützt): Stiny *Shape*,
  Pottmann *Architectural Geometry* (Buch), Tedeschi *AAD*, Iwamoto *Digital
  Fabrications*, Müller et al. CGA-Shape-Grammar-Paper (ACM-Paywall), Gips
  *Shape Grammars and their Uses*, *Advances in Architectural Geometry*-
  Proceedings, Matte-Painting/VFX/Set-Design-Literatur. Diese bleiben in
  `REFERENCE.md` §7 als Verweise mit Fundstelle, ohne lokale Kopie — entweder
  weil kein legaler freier Volltext gefunden wurde, oder weil (wie bei Stiny)
  der einzige „freie" Zugang tatsächlich ein Leihzugang ist.

## Wachstumsregel

Diese Bibliothek wächst wie `RULES.md`: das Seed-Set oben ist bewusst klein.
Ein neues Werk kommt erst dazu, wenn `REFERENCE.md` Abschnitt 6 (Failure-
Driven-Growth-Loop) oder Abschnitt 7 es konkret verlangt — UND wenn dabei
dieselbe Sorgfalt wie oben angewendet wird: Lizenz/Access-Status vor dem
Download prüfen (bei archive.org z. B. `curl .../metadata/<id>` auf
`access-restricted-item` und `possible-copyright-status` prüfen), nicht
einfach den ersten Treffer spiegeln.
