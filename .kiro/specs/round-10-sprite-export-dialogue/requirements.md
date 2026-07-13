# Runde 10 – Sprite-Export & Dialog-Engine: Requirements

## Einleitung

Schließt die in Runde 9 offen gelassenen zwei Stücke: ein Werkzeug, das
gelabelte Kostüme zu echten Sprite-Sheets macht, und eine generische
Dialog-Engine, gefüttert mit dem echten Text aus "Wenn das 2 ist".

## Anforderungen (EARS)

### R1 – Sprite-Exporter (lokal, schreibt echte Pixel)
Das System **SOLL** ein offline lauffähiges Werkzeug bereitstellen, das
aus einer lokal ausgewählten Ressourcendatei und einem
Kostüm-Browser-Export (Runde 9) pro Label ein Sprite-Sheet-PNG plus ein
zu `parseActorManifest()` (index.html) kompatibles Manifest-JSON
erzeugt und als ZIP zum Download anbietet. Dies ist bewusst der eine
Schritt, der echte Bilddaten schreibt — er läuft ausschließlich lokal,
nie in dieser Session.

### R2 – Wiederverwendung der ZIP-Grundlage
Der Sprite-Exporter **SOLL** einen eigenständigen, selbstgetesteten
STORE-ZIP-Writer verwenden (`tools/minizip.mjs`), keine externe
Bibliothek (Konsistenz mit "kein Build-Step").

### R3 – Dialog-Engine (motorseitig generisch)
`window.SHADED` **SOLL** eine Dialog-API erhalten
(`dialogue.play/advance/skip/isPlaying/current`), die eine Liste
typisierter "Beats" abspielt: `direction`/`line` (Schreibmaschinen-
Effekt, warten auf Eingabe), `lens`/`sound-emit` (laufen sofort durch,
koppeln an Runde 8 ohne dessen Code zu duplizieren). Die Engine selbst
**SOLL** keinerlei Kenntnis vom tatsächlichen Skriptinhalt haben.

### R4 – Robustheit gegenüber realer Pausierung
**WENN** zwischen zwei Frames viel reale Zeit vergangen ist (Tab im
Hintergrund, langsame Maschine), **DANN SOLL** der Schreibmaschinen-
Effekt NICHT den gesamten verbleibenden Text auf einen Schlag zeigen,
sondern normal weitertippen.

### R5 – Eingabe-Konflikt vermeiden
Die Leertaste **SOLL**, während ein Dialog aktiv ist, ausschließlich
den Dialog vorantreiben — NICHT gleichzeitig den Spieler-Dash aus
Runde 4 auslösen.

### R6 – Echter Inhalt, ehrlich abgegrenzt
`content/prolog-act1.js` **SOLL** den transkribierten Text aus
"SHADED- WENN DAS 2 IST.docx" vom SCHWARZBILD bis zum Ende von
"PFLICHTDIALOG MIT STAN" als Beat-Array enthalten, NICHT automatisch
in `index.html` geladen (Engine bleibt generisch wiederverwendbar).
Explizit nicht in dieser Runde: die echte Interaktionslogik des
Controller-Rätsels (Tastendruck-Zählung als Spielzustand statt
Erzähltext), optionale Stan-Dialoge, Wallys Kartenrätsel, das Finale.

### R7 – Verifikation
`tools/verify-sprite-exporter.js` (synthetisches Fixture, ZIP-Inhalt
über Pythons unabhängigen `zipfile`-Reader geprüft) und
`tools/verify-dialogue.js` (generische Beats, kein echter Skripttext)
**SOLLEN** grün sein. `tools/test-content-lint.mjs` **SOLL** jede
`content/*.js`-Datei strukturell validieren (gültige Typen, keine
leeren Texte, `line` immer mit Sprecher).
