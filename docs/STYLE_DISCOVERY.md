# SHADED Style Discovery Sandbox

Eine lauffähige vertikale Scheibe der im Auftrag skizzierten Architektur

```
WorldState → Solver → MaterialResponse → StyleProfile → RenderBudget → Final Render
```

als Beweisfeld, **keine dauerhafte Parallelarchitektur**. `runtime/shaded-engine.mjs`
ist in dieser Aufgabe nicht angefasst worden; die visuelle Baseline
(`tools/verify.js`, `tools/expected-classes.json`) wurde nicht neu gesetzt.
Ein späterer Task darf einen Adapter ergänzen, der dasselbe `StyleProfile` auf
den Produktionsrenderer anwendet.

## Zwei Schichten

1. **`runtime/style/`** — renderer-unabhängiger Kern. Reines ESM, kein DOM/
   WebGL, in Node importierbar und per `node tools/test-style-discovery.mjs`
   getestet.
2. **`sandbox/`** — dünne WebGL2/SDF-Schicht + UI. Kennt keine Stil-Logik
   selbst, sondern füttert `sandbox/passes/style.glsl.js` nur mit
   Uniform-Werten aus einem `StyleProfile`.

## Was tatsächlich implementiert ist

- `runtime/style/world-state.js`: `MaterialKind`-Enum (stone/wood/metal/
  glass/water/skin/fiber/emissive/smoke) + WorldState mit denselben
  Feldnamen wie `runtime/spatial-kernel/world-fields.js` (moisture, water,
  ice, mud, fire, fuelMass, heat, smoke, soot), ergänzt um crack/frost/
  snowCap/rust/damage. Jedes Feld trägt `origin: 'manual' | 'solver'`.
- `runtime/style/material-response.js`: `deriveMaterialResponse(worldState)`
  ist eine reine, stilfreie Funktion. Sie reduziert NICHT auf
  `{baseColor, roughness, reflectance, emission, damage}` — Nässe, Ruß,
  Risse, Frost, Schnee, Rost, Hitze, Feuer, Rauch bleiben als eigene benannte
  Kanäle erhalten (siehe unten, „Korrektur 1").
- `runtime/style/style-profile.js`: 20 Stildimensionen (`STYLE_DIMENSIONS`),
  kategorial (Lighting/Specular/Rim/Normal/Outline/Palette/Texture/Post-Modus)
  und kontinuierlich (Bandzahl, Rampen-Weichheit, Intensitäten, Hue,
  Schatten-Warmton). `toVector()`/`fromVector()` liefern einen
  menschenlesbaren, inspizierbaren Vektor (kategoriale Werte bleiben als
  String erhalten, nicht auf einen Index reduziert).
- `runtime/style/technique-registry.js` + `technique-registry.json`: 18
  TechniqueDescriptor-Einträge (16 implementiert, 2 `researchOnly: true`),
  siehe `docs/research/STYLE_TECHNIQUE_REGISTRY.md` für die
  menschenlesbare Provenance-Tabelle.
- `runtime/style/render-budget.js`: **FULL und MOBILE sind die einzigen
  nutzersichtbaren Budget-Stufen dieser Aufgabe** (Maintainer-Korrektur 3).
  BALANCED/MINIMAL existieren nur im Enum/der Zuordnung auf
  `runtime/spatial-kernel/quality-budget.js`, damit die bestehende
  Budget-Wahrheit nicht dupliziert wird — die Sandbox-UI bietet sie nicht an.
  `substitute(profile, tier)` verändert NUR Kostenfelder (Specular-
  Intensität, Outline-Dicke, Texture-Breakup-Stärke, Post-Intensität,
  Normal-Stärke); `STYLE_IDENTITY_KEYS` (Palette, Bandzahl, Shadow-Warmton,
  Rim-Modus, Lighting-Modus) bleiben bitidentisch.
- `runtime/style/preference-model.js`: pro Dimension ein Score +
  Beobachtungszahl + Konfidenz. Kategoriale Dimensionen laufen über ein
  Elo-artiges Paarupdate; kontinuierliche über einen gewichteten
  Online-Mittelwert + Varianz (Welford).
- `runtime/style/pair-selection.js`: `selectPair(state)` wählt deterministisch
  die aktuell unsicherste Dimension, hält alle anderen Dimensionen auf der
  aktuellen Bestschätzung konstant (Isolation ist damit der Normalfall),
  testet periodisch eine bereits sichere Annahme erneut und dämpft
  Wiederholungen über ein kurzes Fenster. Die A/B-Seitenzuweisung wechselt
  strikt pro Runde (`round % 2`), damit eine Bildschirmpositions-Präferenz
  nie zu einer gelernten Stilvorliebe werden kann.
- `runtime/style/breeding.js`: `breed(parentA, parentB, {mutationRate,
  dimensions})` — Dimension-Crossover, Mutation NUR auf den übergebenen
  (typischerweise unsichersten) Dimensionen.
- `runtime/style/discovery-store.js`: reine `toJSON()`/`fromJSON()`-Persistenz,
  Storage-Adapter injiziert (localStorage im Browser, ein Objekt in Node).
- `runtime/style/seed-profiles.js`: 8 strukturell verschiedene Startprofile
  (intern: soft-toon, hard-cel, painterly, graphic, low-poly-facet,
  matcap-heavy, gooch, pbr-stylized). Die Sandbox-UI zeigt diese Namen
  NIEMALS vor dem Votum.

### Korrektur 1 — MaterialResponse trägt mehr als 5 Felder über die Style-Grenze

`deriveMaterialResponse()` liefert `wetness, charAmount, sootAmount,
crackAmount, frostEdge, snowCap, iceAmount, rustAmount, heatAmount,
fireAmount, smokeAmount, muddiness` zusätzlich zu baseColor/roughness/
reflectance/emission/normalPerturb/damage. Die dünne WebGL2-Schicht kann
diese Kanäle aus Gründen der WebGL2-Mindestgarantie (4 Farb-Attachments)
nicht alle in den G-Buffer packen — sie nutzt stattdessen die im Auftrag
explizit vorgeschlagene **indizierte Response-Tabelle**: Pass 1 schreibt nur
`matIndex` in den G-Buffer, Pass 2 (Style) erhält die vollen semantischen
Kanäle als Uniform-Arrays `u_primWetness[i]`, `u_primChar[i]`,
`u_primCrack[i]`, `u_primFrost[i]`, `u_primSnow[i]`, `u_primRust[i]`,
`u_primHeat[i]`, `u_primFire[i]`, indiziert über `matIndex` — kein Kanal geht
verloren, verschiedene StyleProfiles interpretieren dieselbe Semantik
unterschiedlich (z. B. Nässe als Glanzband bei einem Stil, als reine
Farbabdunkelung bei einem anderen).

### Korrektur 2 — drei architektonische Stufen, drei echte Draws

`sandbox/renderer.js` führt genau drei GPU-Draws aus, die den drei
Architekturstufen entsprechen:

1. **Material/G-Buffer** (`sandbox/passes/gbuffer.glsl.js`) — raymarcht die
   Benchmark-Szene, kennt nur MaterialResponse-Werte, schreibt 4
   RGBA8-Farbziele (G0 baseColor+matIndex, G1 normal+roughness, G2
   reflectance/emission/damage/curvature, G3 codierte Weltposition) plus
   eine echte `DEPTH_COMPONENT24`-Tiefentextur.
2. **Style** (`sandbox/passes/style.glsl.js`, `STYLE_FRAGMENT_SRC`) — liest
   den G-Buffer + die indizierte Response-Tabelle, wendet EIN StyleProfile
   über Uniform-Branches an (kein Shader-Fork pro Stil).
3. **Post** (`sandbox/passes/style.glsl.js`, `POST_FRAGMENT_SRC`) — eigener,
   dritter Draw. Bloom+Grain ODER Halftone, NICHT in den Style-Pass
   gecrammt.

### Korrektur 3 — FULL/MOBILE

Siehe `render-budget.js` oben. Die Sandbox-UI (`sandbox/index.html`) bietet
ausschließlich die Schalter „Budget: FULL" und „Budget: MOBILE" an.

### Korrektur 4 — deterministische Pair-Selection-Tests

`tools/test-style-discovery.mjs` prüft **keine** statistische Abweichung von
Zufall. Stattdessen: eine künstlich sicher gemachte Dimension wird
nachweislich seltener gewählt als eine weiterhin unsichere (mit exakten,
deterministischen Zählungen über 25 Runden), jede Isolationsrunde
unterscheidet sich in exakt einer Dimension (`styleProfilesEqualOnKeys`),
und die sichere Dimension wird trotzdem periodisch erneut getestet
(Re-Test alle 5 Runden).

### Korrektur 5 — Portrait-first

`sandbox/style-lab.css` ist mobile-first: auf schmalen Viewports zeigt die
Sandbox **einen** großen Kandidaten mit einem A/B-Umschalter
(„Kandidat A" / „Kandidat B"), nicht zwei winzige Nebeneinander-Vorschauen.
Ab 760px CSS-Breite schaltet eine Media Query auf echtes Nebeneinander um.
„Letztes Votum rückgängig" ist auf beiden Layouts erreichbar und stellt
Preference-Model, Historie und Runde exakt auf den Zustand vor dem letzten
Votum zurück (Snapshot-basiert, kein Best-Effort-Delta).

**Seitenzuweisung:** `selectPair()` weist die „Baseline" (aktuelle
Bestschätzung) und die „Variante" (isolierte Dimension geändert)
deterministisch abwechselnd A/B zu (`round % 2`). Über mehrere Runden hinweg
landet die Baseline damit weder immer auf A noch immer auf B — eine reine
Bildschirmpositions-Präferenz kann sich nicht in eine gelernte
Stilvorliebe übersetzen.

## Bewusst NICHT enthalten

Kein echter Fluid-/CA-/Erosions-Solver. Alle Weltzustände der Sandbox
(`dry, wet, charred, damaged, frozen, snow`) sind **manuell gesetzte
Presets** (`WORLD_STATE_PRESETS` in `world-state.js`), niemals das Ergebnis
einer Simulation. Jedes WorldState-Feld trägt deshalb `origin: 'manual'` —
nichts wird als Simulation ausgewiesen, was keine ist.

## Bedienung

```bash
python3 -m http.server 8000
# dann /sandbox/index.html öffnen
```

1. **Blindvergleich**: Runden 1–4 vergleichen strukturell unterschiedliche
   Startprofile (breite Signale). Ab Runde 5 (oder sofort mit
   „Isolationsmodus" angehakt) wählt das System die aktuell unsicherste
   Dimension und variiert nur sie.
2. Abstimmen: „Bevorzuge A" / „Bevorzuge B" / „Keine Präferenz". Danach
   werden die internen Stilnamen aufgedeckt und der Grund („Explainability")
   angezeigt. 👍/👎/🤔-Reaktionen sind zusätzlich pro Kandidat möglich.
3. **Eigenes Stilprofil komponieren**: alle 20 Dimensionen direkt einstellen,
   Vorschau rendern, als Favorit speichern, zwei Favoriten kreuzen
   (`breed()`, mutiert nur die aktuell unsichersten Dimensionen).
4. **Vergleichsraster**: „Gleicher Zustand, alle Stile" (ein Weltzustand,
   alle 8 Startprofile) und „Gleicher Stil, alle Zustände" (ein Stil, alle 6
   Presets).
5. **FULL/MOBILE** oben umschalten — Auflösung/Raymarch-Steps sinken
   messbar (Expertenpanel), die Stil-Identität (Palette, Bandzahl,
   Schattenfarbe, Rim-Modus) bleibt exakt erhalten.

## Persistenz & Reproduktion eines Kandidaten

Der gesamte Discovery-Zustand (Preference-Model, Historie inkl. der
StyleProfiles jeder Runde, komponierte Favoriten) liegt unter
`localStorage['shaded-style-discovery-v1']` und wird nach jedem Votum
gespeichert (`DiscoveryStore`). `location.reload()` stellt ihn exakt wieder
her.

Ein Kandidat aus Vergleich N ist exakt rekonstruierbar: `history[N].a`/`.b`
sind vollständige StyleProfiles, `history[N].budgetTier` das damals aktive
Budget. Rendern mit `renderFrame(0)` (fixierte Zeit, kein
`performance.now()`) ist deterministisch — zwei Renderdurchläufe desselben
Kandidaten liefern einen bitidentischen Pixel-Hash
(`window.SHADEDStyleSandbox.reconstructHash(index, side)`).

## Verifikation

```bash
npm i playwright && npx playwright install chromium
npm run check                 # inkl. tools/test-style-discovery.mjs
node tools/verify-sandbox.js  # Screenshots -> tools/verify-out/sandbox_*.png
node tools/verify.js          # Regression: Engine unverändert, Klassen ±10 %
```

`tools/test-style-discovery.mjs` ist deterministisch und browserunabhängig
(Node). `tools/verify-sandbox.js` folgt dem Muster von
`tools/verify-editor.js` (HTTP-Server + Playwright/Chromium+SwiftShader,
PASS/FAIL je Kriterium, Exit-Code ≠ 0 bei FAIL) und prüft zusätzlich einen
schmalen mobilen Viewport (390×844).
