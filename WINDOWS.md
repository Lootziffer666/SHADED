# SHADED auf Windows

Kurzfassung. Die große README bleibt technische Referenz.

## Normal benutzen

1. Repository aktualisieren: `git pull`
2. **`SHADED_WINDOWS.cmd` doppelklicken.**
3. Der lokale Editor öffnet sich automatisch.
4. Bild laden → Modell wählen → Begrenzung → Himmel/Sonne → optional Material-Preset → **KLEINE WELT ERZEUGEN**.

Der normale Auto-Pfad ist:

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
