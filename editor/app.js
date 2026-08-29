import { SceneEditorFacade } from './facade.js';
import { MarkerPainter, MARKER_BRUSH, CANONICAL_PALETTE } from './markerPainter.js';
import { ActorPlacer } from './actorPlacer.js';

// SHADED ist der Editor: die Engine (runtime/shaded-engine.mjs) läuft im selben
// Dokument, kein <iframe> mehr. Sie verdrahtet Quelle/Demo/Erstellen (#f-scene,
// #f-mat, #f-depth, #btn-demo, #btn-create) sowie #sliders bereits SELBST direkt
// gegen ihre eigenen PARAMS/CUR-Internas (siehe runtime/shaded-engine.mjs) — das
// ist die reale, seit Jahren getestete Engine-Implementierung, keine „Legacy-
// Präsentation". Der Editor dupliziert das NICHT länger (das war eine zweite,
// veraltete Implementierung mit unvollständiger Parameterliste); #btn-erstellen
// im Topbar ruft stattdessen direkt `window.SHADED.erstellen()` über die Facade.
const facade = new SceneEditorFacade();
const statusEl = document.getElementById('editor-status');
const setStatus = msg => { if (statusEl) statusEl.textContent = msg; };

document.getElementById('btn-erstellen')?.addEventListener('click', async () => {
  if (!facade.isEngineLoaded()) return setStatus('⚠️ Engine noch nicht geladen.');
  setStatus('🧠 Erstelle Szene …');
  if (!facade.create()) return setStatus('⚠️ Zuerst Demo oder Szenenbild laden.');
  try { await facade.waitUntilReady(); renderActorMarkers(); renderIntrinsic(); setStatus('✅ Szene bereit — Parameter sind live einstellbar.'); }
  catch(err) { setStatus(`⚠️ ${err.message}`); }
});
document.getElementById('btn-save-preset')?.addEventListener('click', () => {
  if (!facade.isReady()) return setStatus('⚠️ Erst eine Szene erstellen.');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(facade.getParams(),null,2)],{type:'application/json'})); a.download='shaded-preset.json'; a.click(); URL.revokeObjectURL(a.href);
});
document.getElementById('f-preset')?.addEventListener('change', async e => {
  const file=e.target.files?.[0]; if(!file)return;
  try { facade.setParams(JSON.parse(await file.text())); setStatus(`Preset geladen: ${file.name}`); } catch(err) { setStatus(`⚠️ Preset ungültig: ${err.message}`); }
});

const paintCanvas=document.getElementById('paint-canvas');
const painter=paintCanvas?new MarkerPainter(paintCanvas):null;
function buildPaletteButtons(){const wrap=document.getElementById('palette-buttons');if(!wrap||!painter)return;wrap.innerHTML='';const add=(id,label,hex)=>{const btn=document.createElement('button');btn.type='button';btn.className='swatch';btn.dataset.paletteId=id;btn.style.background=hex;btn.title=`${label} (${hex})`;btn.textContent=label;btn.addEventListener('click',()=>{painter.setBrush(hex);document.querySelectorAll('.swatch').forEach(b=>b.classList.remove('active'));btn.classList.add('active');});wrap.appendChild(btn);return btn;};const marker=add(MARKER_BRUSH.id,MARKER_BRUSH.label,MARKER_BRUSH.hex);for(const p of CANONICAL_PALETTE)add(p.id,p.label,p.hex);marker.classList.add('active');}
buildPaletteButtons();
document.getElementById('brush-size')?.addEventListener('input',e=>painter?.setBrush(undefined,parseInt(e.target.value,10)));
document.getElementById('f-paint-source')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(file&&painter){await painter.loadImage(file);setStatus(`Bild ins Korrekturwerkzeug geladen: ${file.name}`);}});
document.getElementById('btn-paint-clear')?.addEventListener('click',()=>{painter?.clearToOriginal();setStatus('Übermalungen zurückgesetzt.');});
document.getElementById('btn-paint-export')?.addEventListener('click',async()=>{if(!painter)return;const blob=await painter.exportPNGBlob(),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='marker-overlay.png';a.click();URL.revokeObjectURL(a.href);});
document.getElementById('btn-paint-apply')?.addEventListener('click',async()=>{if(!painter?.hasPaintedAnything())return setStatus('⚠️ Erst etwas markieren.');const blob=await painter.exportPNGBlob(),file=new File([blob],'marker-overlay.png',{type:'image/png'});await facade.loadMaterialFile(file);setStatus(`Marker-Overlay übernommen (${painter.countChangedPixels()} Pixel) — jetzt Erstellen.`);});

// Eigene IDs (nicht f-actor-sheet/f-actor-manifest): die Engine selbst wiederholt
// diese Legacy-IDs intern für einen simplen Auto-Add-Pfad ohne Drag-Positionierung
// (siehe runtime/shaded-engine.mjs). Der Editor bietet die reichere, einzige
// sichtbare Actor-UI (Drag-Marker, Liste, Anim/Depth/Scale) — keine doppelten
// Steuerelemente auf denselben IDs.
const actorPlacer=new ActorPlacer(facade),actorOverlay=document.getElementById('actor-overlay'),actorListEl=document.getElementById('actor-list');let pendingActorSheet=null,pendingActorManifest=null;
document.getElementById('f-actor-sheet-editor')?.addEventListener('change',e=>{pendingActorSheet=e.target.files?.[0]||null;});
document.getElementById('f-actor-manifest-editor')?.addEventListener('change',e=>{pendingActorManifest=e.target.files?.[0]||null;});
document.getElementById('btn-actor-add')?.addEventListener('click',async()=>{if(!facade.isEngineLoaded())return setStatus('⚠️ Engine noch nicht geladen.');if(!pendingActorSheet||!pendingActorManifest)return setStatus('⚠️ Erst Sprite-Sheet UND Manifest wählen.');try{const entry=await actorPlacer.addFromFiles(pendingActorSheet,pendingActorManifest);setStatus(`Actor hinzugefügt: ${entry.label}.`);renderActorMarkers();renderActorList();}catch(err){setStatus(`⚠️ Actor konnte nicht hinzugefügt werden: ${err.message}`);}});
function renderActorMarkers(){if(!actorOverlay)return;actorOverlay.innerHTML='';for(const actor of actorPlacer.list()){const marker=document.createElement('div');marker.className='actor-marker';marker.dataset.label=actor.label;marker.style.left=`${actor.x*100}%`;marker.style.top=`${actor.y*100}%`;let dragging=false;const uv=e=>{const rect=actorOverlay.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};};marker.addEventListener('pointerdown',e=>{dragging=true;marker.setPointerCapture(e.pointerId);});marker.addEventListener('pointermove',e=>{if(!dragging)return;const p=uv(e);marker.style.left=`${p.x*100}%`;marker.style.top=`${p.y*100}%`;actorPlacer.setPosition(actor.id,p.x,p.y);});marker.addEventListener('pointerup',()=>{dragging=false;renderActorList();});actorOverlay.appendChild(marker);}}
function renderActorList(){if(!actorListEl)return;actorListEl.innerHTML='';for(const actor of actorPlacer.list()){const row=document.createElement('div');row.className='actor-row';const title=document.createElement('strong');title.textContent=actor.label;const controls=document.createElement('div');controls.className='row';const anim=document.createElement('select');for(const name of actor.animNames){const o=document.createElement('option');o.value=o.textContent=name;o.selected=name===actor.anim;anim.appendChild(o);}anim.onchange=()=>actorPlacer.setAnim(actor.id,anim.value);const depth=document.createElement('select');for(const layer of ['front','mid','back']){const o=document.createElement('option');o.value=o.textContent=layer;o.selected=layer===actor.depthLayer;depth.appendChild(o);}depth.onchange=()=>actorPlacer.setDepthLayer(actor.id,depth.value);const scale=document.createElement('input');scale.type='number';scale.step='.1';scale.min='.1';scale.value=actor.scale;scale.style.width='54px';scale.onchange=()=>actorPlacer.setScale(actor.id,parseFloat(scale.value)||1);const remove=document.createElement('button');remove.type='button';remove.textContent='❌';remove.onclick=()=>{actorPlacer.remove(actor.id);renderActorMarkers();renderActorList();};controls.append(anim,depth,scale,remove);row.append(title,controls);actorListEl.appendChild(row);}}

const intrinsicRange=document.getElementById('intrinsic-strength'),intrinsicValue=document.getElementById('intrinsic-value'),intrinsicStatus=document.getElementById('intrinsic-status');
function renderIntrinsic(){if(!intrinsicStatus)return;const st=facade.getIntrinsicState();if(!st){intrinsicStatus.textContent='Noch keine Zerlegung.';return;}if(intrinsicRange)intrinsicRange.value=String(st.strength);if(intrinsicValue)intrinsicValue.textContent=Number(st.strength).toFixed(2);intrinsicStatus.textContent=st.hasShading?`${st.provider}@${st.providerVersion} · ${st.channelSetId} · ${st.provenance} · Konfidenz ${Number(st.confidence).toFixed(2)} · ${st.resolution.w}×${st.resolution.h}${st.accepted?' · bestätigt':''}`:'Kein Shading-Feld — Fallback identity-albedo.';}
intrinsicRange?.addEventListener('input',()=>{const v=Number(intrinsicRange.value);if(intrinsicValue)intrinsicValue.textContent=v.toFixed(2);if(facade.isReady())facade.setIntrinsicStrength(v);});
document.getElementById('btn-intrinsic-ab')?.addEventListener('click',()=>{if(!facade.isReady())return setStatus('⚠️ Erst eine Szene erstellen.');const st=facade.getIntrinsicState(),next=st&&st.strength>0?0:1;facade.setIntrinsicStrength(next);renderIntrinsic();});
document.getElementById('btn-intrinsic-accept')?.addEventListener('click',()=>{if(!facade.isReady())return setStatus('⚠️ Erst eine Szene erstellen.');facade.acceptIntrinsic();renderIntrinsic();setStatus('Zerlegung bestätigt.');});
document.getElementById('btn-intrinsic-reset')?.addEventListener('click',()=>{if(!facade.isReady())return setStatus('⚠️ Erst eine Szene erstellen.');facade.resetIntrinsic();renderIntrinsic();setStatus('Zerlegung verworfen.');});

window.SHADED_ORCHESTRATOR={loadProject:(project,assets)=>facade.loadProject(project,assets),exportProject:()=>facade.exportProject(),addActorBundle:(sheetFile,manifestFile,opts)=>facade.addActorBundle(sheetFile,manifestFile,opts),getRuntimeStatus:()=>facade.getRuntimeStatus(),getDebugSnapshot:()=>facade.getDebugSnapshot(),isReady:()=>facade.isReady()};