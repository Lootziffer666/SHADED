# Runde 9 – Asset-Pipeline: Requirements

## Einleitung

Runde 8 lieferte die Inspektions-Linsen. Für den Prolog aus "SHADED —
Wenn das 2 ist" fehlt noch: die richtigen Sprites an der richtigen
Stelle, mit den richtigen Animationen, und eigene (nicht die
Original-)Dialoge. Diese Runde liefert die Werkzeugkette dafür, ohne
dass Original-Assets dieses Repository oder diese Session je erreichen
— siehe `docs/round-9-asset-boundary.md` für die genaue Begründung.

## Anforderungen (EARS)

### R1 – Kostüm-Browser (lokal, offline)
Das System **SOLL** ein eigenständiges, offline lauffähiges HTML-Werkzeug
bereitstellen, das eine lokal ausgewählte SCUMM-Ressourcendatei
strukturell zerlegt (LECF/LFLF/COST-Chunk-Walk), pro Kostüm eine
Bildvorschau anzeigt und dem Nutzer erlaubt, jedes Kostüm mit einem
Namen zu versehen. **WÄHREND** das Werkzeug läuft, **SOLL** keine
Netzwerkanfrage stattfinden und keine Datei den Rechner des Nutzers
verlassen. Export **SOLL** ausschließlich `{index, offset, room, name}`
enthalten — keine Pixeldaten.

### R2 – Ehrliche Unsicherheit beim Pixel-Decoder
Der Cel-Pixel-Decoder **SOLL** als experimentell gekennzeichnet sein
(keine autoritative Format-Spezifikation verfügbar). Schlägt die
Dekodierung fehl oder liefert unplausible Werte, **SOLL** das Werkzeug
sichtbar auf einen Fallback-Zustand hinweisen statt still falsche
Pixel zu zeigen; Struktur-/Header-/Palettenfelder bleiben davon
unabhängig zuverlässig.

### R3 – Szenen-Projekt wiederverwenden statt neu bauen
**WENN** benannte Kostüme in einer Szene platziert werden sollen,
**DANN SOLL** das bereits vorhandene `shaded.scene-project/v1`-Format
(`contracts/shaded-scene-project.schema.json`) und die bereits
vorhandene `SceneEditorFacade.loadProject(project, assets)`
(`editor/facade.js`) wiederverwendet werden — keine parallele
Lade-Infrastruktur. `assets.actorFiles[i]` bleiben echte, lokal vom
Nutzer bereitgestellte `File`-Objekte.

### R4 – Label → Projekt-Zusammenbau
Ein Kommandozeilen-Werkzeug **SOLL** aus einem Kostüm-Browser-Export
und einer Platzierungsliste (Label, x, y, scale, anim, depthLayer) ein
gültiges `shaded.scene-project/v1`-Projekt-JSON erzeugen. Es **SOLL**
ausschließlich JSON verarbeiten (keine Bild-/Audiodaten) und bei
unbekannten Labels warnen statt sie stillschweigend zu verwerfen.

### R5 – Verifikation
`tools/verify-costume-browser.js` **SOLL** headless gegen ein rein
synthetisches Fixture prüfen: Kostüm gefunden, Pixel-Vorschau
dekodiert, Label übernommen, Export enthält nur Label-Daten. Die
Kernlogik (`tools/cost-format.mjs`) **SOLL** durch
`tools/test-cost-format.mjs` per Encoder/Decoder-Round-Trip
selbstgetestet sein.

## Explizit außerhalb dieser Runde

- Ein Werkzeug, das aus gelabelten Kostüm-IDs echte Sprite-Sheet-PNGs
  + Manifeste exportiert (das würde reale Pixel schreiben — bleibt
  Sache des Nutzers, mit Werkzeugen wie ScummPacker/DREAMM auf seinem
  eigenen Rechner).
- Die Dialog-/Verb-/Inventar-Engine und die eigentliche Prolog-Szene
  aus dem Skript (Folge-Runde, sobald reale Assets vorliegen).
