# Execution Plan — nächste Schritte

**Adressat:** eine frische Agenten-Session ohne den Verlauf, aus dem dieser Plan entstand.
**Status:** Stand 2026-09-05, Branch `claude/shaded-readiness-docs-hn0m1e`.

Dieser Plan ist ein Ausführungsdokument, kein Konzeptdokument. Die Konzeptdokumente liegen im
Repo-Wurzelverzeichnis (`WORLD_ARCHITECTURE.md` und Companions) und werden hier **nicht** ersetzt,
erweitert oder umgeschrieben.

---

## 0. Was du wissen musst, bevor du irgendetwas anfasst

1. **Lies `CLAUDE.md`s Abschnitt „Status: two subsystems, one repo" zuerst.** Kurzfassung: Die
   Seite, die ein Browser lädt, ist **Snowflow** (`index.html` → `/src/main.js`, Babylon.js/WebGPU,
   `src/*`). Die `runtime/*.mjs`-Engine ist **geparkt** — real, getestet, dokumentiert, aber von
   `index.html` nicht erreichbar. Änderungen dort erscheinen **nicht** im Browser.
2. **`src/sandbox/*` und `runtime/*` sind getrennte Kopien und driften auseinander.**
   `world-sandbox-reference.mjs` unterscheidet sich seit dem Physics-Slice bewusst zwischen beiden.
   Arbeite an `src/`, wenn es die laufende Welt betrifft. Ändere `runtime/` nur, wenn die Aufgabe
   ausdrücklich das geparkte Subsystem meint.
3. **Alle `tools/test-world-sandbox-*.mjs` außer `test-world-sandbox-physics.mjs` testen die
   geparkte `runtime/`-Kopie, nicht `src/`.** Wer `src/sandbox/*` ändert, hat als einzige
   bestehende Absicherung `tools/test-world-sandbox-physics.mjs`. Neue Tests für `src/` gehören
   dorthin oder in eine neue Datei nach demselben Muster.
4. **`VERIFICATION.md` gilt.** Neue physikalische/mathematische Kernlogik läuft durch Consensus
   (Literatur, adversarisch gefragt), Math Check (SymPy, `tools/math-verify/`) und Context7 (API),
   bevor sie Code wird. Ergebnis wird als `LAW:`/`OPERATOR:`-Block festgehalten. Rein handwerkliche
   Fixes (Task 1) brauchen die Kette nicht — siehe VERIFICATION.md's „Wann die Kette übersprungen
   werden darf".

### Vorbedingungen, einmalig pro Session

```bash
npm install
pip3 install -r tools/requirements-single-view-room.txt   # numpy, Pillow
pip3 install -r tools/requirements-math-verify.txt        # sympy
```

Diese vier Kommandos **müssen vor der ersten Änderung grün sein**. Sind sie es nicht, ist das ein
eigener Befund und wird gemeldet, nicht umgangen:

```bash
npm run check                  # UI-Zero-Guard + gesamte .mjs-Testsuite
npm run verify:physics         # src/physics + src/sandbox-Integration
npm run verify:math            # SymPy-Beweise
npm run verify:2d3d-roundtrip  # Single-View-Metrologie + Roundtrip
```

---

## Task 1 — Albedo-Wertebereich klemmen (Bug, keine Entscheidung nötig)

**Ziel:** Der Terrain-Shader darf keine Albedo > 1.0 bekommen.

**Warum.** `colorForCell()` (`src/sandbox/world-sandbox-cpu-backend.mjs`) klemmt seinen Rückgabewert
nirgends. `sandboxRenderer.js` teilt ihn durch 255 und schreibt ihn in die GBA-Kanäle von
`sandboxTex`; `src/shaders/snow.fragment.wgsl` (~Z. 372) mischt ihn als `albedo` in eine lineare
PBR-Pipeline, in der Fels bei `vec3f(0.055, 0.058, 0.068)` liegt. Gemessene Werte nach `/255`:

| Zustand | raw/255 (R G B) |
|---|---|
| mittlere Düne (`SAND=0.12`) | 0.643 0.442 0.249 |
| **Dünenkamm (`SAND=0.24`, Seed-Maximum)** | **1.043** 0.667 0.329 |
| **Sand-Stamp ×5 (`SAND=0.50`)** | **1.910 1.157** 0.502 |
| **Feuer (`FIRE=1`, `SAND=0.12`)** | **1.250** 0.618 0.155 |
| **Feuer auf Kamm (`FIRE=1`, `SAND=0.5`)** | **1.605** 0.818 0.225 |

Das ist WORLD_ARCHITECTURE.md's offener Punkt 2, und es ist **im Startzustand erreichbar** (der
Seed erzeugt Dünenkämme bis `SAND=0.24`), nicht nur nach exotischer Nutzerinteraktion.

**Dateien:** `src/sandbox/sandboxRenderer.js` (Einspeisepunkt), ggf.
`src/sandbox/world-sandbox-cpu-backend.mjs`.

**Vorgehen.** Klemmen an genau **einer** Stelle, dort wo die Farbe die Anzeige-Domäne verlässt und
Albedo wird — das ist `sandboxRenderer.js`, nicht `colorForCell` selbst (`colorForCell` bedient auch
Debug-Ansichten, deren Werte bewusst überzeichnen dürfen). Kommentiere **warum** dort und nicht in
`colorForCell`.

**DONE, maschinenprüfbar.** Neuer Test in `tools/test-world-sandbox-physics.mjs` (oder eigene
Datei nach demselben Muster, dann in `tools/check-ui-zero.mjs`s `behavior`-Liste eintragen), der
`colorForCell` über einen Sweep realistischer Feldzustände fährt — mindestens die fünf Zeilen oben
plus `WETNESS`, `BIOMASS`, `SNOW`, `ASH` — und behauptet: **kein Kanal der an den Shader gehenden
Albedo liegt außerhalb `[0, 1]`.** Danach:

```bash
npm run check   # muss grün bleiben
```

**Fallstricke.**
- Nicht in `colorForCell` klemmen und dabei die Debug-Modi (`mode 1..7`) mitklemmen.
- Nicht die R-Kanal-Höhe (`tex[i*4]`, Höhendelta in Metern) mitklemmen — das ist keine Farbe.

---

## Task 2 — Transferfunktion und Journey-Ziel · **ENTSCHEIDUNGS-GATE**

**Hier wird nicht geraten. Hier wird gefragt.**

WORLD_ARCHITECTURE.md sagt zu diesem Punkt wörtlich: *„Konvertieren oder lineare Werte
autorisieren."* Beide Wege sind vom Maintainer ausdrücklich offen gelassen. Gemessen ergeben sie
für die mittlere Düne (`SAND=0.12`):

| Weg | Ergebnis (linear R G B) |
|---|---|
| A: `raw/255` unverändert (heutiges Verhalten, nur geklemmt) | 0.643 0.442 0.249 |
| B: `raw/255` → sRGB→linear-Transferfunktion | 0.371 0.164 0.050 |
| **Ziel laut WORLD_ARCHITECTURE.md („Warme Sand-Albedo")** | **0.550 0.320 0.130** |

**Der entscheidende Befund: keiner der beiden Wege trifft das dokumentierte Ziel.** A ist zu hell
und zu wenig gesättigt, B ist deutlich zu dunkel. Das Ziel liegt dazwischen. Das heißt, die
Transferfunktion allein löst es nicht — die Koeffizienten in `colorForCell` (`r = 62 + sand*850`
usw.) müssten mitgezogen werden.

**Deine Aufgabe an diesem Gate:** Die drei Zahlenreihen oben reproduzieren (eigenes Messskript,
nicht diesem Dokument glauben), das Ergebnis melden, und **fragen**, welcher Weg gilt. Erst danach
implementieren. Ein Stil-Ziel ist eine Maintainer-Entscheidung — WORLD_ARCHITECTURE.md: *„Die
Richtung gibt der Nutzer vor."*

**Nicht tun:** eigenmächtig sRGB→linear einbauen und die Sand-Koeffizienten „passend" nachziehen.
Das ändert den Look des gesamten Spiels auf Basis einer Vermutung.

---

## Task 3 — Mehrkörper-Physik (die sicherste echte Arbeit in diesem Plan)

**Ziel:** `src/physics/rigidBody.mjs` von „eine Kugel gegen statisches Heightfield" auf „mehrere
Körper, auch gegeneinander" erweitern.

**Warum jetzt.** Vollständig headless verifizierbar, keine GPU nötig, kein Texturkanal-Problem,
und das Modul hat bereits eine bestehende Testsuite (`tools/test-world-sandbox-physics.mjs`) plus
einen SymPy-Beweis (`tools/math-verify/sphere_terrain_contact_v1.py`).

**Die bereits gefundene Gegenevidenz, die diese Aufgabe definiert.** In `VERIFICATION.md`s
`LAW: sphere_terrain_contact_v1` steht (Consensus, adversarisch gesucht): die einfache
**Ein-Iterations**-Sequential-Impulse-Methode verliert bei Mehrpunkt-/Mehrkörper-Kontakt messbar an
Genauigkeit — Winkelgeschwindigkeit und Energieerhaltung — gegenüber Constraint-basierten
QP-Lösern oder Energy-Tracking-Impulse-Verfahren. Für eine Kugel gegen statisches Terrain war das
irrelevant. **Ab dieser Aufgabe ist es das nicht mehr.** Der Block sagt wörtlich, was dann zu tun
ist: *„entweder mehrfach über Kontakte iterieren (wie Catto/Box2D es tatsächlich tun, nicht nur
einmal wie hier) oder ein Verfahren aus der ETI-Linie prüfen."*

**Vorgehen.**
1. Kugel-gegen-Kugel-Kontakt ergänzen (Penetration = `r1+r2 - |p1-p2|`, Normale = normalisierte
   Verbindungsachse, Impuls mit **beiden** inversen Massen im Nenner — anders als beim statischen
   Terrain, wo nur die Körpermasse zählt). Massen werden damit real, nicht mehr implizit 1.
2. Solver-Iterationen einführen: N Durchläufe über alle Kontakte pro Schritt statt einem.
3. `VERIFICATION.md`-Kette für den neuen Teil: Consensus zur Iterationszahl-Konvergenz,
   SymPy-Beweis für Impulserhaltung, `LAW:`-Block auf `sphere_sphere_contact_v1` erweitern.

**DONE, maschinenprüfbar.** In `tools/test-world-sandbox-physics.mjs`:
- **Impulserhaltung:** zwei Körper, kein Terrain, keine Schwerkraft, frontaler Stoß →
  Gesamtimpuls vor = nach (bis auf Fließkommatoleranz), für `e=0` **und** `e=1`.
- **Energie bei `e=1`:** kinetische Gesamtenergie bleibt erhalten (elastischer Stoß).
- **Energie bei `e<1`:** kinetische Gesamtenergie nimmt ab, nie zu.
- **Iterationszahl wirkt:** ein Stapel von ≥3 Kugeln übereinander auf dem Boden sinkt mit 1
  Iteration messbar tiefer ineinander als mit N — genau die von Consensus benannte Schwäche, als
  Test festgehalten statt als Fußnote.
- Neuer SymPy-Beweis unter `tools/math-verify/`, läuft automatisch über `npm run verify:math`.

```bash
npm run verify:physics && npm run verify:math && npm run check
```

**Fallstricke.**
- Die Restitutions-Schwelle (`restitutionThreshold = |gravityY| * dt * 2`) ist für Kontakt mit
  statischem Terrain unter Schwerkraft hergeleitet. Für Körper-gegen-Körper ohne Schwerkraft ist
  sie nicht automatisch richtig — prüfen, nicht übernehmen.
- Die bestehenden Einkörper-Tests müssen unverändert grün bleiben. Ändert sich ihr Ergebnis, ist
  das eine Regression, kein „jetzt ist es eben genauer".

---

## Task 4 — Schnee-Property-Modell an den `SNOW`-Zustand hängen · **verifikationsbegrenzt**

**Ziel:** WORLD_ARCHITECTURE.md's offener Punkt 4 — SSS, Glints, Wrap-Diffuse und blaue Schatten
sollen nicht Default sein, sondern aus dem `FIELD.SNOW`-Zustand herein-faden.

**Die Randbedingung, die diese Aufgabe größer macht, als sie aussieht.** `sandboxTex` ist eine
einzige `RGBA32F`-Textur (`sandboxRenderer.js`, `RawTexture.CreateRGBATexture`) und **alle vier
Kanäle sind belegt**: R = Höhendelta in Metern, GBA = Farbe. Der `SNOW`-Wert steht dem Shader
derzeit **nicht** als eigener Kanal zur Verfügung — er ist nur in die Farbe eingebacken. Diese
Aufgabe braucht also zuerst eine Entscheidung über einen zweiten Texturkanal bzw. eine zweite
Textur. Wer das übersieht, schreibt Shader-Code gegen Daten, die gar nicht ankommen.

**Verifikationsgrenze, ehrlich benannt.** Der sichtbare Teil dieser Aufgabe ist headless **nicht**
prüfbar. `tools/test-webgpu-shader-compile.mjs` beweist, dass WGSL kompiliert — nicht, dass es
richtig aussieht. Der `shaded-visual-verify`-Skill braucht eine echte GPU. Erwarteter Abschluss
dieser Aufgabe ist deshalb: Code + Kompilierbeweis + **ausdrückliche Bitte an den Maintainer um
visuelle Abnahme**, nicht „sieht gut aus".

---

## Blockiert — Maintainer-Entscheidungen, nicht selbst entscheiden

1. **`DECLARED` als siebte Provenienzklasse.** `tools/single_view_room.py` benutzt
   `MEASURED/RECONSTRUCTED/DECLARED/UNKNOWN`; die kanonische Liste in
   `.claude/skills/shaded-reconstruction/SKILL.md` kennt `MEASURED/OBSERVED/RECONSTRUCTED/
   INFERRED/GENERATED/USER_APPROVED` — ohne `DECLARED`. `DECLARED` meint etwas Eigenes: einen von
   außen vorgegebenen Kalibrierungsanker (bekannte Fliesenkante), nicht gemessen, nicht geschätzt,
   nicht nachträglich bestätigt. Aufnehmen oder anders einordnen? Siehe `OPERATORS.md`,
   `metric_calibrate_v1`, „Offener Punkt".
2. **`CELL_STRIDE` erweitern.** WORLD_KERNEL.md's erster Schritt (Boden/Substrat: `porosity`,
   `organicMatter`, `nutrients`) braucht neue Felder. `CELL_STRIDE = 24` füllt im geparkten
   WGSL-`Cell`-Struct exakt 6 `vec4`s ohne Restpadding — ein 25. Feld ist dort **nicht gratis**.
   Der Live-Pfad (`src/sandbox/`) hat kein WebGPU-Backend, dort wäre es nur ein JS-Stride. Also:
   nur `src/` erweitern (Divergenz vertiefen), beide (geparktes WGSL mitziehen), oder warten?
3. **Task 2's Stil-Gate** (siehe oben).

---

## Was in diesem Plan ausdrücklich NICHT zu tun ist

- **Keine weiteren Konzeptdokumente.** Der Maintainer hat das ausdrücklich gesagt. Befunde gehören
  in bestehende Dokumente (`OPERATORS.md`, `VERIFICATION.md`) oder in die Antwort.
- **Kein Umbenennen von Feldern.** `FIELD.WETNESS` = Bodenwassergehalt, `FIELD.WATER` =
  Oberflächenwasser. Das ist geprüft und korrekt getrennt (siehe `OPERATORS.md`,
  „WORLD_LANGUAGE-Audit"). `fields.moisture` im World Surface Graph ist Doku ohne Code — dort
  wurde die Bedeutung festgelegt, aber nichts implementiert.
- **Keine Guards abschwächen, um grün zu werden.** Wird `npm run check` rot, ist das ein Befund.
- **Nichts aus `runtime/*.mjs` löschen.** Geparkt ≠ tot; `tools/verify-no-legacy-ui.mjs` prüft das.
- **Keine visuelle Abnahme behaupten, die ohne GPU nicht stattgefunden hat.**
- **Keine Unsicherheit erfinden.** Ein `± 0.18` ohne Ensemble/Sensitivitätsrechnung dahinter ist
  eine erfundene Zahl mit seriösem Anstrich (`OPERATORS.md`, Einschränkung 3).

---

## Reihenfolge und Begründung

```
Task 1  (klemmen)        klein, sicher, headless beweisbar, echter Bug im Startzustand
   ↓
Task 2  GATE             Stil-Entscheidung — anhalten und fragen
   ↓
Task 3  (Mehrkörper)     vollständig headless beweisbar, bestehende Testsuite, keine GPU
   ↓
Task 4  (Schnee/Shader)  braucht erst Texturkanal-Entscheidung + Maintainer-Auge
```

Task 3 steht bewusst **vor** Task 4: Task 3 lässt sich in einer Session vollständig beweisen,
Task 4 endet zwangsläufig an einer Verifikationsgrenze.
