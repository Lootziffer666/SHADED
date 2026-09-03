// Selbsttest für die Style-Discovery-Sandbox (runtime/style/ + Contracts).
// Deterministisch, keine Browser-/WebGL-Abhängigkeit — die dünne
// WebGL2-Schicht wird separat per tools/verify-sandbox.js geprüft.
// Nutzung: node tools/test-style-discovery.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

import { MaterialKind, createWorldState, createPresetWorldState, cloneWorldState, worldStatesEqual } from '../runtime/style/world-state.js';
import { deriveMaterialResponse } from '../runtime/style/material-response.js';
import {
  STYLE_DIMENSIONS, STYLE_IDENTITY_KEYS, defaultStyleProfile, validateStyleProfile,
  serializeStyleProfile, deserializeStyleProfile, toVector, fromVector, setDimension, getDimension,
  styleProfilesEqualOnKeys,
} from '../runtime/style/style-profile.js';
import { substitute, STYLE_COST_KEYS, preservesIdentity, STYLE_BUDGET_TIERS } from '../runtime/style/render-budget.js';
import { fromSeed, serialize as serializeCandidate, hash as hashCandidate } from '../runtime/style/candidate.js';
import { PreferenceModel } from '../runtime/style/preference-model.js';
import { selectPair } from '../runtime/style/pair-selection.js';
import { breed } from '../runtime/style/breeding.js';
import { DiscoveryStore, createDiscoveryState, createMemoryStorageAdapter, toJSON as discoveryToJSON, fromJSON as discoveryFromJSON } from '../runtime/style/discovery-store.js';
import { seedProfiles, SEED_PROFILE_NAMES } from '../runtime/style/seed-profiles.js';
import { validateRegistry, implementedOnly } from '../runtime/style/technique-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('✗ FAIL:', msg); failures++; }
  else console.log('✓ ok:', msg);
}
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// --- 1. deriveMaterialResponse ist rein und stilunabhängig ---------------
{
  const ws = createPresetWorldState(MaterialKind.WOOD, 'wet');
  const r1 = deriveMaterialResponse(ws);
  const r2 = deriveMaterialResponse(ws);
  assert(deepEqual(r1, r2), 'deriveMaterialResponse liefert für denselben WorldState identische Response');
  assert(deriveMaterialResponse.length === 1, 'deriveMaterialResponse hat nur den WorldState als Eingabe (kein Stil-Parameter)');

  const wsClone = cloneWorldState(ws);
  deriveMaterialResponse(ws);
  deriveMaterialResponse(wsClone);
  assert(worldStatesEqual(ws, wsClone), 'deriveMaterialResponse mutiert den WorldState nicht (Aufruf mit zwei „Stilen“ simuliert)');

  const semanticKeys = ['wetness', 'charAmount', 'crackAmount', 'frostEdge', 'snowCap', 'rustAmount'];
  assert(semanticKeys.every((k) => k in r1), 'MaterialResponse behält semantische Kanäle (Nässe/Ruß/Risse/Frost/Schnee/Rost) über die Style-Grenze hinweg (Korrektur 1)');
}

// --- 2. Stilwechsel verändert den WorldState nicht (Deep-Equal vor/nach) --
{
  const ws = createPresetWorldState(MaterialKind.METAL, 'damaged', { rust: 0.6 });
  const before = cloneWorldState(ws);
  const profileA = defaultStyleProfile('a', 'a');
  const profileB = setDimension(profileA, 'lighting.mode', 'hardCel');
  deriveMaterialResponse(ws); // "gerendert" mit Profil A
  deriveMaterialResponse(ws); // "gerendert" mit Profil B — derselbe WorldState
  assert(worldStatesEqual(before, ws), 'WorldState bleibt über einen Stilwechsel hinweg unverändert (Deep-Equal)');
  assert(profileA.lighting.mode !== profileB.lighting.mode, 'Sanity: die beiden Stile unterscheiden sich tatsächlich');
}

// --- 3. Kandidat aus Seed ist bitidentisch reproduzierbar -----------------
{
  const c1 = fromSeed(1337);
  const c2 = fromSeed(1337);
  assert(serializeCandidate(c1) === serializeCandidate(c2), 'fromSeed(seed) liefert bitidentisch dieselbe Serialisierung');
  assert(hashCandidate(c1) === hashCandidate(c2), 'fromSeed(seed) liefert denselben Hash');
  const c3 = fromSeed(1338);
  assert(hashCandidate(c1) !== hashCandidate(c3), 'unterschiedliche Seeds liefern (praktisch immer) unterschiedliche Hashes');
}

// --- 4. StyleProfile: Validierung, Serialisierung, Vektor-Roundtrip -------
{
  const p = defaultStyleProfile('t', 't');
  assert(validateStyleProfile(p).ok, 'defaultStyleProfile() validiert gegen sich selbst');
  const json = serializeStyleProfile(p);
  const back = deserializeStyleProfile(json);
  assert(deepEqual(p, back), 'serializeStyleProfile/deserializeStyleProfile ist verlustfrei');
  const vec = toVector(p);
  assert(vec.length === STYLE_DIMENSIONS.length, 'toVector() hat einen Eintrag pro STYLE_DIMENSIONS');
  const p2 = fromVector(vec, 't2', 't2');
  assert(STYLE_DIMENSIONS.every((d) => getDimension(p2, d.key) === getDimension(p, d.key)), 'fromVector(toVector(p)) reproduziert alle Dimensionswerte');
}

// --- 5. Preference-Model konvergiert, ein einzelner Vote setzt keine Absolutregel ---
{
  const model = new PreferenceModel();
  const a = setDimension(defaultStyleProfile('a', 'a'), 'lighting.mode', 'halfLambert');
  const b = setDimension(defaultStyleProfile('b', 'b'), 'lighting.mode', 'hardCel');
  const confBefore = model.confidence('lighting.mode');
  model.update({ a, b, winner: 'a' });
  const confAfterOne = model.confidence('lighting.mode');
  assert(confAfterOne < 0.9, 'ein einzelner Vote treibt die Konfidenz nicht sofort auf ein Maximum (keine Absolutregel)');
  assert(confAfterOne > confBefore, 'ein Vote erhöht die Konfidenz gegenüber vorher (auch wenn nur leicht)');
  for (let i = 0; i < 30; i++) model.update({ a, b, winner: 'a' });
  const confAfterMany = model.confidence('lighting.mode');
  assert(confAfterMany > confAfterOne, 'konsistente Votes erhöhen die Konfidenz weiter (Konvergenz)');
  assert(model.estimate('lighting.mode') === 'halfLambert', 'Preference-Model konvergiert auf die konsistent bevorzugte Option');

  const cont = new PreferenceModel();
  const ca = setDimension(defaultStyleProfile('ca', 'ca'), 'rim.width', 0.1);
  const cb = setDimension(defaultStyleProfile('cb', 'cb'), 'rim.width', 0.9);
  for (let i = 0; i < 20; i++) cont.update({ a: ca, b: cb, winner: 'b' });
  assert(Math.abs(cont.estimate('rim.width') - 0.9) < 0.15, 'kontinuierliche Dimension konvergiert Richtung des konsistent bevorzugten Werts');
}

// --- 6. pair-selection: unsicherste Dimension zuerst, Isolation, Re-Test-Dämpfung ---
{
  const model = new PreferenceModel();
  // "lighting.mode" künstlich sicher machen (viele konsistente Votes), Rest bleibt unsicher.
  const a = setDimension(defaultStyleProfile('a', 'a'), 'lighting.mode', 'halfLambert');
  const b = setDimension(defaultStyleProfile('b', 'b'), 'lighting.mode', 'hardCel');
  for (let i = 0; i < 40; i++) model.update({ a, b, winner: 'a' });
  const confidentKey = 'lighting.mode';
  const others = STYLE_DIMENSIONS.map((d) => d.key).filter((k) => k !== confidentKey);
  const mostUncertainOther = others.reduce((best, k) => (model.uncertainty(k) > model.uncertainty(best) ? k : best), others[0]);
  assert(model.uncertainty(confidentKey) < model.uncertainty(mostUncertainOther), 'Sanity: die künstlich trainierte Dimension ist tatsächlich sicherer als die übrigen');

  const firstPair = selectPair({ model, round: 0, history: [] });
  assert(firstPair.isolatedDimension !== confidentKey, 'die unsicherste (nicht die bereits sichere) Dimension wird zuerst gewählt');
  assert(firstPair.isolatedDimension === mostUncertainOther, 'selectPair wählt deterministisch genau die unsicherste Dimension');

  // Isolation: a/b unterscheiden sich in GENAU der isolierten Dimension.
  const restEqual = styleProfilesEqualOnKeys(firstPair.a, firstPair.b, STYLE_DIMENSIONS.map((d) => d.key).filter((k) => k !== firstPair.isolatedDimension));
  const targetDiffers = getDimension(firstPair.a, firstPair.isolatedDimension) !== getDimension(firstPair.b, firstPair.isolatedDimension);
  assert(restEqual, 'selectPair hält alle Dimensionen außer der isolierten konstant');
  assert(targetDiffers, 'die isolierte Dimension unterscheidet sich tatsächlich zwischen a und b');

  // Re-Test-Dämpfung: die sichere Dimension wird über viele Runden hinweg
  // seltener gewählt als eine weiterhin unsichere Dimension.
  let history = [];
  const chosenCounts = {};
  for (let round = 0; round < 25; round++) {
    const pair = selectPair({ model, round, history });
    chosenCounts[pair.isolatedDimension] = (chosenCounts[pair.isolatedDimension] || 0) + 1;
    history.push(pair);
  }
  const confidentCount = chosenCounts[confidentKey] || 0;
  const uncertainCount = chosenCounts[mostUncertainOther] || 0;
  assert(confidentCount < uncertainCount, `bereits sichere Dimension „${confidentKey}“ wird seltener abgefragt (${confidentCount}x) als eine weiterhin unsichere (${uncertainCount}x)`);
  assert(confidentCount > 0, 'die sichere Dimension wird trotzdem periodisch erneut getestet (Re-Test), nicht nie mehr');
}

// --- 7. RenderBudget.substitute: Identitätsfelder bleiben, nur Kostenfelder ändern sich ---
{
  const profile = defaultStyleProfile('t', 't');
  const { profile: fullProfile } = substitute(profile, STYLE_BUDGET_TIERS.FULL);
  const { profile: mobileProfile } = substitute(profile, STYLE_BUDGET_TIERS.MOBILE);
  assert(preservesIdentity(profile, mobileProfile), 'Stil-Identitätsfelder (Palette, Bandzahl, Shadow-Color, Rim-Modus) bleiben bei MOBILE unverändert');
  assert(preservesIdentity(profile, fullProfile), 'Stil-Identitätsfelder bleiben auch bei FULL unverändert (Referenzfall)');
  assert(deepEqual(fullProfile, profile), 'FULL substituiert Kostenfelder mit Faktor 1 — Profil bleibt exakt gleich');

  let anyCostReduced = false;
  for (const key of STYLE_COST_KEYS) {
    const [group, field] = key.split('.');
    const baseVal = profile[group][field];
    const mobileVal = mobileProfile[group][field];
    if (baseVal > 0 && mobileVal < baseVal) anyCostReduced = true;
  }
  assert(anyCostReduced, 'MOBILE reduziert mindestens ein Kostenfeld gegenüber FULL (billigere Mittel, gleicher Stil)');
  assert(!STYLE_IDENTITY_KEYS.some((k) => STYLE_COST_KEYS.includes(k)), 'Sanity: Identitätsfelder und Kostenfelder überschneiden sich nicht');
}

// --- 8. discovery-store Round-Trip ist verlustfrei -------------------------
{
  const model = new PreferenceModel();
  const a = defaultStyleProfile('a', 'a');
  const b = setDimension(defaultStyleProfile('b', 'b'), 'palette.mode', 'posterize');
  model.update({ a, b, winner: 'b' });
  const state = createDiscoveryState({ preferenceModelState: model.toJSON(), history: [{ round: 0, isolatedDimension: 'palette.mode', winner: 'b' }], round: 1, customProfiles: [a] });
  const store = new DiscoveryStore(createMemoryStorageAdapter());
  store.save(state);
  const loaded = store.load();
  assert(deepEqual(state, loaded), 'DiscoveryStore.save()/load() ist ein verlustfreier Round-Trip');
  assert(deepEqual(discoveryFromJSON(discoveryToJSON(state)), state), 'toJSON()/fromJSON() pur ist ebenfalls verlustfrei');
}

// --- 9. Registry validiert gegen ihr Schema; keine C/D-Einträge mit direct/port ---
{
  const registry = JSON.parse(fs.readFileSync(path.join(REPO, 'runtime/style/technique-registry.json'), 'utf8'));
  const { ok, errors } = validateRegistry(registry);
  assert(ok, `technique-registry.js validiert die eigene Registry ohne Fehler${ok ? '' : `: ${errors.join('; ')}`}`);

  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'contracts/shaded-technique-registry.schema.json'), 'utf8'));
  const validate = ajv.compile(schema);
  const schemaOk = validate(registry);
  assert(schemaOk, `Registry validiert gegen contracts/shaded-technique-registry.schema.json${schemaOk ? '' : `: ${JSON.stringify(validate.errors)}`}`);

  const badEntries = registry.filter((t) => ['C', 'D'].includes(t.source.licenseClass) && ['direct', 'port'].includes(t.source.usage));
  assert(badEntries.length === 0, 'kein Eintrag mit Lizenzklasse C/D hat usage "direct" oder "port"');
  assert(implementedOnly(registry).length > 0, 'mindestens eine Technik ist tatsächlich implementiert (keine reine Research-Only-Liste)');

  const profileSchema = JSON.parse(fs.readFileSync(path.join(REPO, 'contracts/shaded-style-profile.schema.json'), 'utf8'));
  const validateProfile = new Ajv({ allErrors: true, strict: false }).compile(profileSchema);
  const sampleProfile = defaultStyleProfile('sample', 'sample');
  assert(validateProfile(sampleProfile), `defaultStyleProfile() validiert gegen contracts/shaded-style-profile.schema.json${validateProfile(sampleProfile) ? '' : `: ${JSON.stringify(validateProfile.errors)}`}`);
  const sampleCandidate = fromSeed(7);
  // fromSeed() returns a candidate WRAPPER ({schema: 'shaded.style.candidate/v1', id, seed,
  // profile, worldStateId, budget, sceneVersion}, see runtime/style/candidate.js), not a bare
  // StyleProfile -- the schema this asserts against only accepts a StyleProfile (or a
  // DiscoveryState) directly, so the embedded profile is what must be validated here.
  assert(validateProfile(sampleCandidate.profile), `fromSeed()-Kandidat.profile validiert gegen contracts/shaded-style-profile.schema.json${validateProfile(sampleCandidate.profile) ? '' : `: ${JSON.stringify(validateProfile.errors)}`}`);
}

// --- 10. seed-profiles: strukturell verschieden, Namen intern ---
{
  const profiles = seedProfiles();
  assert(profiles.length >= 8, 'mindestens 8 Startprofile');
  assert(new Set(SEED_PROFILE_NAMES).size === SEED_PROFILE_NAMES.length, 'Startprofil-Namen sind eindeutig');
  let distinctPairs = 0;
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const diffCount = STYLE_DIMENSIONS.filter((d) => getDimension(profiles[i], d.key) !== getDimension(profiles[j], d.key)).length;
      if (diffCount >= 3) distinctPairs++;
    }
  }
  assert(distinctPairs === (profiles.length * (profiles.length - 1)) / 2, 'jedes Paar von Startprofilen unterscheidet sich strukturell (≥3 Dimensionen), nicht nur in einem Detail');
}

// --- 11. breeding: Kind entsteht aus Eltern-Werten, Mutation bleibt lokal ---
{
  const parentA = seedProfiles()[0];
  const parentB = seedProfiles()[1];
  const child = breed(parentA, parentB, { mutationRate: 0, dimensions: [], rng: () => 0.4, id: 'child' });
  const fromParents = STYLE_DIMENSIONS.every((d) => {
    const v = getDimension(child, d.key);
    return v === getDimension(parentA, d.key) || v === getDimension(parentB, d.key);
  });
  assert(fromParents, 'ohne Mutation stammt jeder Dimensionswert des Kindes von einem der beiden Elternteile');

  // Mit einer konstanten rng(): Crossover wählt bei JEDEM Aufruf denselben Elternteil
  // (0.4 < 0.5 => immer parentA), damit Mutation isoliert beobachtbar ist.
  const crossoverOnlyChild = breed(parentA, parentB, { mutationRate: 0, dimensions: [], rng: () => 0.4, id: 'crossover-only' });
  assert(STYLE_DIMENSIONS.every((d) => getDimension(crossoverOnlyChild, d.key) === getDimension(parentA, d.key)), 'Sanity: konstante rng()=0.4 wählt beim Crossover immer parentA');

  const mutatedChild = breed(parentA, parentB, { mutationRate: 1, dimensions: ['rim.width'], rng: () => 0.4, id: 'mutated-child' });
  const untouchedDims = STYLE_DIMENSIONS.map((d) => d.key).filter((k) => k !== 'rim.width');
  assert(styleProfilesEqualOnKeys(mutatedChild, crossoverOnlyChild, untouchedDims), 'Mutation bleibt auf die übergebenen (unsichersten) Dimensionen beschränkt — alle anderen Dimensionen bleiben beim Crossover-Wert');
  assert(getDimension(mutatedChild, 'rim.width') !== getDimension(crossoverOnlyChild, 'rim.width'), 'die freigegebene Dimension wird tatsächlich lokal mutiert');
}

// --- 12. Alle neuen Dateien parsen mit node --check ------------------------
{
  const { execSync } = await import('node:child_process');
  const files = [
    ...fs.readdirSync(path.join(REPO, 'runtime/style')).filter((f) => f.endsWith('.js')).map((f) => `runtime/style/${f}`),
    ...fs.readdirSync(path.join(REPO, 'sandbox')).filter((f) => f.endsWith('.js')).map((f) => `sandbox/${f}`),
    ...fs.readdirSync(path.join(REPO, 'sandbox/passes')).filter((f) => f.endsWith('.js')).map((f) => `sandbox/passes/${f}`),
  ];
  let allParse = true;
  for (const f of files) {
    try { execSync(`node --check "${f}"`, { cwd: REPO, stdio: 'pipe' }); } catch { allParse = false; console.error('  Parsefehler in', f); }
  }
  assert(allParse, 'alle neuen runtime/style/ und sandbox/ Dateien parsen mit node --check');
}

console.log(failures ? `\n❌ ${failures} Fehlschläge` : '\n✅ Alle Style-Discovery-Selbsttests bestanden');
process.exit(failures ? 1 : 0);
