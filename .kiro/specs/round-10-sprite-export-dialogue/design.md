# Runde 10 – Sprite-Export & Dialog-Engine: Design

## Sprite-Exporter

Wiederverwendet exakt dieselbe LECF/LFLF/COST- und Cel-Decoder-Logik
wie `tools/costume-browser.html` (Runde 9) — Kopie aus denselben
Gründen (kein `file://`-Modul-Import). Neu: Kachelt alle für ein Label
gefundenen Cels in ein Raster-Sheet (`cols=ceil(sqrt(n))`), schreibt
`frameRects` explizit (Manifest-Parser in `index.html` bevorzugt
`frameRects` gegenüber `grid`, siehe `parseActorManifest()`), erzeugt
pro Label EINE Animation (alle gefundenen Cels als Sequenz, `fps:8,
loop:true` — ehrlich, weil eine belastbare Trennung nach echten
Animationen die unsichere Offset-Tabelle bräuchte, siehe Runde-9-
Design). Farben bleiben Platzhalter-Graustufen (siehe
`docs/round-9-asset-boundary.md` — die echte VGA-Palette ist eine
separate, hier nicht angefasste Ressource).

`tools/minizip.mjs`: minimaler STORE-only-ZIP-Writer (keine Kompression
nötig, keine externe Abhängigkeit). Selbstgetestet gegen den
CRC32-Standard-Testvektor UND gegen Pythons unabhängigen
`zipfile`-Reader (`tools/test-minizip.mjs`) — nicht nur intern
konsistent, sondern mit einem echten Fremd-Implementierung geprüft.

## Dialog-Engine

Lebt in `index.html` (wie alle bisherigen Runden — "Alles ist in
index.html", `shader-pipeline.md`), nicht als separates `editor/`-Modul:
`editor/*.js` sind Editor-/Tooling-Fassaden um eine `SceneEditorFacade`,
die Dialog-Engine ist dagegen ein Laufzeit-/Gameplay-System wie Runde
4 (Spieler/Feuer) oder Runde 8 (Linsen).

```
content/prolog-act1.js         (reiner Inhalt, window.SHADED_PROLOG_ACT1)
        │  <script src="content/prolog-act1.js"> — optional, nicht in index.html
        ▼
SHADED.dialogue.play(beats)    (Motor, kennt den Inhalt nicht)
        │
        ▼
dialogueGoto(i) → Trigger-Beats (lens/sound-emit) laufen sofort durch,
                   Text-Beats zeigen Box + Schreibmaschine
        │
        ▼
dialogueTick(dt) — EIN Aufruf pro frame(), NICHT in der
                   Substep-Nachhol-Schleife von tickWorld() (die für
                   Wettersimulation korrekt "nachholt", für einen
                   Schreibmaschinen-Effekt aber zu einer Sofort-
                   Enthüllung nach jeder realen Pause führen würde —
                   von verify-dialogue.js so vorgefunden und gefixt).
```

### Eingabe

Leertaste ist bereits an `dash()` gebunden (Runde 4). Fix: der
bestehende Handler bekommt eine Bedingung `&&dialogueIndex<0` (eine
Zeile), statt einen zweiten Listener zu versuchen, der die Ausführung
des ersten nicht mehr zurücknehmen könnte (Registrierungsreihenfolge
bei `addEventListener`). Klick auf die Dialog-Box UND Leertaste/Enter
lösen `dialogueAdvance()` aus; erster Druck deckt den Restsatz aus
Sicht des Schreibmaschineneffekts sofort auf, zweiter Druck erst geht
zum nächsten Beat — verhindert versehentliches Überspringen.

## Warum Inhalt und Engine getrennt bleiben

SHADED ist laut `product.md` ein generisches Werkzeug ("Weltenbauer,
TTRPG-Spielleiter, Game-Jam-Teams"), kein Monkey-Island-Projekt. Die
Dialog-Engine gehört in den generischen Kern; "Wenn das 2 ist" ist ein
Anwendungsfall davon, kein Teil des Kerns. `content/*.js` ist deshalb
NICHT in `index.html` per `<script>` eingebunden — wer den Prolog will,
lädt ihn explizit.
