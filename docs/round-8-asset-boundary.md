# Runde 8 – Asset-Boundary: Was in die Kalibrierung einfloss

Diese Notiz dokumentiert transparent, was für Runde 8 (Wally-Monokel)
an Drittspiel-Material angefasst wurde, und was ausdrücklich nicht.

## Was passiert ist

Zur Kalibrierung des künftigen Asset-Loaders (Größenordnung: wie viele
Räume/Kostüme/Sounds hat eine typische SCUMM-v5-Installation wirklich)
wurden zwei nutzereigene, legal erworbene Spielkopien einmalig
strukturell inventarisiert — mit demselben Evidence-only-Werkzeug, das
bereits für DECOMPILE/LAB gebaut wurde (`lab-scumm-v5-probe.mjs`:
XOR-0x69-Decode, LECF/RNAM-Chunk-Validierung, reine Zähldaten +
SHA-256-Fingerabdrücke, keine Bild-/Audiodekodierung).

Ablauf: Archive in ein isoliertes Scratch-Verzeichnis außerhalb jedes
Git-Repos geladen → Probe gelaufen → Ergebnis auf die folgenden
Zähldaten reduziert → Archive und alle extrahierten Dateien gelöscht.
Es wurde zu keinem Zeitpunkt etwas davon in dieses oder ein anderes
Repository committet.

| | Räume | Objekte | Skripte (global/lokal) | Sounds | Kostüme | Charsets |
|---|---:|---:|---:|---:|---:|---:|
| The Secret of Monkey Island | 86 | 1.027 | 187 / 389 | 138 | 123 | 5 |
| Monkey Island 2 | 110 | 1.145 | 167 / 612 | 199 | 164 | 8 |

(Deckt sich mit der bereits öffentlich dokumentierten Tabelle in
DECOMPILEs `docs/LAB_INTEGRATION.md` — dieselben Spielkopien.)

Zusätzlich bekannt, aber öffentliches Plattformwissen und nicht aus
den Dateien extrahiert: SCUMM v5 rendert auf einem 320×200-Kanvas.

## Was ausdrücklich nicht passiert ist

- Keine Pixel-, Sprite- oder Rauminhalte wurden dekodiert.
- Keine Audiodaten wurden gelesen, transkribiert oder auch nur in
  Textform beschrieben (auch nicht "welche Noten", "welche Stimmung").
- Keine der beiden ZIP-Dateien, keine extrahierte `.000`/`.001`-Datei
  und keine vollständige Chunk-Dump-JSON wurde committet oder liegt
  noch irgendwo auf Platte.
- `MONKEY2.EXE` sowie `MT32_CONTROL.ROM`/`MT32_PCM.ROM` (Dritthersteller-
  Firmware von Roland) wurden nicht angerührt.

## Konsequenz für den Loader (künftige Runde)

Der Sprite-/Raum-/Audio-Loader wird manifest-getrieben gebaut (wie der
bestehende `addActor`/SWIFT-Bridge-Mechanismus: Bild + selbstbeschreibendes
Manifest), nicht mit hartcodierten Dimensionen. Die Original-Assets
selbst lädt zur Laufzeit ausschließlich die Person, die SHADED lokal
ausführt, aus ihrer eigenen, legal erworbenen Kopie — nie dieses Repo.
