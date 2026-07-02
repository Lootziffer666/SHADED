# Runde 4 – Interaktion & Ökosystem: Tasks

- [ ] 1. Trail-Textur (Unit 5, persistentes Uint8Array, dirty-Upload) +
      wirksamer Decay (Messbarkeit: Halbwertszeit ≤ 2 s) + `trail`-API.
- [ ] 2. Shader-Block: Matsch (B), Schneedellen (R, mit Runde 2), Sway-Boost (G),
      Schmelze/Glut (A).
- [ ] 3. Overlay-Canvas deckungsgleich einrichten (Wrapper, inset:0,
      Koordinaten-Mapping via getBoundingClientRect → UV).
- [ ] 4. Spieler: WASD/Dash, materialabhängige Bewegung inkl. Eis-Trägheit,
      Fußspuren/Trampelpfade; `player`-API.
- [ ] 5. Lagerfeuer: Click-Handler + Tool-Toggle, Laufzeit-Lichtquellen als
      Uniform-Array, Rauch/Funken-Partikel, Ausbreitung mit Nässe-Veto,
      Regen löscht; `fire`-API.
- [ ] 6. Partikel-Ökosystem: Laub/Früchte/Gras mit Wind-, Dash- und
      Material-Reaktion (rückwärts-splicen!).
- [ ] 7. Bio-Charakter: Atmung, Frost-Atemdampf, Nässe, Alterung.
- [ ] 8. Snapshot/Recorder um Overlay-Compositing erweitern.
- [ ] 9. `verify.js`: Interaktionstest (Tasten simulieren → B-Kanal wächst,
      R-Kanal klingt ab; Feuer setzen → Glow im Screenshot) + Regression:
      ohne Eingaben identisches Ambient-Erlebnis. Commit + push.
