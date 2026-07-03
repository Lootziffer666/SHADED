# Runde 5 – Strukturelle Segmentierung: Tasks

- [x] 1. Struktur-Pass-Gerüst in `analyze()` (nach Fensterdetektoren, vor
      Masken; nur Heuristik-Modus) + `SHADED.structure`-Diagnose.
- [x] 2. Inkrement 1: Bodenanker-Regel für P-Komponenten (Ring-Analyse,
      W-neutral; building>0.30 && ground<0.20 → K).
- [x] 3. verify.js: Klassenzählung pro Referenzszene loggen +
      `tools/expected-classes.json` mit ±10 %-Toleranz.
- [x] 4. Visuelle Verifikation aller drei Szenen (Taverne: kein Wasser-/
      Pfadnetz mehr auf dem Gebäude; Dorf/Legacy unverändert gut).
- [ ] 5. Inkrement 2: Gebäudezonen-Maske (Dach-Saat, beschränkte Dilation),
      Texturkanal + Shader-Maskierung von puddle/riv/creep/mud.
- [ ] 6. Inkrement 3: Wand/Boden-Split für verschmolzene P-Komponenten.
- [ ] 7. Inkrement 4: Fenster-Validierung über Zonen (Fallback: Voting).
- [ ] 8. Doku: Pipeline-Skill + Steering um Struktur-Pass erweitern;
      README-Fahrplan „Runde 5“ nachführen; commit + push je Inkrement.
