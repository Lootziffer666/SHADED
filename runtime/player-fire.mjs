// SHADED Spieler & Lagerfeuer (Runde 4) — extrahiert aus runtime/shaded-engine.mjs als
// eigenständiges ESM-Modul (Stufe 4 der Aufteilung, siehe docs/engine-decomposition-plan.md).
// fireUniforms() bleibt bewusst in shaded-engine.mjs zurück (schreibt direkt GL-Uniforms,
// Kopplung an den WebGL-Kern) — dieses Modul liefert nur den `fires`-Zustand dafür über die
// Bridge. Spricht Material, Fußspuren und Wetter-Zustand ausschließlich über das öffentliche
// window.SHADED-API an (Invariante 5); für Zustand ohne öffentlichen Platz (CUR-Referenz,
// Weltzeit, das gemeinsame `fires`/`player`-Objekt) über window.SHADED_ENGINE_INTERNAL
// (siehe runtime/actor-bridge.mjs für den Präzedenzfall dieses Musters).
// ov/ovx: das Overlay-Canvas ist der eigentliche Render-Ziel-Adapter (siehe
// runtime/shaded-engine.mjs createEngineDOM()) -- gehört zur später folgenden Kategorie-3-
// Umstellung (expliziter Host->Adapter->Engine-Übergabe statt DOM-Lookup), noch nicht hier.
const ov=document.getElementById('ov');
const ovx=ov.getContext('2d');
// Reine Statuszeile -- Rule zero: DOM is not an API, degradiert ohne Element zum No-op.
const setStatus=s=>{ const el=document.getElementById('status'); if(el) el.textContent=s; };

if(!window.SHADED) throw new Error('player-fire.mjs: window.SHADED fehlt — muss nach shaded-engine.mjs geladen werden');
if(!window.SHADED_ENGINE_INTERNAL) throw new Error('player-fire.mjs: window.SHADED_ENGINE_INTERNAL fehlt — muss nach shaded-engine.mjs geladen werden');
const CUR=window.SHADED_ENGINE_INTERNAL.CUR;

const player={active:false,u:0.5,v:0.6,vu:0,vv:0,exert:0,wet:0,age:0,
               breathT:0,stampAcc:0,dashT:0,dashCd:0,lookX:0,lookY:0,
               carryMud:0,carryAsh:0};
const keys={};
const MAT_SPEED={path:1.0,grass:0.75,rock:0.85,wood:0.9,foliage:0.6,water:0.45,window:0.9,roof:0.9};

function spawnPlayer(){
  if(player.active||!window.SHADED.isReady())return;
  const spawn=window.SHADED_ENGINE_INTERNAL.findSpawnPoint();
  if(!spawn) return;
  player.u=spawn.u; player.v=spawn.v; player.active=true;
  setStatus('🚶 Figur erwacht. WASD laufen · Leertaste Sprint · F Feuer.');
}
function dash(){
  if(!player.active||player.dashCd>0)return;
  player.dashT=0.25; player.dashCd=1.1; player.exert=Math.min(1,player.exert+0.5);
  window.SHADED.trail.stamp(player.u,player.v,0.05,1,0.9);           // Impuls: Laub & Vegetation stieben
  window.SHADED_ENGINE_INTERNAL.stirLeavesNear?.(player.u,player.v,0.09,0.06);
  // Früchte fallen von nahen Kronen
  for(let tries=0,drops=0;tries<24&&drops<2;tries++){
    const ru=player.u+(Math.random()-0.5)*0.12, rv=player.v+(Math.random()-0.5)*0.12;
    if(window.SHADED.getMaterialTypeAt(ru,rv)==='foliage'){
      window.SHADED_ENGINE_INTERNAL.spawnFruit?.(ru,rv);
      drops++;
    }
  }
}
function playerTick(dt){
  if(!player.active)return;
  let mu=0,mv=0;
  if(keys.w||keys.arrowup)mv-=1;
  if(keys.s||keys.arrowdown)mv+=1;
  if(keys.a||keys.arrowleft)mu-=1;
  if(keys.d||keys.arrowright)mu+=1;
  const mat=window.SHADED.getMaterialTypeAt(player.u,player.v)||'path';
  const tempC=CUR.temperature*50-20;
  const slippery = tempC<0 && (mat==='water'||mat==='path'||mat==='rock');
  const moving = (mu||mv);
  let speed=0.085*(MAT_SPEED[mat]||1)*(1-CUR.snow*0.45);
  if(player.dashT>0){speed*=3.4;player.dashT-=dt;}
  if(player.dashCd>0)player.dashCd-=dt;
  if(moving){
    const len=Math.hypot(mu,mv), tu=mu/len*speed, tv=mv/len*speed;
    if(slippery){ player.vu+=(tu-player.vu)*1.6*dt; player.vv+=(tv-player.vv)*1.6*dt; }
    else{ player.vu=tu; player.vv=tv; }
    player.exert=Math.min(1,player.exert+dt*(player.dashT>0?0.6:0.18));
    player.lookX=Math.sign(mu); player.lookY=Math.sign(mv);
  }else if(slippery){ player.vu*=Math.pow(0.5,dt/1.2); player.vv*=Math.pow(0.5,dt/1.2); }
  else{ player.vu=0; player.vv=0; }
  player.exert=Math.max(0,player.exert-dt*0.10);
  const du=player.vu*dt, dv=player.vv*dt;
  player.u=Math.max(0.01,Math.min(0.99,player.u+du));
  player.v=Math.max(0.01,Math.min(0.99,player.v+dv));
  // Fußspuren: oberflächenspezifisch, lesbar & konsequent (Weltgesetz #2)
  player.stampAcc+=Math.hypot(du,dv);
  if(player.stampAcc>0.014){
    player.stampAcc=0;
    const mat=window.SHADED.getMaterialTypeAt(player.u,player.v)||'path';
    const onSnow = CUR.snow>0.05 && (mat==='grass'||mat==='foliage'||mat==='roof'||mat==='rock'||mat==='path');
    const onAsh  = window.SHADED.trail.sample(player.u,player.v).a>0.15;        // steht auf Brand/Asche
    const wet = CUR.wet>0.4 || mat==='water';
    // Kontamination an den Schuhen: Schlamm aus Nässe, Asche von Brandstellen
    if(wet && (mat==='path'||mat==='grass'||mat==='water')) player.mud=Math.min(1,player.mud+0.25);
    else player.mud=Math.max(0,player.mud-dt*0.4);
    player.ash = onAsh?1:Math.max(0,player.ash-dt*0.6);
    // (R) frische Delle – tief auf Schnee, leicht auf Stein/Holz
    let rStr=0.7, rRad=0.007;
    if(onSnow){ rStr=1.0; rRad=0.010; }
    else if(mat==='rock'||mat==='wood'){ rStr=0.4; rRad=0.006; }
    window.SHADED.trail.stamp(player.u,player.v+0.006,rRad,0,rStr);
    // (B) permanenter Trampelpfad – Basis wie Runde 4 (sichtbar & beständig)
    window.SHADED.trail.stamp(player.u,player.v+0.006,0.009,2,0.045,235);
    // #2 Übertragung: Schuhe nehmen Schlamm/Asche auf und tragen sie weiter
    if(player.carryMud>0.05){
      window.SHADED.trail.stamp(player.u,player.v+0.006,0.010,2,0.05*player.carryMud,235); // braune Lehmbahn
      player.carryMud=Math.max(0,player.carryMud-0.35);
    }
    if(player.carryAsh>0.05){
      window.SHADED.trail.stamp(player.u,player.v+0.006,0.011,3,0.10*player.carryAsh);    // schwarze Asche-Schleppspur
      player.carryAsh=Math.max(0,player.carryAsh-0.30);
    }
  }
  // #2 Aufnahme: nasser Boden -> Schlamm an den Schuhen; verkohlter Boden -> Asche
  if(CUR.wet>0.25 && (mat==='grass'||mat==='foliage'||mat==='path'))
    player.carryMud=Math.min(1,player.carryMud+dt*0.5*CUR.wet*(moving?1:0.2));
  const localChar=window.SHADED.trail.sample(player.u,player.v).a;
  if(localChar>0.18) player.carryAsh=Math.min(1,player.carryAsh+dt*0.7);
  // Nässe der Figur
  if(CUR.rain>0.1) player.wet=Math.min(1,player.wet+CUR.rain*dt*0.25);
  let nearFire=fires.some(f=>Math.hypot(f.u-player.u,f.v-player.v)<0.09);
  player.wet=Math.max(0,player.wet-dt*(nearFire?0.35:0.02));
}

// --- Lagerfeuer ---
const fires=[];
let fireToolActive=false;
function igniteFire(u,v,wild){
  if(!window.SHADED.isReady())return false;
  if(wild){ const m=window.SHADED.getMaterialTypeAt(u,v); if(m!=='wood'&&m!=='roof'&&m!=='foliage')return false; }
  if(fires.length>=8)return false;
  if(fires.some(f=>Math.hypot(f.u-u,f.v-v)<0.025))return false;
  fires.push({u,v,fuel:22+Math.random()*10,max:30,size:0.020+Math.random()*0.008,wild:!!wild,seed:Math.random()*7});
  return true;
}
function fireTick(dt){
  for(let i=fires.length-1;i>=0;i--){
    const f=fires[i];
    const douse=1 + CUR.rain*2.5 + Math.max(0,CUR.wet-0.4)*2.0;
    f.fuel-=dt*douse;
    // Brandspur + Schneeschmelze in den A-Kanal brennen
    window.SHADED.trail.stamp(f.u,f.v,f.size*(0.8+0.4*(1-f.fuel/f.max)),3,0.55*dt);
    // Rauch & Funken
    if(Math.random()<0.5) window.SHADED_ENGINE_INTERNAL.spawnFireSmoke?.(f.u,f.v);
    if(Math.random()<0.4) window.SHADED_ENGINE_INTERNAL.spawnFireSpark?.(f.u,f.v);
    // Ausbreitung: nur trocken, windgetrieben
    if(f.fuel>6 && CUR.wet<0.3 && CUR.rain<0.35 && Math.random()<dt*1.2){
      igniteFire(f.u+(Math.random()-0.35+CUR.wind*0.4)*0.05, f.v+(Math.random()-0.5)*0.04, true);
    }
    if(f.fuel<=0) fires.splice(i,1);
  }
}

function drawPlayer(W,H,S,dt){
  const time=window.SHADED_ENGINE_INTERNAL.time;
  const tempC=CUR.temperature*50-20;
  player.breathT+=dt*(1.7+player.exert*4.0);
  const br=Math.sin(player.breathT)*(1+player.exert*1.6);
  // Frost-Atem in Ausatemphase
  const cyc=player.breathT%6.283;
  if(tempC<5 && cyc>2.8 && cyc<4.6 && Math.random()<0.2)
    window.SHADED_ENGINE_INTERNAL.spawnBreath?.({u:player.u+0.004*(player.lookX||1),v:player.v-0.012,
      vu:0.003*(player.lookX||1)+CUR.wind*0.006,vv:-0.002,r:0.0015,life:1});
  const px=player.u*W, py=player.v*H;
  const shiver=(tempC<0&&!player.dashT)?Math.sin(time*46)*Math.min(3,-tempC*0.2)*S:0;
  ovx.save(); ovx.translate(px+shiver,py);
  ovx.fillStyle='rgba(0,0,0,0.35)';
  ovx.beginPath(); ovx.ellipse(0,4*S,10*S,4*S,0,0,6.283); ovx.fill();
  // Körper (atmet)
  let coat=player.wet>0.4?'#2c3e57':'#3b3b5c';
  ovx.fillStyle=coat;
  ovx.beginPath(); ovx.ellipse(0,-4*S,(8+br*0.5)*S,(9+br*0.7)*S,0,0,6.283); ovx.fill();
  if(player.wet>0.15){ ovx.globalAlpha=Math.min(0.5,player.wet*0.5);
    ovx.fillStyle='#48627f'; ovx.beginPath();
    ovx.ellipse(0,(-1+br*0.2)*S,(8+br*0.5)*S,(5)*S,0,0,6.283); ovx.fill(); ovx.globalAlpha=1; }
  // Kopf
  ovx.fillStyle='#f3c99a';
  ovx.beginPath(); ovx.arc(0,(-16+br*0.25)*S,6*S,0,6.283); ovx.fill();
  // Haar (ergraut mit age)
  const g=Math.round(30+player.age*180);
  ovx.fillStyle=`rgb(${g},${g},${Math.round(40+player.age*175)})`;
  ovx.beginPath(); ovx.arc(0,(-18.5+br*0.25)*S,6*S,Math.PI,6.283); ovx.fill();
  // Augen (Blickrichtung)
  ovx.fillStyle='#141414';
  const lx=player.lookX*1.6*S, ly=(-16+br*0.25)*S+player.lookY*1.0*S;
  ovx.beginPath(); ovx.arc(-2*S+lx,ly,1.3*S,0,6.283); ovx.arc(2*S+lx,ly,1.3*S,0,6.283); ovx.fill();
  ovx.restore();
}

// --- Eingaben (Runde 4) ---
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){
    keys[k]=true;
    if(!player.active&&window.SHADED.isReady()) spawnPlayer();
    if(player.active) e.preventDefault();
  }
  if(k===' '&&player.active&&!window.SHADED.dialogue.isPlaying()){ e.preventDefault(); dash(); }
  if(k==='f'&&player.active){ igniteFire(player.u+0.012*(player.lookX||1), player.v); }
});
window.addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });

// Fachliche Fähigkeit ist window.SHADED.fire.ignite (bereits real & exportiert) -- dieser Button
// schaltet nur den optionalen Klick-zum-Entzünden-Modus um, eine reine Präsentations-/Eingabe-
// Verdrahtung, kein zweiter Weg, Feuer zu entzünden.
const btnFire=document.getElementById('btn-fire');
if(btnFire) btnFire.onclick=()=>{
  fireToolActive=!fireToolActive;
  ov.classList.toggle('firetool',fireToolActive);
  btnFire.classList.toggle('active',fireToolActive);
  btnFire.textContent=fireToolActive?'🔥 Klicke in die Szene':'🔥 Feuer-Tool';
};
ov.addEventListener('click',e=>{
  if(!fireToolActive||!window.SHADED.isReady())return;
  const r=ov.getBoundingClientRect();       // CSS-Box -> UV (Prototyp-Bug Nr. 8!)
  const u=(e.clientX-r.left)/r.width, v=(e.clientY-r.top)/r.height;
  if(igniteFire(u,v)) setStatus('🔥 Feuer entzündet ('+(window.SHADED.getMaterialTypeAt(u,v)||'?')+').');
});

window.SHADED.player = {
  enable:spawnPlayer, pos:()=>({u:player.u,v:player.v,active:player.active,wet:player.wet}),
  setAge:(a)=>{player.age=Math.max(0,Math.min(1,a));},
  move:(du,dv)=>{                       // direkter Schritt inkl. Fußspuren (Tests/Agenten)
    if(!player.active) spawnPlayer();
    const steps=Math.max(1,Math.ceil(Math.hypot(du,dv)/0.012));
    for(let s2=0;s2<steps;s2++){
      player.u=Math.max(0.01,Math.min(0.99,player.u+du/steps));
      player.v=Math.max(0.01,Math.min(0.99,player.v+dv/steps));
      window.SHADED.trail.stamp(player.u,player.v+0.006,0.007,0,0.7);
      window.SHADED.trail.stamp(player.u,player.v+0.006,0.009,2,0.045,235);
    }
  }
};
window.SHADED.fire = { ignite:igniteFire, list:()=>fires.map(f=>({u:f.u,v:f.v,fuel:f.fuel})) };

window.SHADED_ENGINE_INTERNAL.player = player;
window.SHADED_ENGINE_INTERNAL.fires = fires;
window.SHADED_ENGINE_INTERNAL.playerFireTick = (dt)=>{ playerTick(dt); fireTick(dt); };
window.SHADED_ENGINE_INTERNAL.drawPlayer = (W,H,S,dt)=>{ if(player.active) drawPlayer(W,H,S,dt); };
