# Runde 8 – Wally-Monokel: Inspektions-Linsen: Requirements

## Einleitung

Owner-Vorlage: ein Prolog-Skript ("SHADED – Wenn das 2 ist", `SHADED-
WENN DAS 2 IST.docx`), das SHADEDs Weltgesetz-Katalog (`docs/vision-
weltgesetze.md`) als spielbare Mechanik nutzt — Wallys Fünf-Linsen-
Monokel. Jede Linse hebt EIN Weltgesetz isoliert hervor, der Rest des
Bildes tritt zurück. Das Skript bindet die Linsenwahl an Stans
"Individual Burial Matrix-Controller" (Tasten 1–5) und löst das
Finger-Rätsel auf die Zahl 4 — die Linse, die keine isolierte Ansicht
zeigt, weil sie *das bereits fertige, voll komponierte Bild* ist
("Sie ordnet die verschiedenen Zustände zu einer konsistenten Welt").

**Abgrenzung (wichtig):** Diese Runde liefert die Render-Mechanik der
Linsen und ein neues Weltgesetz-Primitiv (#7 Klang). Sie liefert NICHT
die Dialog-/Verb-/Inventar-Schicht des Prologs (Guybrush, Stan, Wally
als Figuren, das Sarg-Rätsel, das Elf-Karten-Rätsel) — das ist Stoff
für eine eigene Folge-Runde, sobald ein Loader für nutzereigene
Figuren-/Raum-Assets steht (siehe Boundary unten).

## Asset-Boundary (bindend, siehe auch LAB_INTEGRATION.md / docs/round-8-asset-boundary.md)

Es werden keine Originalgrafiken, -sounds oder sonstigen Ressourcen aus
Drittspielen in dieses Repository übernommen. Alle Linsen arbeiten auf
SHADEDs eigener Analyse (`classGrid`, Trail-Textur, Weltgesetz-
Uniforms) und auf vom Nutzer lokal bereitgestellten Referenzbildern.
Eine technische Inventur (Ressourcen-Zähldaten, Formate, Hashes — keine
Pixel-/Audioinhalte) von Nutzer-eigenen SCUMM-Kopien darf zur
Kalibrierung dienen (siehe `docs/round-8-asset-boundary.md`); ihre
Rohdateien werden dabei nie committet oder dauerhaft gespeichert.

## Anforderungen (EARS)

### R1 – Linsen-Zustand
Das System **SOLL** einen globalen Linsen-Zustand `0..5` führen (0 =
aus / Normalbild). **WENN** der Nutzer Taste `1`–`5` drückt, **DANN
SOLL** die entsprechende Linse aktiviert werden; erneutes Drücken
derselben Taste schaltet sie wieder aus (Stans Controller: "Klak.").
API: `SHADED.lens.set(n)`, `SHADED.lens.get()`.

### R2 – Isolierte Darstellung
**WÄHREND** eine Linse aktiv ist, **SOLL** der Shader das Bild auf
einen gedimmten Materialgrund reduzieren und NUR das Merkmal der
aktiven Linse hervorheben — kein anderer Weltzustand darf sichtbar
mit hineinmischen:
1. Schmutz/Abnutzung/Fußspuren (Trail-B-Kanal + `u_touchWear`)
2. Belastung/Druck (`u_pressureDim`, Weltgesetz #4)
3. Klang als sichtbare Wellen (neues Wellenfeld, Weltgesetz #7)
4. Materialtreue — unverändertes Normalbild (bewusst keine Isolation)
5. Kanten — Gradient der Materialmasken, keine Farb-/Texturinformation

### R3 – Klang-Wellenfeld (neues Weltgesetz-Primitiv #7)
Das System **SOLL** ein eigenständiges, transientes Wellenfeld führen
(eigene Textur-Unit, eigener CPU-Puffer — nicht die Trail-Textur
überladen, deren 4 Kanäle bereits belegt sind). **WENN**
`SHADED.sound.emit(u, v, strength)` aufgerufen wird, **DANN SOLL** ein
Wellen-Stempel an dieser Position abgelegt werden, der mit einer
Halbwertszeit von ~0.35 s abklingt (Klang ist per Definition
transient). Dieses Primitiv ist bewusst UI-/Dialog-unabhängig: eine
künftige Dialog-Engine kann es bei Story-Beats auslösen (z. B. "eine
passende Beleidigung stampft die Klanggeometrie"), ohne dass diese
Runde die Dialog-Logik selbst bauen muss.

### R4 – Keine Regression im Normalbetrieb
**WÄHREND** keine Linse aktiv ist (Zustand 0), **SOLL** das Rendering
pixelgleich zum bisherigen Verhalten bleiben (Kino-Modus-Versprechen
aus Runde 1–7 bleibt unangetastet). Bestehende Regressionstests
(`tools/verify.js`, `verify-actors.js`, `verify-editor.js`) **SOLLEN**
unverändert grün bleiben.

### R5 – Verifikation
`tools/verify-lenses.js` **SOLL** headless prüfen: API-Oberfläche
vorhanden; Linsen 1/2/3/5 verändern das Bild sichtbar, Linse 4 NICHT
(Toleranzband); `sound.emit()` erzeugt einen messbaren Ausschlag in
Linse 3, der danach abklingt; Tastatur 1–5 schaltet um und toggelt;
keine Shader-/Page-Errors.
