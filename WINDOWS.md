# SHADED auf Windows

Kurzfassung. Die große README bleibt technische Referenz.

**Aktueller Stand:** `index.html` bootet inzwischen Snowflow (`/src/main.js`, WebGPU-only) statt
`runtime/shaded-engine.mjs` — siehe `CLAUDE.md` „Status: two subsystems, one repo". Der unten
beschriebene `SHADED_WINDOWS.cmd`-Pfad öffnet `tools/shaded-local-bridge.mjs`, einen reinen
Static-File-Server ohne Bundler; der löst Snowflows `@babylonjs/core`-Paketimporte NICHT auf
(derselbe Grund, aus dem `python3 -m http.server` in der README nicht mehr funktioniert). Für
Snowflow lokal `npm install && npm run dev` verwenden (siehe README-Quickstart). Alles unten in
diesem Abschnitt beschreibt weiterhin korrekt den geparkten `runtime/*.mjs`-Workflow über die
lokale Bridge, nur eben nicht das, was ein Doppelklick auf `SHADED_WINDOWS.cmd` heute tatsächlich
im Browser zeigt.

## Normal benutzen (geparktes Image-to-World-Subsystem)

Auf `architecture/ui-zero-contracts` gibt es absichtlich **keine** authored Editor-Oberfläche mehr
(siehe `docs/UI_ZERO.md`) — der lokale Bridge-Prozess bleibt derselbe, öffnet aber nur noch den
UI-losen Runtime-Host (`index.html`), nicht mehr `editor/` (existiert auf diesem Branch nicht mehr).

1. Repository aktualisieren: `git pull`
2. **`SHADED_WINDOWS.cmd` doppelklicken.**
3. Der Runtime-Host öffnet sich automatisch (schwarzer Canvas, keine sichtbaren Bedienelemente).
4. Interaktion läuft ausschließlich über die dokumentierten Verträge in
   `docs/ENTRYPOINTS_AND_CONTRACTS.md` — z. B. in der Browser-Konsole
   `window.SHADED.loadDemo()` bzw. `window.SHADED.loadImageFile(file)` gefolgt von
   `window.SHADED.erstellen()`. Eine anklickbare Oberfläche dafür existiert auf diesem Branch
   noch nicht; ein künftiger Client ruft dieselben Verträge auf.

Der normale Auto-Pfad für die Tiefenschätzung ist unverändert:

`Depth Anything 3 → Depth Anything V2 → Software`

Es gibt keine Pflicht-Diagnoserunde vor jedem Bild. Der gewählte Provider wird ausgeführt; nur ein echter Fehler löst den nächsten Fallback aus.

Nach erfolgreicher Tiefe erzeugt SHADED automatisch Point Cloud, Height-/Bump-/Normal-Maps, Primitive, Spiegelgeometrie und ein Raymarch-Szenenpaket. Danach öffnet sich die Raumansicht und die Kamera fährt in die Ego-Steuerung.

Die lokalen Ergebnisse bleiben unter:

`provider-output-windows\world-runs\`

## Einmalige GPU-Einrichtung / Reparatur

Nur wenn `.venv-depth-win` noch nicht eingerichtet ist oder PyTorch/CUDA repariert werden muss:

**`RTX_WINDOWS.cmd` doppelklicken.**

Der RTX-Launcher richtet den offiziellen CUDA-PyTorch-Build ein und prüft, ob die NVIDIA-GPU für PyTorch erreichbar ist. Danach wird im normalen Alltag wieder nur `SHADED_WINDOWS.cmd` verwendet.

## Voraussetzungen

- Windows 11
- NVIDIA-Treiber (`nvidia-smi` funktioniert)
- Node.js 20+
- Python 3.11

Der Linux-GitHub-Runner ist optional und für den lokalen Windows-Betrieb nicht nötig.

## Browser/PWA

Die Vercel-Version kann weiterhin als PWA installiert werden. Ohne laufende lokale Bridge nutzt sie den Browser-/Softwarepfad; für RTX-Depth und die vollständigen lokalen Artefakte `SHADED_WINDOWS.cmd` verwenden.
