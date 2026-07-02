# Runde 4 – Interaktion & Ökosystem: Design

## Lessons Learned aus dem Prototyp (nicht wiederholen!)

1. `gl.activeTexture(gl.TEXTURE2D+2)` → IMMER `gl.TEXTURE0+n`.
2. Trail-Decay per „darken + screen-composite“ ist mathematisch wirkungslos →
   Decay direkt auf den Pixeldaten: `data[i] = max(0, data[i]-decayRate*dt)`
   auf einem persistenten ImageData/Float32Array, danach EIN putImageData +
   texImage2D. Kein tempCanvas pro Frame.
3. Overlay-Canvas exakt über dem GL-Canvas positionieren: gemeinsamer
   Wrapper mit `position:relative`, Overlay `position:absolute; inset:0`,
   identische CSS-Größe; Maus/Spieler-Koordinaten immer über
   `getBoundingClientRect()` in UV mappen.
4. Partikel-Arrays rückwärts iterieren, wenn gesplict wird.
5. Ein Feuer-Tool braucht einen Click-Listener. Wirklich.

## Architektur

```
GL-Canvas (Szene, Shader)  ← Trail-Textur Unit 5 (512², Uint8Array persistent)
Overlay-Canvas (2D)        ← Spieler, Partikel, Feuer-Flammen
CPU-Loop                   ← Bewegung, Ökosystem, Feuer-Ausbreitung,
                             Trail-Schreiben/-Decay, Emissiv-Laufzeit-Add
```

- **Trail schreiben:** Kreis-Stempel in das Uint8Array (kein Canvas-Kontext
  nötig); Upload nur bei Änderung (dirty-Flag) bzw. max 30 Hz.
- **Shader:** neuer Block nach der Nässe: `trail.b` → Matsch-Mix auf Gras;
  `trail.r` → Schneedellen (Runde 2 Schneedecke × (1-r)); `trail.a` →
  Schnee-Schmelze + Glut-Färbung; `trail.g` → kurzzeitiger Sway-Boost.
- **Feuer als Lichtquelle:** kleine Laufzeit-Emissiv-Liste (x,y,Intensität)
  als Uniform-Array (max 8); Shader addiert radialen Warm-Glow analog
  Fenster-Emissiv. Kein Re-Bake der Emissiv-Textur pro Frame.
- **Ausbreitung:** Poisson-Ticks (`Math.random()<p*dt`), Ziel-Material via
  `getMaterialTypeAt`, Nässe-Veto; brennende Zellen schreiben A-Kanal.
- **Spieler-Physik:** Geschwindigkeit = Basis × Materialfaktor
  (grass 0.8, path 1.0, Eis: Trägheits-Lerp), Grenzen via UV-Clamp.
- **Bio-Rendering:** übernimmt die Prototyp-Ideen (Atmung/Skin/Dampf) als
  saubere Funktionen, Zustand in einem `player`-Objekt.

## API-Erweiterung (`window.SHADED`, nur additiv)

`player:{enable(),move(dx,dy),pos()}`, `fire:{ignite(u,v),list()}`,
`trail:{clear(),sample(u,v)}` – damit ist Runde 4 headless testbar.
