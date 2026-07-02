# Runde 2 – Jahreszeiten & Klima: Tasks

- [x] 1. Parameter `snow, snowfall, temperature, autumn, bloom, bleach` in
      PARAMS/PARAM_META ergänzen; Slider-Gruppierung im Experten-Panel.
- [x] 2. Shader: Schneedecken-Block (materialabhängige Akkumulation, fbm-Flecken
      auf Pfaden) hinter dem Verfalls-Block einbauen.
- [x] 3. Shader: Eis-Modus im Pfützen-Block (Frostmuster, Ripples aus,
      gedämpfte statische Warmlicht-Reflexion) bei `temperature < 0 °C`.
- [x] 4. Shader: Schneefall-Parallax-Layer (träge, taumelnd, windverdriftet);
      Mischverhalten mit Regen definieren.
- [x] 5. Shader: Herbst-Hue-Shift auf foliage/grass (pro-Zellen-Noise) VOR der
      Nässe-Abdunklung + Laubfall-Layer + Laubsammlung am Pfadrand (`phys.b`).
- [x] 6. Shader: Blüten-Sprenkel (`bloom`) und Sonnenbleiche (`bleach`).
- [x] 7. Akte `erster_schnee` und `goldener_herbst` + Storyboard-Preset
      „Ein Jahr“ (Frühling→Sommer→Herbst→Sturmnacht→Winter→Tauwetter).
- [x] 8. `tools/verify.js` um die neuen Akte erweitern; Screenshots visuell
      bewerten (Skill shaded-visual-verify) – auch den Map-Modus.
- [x] 9. Regressionscheck: Runde-1-Akte unverändert bei neuen Parametern = 0;
      keine Konsole-/GL-Fehler; commit + push.
