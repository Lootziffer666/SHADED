# Studio — Editor und Runtime

Companion to [`WORLD_ARCHITECTURE.md`](./WORLD_ARCHITECTURE.md), [`SHADER_IR.md`](./SHADER_IR.md), [`STATE.md`](./STATE.md).

## These

SHADED Runtime und SHADED Editor werden nicht zu einer gigantischen Oberfläche verheiratet.

```
┌─ SHADED EDITOR ─────────────┐
│ Tools / Laws / Materials    │
│ Donors / Graphs / Inspector │
│ ┌─ LIVE WORLD VIEW ───────┐ │
│ │ iframe: echte Runtime   │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
        │ BUILD / OPEN
        ▼
┌─ SHADED WORLD TAB ──────────┐
│ vollständige Runtime        │
│ fullscreen / walk / record  │
└─────────────────────────────┘
```

Beide benutzen denselben Weltzustand bzw. dieselbe Build-Definition.

## Das iframe ist live

Kein Standbild. Der Editor schickt Änderungen (`gravity = 0.62`, `rainfall += 0.2`, `material sand porosity = 0.71`, `source added at x/y/z`) per postMessage/MessageChannel in die Runtime — die Welt reagiert sofort. Die Runtime schickt zurück: FPS, world time, selected cell, water mass, soil moisture, temperature, entity state, errors. Das iframe ist keine Abbildung der Welt, sondern eine echte zweite Anwendung im Editor.

## Drei Darstellungsstufen

1. **Preview** — billig, eventuell pausiert oder mit niedriger Simulationsrate. Für Material ändern, Licht prüfen, Terrain ansehen, Vegetation kontrollieren.
2. **Live** — die echte Runtime im iframe: Simulation 30 Hz, Renderer 60 Hz. Links ändern, rechts unmittelbar die Konsequenz sehen.
3. **Play** — `OPEN WORLD`: dieselbe Runtime in eigenem Tab/Fenster. Editor: Parameter, Inspector, Build. World: Fullscreen, Walking, Simulation, Record.

Workflow: einstellen → Build → Tab wechseln → rumlaufen → zurück → ändern → erneut ansehen.

## Apply statt immer Build

- Parameter geändert → **Hot Apply** → Preview reagiert
- Shader/Kernel geändert → **Recompile** → Preview reload
- Großer struktureller Umbau → **Build** → neuer Runtime-State

## Protokoll statt Kopplung

Nicht `iframe.contentWindow.someSHADEDFunction()`, sondern ein kleines Protokoll:

```
SHADED EDITOR PROTOCOL
SET_WORLD_STATE · PATCH_WORLD_STATE · SELECT_ENTITY · SET_CAMERA
PAUSE · PLAY · STEP · REBUILD_SHADER · LOAD_SCENE
CAPTURE_FRAME · REQUEST_METRICS
```

Dann ist egal, ob die Runtime im iframe, im zweiten Tab, auf dem zweiten Monitor, lokal, remote oder als Desktop-App läuft — der Editor spricht immer dieselbe Sprache mit ihr. Synchronisation über BroadcastChannel, MessageChannel, WebSocket oder eine gemeinsame State-Schicht. Editor und Preview bleiben zunächst same-origin, kommunizieren aber ausschließlich über das Protokoll; bei Cross-Origin-Einbettung später Permissions Policy / Isolation sauber konfigurieren (WebGPU läuft auch im eingebetteten Kontext).

**Standbild und Live sind keine zwei Architekturen.** Standbild ist nur: Runtime pausiert + letztes Frame bleibt sichtbar.

Zwei echte Fenster sind sogar besser als iframe-only: Editor auf Monitor 1, World auf Monitor 2 — `gravity 1.0 → 0.55` drehen und im anderen Fenster, während man darin steht, zusehen.

## Der Editor als Werkbank

Der Editor implementiert nicht mehr alles selbst, er ist der Raum, in dem die passenden Werkzeuge zusammenspielen:

```
SHADED STUDIO
├─ World Preview      [iframe]
├─ Shader Tool        [embedded]
├─ Graph Editor       [embedded]
├─ Material Editor    [embedded]
├─ Donor Inspector    [embedded]
├─ Profiler           [embedded]
├─ Documentation      [embedded]
└─ Runtime Console    [embedded]
```

Die Runtime-Oberfläche darf praktisch verschwinden: FPS, Pause, Record, Camera, Exit. Der Rest gehört in den Editor.

## Die Produktfamilie

SHADED begann als **SHADer + EDitor** — Shader bearbeiten, Ergebnis ansehen. Nach Reconstruction, World Kernel, Physik, Ökosystemen und „was passiert mit diesem Liter Wasser in drei Stunden" landet die Architektur ausgerechnet wieder dort — auf höherer Ebene:

- **SHADED Studio** — bauen, untersuchen, justieren
- **SHADED Runtime** — Weltregeln ausführen
- **SHADED IR** — fremde technische Ausdrucksformen verstehen/übersetzen (siehe SHADER_IR.md)
- **SHADED World** — das resultierende begehbare Ding

Shader sind inzwischen nicht mehr Oberflächenkosmetik: Sie können Compute, Materialzustände, Felder, Simulation und Darstellung ausdrücken — und durch SHADER_IR ist der Editor nicht einmal an eine Shader-Sprache gebunden. SHADED wurde zu einem Editor für die Regeln, aus denen eine Welt sichtbar wird. Die Welt selbst muss nicht „SHADED" aussehen — sie ist einfach das Ergebnis.
