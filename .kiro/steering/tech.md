# Tech-Stack & Invarianten

## Stack

- **Eine Datei:** `index.html` – Vanilla JS + WebGL 1, kein Framework, kein
  Build-Step, keine Laufzeit-Dependencies. Muss per Doppelklick und per
  `python3 -m http.server` laufen.
- Tests: Playwright (nur dev, nie committen) + `tools/verify.js`.

## Unverhandelbare Invarianten

1. **Eine Material-Wahrheit:** CPU (`classGrid`, `SHADED.getMaterialTypeAt`) und
   GPU-Masken entstehen aus DERSELBEN Segmentierung in `analyze()`. Niemals eine
   zweite Klassifikation einführen (der eingefrorene Prototyp ist genau daran
   gescheitert).
2. **Kanonische Palette** für Material-Maps:
   grass `#16A34A` · foliage `#AA0EB7` · roof `#F97316` · path `#DC2626` ·
   wood `#854D0E` · window `#0F766E` · water `#06B6D4` · rock `#475569`.
   `#F972E9` ist ein historischer Zahlendreher von `#F97316` (nur Legacy-Alias).
   Farben leben ausschließlich in `PALETTE`.
3. **`window.SHADED` ist API-Vertrag** (erstellen, applyAct, setParams, setTime,
   isReady, getMaterialTypeAt, story) – nur erweitern, nie brechen.
4. **9 High-Level-Parameter** (`dayNight, storm, rain, wet, puddle, fog, wind,
   glow, decay`; alle 0..1) steuern alles. Neue Systeme bekommen neue Parameter
   im selben Stil (PARAMS + PARAM_META → Slider & Uniform automatisch).
5. **Texture-Units:** 0 Szene, 1 maskA, 2 maskB, 3 phys, 4 emis,
   **5 reserviert** für die Trail-/Störungstextur (Runde 4).
6. **Prototyp eingefroren:** `gaime_shader_editor_pro_v2_6_bio_physics_edition.html`
   nie editieren; bekannte Bugs (gl.TEXTURE2D+2, s-fol-*-IDs, Screen-Composite-
   Decay, Paletten-Mismatch) nicht zurückholen.

## Befehle

```bash
python3 -m http.server 8000     # App lokal serven
npm i playwright                # einmalig für Tests
node tools/verify.js            # Pflicht-Verifikation, siehe visual-verification.md
```

## Git

Branch `claude/shaded-shader-storytelling-u4n5fs`; nie committen:
`node_modules/`, `tools/verify-out/`, `package*.json`. Referenzbilder im Root
niemals löschen/umbenennen/neu komprimieren.
