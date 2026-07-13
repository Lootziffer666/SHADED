# Runde 9 – Asset-Pipeline: Design

## Gesamtfluss

```
Nutzer, lokal, eigene Spieldateien
  │
  ▼
tools/costume-browser.html  (offline, kein Netzwerk)
  – zerlegt COST-Chunks strukturell (getestete Logik aus cost-format.mjs)
  – Pixel-Vorschau: experimentell, klar gekennzeichnet
  – Export: costume-labels.json  { index, offset, room, name }[]   ← NUR Labels
  │
  ▼  (Nutzer, lokal: labelt → exportiert echte Sprite-Sheets, z. B. mit
  │   ScummPacker/DREAMM/eigenem Werkzeug — außerhalb dieser Runde)
  │
  ▼
tools/build-scene-project.mjs costume-labels.json placements.json
  – reine JSON-Zusammenführung, keine Bilddaten
  – Ergebnis: gültiges shaded.scene-project/v1 (contracts/…schema.json)
  │
  ▼
editor/facade.js: SceneEditorFacade.loadProject(project, assets)
  – BEREITS VORHANDEN UND GETESTET (editor/facade.test.js)
  – assets.sceneFile / assets.materialFile / assets.actorFiles[i] =
    echte, vom Nutzer lokal ausgewählte File-Objekte
  – lädt Szene, ruft create()/addActor() – dieselben Pfade, die schon
    seit Runde 1/7 produktiv sind
  │
  ▼
Laufende SHADED-Szene mit den richtigen Sprites an den richtigen
Stellen, richtigen Animationen (project.actors[i].anim) — im Browser
des Nutzers, mit seinen eigenen Dateien.
```

## Warum kein neuer Loader gebaut wurde

`editor/facade.js` löst "echte lokale Dateien in eine Szene laden"
bereits vollständig und wird bereits von `tools/orchestrate.js`
verwendet. `contracts/shaded-scene-project.schema.json` dokumentiert
explizit dieselbe Regel, die diese ganze Konversation über gilt:
*"Image/manifest BYTES are never embedded here … a real loadProject()
call must be given the actual files again out-of-band."* Runde 9 baut
deshalb nur die zwei fehlenden Enden der Kette (Labeln, Zusammenbauen)
statt eine zweite, redundante Lade-Infrastruktur zu duplizieren.

## Kostüm-Browser: warum brute-force statt Offset-Tabelle

Die "richtige" Lösung wäre, die Animations-Offset-Tabelle im
COST-Header exakt zu parsen und darüber gezielt auf Zellen zu
springen. Dafür fehlt eine verlässliche Primärquelle (siehe
`docs/round-9-asset-boundary.md`). Statt eine falsche Tabellen-Semantik
mit falscher Präzision zu behaupten, scannt `scanForCels()` den
Chunk-Rest auf plausible Cel-Header (Maße 2–512px, sauber dekodierbarer
RLE-Strom) und verwirft alles andere. Ehrlicher Kompromiss: robuster
gegenüber der eigenen Unsicherheit, auf Kosten von Präzision bei der
Animations-Gruppierung (die diese Runde bewusst nicht verspricht).

## Kostüm-Browser: Sicherheitsgarantien

- Keine `fetch`/`XMLHttpRequest`/`<img src="http…">` im gesamten Tool
  — nur `URL.createObjectURL()` auf lokal ausgewählte `File`-Objekte
  und `Blob`-Downloads für den Export.
- Export-Payload ist auf `{index, offset, room, name}` begrenzt;
  `verify-costume-browser.js` prüft das (`< 2000 Bytes` für ein
  Einzel-Label-Fixture) als Regressionsschutz gegen versehentliches
  Mitschleppen von Bilddaten.

## Was Runde 10 übernimmt

Sprite-Sheet-Export (Labels → echte PNG+Manifest-Dateien), die
Dialog-Engine mit dem echten Skripttext aus "Wenn das 2 ist", und die
konkrete Platzierung der ersten Szene (Phatt-Island-Anleger).
