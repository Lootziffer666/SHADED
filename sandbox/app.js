// SHADED Style Discovery Sandbox — nur UI-Verdrahtung. Enthält KEINE
// Engine-/Klassifikationslogik — die steckt vollständig in runtime/style/
// und sandbox/renderer.js. Exponiert window.SHADEDStyleSandbox für
// tools/verify-sandbox.js (headless Beweis, analog zu window.SHADED_ORCHESTRATOR
// im Editor).

import { createSandboxRenderer } from './renderer.js';
import { orbitCameraKeyframe, defaultCameraKeyframe } from './benchmark-scene.js';
import { seedProfiles, SEED_PROFILE_NAMES } from '../runtime/style/seed-profiles.js';
import { PreferenceModel } from '../runtime/style/preference-model.js';
import { selectPair } from '../runtime/style/pair-selection.js';
import { breed } from '../runtime/style/breeding.js';
import { DiscoveryStore, createDiscoveryState } from '../runtime/style/discovery-store.js';
import { mulberry32 } from '../runtime/style/rng.js';
import {
  STYLE_DIMENSIONS, defaultStyleProfile, cloneStyleProfile, setDimension, getDimension,
  styleProfilesEqualOnKeys,
} from '../runtime/style/style-profile.js';
import { WORLD_STATE_PRESET_NAMES } from '../runtime/style/world-state.js';

const FIXED_TIME = 0; // Deterministisches Rendern (kein RAF-Loop nötig; Bewegung nur im Orbit-Debug).
const SEED_ROUNDS = 4; // Erste 4 Runden: breite Vergleiche zwischen Startprofilen, danach adaptiv isoliert.

const $ = (id) => document.getElementById(id);

const el = {
  roundStatus: $('round-status'),
  toggleShowA: $('toggle-show-a'), toggleShowB: $('toggle-show-b'),
  cardA: $('card-a'), cardB: $('card-b'),
  canvasA: $('canvas-a'), canvasB: $('canvas-b'),
  nameA: $('name-a'), nameB: $('name-b'),
  voteA: $('vote-a'), voteB: $('vote-b'), voteTie: $('vote-tie'), undoVote: $('undo-vote'),
  nextRound: $('next-round'),
  isolationToggle: $('isolation-toggle'),
  explainBox: $('explain-box'), explainReason: $('explain-reason'), explainDimension: $('explain-dimension'),
  budgetFull: $('btn-budget-full'), budgetMobile: $('btn-budget-mobile'),
  toggleExpert: $('btn-toggle-expert'), expertPanel: $('expert-panel'),
  dimensionGrid: $('dimension-grid'),
  customRender: $('custom-render'), customSave: $('custom-save'), customBreed: $('custom-breed'),
  canvasCustom: $('canvas-custom'), favoritesList: $('favorites-list'),
  gridStateSelect: $('grid-state-select'), gridStateRender: $('grid-state-render'), gridStateOutput: $('grid-state-output'),
  gridStyleSelect: $('grid-style-select'), gridStyleRender: $('grid-style-render'), gridStyleOutput: $('grid-style-output'),
  telemetryA: $('telemetry-a'), telemetryB: $('telemetry-b'), confidenceList: $('confidence-list'),
  orbitFrame: $('orbit-frame'), orbitRender: $('orbit-render'), canvasOrbit: $('canvas-orbit'),
};

const rendererA = createSandboxRenderer(el.canvasA);
rendererA.setSize(480, 300);
const rendererB = createSandboxRenderer(el.canvasB);
rendererB.setSize(480, 300);
const rendererCustom = createSandboxRenderer(el.canvasCustom);
rendererCustom.setSize(480, 300);
const rendererOrbit = createSandboxRenderer(el.canvasOrbit);
rendererOrbit.setSize(320, 200);
const gridCanvas = document.createElement('canvas');
const rendererGrid = createSandboxRenderer(gridCanvas);
rendererGrid.setSize(220, 140);

const store = new DiscoveryStore(typeof localStorage !== 'undefined' ? localStorage : undefined);

let model, round, history, customProfiles;
let undoStack = [];
let isolationMode = false;
let budgetTier = 'FULL';
let currentPair = null;
let voted = false;
let pendingReactions = { a: [], b: [] };
let customProfile = defaultStyleProfile('custom', 'Eigenes Profil');

function restoreOrInit() {
  const loaded = store.load();
  if (loaded) {
    model = PreferenceModel.fromJSON(loaded.preferenceModelState);
    history = loaded.history || [];
    round = loaded.round || 0;
    customProfiles = loaded.customProfiles || [];
  } else {
    model = new PreferenceModel();
    history = [];
    round = 0;
    customProfiles = [];
  }
}

function persist() {
  const state = createDiscoveryState({ preferenceModelState: model.toJSON(), history, round, customProfiles });
  store.save(state);
}

function isolationHistory() {
  return history.filter((h) => h.isolatedDimension);
}

function pairForRound(r) {
  const useAdaptive = isolationMode || r >= SEED_ROUNDS;
  if (!useAdaptive) {
    const profiles = seedProfiles();
    const idx = r % Math.floor(profiles.length / 2);
    const pa = profiles[idx * 2];
    const pb = profiles[idx * 2 + 1];
    const swap = r % 2 === 1; // deterministische, ausbalancierte Seitenzuweisung
    return {
      a: swap ? pb : pa, b: swap ? pa : pb, round: r, isolatedDimension: null, isRetest: false,
      reason: 'Breiter Startvergleich zwischen zwei strukturell unterschiedlichen Startprofilen — noch keine isolierte Dimension.',
    };
  }
  const adaptiveRound = isolationMode ? r : r - SEED_ROUNDS;
  return selectPair({ model, round: Math.max(0, adaptiveRound), history: isolationHistory() });
}

function loadPair() {
  currentPair = pairForRound(round);
  voted = false;
  pendingReactions = { a: [], b: [] };
  el.nameA.textContent = '';
  el.nameB.textContent = '';
  el.explainBox.hidden = true;
  el.nextRound.hidden = true;
  el.voteA.disabled = false; el.voteB.disabled = false; el.voteTie.disabled = false;
  renderPairViews();
  updateRoundUI();
  renderTelemetry();
}

function renderPairViews() {
  rendererA.setBudgetTier(budgetTier);
  rendererA.setStyleProfile(currentPair.a);
  rendererA.renderFrame(FIXED_TIME);
  rendererB.setBudgetTier(budgetTier);
  rendererB.setStyleProfile(currentPair.b);
  rendererB.renderFrame(FIXED_TIME);
}

function updateRoundUI() {
  el.roundStatus.textContent = `Runde ${round + 1}${isolationMode || round >= SEED_ROUNDS ? ' · adaptiv' : ' · Startvergleich'}`;
}

function vote(winner) {
  if (voted || !currentPair) return;
  undoStack.push({ modelSnapshot: model.toJSON(), round, historyLength: history.length, isolationMode });
  model.update({ a: currentPair.a, b: currentPair.b, winner });
  history.push({
    round, isolatedDimension: currentPair.isolatedDimension, winner, reason: currentPair.reason,
    a: currentPair.a, b: currentPair.b, budgetTier,
    reactions: { a: [...pendingReactions.a], b: [...pendingReactions.b] },
  });
  voted = true;
  el.nameA.textContent = currentPair.a.name;
  el.nameB.textContent = currentPair.b.name;
  el.explainBox.hidden = false;
  el.explainReason.textContent = currentPair.reason;
  if (currentPair.isolatedDimension) {
    el.explainDimension.hidden = false;
    el.explainDimension.textContent = currentPair.isolatedDimension;
  } else {
    el.explainDimension.hidden = true;
  }
  el.voteA.disabled = true; el.voteB.disabled = true; el.voteTie.disabled = true;
  el.nextRound.hidden = false;
  round += 1;
  persist();
  renderConfidenceList();
}

function undoLastVote() {
  if (!undoStack.length) return;
  const snap = undoStack.pop();
  model = PreferenceModel.fromJSON(snap.modelSnapshot);
  history.length = snap.historyLength;
  round = snap.round;
  isolationMode = snap.isolationMode;
  el.isolationToggle.checked = isolationMode;
  persist();
  loadPair();
  renderConfidenceList();
}

function handleReaction(side, kind) {
  if (voted && history.length) {
    history[history.length - 1].reactions[side].push(kind);
    persist();
  } else {
    pendingReactions[side].push(kind);
  }
}

function renderConfidenceList() {
  el.confidenceList.innerHTML = '';
  for (const dim of STYLE_DIMENSIONS) {
    const li = document.createElement('li');
    const conf = model.confidence(dim.key);
    li.innerHTML = `<span>${dim.key}</span><span>${(conf * 100).toFixed(0)}% (n=${model.observations(dim.key)})</span>`;
    el.confidenceList.appendChild(li);
  }
}

function renderTelemetry() {
  const fill = (target, tel, label) => {
    target.innerHTML = '';
    const rows = [
      ['Label', label], ['Budget', tel.budgetTier], ['Auflösung', `${tel.renderWidth}×${tel.renderHeight}`],
      ['Raymarch-Steps', tel.raymarchSteps], ['Drawcalls', tel.drawCalls], ['Frame ms', tel.frameMs],
    ];
    for (const [k, v] of rows) {
      const d = document.createElement('div');
      d.innerHTML = `<span class="k">${k}</span>${v}`;
      target.appendChild(d);
    }
  };
  fill(el.telemetryA, rendererA.getTelemetry(), 'Kandidat A');
  fill(el.telemetryB, rendererB.getTelemetry(), 'Kandidat B');
}

// --- Side-Toggle (mobil: großer A/B-Umschalter statt zweier winziger Vorschauen) ---
function setActiveSide(side) {
  el.cardA.hidden = side !== 'a';
  el.cardB.hidden = side !== 'b';
  el.toggleShowA.classList.toggle('active', side === 'a');
  el.toggleShowB.classList.toggle('active', side === 'b');
}
el.toggleShowA.addEventListener('click', () => setActiveSide('a'));
el.toggleShowB.addEventListener('click', () => setActiveSide('b'));

// --- Votum ---
el.voteA.addEventListener('click', () => vote('a'));
el.voteB.addEventListener('click', () => vote('b'));
el.voteTie.addEventListener('click', () => vote('tie'));
el.undoVote.addEventListener('click', undoLastVote);
el.nextRound.addEventListener('click', loadPair);
el.isolationToggle.addEventListener('change', () => {
  isolationMode = el.isolationToggle.checked;
  loadPair();
});
document.querySelectorAll('[data-reaction]').forEach((btn) => {
  btn.addEventListener('click', () => handleReaction(btn.dataset.side, btn.dataset.reaction));
});

// --- Budget ---
function setBudgetTier(tier) {
  budgetTier = tier;
  el.budgetFull.classList.toggle('active', tier === 'FULL');
  el.budgetMobile.classList.toggle('active', tier === 'MOBILE');
  if (currentPair) renderPairViews();
  renderTelemetry();
}
el.budgetFull.addEventListener('click', () => setBudgetTier('FULL'));
el.budgetMobile.addEventListener('click', () => setBudgetTier('MOBILE'));

el.toggleExpert.addEventListener('click', () => {
  el.expertPanel.hidden = !el.expertPanel.hidden;
});

// --- Custom-Profil ---
function buildDimensionControls() {
  el.dimensionGrid.innerHTML = '';
  for (const dim of STYLE_DIMENSIONS) {
    const wrap = document.createElement('div');
    wrap.className = 'dimension-field';
    const label = document.createElement('label');
    label.textContent = dim.key;
    wrap.appendChild(label);
    let input;
    if (dim.kind === 'categorical') {
      input = document.createElement('select');
      for (const opt of dim.options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        input.appendChild(o);
      }
      input.value = getDimension(customProfile, dim.key);
    } else {
      input = document.createElement('input');
      input.type = 'range';
      input.min = String(dim.min); input.max = String(dim.max);
      input.step = String(dim.step || 0.01);
      input.value = String(getDimension(customProfile, dim.key));
    }
    input.dataset.dimKey = dim.key;
    const readout = document.createElement('span');
    readout.className = 'value-readout';
    readout.textContent = String(getDimension(customProfile, dim.key));
    input.addEventListener('input', () => {
      const raw = dim.kind === 'categorical' ? input.value : Number(input.value);
      customProfile = setDimension(customProfile, dim.key, raw);
      readout.textContent = String(getDimension(customProfile, dim.key));
    });
    wrap.appendChild(input);
    wrap.appendChild(readout);
    el.dimensionGrid.appendChild(wrap);
  }
}

function renderCustomPreview() {
  rendererCustom.setBudgetTier(budgetTier);
  rendererCustom.setStyleProfile(customProfile);
  rendererCustom.renderFrame(FIXED_TIME);
}
el.customRender.addEventListener('click', renderCustomPreview);

function renderFavoritesList() {
  el.favoritesList.textContent = customProfiles.length
    ? `Gespeicherte Favoriten: ${customProfiles.map((p) => p.id).join(', ')}`
    : 'Noch keine Favoriten gespeichert.';
}
el.customSave.addEventListener('click', () => {
  const saved = cloneStyleProfile(customProfile);
  saved.id = `favorite-${customProfiles.length + 1}`;
  saved.name = saved.id;
  customProfiles.push(saved);
  persist();
  renderFavoritesList();
});
el.customBreed.addEventListener('click', () => {
  if (customProfiles.length < 2) return;
  const parentA = customProfiles[customProfiles.length - 2];
  const parentB = customProfiles[customProfiles.length - 1];
  const uncertainDims = model.rankedByUncertainty().slice(0, 5);
  const rng = mulberry32((round + 1) * 7919);
  customProfile = breed(parentA, parentB, { mutationRate: 0.2, dimensions: uncertainDims, rng, id: 'bred-custom' });
  buildDimensionControls();
  renderCustomPreview();
});

// --- Vergleichsraster ---
function populateGridSelects() {
  el.gridStateSelect.innerHTML = WORLD_STATE_PRESET_NAMES.map((n) => `<option value="${n}">${n}</option>`).join('');
  const styleOptions = [...SEED_PROFILE_NAMES, 'custom'];
  el.gridStyleSelect.innerHTML = styleOptions.map((n) => `<option value="${n}">${n}</option>`).join('');
}

function renderThumbGrid(container, items, labelFn, applyFn) {
  container.innerHTML = '';
  for (const item of items) {
    applyFn(item);
    rendererGrid.renderFrame(FIXED_TIME);
    const dataUrl = rendererGrid.getCanvas().toDataURL('image/png');
    const cell = document.createElement('div');
    cell.className = 'thumb-cell';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = labelFn(item);
    const label = document.createElement('div');
    label.className = 'thumb-label';
    label.textContent = labelFn(item);
    cell.appendChild(img); cell.appendChild(label);
    container.appendChild(cell);
  }
}

el.gridStateRender.addEventListener('click', () => {
  const presetName = el.gridStateSelect.value;
  rendererGrid.setBudgetTier('FULL');
  const profiles = seedProfiles();
  renderThumbGrid(el.gridStateOutput, profiles, (p) => p.name, (profile) => {
    rendererGrid.setGlobalWorldStatePreset(presetName);
    rendererGrid.setStyleProfile(profile);
  });
});

function resolveStyleSelection(value) {
  if (value === 'custom') return customProfile;
  const profiles = seedProfiles();
  return profiles.find((p) => p.name === value) || profiles[0];
}

el.gridStyleRender.addEventListener('click', () => {
  const chosen = resolveStyleSelection(el.gridStyleSelect.value);
  rendererGrid.setBudgetTier('FULL');
  renderThumbGrid(el.gridStyleOutput, WORLD_STATE_PRESET_NAMES, (n) => n, (presetName) => {
    rendererGrid.setGlobalWorldStatePreset(presetName);
    rendererGrid.setStyleProfile(chosen);
  });
});

// --- Orbit-Debug ---
el.orbitRender.addEventListener('click', () => {
  const idx = Number(el.orbitFrame.value) || 0;
  rendererOrbit.setCamera(orbitCameraKeyframe(idx, 12));
  rendererOrbit.setStyleProfile(currentPair ? currentPair.a : customProfile);
  rendererOrbit.renderFrame(FIXED_TIME);
});

// --- Headless-Testoberfläche (analog window.SHADED_ORCHESTRATOR im Editor) ---
function canvasHash(canvasEl) {
  const ctx = canvasEl.getContext('2d') || canvasEl;
  let data;
  if (canvasEl.getContext('webgl2')) {
    // WebGL-Canvas: über eine temporäre 2D-Canvas-Kopie lesen (drawImage kopiert
    // den aktuellen Backbuffer-Inhalt, unabhängig vom Kontexttyp).
    const tmp = document.createElement('canvas');
    tmp.width = canvasEl.width; tmp.height = canvasEl.height;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(canvasEl, 0, 0);
    data = tctx.getImageData(0, 0, tmp.width, tmp.height).data;
  } else {
    data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < data.length; i += 7) { h ^= data[i]; h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(16);
}

window.SHADEDStyleSandbox = {
  sceneVersion: rendererA.sceneVersion,
  state() {
    return {
      round, historyLength: history.length, isolationMode, budgetTier, voted,
      currentPair: currentPair ? { isolatedDimension: currentPair.isolatedDimension, reason: currentPair.reason, aId: currentPair.a.id, bId: currentPair.b.id } : null,
      namesVisible: !el.nameA.hidden && el.nameA.textContent !== '',
    };
  },
  getHistory() { return history; },
  getCurrentPair() { return currentPair; },
  isolationDiffersOnExactlyOneKey() {
    if (!currentPair || !currentPair.isolatedDimension) return null;
    const others = STYLE_DIMENSIONS.map((d) => d.key).filter((k) => k !== currentPair.isolatedDimension);
    const restEqual = styleProfilesEqualOnKeys(currentPair.a, currentPair.b, others);
    const targetDiffers = getDimension(currentPair.a, currentPair.isolatedDimension) !== getDimension(currentPair.b, currentPair.isolatedDimension);
    return restEqual && targetDiffers;
  },
  vote, undoLastVote, loadPair,
  setIsolationMode(v) { isolationMode = v; el.isolationToggle.checked = v; loadPair(); },
  setBudgetTier,
  canvasHash,
  reconstructHash(historyIndex, side = 'a') {
    const entry = history[historyIndex];
    if (!entry) return null;
    rendererGrid.setBudgetTier(entry.budgetTier);
    rendererGrid.setStyleProfile(side === 'a' ? entry.a : entry.b);
    rendererGrid.resetWorldStates();
    rendererGrid.renderFrame(FIXED_TIME);
    return canvasHash(rendererGrid.getCanvas());
  },
  renderOrbitFrame(idx) {
    rendererOrbit.setCamera(orbitCameraKeyframe(idx, 12));
    rendererOrbit.setStyleProfile(currentPair ? currentPair.a : customProfile);
    rendererOrbit.renderFrame(FIXED_TIME);
    return canvasHash(rendererOrbit.getCanvas());
  },
  getConfidenceSnapshot() {
    return STYLE_DIMENSIONS.map((d) => ({ key: d.key, confidence: model.confidence(d.key), observations: model.observations(d.key) }));
  },
  reload() { location.reload(); },
};

// --- Initialisierung ---
restoreOrInit();
buildDimensionControls();
populateGridSelects();
renderFavoritesList();
renderConfidenceList();
setActiveSide('a');
rendererOrbit.setCamera(defaultCameraKeyframe());
loadPair();
renderCustomPreview();
