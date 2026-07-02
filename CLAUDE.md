# CLAUDE.md – Projektregeln SHADED

SHADED macht aus EINEM 2D-Bild per WebGL-Shader eine lebendige, atmende Szene
(Environmental Storytelling). Kernversprechen: **Bild laden → „✨ Erstellen“ → die Szene lebt.**

## Unverhandelbare Invarianten

1. **Single-File, kein Build-Step.** `index.html` ist die komplette App und muss per
   Doppelklick bzw. `python3 -m http.server` laufen. Keine Bundler, keine npm-Dependencies
   zur Laufzeit, kein Framework. (Playwright wird nur für Tests genutzt, nie im Produkt.)
2. **Eine Material-Wahrheit.** Die CPU-Analyse (`classGrid`, `getMaterialTypeAt`) und die
   GPU-Masken-Texturen entstehen aus DERSELBEN Segmentierung in `analyze()`.
   Niemals eine zweite, unabhängige Klassifikation einführen – genau daran ist der
   Prototyp gestorben (CPU sagte „Gras“, GPU sagte „Stein“).
3. **Kanonische Palette** (Map-Uploads): grass `#16A34A`, foliage `#AA0EB7`, roof `#F97316`,
   path `#DC2626`, wood `#854D0E`, window `#0F766E`, water `#06B6D4`, rock `#475569`.
   **`#F972E9` ist ein historischer Zahlendreher von `#F97316`** und wird nur als
   Legacy-Alias toleriert. Neue Farben werden in `PALETTE` ergänzt, nirgendwo hart codiert.
   Zusätzlich versteht das Zweitbild ein **Marker-Overlay**: eine Szenen-Kopie, in der
   nur die Korrekturstellen übermalt sind (auto-erkannt via Paletten-Abdeckung; nur
   Pixel zählen, die sich vom Original unterscheiden). Pink = Fenster; jede andere
   kanonische Palettenfarbe = lokale Klassen-Korrektur. Marker sind eine Nutzer-Ansage –
   sie haben IMMER Vorrang vor Heuristik-Validierung. Heuristik-Fensterdetektoren sind
   bewusst KONSERVATIV kalibriert: lieber ein fehlendes Fenster (per Overlay nachrüstbar)
   als falsche Glasflecken auf Gebäuden.
4. **Der Prototyp ist eingefroren.** `gaime_shader_editor_pro_v2_6_bio_physics_edition.html`
   dient nur als Ideen-Referenz. Nicht editieren, nicht fixen, nichts blind kopieren –
   seine dokumentierten Bugs (Paletten-Mismatch, `gl.TEXTURE2D+2`, `s-fol-*`-IDs,
   wirkungsloses Trail-Decay) dürfen nicht zurückkehren.
5. **`window.SHADED` ist API-Vertrag** für Tests und Agenten (erstellen, applyAct,
   setParams, setTime, isReady, getMaterialTypeAt, story). Nie entfernen oder umbenennen,
   nur erweitern.
6. **High-Level-Parameter statt Effekt-Schalter.** Neue Stimmungen entstehen aus den
   9 Parametern (`dayNight, storm, rain, wet, puddle, fog, wind, glow, decay`, alle 0..1).
   Neue Systeme (z. B. Schnee) bekommen eigene Parameter im selben Stil und werden in
   Akte/Storyboard integriert – keine Spezial-Codepfade an der Engine vorbei.
7. **Texture-Units:** 0 Szene, 1 maskA, 2 maskB, 3 phys, 4 emis,
   5 Trail-/Störungstextur (Runde 4: R Delle 1.5 s Halbwertszeit, G Impuls 0.4 s,
   B Trampelpfad permanent, A Hitze/Brand ~25 s). Trail-Decay wirkt IMMER direkt
   auf den Pixeldaten – nie über Canvas-Composite-Tricks.

## Verifikations-Workflow (Pflicht nach Shader-/Analyse-Änderungen)

```bash
npm i playwright                 # einmalig (node_modules NICHT committen)
node tools/verify.js             # -> tools/verify-out/shot_<akt>.png
```

Danach die Screenshots mit dem Bild-Tool ANSEHEN und vergleichen:
- `shot_sturmnacht.png` gegen Zielbild `file_00000000b27471f4a8aeb27484b46720.png`
- `shot_danach.png` gegen Zielbild `file_00000000fbc472438dcc92aff24bed6e.png`
- Physik-Referenzen: `1782823262240.png` (Tag), `1782823374309.png` (Nacht)

Kriterien: keine Konsole-/GL-Fehler; Nässe dunkelt poröse Materialien deutlich ab;
Pfützen in Pfad-Senken mit Warmlicht-Spiegelung bei Nacht; Flussnetz auf Pfaden bei Regen;
Nebel diffus zu den Rändern; Szene wirkt in Bewegung nie statisch. Beide Modi testen:
ohne Map (Heuristik) UND mit gemalter Map (`1782824829119.png`).

## Fahrplan (verbindlich, siehe .kiro/specs/)

- Runde 2: Jahreszeiten & Klima (`round-2-seasons-climate`)
- Runde 3: Material Fatigue & Verfall (`round-3-material-fatigue`)
- Runde 4: Interaktion & Ökosystem (`round-4-interaction-ecosystem`)

Jede Runde arbeitet ihre Spec ab: `requirements.md` → `design.md` → `tasks.md`.

## Git

- Branch: `claude/shaded-shader-storytelling-u4n5fs` (Push mit `git push -u origin <branch>`)
- Nie committen: `node_modules/`, `tools/verify-out/`, `package*.json` aus Testläufen.
- Die PNG/JPG-Referenzbilder niemals löschen, umbenennen oder neu komprimieren.
