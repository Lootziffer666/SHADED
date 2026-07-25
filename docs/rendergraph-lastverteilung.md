# SHADED – Rendergraph, Weltgesetz-Scheduler und Lastverteilung

**Status:** verbindliche Architekturentscheidung vor weiterem Funktionswachstum  
**Stand:** 2026-07-25  
**Gilt für:** Runtime, Editor, Weltgesetze, Tests und spätere Rendering-Backends

> Texture Units begrenzen einen einzelnen Pass, nicht SHADED.  
> Weltgesetze werden als dynamischer Rendergraph aus mehreren Pässen ausgeführt.  
> Weltzustand, Simulation und momentane GPU-Bindung sind drei verschiedene Dinge.

---

## 1. Warum diese Entscheidung jetzt nötig ist

Die aktuelle Runtime beweist das Produktversprechen mit einem großen WebGL-1-Fragmentpass. Das ist als lauffähiger Prototyp wertvoll, darf aber nicht zum dauerhaften Architekturmodell werden.

Mit jedem weiteren Weltgesetz entstehen sonst dieselben Fehlentwicklungen:

- immer mehr Uniforms und Verzweigungen in einem Shader,
- künstlicher Streit um den „letzten“ Texture Slot,
- Effekte laufen in voller Auflösung und mit voller Frequenz, obwohl sie das nicht benötigen,
- langsame Weltprozesse werden unnötig pro Frame berechnet,
- unsichtbare oder mechanisch irrelevante Gesetze verbrauchen GPU-Zeit,
- Persistenz wird mit permanenter Texturbindung verwechselt,
- ein Shaderfehler gefährdet die gesamte Bildkette,
- einzelne Systeme lassen sich nicht separat messen, abschalten oder degradieren.

Diese Datei setzt deshalb die Grenze **bevor** der bestehende Pass zu groß wird.

---

## 2. Unverhandelbare Grundsätze

### 2.1 Ein Pass ist ein Implementierungsbaustein, keine Systemgrenze

`MAX_TEXTURE_IMAGE_UNITS` gilt für die gleichzeitig in einem Shader-Pass gesampelten Texturen. Ein Pass darf in eine Render-Textur schreiben, die der nächste Pass liest. SHADED darf daher beliebig viele logisch aufeinanderfolgende Pässe besitzen, solange Speicher-, Bandbreiten- und Zeitbudget eingehalten werden.

Die relevante Frage lautet nicht:

> Wie bekommen wir alle Weltgesetze in acht Texture Slots?

Sondern:

> Welche Weltgesetze sind jetzt relevant, welche Daten brauchen sie, in welcher Auflösung und Frequenz müssen sie laufen, und welche Ergebnisse können geteilt oder wiederverwendet werden?

### 2.2 Weltzustand ist nicht GPU-Ressource

Ein Weltgesetz kann logisch aktiv oder persistent sein, ohne gerade gerendert zu werden.

Beispiele:

- Fußspuren im Schnee bleiben gespeichert, während die Kamera einen Innenraum zeigt.
- Rost altert logisch weiter, obwohl kein Metall sichtbar ist.
- Geruch wird nur als Feld materialisiert, wenn Wind, Tiere oder Gameplay ihn benötigen.
- Brandnarben werden beim erneuten Laden einer Region aus dem persistenten Zustand rekonstruiert.

### 2.3 Nie alle 60 Weltgesetze gleichzeitig rendern

Die 60 Weltgesetze sind ein möglicher Systemraum, kein fester Effektstapel. Ein Scheduler bestimmt pro Szene und Frame die aktive Teilmenge.

### 2.4 Keine zweite Materialwahrheit

`classGrid`, Materialmasken und die daraus abgeleiteten Weltzustände bleiben kanonisch. Mehrere Render-Pässe dürfen diese Wahrheit lesen und transformieren, aber niemals unabhängig neu klassifizieren.

### 2.5 Lastverteilung ist Teil des Designs jedes Weltgesetzes

Ein neues Weltgesetz ist unvollständig, solange nicht festgelegt ist:

- wann es aktiv wird,
- wie oft es aktualisiert wird,
- in welcher Auflösung es läuft,
- ob es lokal oder bildfüllend ist,
- welche Daten persistent sind,
- welche Zwischenresultate es teilt,
- wie es unter Last degradiert,
- wie es gemessen und verifiziert wird.

---

## 3. Zielarchitektur

```text
Kanonischer Szenen- und Weltzustand
                │
                ▼
       World-Law Scheduler
    Sichtbarkeit · Ursache · Relevanz
    Priorität · Abhängigkeiten · Budget
                │
                ▼
       Rendergraph-Compiler
    Pass-Fusion · Pass-Splitting · Formate
    Auflösung · Frequenz · Ressourcenleben
                │
                ▼
        Ressourcen-Pool
    Render-Targets · Feldtexturen · Ping-Pong
    temporär · persistent · wiederverwendbar
                │
                ▼
        Ausführungs-Backends
    WebGL 1 · WebGL 2 · später WebGPU
                │
                ▼
          Final Composite
```

Die bestehende Single-File-Runtime bleibt lauffähig. Der aktuelle große Fragmentshader wird zunächst als **LegacyCompositePass** in den Rendergraph eingehängt und anschließend schrittweise zerlegt. Es gibt keinen Big-Bang-Rewrite.

---

## 4. Rendergraph

### 4.1 Pass-Vertrag

Jeder Pass deklariert mindestens:

```js
{
  id: 'atmos.smoke-layering',
  phase: 'simulation | material | lighting | atmosphere | composite | post',
  inputs: ['sceneColor', 'materialMasks', 'AtmosField'],
  outputs: ['smokeColor'],
  resolution: 0.5,
  cadence: 'frame | fixedHz | event | onDirty',
  hz: 15,
  locality: 'fullscreen | bounds | tiles',
  persistence: 'transient | cached | world-state',
  priority: 70,
  estimatedCost: 'low | medium | high',
  fallback: 'smoke-cheap',
  enabledWhen: ['fireVisible || fogRelevant']
}
```

Die Syntax ist zunächst konzeptionell. Entscheidend ist der Vertrag, nicht die konkrete JS-Struktur.

### 4.2 Pass-Phasen

| Phase | Aufgabe | Beispiele |
|---|---|---|
| **Analyse** | kanonische Masken und statische Ableitungen | Materialklassen, Gebäudezonen, Tiefenkarte |
| **Simulation** | zeitliche Felder fortschreiben | Wasser, Rauch, Geruch, Wärme, Spuren, Rost |
| **Material** | Materialreaktionen berechnen | Nässe, Frost, Risse, Moos, Blut, Öl |
| **Licht** | Beleuchtung und Emission | Tag/Nacht, Feuer, Mondlicht, Fenster |
| **Atmosphäre** | räumliche Medien und Partikel | Regen, Nebel, Rauch, Schnee |
| **Composite** | Zwischenergebnisse zusammenführen | Szene + Material + Licht + Atmosphäre |
| **Post** | rein bildräumliche Endbearbeitung | Bloom, Vignette, kontrollierte Brechung |

Nicht jede Phase benötigt in jeder Szene einen eigenen Pass. Der Compiler darf kompatible Arbeit fusionieren.

### 4.3 Pass-Fusion und Pass-Splitting

**Fusionieren**, wenn:

- dieselben Eingaben und dieselbe Auflösung benötigt werden,
- dieselbe Aktualisierungsfrequenz gilt,
- keine Wiederverwendung eines Zwischenergebnisses verloren geht,
- die Verzweigungskosten geringer bleiben als ein zusätzlicher Fullscreen-Pass.

**Trennen**, wenn:

- ein Ergebnis von mehreren späteren Pässen gelesen wird,
- ein Feld deutlich seltener oder niedriger aufgelöst aktualisiert werden kann,
- Ping-Pong oder Feedback nötig ist,
- ein Effekt nur lokal sichtbar ist,
- ein teurer Pass unabhängig deaktiviert oder degradiert werden soll,
- das gemeinsame Shaderprogramm unbeherrschbar wird.

---

## 5. World-Law Scheduler

Der Scheduler beantwortet für jedes Weltgesetz fünf Fragen:

1. **Existiert die Ursache?**  
   Feuer, Wasser, Kälte, Wind, Gift, Magie oder Nutzung müssen tatsächlich vorhanden sein.

2. **Ist die Wirkung sichtbar?**  
   Betroffene Materialien, Akteure oder Regionen liegen im sichtbaren Bereich.

3. **Ist sie mechanisch relevant?**  
   Spieler, NPCs oder andere Gesetze lesen den Zustand gerade.

4. **Muss sie jetzt aktualisiert werden?**  
   Ein langsamer Prozess kann fortgeschrieben, interpoliert oder ereignisgesteuert werden.

5. **Welche Qualitätsstufe erlaubt das Budget?**  
   Vollständig, vereinfacht, indirekt sichtbar oder nur persistent.

### 5.1 Gesetzeszustände

```text
DORMANT      Zustand existiert nicht oder Ursache fehlt
PERSISTED    Zustand gespeichert, aber nicht GPU-gebunden
SIMULATING   logisch aktiv, eventuell ohne sichtbaren Pass
VISIBLE      sichtbar und mit vereinfachter Darstellung
FULL         vollständig simuliert und gerendert
```

### 5.2 Abhängigkeiten

Der Scheduler arbeitet mit einem Abhängigkeitsgraphen, nicht mit einer flachen Effektliste.

```text
Regen
 ├─ schreibt HydroField
 ├─ aktiviert Nässe
 ├─ schwächt Feuer
 ├─ verdünnt Blut
 ├─ verschiebt Geruch
 └─ erzeugt sichtbare Tropfen nur bei Außenflächen

Feuer
 ├─ schreibt Heat/Atmos
 ├─ liest Nässe
 ├─ erzeugt Rauch
 ├─ trocknet Materialien
 └─ hinterlässt Ruß und Brandnarben
```

Wird ein Gesetz sichtbar benötigt, müssen seine Produzenten und Datenabhängigkeiten eingeplant werden. Das bedeutet nicht, dass alle davon als eigener Fullscreen-Pass laufen müssen.

---

## 6. Lastverteilung

Lastverteilung bedeutet in SHADED mehr als „mehrere GPU-Pässe“. Arbeit wird entlang mehrerer Achsen verteilt.

### 6.1 Nach Aktualisierungsfrequenz

| Frequenz | Geeignete Systeme |
|---|---|
| **pro Frame** | finales Composite, Kamera-Parallaxe, schnelle Regentropfen, unmittelbare Lichtreaktion |
| **20–30 Hz** | Wasserwellen, aktive Rauchbewegung, Windfelder, schnelle Partikelfelder |
| **10–15 Hz** | Geruch, Nebeldichte, Wärmeausbreitung, langsamere Strömung |
| **1–5 Hz** | Trocknung, Rost, Moos, Materialermüdung, Jahreszeitenmigration |
| **ereignisgesteuert** | Fußabdruck, Einschlag, Berührung, Zündung, Reinigung, Reparatur |
| **beim Laden/Ändern** | Segmentierung, statische Distanzfelder, Gebäudezonen |

Zwischen langsamen Updates wird visuell interpoliert. Weltzeit bleibt deterministisch.

### 6.2 Nach Auflösung

| Auflösung | Verwendung |
|---|---|
| **100 %** | scharfe Materialkanten, finale Reflexionen, UI-nahe Effekte |
| **50 %** | Nebel, Rauch, Bloom, großflächige Nässe, Wärme |
| **25 %** | Geruch, langsame Diffusion, Wolkenschatten, Biom- und Wettermasken |
| **Raster/Tiles** | persistente Weltfelder, entfernte Regionen, Offscreen-Simulation |

Upsampling muss kanten- und materialbewusst erfolgen, wenn das Feld an klassifizierten Flächen hängt.

### 6.3 Nach räumlicher Relevanz

- **Fullscreen:** nur wenn die Wirkung tatsächlich das ganze Bild betrifft.
- **Bounds/Scissor:** Feuer, lokale Magie, Atem, einzelne Pfützen.
- **Tiles/Dirty Regions:** Spuren, Reparaturen, Reinigung, lokale Schäden.
- **Offscreen:** nur logische Fortschreibung; kein Render-Pass.

### 6.4 Nach Prozessor

| Ort | Verantwortung |
|---|---|
| **CPU** | kanonische Logik, Ereignisse, Scheduler, langsame Felder, Dirty Tracking, Persistenz |
| **GPU Fragment** | material- und bildbezogene Transformationen, Fullscreen- und lokale Pässe |
| **GPU Feedback/Ping-Pong** | Advektion, Diffusion, Wellen, Reaktionsmuster |
| **später Compute/WebGPU** | große parallele Felder, Partikel, komplexe Simulationen |

Die CPU und GPU dürfen denselben Zustand nicht unabhängig erfinden. Die CPU hält Vertrag und Ereignisse; GPU-Felder sind abgeleitete oder beschleunigte Repräsentationen.

### 6.5 Nach Zeitbudget

Der Renderer erhält ein Framebudget. Der Scheduler darf danach Qualität reduzieren:

1. räumliche Auflösung senken,
2. Aktualisierungsfrequenz reduzieren,
3. teure Passvarianten gegen Fallbacks tauschen,
4. nur indirekte Spuren rendern,
5. Darstellung aussetzen, Zustand aber persistieren.

**Verboten:** Weltzustand löschen, nur weil sein Renderbudget fehlt.

---

## 7. Ressourcen-Pool

Texturen und Framebuffer werden nicht dauerhaft einzelnen Gesetzen zugeordnet.

### 7.1 Lebensdauerklassen

| Klasse | Bedeutung |
|---|---|
| **Transient** | nur innerhalb eines Frames oder einer Passkette |
| **Cached** | über mehrere Frames wiederverwendbar, bei Dirty-State neu berechnet |
| **Persistent** | bildet Weltgeschichte ab und muss serialisierbar sein |

### 7.2 Aliasing

Wenn zwei Ressourcen zeitlich nie gleichzeitig leben, dürfen sie denselben GPU-Speicher verwenden.

```text
Pass 1 schreibt RT-A
Pass 2 liest RT-A und schreibt RT-B
Pass 3 liest RT-B; RT-A ist wieder frei
Pass 4 verwendet denselben Speicher als Atmos-Target
```

### 7.3 Ping-Pong

Feedback-Systeme verwenden mindestens zwei wechselnde Targets:

```text
Field-A(t) → Simulationspass → Field-B(t+1)
Field-B(t+1) → Simulationspass → Field-A(t+2)
```

Das ist für Wasser, Rauch, Geruch, Reaktionsdiffusion und andere zeitliche Felder vorgesehen.

### 7.4 Gerätefähigkeiten

Grenzen werden zur Laufzeit abgefragt. Keine Architekturentscheidung darf von der Annahme „es gibt genau acht Slots“ abhängen.

Zu erfassen sind mindestens:

- Texture Units pro Shaderstufe,
- kombinierte Texture Units,
- maximale Render-Target-Größe,
- unterstützte Texturformate und Präzision,
- Float-/Half-Float-Renderbarkeit,
- Multiple Render Targets,
- Timer Queries,
- WebGL-Version und Erweiterungen.

Der Capability Snapshot wird Teil der Verifikation.

---

## 8. Field-Bank

Die Field-Bank beschreibt logische Datenprofile. Sie ist **kein** festes Slotlayout.

| Feldprofil | Mögliche Inhalte |
|---|---|
| **HydroField** | Nässe, Flussrichtung, Tiefe, Trocknungsalter |
| **TraceField** | Blut, Schlamm, Ruß, Öl, Berührung, Gewohnheit |
| **StructureField** | Druck, Risse, Frost, Rostkeime, Reparatur |
| **AtmosField** | Rauch, Geruch, Temperatur, Druck, Gift |
| **BioField** | Wachstum, Krankheit, Pollen, Tierreaktion |
| **ArcaneField** | Brechung, Runen, Segen/Fluch, magisches Gedächtnis |

Ein Profil kann abhängig vom Backend realisiert werden als:

- CPU-Array,
- gepackte RGBA-Textur,
- mehrere spezialisierte Texturen,
- niedrig aufgelöstes Tile-Feld,
- Ping-Pong-Target,
- später Compute-Buffer.

Nur aktive Kanäle müssen materialisiert werden.

---

## 9. ReShade-Entscheidung

ReShade ist **keine Voraussetzung** für SHADED und kein Bestandteil des internen Rendergraphs.

SHADED kontrolliert bereits:

- Renderloop,
- Passreihenfolge,
- Framebuffer,
- Texturen,
- Materialmasken,
- Weltzustände,
- Verifikation.

ReShade wäre nur ein optionaler späterer Adapter für fremde Spiele oder Renderpipelines, deren internen Rendergraph SHADED nicht kontrolliert. Kein Kernvertrag darf ReShade voraussetzen.

---

## 10. Migrationspfad ohne Big-Bang-Rewrite

### Phase 0 – Vertrag jetzt

- Diese Architekturdatei ist verbindlich.
- Neue Weltgesetze benötigen Pass-, Frequenz-, Auflösungs- und Fallback-Metadaten.
- Der bestehende Shader darf nicht weiter als einzige mögliche Ausführungsschicht beschrieben werden.

### Phase 1 – Rendergraph-Fassade

- Der bestehende Renderpfad wird als `LegacyCompositePass` registriert.
- Ein kleiner Graph-Runner verwaltet Passreihenfolge und Render-Targets.
- Das Bild bleibt zunächst visuell identisch.

### Phase 2 – ersten Pass extrahieren

Ein risikoarmer, klar messbarer Effekt wird aus dem Monolithen gelöst, bevorzugt:

- Bloom/Glitzern,
- Nebel,
- Hitzeverzug,
- oder finales Grading.

Ziel ist der Infrastrukturbeweis, nicht sofortige Qualitätssteigerung.

### Phase 3 – Scheduler und Ressourcen-Pool

- aktive Weltgesetze bestimmen,
- Capability Snapshot,
- Render-Target-Pool,
- Frequenz- und Auflösungssteuerung,
- GPU-Zeit pro Pass messen.

### Phase 4 – erstes echtes Simulationsfeld

Ein Feld mit Feedback beweist Ping-Pong und Mehrfrequenzbetrieb, bevorzugt:

- Wasserwellen,
- Rauch/Geruch,
- oder Reaction Diffusion.

### Phase 5 – Backend-Erweiterungen

- WebGL 2/MRT optional,
- später WebGPU/Compute,
- optional ReShade-FX-Export oder Fremdspiel-Adapter, aber niemals Kernabhängigkeit.

---

## 11. API-Richtung

Bestehende `window.SHADED`-Verträge bleiben erhalten. Neue Oberflächen werden nur ergänzt.

```js
SHADED.renderGraph.inspect()
SHADED.renderGraph.setBudget({ frameMs: 12, memoryMB: 256 })
SHADED.renderGraph.getPassTimings()
SHADED.renderGraph.setQuality('auto' | 'low' | 'medium' | 'high')

SHADED.worldLaws.list()
SHADED.worldLaws.getActive()
SHADED.worldLaws.explain(id)
SHADED.worldLaws.force(id, state) // nur Debug/Test

SHADED.capabilities.snapshot()
SHADED.resources.inspect()
```

Alle Debug-APIs müssen deterministische Tests unterstützen und dürfen keine zweite Laufzeitwahrheit erzeugen.

---

## 12. Verifikation

Jede Rendergraph-Änderung benötigt:

1. **visuelle Parität** für bestehende Akte,
2. **keine GL-Fehler**,
3. **Pass-Timing-Evidenz**,
4. **Ressourcen-Lebensdauerprüfung** ohne Leaks,
5. **deterministische Wiederholung** über `setTime`,
6. **Fallback-Test** mit künstlich reduziertem Budget,
7. **Capability-Test** für WebGL 1 ohne optionale Erweiterungen,
8. **Aktivitäts-Test:** unsichtbare Gesetze erzeugen keine unnötigen Pässe.

Mindestens folgende Fixtures sind vorzusehen:

- alter Single-Pass-Pfad gegen Rendergraph-Fassade,
- Außenraum mit Schnee, Wind, Blut und Feuer,
- Innenraum mit Rauch, Mauerfeuchte und Warmlicht,
- Szenenwechsel mit persistenten, aber zeitweise ungebundenen Spuren,
- Budgetwechsel während laufender Szene.

---

## 13. Anti-Patterns

Nicht zulässig:

- alle neuen Effekte blind in den bestehenden Fragmentshader schreiben,
- Texture Units als Gesamtlimit von SHADED behandeln,
- jedem Weltgesetz dauerhaft eine Textur reservieren,
- langsame Weltprozesse pro Frame in voller Auflösung rechnen,
- unsichtbare Gesetze rendern, nur weil ihr Zustand existiert,
- Qualitätsreduktion durch Löschen von Weltzustand,
- unabhängige Materialklassifikation in einzelnen Pässen,
- ReShade als Pflicht-Bridge für die eigene Runtime,
- Backenddetails in den kanonischen Weltzustand zurückschreiben.

---

## 14. Relevante Donor-Repos aus der DB

| Repo | Zu prüfender Kern |
|---|---|
| `playcanvas/engine` | Render-Pässe, Ressourcenleben, WebGL/WebGPU-Parität, Volumetric Fog |
| `diwi/PixelFlow` | Postprocessing-Passkorpus, Distance Transform, Optical Flow, Profiling-Ideen |
| `aiekick/NoodlesPlate` | Multipass-Workbench, Uniforms, Timeline, Imports, GPU-Profiling |
| `k0T0z/shader-gen` | typisierter Graphvertrag; wegen GPL nur Clean-Room-Architektur |
| `alphastrata/shadplay` | Live Reload, Preview, Snapshot-Evidenz, Surface Switching |
| `brunosimon/webgl-filters` | kleine komponierbare Filterpässe und Texturübergaben |
| `aiekick/reaction-diffusion-playground` | Ping-Pong, Parameter-Maps, Presets, Bild-Seeding |
| `aiekick/InAppGpuProfiler` | GPU-Zeit pro Pass |
| `brunosimon/webgl-three.js-deferred-rendering` | Buffer- und Passgrenzen als Architekturbeispiel |

Donor bedeutet nicht Abhängigkeit. Übernommen werden begrenzte Verträge und Verfahren nach Lizenz- und Fit-Prüfung.

---

## 15. Definition of Done für den Architektur-Sprint

Der frühe Rendergraph-Sprint ist abgeschlossen, wenn:

- der aktuelle Renderer als Pass ausführbar ist,
- mindestens ein Effekt in einen zweiten Pass extrahiert wurde,
- Ping-Pong-Targets technisch möglich sind,
- Ressourcen wiederverwendet und inspiziert werden können,
- ein Scheduler unnötige Pässe deaktiviert,
- mindestens zwei Update-Frequenzen parallel laufen,
- mindestens ein Pass in reduzierter Auflösung läuft,
- automatische Budget-Degradation ohne Zustandsverlust funktioniert,
- alle bisherigen Zielbilder weiterhin verifiziert werden.

Erst danach sollen viele weitere Weltgesetze in die Runtime eingebaut werden.
