# Runde 3 – Material Fatigue & Verfall: Tasks

- [ ] 1. Verfallskurven (`dWood/dRoof/dPath/dRock`) im Shader einführen und den
      bestehenden Verfalls-Block darauf umstellen (Regression: decay=0 identisch).
- [ ] 2. Holz-Vergrauung + Splitter-Striche; Dach: fehlende-Ziegel-Zellen.
- [ ] 3. Mittlere Grasfarbe in `analyze()` berechnen → Uniform; Überwucherungs-
      front & Ranken darauf umstellen (kein hartcodiertes Grün mehr).
- [ ] 4. Risse (Kantenstärke × ridged fbm) und Dachlinien-Sag ab `decay>0.75`.
- [ ] 5. Fensterlicht-Dämpfung bei hohem Verfall.
- [ ] 6. Storyboard-Feature `animate:{param:{from,to}}` in `tickStory()`;
      Akt `zeitraffer` (decay 0→1) + Aufnahme-tauglicher Beispiel-Ablauf.
- [ ] 7. Feuchte-Kopplung `u_mossBoost` (CPU-Akkumulator) + Bleich-Variante
      bei trockenem Klima (Runde-2-`bleach`).
- [ ] 8. `verify.js`: `shot_verfall.png` + neuer `shot_zeitraffer_mitte.png`;
      visuell gegen `1782826101420.png` bewerten; commit + push.
