# Runde 5 – Strukturelle Segmentierung: Tasks

- [x] 1. Struktur-Pass-Gerüst in `analyze()` (nach Fensterdetektoren, vor
      Masken; nur Heuristik-Modus) + `SHADED.structure`-Diagnose.
- [x] 2. Inkrement 1: Bodenanker-Regel für P-Komponenten (Ring-Analyse,
      W-neutral; building>0.30 && ground<0.20 → K).
- [x] 3. verify.js: Klassenzählung pro Referenzszene loggen +
      `tools/expected-classes.json` mit ±10 %-Toleranz.
- [x] 4. Visuelle Verifikation aller drei Szenen (Taverne: kein Wasser-/
      Pfadnetz mehr auf dem Gebäude; Dorf/Legacy unverändert gut).
- [x] 5. Kanon-Inkrement A (K3/K4): Rahmen-Fenster-Detektor – Füllung
      (K/P/A/R oder roh-blaues Glas) im geschlossenen Holzring (≥55 % W im
      Direktring) + Farbtor (Blauglas ODER hell-satt-warm; bewusst KEIN
      "einfach dunkel") + K1-Wandbeleg in der Validierung; ersetzt
      Dunkel-Blob- und Scheiben-Detektor. Analyseraster auf 768 angehoben,
      Umfeld-Prüfungen skalieren mit Auflösung UND Blobgröße.
- [x] 6. Kanon-Inkrement B (K7): Himmel-Regel – Flood von der Oberkante über
      {A,P,K}, nur wenn blau-dominant & hell → inerte Klasse; verhindert
      Wasser-/Pfützen-Interpretation des Himmels.
- [ ] 7. Kanon-Inkrement C (K1): Fachwerk-Signatur (Balken-auf-Putz-Dichte)
      → Gebäudezonen-Maske; Shader maskiert puddle/riv/creep/mud;
      hebt auch die Fenster-Ausbeute in Perspektiv-Szenen (dorf-himmel).
- [x] 8. Kanon-Belege (2 neue Dorfbilder) in verify.js: Klassenzählung +
      Sturmnacht-Shot top-down; expected-classes erweitern (5 Szenen).
      Dach-/Bodenanker auf Adjazenz-Ringe umgestellt (BBox-Ringe lügen bei
      langgestreckten Formen) + minStruct gegen Fragment-Kaskaden.
- [x] 9. Doku: bildkanon.md verlinken (README/CLAUDE.md/Skill/Steering);
      commit + push je Inkrement.
