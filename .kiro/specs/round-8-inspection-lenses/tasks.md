# Runde 8 – Wally-Monokel: Tasks

- [x] 1. `u_lens`-Uniform + Linsen-Block ganz am Ende von `main()` (nach
      voller Komposition); Linse 1 (Schmutz/Abnutzung), 2 (Belastung),
      5 (Kanten) aus bestehendem State (`trail.b`, `u_touchWear`,
      `u_pressureDim`, `maskA`/`maskB`-Gradient); Linse 4 = `col`
      unverändert.
- [x] 2. Klang-Wellenfeld (Unit 8, `SND=256`, eigener Puffer):
      `soundStamp`/`soundTick`/`soundUpload`/`soundClear`, Decay-HWZ
      ≈ 0.35 s, in `tickWorld`/`frame()` verdrahtet wie die
      Trail-Textur.
- [x] 3. `window.SHADED.lens{set,get}` + `window.SHADED.sound{emit,
      clear}`; Tasten 1–5 (Toggle) über dedizierten `keydown`-Listener,
      Statuszeile ("🔎 Linse N aktiv." / "🔎 Linse aus.").
- [x] 4. `docs/round-8-asset-boundary.md`: dokumentiert die
      Ephemer-Inventur (Format-/Zähldaten zweier nutzereigener
      SCUMM-v5-Kopien; keine Rohdateien committet) als
      Kalibrierungsgrundlage.
- [x] 5. `tools/verify-lenses.js`: API-Test, Linsen-Differenzierung
      (1/2/3/5 sichtbar anders, 4 pixelgleich), Klang-Emit + Decay,
      Tastatur-Toggle, Error-Freiheit. Regression: `tools/verify.js`,
      `verify-actors.js` weiterhin grün.
- [x] 6. Doku: `shader-pipeline.md` (Texture-Unit-8-Eintrag,
      "Neuen Effekt andocken" bleibt gültig), README-Steuerungstabelle,
      `package.json` `check`-Skript um `verify-lenses.js` erweitert;
      CI-Workflow-Schritt ergänzt. Commit + push.
