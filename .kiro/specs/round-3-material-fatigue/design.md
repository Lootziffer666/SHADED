# Runde 3 – Material Fatigue & Verfall: Design

## Kernidee

`decay` bleibt EIN Parameter; die Materialstaffelung entsteht über versetzte
smoothstep-Fenster pro Maske („Verfallskurven“):

```glsl
float dWood = smoothstep(0.05, 0.55, u_decay);   // zuerst
float dRoof = smoothstep(0.20, 0.75, u_decay);
float dPath = smoothstep(0.35, 0.90, u_decay);
float dRock = smoothstep(0.60, 1.00, u_decay);   // zuletzt
```

## Effekte

- **Holz:** Entsättigung → Grausilber (`mix(col, gray*vec3(0.72,0.74,0.78), dWood*mWood)`),
  Splitter = gerichtete hash-Striche entlang der lokalen Gradientenrichtung.
- **Dach:** bestehendes Moos nutzt `dRoof` statt `u_decay` direkt; fehlende
  Ziegel = zellbasierte hash-Auswahl (`step(0.93, hash(cell))`) dunkelt Zellen ab.
- **Pfad:** Überwucherungsfront bleibt distanzgesteuert (`phys.a`), Frontbreite
  wächst mit `dPath`; Grasfarbe aus Szenen-Durchschnitt (CPU: mittlere grass-Farbe
  in `analyze()` bestimmen und als Uniform hochgeben – kein Hardcoding).
- **Risse:** Sobel-artige Kantenstärke aus `u_scene`-Luminanz, moduliert mit
  ridged fbm; nur auf roof/wood/path, Faktor `smoothstep(0.75,1.,u_decay)`.
- **Dachlinien-Sag:** vertikaler Domain-Warp `uv.y += sag(uv.x)*dRoof*mRoof*0.004`.
- **Ranken:** vertikale fbm-Strähnen auf Wandbereichen (P-Maske ∩ hohe Helligkeit),
  von unten wachsend (`smoothstep`-Höhenfenster · dPath).
- **Fensterlicht:** `lamp *= 1.0 - smoothstep(0.6,0.9,u_decay)`.

## Storyboard-Erweiterung

Schritt-Objekte erhalten optional `animate:{param:{from,to}}` – während des
Schritts wird der Parameter linear gefahren (Basis für R4 `zeitraffer` und
künftige Sonnenstands-Fahrten). Implementierung in `tickStory()` (~10 Zeilen).

## Feuchte-Kopplung

CPU-seitig: laufender „Moos-Akkumulator“ `mossBoost += dt*max(0,CUR.wet-0.5)*k`,
als Uniform `u_mossBoost` (Sättigung bei 1); Shader addiert ihn auf `dRoof`-Moos.
Bewusst CPU-Zustand (persistiert über Akte hinweg) – dokumentieren in
shader-pipeline-Steering.
