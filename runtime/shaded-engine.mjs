// SHADED Engine Module — single source of truth for shaders/materials (Invariante 7).
import {buildRelativePointCloud} from './spatial-point-cloud.mjs';

const ENGINE_STUB_IDS=["sliders","s-dayNight","v-dayNight","s-storm","v-storm","s-rain","v-rain","s-wet","v-wet","s-puddle","v-puddle","s-fog","v-fog","s-wind","v-wind","s-glow","v-glow","s-decay","v-decay","s-snow","v-snow","s-snowfall","v-snowfall","s-temperature","v-temperature","s-autumn","v-autumn","s-bloom","v-bloom","s-bleach","v-bleach","btn-create","btn-demo","btn-fire","btn-clear-world","btn-elements-clear","btn-add","btn-cinema","exit-cinema","btn-png","btn-rec","btn-json","btn-pointcloud","btn-showcase","btn-year","btn-timelapse","btn-drama","btn-play","cb-loop","btn-eco-cats","btn-eco-enemies","btn-eco-npcs","btn-eco-heroes","btn-eco-depth-test","f-scene","f-mat","f-depth","f-actor-sheet","f-actor-manifest","gl","ov","rec","showcase-card","showcase-title","showcase-copy","showcase-kicker","dialogue-box","dialogue-speaker","dialogue-text","dialogue-hint","drop-hint","status","stage","story-list","spatial-viewer","spatial-canvas","spatial-close","spatial-walk","spatial-map","spatial-pipeline","spatial-pipeline-buttons","spatial-stage-copy","spatial-laws","spatial-fit-status","spatial-performance","spatial-seasons","spatial-season-status","spatial-scene-season","spatial-scene-event","spatial-scene-duration","spatial-scene-add","spatial-scene-list","spatial-record-duration","spatial-record","spatial-paint","spatial-paint-material","spatial-paint-radius","spatial-paint-opacity","spatial-paint-color","spatial-pressure","spatial-undo","spatial-redo","spatial-voxel-export","spatial-voxel-import","spatial-boundary","spatial-thickness","spatial-texture-blend","spatial-seed","spatial-vegetation","spatial-canopy-flex","spatial-wind-direction","spatial-lightning-rate","spatial-urine-rate","spatial-blood-rate","spatial-rain-extinguish","spatial-time-scale","spatial-now-lightning","spatial-now-blood","spatial-now-urine","spatial-help","spatial-log"];
function createEngineDOM(){if(document.getElementById("gl")&&document.getElementById("ov"))return;
let c=document.getElementById("render-container");if(!c){c=document.createElement("div");
c.id="render-container";c.className="shaded-render-area";document.body.appendChild(c);}
const w=document.createElement("div");w.id="canvas-wrap";w.style.position="relative";
const g=document.createElement("canvas");g.id="gl";g.width=16;g.height=9;g.style.maxWidth="100%";
g.style.maxHeight="100%";g.style.display="block";g.style.borderRadius="6px";
g.style.boxShadow="0 12px 40px rgba(0,0,0,.85)";w.appendChild(g);
const o=document.createElement("canvas");o.id="ov";o.width=16;o.height=9;
o.style.position="absolute";o.style.inset="0";o.style.width="100%";o.style.height="100%";
o.style.pointerEvents="none";w.appendChild(o);c.innerHTML="";c.appendChild(w);}
createEngineDOM();
for(const id of ENGINE_STUB_IDS){if(!document.getElementById(id)){const s=document.createElement("div");
s.id=id;s.style.display="none";document.body.appendChild(s);}}
const HI={"f-scene":"image/*","f-mat":"image/*","f-depth":"image/*",
"f-actor-sheet":"image/*","f-actor-manifest":"application/json","spatial-voxel-import":"application/json"};
for(const[id,a]of Object.entries(HI)){let e=document.getElementById(id);if(!e){e=document.createElement("input");
e.type="file";e.id=id;e.accept=a;e.style.display="none";document.body.appendChild(e);}}


'use strict';
/* ==================================================================   SHADED – Runde 1: Wasser, Sturm & Atmosphäre.
   Architektur: 1 Szene + 4 abgeleitete Texturen -> 1 Fragment-Shader,
   gesteuert von 9 High-Level-Parametern. CPU- und GPU-Materialwissen
   kommen aus DERSELBEN Analyse (classGrid) – nie zweigleisig klassifizieren.
   Reserviert für Folge-Runden: Textur-Unit 5 (Trail), u_decay, SHADED-API.
   ========================================================================= */

// --- Kanonische Material-Palette (Achtung: #F972E9 war ein Zahlendreher von #F97316!) ---
const CLASSES = ['grass','foliage','roof','path','wood','window','water','rock'];
const PALETTE = { // Klassenname -> akzeptierte Map-Farben (erste = kanonisch)
  grass:   ['#16A34A','#139942','#000000'],
  foliage: ['#AA0EB7','#A51AA7'],
  roof:    ['#F97316','#F47210','#F972E9'],
  path:    ['#DC2626'],
  wood:    ['#854D0E'],
  window:  ['#0F766E'],
  water:   ['#06B6D4'],
  rock:    ['#475569']
};
const G=0,F=1,R=2,P=3,W=4,N=5,A=6,K=7; // Klassen-Indizes (N=window, A=water)

// --- High-Level-Parameter (alles 0..1; temperature: 0=−20 °C, 0.5=0 °C, 1=+30 °C) ---
const PARAMS = { dayNight:0, storm:0, rain:0, wet:0, puddle:0.02, fog:0.05, wind:0.3, glow:0.12, decay:0,
                 snow:0, snowfall:0, temperature:0.6, autumn:0, bloom:0, bleach:0 };
const DEFAULTS = {...PARAMS};
const PARAM_META = [
  ['dayNight','Tag ↔ Nacht'], ['storm','Sturm / Bewölkung'], ['rain','Regen'],
  ['wet','Nässe'], ['puddle','Pfützenstand'], ['fog','Nebel'],
  ['wind','Wind'], ['glow','Fensterlicht'], ['decay','Verfall'],
  ['snow','Schneedecke'], ['snowfall','Schneefall'], ['temperature','Temperatur (−20…+30 °C)'],
  ['autumn','Herbst'], ['bloom','Frühlingsblüte'], ['bleach','Sonnenbleiche']
];
// Akte definieren nur relevante Keys; fehlende werden mit DEFAULTS aufgefüllt.
const ACTS = {
  tag:        {label:'Goldener Tag',      p:{dayNight:0,   storm:0.03, rain:0,    wet:0,    puddle:0.02, fog:0.05, wind:0.30, glow:0.10, decay:0,    temperature:0.70}},
  aufzug:     {label:'Sturm zieht auf',   p:{dayNight:0.45,storm:0.80, rain:0.45, wet:0.45, puddle:0.30, fog:0.25, wind:0.85, glow:0.55, decay:0,    temperature:0.56}},
  sturmnacht: {label:'Sturmnacht',        p:{dayNight:1,   storm:1,    rain:1,    wet:1,    puddle:0.92, fog:0.40, wind:1,    glow:1,    decay:0,    temperature:0.52}},
  morgen:     {label:'Morgengrauen',      p:{dayNight:0.55,storm:0.35, rain:0.12, wet:1,    puddle:0.85, fog:0.50, wind:0.40, glow:0.60, decay:0,    temperature:0.52}},
  danach:     {label:'Der Tag danach',    p:{dayNight:0.04,storm:0.08, rain:0,    wet:0.75, puddle:0.55, fog:0.02, wind:0.35, glow:0.12, decay:0,    temperature:0.62}},
  verfall:    {label:'Jahre später',      p:{dayNight:0.10,storm:0.15, rain:0,    wet:0.15, puddle:0.10, fog:0.20, wind:0.50, glow:0,    decay:1,    temperature:0.55}},
  fruehling:  {label:'🌸 Frühlingsmorgen', p:{dayNight:0.06,storm:0.05, rain:0.08, wet:0.20, puddle:0.10, fog:0.10, wind:0.40, glow:0.10, decay:0.15, temperature:0.62, bloom:0.90}},
  sommer:     {label:'☀️ Vollsommer',     p:{dayNight:0.05,storm:0.02, rain:0.02, wet:0.05, puddle:0.05, fog:0.05, wind:0.25, glow:0.15, decay:0.25, temperature:0.85, bloom:0.50}},
  herbst:     {label:'🍁 Goldener Herbst', p:{dayNight:0.10,storm:0.25, rain:0.15, wet:0.35, puddle:0.20, fog:0.18, wind:0.70, glow:0.30, decay:0.40, temperature:0.56, autumn:0.92}},
  schnee:     {label:'❄️ Erster Schnee',  p:{dayNight:0.18,storm:0.35, rain:0,    wet:0.15, puddle:0.28, fog:0.25, wind:0.30, glow:0.50, decay:0.50, temperature:0.24, snow:0.85, snowfall:0.70}},
  blitz:      {label:'⚡ Blitz schlägt ein', p:{dayNight:1,   storm:1,    rain:1,    wet:1,    puddle:0.92, fog:0.30, wind:1,    glow:1,    decay:0.50, temperature:0.50, flash:1}},
  gefroren:   {label:'🧊 Wasser gefriert', p:{dayNight:0.65,storm:0.50, rain:0.1,  wet:0.95, puddle:0.80, fog:0.35, wind:0.55, glow:0.70, decay:0.55, temperature:0.10, snow:0.20, snowfall:0.15}},
  schnee_dicke:{label:'⛄ Dichter Schnee', p:{dayNight:0.70,storm:0.90, rain:0,    wet:0.75, puddle:0.65, fog:0.40, wind:1,    glow:0.65, decay:0.60, temperature:-0.10, snow:0.92, snowfall:0.85}}
};
Object.values(ACTS).forEach(a=>a.p={...DEFAULTS,...a.p});

// =========================== WebGL ====================
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2',{preserveDrawingBuffer:true});
if(!gl){
  // Bewusst KEIN zweiter WebGL-1-Pfad: zwei Shader-Quellen waeren zwei Wahrheiten.
  document.body.innerHTML='<div style="padding:28px;font:14px/1.6 system-ui;color:#e6e6f0;'
    +'background:#14141c;height:100vh"><b>SHADED braucht WebGL 2.</b><br>'
    +'Dieser Browser stellt keinen WebGL-2-Kontext bereit.</div>';
  throw new Error('WebGL2 nicht verfuegbar');
}
const VS = `#version 300 es
in vec2 a;out vec2 v_uv;void main(){v_uv=a*0.5+0.5;v_uv.y=1.0-v_uv.y;gl_Position=vec4(a,0.,1.);}`;
const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_scene,u_maskA,u_maskB,u_phys,u_emis;
uniform vec2  u_px;
uniform float u_time,u_aspect;
uniform float u_dayNight,u_storm,u_rain,u_wet,u_puddle,u_fog,u_wind,u_glow,u_decay,u_flash;
uniform float u_snow,u_snowfall,u_temperature,u_autumn,u_bloom,u_bleach;
uniform vec3 u_grassAvg;    // mittlere Grasfarbe der Szene (aus analyze())
uniform float u_mossBoost;  // Feuchte-Patina: akkumuliert bei langer Nässe (CPU)
uniform sampler2D u_trail;  // Runde 4: r=Störung/Delle g=Impuls b=Trampelpfad a=Hitze/Brand
uniform vec4 u_fires[8];    // Lagerfeuer: xy=uv z=Intensität w=Radius
uniform float u_fireCount;
uniform sampler2D u_depth;  // 2.5D-Tiefenkarte (Weiß = nah, Schwarz = fern); ohne Upload 1x1 schwarz = flach
uniform vec2 u_parallax;    // Maus-/Kamera-Versatz (0,0 ohne Interaktion -> deterministische Frames)
uniform sampler2D u_zone;   // K1: Gebäudezonen (R; 1 = Fachwerk-Gebäude) – maskiert Bodeneffekte
// Materialschicht (docs/neuronale-materialien-svbrdf-pbr.md), Unit 9:
// R = Shading (eingebackene Beleuchtung, 0.5 = neutral), G = Konfidenz der Zerlegung,
// B/A frei für kommende Kanäle (Rauheit, AO). Erst durch WebGL 2 gibt es diesen Slot.
uniform sampler2D u_material;
// 0 = beobachtete Farbe (Fallback identity-albedo, exakt das Verhalten ohne
// Materialschicht), 1 = Licht und Material getrennt.
uniform float u_intrinsic;
// Aufsummierte Phasen (CPU): Intensitäten dürfen NIE im Phasenterm t*f(wind)
// stehen – sinkt der Wind, liefe die Phase rückwärts (Regen-"Rewind").
uniform float u_rainPhase;  // ∫(1 + 0.4*wind) dt
uniform float u_windDrift;  // ∫wind dt
// Phase C: Weltgesetze-Erweiterung (Runde 5+)
uniform float u_dryPhase;   // ∫max(0, 0.8 - u_wet) dt (Trocknung: #42)
uniform float u_heatWarp;   // u_temperature * u_fireCount (Hitzeverzug: #41)
uniform float u_rustAccum;  // akkumuliert bei Nässe + Zeit (Rost: #9)
uniform float u_smokeAmount;// u_fog * (u_storm + u_fireCount*0.5) (Rauchschichtung: #43)
uniform float u_breathAmount; // Atemwolken (Kälte/Angst) (#44)
uniform float u_pressureDim;  // Boden unter Gewicht dunkelt (#4)
uniform float u_pollutionGlow;// Lichtverschmutzung (#26)
uniform float u_moonBright;   // Mondlicht-Fase (#38)
uniform float u_shelfShadow;  // Biom-Kanten-Schatten (#34)
uniform float u_vegFade;      // Pflanzen-Reaktion (#15)
uniform float u_moodTint;     // NPC-Stimmung (#24)
uniform float u_worldTired;   // Weltmüdigkeit (#50)
uniform float u_forbiddenCold;// Besitz-Grenzen (#25)
uniform float u_runeGlow;     // Oberflächen-Runen (#32)
uniform float u_shadowAge;    // Schatten verlangsamen Verfall (#11)
uniform float u_smellDrift;   // Geruchswolken von Verfall/Feuer (#6)
uniform float u_touchWear;    // Berührungsspuren: abgegriffene Stellen (#45)
uniform float u_repairMark;   // Sichtbare Reparaturen mit neuer Farbe (#30)
uniform float u_blessCurse;   // Segen/Fluch: Material-Verhalten konditioniert (#49)
uniform float u_bloodStain;   // Übertragene Blut-Schicht auf Schuhen (#2: Blut-Transfer)
uniform float u_mudStain;     // Übertragene Schlamm-Schicht auf Schuhen (#2: Schlamm-Transfer)
// Runde 8: Wally-Monokel (Inspektions-Linsen)
uniform float u_lens;         // 0=aus, 1=Schmutz/Abnutzung, 2=Belastung, 3=Klang, 4=Materialtreue, 5=Kanten (#7)
uniform sampler2D u_sound;    // Klang als sichtbare Wellen (#7): r=Wellenfeld, CPU-Stempel+Decay wie Trail
// Elemente-Spielplatz: transiente Intensitäten aus UI/API. Diese Werte steuern
// Materialreaktionen im Fragment-Pass, nicht nur Canvas-Partikel.
uniform float u_elementWetBurst,u_elementHeatBurst,u_elementPressureBurst,u_elementAshBurst,u_elementHailBurst,u_elementLavaBurst;

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0,a=0.5;
  for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=0.5; }
  return v;
}
float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }

// Tag/Nacht/Sturm-Grading – wird auch auf Reflexionen angewendet
vec3 grade(vec3 c){
  c *= 1.0 - u_storm*(1.0-u_dayNight)*0.20;                    // Sturmtag: fahl
  c = mix(c, vec3(lum(c)), u_storm*0.18);                      // entsättigt
  vec3 nc = pow(max(c,0.0), vec3(1.28)) * vec3(0.34,0.40,0.62) * 1.35; // Mondblau
  return mix(c, nc, u_dayNight);
}

void main(){
  vec2 uv = v_uv;
  float t = u_time;
  float night = u_dayNight;

  // --- 2.5D-Parallaxe: Nahes (weiß in u_depth) verschiebt sich stärker. ---
  // Der Versatz passiert VOR allen Lookups, damit Szene, Masken, Physik und
  // Trail dieselbe verschobene Welt sehen (eine Material-Wahrheit!).
  float depthVal = texture(u_depth, uv).r;
  uv += u_parallax * depthVal;
  uv = clamp(uv, vec2(0.001), vec2(0.999));

  vec4 mA = texture(u_maskA,uv);   // r=grass g=foliage b=roof a=path
  vec4 mB = texture(u_maskB,uv);   // r=wood  g=window  b=water a=rock
  float mGrass=mA.r, mFol=mA.g, mRoof=mA.b, mPath=mA.a;
  float mWood=mB.r,  mWin=mB.g,  mWater=mB.b, mRock=mB.a;
  vec4 phys = texture(u_phys,uv);  // r=Pfützentiefe g=Flusswinkel b=Bleed a=Pfad-Distanz
  vec4 trail = texture(u_trail,uv);// r=Delle g=Impuls b=Trampelpfad a=Hitze/Brand
  float zone = texture(u_zone,uv).r;   // K1: 1 = Gebäude -> Bodeneffekte hier verboten
  float noZone = 1.0 - zone;
  // Eingebackene Beleuchtung des Quellbilds: <1 Schatten, >1 Licht, 1 neutral.
  // Bei u_intrinsic == 0 ist shade EXAKT 1.0 -> Albedo == beobachtete Farbe.
  float shade = mix(1.0, max(texture(u_material,uv).r*2.0, 0.18), u_intrinsic);
  float veg = clamp(mGrass+mFol,0.0,1.0);
  float ground = clamp(mPath+mGrass+mRock,0.0,1.0);

  // --- Vegetation im Wind: Kronen wiegen sich natürlich (kohärent, nicht als Warp) ---
  // gust: langsam wanderndes Böenfeld; u_windDrift (∫wind dt) gibt Trägheit/Verzögerung
  float gust = 0.45 + 0.55*vnoise(vec2(u_windDrift*0.12 + t*0.10, uv.y*1.5 + u_windDrift*0.04));
  // jede Krone leicht phasenverschoben, damit nicht alle Bäume synchron zittern
  float treePhase = vnoise(uv*vec2(3.0*u_aspect,3.0))*6.2831;
  // primäre, kohärente Schwingung: die ganze Krone bewegt sich als Körper
  float wphi = t*(0.7 + 1.3*u_wind) + u_windDrift*0.4;
  float primary = sin(wphi + treePhase)*0.75 + sin(wphi*0.53 - treePhase*0.8)*0.25;
  // Blatt-Flattern: hochfrequent & klein -> das "lebendig" Gefühl
  float flutter = sin(t*6.5 + uv.x*55.0 + uv.y*40.0 + treePhase*3.0);
  // Ankerung: Bewegung wächst zur Kronenoberseite. folBelow = Laub direkt unterhalb;
  // je mehr Laub darunter, desto weiter oben im Kronenkörper -> freier schwingend.
  // Am Kronenfuß (kein Laub darunter) bleibt es ruhig -> "stabiler unten".
  float folBelow = texture(u_maskA, clamp(uv - vec2(0.0,0.018),0.001,0.999)).g;
  float crownBody = mFol * smoothstep(0.04,0.55, folBelow);
  float grassBelow = texture(u_maskA, clamp(uv - vec2(0.0,0.012),0.001,0.999)).r;
  float grassBody = mGrass * smoothstep(0.04,0.5, grassBelow);
  // Wind-Richtung: überwiegend horizontal (u_wind ist Betrag; Downwind = +x, leichte Hebung)
  vec2 windDir = normalize(vec2(1.0, 0.14));
  float windAmt = u_wind * gust;
  // stetige Windneigung + Schwingung drumherum -> in jedem Frame sichtbar gekippt
  float meanLean = windAmt * 0.010;
  float crownAmp = 0.014*windAmt;
  vec2 crownSway = windDir * (meanLean + primary*crownAmp) * crownBody
                 + vec2(flutter*0.6, flutter*0.25) * (0.0003+0.004*windAmt) * crownBody;
  // Gras: sanftes, aufrechtes Wippen, am Boden verankert
  float grassAmp = 0.005*windAmt;
  vec2 grassSway = vec2(sin(wphi*1.3 + treePhase), 0.2*sin(wphi*1.7)) * grassAmp * grassBody;
  vec2 sway = crownSway + grassSway;
  // Impuls (Fußtritt/Feuer) schüttelt lokal nach wie vor
  sway += vec2(sin(t*22.0+uv.x*40.0), cos(t*19.0+uv.y*37.0)) * trail.g * 0.012 * veg;
  vec2 suv = uv + sway;
  // Spätverfall: Dachlinien hängen sichtbar durch (vertikaler Domain-Warp)
  float lateDecay = smoothstep(0.75,1.0,u_decay);
  suv.y += sin(uv.x*26.0*u_aspect + 1.7) * 0.0035 * lateDecay * mRoof;
  vec3 base = texture(u_scene,suv).rgb;
  vec3 col = base;

  float tempC = u_temperature*50.0 - 20.0;          // 0..1 -> −20..+30 °C
  float icy = 1.0 - smoothstep(-1.5, 1.0, tempC);   // gefroren um 0 °C

  // --- Shader-Expertise-Pass: Bump/Normal, AO, Multi-Step-Shading ----------
  // Keine zweite Asset-Wahrheit: Normal/Bump werden aus Szene + Tiefenkarte
  // abgeleitet. Gibt es eine echte Depth-Map, trägt sie Relief; sonst nimmt die
  // Luminanz das Mikrorelief. Das bleibt Ein-Bild-kompatibel.
  float hC = mix(lum(base), depthVal, step(0.001,depthVal));
  float hX = mix(lum(texture(u_scene,clamp(suv+vec2(u_px.x,0.0),0.001,0.999)).rgb),
                 texture(u_depth,clamp(uv+vec2(u_px.x,0.0),0.001,0.999)).r, step(0.001,depthVal));
  float hY = mix(lum(texture(u_scene,clamp(suv+vec2(0.0,u_px.y),0.001,0.999)).rgb),
                 texture(u_depth,clamp(uv+vec2(0.0,u_px.y),0.001,0.999)).r, step(0.001,depthVal));
  float bumpStrength = 0.65 + u_wet*0.35 + u_snow*0.22;
  vec3 nrm = normalize(vec3((hC-hX)*bumpStrength*u_aspect, (hC-hY)*bumpStrength, 0.035));
  vec3 lightDir = normalize(vec3(-0.42 + 0.28*u_dayNight, -0.58, 0.70));
  float ndl = clamp(dot(nrm,lightDir)*0.5+0.5,0.0,1.0);
  float stepShade = floor(ndl*3.0)/3.0; // bewusst mehrstufig: lesbar statt grauer Brei
  float aoDepth = max(0.0, (texture(u_depth,clamp(uv+vec2(u_px.x*3.0,u_px.y*2.0),0.001,0.999)).r - depthVal));
  float aoMask = clamp(mRoof+mWood+mRock+mPath+zone,0.0,1.0);
  float ambientOcc = clamp(1.0 - (0.08 + aoDepth*1.8 + (1.0-ndl)*0.10)*aoMask, 0.62, 1.0);
  col *= mix(1.0, ambientOcc*(0.86+0.22*stepShade), 0.42);
  float rim = pow(1.0-clamp(dot(nrm,vec3(0.0,0.0,1.0)),0.0,1.0),2.0);
  col += rim*vec3(0.08,0.11,0.16)*(0.20+0.45*u_wet+0.30*u_fog);

  // --- Herbst: Kronen & Gras färben sich pro Zelle golden bis rostrot ---
  if(u_autumn>0.003){
    float cellN = vnoise(uv*vec2(14.0*u_aspect,14.0));
    float lumB = lum(base);
    // Foliage: Bright gold to deep red-brown
    vec3 acol = mix(vec3(0.95,0.65,0.10), vec3(0.80,0.25,0.08), cellN) * (0.45+1.1*lumB);
    col = mix(col, acol, mFol*u_autumn*0.92);
    // Grass: Rich golden-brown, more saturated
    vec3 gcol = vec3(0.72,0.58,0.18)*(0.5+1.2*lumB);
    col = mix(col, gcol, mGrass*u_autumn*0.68);
    // gefallenes Laub sammelt sich an Pfadrändern (Bleed-Halo + flache Pfadzonen)
    float litterZone = mGrass*phys.b + mPath*(1.0-smoothstep(0.15,0.55,phys.r));
    float litter = step(0.62, vnoise(uv*vec2(170.0*u_aspect,170.0))) * litterZone;
    col = mix(col, mix(vec3(0.80,0.45,0.10),vec3(0.55,0.22,0.06),vnoise(uv*vec2(80.0*u_aspect,80.0)))*(0.4+0.9*lumB),
              litter*u_autumn*0.8);
  }

  // --- Frühling: Blütenbäume schäumen auf, Wiesenblumen wachsen in Clustern ---
  if(u_bloom>0.003){
    float lumB2 = lum(base);
    // 1) Baumkronen: üppige Blütenwolken (rosa/weiß) mit erkennbaren Blütenklumpen
    float clumps = smoothstep(0.46,0.62, fbm(uv*vec2(20.0*u_aspect,20.0)+5.3));
    float crownHue = vnoise(uv*vec2(7.0*u_aspect,7.0));
    vec3 crownCol = mix(vec3(0.97,0.55,0.78), vec3(0.98,0.90,0.85), smoothstep(0.55,0.85,crownHue));
    // feine Blüten-Tupfer auf der Krone (deutliche, aber weiche Punkte -> kein Rauschen)
    vec2 cfc = uv*vec2(64.0*u_aspect,64.0);
    vec2 cfid = floor(cfc), cffp = fract(cfc)-0.5;
    float cfr = hash(cfid);
    vec2 cOff = (vec2(hash(cfid+1.3),hash(cfid+2.6))-0.5)*0.4;
    float cdist = length(cffp-cOff);
    float blossom = smoothstep(0.20,0.06, cdist) * step(0.55, cfr);
    crownCol = mix(crownCol, vec3(1.0,0.96,0.94), blossom*0.5);
    // Nur echte Kronen blühen: Pixel muss grünlich (Laub) oder rosa (Blütenbaum)
    // sein – dunkle Blauschatten auf Dächern/Wänden können nie blühen.
    float greenish = smoothstep(0.0,0.12, base.g - max(base.r*0.75, base.b*0.95));
    float pinkish  = smoothstep(0.04,0.16, base.r - base.g) * step(base.g, base.b+0.15);
    float bloomable = clamp(greenish+pinkish, 0.0, 1.0);
    float treeSel = smoothstep(0.42,0.60, vnoise(uv*vec2(3.0*u_aspect,3.0)+7.7)); // nicht jeder Baum
    float crownGate = smoothstep(0.62,0.95,mFol) * bloomable * treeSel;  // hart: kein Schmieren über Ränder
    col = mix(col, crownCol, crownGate*u_bloom*clumps*0.92);

    // 2) Wiesenblumen: erkennbare Blüten in Clustern, NUR auf Gras
    float grassGate = smoothstep(0.5,0.8,mGrass);
    // Cluster-Feld: Blumen stehen in Gruppen, dazwischen ruhige Wiese
    float clusterF = fbm(uv*vec2(8.0*u_aspect,8.0)+13.7);
    float inCluster = smoothstep(0.44,0.64, clusterF);
    float flowerProb = inCluster * (0.40 + 0.5*u_bloom);
    // grobes Blumen-Gitter -> deutlich größere, lesbare Blüten (kein Rauschen)
    vec2 fc = uv*vec2(19.0*u_aspect,19.0) + vec2(hash(vec2(floor(uv.x*3.1),floor(uv.y*2.7)))*0.5);
    vec2 fid = floor(fc), ffp = fract(fc)-0.5;
    float fr = hash(fid);
    float on = step(1.0 - flowerProb, fr);  // Blüte nur in Clustern
    if(on*grassGate>0.01){
      vec2 d = ffp;
      float rad = length(d);
      float size = 0.32*(0.7+0.6*hash(fid+7.9));   // Blütendurchmesser
      // Blütenblätter als überlagernde Kreise -> echte, getrennte Petalen
      const int NP = 5;
      float petalMask = 0.0;
      float petalDist = size*0.52;
      float petalRad  = size*0.40;
      float rot = fr*6.2831;
      for(int i=0;i<NP;i++){
        float a = rot + float(i)*(6.2831/float(NP));
        vec2 pc = vec2(cos(a),sin(a))*petalDist;
        petalMask = max(petalMask, smoothstep(petalRad+0.02, petalRad-0.02, length(d-pc)));
      }
      float center = smoothstep(size*0.24+0.02, size*0.24-0.02, rad);  // Blütenmitte
      // Farbvielfalt pro Blüte: weiß / rosa / hellblau / gelb
      float pick = hash(fid+4.4);
      vec3 fCol = pick<0.30 ? vec3(0.99,0.97,0.92)
                : pick<0.58 ? vec3(0.97,0.66,0.82)
                : pick<0.80 ? vec3(0.60,0.74,0.97)
                            : vec3(0.99,0.86,0.45);
      vec3 midCol = vec3(1.0,0.78,0.18);  // sattes gelbes Körbchen
      float fm = petalMask*on*grassGate;
      col = mix(col, fCol*(0.82+0.5*lumB2), fm*0.97);
      col = mix(col, midCol, center*on*grassGate*u_bloom*0.9);
    }
  }

  // --- Nässe: poröse Materialien dunkeln stark ab, Farben sättigen ---
  // Ein Wasserfilm senkt die REFLEKTANZ der Oberfläche. Er senkt nicht das Licht,
  // das an dieser Stelle ohnehin schon fehlt – deshalb läuft der Term auf dem
  // Albedo, nicht auf der beobachteten Farbe (sonst wird jeder Schatten doppelt
  // beschattet). Bei u_intrinsic == 0 ist shade == 1.0 und wetGain == 1.0; dann
  // ist das hier algebraisch exakt das frühere col *= 1.0 - porous*u_wet.
  float porous = mRoof*0.50 + mWood*0.50 + mPath*0.44 + mRock*0.42 + mGrass*0.28 + mFol*0.22 + mWin*0.10;
  vec3 alb = col / shade;
  // Gedämpft wird, was an Reflektanz da ist: ein dunkles Material wird nass kaum
  // dunkler, ein heller Putz dramatisch. Ohne Zerlegung bleibt der Faktor 1.0.
  float wetGain = mix(1.0, smoothstep(0.02, 0.45, lum(alb)), u_intrinsic);
  alb *= 1.0 - porous*u_wet*wetGain;
  alb = mix(vec3(lum(alb)), alb, 1.0 + 0.35*u_wet);
  col = alb * shade;

  // --- Trampelpfade (Runde 4): wiederholtes Begehen macht Gras zu Matsch ---
  float mud = smoothstep(0.10,0.72, trail.b) * mGrass * noZone;
  if(mud>0.003){
    vec3 mudCol = mix(u_grassAvg*0.55, vec3(0.32,0.23,0.14), 0.7)*(0.45+0.85*lum(base));
    col = mix(col, mudCol, mud*0.85);
  }

  // --- Elemente: kleckernde Materialreaktionen im Shader ------------------
  // Dellen (trail.r), Klang-/Druckfeld (u_sound) und Brandwärme (trail.a)
  // werden hier direkt in das Material gemischt. Dadurch sind die Element-
  // Buttons keine Overlay-Spielerei: sie verändern Glanz, Albedo, Wasserfilm,
  // Hitzeemission und Mikrospritzer im selben Fragment-Pass wie die Welt.
  float soundWave = texture(u_sound,uv).r;
  float splatCells = hash(floor(uv*vec2(180.0*u_aspect,180.0)) + vec2(floor(t*5.0)));
  float microSplat = smoothstep(0.965,1.0,splatCells) * ground * noZone;
  float wetImpulse = clamp(u_elementWetBurst + u_rain*0.35 + trail.r*0.75,0.0,1.0);
  col = mix(col, col*0.72 + vec3(0.34,0.42,0.52), microSplat*wetImpulse*(0.30+0.70*u_wet));
  float pressureRing = smoothstep(0.05,0.55,soundWave) * (0.35+0.65*ground) * u_elementPressureBurst;
  col += pressureRing * vec3(0.18,0.42,0.72) * (0.20 + 0.55*u_wet);
  // Hagel ist hart: helle Kontaktpunkte + kleine "gequetschte" dunkle Krater
  // auf nassen/kalten Bodenflächen, gesteuert durch u_elementHailBurst.
  float hailCell = hash(floor(uv*vec2(95.0*u_aspect,95.0)) + vec2(floor(t*14.0)));
  float hailHit = smoothstep(0.985,1.0,hailCell) * ground * u_elementHailBurst;
  col += hailHit * vec3(0.75,0.86,1.0) * (0.40 + 0.35*u_wet);
  col = mix(col, col*0.62, hailHit*0.22);

  // === Weltgesetz #2 (vertieft): oberflächenspezifische, lesbare Spuren ===
  // R = frische Störung/Delle (transient), B = permanenter Trampelpfad.
  // Das Erscheinungsbild hängt vom Untergrund (Masken), nie von der Farbe.
  float fpFresh = trail.r;
  float fpPerm  = trail.b;
  // Zeitmesser / Alter: frisch & nass = dunkler, glänzender Kern;
  // trocken/alt = matter, mit hellerem Rand (verknüpft mit #42 Trocknung).
  float fpDry = clamp(u_dryPhase*0.4 + (1.0 - u_wet)*0.6, 0.0, 1.0);
  float fpN = fbm(uv*vec2(150.0*u_aspect,150.0));
  float fpCore = smoothstep(0.12,0.70, fpFresh) * (0.65+0.35*fpN);
  float fpRim  = smoothstep(0.25,0.95, fpFresh) * (1.0-smoothstep(0.0,1.0,fpN)) * fpDry;
  // Sand/lose Erde (Pfad, trocken): weiche Vertiefung + verwehter heller Rand
  float loose = mPath*(1.0-mWater);
  col = mix(col, col*0.80, fpCore*loose);
  col = mix(col, col*1.10+0.03, fpRim*loose*clamp(u_wind+0.3,0.0,1.0)*0.5);
  // Moos / Grün (Gras, Foliage): dunkle Druckstellen
  float mossy = clamp(mGrass+mFol,0.0,1.0);
  col = mix(col, col*0.58, fpCore*mossy);
  col = mix(col, col*0.68, fpRim*mossy*0.5);
  // Fels: helle Kratzspur (Korn kurz hervorgehoben)
  col = mix(col, col*1.12, fpCore*mRock*0.5);
  // Holz: dunkle, verdichtete Spur
  col = mix(col, col*0.66, fpCore*mWood);
  // Permanenter Trampelpfad auf festem Boden: braune Lehmbahn (Schlamm-Übertragung)
  float track = smoothstep(0.18,0.90, fpPerm) * (mPath+mRock+mWood+mFol*0.4) * noZone;
  vec3 trackCol = vec3(0.34,0.25,0.15)*(0.55+0.70*lum(base));
  col = mix(col, trackCol, track*0.70);
  // Frische, nasse Spur glänzt dunkel (Zeitmesser: noch feucht)
  col = mix(col, col*0.86, fpCore*(mPath+mRock+mGrass)*u_wet*0.5);

  // --- Specular-Sheen auf nassen, obenliegenden Kanten ---
  float lC = lum(texture(u_scene,uv).rgb);
  float lU = lum(texture(u_scene,uv-vec2(0.0,u_px.y*3.0)).rgb);
  float sheen = clamp((lC-lU)*6.0,0.0,1.0) * u_wet;
  col += sheen * vec3(0.85,0.92,1.0) * (mRoof+mPath+mRock+mWood) * (0.28 - 0.16*night);

  // --- Material Fatigue & Verfall (Runde 3): Materialien altern in realistischer
  //     Reihenfolge über versetzte Verfallskurven; Klima entscheidet Moos vs. Bleiche ---
  if(u_decay>0.003 || u_mossBoost>0.003){
    float lumB3 = lum(base);
    float dWood = smoothstep(0.05,0.55,u_decay);   // Holz zuerst
    float dRoof = smoothstep(0.20,0.75,u_decay);
    float dPath = smoothstep(0.35,0.90,u_decay);
    float dRock = smoothstep(0.60,1.00,u_decay);   // Fels zuletzt
    float mossy = clamp(1.0 - u_bleach*0.85, 0.15, 1.0);  // trockenes Klima bleicht statt bemoost

    // Holz: vergraut silbrig, gerichtete Splitter-Striche
    vec3 silverWood = vec3(0.70,0.72,0.76)*(0.35+0.9*lumB3);
    col = mix(col, silverWood, mWood*dWood*0.7);
    vec2 wCo = uv*vec2(u_aspect,1.0);
    float splinter = step(0.82, vnoise(vec2(dot(wCo,vec2(0.97,0.26))*640.0, dot(wCo,vec2(-0.26,0.97))*40.0)));
    col = mix(col, col*0.55, splinter*mWood*dWood*0.5);

    // Dach: Moos (Feuchte-Patina u_mossBoost beschleunigt) + fehlende Ziegel-Zellen
    float mossAmt = clamp(dRoof + u_mossBoost*0.6, 0.0, 1.0)*mossy;
    float mossN = fbm(uv*vec2(26.0*u_aspect,26.0));
    vec3 mossCol = vec3(0.22,0.34,0.12)*(0.55+0.8*lumB3);
    col = mix(col, mossCol, (mRoof + mWood*0.4) * mossAmt * smoothstep(0.42,0.72,mossN) * 0.85);
    vec2 tuvC = uv*vec2(46.0*u_aspect,46.0);
    vec2 tid = floor(tuvC), tf = fract(tuvC)-0.5;
    float tileGone = step(0.965 - lateDecay*0.06, hash(tid));
    float holeR = 0.24 + 0.20*hash(tid+3.3);
    float hole = smoothstep(holeR+0.10, holeR-0.06, length(tf-(vec2(hash(tid+1.1),hash(tid+2.2))-0.5)*0.22));
    vec3 holeCol = vec3(0.10,0.08,0.06)*(0.7+0.5*vnoise(uv*vec2(220.0*u_aspect,220.0)));
    col = mix(col, holeCol, mRoof*tileGone*hole*smoothstep(0.5,0.9,dRoof)*0.8);

    // Pfad: Überwucherung von den Rändern (Distanzfront) im Graston DIESER Szene
    float creep = smoothstep(phys.a, phys.a+0.18, dPath*0.95);
    vec3 growCol = u_grassAvg*(0.55+0.75*lumB3);
    col = mix(col, growCol, mPath*creep*noZone*smoothstep(0.25,0.6,fbm(uv*vec2(40.0*u_aspect,40.0)))*0.92);

    // Ranken/Moosschleier: vertikale Strähnen auf Mauerwerk & Holz (spät)
    float vine = smoothstep(0.60,0.82, fbm(vec2(uv.x*70.0*u_aspect, uv.y*10.0)));
    col = mix(col, mossCol*1.15, vine*lateDecay*mossy*(mPath+mWood+mRock)*0.4);

    // Fels: Flechten
    float lichen = step(0.7, vnoise(uv*vec2(120.0*u_aspect,120.0)));
    col = mix(col, vec3(0.55,0.58,0.42)*(0.5+0.8*lumB3), mRock*dRock*lichen*0.5);

    // Spätphase: Risse entlang der Bildkanten (Kantenstärke × ridged Noise)
    if(lateDecay>0.01){
      float eH = lum(texture(u_scene, uv+vec2(u_px.x*2.0,0.0)).rgb) - lum(texture(u_scene, uv-vec2(u_px.x*2.0,0.0)).rgb);
      float eV = lum(texture(u_scene, uv+vec2(0.0,u_px.y*2.0)).rgb) - lum(texture(u_scene, uv-vec2(0.0,u_px.y*2.0)).rgb);
      float edgeS = clamp((abs(eH)+abs(eV))*3.0, 0.0, 1.0);
      float ridged = 1.0-abs(2.0*fbm(uv*vec2(90.0*u_aspect,90.0))-1.0);
      float crack = step(0.86, ridged*(0.5+0.5*edgeS));
      col = mix(col, vec3(0.05), crack*lateDecay*(mRoof+mWood+mPath+mRock)*0.6);
    }

    col = mix(col, vec3(lum(col)), u_decay*0.22);
  }

  // === Phase C: World Laws Extension (Runde 5+) ===

  // --- #42 Trocknung: Übergänge von nass→damp→trocken über Zeit ---
  // Nasse Oberflächen glänzen, trocknende bekommen matte Ränder, ganz trockene sehen körnig aus
  if(u_dryPhase>0.1){
    float dryState = smoothstep(0.0, 1.0, u_dryPhase*0.3);  // 0=soaking, 1=bone dry
    float wetSheen = u_wet * (1.0 - dryState*0.8);  // gloss fades as it dries
    col += sheen * vec3(0.85,0.92,1.0) * (mRoof+mPath+mRock+mWood) * (0.15 - 0.08*night) * wetSheen;
    // Matte edges on drying surfaces (dampness ring)
    float dampRing = smoothstep(0.3, 0.7, dryState) * (1.0 - smoothstep(0.7, 1.0, dryState));
    float dryEdge = fbm(uv*vec2(40.0*u_aspect, 40.0) + vec2(u_dryPhase*0.1, 0.0));
    col = mix(col, col*0.88, dampRing * (mPath+mRock+mGrass) * smoothstep(0.3, 0.7, dryEdge) * 0.3);
  }

  // --- #41 Hitzeverzug: Luftflimmern über Feuer/Hitze, visuelle Verzerrung ---
  // Über heißen Flächen flimmert die Luft (Domain-Warp mit hoher Frequenz)
  if(u_heatWarp>0.01){
    float heatFlicker = sin(t*8.3 + uv.x*100.0)*0.5 + 0.5;
    vec2 heatUV = uv + (heatFlicker-0.5)*u_heatWarp*0.008*vec2(sin(t*5.1), cos(t*4.7));
    vec3 heatCol = texture(u_scene, clamp(heatUV, vec2(0.001), vec2(0.999))).rgb;
    float heatZone = (trail.a + u_fireCount) * smoothstep(0.0, 0.3, u_heatWarp);  // nur über Hitze
    col = mix(col, heatCol, heatZone*0.15);
  }

  // --- #9 Rost: Oxidation auf Metall/Holz unter Nässe und Zeit ---
  // Rostflecken entstehen unter länger andauernder Nässe, orange-braune Verfärbung
  if(u_rustAccum>0.05){
    float rustPattern = fbm(uv*vec2(60.0*u_aspect, 60.0) + u_rustAccum*0.05);
    float rustBlobs = smoothstep(0.4, 0.8, rustPattern);
    float rustGrowth = clamp(u_rustAccum*0.8, 0.0, 1.0);
    vec3 rustCol = mix(vec3(0.65, 0.35, 0.15), vec3(0.8, 0.45, 0.20), 0.5);  // orange-brown
    col = mix(col, rustCol, mWood*rustBlobs*rustGrowth*0.45 + mRock*rustBlobs*rustGrowth*0.25);
    // Rust spreads along grain/edges
    float rustVein = smoothstep(0.6, 0.85, fbm(vec2(uv.x*100.0*u_aspect, uv.y*20.0)));
    col = mix(col, rustCol*0.6, (mWood+mRock)*rustVein*rustGrowth*0.3);
  }

  // --- #43 Rauchschichtung: Nebel + Rauch bilden visuelle Schichten ---
  // Unter Nebel/Sturm/Feuer sammelt sich Rauch, der Silhouetten verstärkt und diffus wird
  if(u_smokeAmount>0.05){
    float smokeLayer = smoothstep(0.0, 0.5, u_smokeAmount) * clamp(1.0 - u_smokeAmount*0.7, 0.0, 1.0);
    float smokeNoise = fbm(uv*vec2(3.0*u_aspect, 3.0) + vec2(t*0.03, -u_dryPhase*0.01));
    vec3 smokeCol = mix(vec3(0.50, 0.48, 0.45), vec3(0.35, 0.32, 0.30), smokeNoise);  // gray smoke
    float smokeAlpha = smokeLayer * clamp((smokeNoise - 0.3)*1.5, 0.0, 1.0) * 0.4;
    col = mix(col, smokeCol, smokeAlpha);
  }

  // --- #20 Temperaturgradienten: Seiten zur Wärmequelle leuchtend, Schattenseite kalt ---
  // (Verbesserung: direkt an Wärmequellen warm/glühend färben)
  if(u_fireCount>0.1 && u_temperature>0.4){
    for(int i=0; i<8; i++){
      if(float(i) < u_fireCount){
        vec2 fPos = u_fires[i].xy;
        float fIntensity = u_fires[i].z;
        float fRadius = u_fires[i].w;
        float dist = length(uv - fPos);
        float falloff = smoothstep(fRadius, 0.0, dist);
        // Warm side: glow
        col += vec3(1.0, 0.7, 0.4) * falloff * fIntensity * 0.08 * (mWood + mPath + mRock);
        // Cold/shadow side gets slightly blue
        float shadeDir = smoothstep(0.2, -0.2, (uv.x - fPos.x) / max(0.01, fRadius));
        col = mix(col, col*vec3(0.8, 0.9, 1.2), shadeDir * (1.0-falloff) * 0.05);
      }
    }
  }

  // --- #44 Atem: Sichtbare Atemwolken bei Kälte (Angst/Überanstrengung) ---
  if(u_breathAmount>0.05){
    float breathNoise = fbm(uv*vec2(12.0*u_aspect, 12.0) + vec2(t*0.15, u_breathAmount*0.2));
    float breathPuff = smoothstep(0.35, 0.65, breathNoise) * u_breathAmount * 0.25;
    col = mix(col, mix(col, vec3(0.95, 0.97, 1.0), 0.4), breathPuff);
  }

  // --- #4 Druck/Gewicht: Boden unter Gewicht/Objekten dunkelt ab ---
  if(u_pressureDim>0.02){
    float pressureZone = (mPath + mGrass + mRock) * (1.0 - phys.a)*0.5;
    col *= 1.0 - pressureZone * u_pressureDim * 0.3;
  }

  // --- #26 Lichtverschmutzung: Fenster/Feuer haben Umgebungs-Glüh-Effekt ---
  if(u_pollutionGlow>0.05){
    float pollutionHaze = fbm(uv*vec2(4.0*u_aspect, 4.0) + vec2(t*0.02, u_windDrift*0.01));
    float glowZone = smoothstep(0.3, 0.7, pollutionHaze) * u_pollutionGlow * 0.15;
    col += vec3(0.4, 0.3, 0.1) * glowZone;
  }

  // --- #38 Mondlicht: Blauweiße Kantenhighlights bei Nacht ---
  if(u_moonBright>0.1){
    col += vec3(0.7, 0.8, 1.0) * u_moonBright * 0.08 * (mRoof+mRock+mWater);
  }

  // --- #34 Biom-Mischzonen: Kanten zwischen Biomen dunkler (Schneesaum, Laubfall) ---
  if(u_shelfShadow>0.05){
    float edgeN = fbm(uv*vec2(80.0*u_aspect, 80.0));
    float edgeShade = smoothstep(0.4, 0.6, edgeN) * (1.0-smoothstep(0.7, 0.9, edgeN));
    col *= 1.0 - edgeShade * u_shelfShadow * 0.15;
  }

  // --- #15 Pflanzen reagieren: Vegetation wird bei Regen/Wind transparent/gedunkelt ---
  if(u_vegFade>0.1){
    col = mix(col, col*vec3(0.7, 0.8, 0.6), veg * u_vegFade * 0.25);
  }

  // --- #24 NPC-Stimmung über Farbtemperatur: Szenen färben sich wärmer/kälter ---
  if(u_moodTint>0.05){
    col = mix(col, col*vec3(1.1, 0.9, 0.8), u_moodTint * 0.15);
  }

  // --- #50 Müdigkeit der Welt: Farben flacher & gedämpfter bei Decay ---
  if(u_worldTired>0.1){
    float lum2 = lum(col);
    col = mix(col, vec3(lum2)*vec3(0.85, 0.85, 0.90), u_worldTired * 0.2);
  }

  // --- #25 Besitz/Verbot als sichtbare Ordnung: Grenzlinien bekommen kalten Saum ---
  if(u_forbiddenCold>0.05){
    float boundaryNoise = fbm(uv*vec2(60.0*u_aspect, 60.0));
    col = mix(col, col*vec3(0.8, 0.9, 1.1), smoothstep(0.4, 0.6, boundaryNoise) * u_forbiddenCold * 0.1);
  }

  // --- #32 Oberflächen-Alphabet/Runen: Subtile Gitter-Textur über Wasser/Feuchtigkeit ---
  if(u_runeGlow>0.05){
    float runeGrid = step(0.9, vnoise(uv*vec2(300.0*u_aspect, 300.0)));
    col += vec3(0.4, 0.5, 1.0) * runeGrid * mWater * u_runeGlow * 0.3;
  }

  // --- #11 Schatten als Besitz: Objekte im Schatten altern langsamer ---
  if(u_shadowAge>0.02){
    float shadowMask = 1.0 - smoothstep(0.4, 0.7, fbm(uv*vec2(40.0*u_aspect, 40.0)));
    col = mix(col, col*vec3(1.05, 1.03, 1.0), shadowMask * u_shadowAge * 0.15);
  }

  // --- #6 Geruch als Diffusion: Dunstwolken von Verfall & Feuer ---
  if(u_smellDrift>0.02){
    float smellCloud = fbm(uv*vec2(25.0*u_aspect, 25.0) + vec2(u_smellDrift, u_smellDrift*0.5));
    col += vec3(0.6, 0.5, 0.4) * smoothstep(0.3, 0.7, smellCloud) * u_smellDrift * 0.08;
  }

  // --- #45 Berührungsspuren: Abgegriffene Stellen glänzend/dunkel ---
  if(u_touchWear>0.1){
    float touchZones = fbm(uv*vec2(80.0*u_aspect, 80.0) + u_touchWear);
    float wearMask = smoothstep(0.4, 0.6, touchZones) * (mPath + mWood*0.5);
    col = mix(col, col*vec3(1.15, 1.08, 0.95), wearMask * min(u_touchWear*0.3, 0.2));
  }

  // --- #30 Reparatur: Neue/reparierte Holzstellen glänzen und sind heller ---
  if(u_repairMark>0.05){
    float repairZones = fbm(uv*vec2(60.0*u_aspect, 60.0));
    vec3 freshWood = vec3(0.95, 0.82, 0.65);
    col = mix(col, freshWood, smoothstep(0.45, 0.55, repairZones) * mWood * u_repairMark * 0.4);
  }

  // --- #49 Segen/Fluch: Bloom aufhellt + Glanz, Decay verdunkelt + Staub ---
  if(abs(u_blessCurse)>0.02){
    float condition = (u_blessCurse > 0.0 ? u_blessCurse : -u_blessCurse);
    if(u_blessCurse>0.02){
      col = mix(col, col*vec3(1.2, 1.15, 1.1), condition * 0.12);
    } else {
      col = mix(col, col*vec3(0.85, 0.8, 0.75), condition * 0.15);
    }
  }

  // --- Schneedecke: Dächer & Gras zuerst, Pfade fleckig zuletzt ---
  if(u_snow>0.003){
    float hr=smoothstep(0.35,0.65,mRoof), hg=smoothstep(0.35,0.65,mGrass),
          hf=smoothstep(0.35,0.65,mFol),  hk=smoothstep(0.35,0.65,mRock),
          hp=smoothstep(0.35,0.65,mPath);
    float snowPatch = fbm(uv*vec2(18.0*u_aspect,18.0));
    float cover = hr*smoothstep(0.00,0.80,u_snow)
                + hg*smoothstep(0.05,0.85,u_snow)
                + hf*smoothstep(0.15,1.00,u_snow)*0.8
                + hk*smoothstep(0.20,1.00,u_snow)*0.9
                + hp*smoothstep(0.35,1.00,u_snow)*(0.4+0.6*smoothstep(0.25,0.75,snowPatch));
    cover = clamp(cover,0.0,1.0);
    cover *= clamp(1.0 - trail.r*0.9 - trail.a*1.2, 0.0, 1.0);  // Fußdellen & Feuerschmelze
    float sparkleS = smoothstep(0.997,1.0,hash(floor(uv*vec2(500.0*u_aspect,500.0))+vec2(floor(t*3.0))));
    vec3 snowCol = (vec3(0.90,0.93,0.98) + 0.06*vnoise(uv*vec2(90.0*u_aspect,90.0)) + sparkleS*0.35)
                 * (0.78+0.22*lum(base));   // Relief bleibt lesbar
    col = mix(col, snowCol, cover*0.95);
    // Tiefe, dunkle Eindrücke im Schnee (Schuhabdruck gräbt sich ein)
    float fpDent = smoothstep(0.15,0.95, trail.r) * cover;
    col = mix(col, col*0.48 + vec3(0.02,0.03,0.06), fpDent*0.6);
  }

  // --- Wolkenschatten wandern (Tag) ---
  float cloud = fbm(uv*vec2(2.6*u_aspect,2.6) + vec2(t*0.05*(0.4+u_wind), t*0.012));
  col *= mix(1.0, 0.74+0.26*smoothstep(0.35,0.75,cloud), (1.0-night)*(0.30+0.60*u_storm));

  // --- Grading (Tag/Nacht/Sturm) ---
  col = grade(col);

  // --- Sonnenbleiche: material-gewichtet entsättigen & aufhellen (nur Tag) ---
  if(u_bleach>0.003){
    float bl = u_bleach * (1.0-night) * (mRoof*1.0 + mWood*1.0 + mPath*0.7 + mRock*0.6 + veg*0.45 + mWin*0.2);
    col = mix(col, vec3(lum(col))*1.12 + 0.04, clamp(bl,0.0,1.0)*0.55);
  }

  // --- Himmel-/Reflexionsfarben ---
  vec3 sky = mix( mix(vec3(0.62,0.70,0.82), vec3(0.28,0.31,0.38), u_storm),
                  mix(vec3(0.09,0.12,0.21), vec3(0.045,0.055,0.10), u_storm), night );

  // --- Wandernde Sonne/Mond im Himmel (beeinflusst auch Himmelsgradient) ---
  float sunAngle = (0.5 - night*1.2) * 3.14159;  // 0 (Tag oben) bis -1.88 (Nacht unten)
  vec2 sunPos = vec2(0.5 + sin(sunAngle)*0.4, 0.25 + cos(sunAngle)*0.3);
  float sunDist = distance(uv, sunPos);
  float sunGlow = exp(-sunDist*sunDist*300.0);  // sharp circular glow
  vec3 sunColor = mix(vec3(1.0,0.8,0.2), vec3(0.85,0.85,1.0), night);  // gelb -> silber
  sky = mix(sky, sunColor, sunGlow*0.8*(1.0-u_fog*0.4));  // Sonne schwächer in Nebel

  // --- Godrays + volumetrische Wolken/Licht -------------------------------
  // Single-pass Raymarch-Fake: radial samples laufen zur Sonne/Mondposition,
  // Wolkenvolumen moduliert die Lichtschächte. Das ist keine UI-Attrappe,
  // sondern pro Fragment integriertes Streulicht.
  float ray = 0.0;
  vec2 rayDir = sunPos - uv;
  for(int ri=1;ri<=7;ri++){
    float k=float(ri)/7.0;
    vec2 ruv = clamp(uv + rayDir*k*0.72,0.001,0.999);
    float cvol = fbm(ruv*vec2(3.6*u_aspect,3.6) + vec2(t*0.035+u_windDrift*0.02,-t*0.010));
    float gap = 1.0 - smoothstep(0.50,0.82,cvol);
    ray += gap * (1.0-k) * smoothstep(0.08,0.95,length(rayDir));
  }
  ray = ray/7.0 * (0.30+0.70*u_fog) * (0.25+0.75*(1.0-u_storm)) * (0.25+0.75*(1.0-night));
  col += sunColor * ray * 0.32;
  float volCloud = smoothstep(0.48,0.76, fbm(uv*vec2(4.4*u_aspect,4.4)+vec2(t*0.025+u_windDrift*0.018,t*0.008)));
  col = mix(col, mix(col*0.72, sky+0.10, 0.35), volCloud*u_fog*(0.18+0.34*u_storm));

  // --- Rinnsale / Wasserflussnetz auf Pfaden (bei Regen) ---
  float rainy = u_rain * clamp(u_wet*1.6,0.0,1.0);
  vec4 erefG = texture(u_emis, uv - vec2(0.0,0.05));
  if(rainy>0.004){
    float ang = phys.g*6.2832;
    vec2 dir = vec2(cos(ang),sin(ang));
    vec2 pc = uv*vec2(u_aspect,1.0)*100.0;
    float along = dot(pc,dir), across = dot(pc,vec2(-dir.y,dir.x));
    float riv  = smoothstep(0.60,0.78, fbm(vec2(across*1.4,       along*0.35 - t*2.6)));
    float riv2 = smoothstep(0.66,0.80, fbm(vec2(across*3.1 + 7.0, along*0.55 - t*3.4)))*0.8;
    float net = max(riv,riv2) * mPath * rainy * noZone;
    vec3 rivCol = mix(vec3(0.70,0.80,0.95), sky+0.3, 0.35);
    col = mix(col, col*0.72 + rivCol*0.5, net);
    col += erefG.rgb * net * night * u_glow * 0.9;   // Warmlicht glitzert im Flussnetz

    // --- Dach-Ablauf (K2): Dächer sammeln nie Wasser, sie SCHÜTTEN ab. ---
    // Dünne Ablaufbahnen rinnen die Schrägen hinunter zu den Tropfkanten:
    // vertikal gestreckte, abwärts wandernde Glanzstreifen, nur auf Dach.
    float rr1 = smoothstep(0.60,0.84, fbm(vec2(uv.x*150.0*u_aspect,       uv.y*16.0 - t*2.3)));
    float rr2 = smoothstep(0.66,0.88, fbm(vec2(uv.x*260.0*u_aspect + 9.0, uv.y*24.0 - t*3.3)))*0.75;
    float roofRun = max(rr1,rr2) * mRoof * rainy;
    vec3 runCol = mix(vec3(0.72,0.80,0.94), sky+0.25, 0.35);
    col = mix(col, col*0.78 + runCol*0.42, roofRun*0.85);
    col += erefG.rgb * roofRun * night * u_glow * 0.35; // Fensterlicht glänzt im Ablauf
  }

  // --- Pfützen: sammeln sich in Senken, spiegeln Himmel & Warmlicht ---
  float pnz = fbm(uv*vec2(9.0*u_aspect,9.0));
  float depth = max(phys.r*(mPath+mRock)*noZone, phys.b*mGrass*0.6) * (0.55+0.45*pnz);
  depth = max(depth, mWater);                       // echtes Wasser ist immer voll
  depth = max(depth, smoothstep(0.5,0.95,trail.b)*mGrass*0.65); // Matschsenken sammeln Wasser
  float th = 0.95 - u_puddle*0.78;
  float pud = smoothstep(th, th+0.20, depth);
  if(pud>0.002){
    vec2 rip = vec2(vnoise(uv*vec2(150.0*u_aspect,150.0)+vec2(0.0,t*1.3)),
                    vnoise(uv*vec2(120.0*u_aspect,120.0)-vec2(t*0.9,0.0))) - 0.5;
    vec2 roff = rip*(0.003 + 0.009*u_rain) * (1.0-icy);   // Eis kräuselt nicht
    vec3 refl = grade(texture(u_scene, vec2(uv.x, uv.y-0.055)+roff).rgb);
    vec3 pcol = mix(refl*0.75, sky, 0.45);
    vec4 eref = texture(u_emis, uv - vec2(0.0,0.045) + roff*2.0);
    pcol += eref.rgb * u_glow * (0.35 + 1.9*night);  // DER Schlüssel-Shot: Fenster spiegeln
    // gefroren: heller, matter Spiegel mit Frostmuster, Warmlicht gedämpft & statisch
    if(icy>0.003){
      float frost = fbm(uv*vec2(70.0*u_aspect,70.0)) * (sin(uv.x*300.0)*cos(uv.y*280.0)*0.5+0.5);
      vec3 iceCol = mix(vec3(0.74,0.82,0.92)*(0.75+0.45*frost), refl, 0.22)
                  + eref.rgb*u_glow*(0.15+0.6*night);
      pcol = mix(pcol, grade(iceCol), icy);
    }
    pcol += vec3(0.9,0.95,1.0) * u_flash * 0.55;
    col = mix(col, pcol, pud * clamp(u_puddle*2.2,0.0,1.0) * ground);
  }

  // --- Regen-Aufprallringe auf allem Nassen ---
  if(u_rain>0.004){
    vec2 cellUv = uv*vec2(38.0*u_aspect,38.0);
    vec2 cid=floor(cellUv), cf=fract(cellUv)-0.5;
    float ph = fract(t*(0.7+0.6*hash(cid+3.1)) + hash(cid));
    vec2 cOff = (vec2(hash(cid+1.7),hash(cid+2.3))-0.5)*0.5;
    float ring = smoothstep(0.05,0.0,abs(length(cf-cOff)-ph*0.42)) * (1.0-ph)
               * step(hash(cid+4.2), u_rain*0.85) * (1.0-icy*0.85);
    col += ring * (pud*0.5 + u_wet*0.22) * ground * vec3(0.7,0.8,0.92);
  }

  // --- Tropfkanten unter Dächern ---
  if(u_rain>0.004){
    float dripEdge = clamp(texture(u_maskA, uv-vec2(0.0,0.007)).b - mRoof, 0.0, 1.0);
    float colid = floor(uv.x*180.0*u_aspect);
    float drip = step(0.90, fract(uv.y*34.0 - t*2.2 + hash(vec2(colid,1.0))*7.0))
               * step(hash(vec2(colid,2.0)), 0.6);
    col += dripEdge * drip * u_rain * vec3(0.55,0.65,0.85) * 0.6;
  }

  // --- Fensterlicht: jedes Fenster hat eigene Wärme, Helligkeit & Flacker-Rhythmus ---
  vec4 emis = texture(u_emis,uv);
  float winId = hash(floor(uv*vec2(36.0*u_aspect,36.0)));   // ~1 Zelle pro Fenster
  float flick = 0.80 + 0.20*vnoise(vec2(t*(1.6+winId*1.6), winId*9.0));
  float lamp = u_glow * (0.22 + 0.78*night) * flick
             * (1.0 - smoothstep(0.6,0.92,u_decay));   // verlassene Häuser erlöschen
  float litVar = 0.72 + 0.28*step(0.25, fract(winId*7.31));  // nicht jedes Fenster gleich hell
  vec3 lampCol = mix(vec3(1.0,0.83,0.46), vec3(1.0,0.58,0.22), fract(winId*3.77)*0.7);
  // Unbeleuchtet ist ein Fenster dunkles Glas mit Himmelston – so verschwinden
  // auch Pink-Marker aus dem Quellbild; beleuchtet glüht es warm.
  vec3 glassCol = mix(vec3(0.16,0.19,0.24), sky, 0.35);
  col = mix(col, glassCol, mWin * 0.92 * (1.0 - lamp*litVar));
  col = mix(col, lampCol, mWin * lamp * litVar * 0.88);
  col += emis.rgb * lamp * 0.7;
  col += emis.rgb * u_wet * ground * night * u_glow * 0.55;  // diffuser Warmschein auf Nässe

  // --- Brandspuren & Lagerfeuer-Licht (Runde 4) ---
  float scorch = smoothstep(0.18,0.85,trail.a);
  col = mix(col, vec3(0.09,0.07,0.06)*(0.5+0.6*lum(base)), scorch*(1.0-mWater)*0.8);
  for(int i=0;i<8;i++){
    if(float(i)>=u_fireCount) break;
    vec4 fdef = u_fires[i];
    float dd = length((uv-fdef.xy)*vec2(u_aspect,1.0));
    float ffl = 0.72+0.28*vnoise(vec2(t*7.0+float(i)*3.1, float(i)*1.7));
    float fglow = exp(-dd*dd/(fdef.w*fdef.w)) * fdef.z * ffl;
    col += vec3(1.0,0.52,0.16) * fglow * (0.35+0.75*night);
    col += vec3(1.0,0.85,0.45) * smoothstep(fdef.w*0.35,0.0,dd) * fdef.z * ffl * 0.5;
  }

  // --- Glut/Lava: Blackbody-Schicht aus Brandspur + Lava-Burst ------------
  // trail.a ist die persistente Wärme/Brandspur. Lava hebt diese Schicht auf
  // "flüssig heiß": gelber Kern, orange Mantel, dunkle Kruste am Rand.
  float heatField = smoothstep(0.10,0.92,trail.a) * (0.35+0.65*u_elementHeatBurst);
  float lavaNoise = fbm(uv*vec2(65.0*u_aspect,65.0) + vec2(t*0.7,-t*0.35));
  float lavaCore = smoothstep(0.62,0.92,lavaNoise) * heatField * u_elementLavaBurst;
  float crust = smoothstep(0.30,0.72,lavaNoise) * heatField * (0.35+0.65*u_elementLavaBurst);
  col = mix(col, vec3(0.05,0.035,0.025), crust*0.35*(1.0-mWater));
  col += vec3(1.0,0.22,0.035) * heatField * (0.18+0.55*night);
  col += vec3(1.0,0.78,0.22) * lavaCore * (0.65+0.65*night);
  // Hitzeflimmern als lokaler Kontrast/Chromatik-Fake ohne zweiten Texture-Pass.
  float heatShimmer = sin((uv.x+uv.y*0.7)*210.0 + t*18.0) * heatField * u_elementHeatBurst;
  col.r += heatShimmer*0.035; col.b -= heatShimmer*0.025;

  // --- Nebelschleier (fbm-Schichten, dünn und transparent bei niedrigen Werten) ---
  if(u_fog>0.005){
    float f1 = fbm(uv*vec2(3.2*u_aspect,3.2) + vec2((t*0.5+u_windDrift)*0.060, -t*0.010));
    float f2 = fbm(uv*vec2(6.5*u_aspect,6.5) + vec2(-(t*0.5+u_windDrift)*0.045, t*0.020) + 31.7);
    float edge = smoothstep(0.22,0.60,length((uv-0.5)*vec2(1.15,1.35))) + smoothstep(0.75,0.15,uv.y)*0.3;
    // Fog fades aggressively when low: quadratic falloff prevents cloud appearance
    float fogFade = u_fog*u_fog*(3.0-2.0*u_fog);  // smoother curve, nearly invisible below 0.3
    float fogAmt = clamp((0.45*f1+0.38*f2)*(0.3+0.7*edge),0.0,1.0)*fogFade;
    vec3 fogCol = mix(vec3(0.86,0.89,0.93), vec3(0.40,0.46,0.62), night) + u_flash*0.8 + u_snow*0.05;
    col = mix(col, fogCol, fogAmt*0.75);
  }

  // --- Schneefall: träge taumelnde Flocken, windverdriftet (3 Parallax-Schichten) ---
  if(u_snowfall>0.004){
    float sf = 0.0;
    for(int i=0;i<3;i++){
      float fi=float(i);
      vec2 fuv = uv*vec2((28.0+fi*14.0)*u_aspect, 28.0+fi*14.0);
      fuv.y -= t*(0.5+fi*0.25);                   // Flocken sinken (uv.y wächst abwärts)
      fuv.x += sin(fuv.y*1.7 + t*(0.8+fi*0.3))*0.35 + u_windDrift*(0.5+fi*0.25);
      vec2 ip=floor(fuv), fp=fract(fuv)-0.5;
      float rnd=hash(ip);
      vec2 cO=(vec2(hash(ip+2.1),hash(ip+3.7))-0.5)*0.55;
      float flake = smoothstep(0.13+0.07*rnd, 0.02, length(fp-cO));
      sf += flake * step(1.0-u_snowfall*0.5, rnd) * (1.0-fi*0.22);
    }
    col = mix(col, vec3(0.93,0.95,1.0), clamp(sf,0.0,1.0)*0.85);
  }

  // --- Regenschlieren: dünne, diagonal fallende Linien, EINSEITIG wind-getrieben ---
  if(u_rain>0.004){
    float rn = 0.0;
    float slope = 0.16 + u_wind*0.38;            // dx/dy der Fallrichtung (GLEICH für alle Schichten!)
    for(int i=0;i<3;i++){
      float fi=float(i);
      float scaleX = 55.0 + fi*35.0;             // Streifendichte quer zur Fallrichtung
      float lineW  = 0.12;                        // halbe Linienbreite (quer)
      float across = (uv.x - slope*uv.y) * scaleX;   // Koordinate QUER zur Falllinie (Linien const. entlang (slope,1))
      float colid  = floor(across);
      float af     = fract(across) - 0.5;
      float line   = smoothstep(lineW, 0.0, abs(af));   // dünne Linie quer zur Fallrichtung
      // entlang der Falllinie: aperiodische, gestreckte Noise -> KEINE Zeilen-Periodizität (kein Gitter!)
      float along  = vnoise(vec2(colid*3.1 + fi*5.0, uv.y*1.6 - u_rainPhase*(0.8+fi*0.4)));
      float on     = step(1.0 - u_rain*0.5, hash(vec2(colid,fi+9.0)));
      float streak = smoothstep(0.38, 0.70, along);  // elongierte, unregelmäßige Tropfen
      rn += on * line * streak * (1.0 - fi*0.22);
    }
    col = mix(col, vec3(0.72,0.80,0.95), clamp(rn,0.0,1.0)*u_rain*0.42);
  }

  // --- Blitz ---
  col += u_flash * (vec3(0.30,0.36,0.55) + col*0.9);

  // --- Tag danach: Sonnenglitzern auf nassen Flächen ---
  float spTw = hash(floor(uv*vec2(420.0*u_aspect,420.0)) + vec2(floor(t*7.0)));
  col += smoothstep(0.9976,1.0,spTw) * u_wet * (1.0-night) * (1.0-u_storm) * ground * vec3(1.2);

  // --- Atmen + Nacht-Vignette ---
  col *= 1.0 + 0.012*sin(t*0.45);
  col *= 1.0 - (0.30*night + 0.10*u_storm) * pow(length(uv-0.5)*1.42, 1.8);

  // --- Post-ish Shader Stack: Bloom, Distortion, Chromatic Aberration, Point Clouds ---
  float bright = smoothstep(0.62,1.05,lum(col)) + texture(u_emis,uv).a*u_glow*(0.35+night);
  vec3 bloomCol = vec3(0.0);
  for(int bi=0;bi<6;bi++){
    float a=float(bi)*6.2831/6.0;
    vec2 o=vec2(cos(a),sin(a))*u_px*(6.0+18.0*u_bloom+10.0*night);
    bloomCol += grade(texture(u_scene,clamp(uv+o,0.001,0.999)).rgb);
  }
  bloomCol/=6.0;
  col += bloomCol * bright * (0.10 + 0.45*u_bloom + 0.22*u_glow*night);
  float distortAmt = (u_storm*0.25 + u_elementHeatBurst*0.45 + u_elementLavaBurst*0.55 + trail.a*0.35);
  vec2 warp = (vec2(vnoise(uv*vec2(42.0*u_aspect,42.0)+t*1.7),
                    vnoise(uv*vec2(39.0*u_aspect,39.0)-t*1.3))-0.5) * u_px * 18.0 * distortAmt;
  vec3 warped = texture(u_scene,clamp(uv+warp,0.001,0.999)).rgb;
  col = mix(col, grade(warped), distortAmt*0.08);
  float edgeCA = pow(length(uv-0.5)*1.55,2.0) * (0.20+0.55*u_storm+0.40*u_elementHeatBurst);
  vec2 ca = normalize(uv-0.5+vec2(0.0001)) * u_px * edgeCA * 10.0;
  vec3 caCol = vec3(texture(u_scene,clamp(uv+ca,0.001,0.999)).r,
                    col.g,
                    texture(u_scene,clamp(uv-ca,0.001,0.999)).b);
  col = mix(col, grade(caCol), clamp(edgeCA,0.0,0.28));
  // Point-Cloud-Fake: depth-aware floating dust/embers/snow motes, clipped by fog/light.
  vec2 pcGrid = uv*vec2(90.0*u_aspect,90.0);
  vec2 pcId=floor(pcGrid), pcF=fract(pcGrid)-0.5;
  float pcRnd=hash(pcId);
  float pcDepth = texture(u_depth,clamp(uv,0.001,0.999)).r;
  vec2 pcOff=(vec2(hash(pcId+1.7),hash(pcId+2.9))-0.5)*0.55 + vec2(sin(t+pcRnd*6.0),cos(t*0.7+pcRnd))*0.10;
  float pcDot=smoothstep(0.070,0.015,length(pcF-pcOff)) * step(0.965 - u_fog*0.08 - u_elementAshBurst*0.12, pcRnd);
  vec3 pcCol=mix(vec3(0.65,0.75,0.95),vec3(1.0,0.42,0.12),u_elementAshBurst+trail.a);
  col += pcCol * pcDot * (0.16+0.45*u_fog+0.55*u_elementAshBurst) * (0.45+0.55*pcDepth);

  // === Runde 8: Wally-Monokel — isolierte Inspektions-Linsen, ersetzt col am Ende ===
  // (nach der vollen Komposition, damit jede Linse dieselbe Welt sieht wie das normale Bild).
  if(u_lens>0.5){
    vec3 grey = vec3(lum(base))*0.35;             // gedimmter Materialgrund, Linsen heben NUR ihr Merkmal hervor
    if(u_lens<1.5){                                 // Linse 1: Schmutz, Abnutzung, Fußspuren
      float wear = clamp(trail.b*1.4 + u_touchWear*0.6, 0.0, 1.0);
      col = grey + wear*vec3(0.95,0.70,0.30);
    } else if(u_lens<2.5){                           // Linse 2: Belastung/Druck (#4)
      float press = clamp(u_pressureDim*3.0, 0.0, 1.0);
      col = grey + press*vec3(1.0,0.25,0.20);
    } else if(u_lens<3.5){                           // Linse 3: Klang als sichtbare Geometrie (#7)
      float wave = texture(u_sound,uv).r;
      col = grey + wave*vec3(0.35,0.85,1.0);
    } else if(u_lens<4.5){                           // Linse 4: Materialtreue — der stabile Shader.
      // Bewusst unverändert: das normale, voll komponierte Bild IST diese Linse.
    } else {                                          // Linse 5: nur Kanten, keine Materialinformation
      vec4 mAx = texture(u_maskA, uv+vec2(u_px.x,0.0)) - texture(u_maskA, uv-vec2(u_px.x,0.0));
      vec4 mAy = texture(u_maskA, uv+vec2(0.0,u_px.y)) - texture(u_maskA, uv-vec2(0.0,u_px.y));
      vec4 mBx = texture(u_maskB, uv+vec2(u_px.x,0.0)) - texture(u_maskB, uv-vec2(u_px.x,0.0));
      vec4 mBy = texture(u_maskB, uv+vec2(0.0,u_px.y)) - texture(u_maskB, uv-vec2(0.0,u_px.y));
      float e = length(mAx)+length(mAy)+length(mBx)+length(mBy);
      col = vec3(smoothstep(0.05,0.5,e));
    }
  }

  fragColor = vec4(clamp(col,0.0,1.0),1.0);
}`;

function compile(src,type){
  const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error('Shader: '+gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog,compile(VS,gl.VERTEX_SHADER));
gl.attachShader(prog,compile(FS,gl.FRAGMENT_SHADER));
gl.linkProgram(prog);
if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error('Link: '+gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const aLoc=gl.getAttribLocation(prog,'a'); gl.enableVertexAttribArray(aLoc);
gl.vertexAttribPointer(aLoc,2,gl.FLOAT,false,0,0);
gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);

const U={};
['u_scene','u_maskA','u_maskB','u_phys','u_emis','u_px','u_time','u_aspect','u_flash',
 'u_grassAvg','u_mossBoost','u_trail','u_fireCount','u_fires[0]','u_depth','u_parallax','u_zone','u_material','u_intrinsic',
 'u_rainPhase','u_windDrift','u_dryPhase','u_heatWarp','u_rustAccum','u_smokeAmount','u_breathAmount','u_pressureDim','u_pollutionGlow','u_moonBright','u_shelfShadow','u_vegFade','u_moodTint','u_worldTired','u_forbiddenCold',  'u_runeGlow','u_bloodStain','u_mudStain',
 'u_lens','u_sound',
 'u_elementWetBurst','u_elementHeatBurst','u_elementPressureBurst','u_elementAshBurst','u_elementHailBurst','u_elementLavaBurst',
 ...PARAM_META.map(m=>'u_'+m[0])].forEach(n=>U[n]=gl.getUniformLocation(prog,n));
gl.uniform3f(U.u_grassAvg, 0.34, 0.48, 0.20);   // Fallback bis analyze() misst

function mkTex(unit){
  const t=gl.createTexture();
  gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
  return t;
}
const TEX = { scene:mkTex(0), maskA:mkTex(1), maskB:mkTex(2), phys:mkTex(3), emis:mkTex(4), trail:mkTex(5), depth:mkTex(6), zone:mkTex(7), sound:mkTex(8), material:mkTex(9) };
gl.uniform1i(U.u_scene,0); gl.uniform1i(U.u_maskA,1); gl.uniform1i(U.u_maskB,2);
gl.uniform1i(U.u_phys,3);  gl.uniform1i(U.u_emis,4);  gl.uniform1i(U.u_trail,5);
gl.uniform1i(U.u_depth,6); gl.uniform2f(U.u_parallax,0,0);
gl.uniform1i(U.u_zone,7);
gl.uniform1i(U.u_sound,8);
gl.uniform1i(U.u_material,9);
gl.uniform1f(U.u_fireCount,0);
gl.uniform1f(U.u_lens,0);

// === Runde 4: Trail-/Störungstextur (Unit 5) ===
// Kanäle: R transiente Störung (Fußdelle, Halbwertszeit 1.5 s), G Impuls (0.4 s),
// B permanenter Trampelpfad, A Hitze/Brandspur (~25 s). Decay wirkt DIREKT auf
// den Pixeldaten – nicht per Composite-Trick (Prototyp-Bug Nr. 6).
const TR=512;
const trailData = new Uint8Array(TR*TR*4);
let trailDirty=true, trailDecayAcc=0;
function trailStamp(u,v,rad,ch,strength,cap){
  const cx=u*TR, cy=v*TR, r=Math.max(1,rad*TR);
  const x0=Math.max(0,Math.floor(cx-r)), x1=Math.min(TR-1,Math.ceil(cx+r));
  const y0=Math.max(0,Math.floor(cy-r)), y1=Math.min(TR-1,Math.ceil(cy+r));
  const mx = cap!==undefined?cap:255;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const d=Math.hypot(x-cx,y-cy)/r;
    if(d>1)continue;
    const i=(y*TR+x)*4+ch;
    trailData[i]=Math.min(mx, trailData[i]+strength*255*(1-d*d));
  }
  trailDirty=true;
}
const _driftBuf=new Uint8Array(TR*TR*4);
let _driftAcc=0;
function trailTick(dt){
  trailDecayAcc+=dt;
  if(trailDecayAcc<0.066) return;              // ~15 Hz genügt
  const d=trailDecayAcc; trailDecayAcc=0;
  const rain=(typeof CUR!=='undefined'?CUR.rain:0)||0;
  const wind=(typeof CUR!=='undefined'?CUR.wind:0)||0;
  // #2: Regen wäscht frische Spuren (R) schnell aus; der permanente Trampelpfad (B)
  //     bleibt erhalten (Katalog: "Trampelpfade Wochen"). Feuer konserviert kurz (A).
  const rR=0.462 + rain*1.6;                    // Regen beschleunigt Dellen-Abbau
  const kR=Math.exp(-d*rR), kG=Math.exp(-d*1.733), kA=Math.exp(-d*0.028);
  let any=false;
  for(let i=0;i<trailData.length;i+=4){
    if(trailData[i])  {trailData[i]  =(trailData[i]*kR)|0; any=true;}
    if(trailData[i+1]){trailData[i+1]=(trailData[i+1]*kG)|0; any=true;}
    if(trailData[i+2]){any=true;}                 // B: permanent, kein Decay
    if(trailData[i+3]){trailData[i+3]=(trailData[i+3]*kA)|0; any=true;}
  }
  // #2: Wind verweht Asche/Ruß (A-Kanal) in Windrichtung (+x, leichte Hebung).
  //     Nur bei spürbarem Wind, gedrosselt (~4 Hz), um CPU zu schonen.
  if(wind>0.12){
    _driftAcc+=d;
    if(_driftAcc>=0.25){
      _driftAcc=0;
      const sx=Math.max(1,Math.round(wind*2.0));   // Versatz in Pixeln, downwind
      const sy=-1;                                  // Asche steigt leicht auf
      const buf=_driftBuf; buf.set(trailData);
      const keep=0.72;                              // Rest bleibt liegen (Verwehung, kein Teleport)
      for(let y=0;y<TR;y++){
        const ny=y+sy; if(ny<0||ny>=TR) continue;
        for(let x=0;x<TR;x++){
          const a=buf[(y*TR+x)*4+3]; if(!a) continue;
          const nx=x+sx; if(nx<0||nx>=TR) continue;
          const di=(ny*TR+nx)*4+3;
          const moved=a*(1-keep)|0;
          const oi=(y*TR+x)*4+3;
          trailData[oi]=(a*keep)|0;
          const nv=trailData[di]+moved; trailData[di]=nv>255?255:nv;
        }
      }
      any=true;
    }
  } else _driftAcc=0;
  if(any) trailDirty=true;
}
function trailUpload(){
  if(!trailDirty)return;
  gl.activeTexture(gl.TEXTURE0+5); gl.bindTexture(gl.TEXTURE_2D,TEX.trail);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,TR,TR,0,gl.RGBA,gl.UNSIGNED_BYTE,trailData);
  trailDirty=false;
}
function trailClear(){ trailData.fill(0); trailDirty=true; }
function trailSample(u,v){
  const x=Math.max(0,Math.min(TR-1,(u*TR)|0)), y=Math.max(0,Math.min(TR-1,(v*TR)|0));
  const i=(y*TR+x)*4;
  return {r:trailData[i]/255, g:trailData[i+1]/255, b:trailData[i+2]/255, a:trailData[i+3]/255};
}
trailUpload();   // sofort nullen – der 1×1-Platzhalter hätte a=1 (Brandspur überall)

// === Runde 8: Klang-Wellenfeld (Unit 8) — gleiche Idiom wie die Trail-Textur ===
// Nur R-Kanal genutzt: Wellenintensität. Schneller Decay (~0.35 s Halbwertszeit),
// weil Klang per Definition transient ist (#7: Klang als sichtbare Wellen).
const SND=256;
const soundData = new Uint8Array(SND*SND*4);
let soundDirty=true, soundDecayAcc=0;
function soundStamp(u,v,strength){
  const cx=u*SND, cy=v*SND, r=Math.max(1,0.10*SND);
  const x0=Math.max(0,Math.floor(cx-r)), x1=Math.min(SND-1,Math.ceil(cx+r));
  const y0=Math.max(0,Math.floor(cy-r)), y1=Math.min(SND-1,Math.ceil(cy+r));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const d=Math.hypot(x-cx,y-cy)/r;
    if(d>1)continue;
    const i=(y*SND+x)*4;
    soundData[i]=Math.min(255, soundData[i]+strength*255*(1-d*d));
  }
  soundDirty=true;
}
function soundTick(dt){
  soundDecayAcc+=dt;
  if(soundDecayAcc<0.066) return;
  const d=soundDecayAcc; soundDecayAcc=0;
  const k=Math.exp(-d*1.98);                    // ~0.35 s Halbwertszeit
  let any=false;
  for(let i=0;i<soundData.length;i+=4){
    if(soundData[i]){ soundData[i]=(soundData[i]*k)|0; any=true; }
  }
  if(any) soundDirty=true;
}
function soundUpload(){
  if(!soundDirty)return;
  gl.activeTexture(gl.TEXTURE0+8); gl.bindTexture(gl.TEXTURE_2D,TEX.sound);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,SND,SND,0,gl.RGBA,gl.UNSIGNED_BYTE,soundData);
  soundDirty=false;
}
function soundClear(){ soundData.fill(0); soundDirty=true; }
soundUpload();

let lensState=0;   // Runde 8: Wally-Monokel, 0=aus, 1..5 aktive Linse

function uploadTex(unit,tex,w,h,data){ // data: Uint8Array RGBA oder Image/Canvas
  gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,tex);
  if(data instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,data);
}

// =========================== Analyse-Pipeline ====================
let sceneImg=null, sceneSource={kind:'UNKNOWN',label:null}, matImg=null, ready=false;
let classGrid=null, AW=0, AH=0;   // CPU-Wahrheit für Materialabfragen (Runde 2–4)
let structDiag=null;              // Runde 5: Diagnose des Struktur-Passes
let zoneGrid=null;                // K1: Gebäudezonen (1 = Fachwerk-Gebäude)
let skyGrid=null;                  // K7: Himmel-Flood-Ergebnis (1 = Himmel, inert; sonst 0)
                                    // klassifiziert selbst NICHT — die Pixel sind im classGrid
                                    // längst als K (Fels) verewigt; dies ist nur die Herkunfts-
                                    // markierung, damit z.B. Wetterpartikel echten Fels von
                                    // Himmel-als-Fels unterscheiden können, ohne ein zweites
                                    // Klassifikationssystem zu erfinden (Invariante 2).
let skyRegionFound=false;          // true nur, wenn K7 tatsächlich eine Himmel-Region bestätigt
                                    // hat (Größe/Farbtor erfüllt) — sonst ist skyGrid nutzlos
                                    // "immer 0" und darf NICHT als "hier ist kein Himmel" gelesen
                                    // werden (z. B. bedeckte/dunkle Quellbilder ohne blauen Himmel).

/* --- Materialschicht: Intrinsic Decomposition -----------------------------
   Siehe docs/neuronale-materialien-svbrdf-pbr.md. Das Quellbild enthält
   eingebackenes Licht; ohne Trennung multipliziert jedes Weltgesetz darauf.
   Hier entsteht NUR ein Beleuchtungsfeld (shading) – keine zweite
   Klassifikation. classGrid und getMaterialTypeAt bleiben unberührt.

   Das eingebaute Backend ist bewusst die klassische, deterministische
   Baseline (homomorphe Tiefpasstrennung von log-Luminanz, das Verfahren der
   De-Lighting-Werkzeuge). Ein gelerntes Backend (RGB→X, IntrinsicReal, …)
   liefert dasselbe Artefakt über window.SHADED.intrinsic.set().            */
const INTRINSIC_BASELINE = Object.freeze({
  provider:'material.intrinsic.retinex-baseline', providerVersion:'1.0.0',
  channelSetId:'intrinsic.v1', provenance:'INFERRED',
  colorSpace:{albedo:'sRGB', shading:'linear'}
});
const INTRINSIC_IDENTITY = Object.freeze({
  provider:'none', providerVersion:'0', channelSetId:'identity.v1',
  provenance:'OBSERVED', colorSpace:{albedo:'sRGB', shading:'linear'}
});
let pendingShading=null;          // gefundenes "<szene>_shading.png", wartet auf analyze()
let intrinsicShading=null;        // Float32Array AW*AH – 1.0 = neutral, <1 Schatten
let intrinsicConf=null;           // Float32Array AW*AH – Konfidenz je Pixel
let intrinsicBase=null;           // Ergebnis des eingebauten Backends (für reset())
let intrinsicCeil=null;           // Float32Array – untere Schranke aus dem Albedo-Gamut
let intrinsicProjection=null;     // Diagnose der Dykstra-Projektion (nur eingebautes Backend)
let intrinsicMeta={...INTRINSIC_IDENTITY, confidence:0, accepted:false};
let intrinsicStrength=0;          // u_intrinsic; 0 = Fallback identity-albedo

const SHADE_MIN=0.18, SHADE_MAX=2.0;

/* Dykstra-Projektion auf den Schnitt konvexer Mengen — generisch.

   Jede Menge liefert zwei Funktionen:
     project(src, dst)  exakte Projektion, schreibt nach dst, laesst src unberuehrt
     violation(v)       Abstand von der Menge (0 = erfuellt), fuer die Konvergenz

   Warum nicht einfach hintereinander projizieren: dabei erfuellt man nur die
   LETZTE Bedingung, die vorherige wird zerstoert (POCS-Blindheit). Dykstra fuehrt
   pro Menge ein Residuum mit, das den Rueckweg korrigiert, und konvergiert gegen
   den Punkt im Schnitt, der dem Startwert am NAECHSTEN liegt — also minimale
   Verzerrung der Messung statt irgendeiner zulaessigen Loesung.

   BEDINGUNG: jede Menge muss konvex sein UND eine exakte Projektion haben. Ist sie
   das nicht (Einheitsnormalen, "liegt auf IRGENDEINER Ebene", Oder-Verknuepfungen),
   gehoert der kombinatorische Teil VOR den Solver — siehe
   docs/raeumliche-algorithmen-arsenal.md §4.

   `finish` nennt die Mengen, die am Ende noch exakt angewandt werden: die sind dann
   hart garantiert, alle anderen gelten auf dem berichteten Restfehler. Welche das
   ist, bleibt damit dokumentiert statt Zufall. */
function dykstraProject(x0, sets, opts){
  const n=x0.length, m=sets.length;
  const maxIter=(opts&&opts.maxIter)||60, tol=(opts&&opts.tol)||1e-4;
  const x=Float32Array.from(x0), out=new Float32Array(n);
  const res=[], tmp=[];
  for(let i=0;i<m;i++){ res.push(new Float32Array(n)); tmp.push(new Float32Array(n)); }
  let iter=0, viol=Infinity;
  for(; iter<maxIter; iter++){
    for(let i=0;i<m;i++){
      const p=res[i], t=tmp[i];
      for(let j=0;j<n;j++) t[j]=x[j]+p[j];
      sets[i].project(t,out);
      for(let j=0;j<n;j++){ p[j]=t[j]-out[j]; x[j]=out[j]; }
    }
    viol=0;
    for(let i=0;i<m;i++){ const v=sets[i].violation(x); if(v>viol) viol=v; }
    if(viol<tol){ iter++; break; }
  }
  const finish=(opts&&opts.finish)||[];
  for(const i of finish){ sets[i].project(x,out); x.set(out); }
  const residual={};
  for(let i=0;i<m;i++) residual[sets[i].label||('set'+i)]=+sets[i].violation(x).toFixed(6);
  return {x, iterations:iter, violation:+viol.toFixed(6), residual};
}

// Menge: lo(x) <= s(x) <= hi. Enthaelt BEIDES — zulaessiger Wertebereich und
// Albedo-Gamut: albedo = col/s <= 1 <=> s >= max(col_rgb) -> lo(x). Reflektanz
// ueber 1 ist physikalisch unmoeglich und clippt spaeter zu Weiss.
function shadeBoxSet(lo,hi){
  const cap=j=>lo[j]<hi?lo[j]:hi;      // hi gewinnt, falls lo darueber liegt
  return {label:'box+gamut',
    project:(v,o)=>{ for(let j=0;j<v.length;j++){ const l=cap(j);
                       o[j]= v[j]<l?l:(v[j]>hi?hi:v[j]); } },
    violation:(v)=>{ let mx=0; for(let j=0;j<v.length;j++){ const l=cap(j);
                       const d = v[j]<l ? l-v[j] : (v[j]>hi ? v[j]-hi : 0);
                       if(d>mx) mx=d; } return mx; }};
}

// Menge: mittelwert(s) = target. Energieneutralitaet — das Zuschalten der Trennung
// darf die Gesamthelligkeit der Szene nicht verschieben. Projektion auf eine affine
// Hyperebene ist ein gleichmaessiger Versatz.
function meanSet(target){
  return {label:'mean',
    project:(v,o)=>{ let m=0; for(let j=0;j<v.length;j++) m+=v[j]; m/=v.length;
                     const d=target-m; for(let j=0;j<v.length;j++) o[j]=v[j]+d; },
    violation:(v)=>{ let m=0; for(let j=0;j<v.length;j++) m+=v[j];
                     return Math.abs(m/v.length-target); }};
}

// Beleuchtungsschätzung aus dem Quellbild. spx = RGBA-Pixel in Analyseauflösung.
function decomposeIntrinsicBaseline(spx,w,h){
  const n=w*h, logL=new Float32Array(n), conf=new Float32Array(n);
  const ceil=new Float32Array(n);   // untere Schranke für s, damit albedo <= 1
  for(let j=0;j<n;j++){
    const R=spx[j*4]/255, G=spx[j*4+1]/255, B=spx[j*4+2]/255;
    const l=R*0.299+G*0.587+B*0.114;
    logL[j]=Math.log(Math.max(l,0.004));
    ceil[j]=Math.max(SHADE_MIN, R>G?(R>B?R:B):(G>B?G:B));
  }
  // Tiefpass = Beleuchtung. Radius skaliert mit der Analyseauflösung, nie mit
  // einer festen Rastergröße (dieselbe Regel wie bei den Kanon-Detektoren).
  const r=Math.max(4, Math.round(w/24));
  const logS=Float32Array.from(logL);
  boxBlur(logS,w,h,r,3);
  // Startschätzung: geometrisch auf 1 zentriert, noch ohne harte Bedingungen.
  let gm=0; for(let j=0;j<n;j++) gm+=logS[j]; gm/=n;
  const est=new Float32Array(n);
  for(let j=0;j<n;j++){
    est[j]=Math.exp(logS[j]-gm);
    // Konfidenz sinkt, wo Residuum und Tiefpass weit auseinanderliegen –
    // typisch für harte Schlagschattenkanten, an denen die Zerlegung rät.
    conf[j]=Math.max(0, 1-Math.min(1, Math.abs(logL[j]-logS[j])*0.55));
  }
  // Zielmittelwert 1.0, aber niemals unter dem, was der Gamut erzwingt –
  // sonst wäre der Schnitt leer und die Iteration liefe ins Nichts.
  let ceilMean=0; for(let j=0;j<n;j++) ceilMean+=ceil[j]; ceilMean/=n;
  const target=Math.max(1.0, ceilMean);
  // Box zuerst, Mean danach; Box wird am Ende exakt nachgezogen (hart garantiert).
  const sets=[shadeBoxSet(ceil, SHADE_MAX), meanSet(target)];
  const proj=dykstraProject(est, sets, {maxIter:60, tol:1e-4, finish:[0]});
  let ms=0; for(let j=0;j<n;j++) ms+=proj.x[j];
  let cm=0; for(let j=0;j<n;j++) cm+=conf[j];
  return {shading:proj.x, conf, confidence:+(cm/n).toFixed(4),
          projection:{algorithm:'dykstra', sets:sets.map(x=>x.label),
                      iterations:proj.iterations, target:+target.toFixed(4),
                      meanShading:+(ms/n).toFixed(4),
                      meanError:proj.residual.mean, guaranteed:['box+gamut']},
          ceil};
}

// Material-Textur (Unit 8) packen: R = Shading, G = Konfidenz, B/A reserviert.
// Wird von analyze() und von window.SHADED.intrinsic.* benutzt – EIN Pfad.
// Eigene Unit statt Huckepack im Zonen-Kanal: WebGL 2 garantiert >= 16 Sampler.
function uploadMaterialTexture(){
  if(!AW||!AH) return false;
  const n=AW*AH, tM=new Uint8Array(n*4);
  const q=v=>Math.max(0,Math.min(255,Math.round(v*255)));
  for(let j=0;j<n;j++){
    tM[j*4]=q((intrinsicShading?intrinsicShading[j]:1)*0.5); // 0.5 = neutral
    tM[j*4+1]=q(intrinsicConf?intrinsicConf[j]:0);
    tM[j*4+3]=255;
  }
  uploadTex(9,TEX.material,AW,AH,tM);
  return true;
}

// Verletzt ein Shading-Feld den Albedo-Gamut? Wird für FREMDE Felder nur GEMESSEN,
// nicht korrigiert: die Hypothese eines Providers gehört dem Provider. Das eingebaute
// Backend erfüllt die Bedingung per Konstruktion (Dykstra), fremde nachweislich oft nicht.
function intrinsicGamutViolations(){
  if(!intrinsicShading||!intrinsicCeil) return null;
  let over=0, worst=0;
  for(let j=0;j<intrinsicShading.length;j++){
    const need=intrinsicCeil[j];
    if(intrinsicShading[j] < need-1e-4){
      over++;
      const alb=need/Math.max(intrinsicShading[j],1e-4);
      if(alb>worst) worst=alb;
    }
  }
  return {pixels:over, percent:+(100*over/intrinsicShading.length).toFixed(2),
          worstAlbedo:+worst.toFixed(3)};
}

// Ein neben der Szene gefundenes Shading-Feld anwenden. Läuft NACH analyze(),
// weil vorher weder Analyseauflösung noch Zonen-/Materialtextur existieren.
// Der Fund ist eine Ansage des Autors, deshalb wird die Trennung aktiviert –
// sichtbar in der Statuszeile, nie stillschweigend.
function applyPendingShading(){
  if(!pendingShading||!AW||!AH) return false;
  let sh=null;
  try{ sh=resampleShading(pendingShading.img); }catch(e){ sh=null; }
  if(!sh){ setStatus('Shading-Feld nicht lesbar – eingebautes Backend bleibt aktiv.'); return false; }
  intrinsicShading=sh;
  intrinsicConf=null;
  intrinsicProjection=null;   // fremdes Feld ist nicht Dykstra-projiziert
  intrinsicMeta={provider:'material.intrinsic.companion-file', providerVersion:'1.0.0',
                 channelSetId:'intrinsic.companion', provenance:'INFERRED',
                 colorSpace:{albedo:'sRGB', shading:'linear'}, confidence:0, accepted:false};
  intrinsicStrength=1;
  uploadMaterialTexture();
  setStatus('Shading-Feld übernommen ('+pendingShading.name+') – Licht und Material sind getrennt.');
  return true;
}

// Externes Shading-Feld eines fremden Providers auf Analyseauflösung bringen.
// Erlaubt: Image/Canvas/ImageData (8 bit, 128 = neutral) oder Zahlen-Array
// (bereits linear, 1.0 = neutral). Alles andere wird abgelehnt.
function resampleShading(src){
  if(!AW||!AH) return null;
  const n=AW*AH, out=new Float32Array(n);
  if(src instanceof Float32Array || src instanceof Float64Array || Array.isArray(src)){
    if(src.length!==n) throw new Error('intrinsic.set: shading-Array muss '+n+' Werte haben (AW*AH)');
    for(let j=0;j<n;j++) out[j]=Math.max(0.18,Math.min(2.0,src[j]));
    return out;
  }
  let data=null;
  if(typeof ImageData!=='undefined' && src instanceof ImageData && src.width===AW && src.height===AH){
    data=src.data;
  }else{
    const c=document.createElement('canvas'); c.width=AW; c.height=AH;
    const cx=c.getContext('2d',{willReadFrequently:true});
    if(typeof ImageData!=='undefined' && src instanceof ImageData){
      const tmp=document.createElement('canvas'); tmp.width=src.width; tmp.height=src.height;
      tmp.getContext('2d').putImageData(src,0,0); cx.drawImage(tmp,0,0,AW,AH);
    }else{
      cx.drawImage(src,0,0,AW,AH);   // wirft bei ungeeigneten Quellen selbst
    }
    data=cx.getImageData(0,0,AW,AH).data;
  }
  for(let j=0;j<n;j++){
    const l=(data[j*4]*0.299+data[j*4+1]*0.587+data[j*4+2]*0.114)/255;
    out[j]=Math.max(0.18,Math.min(2.0,l*2.0));   // 128 -> 1.0 (neutral)
  }
  return out;
}

function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
  if(mx===mn) return [0,0,l];
  const d=mx-mn, s=l>0.5? d/(2-mx-mn) : d/(mx+mn);
  let h= mx===r ? (g-b)/d+(g<b?6:0) : mx===g ? (b-r)/d+2 : (r-g)/d+4;
  return [h*60,s,l];
}
function hex(c){ return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]; }

// Heuristische Segmentierung eines beliebigen Szenenbildes
function classifyScenePixel(r,g,b){
  const [h,s,l]=rgbToHsl(r,g,b);
  // Explizit markierte Fenster: leuchtendes Magenta-Pink (à la #F972E9) im
  // Szenenbild = Fenster. Blütenbäume sind blasser/violetter, Blumen rötlicher.
  if(h>=295&&h<=340&&s>0.7&&l>0.45&&l<0.85) return N;
  if(s<=0.14){ if(l<0.22) return W; if(l<0.52) return K; return P; }
  if(h>=270&&h<=345) return (l>0.28&&s>0.2)? F : W;  // helle Blütenbäume vs. dunkle Konturen
  if(h>=60&&h<170)                            // Wiese vs. Kronen: Helligkeit ODER
    return (l>0.42 || (h<95&&s>0.5&&l>0.28)) ? G : F;  // satt-gelbgrüner Wiesenton
  if(h>=170&&h<205){                          // Teal: Türen/Fenster nur satt & mittelhell,
    if(s>0.28&&l>=0.14&&l<0.40) return N;     // dunkle Blaugrün-Schatten sind Laub
    return l<0.40? F : A;
  }
  if(h>=205&&h<=265){
    if(l<0.35) return F;                      // dunkelblaue Schattentöne = Laub
    return s>0.3? A : K;
  }
  // warmer Bereich
  if(l<0.24) return W;
  if(s>0.42&&l<0.62) return R;
  if(l>0.55) return P;
  return s>0.3? R : K;
}
// Gemalte Material-Map: Nearest-Neighbor gegen die kanonische Palette
const NN=[];
Object.keys(PALETTE).forEach(name=>{
  const ci=CLASSES.indexOf(name);
  PALETTE[name].forEach(hx=>NN.push([...hex(hx),ci]));
});
function classifyMapPixel(r,g,b){
  let best=1e9,bi=G;
  for(const [pr,pg,pb,ci] of NN){
    const d=(r-pr)*(r-pr)+(g-pg)*(g-pg)+(b-pb)*(b-pb);
    if(d<best){best=d;bi=ci;}
  }
  return bi;
}

function majorityFilter(grid,w,h,passes){
  const cnt=new Uint8Array(8);
  for(let p=0;p<passes;p++){
    const out=new Uint8Array(grid);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      cnt.fill(0);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) cnt[grid[(y+dy)*w+x+dx]]++;
      let bi=grid[y*w+x],bc=cnt[bi];
      for(let c=0;c<8;c++) if(cnt[c]>bc){bc=cnt[c];bi=c;}
      out[y*w+x]=bi;
    }
    grid.set(out);
  }
}
function boxBlur(src,w,h,r,passes){ // separabel, in-place-artig auf Float32Array
  let a=src, b=new Float32Array(src.length);
  for(let p=0;p<passes;p++){
    for(let y=0;y<h;y++){ // horizontal
      let acc=0; const row=y*w;
      for(let x=-r;x<=r;x++) acc+=a[row+Math.min(w-1,Math.max(0,x))];
      for(let x=0;x<w;x++){
        b[row+x]=acc/(2*r+1);
        acc+=a[row+Math.min(w-1,x+r+1)]-a[row+Math.max(0,x-r)];
      }
    }
    for(let x=0;x<w;x++){ // vertikal
      let acc=0;
      for(let y=-r;y<=r;y++) acc+=b[Math.min(h-1,Math.max(0,y))*w+x];
      for(let y=0;y<h;y++){
        a[y*w+x]=acc/(2*r+1);
        acc+=b[Math.min(h-1,y+r+1)*w+x]-b[Math.max(0,y-r)*w+x];
      }
    }
  }
  return a;
}
function chamfer(mask,w,h){ // Distanz zum Maskenrand, innerhalb mask>0.5
  const INF=1e6, d=new Float32Array(w*h);
  for(let i=0;i<w*h;i++) d[i]=mask[i]>0.5?INF:0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x; if(d[i]===0)continue;
    let m=d[i];
    if(x>0)m=Math.min(m,d[i-1]+1);
    if(y>0)m=Math.min(m,d[i-w]+1);
    if(x>0&&y>0)m=Math.min(m,d[i-w-1]+1.4);
    if(x<w-1&&y>0)m=Math.min(m,d[i-w+1]+1.4);
    d[i]=m;
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
    const i=y*w+x; if(d[i]===0)continue;
    let m=d[i];
    if(x<w-1)m=Math.min(m,d[i+1]+1);
    if(y<h-1)m=Math.min(m,d[i+w]+1);
    if(x<w-1&&y<h-1)m=Math.min(m,d[i+w+1]+1.4);
    if(x>0&&y<h-1)m=Math.min(m,d[i+w-1]+1.4);
    d[i]=m;
  }
  return d;
}

function analyze(){
  // Analyse-Auflösung: fein genug, dass Sprossenfenster-Scheiben (K3) bei
  // 1440p-Bildern nicht unter das Raster fallen. Läuft einmalig bei Erstellen.
  AW = Math.min(768, sceneImg.width);
  AH = Math.round(AW * sceneImg.height/sceneImg.width);
  zoneGrid = new Uint8Array(AW*AH);   // K1-Zonen; bleibt 0 bei Map-Modus/Landschaften
  const cv=document.createElement('canvas'); cv.width=AW; cv.height=AH;
  const cx=cv.getContext('2d',{willReadFrequently:true});

  // 1) Klassifizieren – gemalte Map hat Vorrang, sonst Heuristik aufs Szenenbild
  // Zweitbild verstehen: kanonische Material-Map ODER Szenen-Kopie mit pink
  // markierten Fenstern (Marker-Overlay). Entscheidung über Paletten-Abdeckung.
  let markerMode=false, markerWin=null, mpx=null;
  if(matImg){
    cx.drawImage(matImg,0,0,AW,AH);
    mpx = cx.getImageData(0,0,AW,AH).data;
    let hits=0,samples=0;
    for(let j=0;j<AW*AH;j+=7){
      const r=mpx[j*4],g=mpx[j*4+1],b=mpx[j*4+2];
      let best=1e9;
      for(const [pr,pg,pb] of NN){
        const d=(r-pr)*(r-pr)+(g-pg)*(g-pg)+(b-pb)*(b-pb);
        if(d<best)best=d;
      }
      if(best<3600)hits++;
      samples++;
    }
    markerMode = hits/samples < 0.5;
  }
  const useMap = !!matImg && !markerMode;
  const src = useMap ? matImg : sceneImg;
  cx.drawImage(src,0,0,AW,AH);
  const px = cx.getImageData(0,0,AW,AH).data;
  classGrid = new Uint8Array(AW*AH);
  let markerClass=null;
  if(markerMode){
    // Marker = Pixel, die sich DEUTLICH vom Ausgangsbild unterscheiden.
    // Pink = Fenster; jede andere kanonische Palettenfarbe = lokale Klassen-
    // Korrektur (z. B. Dach-Orange über einen falsch erkannten Bereich malen).
    // Unveränderte Bildteile (Blumen etc.) können nie Marker sein.
    markerWin=new Uint8Array(AW*AH);
    markerClass=new Uint8Array(AW*AH);           // 0 = kein Override, sonst Klasse+1
    for(let j=0;j<AW*AH;j++){
      const r=mpx[j*4],g=mpx[j*4+1],b=mpx[j*4+2];
      const dr=r-px[j*4],dg=g-px[j*4+1],db=b-px[j*4+2];
      if(dr*dr+dg*dg+db*db <= 3000) continue;
      if(r>150 && g<140 && (r-g)>55 && (b-g)>20){ markerWin[j]=1; continue; }
      let best=1e9,bi=-1;
      for(const [pr,pg,pb,ci] of NN){
        const d=(r-pr)*(r-pr)+(g-pg)*(g-pg)+(b-pb)*(b-pb);
        if(d<best){best=d;bi=ci;}
      }
      if(best<3600) markerClass[j]=bi+1;
    }
  }
  for(let i=0,j=0;i<px.length;i+=4,j++){
    classGrid[j] = useMap ? classifyMapPixel(px[i],px[i+1],px[i+2])
                          : classifyScenePixel(px[i],px[i+1],px[i+2]);
  }
  majorityFilter(classGrid,AW,AH,2);

  // Fenster-Plausibilität: ein Fenster ohne Gebäude drumherum ist ein Baumschatten.
  if(!useMap){
    const fixed=new Uint8Array(classGrid);
    const RAD=Math.max(4,Math.round(AW/128));  // skaliert mit Analyseauflösung
    for(let y=0;y<AH;y++)for(let x=0;x<AW;x++){
      const j=y*AW+x;
      if(classGrid[j]!==N)continue;
      if(px[j*4]>190&&px[j*4+2]>170&&px[j*4+1]<160)continue;  // Pink-Marker: unantastbar
      let veg=0,wallish=0,roofish=0;
      for(let dy=-RAD;dy<=RAD;dy++)for(let dx=-RAD;dx<=RAD;dx++){
        const yy=y+dy,xx=x+dx;
        if(yy<0||yy>=AH||xx<0||xx>=AW)continue;
        const c=classGrid[yy*AW+xx];
        if(c===G||c===F)veg++;
        else if(c===W||c===P||c===K)wallish++;
        else if(c===R)roofish++;
      }
      if(veg>(wallish+roofish)*1.4) fixed[j]=F;         // Teal im Grünen = Schattenlaub
      else if(roofish>wallish*1.3) fixed[j]=R;          // Teal-Akzent auf dem Dach = Dach
    }
    classGrid=fixed;

    // === BILDKANON K7: Himmel ist oben und inert ===
    // Flood von der Oberkante über {Wasser,Wand,Fels}-Pixel. Nur wenn die
    // Region groß, hell und BLAU-dominant ist, ist sie Himmel -> Fels-Klasse
    // (inert: kein Pfützenspiegel, kein Flussnetz, kein Sway). Sandpfade, die
    // die Oberkante berühren, sind rot-dominant und bleiben unangetastet.
    {
      const skyC=c=>c===A||c===P||c===K;
      const inSky=new Uint8Array(AW*AH), stH=[];
      for(let x=0;x<AW;x++)for(let y=0;y<2;y++){
        const j=y*AW+x;
        if(skyC(classGrid[j])&&!inSky[j]){inSky[j]=1;stH.push(j);}
      }
      const region=[];
      let sr=0,sg=0,sb=0;
      while(stH.length){
        const j=stH.pop(); region.push(j);
        sr+=px[j*4];sg+=px[j*4+1];sb+=px[j*4+2];
        const y=(j/AW)|0,x=j%AW;
        if(x>0&&skyC(classGrid[j-1])&&!inSky[j-1]){inSky[j-1]=1;stH.push(j-1);}
        if(x<AW-1&&skyC(classGrid[j+1])&&!inSky[j+1]){inSky[j+1]=1;stH.push(j+1);}
        if(y>0&&skyC(classGrid[j-AW])&&!inSky[j-AW]){inSky[j-AW]=1;stH.push(j-AW);}
        if(y<AH-1&&skyC(classGrid[j+AW])&&!inSky[j+AW]){inSky[j+AW]=1;stH.push(j+AW);}
      }
      skyGrid=new Uint8Array(AW*AH);
      skyRegionFound=false;
      if(region.length>AW*AH*0.02){
        sr/=region.length; sg/=region.length; sb/=region.length;
        const lum=(sr*0.299+sg*0.587+sb*0.114);
        if(sb>sr && lum>110){ region.forEach(j=>{classGrid[j]=K; skyGrid[j]=1;}); skyRegionFound=true; }
      }
    }

    // Fenster-Formlimits: gelten für Detektor UND finale Validierung (nach den Zonen).
    // minArea=2: Sprossenfenster (K3) zerfallen am Analyseraster in 2-3-px-
    // Scheiben. Präzision liefern Farbtor + K1-Zonenbeleg, nicht die Größe.
    const minArea=2, maxArea=Math.max(60, AW*AH*0.004);
    const maxBW=AW*0.08, maxBH=AH*0.14;

    if(!markerMode){
    // === BILDKANON K3/K4 (docs/bildkanon.md): Fenster = geschlossener Holzrahmen
    // mit Nicht-Holz-Füllung. Die Füllung darf ALLES sein – Blauglas (Wasser-
    // klassifiziert), Grauglas (Fels/Wand), warm erleuchtet (Dach-farbig) oder
    // dunkel. Entscheidend ist allein der Holzring. Glas ohne Rahmen = nie
    // Fenster (ersetzt Dunkel-Blob- und Scheiben-Detektor vollständig).
    {
      // Fensterglas ist im Kanon dunkles, sattes Blau – das klassifiziert die
      // Farb-Heuristik als Laub/Holz und es ginge als Füllung verloren. Deshalb
      // zählt zur Füllung auch jedes roh-blaue Pixel, egal welche Klasse.
      const rawBlue=j=>{const r=px[j*4],g=px[j*4+1],b=px[j*4+2];
        return b>g && b>r+15 && b-Math.min(r,g)>30;};
      const FILLJ=j=>{const c=classGrid[j];
        return c===K||c===P||c===A||c===R||((c===F||c===W)&&rawBlue(j));};
      const seenFr=new Uint8Array(AW*AH), stFr=[];
      for(let s0=0;s0<AW*AH;s0++){
        if(!FILLJ(s0)||seenFr[s0])continue;
        stFr.length=0; stFr.push(s0); seenFr[s0]=1;
        const blob=[];
        let touchBorder=false;
        while(stFr.length){
          const j=stFr.pop(); blob.push(j);
          const y=(j/AW)|0,x=j%AW;
          if(x===0||x===AW-1||y===0||y===AH-1)touchBorder=true;
          if(x>0&&FILLJ(j-1)&&!seenFr[j-1]){seenFr[j-1]=1;stFr.push(j-1);}
          if(x<AW-1&&FILLJ(j+1)&&!seenFr[j+1]){seenFr[j+1]=1;stFr.push(j+1);}
          if(y>0&&FILLJ(j-AW)&&!seenFr[j-AW]){seenFr[j-AW]=1;stFr.push(j-AW);}
          if(y<AH-1&&FILLJ(j+AW)&&!seenFr[j+AW]){seenFr[j+AW]=1;stFr.push(j+AW);}
        }
        if(touchBorder)continue;                       // Randflächen sind nie Fenster
        if(blob.length<minArea||blob.length>maxArea)continue;
        let x0=1e9,x1=-1,y0v=1e9,y1v=-1;
        blob.forEach(j=>{const y=(j/AW)|0,x=j%AW;
          if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0v)y0v=y;if(y>y1v)y1v=y;});
        const bw=x1-x0+1,bh=y1v-y0v+1;
        if(bw/bh<0.28||bw/bh>3.5||blob.length/(bw*bh)<0.45)continue;
        if(bw>maxBW||bh>maxBH)continue;
        // Direktring (1 px um den Blob): Holzanteil entscheidet
        const inBlob=new Set(blob);
        let ring=0,wood=0,ringLum=0;
        for(const j of blob){
          const y=(j/AW)|0,x=j%AW;
          for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){
            const xx=x+dx,yy=y+dy;
            if(xx<0||xx>=AW||yy<0||yy>=AH)continue;
            const nj=yy*AW+xx;
            if(inBlob.has(nj))continue;
            ring++;
            if(classGrid[nj]===W){wood++;
              ringLum+=px[nj*4]*0.299+px[nj*4+1]*0.587+px[nj*4+2]*0.114;}
          }
        }
        if(!(ring>0 && wood>=ring*0.55))continue;
        // K3/K6: Ein HOLZrahmen ist braun (mittelhell) – fast schwarze Ringe
        // sind Stil-Konturen (um Felsreflexe, Astlöcher), keine Rahmen.
        if(ringLum/wood < 45)continue;
        // K3/K4-Farbtor gegen das Gefach-Paradox: Putzfelder sind ebenfalls
        // holzgerahmt! Fensterfüllung ist sattes Blauglas ODER hell-sattes
        // Warmlicht. Bewusst KEIN "einfach dunkel"-Tor: das griff jede
        // Schattenritze zwischen Planken/Ziegeln und jedes Astloch ab –
        // Putz (Sat ~90), Terracotta (Lum ~110) und Steine (Sat <35) liegen
        // alle außerhalb dieser beiden Tore.
        let fr2=0,fg2=0,fb2=0;
        blob.forEach(j=>{fr2+=px[j*4];fg2+=px[j*4+1];fb2+=px[j*4+2];});
        fr2/=blob.length;fg2/=blob.length;fb2/=blob.length;
        const fLum=fr2*0.299+fg2*0.587+fb2*0.114;
        const fSat=Math.max(fr2,fg2,fb2)-Math.min(fr2,fg2,fb2);
        const windowLike=(fb2>fg2 && fb2>fr2+15 && fSat>35)       // Blauglas
                      || (fr2>fb2 && fSat>120 && fLum>120);       // warm erleuchtet
        if(windowLike) blob.forEach(j=>classGrid[j]=N);
      }
    }

    // (Die finale Fenster-Validierung läuft NACH Struktur-Pass und Zonen-Pass –
    //  sie braucht die Gebäudezonen als K1-Beleg.)
    } // Ende !markerMode (Heuristik-Fensterdetektoren)

    // === STRUKTUR-PASS (Runde 5, Inkrement 1): Bodenanker ===
    // Begehbare Flächen müssen am Boden verankert sein. Eine Pfad-Komponente,
    // deren Umfeld (Ring, Konturholz neutral) von Dach dominiert wird und die
    // kaum Gras-/Wasserkontakt hat, ist eine Gebäudeoberfläche (Terrasse,
    // Balkon, Vordach) -> Fels. Erst dadurch bleiben Pfützen-Chamfer,
    // Flussfeld und Bleed dem ECHTEN Boden vorbehalten.
    structDiag = {pathComponents:0, pathToRock:0, pathToRockPx:0, roofToPath:0, roofToPathPx:0,
                  zones:0, zonePx:0};
    // Mindest-Komponentengröße: die Anker beurteilen FLÄCHEN (Terrassen,
    // Terracotta-Wege), keine Sprenkel. Bei feinem Raster zerhacken Konturen
    // den Boden in hunderte Mini-Fragmente, deren Adjazenzringe von lokalen
    // Sprenkeln dominiert werden – die kaskadierten sonst zu Fels.
    const minStruct = Math.max(24, Math.round(AW*AH*0.0002));

    // Balken-Dichte (K1) früh berechnen: W wird von den Ankern nie verändert.
    // Unterscheidet Fassaden-Putz (balkengerahmt, wInd hoch) von freiem
    // Pfad (wInd niedrig) – für Dach-Anker UND Zonen-Wachstum.
    const wInd=new Float32Array(AW*AH);
    for(let j=0;j<AW*AH;j++) wInd[j]=classGrid[j]===W?1:0;
    boxBlur(wInd,AW,AH,2,1);

    // === Geschützter Boden (K7), VOR den Ankern ===
    // Bodenverankerte P-/K-Komponenten (Gras-/Wasserkontakt) sind Boden-
    // Wahrheit: Dach-Anker nutzt sie als Bodenbeweis (Terracotta-Pfadstücke
    // mitten im Weg!), der Zonen-Pass als Tabu-Fläche.
    const mainPath=new Uint8Array(AW*AH);
    {
      const seenP=new Uint8Array(AW*AH), stP=[];
      for(let s0=0;s0<AW*AH;s0++){
        if(classGrid[s0]!==P||seenP[s0])continue;
        stP.length=0; stP.push(s0); seenP[s0]=1;
        const comp=[];
        let groundAdj=0;
        while(stP.length){
          const j=stP.pop(); comp.push(j);
          const y=(j/AW)|0,x=j%AW;
          for(const d of [[-1,0],[1,0],[0,-1],[0,1]]){
            const xx=x+d[0],yy=y+d[1];
            if(xx<0||xx>=AW||yy<0||yy>=AH)continue;
            const nj=yy*AW+xx;
            const c=classGrid[nj];
            if(c===P){ if(!seenP[nj]){seenP[nj]=1;stP.push(nj);} }
            else if(c===G||c===A)groundAdj++;
          }
        }
        if(groundAdj>=3 && groundAdj>=comp.length*0.08)
          comp.forEach(j=>mainPath[j]=1);
      }
      // Fels: Steine IM Boden (Kontakt zu Gras/Wasser/geschütztem Pfad) sind
      // Trittsteine, keine Gebäude. Gebäude-Steinwände haben relativ zur
      // Fläche kaum Bodenkontakt und bleiben unmarkiert.
      const seenK=new Uint8Array(AW*AH);
      for(let s0=0;s0<AW*AH;s0++){
        if(classGrid[s0]!==K||seenK[s0])continue;
        stP.length=0; stP.push(s0); seenK[s0]=1;
        const comp=[];
        let groundAdj=0;
        while(stP.length){
          const j=stP.pop(); comp.push(j);
          const y=(j/AW)|0,x=j%AW;
          for(const d of [[-1,0],[1,0],[0,-1],[0,1]]){
            const xx=x+d[0],yy=y+d[1];
            if(xx<0||xx>=AW||yy<0||yy>=AH)continue;
            const nj=yy*AW+xx;
            const c=classGrid[nj];
            if(c===K){ if(!seenK[nj]){seenK[nj]=1;stP.push(nj);} }
            else if(c===G||c===A||(c===P&&mainPath[nj]))groundAdj++;
          }
        }
        if(groundAdj>=3 && groundAdj>=comp.length*0.08)
          comp.forEach(j=>mainPath[j]=1);   // mainPath = "geschützter Boden"
      }
    }

    // Dach-Anker (Kanon K2/K7): Eine "Dach"-Komponente, deren Umfeld gras-
    // dominiert und fensterlos ist, hängt an keinem Gebäude – das ist Boden
    // (Terracotta-Pfad, der farblich in die Dachregel fiel). Bäume (F) zählen
    // NICHT als Bodenbeweis: Wälder überhängen echte Dächer.
    {
      const seenR=new Uint8Array(AW*AH), stR=[];
      for(let s0=0;s0<AW*AH;s0++){
        if(classGrid[s0]!==R||seenR[s0])continue;
        stR.length=0; stR.push(s0); seenR[s0]=1;
        const blob=[];
        while(stR.length){
          const j=stR.pop(); blob.push(j);
          const y=(j/AW)|0,x=j%AW;
          if(x>0&&classGrid[j-1]===R&&!seenR[j-1]){seenR[j-1]=1;stR.push(j-1);}
          if(x<AW-1&&classGrid[j+1]===R&&!seenR[j+1]){seenR[j+1]=1;stR.push(j+1);}
          if(y>0&&classGrid[j-AW]===R&&!seenR[j-AW]){seenR[j-AW]=1;stR.push(j-AW);}
          if(y<AH-1&&classGrid[j+AW]===R&&!seenR[j+AW]){seenR[j+AW]=1;stR.push(j+AW);}
        }
        // Adjazenz-Ring: nur DIREKTE Nachbarn zählen (BBox-Ringe lügen bei
        // langgestreckten Formen). Konturen (W) sind neutral, 2 px tief schauen.
        const inB=new Set(blob);
        let ground=0,winC=0,pfad=0,prot=0,pfadFrei=0,nonW=0;
        for(const j of blob){
          const y=(j/AW)|0,x=j%AW;
          for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-2,0],[2,0],[0,-2],[0,2]]){
            const xx=x+dx,yy=y+dy;
            if(xx<0||xx>=AW||yy<0||yy>=AH)continue;
            const nj=yy*AW+xx;
            if(inB.has(nj))continue;
            const c=classGrid[nj];
            if(c===W||c===R)continue;
            nonW++;
            if(c===G||c===A)ground++;
            else if(c===N)winC++;
            else if(mainPath[nj])prot++;           // geschützter Boden (P UND K)
            else if(c===P){ if(wInd[nj]<0.18)pfadFrei++; else pfad++; }
          }
        }
        // Große Komponente: gras-geerdet ODER von geschütztem Boden dominiert
        // (Terracotta-Pfadstücke MITTEN im Weg sehen kein Gras, aber lauter
        // bodenverankerten Pfad) -> Boden. Sprenkel (< minStruct) IM Pfad
        // werden absorbiert, damit sie dem Bodenanker nicht als "Gebäude"-
        // Beweis erscheinen.
        // Bodenbeweis: Gras/Wasser direkt, geschützter Boden, oder balkenFREIE
        // P-Flächen (offener Pfad; Fassaden-Putz ist balkengerahmt und zählt
        // NICHT). Fenster-Nullregel (K1/K8): Dach mit Fenstern = IMMER Gebäude.
        // Putz-Veto (K1): grenzt das "Dach" an balkengerahmten Putz, steht
        // darunter eine Fachwerk-Fassade - das ist ein Haus, kein Pfad.
        // Zwei Konvertierungs-Äste:
        // - Gras-Ast (>45% Gras/Wasser) mit Pfad-Kontext-Pflicht (>=15%),
        //   sonst fielen freistehende Schuppen/Pavillons im Gras.
        // - Pfad-Kontext-Ast: Terracotta-Stücke MITTEN im Weg sehen wenig
        //   Gras, aber ihr Umfeld ist SELBST dominant Boden/offener Pfad
        //   (>=35% allein, >=55% mit Gras). Hausdächer über sparsam
        //   bebalktem Putz erreichen die 35% nicht (gemessen: 29% vs. 43%).
        const grounded = blob.length>=minStruct
          ? (nonW>10 && winC===0 && ground>=nonW*0.05 && pfad<nonW*0.10 &&
             ( (ground>nonW*0.45 && prot+pfadFrei>=nonW*0.15) ||
               (prot+pfadFrei>nonW*0.35 && ground+prot+pfadFrei>nonW*0.55) ))
          : (nonW>4 && ground+pfadFrei+prot>nonW*0.6 && winC===0);
        if(grounded){
          blob.forEach(j=>{classGrid[j]=P; mainPath[j]=1;}); // konvertiert = Boden
          structDiag.roofToPath++;
          structDiag.roofToPathPx+=blob.length;
        }
      }
    }
    {
      const seenS=new Uint8Array(AW*AH), stS=[];
      for(let s0=0;s0<AW*AH;s0++){
        if(classGrid[s0]!==P||seenS[s0])continue;
        stS.length=0; stS.push(s0); seenS[s0]=1;
        const blob=[];
        while(stS.length){
          const j=stS.pop(); blob.push(j);
          const y=(j/AW)|0,x=j%AW;
          if(x>0&&classGrid[j-1]===P&&!seenS[j-1]){seenS[j-1]=1;stS.push(j-1);}
          if(x<AW-1&&classGrid[j+1]===P&&!seenS[j+1]){seenS[j+1]=1;stS.push(j+1);}
          if(y>0&&classGrid[j-AW]===P&&!seenS[j-AW]){seenS[j-AW]=1;stS.push(j-AW);}
          if(y<AH-1&&classGrid[j+AW]===P&&!seenS[j+AW]){seenS[j+AW]=1;stS.push(j+AW);}
        }
        structDiag.pathComponents++;
        const inBp=new Set(blob);
        let ground=0,building=0,nonW=0;
        for(const j of blob){
          const y=(j/AW)|0,x=j%AW;
          for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-2,0],[2,0],[0,-2],[0,2]]){
            const xx=x+dx,yy=y+dy;
            if(xx<0||xx>=AW||yy<0||yy>=AH)continue;
            const nj=yy*AW+xx;
            if(inBp.has(nj))continue;
            const c=classGrid[nj];
            if(c===W||c===P)continue;              // Konturen neutral, P eigene Klasse
            nonW++;
            if(c===G||c===A)ground++;
            else if(c===R)building++;
          }
        }
        // Terrassen-Semantik: dach-dominiert und praktisch OHNE Bodenkontakt.
        // Nur echte Flächen beurteilen – Mini-Fragmente nie zu Fels kaskadieren.
        if(blob.length>=minStruct && nonW>8 && building>nonW*0.40 && ground<nonW*0.08){
          blob.forEach(j=>classGrid[j]=K);
          structDiag.pathToRock++;
          structDiag.pathToRockPx+=blob.length;
        }
      }
    }

    // === BILDKANON K1: Fachwerk-Signatur -> Gebäudezonen ===
    // Saat = echte Dachkomponenten (nach den Ankern!). Die Zone wächst per
    // beschränkter Dilation die Fassade hinunter: über Holz/Fels/Fenster frei,
    // über P-Flächen nur mit Balken-Beleg (Fachwerk = Balken AUF Putz, K1) –
    // sonst liefe die Zone den grasgesäumten Bodenpfad entlang. Gras/Wasser/
    // Laub stoppen. Wachstumsbudget ~ 1.5x Dachhöhe (Perspektive: Fassade
    // unter dem Dach), skaliert mit der Auflösung.
    {
      // (wInd = Balken-Dichte wurde vor den Ankern berechnet)
      // K7-Schutz: das vor den Ankern berechnete mainPath ("geschützter
      // Boden", inkl. der vom Dach-Anker konvertierten Flächen) ist tabu –
      // sonst wandert die Zone an Zäunen/Trittsteinen entlang den Dorfpfad
      // hinunter. Decks/Putzfelder sind nicht geschützt und bleiben zonierbar.
      const seenZ=new Uint8Array(AW*AH), stZ=[];
      for(let s0=0;s0<AW*AH;s0++){
        if(classGrid[s0]!==R||seenZ[s0])continue;
        stZ.length=0; stZ.push(s0); seenZ[s0]=1;
        const blob=[];
        let zy0=1e9,zy1=-1;
        while(stZ.length){
          const j=stZ.pop(); blob.push(j);
          const y=(j/AW)|0,x=j%AW;
          if(y<zy0)zy0=y; if(y>zy1)zy1=y;
          if(x>0&&classGrid[j-1]===R&&!seenZ[j-1]){seenZ[j-1]=1;stZ.push(j-1);}
          if(x<AW-1&&classGrid[j+1]===R&&!seenZ[j+1]){seenZ[j+1]=1;stZ.push(j+1);}
          if(y>0&&classGrid[j-AW]===R&&!seenZ[j-AW]){seenZ[j-AW]=1;stZ.push(j-AW);}
          if(y<AH-1&&classGrid[j+AW]===R&&!seenZ[j+AW]){seenZ[j+AW]=1;stZ.push(j+AW);}
        }
        if(blob.length<minStruct)continue;      // Sprenkel bilden keine Gebäude
        // Terracotta-Steine IM Pfad sind dach-farbig, aber kein Gebäude:
        // wenn der Ring von geschütztem Boden dominiert wird, nicht säen.
        {
          const inS=new Set(blob);
          let ring=0,mp=0;
          for(const j of blob){
            const y=(j/AW)|0,x=j%AW;
            for(const d of [[-1,0],[1,0],[0,-1],[0,1]]){
              const xx=x+d[0],yy=y+d[1];
              if(xx<0||xx>=AW||yy<0||yy>=AH)continue;
              const nj=yy*AW+xx;
              if(inS.has(nj)||classGrid[nj]===W)continue;
              ring++; if(mainPath[nj])mp++;
            }
          }
          if(ring>0 && mp>ring*0.4)continue;
        }
        structDiag.zones++;
        const grow=Math.max(Math.round(AH*0.03), Math.round((zy1-zy0+1)*1.5));
        let frontier=[];
        for(const j of blob){ if(!zoneGrid[j]){zoneGrid[j]=1; frontier.push(j);} }
        for(let step=0; step<grow && frontier.length; step++){
          const next=[];
          for(const j of frontier){
            const y=(j/AW)|0,x=j%AW;
            for(const d of [[-1,0],[1,0],[0,-1],[0,1]]){
              const xx=x+d[0],yy=y+d[1];
              if(xx<0||xx>=AW||yy<0||yy>=AH)continue;
              const nj=yy*AW+xx;
              if(zoneGrid[nj])continue;
              const c=classGrid[nj];
              if(mainPath[nj])continue;        // geschützter Boden ist nie Gebäude
              if(!(c===W||c===K||c===N||c===R||(c===P&&wInd[nj]>=0.18)))continue;
              zoneGrid[nj]=1; next.push(nj);
            }
          }
          frontier=next;
        }
      }
      for(let j=0;j<AW*AH;j++) structDiag.zonePx+=zoneGrid[j];
    }

    // Finale Fenster-Validierung (nur Heuristik-Modus): JEDES Licht muss wie
    // ein Fenster geformt sein. Wo Gebäudezonen existieren, ist der Zonen-
    // Beleg das Kriterium (K1: Fenster sitzen in Fachwerk-Fassaden) und
    // ersetzt die Klassen-Votings; ohne Zonen (reine Landschaften) bleibt
    // das bisherige Wand-Voting als Fallback.
    if(!markerMode){
    const zonesExist = structDiag.zonePx > AW*AH*0.01;
    const seenN=new Uint8Array(AW*AH), st=[];
    for(let s0=0;s0<AW*AH;s0++){
      if(classGrid[s0]!==N||seenN[s0])continue;
      st.length=0; st.push(s0); seenN[s0]=1;
      const blob=[];
      while(st.length){
        const j=st.pop(); blob.push(j);
        const y=(j/AW)|0,x=j%AW;
        if(x>0&&classGrid[j-1]===N&&!seenN[j-1]){seenN[j-1]=1;st.push(j-1);}
        if(x<AW-1&&classGrid[j+1]===N&&!seenN[j+1]){seenN[j+1]=1;st.push(j+1);}
        if(y>0&&classGrid[j-AW]===N&&!seenN[j-AW]){seenN[j-AW]=1;st.push(j-AW);}
        if(y<AH-1&&classGrid[j+AW]===N&&!seenN[j+AW]){seenN[j+AW]=1;st.push(j+AW);}
      }
      let x0=1e9,x1=-1,y0v=1e9,y1v=-1,cx=0,cy=0;
      blob.forEach(j=>{const y=(j/AW)|0,x=j%AW;cx+=x;cy+=y;
        if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0v)y0v=y;if(y>y1v)y1v=y;});
      cx=Math.round(cx/blob.length);cy=Math.round(cy/blob.length);
      const bw=x1-x0+1,bh=y1v-y0v+1;
      const okShape = blob.length>=2 && blob.length<=maxArea &&
        bw/bh>=0.3 && bw/bh<=3.2 && blob.length/(bw*bh)>=0.4 &&
        bw<=maxBW && bh<=maxBH;
      // Umfeldradius skaliert mit Analyseauflösung UND Blobgröße: bei großen
      // Perspektiv-Fenstern muss das Prüffenster über den Rahmen hinausreichen,
      // sonst sieht es nur Glas und Holz. Fensterzellen zählen nicht als Umfeld.
      const RADV=Math.max(6,Math.round(AW/85))+(Math.max(bw,bh)>>1);
      let veg=0,wall=0,roof=0,wood=0,wat=0,cells=0,zn=0,cellsZ=0;
      for(let dy=-RADV;dy<=RADV;dy++)for(let dx=-RADV;dx<=RADV;dx++){
        const yy=cy+dy,xx=cx+dx;
        if(yy<0||yy>=AH||xx<0||xx>=AW)continue;
        const j2=yy*AW+xx;
        cellsZ++; if(zoneGrid[j2])zn++;
        const c=classGrid[j2];
        if(c===N)continue;
        cells++;
        if(c===G||c===F)veg++;
        else if(c===P||c===K)wall++;
        else if(c===W)wood++;
        else if(c===R)roof++;
        else if(c===A)wat++;
      }
      // Explizite Pink-Marker (#F972E9-artig) sind eine Nutzer-Ansage –
      // die Heuristik-Validierung hat hier kein Veto. Anteil reicht: auch wenn
      // der Marker mit einem erkannten Dunkel-Fenster zu EINEM Blob verschmilzt.
      let pinkN=0;
      blob.forEach(j=>{ if(px[j*4]>190&&px[j*4+2]>170&&px[j*4+1]<160) pinkN++; });
      const explicitPink = pinkN > blob.length*0.25;
      const wsc=wall+wood*0.7;
      // Wasser-Veto: Fenster sitzen in Fassaden, nie im Fluss – Sonnenglitzer
      // auf Wasser sind kein Warmlicht (K4 sinngemäß).
      const belegt = wat<cells*0.1 && (zonesExist
        ? zn > cellsZ*0.4                                   // K1-Zonen-Beleg
        : (wall>=cells*0.06 && wsc>veg*0.4 && wsc>roof*0.6 && wsc>=cells*0.07));
      if(!explicitPink && !(okShape && belegt))
        blob.forEach(j=>classGrid[j]=K);
    }
    }

    // Marker-Overlay: Pink SIND die Fenster – exakt, ohne Heuristik-Veto;
    // andere Palettenfarben korrigieren die Klasse lokal. Heuristik-Fenster
    // ohne Marker fliegen (der Nutzer hat die Fenster ja vollständig markiert).
    if(markerMode){
      for(let j=0;j<AW*AH;j++){
        if(markerWin[j]) classGrid[j]=N;
        else if(markerClass[j]) classGrid[j]=markerClass[j]-1;
        else if(classGrid[j]===N) classGrid[j]=K;
      }
    }
  }

  // 2) Weiche Masken (leichtes Blur = Anti-Aliasing an Materialgrenzen)
  const m={}; CLASSES.forEach((_,c)=>m[c]=new Float32Array(AW*AH));
  for(let j=0;j<classGrid.length;j++) m[classGrid[j]][j]=1;
  CLASSES.forEach((_,c)=>boxBlur(m[c],AW,AH,1,1));

  // 3) Abgeleitete Karten
  const pathHard=new Float32Array(AW*AH);
  const rockHard=new Float32Array(AW*AH);
  for(let j=0;j<classGrid.length;j++){
    pathHard[j]= classGrid[j]===P?1:0;
    rockHard[j]= classGrid[j]===K?1:0;
  }
  const dPath = chamfer(pathHard,AW,AH);                // Pfad-Distanz (phys.a)
  const scale = Math.max(6, AW/60);                     // "Senken"-Tiefe relativ zur Pfadbreite
  // Hohlwasser: Depressionstiefe für PFAD- UND FELS-Senken. Chamfer-Distanz zum
  // Maskenrand, auf der vereinten Pfad/Fels-Maske, damit Wasser in beiden
  // Materialien glaubwürdig in den Kuhlen sammelt (eine Material-Wahrheit).
  const depMask=new Float32Array(AW*AH);
  for(let j=0;j<classGrid.length;j++) depMask[j]= pathHard[j]||rockHard[j];
  const dDep = chamfer(depMask,AW,AH);
  const depthMap=new Float32Array(AW*AH);
  for(let j=0;j<AW*AH;j++) depthMap[j]=Math.pow(Math.min(1,dDep[j]/scale),0.8);

  const pathBlur=Float32Array.from(pathHard); boxBlur(pathBlur,AW,AH,Math.round(scale*0.9),3);
  const bleed=new Float32Array(AW*AH);                  // Wasser blutet in Grasränder aus
  for(let j=0;j<AW*AH;j++) bleed[j]=Math.min(1,Math.max(0,pathBlur[j]-pathHard[j])*2.2);

  // Flussfeld: Tangente des geblurrten Pfads, Fluss zeigt „hangabwärts“ (Bild-unten)
  const flow=new Float32Array(AW*AH);
  for(let y=0;y<AH;y++)for(let x=0;x<AW;x++){
    const j=y*AW+x;
    const gx=pathBlur[y*AW+Math.min(AW-1,x+1)]-pathBlur[y*AW+Math.max(0,x-1)];
    const gy=pathBlur[Math.min(AH-1,y+1)*AW+x]-pathBlur[Math.max(0,y-1)*AW+x];
    let tx=-gy, ty=gx;
    if(ty<0){tx=-tx;ty=-ty;}
    const len=Math.hypot(tx,ty);
    let angle = len<1e-4 ? Math.PI/2 : Math.atan2(ty,tx);
    if(angle<0)angle+=Math.PI*2;
    flow[j]=angle/(Math.PI*2);
  }

  // 4) Emissiv: Fenster warm einfärben, zweistufig weichzeichnen -> Glow
  const eR=new Float32Array(AW*AH), eG=new Float32Array(AW*AH), eB=new Float32Array(AW*AH);
  const sharpWin=new Float32Array(AW*AH);
  cx.drawImage(sceneImg,0,0,AW,AH);
  const spx = cx.getImageData(0,0,AW,AH).data;
  for(let j=0;j<AW*AH;j++){
    if(classGrid[j]===N){
      const lm=0.6+0.4*(spx[j*4]*0.299+spx[j*4+1]*0.587+spx[j*4+2]*0.114)/255;
      eR[j]=1.0*lm; eG[j]=0.72*lm; eB[j]=0.34*lm; sharpWin[j]=1;
    }
  }
  // Mittlere Grasfarbe der Szene messen -> Überwucherung wächst im Ton DIESER Welt
  let gaR=0,gaG=0,gaB=0,gaN=0;
  for(let j=0;j<AW*AH;j++) if(classGrid[j]===G){ gaR+=spx[j*4];gaG+=spx[j*4+1];gaB+=spx[j*4+2];gaN++; }
  if(gaN>50) gl.uniform3f(U.u_grassAvg, gaR/gaN/255*0.9, gaG/gaN/255*0.95, gaB/gaN/255*0.85);

  const gR1=Float32Array.from(eR),gG1=Float32Array.from(eG),gB1=Float32Array.from(eB);
  boxBlur(gR1,AW,AH,4,3);boxBlur(gG1,AW,AH,4,3);boxBlur(gB1,AW,AH,4,3);
  boxBlur(eR,AW,AH,14,3);boxBlur(eG,AW,AH,14,3);boxBlur(eB,AW,AH,14,3);
  // Energie-Normalisierung: große Leuchtflächen (gemalte Türen) dürfen nicht
  // heller strahlen als kleine Fenster – Glow relativ zur lokalen Dichte dämpfen.
  const wd1=Float32Array.from(sharpWin); boxBlur(wd1,AW,AH,4,3);
  const wd2=Float32Array.from(sharpWin); boxBlur(wd2,AW,AH,14,3);
  for(let j=0;j<AW*AH;j++){
    const n1=Math.min(1.4, 0.30/(0.16+wd1[j]));
    const n2=Math.min(1.4, 0.30/(0.16+wd2[j]));
    gR1[j]*=n1; gG1[j]*=n1; gB1[j]*=n1;
    eR[j]*=n2;  eG[j]*=n2;  eB[j]*=n2;
  }
  boxBlur(sharpWin,AW,AH,1,1);

  // K1-Zonen weich (Blur = sanfter Übergang an der Traufkante)
  const zoneSoft=new Float32Array(AW*AH);
  for(let j=0;j<AW*AH;j++) zoneSoft[j]=zoneGrid[j];
  boxBlur(zoneSoft,AW,AH,2,2);

  // Materialschicht: Beleuchtung schätzen. Läuft NACH der Klassifikation und
  // schreibt ausschließlich in die Beleuchtungskanäle – nie in classGrid.
  intrinsicBase=decomposeIntrinsicBaseline(spx,AW,AH);
  intrinsicShading=intrinsicBase.shading;
  intrinsicConf=intrinsicBase.conf;
  intrinsicCeil=intrinsicBase.ceil;
  intrinsicProjection=intrinsicBase.projection;
  intrinsicMeta={...INTRINSIC_BASELINE, confidence:intrinsicBase.confidence, accepted:false};

  // 5) In Texturen packen
  const tA=new Uint8Array(AW*AH*4), tB=new Uint8Array(AW*AH*4),
        tP=new Uint8Array(AW*AH*4), tE=new Uint8Array(AW*AH*4),
        tZ=new Uint8Array(AW*AH*4);
  const q=v=>Math.max(0,Math.min(255,Math.round(v*255)));
  for(let j=0;j<AW*AH;j++){
    tA[j*4]=q(m[G][j]); tA[j*4+1]=q(m[F][j]); tA[j*4+2]=q(m[R][j]); tA[j*4+3]=q(m[P][j]);
    tB[j*4]=q(m[W][j]); tB[j*4+1]=q(m[N][j]); tB[j*4+2]=q(m[A][j]); tB[j*4+3]=q(m[K][j]);
    tP[j*4]=q(depthMap[j]); tP[j*4+1]=q(flow[j]); tP[j*4+2]=q(bleed[j]); tP[j*4+3]=q(Math.min(1,dPath[j]/scale));
    tE[j*4]=q(gR1[j]*0.85+eR[j]*0.6); tE[j*4+1]=q(gG1[j]*0.85+eG[j]*0.6);
    tE[j*4+2]=q(gB1[j]*0.85+eB[j]*0.6); tE[j*4+3]=q(sharpWin[j]);
    tZ[j*4]=q(zoneSoft[j]); tZ[j*4+3]=255;
  }
  uploadTex(1,TEX.maskA,AW,AH,tA);
  uploadTex(2,TEX.maskB,AW,AH,tB);
  uploadTex(3,TEX.phys,AW,AH,tP);
  uploadTex(4,TEX.emis,AW,AH,tE);
  uploadTex(7,TEX.zone,AW,AH,tZ);
  uploadMaterialTexture();
  ready=true;
  applyPendingShading();   // ueberschreibt das eingebaute Backend, wenn ein Feld daneben lag
}

// CPU-Materialabfrage – identische Wahrheit wie die GPU-Masken (für Runde 2–4)
function getMaterialTypeAt(u,v){
  if(!classGrid) return null;
  const x=Math.max(0,Math.min(AW-1,Math.floor(u*AW)));
  const y=Math.max(0,Math.min(AH-1,Math.floor(v*AH)));
  return CLASSES[classGrid[y*AW+x]];
}

// =========================== Storyboard ====================
let storyboard=[], playing=false, stepIdx=0, stepT=0, blendFrom=null;
const CUR={...PARAMS};    // gerenderte (geblendete) Werte

function defaultStoryboard(){
  storyboard = [
    {name:'🌅 Dunkel → Hell Übergang', dur:3, p:{...ACTS.morgen.p, dayNight:0.95, storm:0.08, rain:0, wet:0.70}}, // Nacht-Start
    {name:'☀️ Goldener Tag',    dur:2,  p:{...ACTS.tag.p}},
    {name:'🌤️ Sturm zieht auf', dur:4,  p:{...ACTS.aufzug.p}},
    {name:'⛈️ Sturmnacht',      dur:5,  p:{...ACTS.sturmnacht.p}},
    {name:'⚡ Blitz schlägt ein',dur:2,  p:{...ACTS.blitz.p}},
    {name:'🔥 Haus brennt',      dur:3,  p:{...ACTS.blitz.p, glow:1.0, decay:0.30, temperature:0.8}},
    {name:'💧 Regen löscht es',  dur:2,  p:{...ACTS.sturmnacht.p, glow:0.5, decay:0.15, temperature:0.50}},
    {name:'❄️ Wasser gefriert',  dur:2,  p:{...ACTS.gefroren.p}},
    {name:'⛄ Schnee fällt',      dur:3,  p:{...ACTS.schnee_dicke.p}},
    // Jahreszeiten im Schnelldurchlauf
    {name:'🌸 Frühjahr wacht auf',dur:2, p:{...ACTS.fruehling.p}},
    {name:'☀️ Sommer erblüht',    dur:1.5, p:{...ACTS.sommer.p}},
    {name:'🍂 Herbst golden',     dur:1.5, p:{...ACTS.herbst.p}},
    // Verfall zeigt Zeit-Passage
    {name:'🕸️ Jahre verstreichen', dur:4, p:{...ACTS.verfall.p}},
    {name:'✨ Der Tag danach',    dur:3,  p:{...ACTS.danach.p}}
  ];
  renderStory();
}
function yearStoryboard(){
  storyboard = [
    {name:'Frühlingsmorgen', dur:8,  p:{...ACTS.fruehling.p}},
    {name:'Hochsommer',      dur:8,  p:{...ACTS.tag.p, temperature:0.85}},
    {name:'Goldener Herbst', dur:9,  p:{...ACTS.herbst.p}},
    {name:'Herbststurm-Nacht',dur:11,p:{...ACTS.sturmnacht.p, autumn:0.7, temperature:0.5}},
    {name:'Erster Schnee',   dur:11, p:{...ACTS.schnee.p}},
    {name:'Tauwetter',       dur:9,  p:{...DEFAULTS, dayNight:0.12, storm:0.2, wet:0.8, puddle:0.7,
                                        fog:0.5, wind:0.35, glow:0.2, snow:0.25, temperature:0.56}}
  ];
  renderStory();
}
function dramaStoryboard(){
  // 20-Sekunden Weltgesetze-Spektakel: Sturm + Blitz + Feuer + Verfall + Schnee
  storyboard = [
    {name:'🌤️ Klarer Moment',         dur:1.5, p:{...ACTS.tag.p}},
    {name:'💨 Wind erhebt sich',       dur:2,   p:{dayNight:0.2, storm:0.3, rain:0.05, wet:0.1, puddle:0.05, fog:0.08, wind:0.85, glow:0.15, decay:0.15, temperature:0.65, autumn:0.4}},
    {name:'⛈️ Extreme Turbulenzen',    dur:2.5, p:{dayNight:0.75, storm:1, rain:0.9, wet:0.9, puddle:0.85, fog:0.35, wind:1, glow:0.8, decay:0.3, temperature:0.4, bleach:1}},
    {name:'⚡ Blitz-Angriff',          dur:1.5, p:{dayNight:1, storm:1, rain:1, wet:1, puddle:0.95, fog:0.25, wind:1, glow:1, decay:0.25, temperature:0.35, flash:1}},
    {name:'🔥 Feuer entfacht',         dur:1.5, p:{dayNight:0.9, storm:0.7, rain:0.5, wet:0.6, puddle:0.7, fog:0.2, wind:0.8, glow:1, decay:0.4, temperature:0.9}},
    {name:'💧 Regen schlägt zurück',   dur:2,   p:{dayNight:1, storm:1, rain:1, wet:1, puddle:0.9, fog:0.45, wind:0.9, glow:0.6, decay:0.35, temperature:0.45}},
    {name:'🧊 Blitzschneller Verfall',  dur:2.5, p:{dayNight:0.8, storm:0.6, rain:0.2, wet:0.3, puddle:0.25, fog:0.22, wind:0.6, glow:0.05, decay:1, temperature:0.15, snow:0.5, snowfall:0.4}},
    {name:'❄️ Winterstille',           dur:2.5, p:{dayNight:0.5, storm:0.15, rain:0, wet:0.2, puddle:0.15, fog:0.12, wind:0.2, glow:0.08, decay:0.8, temperature:-0.1, snow:1, snowfall:0.3}},
    {name:'✨ Hoffnungsstrahl',         dur:2.5, p:{dayNight:0.1, storm:0.05, rain:0, wet:0.1, puddle:0.05, fog:0.06, wind:0.15, glow:0.2, decay:0.6, temperature:0.5, snow:0.1, snowfall:0.02, bloom:0.3}}
  ];
  storyboard.forEach(s => {s.p = {...DEFAULTS, ...s.p};});
  renderStory();
}
function showcaseStoryboard(){
  // 90-Sekunden-Regie: nicht nur "ein Bild mit Filter", sondern eine
  // lesbare Kette aus Weltgesetzen. Jeder Schritt beantwortet: Was kann SHADED?
  storyboard = [
    {name:'🎬 Aus einem Bild erwacht eine Bühne', dur:7, p:{...ACTS.morgen.p, dayNight:0.86, storm:0.05, rain:0, wet:0.62, puddle:0.45, fog:0.42, wind:0.22, glow:0.75}},
    {name:'☀️ Materialtreue: Holz, Dach, Gras, Wasser', dur:8, p:{...ACTS.tag.p, wet:0.08, puddle:0.06, bloom:0.18}},
    {name:'🌬️ Atmosphäre bewegt sich, ohne das Bild zu brechen', dur:8, p:{...ACTS.aufzug.p, rain:0.08, wet:0.25, puddle:0.16, fog:0.22, wind:0.95}},
    {name:'🌧️ Regen verändert Pfade und Grasränder visuell', dur:10, p:{...ACTS.aufzug.p, rain:0.78, wet:0.82, puddle:0.72, fog:0.30, wind:0.80, glow:0.55}},
    {name:'⛈️ Nacht: Fenster spiegeln warm in Pfützen', dur:10, p:{...ACTS.sturmnacht.p, puddle:0.96, fog:0.36}},
    {name:'⚡ Blitz zeigt Volumen, Kanten und nasse Dächer', dur:5, p:{...ACTS.blitz.p, flash:1, puddle:0.98}},
    {name:'🔥 Ereignisse hinterlassen Brand, Rauch und Wärme', dur:8, p:{...ACTS.blitz.p, rain:0.35, wet:0.55, fog:0.28, glow:1, decay:0.32, temperature:0.92}},
    {name:'🐾 Figuren betreten dieselbe Welt und machen Spuren', dur:8, p:{...ACTS.morgen.p, rain:0.10, wet:0.62, puddle:0.50, fog:0.24, wind:0.45, glow:0.55}},
    {name:'🍂 Zeit vergeht: Herbst, Müdigkeit, Patina', dur:8, p:{...ACTS.herbst.p, wet:0.38, puddle:0.24, decay:0.48}},
    {name:'❄️ Klima kippt: Schnee deckt Material, Atem wird sichtbar', dur:8, p:{...ACTS.schnee_dicke.p, fog:0.32, glow:0.62}},
    {name:'🌸 Welt heilt: Frühling wächst über alte Spuren', dur:8, p:{...ACTS.fruehling.p, wet:0.26, puddle:0.12, bloom:1, decay:0.20}},
    {name:'✨ Der Beweis: Das Ausgangsbild lebt weiter', dur:10, p:{...ACTS.danach.p, wet:0.78, puddle:0.60, bloom:0.16, fog:0.04}}
  ];
  storyboard.forEach(s => {s.p = {...DEFAULTS, ...s.p};});
  renderStory();
}
function renderStory(){
  const list=document.getElementById('story-list'); list.innerHTML='';
  storyboard.forEach((s,i)=>{
    const el=document.createElement('div');
    el.className='story-step'; el.id='step-'+i;
    el.innerHTML=`<div class="row"><input type="text" value="${s.name}">
      <input type="number" step="0.5" min="0.5" value="${s.dur}"><span>s</span></div>
      <div class="row"><button data-a="cap">💾</button><button data-a="pre">👁</button>
      <button data-a="up">▲</button><button data-a="dn">▼</button><button data-a="del">❌</button></div>
      <div class="bar"><div id="bar-${i}"></div></div>`;
    el.querySelector('input[type=text]').onchange=e=>s.name=e.target.value;
    el.querySelector('input[type=number]').onchange=e=>s.dur=Math.max(0.5,+e.target.value||4);
    el.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      const a=b.dataset.a;
      if(a==='cap'){s.p={...PARAMS}; setStatus('Zustand in „'+s.name+'“ gespeichert.');}
      if(a==='pre'){stopStory(); Object.assign(PARAMS,s.p); syncSliders();}
      if(a==='del'){storyboard.splice(i,1); renderStory();}
      if(a==='up'&&i>0){[storyboard[i-1],storyboard[i]]=[storyboard[i],storyboard[i-1]];renderStory();}
      if(a==='dn'&&i<storyboard.length-1){[storyboard[i+1],storyboard[i]]=[storyboard[i],storyboard[i+1]];renderStory();}
    });
    list.appendChild(el);
  });
}
function playStory(){
  if(storyboard.length<1) return;
  playing=true; stepIdx=0; stepT=0; blendFrom={...CUR};
  document.getElementById('btn-play').textContent='⏹ Stoppen';
  document.getElementById('btn-play').classList.add('active');
}
function stopStory(){
  playing=false;
  actBlend=null;
  document.getElementById('btn-play').textContent='▶ Abspielen';
  document.getElementById('btn-play').classList.remove('active');
  document.querySelectorAll('.story-step').forEach(e=>e.classList.remove('playing'));
}
function tickStory(dt){
  if(!playing||!storyboard.length) return;
  const step=storyboard[stepIdx];
  stepT+=dt;
  const blendDur=Math.min(3.5, step.dur*0.55);
  const k=Math.min(1, stepT/blendDur);
  const e=k*k*(3-2*k);   // smoothstep
  for(const key in PARAMS){
    const from = blendFrom[key]!==undefined ? blendFrom[key] : DEFAULTS[key];
    const to   = step.p[key]  !==undefined ? step.p[key]   : DEFAULTS[key];
    CUR[key]=from+(to-from)*e;
  }
  // animierte Parameter: fahren linear über die GESAMTE Schrittdauer (z. B. Zeitraffer)
  if(step.animate) for(const ak in step.animate){
    const a=step.animate[ak];
    CUR[ak]=a.from+(a.to-a.from)*Math.min(1, stepT/step.dur);
  }
  document.querySelectorAll('.story-step').forEach((el,i)=>el.classList.toggle('playing',i===stepIdx));
  const bar=document.getElementById('bar-'+stepIdx);
  if(bar) bar.style.width=Math.min(100,stepT/step.dur*100)+'%';
  if(stepT>=step.dur){
    if(bar) bar.style.width='0%';
    stepT=0; blendFrom={...CUR}; stepIdx++;
    if(stepIdx>=storyboard.length){
      if(document.getElementById('cb-loop').checked) stepIdx=0;
      else { stopStory(); Object.assign(PARAMS,CUR); syncSliders(); }
    }
  }
}

// =========================== Blitze ====================
let flashPulses=[];  // Zeitstempel
let nextFlashAt=0;
function tickLightning(t){
  if(timeFrozen){ flashPulses.length=0; nextFlashAt=t+1; return 0; }  // deterministische Frames
  const storm=CUR.storm*CUR.dayNight;
  if(storm>0.45){
    if(nextFlashAt===0) nextFlashAt=t+1.5+Math.random()*4;
    if(t>=nextFlashAt){
      flashPulses.push(t, t+0.10+Math.random()*0.12);   // Doppelschlag
      nextFlashAt=t + (2.5+Math.random()*6)/Math.max(0.3,storm);
    }
  } else nextFlashAt=0;
  let f=0;
  flashPulses=flashPulses.filter(p=>t-p<0.6);
  for(const p of flashPulses) if(t>=p) f=Math.max(f,Math.exp(-(t-p)*9));
  return Math.min(1,f)*storm;
}

// =========================== Runde 4: Spieler, Feuer, Ökosystem ====================
const ov=document.getElementById('ov');
const ovx=ov.getContext('2d');

const player={active:false,u:0.5,v:0.6,vu:0,vv:0,exert:0,wet:0,age:0,
               breathT:0,stampAcc:0,dashT:0,dashCd:0,lookX:0,lookY:0,
               carryMud:0,carryAsh:0};
const keys={};
const MAT_SPEED={path:1.0,grass:0.75,rock:0.85,wood:0.9,foliage:0.6,water:0.45,window:0.9,roof:0.9};

function spawnPlayer(){
  if(player.active||!ready)return;
  // nächstes Pfad-Pixel zur Bildmitte suchen
  let best=1e9,bu=0.5,bv=0.6;
  for(let y=0;y<AH;y+=2)for(let x=0;x<AW;x+=2){
    if(classGrid[y*AW+x]!==P)continue;
    const du=x/AW-0.5, dv=y/AH-0.55, d=du*du+dv*dv;
    if(d<best){best=d;bu=x/AW;bv=y/AH;}
  }
  player.u=bu; player.v=bv; player.active=true;
  setStatus('🚶 Figur erwacht. WASD laufen · Leertaste Sprint · F Feuer.');
}
function dash(){
  if(!player.active||player.dashCd>0)return;
  player.dashT=0.25; player.dashCd=1.1; player.exert=Math.min(1,player.exert+0.5);
  trailStamp(player.u,player.v,0.05,1,0.9);           // Impuls: Laub & Vegetation stieben
  window.SHADED_ENGINE_INTERNAL.stirLeavesNear?.(player.u,player.v,0.09,0.06);
  // Früchte fallen von nahen Kronen
  for(let tries=0,drops=0;tries<24&&drops<2;tries++){
    const ru=player.u+(Math.random()-0.5)*0.12, rv=player.v+(Math.random()-0.5)*0.12;
    if(getMaterialTypeAt(ru,rv)==='foliage'){
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
  const mat=getMaterialTypeAt(player.u,player.v)||'path';
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
    const mat=getMaterialTypeAt(player.u,player.v)||'path';
    const onSnow = CUR.snow>0.05 && (mat==='grass'||mat==='foliage'||mat==='roof'||mat==='rock'||mat==='path');
    const onAsh  = trailSample(player.u,player.v).a>0.15;        // steht auf Brand/Asche
    const wet = CUR.wet>0.4 || mat==='water';
    // Kontamination an den Schuhen: Schlamm aus Nässe, Asche von Brandstellen
    if(wet && (mat==='path'||mat==='grass'||mat==='water')) player.mud=Math.min(1,player.mud+0.25);
    else player.mud=Math.max(0,player.mud-dt*0.4);
    player.ash = onAsh?1:Math.max(0,player.ash-dt*0.6);
    // (R) frische Delle – tief auf Schnee, leicht auf Stein/Holz
    let rStr=0.7, rRad=0.007;
    if(onSnow){ rStr=1.0; rRad=0.010; }
    else if(mat==='rock'||mat==='wood'){ rStr=0.4; rRad=0.006; }
    trailStamp(player.u,player.v+0.006,rRad,0,rStr);
    // (B) permanenter Trampelpfad – Basis wie Runde 4 (sichtbar & beständig)
    trailStamp(player.u,player.v+0.006,0.009,2,0.045,235);
    // #2 Übertragung: Schuhe nehmen Schlamm/Asche auf und tragen sie weiter
    if(player.carryMud>0.05){
      trailStamp(player.u,player.v+0.006,0.010,2,0.05*player.carryMud,235); // braune Lehmbahn
      player.carryMud=Math.max(0,player.carryMud-0.35);
    }
    if(player.carryAsh>0.05){
      trailStamp(player.u,player.v+0.006,0.011,3,0.10*player.carryAsh);    // schwarze Asche-Schleppspur
      player.carryAsh=Math.max(0,player.carryAsh-0.30);
    }
  }
  // #2 Aufnahme: nasser Boden -> Schlamm an den Schuhen; verkohlter Boden -> Asche
  if(CUR.wet>0.25 && (mat==='grass'||mat==='foliage'||mat==='path'))
    player.carryMud=Math.min(1,player.carryMud+dt*0.5*CUR.wet*(moving?1:0.2));
  const localChar=trailSample(player.u,player.v).a;
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
  if(!ready)return false;
  if(wild){ const m=getMaterialTypeAt(u,v); if(m!=='wood'&&m!=='roof'&&m!=='foliage')return false; }
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
    trailStamp(f.u,f.v,f.size*(0.8+0.4*(1-f.fuel/f.max)),3,0.55*dt);
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
const fireArr=new Float32Array(32);
function fireUniforms(){
  fireArr.fill(0);
  fires.forEach((f,i)=>{
    const p=Math.min(1,f.fuel/f.max);
    fireArr[i*4]=f.u; fireArr[i*4+1]=f.v;
    fireArr[i*4+2]=(0.35+0.65*p);
    fireArr[i*4+3]=f.size*(2.6+p);
  });
  gl.uniform4fv(U['u_fires[0]'],fireArr);
  gl.uniform1f(U.u_fireCount,fires.length);
}

// === Weather-/Ökosystem-Partikel — extrahiert nach runtime/weather-particles.mjs ===
// (eigenes ESM-Modul: initEco, spawnElementParticles, ecoTick, snowDepthAt/snowTick,
// rainTick, hailTick und ihr Anteil an der Overlay-Zeichnung. Hängt window.SHADED_ENGINE_INTERNAL.
// {initEco,spawnElementParticles,weatherTick,weatherDrawBeforeFire,weatherDrawAfterFire} nach
// dem Laden dieser Datei an; siehe dort für die vollständige Implementierung.)

// --- Overlay-Rendering (deckungsgleich über dem GL-Canvas) ---
function drawOverlay(dt){
  const W=ov.width,H=ov.height;
  ovx.clearRect(0,0,W,H);
  if(!ready)return;
  const S=W/1400;  // Größenreferenz
  // runtime/weather-particles.mjs zeichnet Laub/Früchte VOR den Flammen — Reihenfolge
  // muss für identisches Layering erhalten bleiben (siehe Kommentar dort).
  window.SHADED_ENGINE_INTERNAL.weatherDrawBeforeFire?.();
  fires.forEach(f=>{
    const p=Math.min(1,f.fuel/f.max), fx=f.u*W, fy=f.v*H;
    for(let k=0;k<5;k++){
      const hgt=(16+Math.sin(time*11+f.seed+k*2.2)*6)*S*p;
      const wdt=(4+Math.sin(time*9+k)*1.5)*S*p;
      const ox=Math.sin(time*7+k*1.9+f.seed)*4*S*p;
      const g=ovx.createLinearGradient(fx+ox,fy,fx+ox,fy-hgt);
      g.addColorStop(0,'rgba(255,120,20,0.9)');g.addColorStop(0.6,'rgba(255,60,30,0.75)');g.addColorStop(1,'rgba(255,220,90,0.15)');
      ovx.fillStyle=g;
      ovx.beginPath();
      ovx.moveTo(fx+ox-wdt,fy); ovx.quadraticCurveTo(fx+ox,fy-hgt,fx+ox+wdt,fy);
      ovx.fill();
    }
  });
  window.SHADED_ENGINE_INTERNAL.weatherDrawAfterFire?.();
  ovx.globalAlpha=1;
  if(player.active) drawPlayer(W,H,S,dt);
  // SWIFT-Actor-Bridge (runtime/actor-bridge.mjs) registriert diesen Hook nach dem Laden;
  // guard nötig, weil drawOverlay theoretisch vor dem ersten rAF nie ohne geladenes Modul
  // läuft, aber der Zugriff soll trotzdem nie hart gegen ein fehlendes Modul knallen.
  window.SHADED_ENGINE_INTERNAL.drawActors?.(dt);
}
function drawPlayer(W,H,S,dt){
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

// === SWIFT-Actor-Bridge — extrahiert nach runtime/actor-bridge.mjs ===
// (eigenes ESM-Modul, hängt window.SHADED.addActor und den internen
// window.SHADED_ENGINE_INTERNAL.drawActors-Hook nach dem Laden dieser Datei an;
// siehe dort für die vollständige Implementierung und Begründung der Extraktion.)

// --- Ökosystem-Manager: Runde 7 Ökosystem-Integration ---
const ecosystemDefs={
  cats:[
    {x:0.2, y:0.6, scale:0.8, anim:'walk', depthLayer:'mid'},
    {x:0.5, y:0.65, scale:1.0, anim:'rest_idle', depthLayer:'mid'},
    {x:0.8, y:0.7, scale:0.9, anim:'eat_cycle', depthLayer:'back'},
    {x:0.3, y:0.5, scale:0.7, anim:'walk_stretchy', depthLayer:'mid'},
  ],
  gaime_enemies:[
    {x:0.15, y:0.55, scale:1.8, anim:'depth_cycle', depthLayer:'mid', isTestActor:true},
    {x:0.35, y:0.65, scale:2.2, anim:'depth_cycle', depthLayer:'mid', isTestActor:true},
    {x:0.65, y:0.6, scale:1.8, anim:'depth_cycle', depthLayer:'back', isTestActor:true},
  ],
  gaime_npcs:[
    {x:0.2, y:0.6, scale:2.8, anim:'depth_cycle', depthLayer:'mid', isTestActor:true},
    {x:0.5, y:0.65, scale:2.8, anim:'depth_cycle', depthLayer:'mid', isTestActor:true},
    {x:0.75, y:0.7, scale:2.3, anim:'depth_cycle', depthLayer:'back', isTestActor:true},
    {x:0.3, y:0.5, scale:2.3, anim:'depth_cycle', depthLayer:'mid', isTestActor:true},
  ],
  gaime_heroes:[
    {x:0.25, y:0.6, scale:2.3, anim:'depth_cycle', depthLayer:'front', isTestActor:true},
    {x:0.55, y:0.65, scale:2.3, anim:'depth_cycle', depthLayer:'mid', isTestActor:true},
    {x:0.75, y:0.58, scale:2.3, anim:'depth_cycle', depthLayer:'mid', isTestActor:true},
  ],
  test_depth:[
    {x:0.5, y:0.55, scale:2.0, anim:'depth_cycle', depthLayer:'mid', isDepthTest:true}
  ]
};
let ecosystemHandles=[];
async function spawnEcosystem(type){
  ecosystemHandles.forEach(h=>h.remove());
  ecosystemHandles=[];
  if(!type||!ecosystemDefs[type])return;

  const defs=ecosystemDefs[type];
  const isAnimated=defs[0]?.anim; // True if defs have anim (sprite-sheets)
  const isDepthTest=defs[0]?.isDepthTest; // Special handling for depth test
  const isTestActor=defs[0]?.isTestActor; // Fallback: use test-depth-actor instead of GAIME assets

  if(isTestActor){
    // Fallback für GAIME-Assets: nutze test_depth_actor Sprites (lokale Test-Fixture)
    const manifest=await fetch('tools/test_depth_actor/manifest.json').then(r=>r.json());
    const img=new Image();
    const depthImg=new Image();
    let loadCount=0;
    const checkReady=()=>{
      loadCount++;
      if(loadCount===2){
        defs.forEach((config,idx)=>{
          const h=window.SHADED.addActor({
            image:img,
            manifest:manifest,
            depthImage:depthImg,
            x:config.x,
            y:config.y,
            scale:config.scale,
            anim:config.anim||'depth_cycle',
            depthLayer:config.depthLayer
          });
          ecosystemHandles.push(h);
        });
        setStatus(`✅ Ökosystem geladen: ${type} mit Tiefentest-Sprites (${ecosystemHandles.length} Figuren)`);
      }
    };
    img.onload=checkReady;
    depthImg.onload=checkReady;
    img.src='tools/test_depth_actor/sprite.png';
    depthImg.src='tools/test_depth_actor/sprite_depth.png';
  } else if(isDepthTest){
    // Phase B2: Test Depth-Actor mit Manifest v1.4.0
    const manifest=await fetch('tools/test_depth_actor/manifest.json').then(r=>r.json());
    const img=new Image();
    const depthImg=new Image();
    let loadCount=0;
    const checkReady=()=>{
      loadCount++;
      if(loadCount===2){ // Both RGB and Depth images loaded
        defs.forEach((config,idx)=>{
          const h=window.SHADED.addActor({
            image:img,
            manifest:manifest,
            depthImage:depthImg,
            x:config.x,
            y:config.y,
            scale:config.scale,
            anim:config.anim,
            depthLayer:config.depthLayer
          });
          ecosystemHandles.push(h);
        });
        setStatus(`✅ Phase B2 Test: ${type} mit Depth-Map geladen (${ecosystemHandles.length} Figuren)`);
      }
    };
    img.onload=checkReady;
    depthImg.onload=checkReady;
    img.src='tools/test_depth_actor/sprite.png';
    depthImg.src='tools/test_depth_actor/sprite_depth.png';
  } else if(isAnimated){
    // Sprite-Sheet mit Animationen (z.B. Katzen)
    const manifest=await fetch('tools/verify-test-actor.json').then(r=>r.json());
    const img=new Image();
    img.onload=()=>{
      defs.forEach((config,idx)=>{
        const h=window.SHADED.addActor({
          image:img,
          manifest:manifest,
          x:config.x,
          y:config.y,
          scale:config.scale,
          anim:config.anim,
          depthLayer:config.depthLayer
        });
        ecosystemHandles.push(h);
      });
      setStatus(`✅ Ökosystem geladen: ${type} (${ecosystemHandles.length} Figuren)`);
    };
    img.src='tools/verify-test-actor.png';
  } else {
    // Einzelne statische Bilder (z.B. GAIME-Assets)
    defs.forEach((config,idx)=>{
      const img=new Image();
      img.onload=()=>{
        const h=window.SHADED.addActor({
          image:img,
          x:config.x,
          y:config.y,
          scale:config.scale,
          depthLayer:config.depthLayer
        });
        ecosystemHandles.push(h);
        if(ecosystemHandles.length===defs.length){
          setStatus(`✅ Ökosystem geladen: ${type} (${ecosystemHandles.length} Figuren)`);
        }
      };
      img.src=config.img;
    });
  }
}

// --- Eingaben (Runde 4) ---
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){
    keys[k]=true;
    if(!player.active&&ready) spawnPlayer();
    if(player.active) e.preventDefault();
  }
  if(k===' '&&player.active&&!window.SHADED.dialogue.isPlaying()){ e.preventDefault(); dash(); }
  if(k==='f'&&player.active){ igniteFire(player.u+0.012*(player.lookX||1), player.v); }
});
window.addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });

// --- Runde 8: Wally-Monokel — Tasten 1..5 schalten die Inspektions-Linsen (Klak.) ---
window.addEventListener('keydown',e=>{
  if(['1','2','3','4','5'].includes(e.key)){
    lensState = (lensState===Number(e.key)) ? 0 : Number(e.key);   // erneutes Drücken schaltet aus
    setStatus(lensState ? `🔎 Linse ${lensState} aktiv.` : '🔎 Linse aus.');
  }
});

document.getElementById('btn-fire').onclick=()=>{
  fireToolActive=!fireToolActive;
  ov.classList.toggle('firetool',fireToolActive);
  const b=document.getElementById('btn-fire');
  b.classList.toggle('active',fireToolActive);
  b.textContent=fireToolActive?'🔥 Klicke in die Szene':'🔥 Feuer-Tool';
};
ov.addEventListener('click',e=>{
  if(!fireToolActive||!ready)return;
  const r=ov.getBoundingClientRect();       // CSS-Box -> UV (Prototyp-Bug Nr. 8!)
  const u=(e.clientX-r.left)/r.width, v=(e.clientY-r.top)/r.height;
  if(igniteFire(u,v)) setStatus('🔥 Feuer entzündet ('+(getMaterialTypeAt(u,v)||'?')+').');
});
document.getElementById('btn-clear-world').onclick=()=>{
  trailClear(); fires.length=0; window.SHADED_ENGINE_INTERNAL.clearElementParticles?.();
  Object.keys(elementBurst).forEach(k=>elementBurst[k]=0);
  setStatus('🧹 Spuren, Matsch und Brandflecken entfernt.');
};

function ensureElementScene(){
  if(!ready){ setStatus('⚠️ Erst Bild laden und „Erstellen“ drücken – dann simulieren die Elemente auf den analysierten Materialien.'); return false; }
  stopStory(); stopShowcase();
  return true;
}
function elementPreset(kind){
  if(!ensureElementScene()) return;
  const apply=p=>{ Object.assign(PARAMS,{...PARAMS,...p}); Object.assign(CUR,{...CUR,...p}); syncSliders(); };
  const burst=p=>Object.assign(elementBurst,{...elementBurst,...p});
  const center={u:player.active?player.u:0.5, v:player.active?player.v:0.62};
  if(kind==='fluid'){
    burst({wet:1,pressure:0.45});
    apply({rain:0.72, wet:1, puddle:0.96, fog:0.20, storm:0.55, wind:0.45, temperature:0.58});
    for(let i=0;i<28;i++) trailStamp(0.18+Math.random()*0.64,0.58+Math.random()*0.30,0.014,0,0.35);
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('pressure',0.50,0.72,5);
    setStatus('💧 Flüssigkeit: Pfützenfüllstand, Rinnsale, nasse Grasränder und Druckringe aktiv.');
  } else if(kind==='steam'){
    burst({wet:0.45,heat:0.85});
    apply({rain:0.05, wet:0.55, puddle:0.45, fog:0.46, wind:0.35, temperature:0.94, glow:0.45});
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('steam',center.u,center.v,28);
    igniteFire(center.u,center.v);
    setStatus('♨️ Dampf: heiße nasse Oberfläche erzeugt aufsteigende, windgetriebene Nebelpuffs.');
  } else if(kind==='pressure'){
    burst({pressure:1,wet:0.35});
    apply({wet:0.75, puddle:0.70, rain:0.18, fog:0.10, wind:0.25});
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('pressure',center.u,center.v,16);
    soundStamp(center.u,center.v,1);
    setStatus('🫧 Druck: konzentrische Impulswellen, Sound-Feld und Dellen in derselben Welt.');
  } else if(kind==='heat'){
    burst({heat:1,ash:0.35});
    apply({temperature:1, wet:0.18, rain:0, fog:0.16, glow:0.75, storm:0.08, wind:0.28});
    igniteFire(center.u,center.v);
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('steam',center.u,center.v,8);
    setStatus('🔥 Hitze: Feuerlicht, Wärmeflimmern, Trocknung und Funken.');
  } else if(kind==='mud'){
    burst({wet:0.8,pressure:0.35});
    apply({rain:0.28, wet:0.92, puddle:0.68, fog:0.16, wind:0.20, temperature:0.55});
    for(let i=0;i<38;i++) trailStamp(0.16+Math.random()*0.68,0.58+Math.random()*0.34,0.018,2,0.15,235);
    if(!player.active) spawnPlayer();
    setStatus('🟤 Matsch: permanente Trampelpfad-/Schlammspur im Trail-Kanal, durch Regen glänzend.');
  } else if(kind==='ice'){
    burst({wet:0.65,hail:0.35,pressure:0.25});
    apply({temperature:0.08, snow:0.18, snowfall:0.05, wet:0.95, puddle:0.86, rain:0.06, fog:0.32, dayNight:0.56, glow:0.65});
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('pressure',center.u,center.v,4);
    setStatus('🧊 Eis: Pfützen gefrieren, Reflexionen werden matt, Bewegung wird glatter/gefährlicher.');
  } else if(kind==='snow'){
    burst({hail:0.22,wet:0.25});
    apply({temperature:0.14, snow:0.92, snowfall:0.88, rain:0, wet:0.28, puddle:0.36, fog:0.28, wind:0.38, glow:0.48});
    setStatus('❄️ Schnee: fallende und liegende Flocken mit Tiefenvarianz und Schmelzlogik.');
  } else if(kind==='fire'){
    burst({heat:1,ash:0.7});
    apply({temperature:0.88, rain:0, wet:0.12, fog:0.14, wind:0.35, glow:0.95, dayNight:0.72});
    for(let i=0;i<4;i++) igniteFire(center.u+(Math.random()-0.5)*0.12,center.v+(Math.random()-0.5)*0.08);
    setStatus('🔥 Feuer: Brennstoff, Brandspur, Funken, Rauch und Wet-Dousing laufen zusammen.');
  } else if(kind==='smoke'){
    burst({ash:0.7,heat:0.25});
    apply({fog:0.72, wind:0.42, storm:0.24, rain:0.06, wet:0.20, temperature:0.72, glow:0.50});
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('smoke',center.u,center.v,24);
    setStatus('🌫️ Rauch: Schichtung, Winddrift und Nebelkopplung.');
  } else if(kind==='ember'){
    burst({heat:0.95,ash:1});
    apply({temperature:0.82, rain:0, wet:0.06, fog:0.10, glow:1, dayNight:0.86, wind:0.25});
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('ember',center.u,center.v,46);
    trailStamp(center.u,center.v,0.045,3,0.8);
    setStatus('🪵 Glut: glühende Partikel plus bleibende Brandwärme im Trail-A-Kanal.');
  } else if(kind==='lava'){
    burst({heat:1,lava:1,ash:0.8});
    apply({temperature:1, rain:0, wet:0.22, puddle:0.22, fog:0.28, glow:1, dayNight:0.88, wind:0.18, decay:0.35});
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('lava',center.u,center.v,20);
    setStatus('🌋 Lava: zäh fließende heiße Flecken, Glut, Brandspur und Dampf bei Nässe.');
  } else if(kind==='rain'){
    burst({wet:1,pressure:0.45});
    apply({rain:1, wet:1, puddle:0.92, storm:0.92, fog:0.35, wind:0.86, dayNight:0.76, glow:0.80});
    setStatus('🌧️ Regen: Tiefenregen, Dachablauf, Ringe, Rinnsale und warme Nassreflexe.');
  } else if(kind==='hail'){
    burst({hail:1,pressure:0.8,wet:0.55});
    apply({rain:0.95, wet:0.85, puddle:0.72, storm:1, fog:0.22, wind:0.76, temperature:0.20, snow:0.22});
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('hail',0.5,0,45);
    setStatus('🧊 Hagel: harte Körner fallen mit Tiefe, prallen ab und stempeln Druck/Dellen.');
  } else if(kind==='leaves'){
    burst({pressure:0.18});
    apply({autumn:1, wind:0.92, storm:0.30, rain:0.04, wet:0.12, fog:0.10, temperature:0.52});
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('leaves',0.5,0,70);
    setStatus('🍂 Blätter: Wirbel, Settle-Zonen, Aufwirbeln durch Sturm und Spieler.');
  } else if(kind==='lightning'){
    burst({pressure:1,heat:0.6,wet:0.6,hail:0.35});
    apply({dayNight:1, storm:1, rain:0.86, wet:0.94, puddle:0.88, fog:0.28, wind:1, glow:1});
    flashPulses.push(time,time+0.10,time+0.22);
    window.SHADED_ENGINE_INTERNAL.spawnElementParticles('pressure',0.50,0.55,10);
    soundStamp(0.50,0.55,1);
    setStatus('⚡ Blitze: Doppelschlag, Kameraruck, Druckwelle und Licht auf nassen Flächen.');
  }
}
document.querySelectorAll('[data-element]').forEach(b=>b.onclick=()=>elementPreset(b.dataset.element));
document.getElementById('btn-elements-clear').onclick=()=>{
  if(!ready) return;
  trailClear(); fires.length=0; window.SHADED_ENGINE_INTERNAL.clearElementParticles?.();
  Object.keys(elementBurst).forEach(k=>elementBurst[k]=0);
  setStatus('🧼 Element-Partikel, Druckringe, Lava, Hagel, Feuer und Spuren zurückgesetzt.');
};

// =========================== UI ====================
const setStatus=s=>document.getElementById('status').textContent=s;

const slidersDiv=document.getElementById('sliders');
PARAM_META.forEach(([key,label])=>{
  if(key==='snow'){
    const h=document.createElement('div');
    h.style.cssText='font-size:9px;color:#7dd3fc;letter-spacing:1.5px;text-transform:uppercase;margin:10px 0 2px;border-top:1px solid #23233a;padding-top:8px';
    h.textContent='Klima & Jahreszeit';
    slidersDiv.appendChild(h);
  }
  const d=document.createElement('div'); d.className='c';
  d.innerHTML=`<label>${label}<span class="v" id="v-${key}">${PARAMS[key].toFixed(2)}</span></label>
    <input type="range" id="s-${key}" min="0" max="100" value="${Math.round(PARAMS[key]*100)}">`;
  slidersDiv.appendChild(d);
  d.querySelector('input').oninput=e=>{
    stopStory();
    PARAMS[key]=+e.target.value/100;
    CUR[key]=PARAMS[key];
    document.getElementById('v-'+key).textContent=PARAMS[key].toFixed(2);
  };
});
function syncSliders(){
  PARAM_META.forEach(([key])=>{
    document.getElementById('s-'+key).value=Math.round(PARAMS[key]*100);
    document.getElementById('v-'+key).textContent=PARAMS[key].toFixed(2);
  });
}

document.querySelectorAll('.acts button').forEach(b=>{
  b.onclick=()=>{ applyAct(b.dataset.act); };
});
function applyAct(id,instant){
  const act=ACTS[id]; if(!act)return;
  stopStory();
  if(instant){ Object.assign(PARAMS,act.p); Object.assign(CUR,act.p); }
  else { blendFrom={...CUR}; storyboard.length&&0; Object.assign(PARAMS,act.p);
         playing=false; actBlend={from:{...CUR},to:{...act.p},t:0}; }
  syncSliders();
  setStatus('Akt: '+act.label);
}
let actBlend=null;
function tickActBlend(dt){
  if(!actBlend)return;
  actBlend.t+=dt;
  const k=Math.min(1,actBlend.t/2.2), e=k*k*(3-2*k);
  for(const key in PARAMS) CUR[key]=actBlend.from[key]+(actBlend.to[key]-actBlend.from[key])*e;
  if(k>=1) actBlend=null;
}

const showcaseCard=document.getElementById('showcase-card');
const SHOWCASE_BEATS=[
  {t:0, title:'Ein Bild wird Welt.', copy:'SHADED lädt nur ein flaches Bild – und baut daraus Materialmasken, Lichtquellen, Senken, Flussfelder und Tiefe.'},
  {t:7, title:'Material ist die Wahrheit.', copy:'Dach, Holz, Gras, Fenster und Wasser bleiben dieselbe CPU/GPU-Wahrheit. Kein zweiter Klassifikator, kein Trick-Fork.'},
  {t:15, title:'Atmosphäre bewegt die Szene.', copy:'Wind, Nebel, Belichtung und Parallaxe lassen die Vorlage atmen, statt sie als statischen Screenshot zu behandeln.'},
  {t:23, title:'Regen folgt Regeln.', copy:'Wasser sammelt sich in Pfadsenken, blutet in Grasränder und läuft von Dächern ab – sichtbar, aber bildtreu.'},
  {t:33, title:'Nacht erzählt mit Licht.', copy:'Fenster glühen, spiegeln warm in Pfützen und geben der Szene einen lesbaren filmischen Fokus.'},
  {t:43, title:'Ereignisse haben Konsequenzen.', copy:'Blitz, Feuer, Rauch, Nässe und Temperatur verändern die Weltzustände statt nur Overlays einzublenden.'},
  {t:51, title:'Figuren gehören zur Welt.', copy:'Akteure liegen in Tiefenschichten, werden von Nebel/Nacht gedämpft und hinterlassen Spuren auf passendem Material.'},
  {t:59, title:'Zeit ist ein Shader-Gesetz.', copy:'Herbst, Patina, Verfall und Weltmüdigkeit laufen über dieselbe Parameter-Sprache wie Wetter und Licht.'},
  {t:67, title:'Klima ist kein Skin.', copy:'Schnee, Kälte, Eis und Frostatem verändern Lesbarkeit, Bewegung und Oberflächen – nicht nur die Farbpalette.'},
  {t:75, title:'Die Welt kann heilen.', copy:'Frühling, Bloom und der nasse Tag danach zeigen den Bogen zurück ins Lebendige.'}
];
let showcase=null;
function setShowcaseCaption(title,copy){
  document.getElementById('showcase-title').textContent=title;
  document.getElementById('showcase-copy').textContent=copy;
  showcaseCard.classList.add('show');
}
function stopShowcase(){
  showcase=null;
  showcaseCard.classList.remove('show');
}
async function loadDemoScene(){
  const scene='file_00000000974871f49fe71f6b456f9579.png';
  const marker='file_00000000c84071f4bcd6ff9afdba7246.png';
  const r1=await fetch(scene); if(!r1.ok)throw new Error('scene');
  const b1=new File([await r1.blob()],scene,{type:'image/png'});
  // A new scene intentionally clears its old material map. Wait for that decode
  // before installing the demo marker, otherwise the two image onload handlers
  // race and the marker can silently disappear.
  await loadImageFile(b1,false);
  const r2=await fetch(marker);
  if(r2.ok) await loadImageFile(await r2.blob(),true);
}
function waitForReady(timeoutMs=5000){
  const start=performance.now();
  return new Promise(resolve=>{
    const check=()=>{
      if(sceneImg || performance.now()-start>timeoutMs) resolve(!!sceneImg);
      else requestAnimationFrame(check);
    };
    check();
  });
}
async function startShowcase(){
  try{
    if(!sceneImg){
      setStatus('🎪 Lade Demo-Dorf für den Showcase …');
      await loadDemoScene();
      await waitForReady();
    }
    if(!ready && !erstellen()) return;
    document.body.classList.add('cinema');
    showcaseStoryboard();
    playStory();
    spawnEcosystem('gaime_npcs');
    if(!player.active) spawnPlayer();
    igniteFire(0.58,0.62);
    soundStamp(0.50,0.58,1);
    showcase={t:0, beat:-1};
    setShowcaseCaption(SHOWCASE_BEATS[0].title,SHOWCASE_BEATS[0].copy);
    setStatus('🎪 Showcase läuft: 90 Sekunden Shader-Regeln, Figuren, Wetter und Zeit.');
  }catch(_){
    setStatus('Showcase-Demo nur über einen lokalen Server verfügbar (python3 -m http.server).');
  }
}
function tickShowcase(dt){
  if(!showcase)return;
  showcase.t+=dt;
  let bi=0;
  for(let i=0;i<SHOWCASE_BEATS.length;i++) if(showcase.t>=SHOWCASE_BEATS[i].t) bi=i;
  if(bi!==showcase.beat){
    showcase.beat=bi;
    setShowcaseCaption(SHOWCASE_BEATS[bi].title,SHOWCASE_BEATS[bi].copy);
    soundStamp(0.18+0.08*(bi%5),0.62,0.55);
  }
  if(showcase.t>92){
    stopShowcase();
    setStatus('🎪 Showcase beendet. PNG/WebM-Aufnahme kann denselben Ablauf festhalten.');
  }
}

function loadImageFile(file,isMat){
  return new Promise((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>{
    if(isMat){ matImg=img; setStatus('Material-Map geladen ('+img.width+'×'+img.height+'). Jetzt „Erstellen“.'); }
    else{
      sceneImg=img;
      sceneSource={kind:'IMAGE_FILE',label:file.name||null};
      // Ein Zweitbild gehört IMMER zur Szene: neue Szene -> altes Overlay/Map
      // UND alte Tiefenkarte weg (sonst wird Bild B mit Daten von Bild A gerendert!)
      if(matImg){ matImg=null; const fm=document.getElementById('f-mat'); if(fm) fm.value=''; }
      clearDepth();
      pendingShading=null;   // sonst bekaeme Bild B das Beleuchtungsfeld von Bild A
      canvas.width=img.width; canvas.height=img.height;
      ov.width=img.width; ov.height=img.height;
      gl.viewport(0,0,img.width,img.height);
      uploadTex(0,TEX.scene,0,0,img);
      gl.uniform2f(U.u_px,1/img.width,1/img.height);
      gl.uniform1f(U.u_aspect,img.width/img.height);
      document.getElementById('drop-hint').style.display='none';
      ready=false;
      setStatus('Szene geladen ('+img.width+'×'+img.height+'). Drücke „✨ Erstellen“.');
      // Auto-Suche: liegt neben "dorf.png" eine "dorf_depth.png" auf dem Server,
      // wird sie geladen (2.5D an). Findet nichts -> Szene bleibt einfach flach.
      // Dieselbe Konvention gilt für "dorf_shading.png": das Beleuchtungsfeld eines
      // externen Backends. Wer die Hardware hat, backt es EINMAL und legt es daneben;
      // alle anderen laden es mit, ohne selbst ein Modell auszuführen.
      if(file.name&&/\.\w+$/.test(file.name)){
        const depthName=file.name.replace(/(\.\w+)$/,'_depth$1');
        const dImg=new Image();
        dImg.onload=()=>setDepth(dImg,depthName+' (auto)','AUTO_COMPANION_FILE');
        dImg.onerror=()=>{};
        dImg.src=depthName;

        const shName=file.name.replace(/(\.\w+)$/,'_shading$1');
        const sImg=new Image();
        // Angewendet wird erst NACH analyze() – vorher gibt es keine Analyseauflösung.
        sImg.onload=()=>{ pendingShading={img:sImg,name:shName};
                          setStatus('Shading-Feld gefunden ('+shName+') – wird beim Erstellen angewendet.'); };
        sImg.onerror=()=>{};
        sImg.src=shName;
      }
    }
    URL.revokeObjectURL(img.src);
    resolve(img);
  };
  img.onerror=()=>{
    URL.revokeObjectURL(img.src);
    reject(new Error((isMat?'Zweitbild':'Szenenbild')+' konnte nicht dekodiert werden.'));
  };
  img.src=URL.createObjectURL(file);
  });
}
document.getElementById('f-scene').onchange=e=>e.target.files[0]&&loadImageFile(e.target.files[0],false);
document.getElementById('f-mat').onchange=e=>e.target.files[0]&&loadImageFile(e.target.files[0],true);

// === 2.5D-Tiefenkarte (Unit 6) ===
// CPU-Sample-Cache der Tiefenkarte (Weiß=nah/1, Schwarz=fern/0) für Partikel-Steuerung
// (Schnee/Regen/Laub), damit sie ohne GPU-Readback pro Frame die Szenentiefe kennen.
let depthSample=null; // {data, w, h, source}
function getDepthAt(u,v){
  if(!depthSample) return null;
  const x=Math.max(0,Math.min(depthSample.w-1, (u*depthSample.w)|0));
  const y=Math.max(0,Math.min(depthSample.h-1, (v*depthSample.h)|0));
  return depthSample.data[(y*depthSample.w+x)*4]/255; // R-Kanal reicht (Graustufen)
}
function buildSpatialPointCloud(opt){
  opt=opt||{};
  if(!sceneImg) throw new Error('Keine Szene geladen.');
  if(!depthSample) throw new Error('Keine Tiefenkarte geladen. Lade eine *_depth.png Companion-Datei oder den Demo-Ort.');
  const srcW=depthSample.w, srcH=depthSample.h;
  const cv=document.createElement('canvas'); cv.width=srcW; cv.height=srcH;
  const c=cv.getContext('2d',{willReadFrequently:true});
  c.drawImage(sceneImg,0,0,srcW,srcH);
  const rgba=c.getImageData(0,0,srcW,srcH).data;
  return buildRelativePointCloud({
    rgba,depthRgba:depthSample.data,width:srcW,height:srcH,
    sourceSize:{w:sceneImg.width,h:sceneImg.height},source:sceneSource,depthSource:depthSample.source,
    step:opt.step,fovDegrees:opt.fovDegrees,
    materialAt:ready?(u,v)=>getMaterialTypeAt(u,v):null
  });
}
function downloadSpatialPointCloud(){
  try{
    const pc=buildSpatialPointCloud();
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(pc,null,2)],{type:'application/json'}));
    a.download='SHADED_pointcloud_'+Date.now()+'.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(`🌌 POINTS exportiert (${pc.points.length}, relative Skala, Zuverlässigkeit unbekannt, keine Registrierung/Fusion).`);
  }catch(e){ setStatus('⚠️ PointCloud: '+e.message); }
}
function setDepth(img,label,sourceKind='EXTERNAL_API'){
  uploadTex(6,TEX.depth,0,0,img);
  hasDepth=true;
  const dc=document.createElement('canvas');
  const dw=Math.min(256,img.width), dh=Math.round(dw*img.height/img.width);
  dc.width=dw; dc.height=dh;
  const dctx=dc.getContext('2d');
  dctx.drawImage(img,0,0,dw,dh);
  depthSample={data:dctx.getImageData(0,0,dw,dh).data,w:dw,h:dh,
               source:{sourceKind,label:label||null,provider:'UNKNOWN',reliability:'UNKNOWN',
                       originalSize:{w:img.width,h:img.height}}};
  setStatus('Relative Tiefenkarte geladen: '+(label||img.width+'×'+img.height)+' · Provider und Zuverlässigkeit unbekannt.');
}
function clearDepth(){
  if(!hasDepth)return;
  gl.activeTexture(gl.TEXTURE0+6); gl.bindTexture(gl.TEXTURE_2D,TEX.depth);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
  hasDepth=false; parallaxTarget.x=0; parallaxTarget.y=0;
  depthSample=null;
  const fd=document.getElementById('f-depth'); if(fd) fd.value='';
}
document.getElementById('f-depth').onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const img=new Image();
  img.onload=()=>{ setDepth(img,f.name,'USER_UPLOAD'); URL.revokeObjectURL(img.src); };
  img.src=URL.createObjectURL(f);
};

const stage=document.getElementById('stage');
// 2.5D: Maus über der Bühne schwenkt die Kamera minimal (max. 3.5 %),
// negativ für natürlichen Tiefeneffekt. Ohne Tiefenkarte wirkungslos.
stage.addEventListener('mousemove',e=>{
  const rect=canvas.getBoundingClientRect();
  const mx=((e.clientX-rect.left)/rect.width-0.5)*2.0;
  const my=((e.clientY-rect.top)/rect.height-0.5)*2.0;
  parallaxTarget.x=-mx*0.035; parallaxTarget.y=-my*0.035;
});
stage.addEventListener('mouseleave',()=>{ parallaxTarget.x=0; parallaxTarget.y=0; });
stage.addEventListener('dragover',e=>e.preventDefault());
stage.addEventListener('drop',e=>{
  e.preventDefault();
  if(e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0],false);
});

document.getElementById('btn-demo').onclick=async()=>{
  try{
    // Kanonisches Demo-Paar: Szene + Fenster-Marker-Overlay. Der Blob bekommt
    // den Dateinamen, damit die _depth-Auto-Suche greift (2.5D fürs Demo).
    await loadDemoScene();
  }catch(_){ setStatus('Demo nur über einen lokalen Server verfügbar (python3 -m http.server).'); }
};

function erstellen(){
  if(!sceneImg){ setStatus('⚠️ Zuerst ein Bild laden!'); return false; }
  setStatus('🧠 Analysiere Materialien, Senken, Flussfeld, Lichtquellen …');
  mossBoost=0;
  trailClear(); fires.length=0; player.active=false;
  analyze();
  window.SHADED_ENGINE_INTERNAL.initEco?.();
  defaultStoryboard();
  // Starte mit Nacht-Zustand für Übergang zu Tag in erstem Storyboard-Schritt
  const nightStart = {...ACTS.morgen.p, dayNight:0.95, storm:0.08, rain:0, wet:0.70};
  Object.assign(PARAMS,nightStart); Object.assign(CUR,nightStart); syncSliders();
  playStory();
  setStatus('✅ Szene lebt. Storyboard läuft (Loop). „K” = Kino-Modus.');
  return true;
}
document.getElementById('btn-create').onclick=erstellen;
document.getElementById('btn-eco-cats').onclick=()=>spawnEcosystem('cats');
document.getElementById('btn-eco-enemies').onclick=()=>spawnEcosystem('gaime_enemies');
document.getElementById('btn-eco-npcs').onclick=()=>spawnEcosystem('gaime_npcs');
document.getElementById('btn-eco-heroes').onclick=()=>spawnEcosystem('gaime_heroes');
document.getElementById('btn-eco-depth-test').onclick=()=>spawnEcosystem('test_depth');

// Kino / Aufnahme / Export
function toggleCinema(){ document.body.classList.toggle('cinema'); }
document.getElementById('btn-cinema').onclick=toggleCinema;
document.getElementById('exit-cinema').onclick=toggleCinema;
window.addEventListener('keydown',e=>{
  if(e.key==='k'||e.key==='K')toggleCinema();
  if(e.key==='Escape')document.body.classList.remove('cinema');
});
document.getElementById('btn-png').onclick=()=>{
  const cap=document.createElement('canvas');
  cap.width=canvas.width; cap.height=canvas.height;
  const cc=cap.getContext('2d');
  cc.drawImage(canvas,0,0); cc.drawImage(ov,0,0);   // Szene + Figur/Partikel
  cap.toBlob(b=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(b); a.download='SHADED_'+Date.now()+'.png'; a.click();
    URL.revokeObjectURL(a.href);
  },'image/png');
};
let recorder=null,chunks=[],recCanvas=null,recCtx=null;
document.getElementById('btn-rec').onclick=()=>{
  if(recorder){ recorder.stop(); return; }
  chunks=[];
  recCanvas=document.createElement('canvas');
  recCanvas.width=canvas.width; recCanvas.height=canvas.height;
  recCtx=recCanvas.getContext('2d');
  const stream=recCanvas.captureStream(30);
  let opt={mimeType:'video/webm; codecs=vp9'};
  if(!MediaRecorder.isTypeSupported(opt.mimeType))opt={mimeType:'video/webm'};
  recorder=new MediaRecorder(stream,opt);
  recorder.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  recorder.onstop=()=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
    a.download='SHADED_Showcase_'+Date.now()+'.webm'; a.click();
    URL.revokeObjectURL(a.href);
    recorder=null;
    document.getElementById('rec').style.display='none';
    document.getElementById('btn-rec').textContent='🔴 WebM';
  };
  recorder.start();
  document.getElementById('rec').style.display='block';
  document.getElementById('btn-rec').textContent='⏹ Stopp';
};
document.getElementById('btn-json').onclick=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify({params:PARAMS,storyboard},null,2)],{type:'application/json'}));
  a.download='shaded_params.json'; a.click();
  URL.revokeObjectURL(a.href);
};
document.getElementById('btn-pointcloud').onclick=downloadSpatialPointCloud;
document.getElementById('btn-play').onclick=()=>playing?stopStory():playStory();
document.getElementById('btn-year').onclick=()=>{
  yearStoryboard(); playStory(); setStatus('📅 Ein Jahr im Loop – Frühling bis Tauwetter.');
};
document.getElementById('btn-timelapse').onclick=()=>{
  storyboard=[
    {name:'Der letzte Tag',  dur:4,  p:{...ACTS.tag.p}},
    {name:'Jahre vergehen',  dur:22, p:{...ACTS.verfall.p}, animate:{decay:{from:0,to:1}}},
    {name:'Vergessen',       dur:6,  p:{...ACTS.verfall.p}}
  ];
  renderStory(); playStory();
  setStatus('⏳ Zeitraffer: Das Dorf altert vor Deinen Augen (decay 0→1).');
};
document.getElementById('btn-drama').onclick=()=>{
  dramaStoryboard(); playStory(); setStatus('⚡ Shader-Regeln im Extrem – 20 Sekunden Sturm, Blitz und Verfallseffekt.');
};
document.getElementById('btn-showcase').onclick=startShowcase;
document.getElementById('btn-add').onclick=()=>{
  storyboard.push({name:'Neuer Schritt',dur:5,p:{...PARAMS}}); renderStory();
};

// =========================== Render-Loop ====================// Welt-Logik läuft in festen Substeps (max 50 ms): Die Weltzeit folgt der
// Echtzeit auch bei niedriger Framerate (Headless, schwache GPU, Tab-Drossel).
let time=0,lastT=0,mossBoost=0,bloodStain=0,mudStain=0,timeFrozen=false;
// Aufsummierte Wetter-Phasen: laufen NUR vorwärts, auch wenn Wind/Regen
// abklingen (sonst "Rewind" der letzten Tropfen beim Sturm-Ende).
let rainPhase=0, windDrift=0, dryPhase=0, heatWarp=0, rustAccum=0, smokeAmount=0;
let breathAmount=0, pressureDim=0, pollutionGlow=0, moonBright=0, shelfShadow=0;
let vegFade=0, moodTint=0, worldTired=0, forbiddenCold=0, runeGlow=0;
let shadowAge=0, smellDrift=0, touchWear=0, repairMark=0, blessCurse=0;
const elementBurst={wet:0,heat:0,pressure:0,ash:0,hail:0,lava:0};
// 2.5D-Parallaxe: Ziel folgt der Maus, Ist wird im Frame sanft nachgezogen.
// hasDepth gate: ohne Tiefenkarte bleibt ALLES flach (auch das Overlay),
// sonst liefe die Spielfigur bei Mausbewegung neben der starren Szene her.
let parallaxTarget={x:0,y:0}, parallaxCurrent={x:0,y:0}, hasDepth=false;
// Camera shake: Sturm + Blitz erzeugen visuelle Erschütterungen
let cameraShake={x:0, y:0, jx:0, jy:0}, lastFlash=0; // lastFlash: letzter u_flash-Wert (CUR.flash existiert nicht, flash ist kein PARAM)
let windSwayPhase=0; // sanfte, kontinuierliche Schwingung (Wind/Sturm) statt Zufalls-Jitter
const OV_DEPTH=0.5;  // Bodenebene ~ mittlere Tiefe: so weit schiebt das Overlay mit
function tickWorld(dt){
  if(!timeFrozen){
    time+=dt;
    rainPhase+=dt*(1.0+CUR.wind*0.4);
    windDrift+=dt*CUR.wind;
    // Phase C: World Laws Extension
    dryPhase+=dt*Math.max(0, 0.8-CUR.wet);
    rustAccum+=dt*Math.max(0, CUR.wet-0.3)*0.15;
    heatWarp=CUR.temperature*fires.length;
    smokeAmount=CUR.fog*(CUR.storm+fires.length*0.5);
    // Phase C+
    breathAmount+=dt*(CUR.temperature<0.3?0.3:0)*(1-CUR.wet*0.5);
    pressureDim=fires.length*0.2+Math.max(0,0.5-CUR.puddle)*0.1;
    pollutionGlow=CUR.glow*0.5+CUR.wind*0.1;
    moonBright=(1-CUR.dayNight)*0.6+CUR.bloom*0.1;
    shelfShadow=CUR.storm*0.3+Math.max(0,CUR.rain-0.5)*0.2;
    vegFade=CUR.wind*0.3+CUR.rain*0.4;
    moodTint=CUR.storm*0.15+CUR.decay*0.1;
    worldTired=CUR.decay*0.4;
    forbiddenCold=CUR.storm*0.2;
    runeGlow=CUR.fog*0.3+CUR.bloom*0.1;
    // Finale Sprint-Welt-Gesetze
    shadowAge+=dt*Math.max(0, 0.5-CUR.glow)*0.4; // Schatten verlangsamen Verfall
    smellDrift+=dt*(CUR.decay*0.6+fires.length*0.2); // Verfall + Feuer → Geruch
    touchWear+=dt*0.05; // konstantes Abnutzen
    repairMark=CUR.glow*0.3+CUR.wind*0.1; // neue/reparierte Holzstellen glänzen
    blessCurse=CUR.bloom*0.5+CUR.decay*-0.3; // Bloom=Segen, Decay=Fluch
    elementBurst.wet*=Math.pow(0.55,dt);
    elementBurst.heat*=Math.pow(0.74,dt);
    elementBurst.pressure*=Math.pow(0.28,dt);
    elementBurst.ash*=Math.pow(0.70,dt);
    elementBurst.hail*=Math.pow(0.38,dt);
    elementBurst.lava*=Math.pow(0.82,dt);

    // === Camera Shake System: Wind/Sturm sanftes Wiegen, Blitz kurzer scharfer Ruck ===
    // Vorher: reiner Pro-Frame-Zufallsimpuls, der sich aufsummierte - das sah nach
    // Zittern/Spacken aus, nicht nach Wiegen. Jetzt: kontinuierliche, langsame
    // Sinus-Schwingung für Wind/Sturm (glatt, vorhersehbar), und ein separater,
    // schnell abklingender Zufalls-Ruck NUR beim Blitz (der darf ruckartig sein).
    windSwayPhase += dt * (0.30 + CUR.wind*0.22 + CUR.storm*0.15);
    const swayAmp = (CUR.wind*0.7 + CUR.storm*0.4) * 0.006;
    const swayX = Math.sin(windSwayPhase) * swayAmp;
    const swayY = Math.sin(windSwayPhase*0.8 + 1.7) * swayAmp * 0.5;

    if(lastFlash > 0.05){
      cameraShake.jx = (Math.random()-0.5) * lastFlash * 0.05;
      cameraShake.jy = (Math.random()-0.5) * lastFlash * 0.05;
    }
    const joltDamp = Math.pow(0.02, dt); // Blitz-Ruck klingt binnen weniger Frames ab
    cameraShake.jx *= joltDamp;
    cameraShake.jy *= joltDamp;

    cameraShake.x = swayX + cameraShake.jx;
    cameraShake.y = swayY + cameraShake.jy;
  }
  tickStory(dt);
  tickShowcase(dt);
  tickActBlend(dt);
  if(!playing&&!actBlend) for(const key in PARAMS) CUR[key]+= (PARAMS[key]-CUR[key])*Math.min(1,dt*4);
    if(ready){
      // Feuchte-Patina: lange Nässe lässt Moos schneller kommen (persistiert über Akte)
      mossBoost = Math.min(1, mossBoost + dt*Math.max(0, CUR.wet-0.5)*0.02);
      bloodStain = Math.min(1, player.blood);   // Blut-Transfer auf Schuhen (#2)
      mudStain = Math.min(1, player.mud);       // Schlamm-Transfer auf Schuhen (#2)
      playerTick(dt);
    fireTick(dt);
    window.SHADED_ENGINE_INTERNAL.weatherTick?.(dt);
    trailTick(dt);
    soundTick(dt);
  }
}
function frame(now){
  let acc=Math.min(1.0,(now-lastT)/1000||0); lastT=now;
  const frameDt=acc;
  while(acc>0){ const s=Math.min(0.05,acc); tickWorld(s); acc-=s; }
  const dt=frameDt;
  // Runde 10: Dialog-Engine tickt sich seit der Extraktion (runtime/dialogue-engine.mjs)
  // über ihre eigene RAF-Schleife selbst, nicht mehr hier.
  if(ready) trailUpload();
  if(ready) soundUpload();

  // Parallaxe glatt interpolieren; Overlay (Figur/Feuer) folgt der Bodenebene.
  parallaxCurrent.x += (parallaxTarget.x-parallaxCurrent.x)*0.06;
  parallaxCurrent.y += (parallaxTarget.y-parallaxCurrent.y)*0.06;
  const pxShift = hasDepth ? parallaxCurrent : {x:0,y:0};
  // === Camera Shake beim Shader anwenden ===
  const pxWithShake = {x: pxShift.x + cameraShake.x, y: pxShift.y + cameraShake.y};
  const fx = pxWithShake.x*OV_DEPTH, fy = pxWithShake.y*OV_DEPTH;   // UV-Bruchteile
  ov.style.transform = hasDepth ? `translate(${fx*ov.clientWidth}px, ${fy*ov.clientHeight}px)` : '';

  // Die räumliche Vollbildansicht hat einen eigenen WebGL-Kontext. Den schweren
  // Hauptshader darunter weiterzurendern halbiert nur die Framerate und ist unsichtbar.
  const spatialActive=!document.getElementById('spatial-viewer').hidden;
  if(sceneImg&&!spatialActive){
    gl.uniform1f(U.u_time,time);
    gl.uniform1f(U.u_rainPhase,rainPhase);
    gl.uniform1f(U.u_windDrift,windDrift);
    gl.uniform1f(U.u_dryPhase,dryPhase);
    gl.uniform1f(U.u_heatWarp,heatWarp);
    gl.uniform1f(U.u_rustAccum,rustAccum);
    gl.uniform1f(U.u_smokeAmount,smokeAmount);
    gl.uniform1f(U.u_breathAmount,breathAmount);
    gl.uniform1f(U.u_pressureDim,pressureDim);
    gl.uniform1f(U.u_pollutionGlow,pollutionGlow);
    gl.uniform1f(U.u_moonBright,moonBright);
    gl.uniform1f(U.u_shelfShadow,shelfShadow);
    gl.uniform1f(U.u_vegFade,vegFade);
    gl.uniform1f(U.u_moodTint,moodTint);
    gl.uniform1f(U.u_worldTired,worldTired);
    gl.uniform1f(U.u_forbiddenCold,forbiddenCold);
    gl.uniform1f(U.u_runeGlow,runeGlow);
    gl.uniform1f(U.u_shadowAge,shadowAge);
    gl.uniform1f(U.u_smellDrift,smellDrift);
    gl.uniform1f(U.u_touchWear,touchWear);
    gl.uniform1f(U.u_repairMark,repairMark);
    gl.uniform1f(U.u_blessCurse,blessCurse);
    gl.uniform1f(U.u_bloodStain, ready? bloodStain : 0);
    gl.uniform1f(U.u_mudStain, ready? mudStain : 0);
    gl.uniform1f(U.u_lens, ready? lensState : 0);
    gl.uniform1f(U.u_elementWetBurst, ready? elementBurst.wet : 0);
    gl.uniform1f(U.u_elementHeatBurst, ready? elementBurst.heat : 0);
    gl.uniform1f(U.u_elementPressureBurst, ready? elementBurst.pressure : 0);
    gl.uniform1f(U.u_elementAshBurst, ready? elementBurst.ash : 0);
    gl.uniform1f(U.u_elementHailBurst, ready? elementBurst.hail : 0);
    gl.uniform1f(U.u_elementLavaBurst, ready? elementBurst.lava : 0);
    // Materialschicht: ohne Zerlegung (oder vor analyze()) exakt 0 -> identity-albedo
    gl.uniform1f(U.u_intrinsic, (ready && intrinsicShading) ? intrinsicStrength : 0);
    gl.uniform2f(U.u_parallax, pxWithShake.x, pxWithShake.y);
    PARAM_META.forEach(([key])=>gl.uniform1f(U['u_'+key], ready? CUR[key] : (key==='dayNight'||key==='storm'?CUR[key]:0)));
    lastFlash = ready ? tickLightning(time) : 0;
    gl.uniform1f(U.u_flash, lastFlash);
    gl.uniform1f(U.u_mossBoost, ready? mossBoost*0.3 : 0);
    fireUniforms();
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    drawOverlay(dt);
    // CSS-Transforms landen nicht in der Aufnahme -> Versatz als Pixel-Offset
    if(recorder&&recCtx){ recCtx.drawImage(canvas,0,0); recCtx.drawImage(ov,fx*canvas.width,fy*canvas.height); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// === Runde 10: Dialog-Engine — extrahiert nach runtime/dialogue-engine.mjs ===
// (eigenes ESM-Modul, hängt window.SHADED.dialogue nach dem Laden dieser Datei an;
// siehe dort für die vollständige Implementierung und Begründung der Extraktion.)

// =========================== Agent-/Test-API (nicht entfernen!) ===========================
console.log('Script reached window.SHARED assignment');
window.SHADED = {
  version:'1.4.0',
  erstellen,
  applyAct:(id)=>applyAct(id,true),
  setParams:(p)=>{ stopStory(); Object.assign(PARAMS,p); Object.assign(CUR,p); syncSliders(); },
  getParams:()=>({...CUR}),
  setTime:(t,freeze)=>{ time=t; timeFrozen=!!freeze;     // freeze=true: deterministische Frames
    rainPhase=t*(1.0+CUR.wind*0.4); windDrift=t*CUR.wind;
    dryPhase=t*Math.max(0, 0.8-CUR.wet);
    rustAccum=t*Math.max(0, CUR.wet-0.3)*0.15;
    heatWarp=CUR.temperature*fires.length;
    smokeAmount=CUR.fog*(CUR.storm+fires.length*0.5);
    breathAmount=t*(CUR.temperature<0.3?0.3:0)*(1-CUR.wet*0.5);
    pressureDim=fires.length*0.2+Math.max(0,0.5-CUR.puddle)*0.1;
    pollutionGlow=CUR.glow*0.5+CUR.wind*0.1;
    moonBright=(1-CUR.dayNight)*0.6+CUR.bloom*0.1;
    shelfShadow=CUR.storm*0.3+Math.max(0,CUR.rain-0.5)*0.2;
    vegFade=CUR.wind*0.3+CUR.rain*0.4;
    moodTint=CUR.storm*0.15+CUR.decay*0.1;
    worldTired=CUR.decay*0.4;
    forbiddenCold=CUR.storm*0.2;
    runeGlow=CUR.fog*0.3+CUR.bloom*0.1;
    shadowAge=t*Math.max(0, 0.5-CUR.glow)*0.4;
    smellDrift=t*(CUR.decay*0.6+fires.length*0.2);
    touchWear=t*0.05;
    repairMark=CUR.glow*0.3+CUR.wind*0.1;
    blessCurse=CUR.bloom*0.5+CUR.decay*-0.3;
  },  // Phasen deterministisch zur Zeit
  isReady:()=>ready,
  getMaterialTypeAt,
  story:{ play:playStory, stop:stopStory, board:()=>storyboard },
  showcase:{ start:startShowcase, stop:stopShowcase, board:showcaseStoryboard },
  elements:{ trigger:elementPreset, clear:()=>document.getElementById('btn-elements-clear').click() },
  // Räumliche Runtime-Module lesen dieselben transienten Weltgesetze, statt
  // parallel eigene UI-Schalter oder eine zweite Simulationswahrheit zu erfinden.
  worldState:()=>({params:{...CUR},elements:{...elementBurst},fireCount:fires.length,
                   player:{active:player.active,blood:player.blood||0,mud:player.mud||0},
                   phases:{dry:dryPhase,rust:rustAccum,smoke:smokeAmount,heat:heatWarp}}),
  spatial:{ pointCloud:buildSpatialPointCloud, downloadPointCloud:downloadSpatialPointCloud },
  loadDemo:loadDemoScene,
  loadImageFile,
  // Runde 4
  player:{ enable:spawnPlayer, pos:()=>({u:player.u,v:player.v,active:player.active,wet:player.wet}),
           setAge:(a)=>{player.age=Math.max(0,Math.min(1,a));},
           move:(du,dv)=>{                       // direkter Schritt inkl. Fußspuren (Tests/Agenten)
             if(!player.active) spawnPlayer();
             const steps=Math.max(1,Math.ceil(Math.hypot(du,dv)/0.012));
             for(let s2=0;s2<steps;s2++){
               player.u=Math.max(0.01,Math.min(0.99,player.u+du/steps));
               player.v=Math.max(0.01,Math.min(0.99,player.v+dv/steps));
               trailStamp(player.u,player.v+0.006,0.007,0,0.7);
               trailStamp(player.u,player.v+0.006,0.009,2,0.045,235);
             }
           } },
  fire:{ ignite:igniteFire, list:()=>fires.map(f=>({u:f.u,v:f.v,fuel:f.fuel})) },
  // stamp: bis Stufe 2 der Engine-Aufteilung rein intern (docs/engine-decomposition-plan.md) —
  // öffentlich gemacht, damit runtime/actor-bridge.mjs Fußspuren über das Vertrags-API setzt,
  // statt Engine-Interna zu importieren (Invariante 5: nur erweitern).
  trail:{ clear:trailClear, sample:trailSample, stamp:trailStamp },
  structure:()=>structDiag,  // Runde 5: Struktur-Pass-Diagnose
  zoneAt:(u,v)=>{            // K1: Gebäudezone an UV-Position (0|1)
    if(!zoneGrid) return 0;
    const x=Math.max(0,Math.min(AW-1,Math.floor(u*AW)));
    const y=Math.max(0,Math.min(AH-1,Math.floor(v*AH)));
    return zoneGrid[y*AW+x];
  },
  // K7: war diese UV-Position Teil der Himmel-Flood aus analyze() (0|1)? Kein zweites
  // Klassifikationssystem — nur die Herkunftsmarkierung für Pixel, die classGrid
  // bereits als K (Fels) trägt, damit z.B. Wetterpartikel echten Fels von
  // Himmel-als-Fels unterscheiden können (Invariante 2).
  skyAt:(u,v)=>{
    if(!skyGrid) return 0;
    const x=Math.max(0,Math.min(AW-1,Math.floor(u*AW)));
    const y=Math.max(0,Math.min(AH-1,Math.floor(v*AH)));
    return skyGrid[y*AW+x];
  },
  // Wurde bei diesem Bild überhaupt eine Himmel-Region gefunden? Ohne dieses Signal
  // ist skyAt() überall "0" nicht, weil es dort echten Boden gäbe, sondern weil die
  // Erkennung nicht angeschlagen hat (bedecktes/dunkles Quellbild) — Aufrufer, die
  // skyAt() zur Landung/Occlusion nutzen, müssen das getrennt prüfen.
  hasSkyRegion:()=>skyRegionFound,
  // 2.5D: Tiefenkarte + Parallaxe (deterministisch für Tests steuerbar)
  parallax:{ set:(x,y)=>{ parallaxTarget.x=x; parallaxTarget.y=y;
                          parallaxCurrent.x=x; parallaxCurrent.y=y; },
             get:()=>({...parallaxCurrent}),
             hasDepth:()=>hasDepth,
             // sampleDepth: bis Stufe 3 der Engine-Aufteilung rein intern (getDepthAt) —
             // öffentlich gemacht, damit runtime/weather-particles.mjs Tiefenwerte für
             // Schnee/Regen/Hagel liest, statt Engine-Interna zu importieren (Invariante 5).
             sampleDepth:getDepthAt,
             setDepthImage:setDepth, clearDepth },
  // SWIFT-Actor-Bridge: window.SHADED.addActor wird von runtime/actor-bridge.mjs
  // angehängt, nachdem dieses Modul geladen ist (siehe dort).
  // Runde 7: Ökosystem-Integration
  ecosystem:{ spawn:spawnEcosystem, defs:()=>Object.keys(ecosystemDefs) },
  // Runde 8: Wally-Monokel (Inspektions-Linsen) + Klang-Wellenfeld
  lens:{ set:(n)=>{ lensState=Math.max(0,Math.min(5,n|0)); }, get:()=>lensState },
  sound:{ emit:(u,v,strength)=>soundStamp(u,v,strength==null?1:strength), clear:soundClear },
  // Materialschicht: Licht/Material-Trennung (docs/neuronale-materialien-svbrdf-pbr.md).
  // Rein optisch – schreibt NIE in classGrid oder getMaterialTypeAt (Invariante 2).
  intrinsic:{
    // Zustand inkl. aller Pflichtmetadaten des Kanalvertrags
    state:()=>({...intrinsicMeta, strength:intrinsicStrength,
                hasShading: !!intrinsicShading, resolution:{w:AW,h:AH},
                projection:intrinsicProjection,          // null = nicht projiziert (fremdes Feld)
                gamut:intrinsicGamutViolations()}),       // albedo>1: gemessen, nie stillschweigend
    // 0 = beobachtete Farbe (Fallback identity-albedo), 1 = volle Trennung
    setStrength:(s)=>{ intrinsicStrength=Math.max(0,Math.min(1,+s||0)); return intrinsicStrength; },
    getStrength:()=>intrinsicStrength,
    // Externes Backend (RGB→X, IntrinsicReal, De-Lighter …) liefert das Feld.
    // shading: Image | Canvas | ImageData (128 = neutral) oder Array (1.0 = neutral)
    set:(opt)=>{
      if(!ready) throw new Error('intrinsic.set: erst nach erstellen()');
      if(!opt||opt.shading==null) throw new Error('intrinsic.set: shading fehlt');
      const sh=resampleShading(opt.shading);
      if(!sh) return false;
      intrinsicShading=sh;
      intrinsicConf=null;
      intrinsicProjection=null;   // fremdes Feld ist nicht Dykstra-projiziert
      if(opt.confidenceMap!=null){
        const cm=resampleShading(opt.confidenceMap);
        intrinsicConf=new Float32Array(AW*AH);
        for(let j=0;j<AW*AH;j++) intrinsicConf[j]=Math.max(0,Math.min(1,cm[j]*0.5));
      }
      intrinsicMeta={
        provider: opt.provider || 'material.intrinsic.external',
        providerVersion: opt.providerVersion || 'unknown',
        channelSetId: opt.channelSetId || 'intrinsic.external',
        provenance: opt.provenance || 'INFERRED',
        colorSpace: opt.colorSpace || {albedo:'sRGB', shading:'linear'},
        confidence: opt.confidence!=null ? +opt.confidence : 0,
        accepted: false
      };
      uploadMaterialTexture();
      return true;
    },
    // Nutzer bestätigt die Hypothese als kanonisch
    accept:()=>{ if(!intrinsicShading) return false;
                 intrinsicMeta={...intrinsicMeta, provenance:'USER_APPROVED', accepted:true};
                 return true; },
    // Verwerfen: zurück auf das eingebaute Backend; ohne dieses auf identity-albedo
    reset:()=>{
      if(intrinsicBase){ intrinsicShading=intrinsicBase.shading; intrinsicConf=intrinsicBase.conf;
                         intrinsicProjection=intrinsicBase.projection;
                         intrinsicMeta={...INTRINSIC_BASELINE, confidence:intrinsicBase.confidence, accepted:false}; }
      else { intrinsicShading=null; intrinsicConf=null;
             intrinsicMeta={...INTRINSIC_IDENTITY, confidence:0, accepted:false}; intrinsicStrength=0; }
      uploadMaterialTexture();
      return true;
    },
    // Providerausfall: Feld fällt weg, Rendering fällt auf den heutigen Zustand
    clear:()=>{ intrinsicShading=null; intrinsicConf=null; intrinsicBase=null; intrinsicStrength=0;
                intrinsicProjection=null; intrinsicCeil=null;
                intrinsicMeta={...INTRINSIC_IDENTITY, confidence:0, accepted:false};
                uploadMaterialTexture(); return true; },
    // Beleuchtungswert an UV (1.0 = neutral) – für Debug und Tests
    sample:(u,v)=>{
      if(!intrinsicShading) return 1;
      const x=Math.max(0,Math.min(AW-1,Math.floor(u*AW)));
      const y=Math.max(0,Math.min(AH-1,Math.floor(v*AH)));
      return intrinsicShading[y*AW+x];
    }
  },
  sound:{ emit:(u,v,strength)=>soundStamp(u,v,strength==null?1:strength), clear:soundClear },
  // Runde 10: Dialog-Engine — window.SHADED.dialogue wird von runtime/dialogue-engine.mjs
  // angehängt, nachdem dieses Modul geladen ist (siehe dort).
};

// Bewusst NICHT Teil des dokumentierten window.SHADED-Vertrags (Invariante 5) — eine reine
// Cross-Modul-Bridge für extrahierte Engine-Module (docs/engine-decomposition-plan.md), die
// (noch) keinen sauberen Platz im öffentlichen API haben. Nie von externen Konsumenten/Tests
// verwenden; nur von Modulen, die shaded-engine.mjs selbst aufgeteilt hat.
// time/heatWarp sind Getter (kein Snapshot), weil beide `let`-Variablen sind, die jeden Frame
// neu berechnet werden — eine Kopie zum Bridge-Aufbauzeitpunkt wäre sofort veraltet.
window.SHADED_ENGINE_INTERNAL = { PARAMS, CUR, get time(){return time;}, get heatWarp(){return heatWarp;} };

export default window.SHADED;
