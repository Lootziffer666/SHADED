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
| 2 | Zusammenhängende Occlusion-/Tiefen-Layer (Connected Components über der Exp.-1-Schicht statt verstreuter Einzelpixel) | Geplant, noch nicht begonnen |
| 3 | Wetterpartikel bekommen `worldZ` aus der Exp.-2-Schicht statt Screen-Space-Bewegung (Aufgabe 2 des Maintainer-Briefings) | Geplant, noch nicht begonnen |
| 4 | Generalisierter (nicht `messehalle.png`-fest verdrahteter) Fluchtpunkt-Detektor, nur falls Exp. 1–3 nicht reichen und das Bild echte Zentralperspektive zeigt | Zurückgestellt, niedrige erwartete Wirkung für SHADEDs isometrische Testbilder |

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
