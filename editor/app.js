import { SceneEditorFacade } from './facade.js';
import { MarkerPainter, MARKER_BRUSH, CANONICAL_PALETTE } from './markerPainter.js';

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
