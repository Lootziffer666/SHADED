// SHADED Style Discovery — Produktionsadapter (renderer-unabhängiger Kern).
//
// Die einzige Brücke zwischen runtime/style/ (WorldState -> MaterialResponse ->
// StyleProfile -> RenderBudget) und der echten Produktions-Engine
// (runtime/shaded-engine.mjs). Kein DOM/WebGL hier — reines ESM, in Node
// testbar, exakt wie der Rest von runtime/style/.
//
// WICHTIG (Invariante 2): dieser Adapter erzeugt PARAMETER für den bestehenden
// Fragmentshader, NIEMALS eine zweite Materialklassifikation. classGrid und
// getMaterialTypeAt() bleiben die einzige Quelle für "was ist wo" — dieser
// Adapter beantwortet nur "wie soll das, was schon klassifiziert ist,
// aussehen". Er ersetzt auch keine Weltsimulation: CUR (Tag/Nacht, Nässe,
// Verfall, ...) bleibt SHADEDs eigener Weltzustand; WorldState/MaterialResponse
// übersetzen diesen nur in die stilfreie Materialantwort, auf der StyleProfile
// aufbaut (docs/STYLE_DISCOVERY.md).
//
// Diese erste Anbindung migriert GENAU EINEN bestehenden Legacy-Effekt
// (Specular-Sheen, siehe CLAUDE.md "Effekt-Reihenfolge im
// LegacyCompositePass" Schritt 3) auf die neue Architektur — kein Big Bang.
// Weitere Effekte (z. B. die Nässe-Abdunklung selbst) folgen als eigene,
// einzeln verifizierte Schritte; siehe docs/STYLE_DISCOVERY.md für den Stand.

import { MaterialKind, createWorldState } from './world-state.js';
import { deriveMaterialResponse } from './material-response.js';
import { substitute } from './render-budget.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

// SHADEDs klassifizierte Materialklassen (CLASSES in shaded-engine.mjs) sind
// KEIN 1:1-Abbild der Style-Schicht MaterialKind-Taxonomie (die für die zehn
// abstrakten Sandbox-Benchmark-Primitive gedacht ist). Die Abbildung ist eine
// bewusste, dokumentierte Näherung, keine neue Wahrheit: grass/foliage sind
// organisch (FIBER), wood ist wood, window ist glass, water ist water; roof/
// path/rock haben in classGrid keine feinere Unterscheidung (Ziegel/Schiefer/
// Pflaster/Fels) und werden konservativ als STONE gefuehrt.
export const SHADED_CLASS_TO_MATERIAL_KIND = Object.freeze({
  grass: MaterialKind.FIBER,
  foliage: MaterialKind.FIBER,
  roof: MaterialKind.STONE,
  path: MaterialKind.STONE,
  wood: MaterialKind.WOOD,
  window: MaterialKind.GLASS,
  water: MaterialKind.WATER,
  rock: MaterialKind.STONE,
});

export const SHADED_CLASSES = Object.freeze(Object.keys(SHADED_CLASS_TO_MATERIAL_KIND));

// CUR (SHADEDs globale, geblendete Weltparameter, siehe runtime/shaded-engine.mjs
// CUR={...PARAMS}) -> WorldState-Felder. CUR ist EIN Skalarsatz für die ganze
// Szene (kein Grid) — exakt die Granularität, die WorldState laut eigenem
// Kopfkommentar für "kein Solver, jeder Zustand ist eine manuell gesetzte
// Vorgabe" vorsieht. origin bleibt deshalb konsequent 'manual': CUR sind
// Timeline-/Sliderwerte, kein Simulationsergebnis (world-state.js verbietet
// es nicht, aber es waere unehrlich, hier 'solver' zu behaupten).
export function worldStateForShadedClass(shadedClass, curParams) {
  const materialKind = SHADED_CLASS_TO_MATERIAL_KIND[shadedClass];
  if (!materialKind) throw new Error(`Unbekannte SHADED-Materialklasse: ${shadedClass}`);
  const wet = clamp01(curParams.wet);
  const cold = clamp01(curParams.temperature) < 0.42; // siehe shaded-engine.mjs Frost-Schwelle (~1 °C)
  return createWorldState({
    materialKind,
    origin: 'manual',
    fields: {
      moisture: wet,
      water: wet * clamp01(curParams.puddle),
      mud: wet > 0.5 ? (wet - 0.5) * 0.6 : 0,
      ice: cold ? clamp01(curParams.snow) * 0.5 : 0,
      frost: cold ? clamp01(0.42 - clamp01(curParams.temperature)) : 0,
      snowCap: clamp01(curParams.snowfall),
      rust: clamp01(curParams.decay),
      damage: clamp01(curParams.decay),
      crack: curParams.decay > 0.3 ? clamp01(curParams.decay - 0.3) : 0,
      soot: 0, heat: 0, fire: 0, fuelMass: 0, smoke: 0,
    },
  });
}

// Eine echte MaterialResponse je SHADED-Klasse, aus CUR abgeleitet — acht
// billige Objektaufrufe pro Frame (kein Grid, kein Pro-Pixel-Aufwand). Das
// ist der tatsaechliche "existing World/Material state -> MaterialResponse"-
// Schritt aus dem Produktions-Integrationsplan.
export function deriveProductionMaterialResponses(curParams) {
  const out = {};
  for (const shadedClass of SHADED_CLASSES) {
    out[shadedClass] = deriveMaterialResponse(worldStateForShadedClass(shadedClass, curParams));
  }
  return out;
}

// --- Migration 1: Specular-Sheen (siehe CLAUDE.md LegacyCompositePass #3) ---
//
// Der bisherige Shader-Code gewichtete roof/path/rock/wood GLEICH (Summe der
// vier Masken, kein Unterschied zwischen den Materialien) und nutzte eine
// hartkodierte Intensitaet (0.28 - 0.16*night). Diese Migration ersetzt beides:
// - die relative Staerke je Material kommt jetzt aus der ECHTEN
//   MaterialResponse (rauer/reflektionsaermer = schwaecherer Glanz, glatter/
//   reflektiver = staerker) statt aus vier gleich gewichteten Masken,
// - die Gesamt-Intensitaet und die Kurvenform (glatt vs. gebändert) kommen aus
//   dem StyleProfile (specular.intensity / specular.mode), ueber
//   RenderBudget.substitute() budget-abhaengig skaliert.
//
// Das ist eine ARCHITEKTURAENDERUNG, keine unsichtbare Umbenennung: die vier
// Materialien glaenzen jetzt unterschiedlich stark (Holz sichtbar mehr als
// Stein, siehe Kalibrierung unten), nicht mehr identisch wie zuvor. Deshalb
// PFLICHT vor dem Entfernen des alten Codes: visuell gegen den aktuellen
// Stand verifizieren (tools/verify-style-adapter.js), nicht blind ersetzen.
const SPECULAR_GATED_CLASSES = Object.freeze(['roof', 'path', 'rock', 'wood']);

function specularResponseWeight(materialResponse) {
  // Glatter (niedrige roughness) UND reflektiver Material zeigt einen
  // staerkeren, engeren Glanzpunkt -- dieselbe qualitative Beziehung, die
  // jede Cook-Torrance/GGX-artige Spekularantwort voraussetzt (nicht die
  // exakte Formel des Sandbox-ggx-specular-Passes, der reale Normalen/
  // Lichtvektoren braucht, die SHADEDs 2D-Kompositor-Shader nicht hat).
  return (1 - materialResponse.roughness) * (0.15 + materialResponse.reflectance);
}

// Kalibrierungskonstante: bei Wetness=0 (trocken) so normiert, dass der
// MITTLERE Gewichtsfaktor der vier gated Klassen 1.0 ergibt -- dieselbe
// Groessenordnung wie die alte Gleichgewichtung (mRoof+mPath+mRock+mWood),
// aber mit echter, materialabhaengiger Streuung statt Gleichheit. Einmal aus
// MATERIAL_BASE (material-response.js) von Hand berechnet, hier als Konstante
// hinterlegt statt bei jedem Frame neu zu mitteln -- die Basiswerte je
// MaterialKind sind statisch, nur wetness/decay/... variieren pro Frame.
const SPECULAR_WEIGHT_NORMALIZER = 1 / 0.034875;

// Oberflaechenfinish-Korrektur, GEFUNDEN beim Pflicht-Verifikationsschritt
// (tools/verify.js, shot_sturmnacht.png gegen das Zielbild
// file_00000000b27471f4a8aeb27484b46720.png): roof/path/rock teilen sich in
// der abstrakten MaterialKind-Taxonomie (world-state.js, fuer die zehn
// Sandbox-Benchmark-Primitive gedacht) alle STONE -- das Zielbild zeigt aber
// glasierte Dachziegel deutlich glaenzender als rohes Pflaster/Fels. Die
// Taxonomie kennt "glasiert vs. roh" nicht; ohne Korrektur waeren Daecher
// SICHTBAR STUMPFER als vorher (die alte Gleichgewichtung kannte diesen
// Unterschied nicht, aber deckte roof wenigstens gleich stark ab wie path/
// rock). Das ist kein Rueckfall in eine zweite Materialwahrheit (classGrid
// bleibt unberuehrt) -- nur eine dokumentierte, bildkanon-begruendete
// Verfeinerung INNERHALB der Style-Schicht, dort wo die generische Taxonomie
// zu grob ist.
const SPECULAR_SURFACE_FINISH = Object.freeze({ roof: 2.2, path: 1.0, rock: 1.0, wood: 1.0 });

export function specularWeightsForShader(materialResponses) {
  const weights = {};
  for (const shadedClass of SPECULAR_GATED_CLASSES) {
    const response = materialResponses[shadedClass];
    weights[shadedClass] = specularResponseWeight(response) * SPECULAR_WEIGHT_NORMALIZER * SPECULAR_SURFACE_FINISH[shadedClass];
  }
  return weights;
}

// Rueckrechnung von StyleProfile.specular.intensity (0..1) auf SHADEDs
// bisherige Sheen-Groessenordnung: bei intensity=0.5 (Default-Profil) ergibt
// 0.5*0.56=0.28 -- exakt der alte hartkodierte Maximalwert. Damit ist das
// Default-Profil eine nachweisbare Fortsetzung des bisherigen Verhaltens,
// keine stille Neukalibrierung.
const SPECULAR_INTENSITY_TO_SHADER_SCALE = 0.56;
// Verhaeltnis 0.16/0.28 aus der alten Formel (0.28 - 0.16*night) -- die
// Nacht-Abdunklung ist ein Weltzustands-Fakt (CUR.dayNight), kein Stil-Fakt,
// und bleibt deshalb strukturell erhalten statt Teil des StyleProfiles zu
// werden.
export const SPECULAR_NIGHT_DIM_RATIO = 0.16 / 0.28;

// Fasst StyleProfile + RenderBudget + MaterialResponse zu genau den Werten
// zusammen, die der Shader als Uniforms braucht. Absichtlich NUR die eine
// Dimension (specular.*) und die eine Identitaets-Dimension (shadow.warmth),
// die diese erste Migration tatsaechlich anschliesst -- Palette/Bänder/Rim/
// Outline/Post sind bewusst NICHT Teil dieses Schritts (naechste Effekte).
export function styleUniformsForShader(profile, budgetTier, materialResponses) {
  const { profile: resolved } = substitute(profile, budgetTier);
  const weights = specularWeightsForShader(materialResponses);
  return {
    specStyleIntensity: resolved.specular.intensity * SPECULAR_INTENSITY_TO_SHADER_SCALE,
    specStyleMode: resolved.specular.mode === 'banded' ? 1 : 0,
    specWeightRoof: weights.roof,
    specWeightPath: weights.path,
    specWeightRock: weights.rock,
    specWeightWood: weights.wood,
    // shadow.warmth ist ein STYLE_IDENTITY_KEY (style-profile.js) -- substitute()
    // laesst es unangetastet, resolved.shadow.warmth === profile.shadow.warmth
    // gilt fuer JEDES Budget. Genau das ist der budget-unabhaengige Teil, den
    // Punkt 5 der Produktionsintegration beweisen soll.
    shadowWarmth: resolved.shadow.warmth,
  };
}
