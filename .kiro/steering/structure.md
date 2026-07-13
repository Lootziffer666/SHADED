# Repo-Struktur & Asset-Rollen

```
index.html                          Die App (Runde 1). Aufbau: CSS → Sidebar-DOM →
                                    JS: PALETTE/PARAMS → Shader → GL-Setup →
                                    analyze() → Storyboard → Blitze → UI →
                                    Render-Loop → window.SHADED
tools/verify.js                     Headless-Verifikation (Playwright)
tools/verify-out/                   Screenshot-Ausgabe (gitignored)
tools/costume-browser.html          Runde 9: lokales Kostüm-Label-Werkzeug (offline)
tools/sprite-exporter.html          Runde 10: Labels -> echte Sprite-Sheet-PNGs (offline, ZIP)
tools/cost-format.mjs               Runde 9: SCUMM-COST-Decoder (getestet, experimentelle Pixel-RLE)
tools/minizip.mjs                   Runde 10: STORE-ZIP-Writer (getestet gg. Python zipfile)
content/*.js                        Reine Erzähl-Inhalte (window.SHADED_*), NICHT in index.html
                                    eingebunden - Engine (Runde 10: Dialog) bleibt generisch
CLAUDE.md                           Regeln für Claude Code (Spiegel dieses Steerings)
README.md                           Menschen-Doku inkl. Fahrplan & LLM-Instruktionen
.claude/skills/shaded-pipeline/     Architektur-Skill (Texturen, Uniforms, Andocken)
.claude/skills/shaded-visual-verify/ Verifikations-Skill
.kiro/steering/                     Dieses Steering
.kiro/specs/round-2..4-*/           Verbindliche Specs der Folge-Runden

gaime_shader_editor_pro_v2_6_bio_physics_edition.html
                                    EINGEFRORENER Prototyp – nur Ideen-Referenz!
```

## Referenzbilder (niemals löschen/umbenennen/neu komprimieren)

| Datei | Rolle |
|---|---|
| `ResizedImage_2026-06-30_10-29-19_2317[41].png` | Ausgangsbild (Dorf, Tag) – Demo-Button lädt es |
| `file_00000000b27471f4a8aeb27484b46720.png` | ZIEL Sturmnacht |
| `file_00000000fbc472438dcc92aff24bed6e.png` | ZIEL Tag danach |
| `1782823262240.png` | Physik-Referenz Tag (Puddle Collection, Bleed-out) |
| `1782823374309.png` | Physik-Referenz Nacht (Flussnetz, Warmlichtreflexe, Nebel) |
| `1782824829119.png` | Selbstgemalte Material-Map (Testfall Map-Modus) |
| `1782826101420.png` | Verfalls-Referenz (Akt `verfall`, Runde 3) |
