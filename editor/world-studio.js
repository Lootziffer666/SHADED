const iframe = document.getElementById('engine-frame');
const topCreate = document.getElementById('btn-erstellen');
const legacySceneInput = document.getElementById('f-scene');
const viewport = document.querySelector('.viewport');
const DEMO_URL = '/file_00000000974871f49fe71f6b456f9579.png';

const SKY_PRESETS = {
  day: { label: 'Klarer Tag', params: { dayNight: 0.03, storm: 0.02, fog: 0.03, glow: 0.08, wind: 0.22 } },
  golden: { label: 'Golden Hour', params: { dayNight: 0.18, storm: 0.04, fog: 0.08, glow: 0.22, wind: 0.18 } },
  overcast: { label: 'Bedeckt', params: { dayNight: 0.12, storm: 0.45, fog: 0.18, glow: 0.18, wind: 0.35 } },
  night: { label: 'Nacht', params: { dayNight: 0.92, storm: 0.08, fog: 0.12, glow: 0.62, wind: 0.16 } },
  storm: { label: 'Sturm', params: { dayNight: 0.52, storm: 0.95, rain: 0.72, wet: 0.88, puddle: 0.62, fog: 0.42, glow: 0.48, wind: 0.95 } },
};

const WORLD_PRESETS = {
  compact: { label: 'Kompakt', boundary: 0.18, radius: 7, thickness: 0.025, textureBlend: 0.82, maxEdge: 768, pointBudget: 300000 },
  room: { label: 'Raum', boundary: 0.35, radius: 12, thickness: 0.035, textureBlend: 0.75, maxEdge: 1024, pointBudget: 500000 },
  wide: { label: 'Weit', boundary: 0.62, radius: 22, thickness: 0.05, textureBlend: 0.68, maxEdge: 1280, pointBudget: 850000 },
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
let importedBundle = null;
let importedBundleName = '';
let selectedProvider = 'auto';
let selectedWorld = 'room';
let selectedSky = 'golden';
let selectedMaterial = 'neutral';
let material = { ...MATERIAL_PRESETS.neutral };
let running = false;
let generatedMaps = null;
let lastBundle = null;
let worldReady = false;

const engine = () => iframe?.contentWindow?.SHADED || null;
const engineDoc = () => iframe?.contentDocument || null;

function waitForEngine(timeout = 12000) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      if (engine()) return resolve(engine());
      if (performance.now() - started > timeout) return reject(new Error('Engine nicht geladen.'));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function waitReady(timeout = 45000) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      if (engine()?.isReady?.()) return resolve();
      if (performance.now() - started > timeout) return reject(new Error('Szene wurde nicht rechtzeitig bereit.'));
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
        <div class="world-studio-label"><span>Quelle</span><b>01</b></div>
        <label class="world-drop">
          <img class="world-thumb" id="world-thumb" alt="Bildvorschau">
          <span class="world-drop-copy"><strong id="world-file-title">Bild laden</strong><span id="world-file-copy">PNG · JPG · WEBP</span></span>
          <input id="world-file" type="file" accept="image/*">
        </label>
        <div class="world-import-actions">
          <button type="button" id="world-demo">Demo laden</button>
          <label class="world-import-btn">DA2/DA3-Dateien<input id="world-provider-files" type="file" multiple accept=".json,.f32,.bin,application/json,application/octet-stream"></label>
          <label class="world-import-btn">Run-Ordner<input id="world-provider-folder" type="file" webkitdirectory directory multiple></label>
        </div>
        <div class="world-import-note" id="world-import-note">Bestehende <code>bundle.shaded-provider.json</code> oder <code>result.json</code> + Kanäle können direkt weiterverwendet werden.</div>
      </div>
      <div class="world-studio-step">
        <div class="world-studio-label"><span>Tiefenmodell</span><b>02</b></div>
        <div class="world-chip-grid" id="world-provider-grid">
          <button class="world-chip active" data-provider="auto"><b>Auto</b><span>DA3 → V2 → Software</span></button>
          <button class="world-chip" data-provider="depth-anything-3"><b>Depth Anything 3</b><span>RTX bevorzugt</span></button>
          <button class="world-chip" data-provider="depth-anything-v2"><b>Depth Anything V2</b><span>stabiler Fallback</span></button>
          <button class="world-chip" data-provider="software"><b>Software</b><span>CPU / Browser</span></button>
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
      <div class="world-status" id="world-status">Bild laden oder Demo starten. SHADED erzeugt die Tiefe selbst.</div>
    </div>`;
  viewport.appendChild(el);
  buildProgress();
  buildMaterialLab();
  wireStudio(el);
  drawMaterialPreview();
}

function buildProgress() {
  const wrap = document.getElementById('world-progress');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const [id, label] of STAGES) {
    const row = document.createElement('div');
    row.className = 'world-progress-row';
    row.dataset.stage = id;
    row.innerHTML = `<span class="dot"></span><span>${label}</span><small>wartet</small>`;
    wrap.appendChild(row);
  }
}

function stage(id, status, copy = '') {
  const row = document.querySelector(`.world-progress-row[data-stage="${id}"]`);
  if (!row) return;
  row.className = `world-progress-row ${status}`.trim();
  row.querySelector('small').textContent = copy || ({ running: 'läuft', done: 'fertig', fallback: 'Fallback', error: 'Fehler' }[status] || status);
}

function setWorldStatus(message, tone = '') {
  const el = document.getElementById('world-status');
  if (el) { el.textContent = message; el.className = `world-status ${tone}`.trim(); }
  const legacy = document.getElementById('editor-status');
  if (legacy) legacy.textContent = message;
}

function setSceneFile(file) {
  if (!file || !file.type?.startsWith('image/')) return;
  sceneFile = file;
  importedBundle = null;
  importedBundleName = '';
  worldReady = false;
  const thumb = document.getElementById('world-thumb');
  const title = document.getElementById('world-file-title');
  const copy = document.getElementById('world-file-copy');
  const url = URL.createObjectURL(file);
  if (thumb) { thumb.onload = () => URL.revokeObjectURL(url); thumb.src = url; }
  if (title) title.textContent = file.name;
  if (copy) copy.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB · Tiefe wird von SHADED erzeugt`;
  setWorldStatus('Bild bereit. Modell, Begrenzung und Himmel wählen – dann Erzeugen.');
}

async function loadDemo() {
  setWorldStatus('Lade Demo-Bild …');
  const response = await fetch(DEMO_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Demo konnte nicht geladen werden (HTTP ${response.status}).`);
  const blob = await response.blob();
  const file = new File([blob], 'SHADED-Demo.png', { type: blob.type || 'image/png' });
  setSceneFile(file);
  const api = await waitForEngine();
  await api.loadImageFile(file, false);
  setWorldStatus('Demo geladen. „Kleine Welt erzeugen“ startet die vollständige Pipeline.', 'ready');
}

function buildMaterialLab() {
  const presets = document.getElementById('material-presets');
  if (!presets) return;
  for (const [id, preset] of Object.entries(MATERIAL_PRESETS)) {
    const button = document.createElement('button');
    button.className = `material-preset${id === selectedMaterial ? ' active' : ''}`;
    button.type = 'button'; button.dataset.material = id; button.textContent = preset.label;
    button.addEventListener('click', () => selectMaterial(id));
    presets.appendChild(button);
  }
  const sliders = document.getElementById('material-sliders');
  const labels = { roughness: 'Rauheit', height: 'Height', normal: 'Bump/Normal', reflectivity: 'Reflexion', refraction: 'Brechung', flow: 'Fluss' };
  for (const [key, label] of Object.entries(labels)) {
    const row = document.createElement('div'); row.className = 'material-slider';
    row.innerHTML = `<label>${label}</label><input type="range" min="0" max="1" step="0.01" value="${material[key]}" data-material-slider="${key}"><output>${Number(material[key]).toFixed(2)}</output>`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => { material[key] = Number(input.value); row.querySelector('output').textContent = Number(input.value).toFixed(2); drawMaterialPreview(); });
    sliders.appendChild(row);
  }
}

function selectMaterial(id) {
  if (!MATERIAL_PRESETS[id]) return;
  selectedMaterial = id; material = { ...MATERIAL_PRESETS[id] };
  document.querySelectorAll('.material-preset').forEach(button => button.classList.toggle('active', button.dataset.material === id));
  document.querySelectorAll('[data-material-slider]').forEach(input => {
    const key = input.dataset.materialSlider; input.value = String(material[key]);
    input.parentElement.querySelector('output').textContent = Number(material[key]).toFixed(2);
  });
  drawMaterialPreview();
  if (engine()?.isReady?.()) applyEnvironmentParams();
}

function drawMaterialPreview() {
  const canvas = document.getElementById('material-preview'); if (!canvas) return;
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#111827'); bg.addColorStop(1, '#040509'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const cx = w * .5, cy = h * .51, radius = Math.min(w, h) * .34;
  const base = selectedMaterial === 'liquid' ? [48,150,220] : selectedMaterial === 'snow' ? [220,232,242] : selectedMaterial === 'metal' ? [120,132,148] : selectedMaterial === 'glass' ? [90,170,195] : selectedMaterial === 'organic' ? [70,128,76] : selectedMaterial === 'emissive' ? [78,118,255] : [118,105,94];
  const sphere = ctx.createRadialGradient(cx-radius*.35,cy-radius*.38,radius*.04,cx,cy,radius), spec=Math.round(120+material.reflectivity*120);
  sphere.addColorStop(0,`rgb(${Math.min(255,base[0]+spec)},${Math.min(255,base[1]+spec)},${Math.min(255,base[2]+spec)})`); sphere.addColorStop(.2,`rgb(${base.join(',')})`); sphere.addColorStop(1,`rgb(${Math.round(base[0]*.18)},${Math.round(base[1]*.18)},${Math.round(base[2]*.18)})`);
  ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.fillStyle=sphere; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.clip(); ctx.globalAlpha=.08+material.height*.18; ctx.lineWidth=1+material.roughness*2;
  const lines=14+Math.round(material.normal*34);
  for(let i=0;i<lines;i++){const y=cy-radius+(i/Math.max(1,lines-1))*radius*2;ctx.beginPath();for(let x=cx-radius;x<=cx+radius;x+=8){const wave=Math.sin(x*.045+i*.7+performance.now()*.001*material.flow)*(4+material.height*12);if(x===cx-radius)ctx.moveTo(x,y+wave);else ctx.lineTo(x,y+wave);}ctx.strokeStyle=selectedMaterial==='emissive'?'#9bb8ff':'#fff';ctx.stroke();}
  ctx.restore(); ctx.strokeStyle=`rgba(255,255,255,${.12+material.reflectivity*.35})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
}

function wireStudio(el) {
  const toggle = el.querySelector('.world-studio-toggle');
  toggle.addEventListener('click', () => { const collapsed=el.classList.toggle('collapsed'); toggle.textContent=collapsed?'⌃':'⌄'; toggle.setAttribute('aria-expanded',String(!collapsed)); });
  document.getElementById('world-file')?.addEventListener('change', event => setSceneFile(event.target.files?.[0]));
  document.getElementById('world-demo')?.addEventListener('click', () => loadDemo().catch(error => setWorldStatus(error.message,'error')));
  document.getElementById('world-provider-files')?.addEventListener('change', event => importProviderFiles(event.target.files));
  document.getElementById('world-provider-folder')?.addEventListener('change', event => importProviderFiles(event.target.files));
  document.getElementById('world-provider-grid')?.addEventListener('click', event => { const button=event.target.closest('[data-provider]');if(!button)return;selectedProvider=button.dataset.provider;document.querySelectorAll('[data-provider]').forEach(item=>item.classList.toggle('active',item===button)); });
  document.getElementById('world-size')?.addEventListener('change', event => { selectedWorld=event.target.value; });
  document.getElementById('world-sky')?.addEventListener('change', event => { selectedSky=event.target.value; if(engine()?.isReady?.())applyEnvironmentParams(); });
  document.getElementById('world-sun')?.addEventListener('input', () => { if(engine()?.isReady?.())applyEnvironmentParams(); });
  document.getElementById('world-generate')?.addEventListener('click', runWorldPipeline);
}

function applyEnvironmentParams() {
  const api=engine();if(!api)return;const sky=SKY_PRESETS[selectedSky]||SKY_PRESETS.golden;const sun=Number(document.getElementById('world-sun')?.value??.62);const sunNightBias=selectedSky==='night'?0:Math.max(-.12,Math.min(.24,(.52-sun)*.45));
  api.setParams?.({...sky.params,...MATERIAL_PRESETS[selectedMaterial].params,dayNight:Math.max(0,Math.min(1,sky.params.dayNight+sunNightBias))});
}

function applySpatialControls() {
  const doc=engineDoc();if(!doc)return;const preset=WORLD_PRESETS[selectedWorld]||WORLD_PRESETS.room;const values={'spatial-boundary':preset.boundary,'spatial-thickness':preset.thickness,'spatial-texture-blend':Math.max(0,Math.min(1,preset.textureBlend+(material.reflectivity-material.roughness)*.08)),'spatial-vegetation':selectedMaterial==='organic'?.92:.62};
  for(const [id,value] of Object.entries(values)){const input=doc.getElementById(id);if(!input)continue;input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));}
}

function fileToBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',').pop());reader.onerror=()=>reject(reader.error||new Error('Datei konnte nicht gelesen werden.'));reader.readAsDataURL(file);});}
function bytesToBase64(bytes){let out='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)out+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(out);}

async function importProviderFiles(fileList) {
  const files=[...(fileList||[])];if(!files.length)return;
  try{
    const jsonFiles=[];for(const file of files){if(file.name.toLowerCase().endsWith('.json')){try{jsonFiles.push({file,data:JSON.parse(await file.text())});}catch{}}}
    let bundleEntry=jsonFiles.find(entry=>entry.data?.format==='SHADED.spatial-provider-bundle.v1');
    if(bundleEntry){setImportedBundle(bundleEntry.data,bundleEntry.file.name);return;}
    const resultEntry=jsonFiles.find(entry=>entry.data?.format==='SHADED.spatial-provider-result.v1'||entry.file.name.toLowerCase()==='result.json');
    if(!resultEntry)throw new Error('Kein SHADED-Provider-Bundle und kein result.json gefunden.');
    const result=resultEntry.data,channelData={};
    for(const [name,descriptor] of Object.entries(result.channels||{})){
      const wanted=String(descriptor.file||'').replace(/\\/g,'/').split('/').pop().toLowerCase();
      const file=files.find(candidate=>candidate.name.toLowerCase()===wanted||String(candidate.webkitRelativePath||'').replace(/\\/g,'/').toLowerCase().endsWith('/'+wanted));
      if(!file)throw new Error(`Kanaldaten fehlen: ${descriptor.file}`);
      const bytes=new Uint8Array(await file.arrayBuffer());channelData[name]={encoding:'base64',bytes:bytes.byteLength,data:bytesToBase64(bytes)};
    }
    setImportedBundle({format:'SHADED.spatial-provider-bundle.v1',result,channelData},resultEntry.file.name);
  }catch(error){setWorldStatus(`Provider-Import fehlgeschlagen: ${error.message}`,'error');}
}

function setImportedBundle(bundle,name='Provider-Bundle') {
  if(bundle?.format!=='SHADED.spatial-provider-bundle.v1'||bundle.result?.format!=='SHADED.spatial-provider-result.v1')throw new Error('Ungültiges SHADED-Provider-Bundle.');
  importedBundle=bundle; importedBundleName=name; lastBundle=bundle; worldReady=false;
  const title=document.getElementById('world-file-title'),copy=document.getElementById('world-file-copy'),note=document.getElementById('world-import-note');
  if(title)title.textContent=name;if(copy)copy.textContent=`${bundle.result.provider} · ${bundle.result.modelVersion}`;if(note)note.textContent='Provider-Ergebnis geladen – keine erneute Depth-Berechnung nötig.';
  setWorldStatus(`Provider-Ergebnis bereit: ${bundle.result.provider}. Direkt „Kleine Welt erzeugen“ drücken.`,'ready');
}

async function requestLocalDepth(file) {
  const preset=WORLD_PRESETS[selectedWorld]||WORLD_PRESETS.room,payload={provider:selectedProvider,imageBase64:await fileToBase64(file),mime:file.type,maxEdge:preset.maxEdge,pointBudget:preset.pointBudget,boundaryRadius:preset.radius,mirrorThickness:preset.thickness,textureBlend:preset.textureBlend,skyPreset:selectedSky,sunElevation:Number(document.getElementById('world-sun')?.value??.62),materialPreset:selectedMaterial};
  const sameOrigin=['127.0.0.1','localhost'].includes(location.hostname),urls=sameOrigin?['/api/generate']:['http://127.0.0.1:49666/api/generate'];let lastError=null;
  for(const url of urls){try{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw new Error(`Bridge HTTP ${response.status}`);return await response.json();}catch(error){lastError=error;}}
  return {ok:false,attempts:[{provider:selectedProvider,ok:false,message:lastError?.message||'Lokale GPU-Bridge nicht erreichbar.'}]};
}

async function browserSoftwareBundle(file) {
  const bitmap=await createImageBitmap(file),sourceWidth=bitmap.width,sourceHeight=bitmap.height,maxEdge=384,scale=Math.min(1,maxEdge/Math.max(sourceWidth,sourceHeight)),w=Math.max(16,Math.round(sourceWidth*scale)),h=Math.max(16,Math.round(sourceHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,w,h);bitmap.close?.();const rgba=ctx.getImageData(0,0,w,h).data;
  const depth=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,p=i*4,lum=(rgba[p]*.299+rgba[p+1]*.587+rgba[p+2]*.114)/255,vertical=1-y/Math.max(1,h-1);depth[i]=.2+.8*Math.max(0,Math.min(1,.62*vertical+.38*(1-lum)));}
  const preset=WORLD_PRESETS[selectedWorld]||WORLD_PRESETS.room,step=Math.max(1,Math.ceil(Math.sqrt((w*h)/Math.max(1000,preset.pointBudget)))),rows=Math.ceil(h/step),cols=Math.ceil(w/step),points=new Float32Array(rows*cols*6);let n=0;
  for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const i=y*w+x,p=i*4,z=.2+depth[i]*.8,o=n*6;points[o]=(x-w*.5)/w*z;points[o+1]=(h*.5-y)/w*z;points[o+2]=z;points[o+3]=rgba[p]/255;points[o+4]=rgba[p+1]/255;points[o+5]=rgba[p+2]/255;n++;}
  const pack=array=>{const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);return{encoding:'base64',bytes:bytes.byteLength,data:bytesToBase64(bytes)}};
  const result={format:'SHADED.spatial-provider-result.v1',provider:'shaded-browser-software',modelVersion:'luma-perspective-v1',device:'browser-cpu',precision:'fp32',depthConvention:'relative-depth-higher-far',metric:false,channels:{depth:{file:'depth.f32',dtype:'float32-le',shape:[h,w]},points:{file:'points.f32',dtype:'float32-le',shape:[n,6]}},camera:{width:w,height:h,fx:w,fy:w,cx:w*.5,cy:h*.5},provenance:{class:'INFERRED',sourceSha256:'0'.repeat(64),sourceFile:file.name,sourceSize:{width:sourceWidth,height:sourceHeight},processedSize:{width:w,height:h},provider:'shaded-browser-software',modelVersion:'luma-perspective-v1',parameters:{pointBudget:preset.pointBudget}}};
  return {format:'SHADED.spatial-provider-bundle.v1',result,channelData:{depth:pack(depth),points:pack(points.subarray(0,n*6))}};
}

function decodeFloatChannel(bundle,name){const descriptor=bundle?.result?.channels?.[name],packed=bundle?.channelData?.[name];if(!descriptor||!packed?.data||descriptor.dtype!=='float32-le')return null;const binary=atob(packed.data),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const view=new DataView(bytes.buffer),floats=new Float32Array(bytes.length/4);for(let i=0;i<floats.length;i++)floats[i]=view.getFloat32(i*4,true);return{data:floats,shape:descriptor.shape};}

function bundleSpatialPoints(bundle,pointBudget=500000){const channel=decodeFloatChannel(bundle,'points');if(!channel||channel.shape?.length!==2)return null;const stride=channel.shape[1],count=channel.shape[0],step=Math.max(1,Math.ceil(count/pointBudget)),raw=[];let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<count;i+=step){const o=i*stride,x=channel.data[o],y=channel.data[o+1],z=channel.data[o+2],scale=stride===6&&Math.max(channel.data[o+3],channel.data[o+4],channel.data[o+5])<=1?255:1,p={x,y,z,r:stride===6?channel.data[o+3]*scale:160,g:stride===6?channel.data[o+4]*scale:160,b:stride===6?channel.data[o+5]*scale:160,confidence:.72,material:'unknown'};raw.push(p);min[0]=Math.min(min[0],x);min[1]=Math.min(min[1],y);min[2]=Math.min(min[2],z);max[0]=Math.max(max[0],x);max[1]=Math.max(max[1],y);max[2]=Math.max(max[2],z);}if(!raw.length)return null;const center=min.map((v,a)=>(v+max[a])*.5),span=Math.max(...min.map((v,a)=>max[a]-v),1e-6),s=1.7/span;return raw.map((p,i)=>({...p,x:(p.x-center[0])*s,y:(p.y-center[1])*s,z:(p.z-center[2])*s,sourceIndex:i}));}

function deriveSurfaceMaps(bundle){const depth=decodeFloatChannel(bundle,'depth');if(!depth||depth.shape.length!==2)return null;const [h,w]=depth.shape;let lo=Infinity,hi=-Infinity;for(const v of depth.data){if(Number.isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}}const range=Math.max(1e-8,hi-lo),scale=Math.min(1,512/Math.max(w,h)),cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale)),heightCanvas=document.createElement('canvas'),bumpCanvas=document.createElement('canvas');heightCanvas.width=bumpCanvas.width=cw;heightCanvas.height=bumpCanvas.height=ch;const hctx=heightCanvas.getContext('2d'),bctx=bumpCanvas.getContext('2d'),himg=hctx.createImageData(cw,ch),bimg=bctx.createImageData(cw,ch),sample=(x,y)=>{const sx=Math.min(w-1,Math.round(x/Math.max(1,cw-1)*(w-1))),sy=Math.min(h-1,Math.round(y/Math.max(1,ch-1)*(h-1)));return(depth.data[sy*w+sx]-lo)/range;};for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const i=(y*cw+x)*4,v=Math.max(0,Math.min(1,sample(x,y))),g=Math.round(v*255),dx=sample(Math.min(cw-1,x+1),y)-sample(Math.max(0,x-1),y),dy=sample(x,Math.min(ch-1,y+1))-sample(x,Math.max(0,y-1)),nx=Math.max(-1,Math.min(1,-dx*5*material.normal)),ny=Math.max(-1,Math.min(1,-dy*5*material.normal)),nz=1/Math.sqrt(1+nx*nx+ny*ny);himg.data.set([g,g,g,255],i);bimg.data.set([Math.round((nx*.5+.5)*255),Math.round((ny*.5+.5)*255),Math.round(nz*255),255],i);}hctx.putImageData(himg,0,0);bctx.putImageData(bimg,0,0);return{heightCanvas,bumpCanvas,width:cw,height:ch};}

async function openSpatialWorld(bundle) {
  const api=engine(),doc=engineDoc();if(!api||!doc)throw new Error('Engine-Dokument fehlt.');if(!bundle)throw new Error('Keine räumlichen Daten vorhanden. SHADED muss zuerst Tiefe erzeugen.');
  applySpatialControls();
  const imported=api.spatial?.voxel?.importProviderBundle?.(bundle);if(!imported)throw new Error('Provider-Bundle konnte nicht in die Raumwelt übernommen werden.');
  const spatialPoints=bundleSpatialPoints(bundle);const originalPointCloud=api.spatial?.pointCloud;
  if(spatialPoints&&api.spatial)api.spatial.pointCloud=()=>({points:spatialPoints});
  try{const button=doc.getElementById('btn-spatial-view');if(!button)throw new Error('Raumansicht fehlt.');button.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}finally{if(api.spatial&&originalPointCloud)api.spatial.pointCloud=originalPointCloud;}
  applySpatialControls();api.spatial?.viewer?.stage?.('final');
}

async function flyIntoWorld(){const viewer=engine()?.spatial?.viewer;if(!viewer)return;viewer.setMode?.('orbit');const start={x:0,y:.12,z:3.25,yaw:-.32,pitch:-.08},end={x:0,y:.08,z:1.05,yaw:0,pitch:0};viewer.setCamera?.(start);const begun=performance.now(),duration=1450;await new Promise(resolve=>{const tick=now=>{const t=Math.min(1,(now-begun)/duration),s=t*t*(3-2*t),frame={};for(const key of Object.keys(start))frame[key]=start[key]+(end[key]-start[key])*s;viewer.setCamera?.(frame);if(t<1)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});viewer.setMode?.('walk');viewer.setCamera?.({yaw:0,pitch:0});}

async function runWorldPipeline(){if(running)return;if(!sceneFile&&!importedBundle){document.getElementById('world-studio')?.classList.remove('collapsed');setWorldStatus('Bild laden, Demo starten oder vorhandene DA2/DA3-Dateien importieren. SHADED erzeugt die Tiefe selbst.','error');return;}running=true;worldReady=false;generatedMaps=null;const generate=document.getElementById('world-generate');if(generate)generate.disabled=true;buildProgress();let bundle=importedBundle;try{const api=await waitForEngine();if(sceneFile){stage('image','running');await api.loadImageFile(sceneFile,false);applyEnvironmentParams();stage('image','done',sceneFile.name);}else stage('image','done','Provider-Import');
    stage('depth','running',bundle?'vorhanden':selectedProvider==='software'?'Software':'Auto');
    if(!bundle){let providerResult=await requestLocalDepth(sceneFile);if(providerResult?.bundle){bundle=providerResult.bundle;const failed=(providerResult.attempts||[]).filter(item=>!item.ok).map(item=>item.provider);stage('depth',failed.length?'fallback':'done',failed.length?`${failed.join(' → ')} → ${providerResult.provider}`:(providerResult.provider||bundle.result?.provider||'GPU'));}else{bundle=await browserSoftwareBundle(sceneFile);const failed=(providerResult?.attempts||[]).filter(item=>!item.ok).map(item=>item.provider).join(' → ');stage('depth','fallback',failed?`${failed} → Browser-Software`:'Browser-Software');}}
    lastBundle=bundle;generatedMaps=deriveSurfaceMaps(bundle);stage('maps','done','Depth + Point Cloud + Height/Bump/Normal');
    stage('world','running');if(sceneFile){api.erstellen();try{await waitReady();}catch{}}applyEnvironmentParams();await openSpatialWorld(bundle);stage('world','done','Point Cloud → Voxel → Spiegelhülle → Raum');
    stage('camera','running');await flyIntoWorld();stage('camera','done','Ego aktiv');worldReady=true;setWorldStatus(`Welt bereit · ${bundle.result?.provider||'Provider'} · direkt steuerbar`,'ready');setTimeout(()=>document.getElementById('world-studio')?.classList.add('collapsed'),650);
  }catch(error){const current=[...document.querySelectorAll('.world-progress-row.running')].pop();if(current){current.classList.remove('running');current.classList.add('error');current.querySelector('small').textContent='Fehler';}setWorldStatus(error.message||String(error),'error');}finally{running=false;if(generate)generate.disabled=false;}}

async function enterRoom(){if(running)return;if(worldReady&&lastBundle){await openSpatialWorld(lastBundle);engine()?.spatial?.viewer?.setMode?.('walk');return;}if(sceneFile||importedBundle)return runWorldPipeline();document.getElementById('world-studio')?.classList.remove('collapsed');setWorldStatus('Bild laden oder Demo starten. Die Tiefenkarte wird von SHADED automatisch erzeugt.','error');}

legacySceneInput?.addEventListener('change',event=>setSceneFile(event.target.files?.[0]));
topCreate?.addEventListener('click',event=>{if(!sceneFile&&!importedBundle)return;event.preventDefault();event.stopImmediatePropagation();runWorldPipeline();},true);

createStudio();
window.SHADEDWorldStudio={run:runWorldPipeline,enterRoom,loadDemo,importBundle:setImportedBundle,state:()=>({selectedProvider,selectedWorld,selectedSky,selectedMaterial,material:{...material},hasImage:!!sceneFile,hasImportedProvider:!!importedBundle,worldReady,provider:lastBundle?.result?.provider||null}),maps:()=>generatedMaps,materialPresets:()=>structuredClone(MATERIAL_PRESETS)};