// SHADED SWIFT-Actor-Bridge — extrahiert aus runtime/shaded-engine.mjs als eigenständiges
// ESM-Modul (Stufe 2 der Aufteilung, siehe docs/engine-decomposition-plan.md). Lädt animierte
// Sprite-Sheets + Manifest (identisches Schema wie SWIFTs core.sprite_sheet.SpriteSheetManifest,
// siehe SWIFT-Repo) und zeichnet sie als rein optische Akteure auf dem Overlay-Canvas – parallel
// zur Spielfigur, OHNE classGrid/getMaterialTypeAt (die Material-Wahrheit) zu berühren
// (Invariante 2). Spricht Material-Klassifikation und Trail-Textur ausschließlich über das
// öffentliche window.SHADED-API an (Invariante 5), nie über Engine-Interna direkt — gleiches
// Idiom wie runtime/dialogue-engine.mjs. `window.SHADED_ENGINE_INTERNAL` ist eine bewusst NICHT
// dokumentierte, NICHT-öffentliche Bridge nur für Cross-Modul-Zugriffe, die (noch) keinen Platz
// im Invariante-5-Vertrag haben (hier: Live-Referenz auf PARAMS für fog/dayNight-Lesezugriff,
// und die Registrierung des Draw-Hooks, den drawOverlay() in shaded-engine.mjs aufruft).
const ov=document.getElementById('ov');
const ovx=ov.getContext('2d');
const setStatus=s=>document.getElementById('status').textContent=s;

let actors=[];
// Phase B2: durchschnittliche Tiefe eines Frames (0..1, 1 = nah/hell in der Depth-Map),
// einmal pro Frame-ID berechnet und am Actor gecacht. Ergebnis ist ein reiner
// Helligkeitsfaktor (nah bis +30 %, fern bis −15 %) – nie eine Farbverschiebung.
function actorDepthBrightness(a, frameId){
  if(!(a.depthImg&&a.depthReady&&a.manifest&&a.manifest.depthFrameRects)) return 1;
  const rect=a.manifest.depthFrameRects[frameId];
  if(!rect) return 1;
  a._depthAvg=a._depthAvg||{};
  if(!(frameId in a._depthAvg)){
    const diw=a.depthImg.naturalWidth||a.depthImg.width, dih=a.depthImg.naturalHeight||a.depthImg.height;
    const scX=a.manifest.depthSourceW?diw/a.manifest.depthSourceW:1;
    const scY=a.manifest.depthSourceH?dih/a.manifest.depthSourceH:1;
    const w=Math.max(1,Math.round(rect[2]*scX)), h=Math.max(1,Math.round(rect[3]*scY));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const cx=c.getContext('2d',{willReadFrequently:true});
    cx.drawImage(a.depthImg, rect[0]*scX, rect[1]*scY, w, h, 0, 0, w, h);
    const d=cx.getImageData(0,0,w,h).data;
    let sum=0; for(let i=0;i<d.length;i+=4) sum+=d[i];
    a._depthAvg[frameId]=(sum/(d.length/4))/255;   // 0 = fern/dunkel, 1 = nah/hell
  }
  const f=a._depthAvg[frameId];
  return 1 + f*0.3 - (1-f)*0.15;
}
function parseActorManifest(data){
  if(data.mappingVersion&&data.mappingVersion!=='1.4.0'&&data.mappingVersion!=='1.3.0'){
    console.warn('SHADED: unbekannte Manifest-mappingVersion "'+data.mappingVersion+'" – erwartet 1.3.0/1.4.0, lade nach Best Effort.');
  }
  const m={sourceW:(data.sourceImage&&data.sourceImage.w)||0,
           sourceH:(data.sourceImage&&data.sourceImage.h)||0,
           frameRects:{}, animations:{}, depthImage:data.depthImage||null,
           depthSourceW:(data.depthSourceImage&&data.depthSourceImage.w)||0,
           depthSourceH:(data.depthSourceImage&&data.depthSourceImage.h)||0,
           depthFrameRects:{},
           // SWIFT v1.4.0-Erweiterungen (--emissive-pass / --normal-pass / --world-states):
           // emissive wird als additives Nacht-Glühen gerendert; normal wird geparst,
           // aber (noch) nicht gerendert (Canvas-2D hat keinen Licht-Pass);
           // worldStates referenzieren Varianten-Sheets (setWorldState am Handle).
           emissiveImage:data.emissiveImage||null,
           emissiveSourceW:(data.emissiveSourceImage&&data.emissiveSourceImage.w)||0,
           emissiveSourceH:(data.emissiveSourceImage&&data.emissiveSourceImage.h)||0,
           emissiveFrameRects:{},
           normalImage:data.normalImage||null,
           worldStates:{}, variants:Array.isArray(data.variants)?data.variants:[]};
  const frames=data.frames||[];
  const explicit=data.frameRects||{};
  if(Object.keys(explicit).length){
    frames.forEach(f=>{ const r=explicit[f.id]; if(r) m.frameRects[f.id]=[r.x,r.y,r.w,r.h]; });
  } else if(data.grid){
    const cols=data.grid.columns||{}, rows=data.grid.rows||{};
    frames.forEach(f=>{
      const c=cols[String(f.col)]||{}, rw=rows[String(f.row)]||{};
      m.frameRects[f.id]=[c.x||0, rw.y||0, c.w||0, rw.h||0];
    });
  }
  // Optional: Depth-Frame-Rects (identische Koordinaten wie Color-Frames, aber andere Quelle)
  const depthExplicit=data.depthFrameRects||{};
  if(Object.keys(depthExplicit).length){
    frames.forEach(f=>{ const r=depthExplicit[f.id]; if(r) m.depthFrameRects[f.id]=[r.x,r.y,r.w,r.h]; });
  }
  // Optional: Emissive-Frame-Rects (Layout identisch zu frameRects, eigene Quelle)
  const emisExplicit=data.emissiveFrameRects||{};
  if(Object.keys(emisExplicit).length){
    frames.forEach(f=>{ const r=emisExplicit[f.id]; if(r) m.emissiveFrameRects[f.id]=[r.x,r.y,r.w,r.h]; });
  }
  // Optional: worldStates (SWIFT WorldStateRef; legacy `palette` wird toleriert)
  for(const name in (data.worldStates||{})){
    const ws=data.worldStates[name]||{};
    m.worldStates[name]={name:ws.name||name,
                         transform:ws.transform||ws.palette||name,
                         intensity:typeof ws.intensity==='number'?ws.intensity:0.5,
                         variantPath:ws.variant_path||null,
                         params:ws.params||null};
  }
  for(const name in (data.animations||{})){
    const a=data.animations[name];
    m.animations[name]={frames:a.frames||[], fps:a.fps||12, loop:a.loop!==false};
  }
  return m;
}
function drawActors(dt){
  const W=ov.width,H=ov.height;
  // Tiefenschichtung: back wird ZUERST gemalt (landet unten), front ZULETZT (landet oben).
  // Canvas-2D: spätere drawImage-Aufrufe liegen über früheren.
  // Innerhalb jeder Schicht: nach Y sortieren (hinten = kleineres Y zuerst)
  const sortedActors=[...actors].sort((a,b)=>{
    const order={back:0, mid:1, front:2};
    const layerCmp=(order[a.depthLayer]??1)-(order[b.depthLayer]??1);
    if(layerCmp!==0) return layerCmp;
    return a.y-b.y;  // Gleichschicht: nach Y (hinten=kleineres Y zuerst)
  });
  // CLAUDE.md v1.4.0: globalAlpha = baseAlpha * (1 - fog * 0.5) * (1 - dayNight * 0.3)
  const PARAMS=window.SHADED_ENGINE_INTERNAL.PARAMS;
  const fog=PARAMS.fog||0, dayNight=PARAMS.dayNight||0.5;
  const fogMult=1-fog*0.5;
  const nightMult=1-dayNight*0.3;
  for(const a of sortedActors){
    if(!a.visible||!a.imgReady||!a.manifest)continue;
    // #2: SWIFT-Aktoren hinterlassen Spuren, wo sie über begehbaren Boden laufen
    const aMat = (typeof window.SHADED.getMaterialTypeAt==='function') ? window.SHADED.getMaterialTypeAt(a.x,a.y) : null;
    const onGround = aMat && aMat!=='water' && aMat!=='roof' && aMat!=='window';
    if(onGround && (a.depthLayer==='mid'||a.depthLayer==='front') && a._lu!==undefined){
      const moved=Math.hypot(a.x-a._lu, a.y-a._lv);
      if(moved>0.012){
        window.SHADED.trail.stamp(a.x, a.y+0.006, 0.008, 0, 0.6);                  // frische Delle
        window.SHADED.trail.stamp(a.x, a.y+0.006, 0.010, 2, 0.03, 235);           // leichter Dauerpfad
        if(a.blood) window.SHADED.trail.stamp(a.x, a.y+0.006, 0.010, 3, 0.12);    // Blut-Schleppspur
      }
    }
    a._lu=a.x; a._lv=a.y;
    const anim=a.manifest.animations[a.anim]||a.manifest.animations[Object.keys(a.manifest.animations)[0]];
    if(!anim||!anim.frames.length)continue;
    a.frameT+=dt*anim.fps;
    let idx=Math.floor(a.frameT);
    if(anim.loop) idx%=anim.frames.length; else idx=Math.min(idx,anim.frames.length-1);
    const rect=a.manifest.frameRects[anim.frames[idx]];
    if(!rect)continue;
    const iw=a.img.naturalWidth||a.img.width, ih=a.img.naturalHeight||a.img.height;
    const scaleX=a.manifest.sourceW?iw/a.manifest.sourceW:1, scaleY=a.manifest.sourceH?ih/a.manifest.sourceH:1;
    const sx=rect[0]*scaleX, sy=rect[1]*scaleY, sw=rect[2]*scaleX, sh=rect[3]*scaleY;
    const dw=sw*a.scale, dh=sh*a.scale;
    const oldAlpha=ovx.globalAlpha;
    ovx.globalAlpha=fogMult*nightMult;
    // Phase B2: avgDepth pro Frame-ID einmalig vorberechnet (kein getImageData im
    // Render-Pfad) steuert die Helligkeit: nah = leichter Highlight, fern = leicht
    // abgedunkelt. Bewusst KEIN Farbtint (Regel: keine Farbverschiebung auf Actors).
    const depthBright=actorDepthBrightness(a, anim.frames[idx]);
    if(depthBright!==1) ovx.filter='brightness('+depthBright.toFixed(3)+')';
    ovx.drawImage(a.img, sx,sy,sw,sh, a.x*W-dw/2, a.y*H-dh, dw,dh);
    if(depthBright!==1) ovx.filter='none';
    // SWIFT --emissive-pass: Emission additiv obendrauf. Kein Tint der Basistextur
    // (Regel „keine Farbverschiebung auf Actors" bleibt gewahrt) – die Emission ist
    // von SWIFT autorisiertes Eigenlicht. Nachts voll, tags schwach; Nebel dämpft
    // (gleicher fogMult wie der Actor selbst).
    if(a.emissiveReady&&a.emissiveImg){
      const fid=anim.frames[idx];
      const er=a.manifest.emissiveFrameRects[fid]||a.manifest.frameRects[fid];
      if(er){
        const eiw=a.emissiveImg.naturalWidth||a.emissiveImg.width,
              eih=a.emissiveImg.naturalHeight||a.emissiveImg.height;
        const eSW=a.manifest.emissiveSourceW||a.manifest.sourceW,
              eSH=a.manifest.emissiveSourceH||a.manifest.sourceH;
        const esX=eSW?eiw/eSW:1, esY=eSH?eih/eSH:1;
        const oldComp=ovx.globalCompositeOperation;
        ovx.globalCompositeOperation='lighter';
        ovx.globalAlpha=fogMult*(0.25+0.75*dayNight);
        ovx.drawImage(a.emissiveImg, er[0]*esX,er[1]*esY,er[2]*esX,er[3]*esY,
                      a.x*W-dw/2, a.y*H-dh, dw,dh);
        ovx.globalCompositeOperation=oldComp;
      }
    }
    ovx.globalAlpha=oldAlpha;
    // Weltgesetz #2: SWIFT-Aktoren hinterlassen Spuren, wo es Sinn ergibt
    // (nur front/mid – back-Akteure stehen hinter der Szene, keine Bodenspur)
    if(a.depthLayer!=='back'){
      if(a._lx!==undefined){
        const am=Math.hypot(a.x-a._lx, a.y-a._ly);
        if(am>0.004){
          a._ta=(a._ta||0)+am;
          if(a._ta>0.02){
            a._ta=0;
            window.SHADED.trail.stamp(a.x, a.y, 0.008, 0, 0.45);             // frischer Abdruck
            window.SHADED.trail.stamp(a.x, a.y, 0.010, 2, 0.03, 170);        // leichter Pfad
          }
        }
      }
      a._lx=a.x; a._ly=a.y;
    }
  }
}
function addActor(opts){
  opts=opts||{};
  const actor={img:null, imgReady:false, depthImg:null, depthReady:false, manifest:null,
                x:opts.x??0.5, y:opts.y??0.6, scale:opts.scale||1,
                anim:opts.anim||null, frameT:0, visible:true, depthLayer:opts.depthLayer||'mid',
                blood:!!opts.blood,
                // SWIFT v1.5: Emissive-Sheet und Weltzustands-Varianten. Diese Felder
                // MÜSSEN hier stehen – setWorldState() schreibt sonst in undefined.
                emissiveImg:null, emissiveReady:false,
                worldStateImgs:{}, worldState:null, _baseImg:null};
  actors.push(actor);
  if(opts.manifest){
    actor.manifest=parseActorManifest(typeof opts.manifest==='string'?JSON.parse(opts.manifest):opts.manifest);
    if(!actor.anim) actor.anim=Object.keys(actor.manifest.animations)[0];
  }
  const loadInto=(src,cb)=>{
    if(src instanceof HTMLImageElement){
      if(src.complete) cb(src);
      else src.addEventListener('load',()=>cb(src));
    } else if(typeof src==='string'){
      const img=new Image(); img.onload=()=>cb(img); img.src=src;
    }
  };
  if(opts.image) loadInto(opts.image, img=>{ actor.img=img; actor.imgReady=true; });
  if(opts.depthImage) loadInto(opts.depthImage, img=>{ actor.depthImg=img; actor.depthReady=true; });
  // SWIFT --emissive-pass: wie depthImage wird das Emissive-Sheet NICHT automatisch
  // aus dem Manifest-Pfad geladen, sondern explizit als Option übergeben.
  if(opts.emissiveImage) loadInto(opts.emissiveImage, img=>{ actor.emissiveImg=img; actor.emissiveReady=true; });
  // SWIFT --world-states: Varianten-Sheets (identisches Frame-Layout, Vertrag §5).
  // worldStateImages: { dust:<url|HTMLImage>, aging:... } – Auswahl via setWorldState().
  for(const wsName in (opts.worldStateImages||{})){
    const slot={img:null, ready:false, onReady:null};
    actor.worldStateImgs[wsName]=slot;
    loadInto(opts.worldStateImages[wsName], img=>{ slot.img=img; slot.ready=true; if(slot.onReady) slot.onReady(); });
  }
  return {
    setAnim:(name)=>{ if(actor.manifest&&actor.manifest.animations[name]){ actor.anim=name; actor.frameT=0; } },
    setPosition:(x,y)=>{ actor.x=x; actor.y=y; },
    setVisible:(v)=>{ actor.visible=!!v; },
    setDepthLayer:(l)=>{ if(['front','mid','back'].includes(l)) actor.depthLayer=l; },
    // SWIFT-Weltzustands-Variante aktivieren (null = Basis-Sheet). Rein optisch –
    // Frame-Layout ist laut Orchestration-Vertrag über alle Varianten identisch.
    setWorldState:(name)=>{
      if(!name){
        if(actor._baseImg){ actor.img=actor._baseImg; actor.imgReady=true; }
        actor.worldState=null; return true;
      }
      const slot=actor.worldStateImgs[name];
      if(!slot) return false;
      if(!actor._baseImg) actor._baseImg=actor.img;
      const apply=()=>{ actor.img=slot.img; actor.imgReady=true; actor.worldState=name; };
      if(slot.ready) apply(); else slot.onReady=apply;
      return true;
    },
    getWorldStates:()=>actor.manifest?Object.keys(actor.manifest.worldStates):[],
    getWorldState:()=>actor.worldState,
    remove:()=>{ const i=actors.indexOf(actor); if(i>=0) actors.splice(i,1); }
  };
}
function loadActorPair(imgFile,manifestFile){
  const img=new Image();
  img.onload=()=>{
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(reader.result);
        addActor({image:img, manifest:data});
        setStatus('Akteur geladen: '+img.width+'×'+img.height+' ('+Object.keys(data.animations||{}).length+' Animation(en)).');
      }catch(e){ setStatus('⚠️ Akteur-Manifest ungültig: '+e.message); }
    };
    reader.readAsText(manifestFile);
    URL.revokeObjectURL(img.src);
  };
  img.src=URL.createObjectURL(imgFile);
}
let pendingActorSheet=null;
document.getElementById('f-actor-sheet').onchange=e=>{ pendingActorSheet=e.target.files[0]||null; };
document.getElementById('f-actor-manifest').onchange=e=>{
  const mf=e.target.files[0];
  if(mf&&pendingActorSheet){ loadActorPair(pendingActorSheet,mf); pendingActorSheet=null; }
  else if(mf) setStatus('⚠️ Erst Sprite-Sheet-Bild wählen, dann Manifest.');
};

if(!window.SHADED) throw new Error('actor-bridge.mjs: window.SHADED fehlt — muss nach shaded-engine.mjs geladen werden');
if(!window.SHADED_ENGINE_INTERNAL) throw new Error('actor-bridge.mjs: window.SHADED_ENGINE_INTERNAL fehlt — muss nach shaded-engine.mjs geladen werden');
window.SHADED.addActor = addActor;
window.SHADED_ENGINE_INTERNAL.drawActors = drawActors;
