import { SceneEditorFacade } from './facade.js';
import { MarkerPainter, MARKER_BRUSH, CANONICAL_PALETTE } from './markerPainter.js';
import { ActorPlacer } from './actorPlacer.js';
import { StoryboardTimeline } from './storyboardTimeline.js';

// Hand-kept in sync with index.html's own PARAM_META — index.html stays the single
// source of truth for what a "parameter" is; this list only drives which sliders the
// editor draws.
const PARAM_META = [
  ['dayNight', 'Tag ↔ Nacht'],
  ['storm', 'Sturm / Bewölkung'],
  ['rain', 'Regen'],
  ['wet', 'Nässe'],
  ['puddle', 'Pfützenstand'],
  ['fog', 'Nebel'],
  ['wind', 'Wind'],
  ['glow', 'Fensterlicht'],
  ['decay', 'Verfall'],
  ['snow', 'Schneedecke'],
  ['snowfall', 'Schneefall'],
  ['temperature', 'Temperatur (−20…+30 °C)'],
  ['autumn', 'Herbst'],
  ['bloom', 'Frühlingsblüte'],
  ['bleach', 'Sonnenbleiche'],
];

const iframe = document.getElementById('engine-frame');
const facade = new SceneEditorFacade(iframe);
const statusEl = document.getElementById('editor-status');

function setStatus(msg) {
  statusEl.textContent = msg;
}

function setSlidersEnabled(enabled) {
  document.querySelectorAll('#sliders input[type=range]').forEach((el) => {
    el.disabled = !enabled;
  });
}

function buildSliders() {
  const slidersEl = document.getElementById('sliders');
  slidersEl.innerHTML = '';
  for (const [key, label] of PARAM_META) {
    const row = document.createElement('div');
    row.className = 'param-row';

    const lab = document.createElement('label');
    lab.textContent = label;
    lab.htmlFor = `p-${key}`;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = '0';
    input.id = `p-${key}`;
    input.disabled = true;

    const out = document.createElement('output');
    out.id = `o-${key}`;
    out.textContent = '0';

    input.addEventListener('input', () => {
      out.textContent = input.value;
      if (facade.isReady()) facade.setParams({ [key]: parseFloat(input.value) });
    });

    row.append(lab, input, out);
    slidersEl.appendChild(row);
  }
}

function syncSlidersFromEngine() {
  if (!facade.isReady()) return;
  const params = facade.getParams();
  for (const [key] of PARAM_META) {
    if (!(key in params)) continue;
    const input = document.getElementById(`p-${key}`);
    const out = document.getElementById(`o-${key}`);
    if (input) input.value = params[key];
    if (out) out.textContent = params[key];
  }
}

buildSliders();

document.getElementById('btn-demo').addEventListener('click', () => {
  setStatus('Lade Demo-Szene …');
  facade.loadDemo();
});

document.getElementById('f-scene').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    facade.loadSceneFile(file);
    setStatus(`Szene geladen: ${file.name}`);
  }
});

document.getElementById('f-mat').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    facade.loadMaterialFile(file);
    setStatus(`Zweitbild geladen: ${file.name}`);
  }
});

document.getElementById('btn-erstellen').addEventListener('click', async () => {
  if (!facade.isEngineLoaded()) {
    setStatus('⚠️ Engine noch nicht geladen.');
    return;
  }
  setStatus('🧠 Erstelle Szene …');
  facade.create();
  try {
    await facade.waitUntilReady();
    setSlidersEnabled(true);
    syncSlidersFromEngine();
    renderActorMarkers();
    renderTimeline();
    setStatus('✅ Szene bereit — Parameter sind jetzt live einstellbar.');
  } catch (err) {
    setStatus(`⚠️ ${err.message}`);
  }
});

document.getElementById('btn-save-preset').addEventListener('click', () => {
  if (!facade.isReady()) {
    setStatus('⚠️ Erst eine Szene erstellen.');
    return;
  }
  const blob = new Blob([JSON.stringify(facade.getParams(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shaded-preset.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('f-preset').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const params = JSON.parse(await file.text());
    facade.setParams(params);
    syncSlidersFromEngine();
    setStatus(`Preset geladen: ${file.name}`);
  } catch (err) {
    setStatus(`⚠️ Preset ungültig: ${err.message}`);
  }
});

// ─────────────────────────── Marker-/Palette-Overlay-Werkzeug ───────────────────────────

const paintCanvas = document.getElementById('paint-canvas');
const painter = new MarkerPainter(paintCanvas);

function buildPaletteButtons() {
  const wrap = document.getElementById('palette-buttons');
  wrap.innerHTML = '';
  const addSwatch = (id, label, hex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.dataset.paletteId = id;
    btn.style.background = hex;
    btn.title = `${label} (${hex})`;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      painter.setBrush(hex);
      document.querySelectorAll('.swatch').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
    wrap.appendChild(btn);
    return btn;
  };
  const markerBtn = addSwatch(MARKER_BRUSH.id, MARKER_BRUSH.label, MARKER_BRUSH.hex);
  for (const p of CANONICAL_PALETTE) addSwatch(p.id, p.label, p.hex);
  markerBtn.classList.add('active');
}
buildPaletteButtons();

document.getElementById('brush-size').addEventListener('input', (e) => {
  painter.setBrush(undefined, parseInt(e.target.value, 10));
});

document.getElementById('f-paint-source').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await painter.loadImage(file);
  setStatus(`Bild ins Paint-Werkzeug geladen: ${file.name}`);
});

document.getElementById('btn-paint-clear').addEventListener('click', () => {
  painter.clearToOriginal();
  setStatus('Übermalungen zurückgesetzt.');
});

document.getElementById('btn-paint-export').addEventListener('click', async () => {
  const blob = await painter.exportPNGBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'marker-overlay.png';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('btn-paint-apply').addEventListener('click', async () => {
  if (!painter.hasPaintedAnything()) {
    setStatus('⚠️ Erst etwas übermalen, bevor das Overlay angewendet wird.');
    return;
  }
  const blob = await painter.exportPNGBlob();
  const file = new File([blob], 'marker-overlay.png', { type: 'image/png' });
  facade.loadMaterialFile(file);
  setStatus(`Marker-Overlay als Zweitbild übernommen (${painter.countChangedPixels()} geänderte Pixel) — jetzt „Erstellen“ drücken.`);
});

// ─────────────────────────── Actor-Platzierung (SWIFT-Sprites) ───────────────────────────

const actorPlacer = new ActorPlacer(facade);
const actorOverlay = document.getElementById('actor-overlay');
const actorListEl = document.getElementById('actor-list');
let pendingActorSheet = null;
let pendingActorManifest = null;

document.getElementById('f-actor-sheet').addEventListener('change', (e) => {
  pendingActorSheet = e.target.files[0] || null;
});
document.getElementById('f-actor-manifest').addEventListener('change', (e) => {
  pendingActorManifest = e.target.files[0] || null;
});

document.getElementById('btn-actor-add').addEventListener('click', async () => {
  if (!facade.isEngineLoaded()) {
    setStatus('⚠️ Engine noch nicht geladen.');
    return;
  }
  if (!pendingActorSheet || !pendingActorManifest) {
    setStatus('⚠️ Erst Sprite-Sheet UND Manifest wählen.');
    return;
  }
  try {
    const entry = await actorPlacer.addFromFiles(pendingActorSheet, pendingActorManifest);
    setStatus(`Actor hinzugefügt: ${entry.label} (${entry.animNames.length} Animation(en)).`);
    renderActorMarkers();
    renderActorList();
  } catch (err) {
    setStatus(`⚠️ Actor konnte nicht hinzugefügt werden: ${err.message}`);
  }
});

function renderActorMarkers() {
  actorOverlay.innerHTML = '';
  for (const actor of actorPlacer.list()) {
    const marker = document.createElement('div');
    marker.className = 'actor-marker';
    marker.dataset.label = actor.label;
    marker.style.left = `${actor.x * 100}%`;
    marker.style.top = `${actor.y * 100}%`;

    let dragging = false;
    const toUV = (e) => {
      const rect = actorOverlay.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      return { x, y };
    };
    marker.addEventListener('pointerdown', (e) => {
      dragging = true;
      marker.setPointerCapture(e.pointerId);
    });
    marker.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const { x, y } = toUV(e);
      marker.style.left = `${x * 100}%`;
      marker.style.top = `${y * 100}%`;
      actorPlacer.setPosition(actor.id, x, y);
    });
    marker.addEventListener('pointerup', () => {
      dragging = false;
      renderActorList();
    });
    actorOverlay.appendChild(marker);
  }
}

function renderActorList() {
  actorListEl.innerHTML = '';
  for (const actor of actorPlacer.list()) {
    const row = document.createElement('div');
    row.className = 'actor-row';

    const nameRow = document.createElement('div');
    nameRow.className = 'row';
    const label = document.createElement('strong');
    label.textContent = actor.label;
    label.style.fontSize = '12px';
    nameRow.appendChild(label);
    row.appendChild(nameRow);

    const controlsRow = document.createElement('div');
    controlsRow.className = 'row';

    const animSelect = document.createElement('select');
    for (const name of actor.animNames) {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      if (name === actor.anim) opt.selected = true;
      animSelect.appendChild(opt);
    }
    animSelect.addEventListener('change', () => actorPlacer.setAnim(actor.id, animSelect.value));

    const depthSelect = document.createElement('select');
    for (const layer of ['front', 'mid', 'back']) {
      const opt = document.createElement('option');
      opt.value = layer; opt.textContent = layer;
      if (layer === actor.depthLayer) opt.selected = true;
      depthSelect.appendChild(opt);
    }
    depthSelect.addEventListener('change', () => actorPlacer.setDepthLayer(actor.id, depthSelect.value));

    const scaleInput = document.createElement('input');
    scaleInput.type = 'number';
    scaleInput.step = '0.1';
    scaleInput.min = '0.1';
    scaleInput.value = actor.scale;
    scaleInput.style.width = '54px';
    scaleInput.addEventListener('change', () => actorPlacer.setScale(actor.id, parseFloat(scaleInput.value) || 1));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn';
    removeBtn.textContent = '❌';
    removeBtn.addEventListener('click', () => {
      actorPlacer.remove(actor.id);
      renderActorMarkers();
      renderActorList();
    });

    controlsRow.append(animSelect, depthSelect, scaleInput, removeBtn);
    row.appendChild(controlsRow);
    actorListEl.appendChild(row);
  }
}

// ─────────────────────────── Story/Akt-Timeline ───────────────────────────

const timeline = new StoryboardTimeline(facade);
const timelineEl = document.getElementById('timeline');

function renderTimeline() {
  timelineEl.innerHTML = '';
  if (!facade.isEngineLoaded()) return;
  const steps = timeline.getSteps();
  steps.forEach((step, i) => {
    const el = document.createElement('div');
    el.className = 'timeline-step';

    const row1 = document.createElement('div');
    row1.className = 'row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = step.name;
    nameInput.addEventListener('change', () => timeline.updateName(i, nameInput.value));
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.step = '0.5';
    durInput.min = '0.5';
    durInput.value = step.dur;
    durInput.addEventListener('change', () => timeline.updateDuration(i, parseFloat(durInput.value)));
    const durLabel = document.createElement('span');
    durLabel.textContent = 's';
    durLabel.className = 'hint';
    row1.append(nameInput, durInput, durLabel);

    const row2 = document.createElement('div');
    row2.className = 'row';
    const captureBtn = document.createElement('button');
    captureBtn.type = 'button'; captureBtn.className = 'icon-btn'; captureBtn.textContent = '💾';
    captureBtn.title = 'Aktuellen Zustand in diesen Schritt übernehmen';
    captureBtn.addEventListener('click', () => { timeline.captureCurrentParamsInto(i); setStatus(`Zustand in „${step.name}“ gespeichert.`); });
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button'; previewBtn.className = 'icon-btn'; previewBtn.textContent = '👁';
    previewBtn.title = 'Diesen Schritt anzeigen';
    previewBtn.addEventListener('click', () => { timeline.previewStep(i); syncSlidersFromEngine(); });
    const upBtn = document.createElement('button');
    upBtn.type = 'button'; upBtn.className = 'icon-btn'; upBtn.textContent = '▲';
    upBtn.addEventListener('click', () => { timeline.moveUp(i); renderTimeline(); });
    const downBtn = document.createElement('button');
    downBtn.type = 'button'; downBtn.className = 'icon-btn'; downBtn.textContent = '▼';
    downBtn.addEventListener('click', () => { timeline.moveDown(i); renderTimeline(); });
    const delBtn = document.createElement('button');
    delBtn.type = 'button'; delBtn.className = 'icon-btn'; delBtn.textContent = '❌';
    delBtn.addEventListener('click', () => { timeline.remove(i); renderTimeline(); });
    row2.append(captureBtn, previewBtn, upBtn, downBtn, delBtn);

    const barWrap = document.createElement('div');
    barWrap.style.height = '6px';
    barWrap.style.background = '#1c222c';
    barWrap.style.borderRadius = '3px';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = `${Math.min(100, step.dur * 10)}%`;
    barWrap.appendChild(bar);

    el.append(row1, row2, barWrap);
    timelineEl.appendChild(el);
  });
}

document.getElementById('btn-timeline-add').addEventListener('click', () => {
  if (!facade.isReady()) {
    setStatus('⚠️ Erst eine Szene erstellen, bevor ein Schritt aus dem aktuellen Zustand übernommen wird.');
    return;
  }
  timeline.addStepFromCurrentParams(`Schritt ${timeline.getSteps().length + 1}`, 3);
  renderTimeline();
});
document.getElementById('btn-timeline-play').addEventListener('click', () => {
  if (facade.isEngineLoaded()) timeline.play();
});
document.getElementById('btn-timeline-stop').addEventListener('click', () => {
  if (facade.isEngineLoaded()) timeline.stop();
});
document.getElementById('btn-timeline-refresh').addEventListener('click', () => renderTimeline());

