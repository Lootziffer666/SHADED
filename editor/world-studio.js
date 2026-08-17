const iframe = document.getElementById('engine-frame');
const topCreate = document.getElementById('btn-erstellen');
const legacySceneInput = document.getElementById('f-scene');
const viewport = document.querySelector('.viewport');

const SKY_PRESETS = {
  day: { label: 'Klarer Tag', params: { dayNight: 0.03, storm: 0.02, fog: 0.03, glow: 0.08, wind: 0.22 } },
  golden: { label: 'Golden Hour', params: { dayNight: 0.18, storm: 0.04, fog: 0.08, glow: 0.22, wind: 0.18 } },
  overcast: { label: 'Bedeckt', params: { dayNight: 0.12, storm: 0.45, fog: 0.18, glow: 0.18, wind: 0.35 } },
  night: { label: 'Nacht', params: { dayNight: 0.92, storm: 0.08, fog: 0.12, glow: 0.62, wind: 0.16 } },
  storm: { label: 'Sturm', params: { dayNight: 0.52, storm: 0.95, rain: 0.72, wet: 0.88, puddle: 0.62, fog: 0.42, glow: 0.48, wind: 0.95 } },
};

const WORLD_PRESETS = {
  compact: { label: 'Kompakt', boundary: 0.18, thickness: 0.025, textureBlend: 0.82, maxEdge: 768, pointBudget: 300000 },
  room: { label: 'Raum', boundary: 0.35, thickness: 0.035, textureBlend: 0.75, maxEdge: 1024, pointBudget: 500000 },
  wide: { label: 'Weit', boundary: 0.62, thickness: 0.05, textureBlend: 0.68, maxEdge: 1280, pointBudget: 850000 },
};

const MATERIAL_PRESETS = {
  liquid: { label: 'Flüssigkeit', roughness: 0.08, height: 0.14, normal: 0.18, reflectivity: 0.92, refraction: 0.72, flow: 0.82, params: { wet: 1, puddle: 0.88, rain: 0.05, fog: 0.03 } },
  wetstone: { label: 'Nasser Stein', roughness: 0.34, height: 0.42, normal: 0.58, reflectivity: 0.58, refraction: 0.05, flow: 0.1, params: { wet: 0.82, puddle: 0.24, decay: 0.12 } },
  metal: { label: 'Metall', roughness: 0.22, height: 0.2, normal: 0.34, reflectivity: 0.88, refraction: 0, flow: 0, params: { wet: 0.16, bleach: 0.3 } },
  glass: { label: 'Glas', roughness: 0.04, height: 0.08, normal: 0.12, reflectivity: 0.78, refraction: 0.92, flow: 0, params: { wet: 0.24, glow: 0.38 } },
  snow: { label: 'Schnee', roughness: 0.76, height: 0.74, normal: 0.46, reflectivity: 0.28, refraction: 0.06, flow: 0, params: { snow: 0.92, snowfall: 0.16, wet: 0.28, temperature: 0.12 } },
  organic: { label: 'Organisch', roughness: 0.64, height: 0.56, normal: 0.66, reflectivity: 0.18, refraction: 0, flow: 0.08, params: { bloom: 0.6, wet: 0.32, decay: 0.1 } },
  emissive: { label: 'Emissiv', roughness: 0.2, height: 0.18, normal: 0.22, reflectivity: 0.5, refraction: 0.1, flow: 0, params: { glow: 1 } },
  neutral: { label: 'Neutral', roughness: 0.48, height: 0.35, normal: 0.4, reflectivity: 0.3, refraction: 0, flow: 0, params: {} },
};

const STAGES = [
  ['image', 'Bild übernehmen'],
  ['depth', 'Tiefe / Provider'],
  ['maps', 'Höhe · Normals · Point Cloud'],
  ['world', 'Spiegelhülle · Raumzellen · Welt'],
  ['camera', 'Kamerafahrt → Ego'],
];

let sceneFile = null;
let selectedProvider = 'auto';
let selectedWorld = 'room';
let selectedSky = 'golden';
let selectedMaterial = 'neutral';
let material = { ...MATERIAL_PRESETS.neutral };
let running = false;
let generatedMaps = null;

function engine() { return iframe?.contentWindow?.SHADED || null; }
function engineDoc() { return iframe?.contentDocument || null; }

function waitForEngine(timeout = 12000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      if (engine()) return resolve(engine());
      if (performance.now() - start > timeout) return reject(new Error('Engine nicht geladen.'));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function waitReady(timeout = 45000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      if (engine()?.isReady?.()) return resolve();
      if (performance.now() - start > timeout) return reject(new Error('Szene wurde nicht rechtzeitig bereit.'));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function createStudio() {
  if (!viewport || document.getElementById('world-studio')) return;
  const el = document.createElement('section');
  el.id = 'world-studio';
  el.innerHTML = `
    <div class="world-studio-head">
      <div><span class="world-studio-kicker">WORLD STUDIO</span><strong>1 Bild → 1 kleine Welt</strong></div>
      <div class="world-ready-pill"><span></span><b>READY</b></div>
      <button class="world-studio-toggle" type="button" aria-label="World Studio ein-/ausklappen" aria-expanded="true">⌄</button>
    </div>
    <div class="world-studio-body">
      <div class="world-studio-step">
        <div class="world-studio-label"><span>Bild</span><b>01</b></div>
        <label class="world-drop">
          <img class="world-thumb" id="world-thumb" alt="Bildvorschau">
          <span class="world-drop-copy"><strong id="world-file-title">Bild laden</strong><span id="world-file-copy">PNG · JPG · WEBP</span></span>
          <input id="world-file" type="file" accept="image/*">
        </label>
      </div>
      <div class="world-studio-step">
        <div class="world-studio-label"><span>Tiefenmodell</span><b>02</b></div>
        <div class="world-chip-grid" id="world-provider-grid">
          <button class="world-chip active" data-provider="auto"><b>Auto</b><span>DA3 → V2 → Software</span></button>
          <button class="world-chip" data-provider="depth-anything-3"><b>Depth Anything 3</b><span>RTX bevorzugt</span></button>
          <button class="world-chip" data-provider="depth-anything-v2"><b>Depth Anything V2</b><span>stabiler Fallback</span></button>
          <button class="world-chip" data-provider="software"><b>Software</b><span>Browser-Pipeline</span></button>
        </div>
      </div>
      <div class="world-studio-step">
        <div class="world-studio-label"><span>Welt & Himmel</span><b>03</b></div>
        <div class="world-row">
          <div class="world-field"><label for="world-size">Begrenzung</label><select id="world-size"><option value="compact">Kompakt</option><option value="room" selected>Raum</option><option value="wide">Weit</option></select></div>
          <div class="world-field"><label for="world-sky">Himmel</label><select id="world-sky"><option value="day">Klarer Tag</option><option value="golden" selected>Golden Hour</option><option value="overcast">Bedeckt</option><option value="night">Nacht</option><option value="storm">Sturm</option></select></div>
        </div>
        <div class="world-field" style="margin-top:8px"><label for="world-sun">Sonnenhöhe</label><input id="world-sun" type="range" min="0" max="1" step="0.01" value="0.62"></div>
        <details class="material-lab">
          <summary><span>Material Lab · Presets & Vorschau</span></summary>
          <div class="material-lab-body">
            <div class="material-preview-wrap"><canvas id="material-preview" width="640" height="290"></canvas></div>
            <div class="material-preset-grid" id="material-presets"></div>
            <div class="material-sliders" id="material-sliders"></div>
          </div>
        </details>
      </div>
      <button class="world-generate" id="world-generate" type="button">KLEINE WELT ERZEUGEN</button>
      <div class="world-progress" id="world-progress"></div>
      <div class="world-status" id="world-status">Bild laden. Danach läuft der Rest automatisch.</div>
    </div>`;
  viewport.appendChild(el);
  buildProgress();
  buildMaterialLab();
  wireStudio(el);
  drawMaterialPreview();
}

function buildProgress() {
  const wrap = document.getElementById('world-progress');
  wrap.innerHTML = '';
  STAGES.forEach(([id, label]) => {
    const row = document.createElement('div');
    row.className = 'world-progress-row';
    row.dataset.stage = id;
    row.innerHTML = `<span class="dot"></span><span>${label}</span><small>wartet</small>`;
    wrap.appendChild(row);
  });
}

function stage(id, status, copy = '') {
  const row = document.querySelector(`.world-progress-row[data-stage="${id}"]`);
  if (!row) return;
  row.className = `world-progress-row ${status}`.trim();
  row.querySelector('small').textContent = copy || ({ running: 'läuft', done: 'fertig', fallback: 'Fallback', error: 'Fehler' }[status] || status);
}

function setWorldStatus(message, tone = '') {
  const el = document.getElementById('world-status');
  if (!el) return;
  el.textContent = message;
  el.className = `world-status ${tone}`.trim();
  const legacy = document.getElementById('editor-status');
  if (legacy) legacy.textContent = message;
}

function setSceneFile(file) {
  if (!file || !file.type?.startsWith('image/')) return;
  sceneFile = file;
  const thumb = document.getElementById('world-thumb');
  const title = document.getElementById('world-file-title');
  const copy = document.getElementById('world-file-copy');
  const url = URL.createObjectURL(file);
  thumb.onload = () => URL.revokeObjectURL(url);
  thumb.src = url;
  title.textContent = file.name;
  copy.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB · bereit`;
  setWorldStatus('Bild bereit. Modell, Begrenzung und Himmel wählen – dann Erzeugen.');
}

function buildMaterialLab() {
  const presets = document.getElementById('material-presets');
  for (const [id, preset] of Object.entries(MATERIAL_PRESETS)) {
    const button = document.createElement('button');
    button.className = `material-preset${id === selectedMaterial ? ' active' : ''}`;
    button.type = 'button';
    button.dataset.material = id;
    button.textContent = preset.label;
    button.addEventListener('click', () => selectMaterial(id));
    presets.appendChild(button);
  }
  const sliders = document.getElementById('material-sliders');
  const labels = { roughness: 'Rauheit', height: 'Height', normal: 'Bump/Normal', reflectivity: 'Reflexion', refraction: 'Brechung', flow: 'Fluss' };
  for (const [key, label] of Object.entries(labels)) {
    const row = document.createElement('div');
    row.className = 'material-slider';
    row.innerHTML = `<label>${label}</label><input type="range" min="0" max="1" step="0.01" value="${material[key]}" data-material-slider="${key}"><output>${Number(material[key]).toFixed(2)}</output>`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      material[key] = Number(input.value);
      row.querySelector('output').textContent = Number(input.value).toFixed(2);
      drawMaterialPreview();
    });
    sliders.appendChild(row);
  }
}

function selectMaterial(id) {
  const preset = MATERIAL_PRESETS[id];
  if (!preset) return;
  selectedMaterial = id;
  material = { ...preset };
  document.querySelectorAll('.material-preset').forEach(button => button.classList.toggle('active', button.dataset.material === id));
  document.querySelectorAll('[data-material-slider]').forEach(input => {
    const key = input.dataset.materialSlider;
    input.value = String(material[key]);
    input.parentElement.querySelector('output').textContent = Number(material[key]).toFixed(2);
  });
  drawMaterialPreview();
  if (engine()?.isReady?.()) applyEnvironmentParams();
}

function drawMaterialPreview() {
  const canvas = document.getElementById('material-preview');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#111827'); bg.addColorStop(1, '#040509');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5, cy = h * 0.51, radius = Math.min(w, h) * 0.34;
  const baseHue = selectedMaterial === 'liquid' ? [48, 150, 220] : selectedMaterial === 'snow' ? [220, 232, 242] : selectedMaterial === 'metal' ? [120, 132, 148] : selectedMaterial === 'glass' ? [90, 170, 195] : selectedMaterial === 'organic' ? [70, 128, 76] : selectedMaterial === 'emissive' ? [78, 118, 255] : [118, 105, 94];
  const sphere = ctx.createRadialGradient(cx - radius * .35, cy - radius * .38, radius * .04, cx, cy, radius);
  const spec = Math.round(120 + material.reflectivity * 120);
  sphere.addColorStop(0, `rgb(${Math.min(255,baseHue[0]+spec)},${Math.min(255,baseHue[1]+spec)},${Math.min(255,baseHue[2]+spec)})`);
  sphere.addColorStop(.2, `rgb(${baseHue.join(',')})`);
  sphere.addColorStop(1, `rgb(${Math.round(baseHue[0]*.18)},${Math.round(baseHue[1]*.18)},${Math.round(baseHue[2]*.18)})`);
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = sphere; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
  const lines = 14 + Math.round(material.normal * 34);
  ctx.globalAlpha = .08 + material.height * .18;
  ctx.lineWidth = 1 + material.roughness * 2;
  for (let i = 0; i < lines; i++) {
    const y = cy - radius + (i / Math.max(1, lines - 1)) * radius * 2;
    ctx.beginPath();
    for (let x = cx - radius; x <= cx + radius; x += 8) {
      const wave = Math.sin(x * .045 + i * .7 + performance.now() * .001 * material.flow) * (4 + material.height * 12);
      if (x === cx - radius) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
    }
    ctx.strokeStyle = selectedMaterial === 'emissive' ? '#9bb8ff' : '#ffffff'; ctx.stroke();
  }
  if (material.refraction > .05) {
    ctx.globalAlpha = .08 + material.refraction * .2;
    ctx.fillStyle = '#b9f0ff';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(i * 2.1) * radius * .45, cy + Math.cos(i * 1.3) * radius * .38, 12 + material.refraction * 30, 4 + material.refraction * 10, i, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.strokeStyle = `rgba(255,255,255,${.12 + material.reflectivity * .35})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
}

function wireStudio(el) {
  const toggle = el.querySelector('.world-studio-toggle');
  toggle.addEventListener('click', () => {
    const collapsed = el.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '⌃' : '⌄';
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
  document.getElementById('world-file').addEventListener('change', event => setSceneFile(event.target.files?.[0]));
  document.getElementById('world-provider-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-provider]'); if (!button) return;
    selectedProvider = button.dataset.provider;
    document.querySelectorAll('[data-provider]').forEach(item => item.classList.toggle('active', item === button));
  });
  document.getElementById('world-size').addEventListener('change', event => { selectedWorld = event.target.value; });
  document.getElementById('world-sky').addEventListener('change', event => { selectedSky = event.target.value; if (engine()?.isReady?.()) applyEnvironmentParams(); });
  document.getElementById('world-sun').addEventListener('input', () => { if (engine()?.isReady?.()) applyEnvironmentParams(); });
  document.getElementById('world-generate').addEventListener('click', runWorldPipeline);
}

function applyEnvironmentParams() {
  const api = engine(); if (!api) return;
  const sky = SKY_PRESETS[selectedSky] || SKY_PRESETS.golden;
  const sun = Number(document.getElementById('world-sun')?.value ?? .62);
  const sunNightBias = selectedSky === 'night' ? 0 : Math.max(-.12, Math.min(.24, (.52 - sun) * .45));
  const params = { ...sky.params, ...MATERIAL_PRESETS[selectedMaterial].params, dayNight: Math.max(0, Math.min(1, sky.params.dayNight + sunNightBias)) };
  api.setParams?.(params);
}

function applySpatialControls() {
  const doc = engineDoc(); if (!doc) return;
  const preset = WORLD_PRESETS[selectedWorld] || WORLD_PRESETS.room;
  const values = {
    'spatial-boundary': preset.boundary,
    'spatial-thickness': preset.thickness,
    'spatial-texture-blend': Math.max(0, Math.min(1, preset.textureBlend + (material.reflectivity - material.roughness) * .08)),
    'spatial-vegetation': selectedMaterial === 'organic' ? .92 : .62,
  };
  for (const [id, value] of Object.entries(values)) {
    const input = doc.getElementById(id); if (!input) continue;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop());
    reader.onerror = () => reject(reader.error || new Error('Bild konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

async function requestLocalDepth(file) {
  const preset = WORLD_PRESETS[selectedWorld] || WORLD_PRESETS.room;
  const payload = {
    provider: selectedProvider,
    imageBase64: await fileToBase64(file),
    mime: file.type,
    maxEdge: preset.maxEdge,
    pointBudget: preset.pointBudget,
  };
  const sameOrigin = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  const urls = sameOrigin ? ['/api/generate'] : ['http://127.0.0.1:49666/api/generate'];
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
      return await response.json();
    } catch (error) { lastError = error; }
  }
  return { ok: true, fallback: 'software', attempts: [{ provider: selectedProvider, ok: false, message: lastError?.message || 'Lokale GPU-Bridge nicht erreichbar.' }] };
}

function decodeFloatChannel(bundle, name) {
  const channel = bundle?.result?.channels?.[name];
  const packed = bundle?.channelData?.[name];
  if (!channel || !packed?.data || channel.dtype !== 'float32-le') return null;
  const binary = atob(packed.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const floats = new Float32Array(bytes.length / 4);
  for (let i = 0; i < floats.length; i++) floats[i] = view.getFloat32(i * 4, true);
  return { data: floats, shape: channel.shape };
}

function deriveSurfaceMaps(bundle) {
  const depth = decodeFloatChannel(bundle, 'depth');
  if (!depth || depth.shape.length !== 2) return null;
  const [h, w] = depth.shape;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < depth.data.length; i++) { const v = depth.data[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  const range = Math.max(1e-8, hi - lo);
  const scale = Math.min(1, 512 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const heightCanvas = document.createElement('canvas'); heightCanvas.width = cw; heightCanvas.height = ch;
  const bumpCanvas = document.createElement('canvas'); bumpCanvas.width = cw; bumpCanvas.height = ch;
  const hctx = heightCanvas.getContext('2d'), bctx = bumpCanvas.getContext('2d');
  const himg = hctx.createImageData(cw, ch), bimg = bctx.createImageData(cw, ch);
  const sample = (x, y) => {
    const sx = Math.min(w - 1, Math.round(x / Math.max(1, cw - 1) * (w - 1)));
    const sy = Math.min(h - 1, Math.round(y / Math.max(1, ch - 1) * (h - 1)));
    return (depth.data[sy * w + sx] - lo) / range;
  };
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = (y * cw + x) * 4, v = Math.max(0, Math.min(1, sample(x, y))), g = Math.round(v * 255);
    himg.data[i] = g; himg.data[i + 1] = g; himg.data[i + 2] = g; himg.data[i + 3] = 255;
    const dx = sample(Math.min(cw - 1, x + 1), y) - sample(Math.max(0, x - 1), y);
    const dy = sample(x, Math.min(ch - 1, y + 1)) - sample(x, Math.max(0, y - 1));
    const nx = Math.max(-1, Math.min(1, -dx * 5 * material.normal));
    const ny = Math.max(-1, Math.min(1, -dy * 5 * material.normal));
    const nz = 1 / Math.sqrt(1 + nx * nx + ny * ny);
    bimg.data[i] = Math.round((nx * .5 + .5) * 255); bimg.data[i + 1] = Math.round((ny * .5 + .5) * 255); bimg.data[i + 2] = Math.round(nz * 255); bimg.data[i + 3] = 255;
  }
  hctx.putImageData(himg, 0, 0); bctx.putImageData(bimg, 0, 0);
  return { heightCanvas, bumpCanvas, width: cw, height: ch };
}

async function openSpatialWorld(bundle) {
  const api = engine(); const doc = engineDoc();
  if (!api || !doc) throw new Error('Engine-Dokument fehlt.');
  applySpatialControls();
  const button = doc.getElementById('btn-spatial-view');
  if (!button) throw new Error('Raumansicht fehlt.');
  button.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  applySpatialControls();
  if (bundle && api.spatial?.voxel?.importProviderBundle) api.spatial.voxel.importProviderBundle(bundle);
  api.spatial?.viewer?.stage?.('final');
}

async function flyIntoWorld() {
  const viewer = engine()?.spatial?.viewer;
  if (!viewer) return;
  viewer.setMode?.('orbit');
  const start = { x: 0, y: .12, z: 3.25, yaw: -.32, pitch: -.08 };
  const end = { x: 0, y: .08, z: 1.05, yaw: 0, pitch: 0 };
  viewer.setCamera?.(start);
  const begun = performance.now(), duration = 1450;
  await new Promise(resolve => {
    const tick = now => {
      const t = Math.min(1, (now - begun) / duration), s = t * t * (3 - 2 * t);
      const frame = {}; for (const key of Object.keys(start)) frame[key] = start[key] + (end[key] - start[key]) * s;
      viewer.setCamera?.(frame);
      if (t < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  viewer.setMode?.('walk');
  viewer.setCamera?.({ yaw: 0, pitch: 0 });
}

async function runWorldPipeline() {
  if (running) return;
  if (!sceneFile) {
    document.getElementById('world-studio')?.classList.remove('collapsed');
    setWorldStatus('Erst ein Bild laden.', 'error');
    return;
  }
  running = true;
  generatedMaps = null;
  document.getElementById('world-generate').disabled = true;
  buildProgress();
  let bundle = null;
  try {
    stage('image', 'running');
    const api = await waitForEngine();
    await api.loadImageFile(sceneFile, false);
    applyEnvironmentParams();
    stage('image', 'done', sceneFile.name);

    stage('depth', 'running', selectedProvider === 'software' ? 'Software' : 'RTX');
    let providerResult = { ok: true, fallback: 'software', attempts: [] };
    if (selectedProvider !== 'software') providerResult = await requestLocalDepth(sceneFile);
    if (providerResult.bundle) {
      bundle = providerResult.bundle;
      stage('depth', 'done', providerResult.provider || bundle.result?.provider || 'GPU');
    } else {
      const failed = (providerResult.attempts || []).filter(item => !item.ok).map(item => item.provider).join(' → ');
      stage('depth', 'fallback', failed ? `${failed} → Software` : 'Software');
    }

    stage('maps', 'running');
    if (bundle) generatedMaps = deriveSurfaceMaps(bundle);
    stage('maps', 'done', bundle ? 'Depth + Normals + Punkte + Height/Bump' : 'Software-Depth + Punktwolke');

    stage('world', 'running');
    api.erstellen();
    await waitReady();
    applyEnvironmentParams();
    await openSpatialWorld(bundle);
    stage('world', 'done', bundle ? 'Provider → Voxel → Spiegelhülle' : 'Bildpunkte → Voxel → Spiegelhülle');

    stage('camera', 'running');
    await flyIntoWorld();
    stage('camera', 'done', 'Ego aktiv');
    setWorldStatus(`Welt bereit · ${bundle?.result?.provider || 'Software'} · WASD / Mausblick`, 'ready');
    setTimeout(() => document.getElementById('world-studio')?.classList.add('collapsed'), 650);
  } catch (error) {
    const current = [...document.querySelectorAll('.world-progress-row.running')].pop();
    if (current) { current.classList.remove('running'); current.classList.add('error'); current.querySelector('small').textContent = 'Fehler'; }
    setWorldStatus(error.message || String(error), 'error');
  } finally {
    running = false;
    document.getElementById('world-generate').disabled = false;
  }
}

legacySceneInput?.addEventListener('change', event => setSceneFile(event.target.files?.[0]));
topCreate?.addEventListener('click', event => {
  if (!sceneFile) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  runWorldPipeline();
}, true);

createStudio();

window.SHADEDWorldStudio = {
  run: runWorldPipeline,
  state: () => ({ selectedProvider, selectedWorld, selectedSky, selectedMaterial, material: { ...material }, hasImage: !!sceneFile, hasDerivedMaps: !!generatedMaps }),
  maps: () => generatedMaps,
  materialPresets: () => structuredClone(MATERIAL_PRESETS),
};
