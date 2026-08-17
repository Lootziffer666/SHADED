# SHADED auf Windows

Das hier ist absichtlich die kurze Anleitung. Die große README ist die technische Referenz.

## 1. SHADED wie eine Desktop-App installieren

1. `https://shaded-woad.vercel.app/` in Edge oder Chrome öffnen.
2. Sobald der Browser die PWA-Installation anbietet, erscheint oben in SHADED **INSTALLIEREN**.
3. **INSTALLIEREN** drücken und den Browserdialog bestätigen.
4. Danach startet SHADED im Standalone-Fenster wie eine normale App. Der installierte Startpunkt ist der neue Editor, nicht die alte Renderer-Seite.

Die Installation braucht HTTPS oder localhost. Die Vercel-Version erfüllt das bereits.

## 2. RTX 3060 lokal unter Windows benutzen

Der GitHub-Workflow `.github/workflows/rtx-spatial.yml` ist nur ein optionaler Self-hosted-Linux-Runner. SHADED selbst braucht kein Linux.

Für deinen Windows-PC gibt es im Repo:

- `RTX_WINDOWS.cmd` – Doppelklick-Start, standardmäßig Depth Anything V2
- `tools/run-rtx-spatial-windows.ps1` – gleiche Pipeline mit Parametern für V2, DA3 oder beide

### Voraussetzungen

- Windows 11
- NVIDIA-Treiber (`nvidia-smi` muss funktionieren)
- Node.js 20+
- Python 3.11 im PATH

### Einfachster Start

`RTX_WINDOWS.cmd` doppelklicken.

Beim ersten Lauf werden die lokale Python-Umgebung und Provider-Abhängigkeiten eingerichtet. Der Launcher installiert **nicht** einfach irgendein `torch`, sondern erzwingt zuerst den offiziellen PyTorch-CUDA-Build für Windows (`torch 2.10.0` + CUDA 12.6) und prüft sofort `torch.version.cuda` sowie `torch.cuda.is_available()`. Ein bereits vorhandener CPU-only-Build in `.venv-depth-win` wird dabei ersetzt. Für diese PyTorch-Wheels ist kein separat installiertes CUDA Toolkit nötig; erforderlich ist ein kompatibler NVIDIA-Treiber.

Danach läuft die Inferenz auf `cuda:0` mit FP16. Die importierbaren Ergebnisse landen in:

`provider-output-windows\`

Der Ordner wird am Ende automatisch im Explorer geöffnet.

### DA3 statt V2

PowerShell im SHADED-Ordner:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run-rtx-spatial-windows.ps1 -Provider depth-anything-3
```

Beide nacheinander:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run-rtx-spatial-windows.ps1 -Provider both
```

Eigenes Bild:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run-rtx-spatial-windows.ps1 -Provider depth-anything-v2 -InputImage "C:\Pfad\bild.png"
```

Hinweis: Die Windows-Pipeline prüft CUDA vor und nach der Provider-Installation ausdrücklich und bricht sichtbar ab, wenn eine Abhängigkeit den GPU-Build ersetzt oder der NVIDIA-Treiber für PyTorch nicht erreichbar ist. Sie behauptet keinen erfolgreichen DA3-Lauf, bevor er auf deinem Windows-System tatsächlich gelaufen ist.
