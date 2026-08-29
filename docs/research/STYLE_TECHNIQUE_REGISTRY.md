# Style-Technique-Registry — Donor-/Provenance-Tabelle

> Menschenlesbares Gegenstück zu `runtime/style/technique-registry.json`
> (Form angelehnt an `docs/research/operators.json` / `EG_DONOR_MATRIX.md`).
> Root-`LICENSE` ist all rights reserved — deshalb wird **kein fremder Code
> eingebettet**. Jede Technik ist unabhängig aus einer veröffentlichten
> Formel/einem veröffentlichten Konzept in `sandbox/passes/style.glsl.js`
> implementiert. Jeder Eintrag trägt `usage: "algorithm-reference"` (eigene
> Implementierung nach veröffentlichter Formel) oder `usage: "research-only"`
> (nicht implementiert, nur Provenance-Dokumentation, kein UI-Dropdown-Eintrag).

## Lizenzklassen

| Klasse | Bedeutung | Konsequenz für die Sandbox |
|---|---|---|
| **A** | Veröffentlichte Formel/klassische Technik (Paper, Lehrbuch, seit Jahrzehnten Allgemeingut) | Frei unabhängig implementierbar, `usage: algorithm-reference` |
| **B** | Permissiv lizenzierte Referenzimplementierung mit eigener Lizenzlogik (z. B. LYGIA — BSD-ähnlich, aber NICHT pauschal als MIT zu behandeln) | Nur als Konzept-Referenz, eigene Implementierung, NIE der LYGIA-Quellcode selbst; `usage: algorithm-reference` |
| **C** | Shadertoy / GodotShaders / Gist — Lizenzlage pro Snippet uneinheitlich/unklar | Nur Konzept, kein Code-Blick auf Zeilenebene übernommen; `usage: research-only`, kein Dropdown-Eintrag |
| **D** | Proprietäre/unklare Lizenz, aber wertvolle Architektur-Idee | Nur als Architektur-/Algorithmus-Donor referenziert, niemals als WebGL-Transplantat |

## Implementierte Techniken (`usage: algorithm-reference`)

| id | Familie | Name | Donor | Lizenzklasse | Budget |
|---|---|---|---|---|---|
| `half-lambert` | lighting | Half-Lambert Diffuse | Valve, Siggraph 2004 Folien | A | FULL/BALANCED/MOBILE/MINIMAL |
| `banded-ramp` | lighting | Banded Diffuse Ramp | klassische NPR-Technik | A | FULL/BALANCED/MOBILE/MINIMAL |
| `hard-cel` | lighting | Hard Cel Shading | klassische Toon-Technik | A | FULL/BALANCED/MOBILE/MINIMAL |
| `ggx-specular` | specular | GGX-artiges Specular | Walter et al. 2007 (Microfacet-Paper) | A | FULL/BALANCED/MOBILE |
| `banded-specular` | specular | Banded Specular | klassische Toon-Technik | A | FULL/BALANCED/MOBILE/MINIMAL |
| `fresnel-rim-soft` | rim | Weicher Fresnel-Rim | Schlick 1994 (Fresnel-Näherung) | A | FULL/BALANCED/MOBILE/MINIMAL |
| `fresnel-rim-hard` | rim | Harter farbiger Rim | Ableitung aus Schlick-Fresnel | A | FULL/BALANCED/MOBILE/MINIMAL |
| `curvature-normal` | normal | Krümmungsverstärkte Normalen | verbreitete Cavity/Curvature-Technik | A | FULL/BALANCED |
| `faceted-normal` | normal | Facettierte Normalen | dFdx/dFdy Flat-Shading | A | FULL/BALANCED/MOBILE/MINIMAL |
| `sobel-outline` | outline | Screen-Space Depth+Normal Outline | Sobel/Feldman ~1968 | A | FULL/BALANCED/MOBILE |
| `gradient-map-palette` | palette | Gradient Map | verbreitete Technik, **u. a. bei LYGIA dokumentiert** | **B** | FULL/BALANCED/MOBILE/MINIMAL |
| `posterize-palette` | palette | Posterize | klassische Bildverarbeitungstechnik | A | FULL/BALANCED/MOBILE/MINIMAL |
| `object-space-breakup` | texture | Objektraum-Breakup | NPR-Technik gegen Screen-Space-Swimming | A | FULL/BALANCED |
| `bloom-grain-post` | post | Bloom + Grain | klassisches Post-Processing | A | FULL/BALANCED/MOBILE |
| `halftone-post` | post | Halftone | Bayer 1973 (Dither-Matrix) | A | FULL/BALANCED/MOBILE/MINIMAL |
| `shadow-ramp-color` | shadow | Warm/Kalt-Schattenrampe | Gooch et al. 1998 (Paper) | A | FULL/BALANCED/MOBILE/MINIMAL |

## Research-only (nicht implementiert, kein UI-Dropdown-Eintrag)

| id | Familie | Donor | Lizenzklasse | Grund |
|---|---|---|---|---|
| `matcap-lookup` | lighting | Matcap/LitSphere-Konzept | C (Shadertoy/GodotShaders) | Nur Konzept dokumentiert; würde eine vorgerenderte Sphärentextur brauchen, die diese Aufgabe nicht liefert |
| `subsurface-wrap` | lighting | Wrap-Lighting-Konzept | C (Shadertoy-Gists) | Nur Konzept dokumentiert; kein eigener Skin-Subsurface-Pass in dieser vertikalen Scheibe |

## Ausdrückliche Einordnungen

- **Crest = Architektur-/Algorithmus-Donor, kein WebGL-Transplantat.** Crest
  (Ocean System) ist kein Eintrag in `technique-registry.json`, weil dort nur
  auswählbare Stilprimitiven stehen (keine toten Dropdown-Einträge). Die
  Architektur-Idee, die die Sandbox von Crest übernimmt, ist die **strikte
  Trennung von Material-/Geometriedaten und Style-Interpretation über
  Zwischen-Buffer** — dieselbe Idee, die hier als G-Buffer→Style-Pass-Trennung
  umgesetzt ist (Lizenzklasse D: proprietäre Lizenzlage, nur als
  Architekturreferenz genutzt, kein Code übernommen).
- **LYGIA = Klasse B, nicht MIT annehmen.** LYGIA ist eine kuratierte
  GLSL-Funktionsbibliothek mit eigener (BSD-ähnlicher, aber nicht identisch
  zu MIT lizenzierter) Lizenzlogik pro Datei. `gradient-map-palette`
  referenziert die dort dokumentierte Gradient-Map-Idee als **Konzept**,
  implementiert aber eine eigene, unabhängige GLSL-Funktion.
- **Shadertoy/GodotShaders/Gists = Klasse C, nur Konzept.** Snippets dort
  haben uneinheitliche/unklare Lizenzen. Beide hier referenzierten Konzepte
  (`matcap-lookup`, `subsurface-wrap`) sind deshalb `researchOnly: true` und
  erscheinen nicht als Dropdown-Option — sie sind reine Provenance-Doku für
  eine mögliche spätere Runde.

## Bezug zu `docs/research/DONOR_LICENSES.md` / `EG_DONOR_MATRIX.md`

Diese Tabelle ist eine eigenständige Registry für die Style-Discovery-Sandbox
(`runtime/style/`, `sandbox/`) und erweitert NICHT die dortigen
Spatial-Kernel-Donor-Einträge — sie folgt nur demselben Muster (Donor →
Lizenzklasse → Integrationsentscheidung).
