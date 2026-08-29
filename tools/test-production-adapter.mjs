// Deterministischer Node-Test fuer runtime/style/production-adapter.js — die
// Bruecke zwischen runtime/style/ (WorldState -> MaterialResponse ->
// StyleProfile -> RenderBudget) und der Produktions-Engine. Kein DOM/WebGL,
// reine Logikpruefung. Nutzung: node tools/test-production-adapter.mjs
import {
  SHADED_CLASSES, SHADED_CLASS_TO_MATERIAL_KIND,
  worldStateForShadedClass, deriveProductionMaterialResponses,
  specularWeightsForShader, styleUniformsForShader,
} from '../runtime/style/production-adapter.js';
import { defaultStyleProfile, setDimension } from '../runtime/style/style-profile.js';

let failed = false;
function check(name, ok, detail) {
  console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed = true;
}

console.log('=== production-adapter.js Regressionstest ===\n');

console.log('Test 1: SHADED-Klasse -> MaterialKind-Abbildung deckt alle 8 CLASSES ab');
const EXPECTED_CLASSES = ['grass', 'foliage', 'roof', 'path', 'wood', 'window', 'water', 'rock'];
check('alle 8 SHADED-Klassen abgebildet', EXPECTED_CLASSES.every((c) => c in SHADED_CLASS_TO_MATERIAL_KIND),
      Object.keys(SHADED_CLASS_TO_MATERIAL_KIND));
check('SHADED_CLASSES stimmt mit dem Mapping ueberein', SHADED_CLASSES.length === EXPECTED_CLASSES.length);

console.log('\nTest 2: worldStateForShadedClass() ist rein (kein Solver-Ursprung, CUR-Werte durchgereicht)');
const curDry = { wet: 0, puddle: 0, temperature: 0.6, snow: 0, snowfall: 0, decay: 0 };
const wsDry = worldStateForShadedClass('wood', curDry);
check('origin bleibt manual (CUR ist kein Solver)', wsDry.fields.moisture.origin === 'manual');
check('moisture folgt CUR.wet', wsDry.fields.moisture.value === 0);
const curWet = { wet: 0.8, puddle: 0.5, temperature: 0.6, snow: 0, snowfall: 0, decay: 0 };
const wsWet = worldStateForShadedClass('wood', curWet);
check('moisture folgt CUR.wet (nass)', wsWet.fields.moisture.value === 0.8);
check('water = wet*puddle', Math.abs(wsWet.fields.water.value - 0.4) < 1e-9, wsWet.fields.water.value);

console.log('\nTest 3: deriveProductionMaterialResponses() liefert 8 echte MaterialResponses aus CUR');
const responsesDry = deriveProductionMaterialResponses(curDry);
check('acht Antworten, eine je SHADED-Klasse', Object.keys(responsesDry).length === 8);
check('trockene Szene: wetness ueberall 0', EXPECTED_CLASSES.every((c) => responsesDry[c].wetness === 0));
const responsesWet = deriveProductionMaterialResponses(curWet);
check('nasse Szene: wetness > 0 fuer alle Klassen (Feld ist klassenunabhaengig)',
      EXPECTED_CLASSES.every((c) => responsesWet[c].wetness > 0));
check('Holz dunkelt bei Naesse ab (baseColor sinkt)', responsesWet.wood.baseColor[0] < responsesDry.wood.baseColor[0],
      { dry: responsesDry.wood.baseColor, wet: responsesWet.wood.baseColor });

console.log('\nTest 4: specularWeightsForShader() -- materialabhaengige Streuung statt Gleichgewichtung,');
console.log('PLUS die beim Verifizieren gegen das Zielbild gefundene Dachziegel-Korrektur (glasiert');
console.log('glaenzt mehr als rohes Pflaster/Fels, obwohl beide MaterialKind.STONE sind).');
const weightsDry = specularWeightsForShader(responsesDry);
check('vier gated Klassen vorhanden', ['roof', 'path', 'rock', 'wood'].every((c) => c in weightsDry));
check('path/rock identisch gewichtet (beide roh, keine Finish-Korrektur)',
      weightsDry.path === weightsDry.rock, weightsDry);
check('roof glaenzt staerker als path/rock (Finish-Korrektur: glasierte Ziegel vs. rohes Material)',
      weightsDry.roof > weightsDry.path, weightsDry);
check('Holz wiegt schwerer als rohes Pflaster/Fels (weicheres, glatteres Material)', weightsDry.wood > weightsDry.path, weightsDry);
check('roof ist die staerkste Gewichtung (glasierte Dachziegel, Zielbild-Vergleich)',
      weightsDry.roof > weightsDry.wood && weightsDry.roof > weightsDry.rock, weightsDry);

console.log('\nTest 5: styleUniformsForShader() mit Default-StyleProfile bei FULL reproduziert SHADEDs alten');
console.log('hartkodierten Maximalwert (0.28) exakt -- das Default-Profil ist eine nachweisbare Fortsetzung');
console.log('des bisherigen Verhaltens, keine stille Neukalibrierung.');
const profile = defaultStyleProfile('test', 'Test');
const uniformsFull = styleUniformsForShader(profile, 'FULL', responsesDry);
check('specStyleIntensity(FULL, default) == 0.28 (alter Maximalwert)',
      Math.abs(uniformsFull.specStyleIntensity - 0.28) < 1e-9, uniformsFull.specStyleIntensity);
check('specStyleMode(default) == 0 (ggx, nicht banded)', uniformsFull.specStyleMode === 0);
check('shadowWarmth(default) == 0', uniformsFull.shadowWarmth === 0);

console.log('\nTest 6: RenderBudget MOBILE skaliert specular.intensity (Kostenfeld) um 0.6, laesst');
console.log('shadow.warmth (Identitaetsfeld) UNVERAENDERT -- das ist der Kern von Aufgabe 5 der');
console.log('Produktionsintegration: Stil-Identitaet bleibt ueber Budget-Stufen hinweg erhalten.');
const warmProfile = setDimension(setDimension(profile, 'shadow.warmth', 0.7), 'specular.mode', 'banded');
const uniformsFullWarm = styleUniformsForShader(warmProfile, 'FULL', responsesDry);
const uniformsMobileWarm = styleUniformsForShader(warmProfile, 'MOBILE', responsesDry);
check('specStyleMode == 1 (banded) uebernommen', uniformsFullWarm.specStyleMode === 1);
check('MOBILE: specStyleIntensity == FULL * 0.6', Math.abs(uniformsMobileWarm.specStyleIntensity - uniformsFullWarm.specStyleIntensity * 0.6) < 1e-9,
      { full: uniformsFullWarm.specStyleIntensity, mobile: uniformsMobileWarm.specStyleIntensity });
check('shadowWarmth identisch bei FULL und MOBILE (Identitaetsfeld, budget-unabhaengig)',
      uniformsFullWarm.shadowWarmth === uniformsMobileWarm.shadowWarmth && uniformsFullWarm.shadowWarmth === 0.7);
check('specWeight-Felder identisch bei FULL und MOBILE (haengen nur von MaterialResponse ab, nicht vom Budget)',
      uniformsFullWarm.specWeightWood === uniformsMobileWarm.specWeightWood
      && uniformsFullWarm.specWeightRoof === uniformsMobileWarm.specWeightRoof);

console.log();
console.log(failed ? '❌ test-production-adapter FAILED' : '✅ test-production-adapter PASSED');
process.exit(failed ? 1 : 0);
