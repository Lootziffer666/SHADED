const EFFECTS = [
  {
    id: 'water', group: 'LIQUID', label: 'Water / Ocean', mode: 0, shape: 'plane',
    donor: 'WaterThreeJS · jeantimex/threejs-water · Three.js Water',
    donorUrl: 'https://github.com/achrefelouafi/WaterThreeJS',
    note: 'Gerstner-artige Wellen, Fresnel, Absorption, Foam und Caustic-Anmutung.',
    defaults: { intensity: .78, detail: .72, scale: 1.15, speed: .62, roughness: .12, wetness: 1, opacity: .92, temperature: .48, displacement: .58 },
    controls: ['intensity','detail','scale','speed','roughness','opacity','displacement'],
  },
  {
    id: 'ice', group: 'LIQUID', label: 'Ice / Frost', mode: 1, shape: 'sphere',
    donor: 'Three.js Caustics · Elemental Sandbox', donorUrl: 'https://github.com/achrefelouafi/LinearAbiltyCastingThreeJS',
    note: 'Frost, Risse, Fresnel-Rand und gefrorene Transmission-Anmutung.',
    defaults: { intensity: .76, detail: .82, scale: 1.25, speed: .08, roughness: .28, wetness: .36, opacity: .88, temperature: .14, displacement: .28 },
    controls: ['intensity','detail','scale','roughness','opacity','temperature','displacement'],
  },
  {
    id: 'sand', group: 'GROUND', label: 'Sand / Dunes', mode: 2, shape: 'both',
    donor: 'Texture-splatting / triplanar terrain techniques', donorUrl: 'https://threejs.org/docs/pages/TSL.html',
    note: 'Dünen, Körnung, warme Streuung und glancing highlights.',
    defaults: { intensity: .68, detail: .75, scale: 1.5, speed: .04, roughness: .78, wetness: .05, opacity: 1, temperature: .72, displacement: .5 },
    controls: ['intensity','detail','scale','roughness','temperature','displacement'],
  },
  {
    id: 'mud', group: 'GROUND', label: 'Mud', mode: 3, shape: 'both',
    donor: 'Soil Studio · BasicProceduralBuilding', donorUrl: 'https://github.com/achrefelouafi/GrassSystemThreeJS',
    note: 'Feuchte Erde, Pfützeninseln, plastische Unebenheit und nasse Reflexion.',
    defaults: { intensity: .78, detail: .72, scale: 1.35, speed: .03, roughness: .42, wetness: .8, opacity: 1, temperature: .42, displacement: .64 },
    controls: ['intensity','detail','scale','roughness','wetness','displacement'],
  },
  {
    id: 'soil', group: 'GROUND', label: 'Dry Soil / Cracks', mode: 4, shape: 'both',
    donor: 'Soil Studio', donorUrl: 'https://github.com/achrefelouafi/GrassSystemThreeJS',
    note: 'Trockene Erde mit Crack-Feld, Körnung und Relief.',
    defaults: { intensity: .74, detail: .88, scale: 1.45, speed: 0, roughness: .82, wetness: .05, opacity: 1, temperature: .64, displacement: .72 },
    controls: ['intensity','detail','scale','roughness','wetness','temperature','displacement'],
  },
  {
    id: 'wet', group: 'GROUND', label: 'Wet Surface / Puddles', mode: 7, shape: 'both',
    donor: 'BasicProceduralBuilding', donorUrl: 'https://github.com/achrefelouafi/BasicProceduralBuilding',
    note: 'Materialverdunkelung, Roughness-Absenkung, Puddle-Mask und bewegte Ripples.',
    defaults: { intensity: .8, detail: .6, scale: 1.1, speed: .28, roughness: .2, wetness: .9, opacity: 1, temperature: .44, displacement: .22 },
    controls: ['intensity','detail','scale','speed','roughness','wetness'],
  },
  {
    id: 'snow', group: 'GROUND', label: 'Snow / Ice Sparkle', mode: 6, shape: 'both',
    donor: 'SnowSystemThreeJS', donorUrl: 'https://github.com/achrefelouafi/SnowSystemThreeJS',
    note: 'Schneeauflage, Drift-Bumps, kalte Schatten und Sparkles.',
    defaults: { intensity: .82, detail: .76, scale: 1.2, speed: .12, roughness: .7, wetness: .18, opacity: 1, temperature: .08, displacement: .58 },
    controls: ['intensity','detail','scale','roughness','wetness','temperature','displacement'],
  },
  {
    id: 'moss', group: 'GROUND', label: 'Moss / Organic', mode: 8, shape: 'both',
    donor: 'Soil Studio', donorUrl: 'https://github.com/achrefelouafi/GrassSystemThreeJS',
    note: 'Feuchtigkeitsabhängige Moosinseln mit weicher Mikrostruktur.',
    defaults: { intensity: .72, detail: .82, scale: 1.25, speed: .02, roughness: .66, wetness: .44, opacity: 1, temperature: .48, displacement: .52 },
    controls: ['intensity','detail','scale','roughness','wetness','displacement'],
  },
  {
    id: 'lava', group: 'ENERGY', label: 'Lava / Magma', mode: 5, shape: 'both',
    donor: 'Elemental Sandbox · glsl-plasma', donorUrl: 'https://github.com/achrefelouafi/LinearAbiltyCastingThreeJS',
    note: 'Dunkle Kruste, emissive Risse, Glutadern und langsamer Materialfluss.',
    defaults: { intensity: .9, detail: .82, scale: 1.3, speed: .36, roughness: .58, wetness: 0, opacity: 1, temperature: .98, displacement: .58 },
    controls: ['intensity','detail','scale','speed','roughness','temperature','displacement'],
  },
  {
    id: 'fire', group: 'VOLUME', label: 'Fire', mode: 11, shape: 'volume',
    donor: 'THREE.Fire · fire-simulation', donorUrl: 'https://github.com/mattatz/THREE.Fire',
    note: 'Volumetrische Flammenform mit Noise-Advektion und temperaturabhängiger Emission.',
    defaults: { intensity: .9, detail: .74, scale: 1.05, speed: .82, roughness: .2, wetness: 0, opacity: .86, temperature: 1, displacement: .4 },
    controls: ['intensity','detail','scale','speed','opacity','temperature'],
  },
  {
    id: 'smoke', group: 'VOLUME', label: 'Smoke', mode: 12, shape: 'volume',
    donor: 'SmokeGL · three.js-volume-renderer', donorUrl: 'https://github.com/Donitzo/three.js-volume-renderer',
    note: 'Dichter aufsteigender Rauch mit Turbulenz, Extinction und weichem Licht.',
    defaults: { intensity: .72, detail: .78, scale: 1.2, speed: .38, roughness: .5, wetness: 0, opacity: .74, temperature: .56, displacement: .35 },
    controls: ['intensity','detail','scale','speed','opacity','temperature'],
  },
  {
    id: 'steam', group: 'VOLUME', label: 'Steam', mode: 13, shape: 'volume',
    donor: 'three.js-volume-renderer', donorUrl: 'https://github.com/Donitzo/three.js-volume-renderer',
    note: 'Leichter, heller Dampf mit schneller Advektion und geringer Extinction.',
    defaults: { intensity: .58, detail: .68, scale: 1.12, speed: .66, roughness: .5, wetness: .15, opacity: .52, temperature: .76, displacement: .3 },
    controls: ['intensity','detail','scale','speed','opacity','temperature'],
  },
  {
    id: 'fog', group: 'VOLUME', label: 'Fog / Ground Mist', mode: 14, shape: 'volume',
    donor: 'three.js-volume-renderer · three-gpu-pathtracer volume ideas', donorUrl: 'https://github.com/Donitzo/three.js-volume-renderer',
    note: 'Bodennaher Nebel mit geschichteter Dichte und Distanzabsorption.',
    defaults: { intensity: .55, detail: .58, scale: 1.4, speed: .18, roughness: .5, wetness: .2, opacity: .58, temperature: .38, displacement: .2 },
    controls: ['intensity','detail','scale','speed','opacity'],
  },
  {
    id: 'cloud', group: 'VOLUME', label: 'Volumetric Cloud', mode: 15, shape: 'volume',
    donor: 'volumetric-clouds · THREE.Cloud', donorUrl: 'https://github.com/leoawen/volumetric-clouds',
    note: 'Raymarched Wolkendichte mit Lichtabsorption und Silver-Lining-Anmutung.',
    defaults: { intensity: .72, detail: .8, scale: .92, speed: .18, roughness: .5, wetness: 0, opacity: .72, temperature: .52, displacement: .25 },
    controls: ['intensity','detail','scale','speed','opacity'],
  },
  {
    id: 'hologram', group: 'FX', label: 'Hologram', mode: 9, shape: 'sphere',
    donor: 'threejs-vanilla-holographic-material', donorUrl: 'https://github.com/ektogamat/threejs-vanilla-holographic-material',
    note: 'Fresnel, Scanlines, Signalstörung und additive Emission.',
    defaults: { intensity: .82, detail: .66, scale: 1.2, speed: .5, roughness: .2, wetness: 0, opacity: .74, temperature: .35, displacement: .16 },
    controls: ['intensity','detail','scale','speed','opacity'],
  },
  {
    id: 'dissolve', group: 'FX', label: 'Dissolve / Burn', mode: 10, shape: 'sphere',
    donor: 'emissive-dissolve-effect', donorUrl: 'https://github.com/JatinChopra/emissive-dissolve-effect',
    note: 'Noise-basierte Auflösung mit heißem Emissive-Rand.',
    defaults: { intensity: .52, detail: .8, scale: 1.15, speed: .08, roughness: .44, wetness: 0, opacity: 1, temperature: .9, displacement: .22 },
    controls: ['intensity','detail','scale','speed','roughness','temperature'],
  },
];

const CONTROL_DEFS = {
  intensity: { label: 'Stärke', min: 0, max: 1, step: .01 },
  detail: { label: 'Detail', min: 0, max: 1, step: .01 },
  scale: { label: 'Maßstab', min: .25, max: 3, step: .01 },
  speed: { label: 'Bewegung', min: 0, max: 2, step: .01 },
  roughness: { label: 'Rauheit', min: 0, max: 1, step: .01 },
  wetness: { label: 'Nässe', min: 0, max: 1, step: .01 },
  opacity: { label: 'Dichte / Alpha', min: .05, max: 1, step: .01 },
  temperature: { label: 'Temperatur', min: 0, max: 1, step: .01 },
  displacement: { label: 'Relief', min: 0, max: 1, step: .01 },
};

const state = {
  effect: EFFECTS[0], params: { ...EFFECTS[0].defaults },
  paused: false, quality: matchMedia('(max-width: 720px)').matches ? .62 : .88,
  yaw: .56, pitch: .16, zoom: 3.2, shape: EFFECTS[0].shape,
  material: null, materialName: 'Procedural', search: '', group: 'ALL',
};

const $ = (sel) => document.querySelector(sel);
const canvas = $('#sandbox-canvas');
const statusEl = $('#sandbox-status');
const fpsEl = $('#sandbox-fps');
const effectTitleEl = $('#effect-title');
const effectNoteEl = $('#effect-note');
const donorEl = $('#effect-donor');
const libraryEl = $('#effect-library');
const controlsEl = $('#sandbox-controls');
const materialSelect = $('#material-select');
const materialStatus = $('#material-status');

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform int uMode;
uniform int uShape;
uniform float uIntensity;
uniform float uDetail;
uniform float uScale;
uniform float uSpeed;
uniform float uRoughness;
uniform float uWetness;
uniform float uOpacity;
uniform float uTemperature;
uniform float uDisplacement;
uniform float uYaw;
uniform float uPitch;
uniform float uZoom;
uniform int uVolumeSteps;
uniform sampler2D uAlbedo;
uniform sampler2D uRough;
uniform int uHasAlbedo;
uniform int uHasRough;

#define PI 3.14159265359

float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash31(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
float noise2(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),f.x),f.y);
}
float noise3(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float n000=hash31(i), n100=hash31(i+vec3(1,0,0)), n010=hash31(i+vec3(0,1,0)), n110=hash31(i+vec3(1,1,0));
  float n001=hash31(i+vec3(0,0,1)), n101=hash31(i+vec3(1,0,1)), n011=hash31(i+vec3(0,1,1)), n111=hash31(i+1.0);
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}
float fbm2(vec2 p){ float a=.5,v=0.; mat2 m=mat2(1.62,1.18,-1.18,1.62); for(int i=0;i<5;i++){v+=a*noise2(p);p=m*p+.17;a*=.5;} return v; }
float fbm3(vec3 p){ float a=.5,v=0.; for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.03+vec3(.13,.17,.11);a*=.5;} return v; }
float crack2(vec2 p){
  vec2 g=floor(p), f=fract(p); float d=9.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y)); vec2 r=o+vec2(hash21(g+o),hash21(g+o+19.7))-f; d=min(d,dot(r,r));
  }
  return sqrt(d);
}
vec3 sky(vec3 rd){
  float h=clamp(rd.y*.5+.5,0.,1.); vec3 lo=mix(vec3(.055,.065,.085),vec3(.18,.22,.29),uTemperature); vec3 hi=mix(vec3(.22,.33,.52),vec3(.55,.38,.28),uTemperature*.55);
  vec3 c=mix(lo,hi,pow(h,.65)); vec3 sunDir=normalize(vec3(-.55,.72,.35)); float sun=pow(max(dot(rd,sunDir),0.),720.); c+=sun*vec3(5.0,3.6,2.2); return c;
}
float sphereHit(vec3 ro,vec3 rd,vec3 c,float r){ vec3 oc=ro-c; float b=dot(oc,rd), h=b*b-dot(oc,oc)+r*r; if(h<0.)return -1.; return -b-sqrt(h); }
float planeHit(vec3 ro,vec3 rd,float y){ if(abs(rd.y)<.0001)return -1.; float t=(y-ro.y)/rd.y; return t>0.?t:-1.; }
vec3 triplanarAlbedo(vec3 p,vec3 n){
  if(uHasAlbedo==0) return vec3(1.0);
  vec3 w=pow(abs(n),vec3(5.0)); w/=max(dot(w,vec3(1.0)),.0001); float s=max(.2,uScale)*.72;
  vec3 x=texture(uAlbedo,p.yz*s).rgb, y=texture(uAlbedo,p.xz*s).rgb, z=texture(uAlbedo,p.xy*s).rgb;
  return x*w.x+y*w.y+z*w.z;
}
float triplanarRough(vec3 p,vec3 n){
  if(uHasRough==0) return uRoughness;
  vec3 w=pow(abs(n),vec3(5.0)); w/=max(dot(w,vec3(1.0)),.0001); float s=max(.2,uScale)*.72;
  float x=texture(uRough,p.yz*s).r, y=texture(uRough,p.xz*s).r, z=texture(uRough,p.xy*s).r;
  return clamp((x*w.x+y*w.y+z*w.z)*.85+uRoughness*.15,0.,1.);
}
vec3 perturbNormal(vec3 p,vec3 n,float amp){
  float e=.018/max(uScale,.25), s=max(.25,uScale)*(2.5+uDetail*7.0);
  float a=fbm3(p*s+uTime*uSpeed*.08); float ax=fbm3((p+vec3(e,0,0))*s+uTime*uSpeed*.08); float az=fbm3((p+vec3(0,0,e))*s+uTime*uSpeed*.08);
  vec3 g=vec3((ax-a)/e,0.,(az-a)/e); return normalize(n-g*amp*uDisplacement*.15);
}
vec3 pbrLite(vec3 base,vec3 n,vec3 v,float rough,float metallic,float emissive){
  vec3 l=normalize(vec3(-.55,.72,.35)), h=normalize(l+v); float ndl=max(dot(n,l),0.), ndv=max(dot(n,v),0.);
  float shin=mix(220.,5.,rough*rough); float spec=pow(max(dot(n,h),0.),shin)*(1.-rough*.7); vec3 f0=mix(vec3(.035),base,metallic); float fres=pow(1.-ndv,5.);
  vec3 diff=base*(.18+.82*ndl)*(1.-metallic*.7); vec3 refl=sky(reflect(-v,n)); vec3 col=diff+f0*spec*(1.5+ndl)+refl*(fres*(1.-rough*.68)); return col+base*emissive;
}

vec4 surfaceMaterial(vec3 p,vec3 n,vec3 v,int mode){
  float t=uTime*uSpeed, sc=max(.25,uScale), d=uDetail;
  vec3 tex=triplanarAlbedo(p,n); float rough=triplanarRough(p,n); vec3 base=vec3(.5); float metallic=0., emissive=0.; float alpha=1.;
  if(mode==0){
    float w=sin((p.x+p.z*.62)*5.2*sc+t*1.8)*.5+sin((p.z-p.x*.35)*8.4*sc-t*1.25)*.25+fbm2(p.xz*3.1*sc+t*.11)*.5;
    vec3 nn=normalize(n+vec3(cos((p.x+p.z)*5.2*sc+t*1.8),.0,sin((p.z-p.x)*8.4*sc-t))*uDisplacement*.18);
    float fres=pow(1.-max(dot(nn,v),0.),4.); vec3 deep=mix(vec3(.008,.08,.10),vec3(.015,.12,.2),uTemperature); vec3 shallow=vec3(.07,.3,.36);
    base=mix(deep,shallow,clamp(.4+w*.2,0.,1.)); float foam=smoothstep(.52,.78,fbm2(p.xz*6.*sc+t*.18)+w*.18)*uIntensity;
    vec3 refl=sky(reflect(-v,nn)); vec3 c=mix(base,refl,.2+fres*.72); c=mix(c,vec3(.86,.94,.9),foam*.72); return vec4(c,uOpacity);
  } else if(mode==1){
    float c=crack2(p.xz*7.*sc+fbm2(p.xz*1.4)*.8); float edge=1.-smoothstep(.055,.13,c); float frost=smoothstep(.48,.78,fbm3(p*5.*sc));
    n=perturbNormal(p,n,.55); base=mix(vec3(.18,.38,.48),vec3(.72,.9,.96),frost*.62); base=mix(base,vec3(.92,.98,1.),edge*.8); rough=mix(.08,.72,frost)*mix(.7,1.,uRoughness);
    vec3 ccol=pbrLite(base*mix(vec3(1.),tex,.12),n,v,rough,0.,edge*.05); ccol+=sky(reflect(-v,n))*pow(1.-max(dot(n,v),0.),3.)*.55; return vec4(ccol,uOpacity);
  } else if(mode==2){
    float dune=.5+.5*sin((p.x*.68+p.z)*3.6*sc+fbm2(p.xz*.9*sc)*4.); float grain=hash31(floor(p*120.*mix(.3,1.,d)));
    n=perturbNormal(p,n,.38); base=mix(vec3(.48,.26,.10),vec3(.86,.62,.28),dune*.7+.15); base*=mix(.82,1.12,grain*.25*d); base*=mix(vec3(1.),tex,.35);
  } else if(mode==3){
    float pudd=fbm2(p.xz*1.8*sc+t*.015); float pool=smoothstep(.58,.68,pudd)*uWetness; float lump=fbm3(p*4.5*sc);
    n=perturbNormal(p,n,.7*(1.-pool)); base=mix(vec3(.11,.055,.025),vec3(.25,.12,.055),lump); base*=mix(vec3(1.),tex,.38); rough=mix(.68,.05,pool)*mix(.72,1.2,uRoughness+.15); vec3 c=pbrLite(base,n,v,rough,0.,0.); c=mix(c,c+sky(reflect(-v,n))*.5,pool); return vec4(c,1.);
  } else if(mode==4){
    float cell=crack2(p.xz*(6.+d*9.)*sc); float crack=1.-smoothstep(.04,.095,cell); float grain=fbm3(p*9.*sc);
    n=perturbNormal(p,n,.8); base=mix(vec3(.21,.09,.035),vec3(.42,.22,.09),grain); base*=1.-crack*.72; base*=mix(vec3(1.),tex,.45); rough=clamp(rough+.18,0.,1.);
  } else if(mode==5){
    float cell=crack2(p.xz*(4.+d*5.)*sc+vec2(t*.07,-t*.05)); float fiss=1.-smoothstep(.055,.16,cell); float flow=fbm2(p.xz*2.4*sc+vec2(t*.12,-t*.08)); fiss=clamp(fiss+smoothstep(.62,.8,flow)*.28,0.,1.);
    n=perturbNormal(p,n,.52); vec3 hot=mix(vec3(1.,.08,.005),vec3(1.,.72,.08),uTemperature); base=mix(vec3(.018,.012,.012),hot,fiss); emissive=fiss*(2.2+uIntensity*3.8); rough=mix(.72,.25,fiss);
  } else if(mode==6){
    float drift=fbm3(p*2.8*sc), micro=fbm3(p*14.*sc); n=perturbNormal(p,n,.55); base=mix(vec3(.57,.68,.78),vec3(.96,.98,1.),.5+drift*.5); base*=mix(vec3(1.),tex,.12); rough=mix(.88,.55,micro)*mix(.8,1.05,uRoughness+.1);
    float sparkle=step(.996,hash31(floor(p*190.)))*pow(max(dot(reflect(-normalize(vec3(-.55,.72,.35)),n),v),0.),12.); emissive=sparkle*4.;
  } else if(mode==7){
    float pool=smoothstep(.52,.7,fbm2(p.xz*2.1*sc+vec2(t*.015))); float ripple=sin(length(fract(p.xz*sc*2.)-.5)*32.-t*4.)*.5+.5; pool*=mix(.35,1.,uWetness);
    n=perturbNormal(p,n,.26); base=mix(vec3(.23,.25,.26),tex,uHasAlbedo==1?.75:0.); base*=mix(1.,.56,uWetness); rough=mix(max(.22,rough),.035,pool); vec3 c=pbrLite(base,n,v,rough,0.,0.); c+=sky(reflect(-v,n))*pool*(.28+.2*ripple*uIntensity); return vec4(c,1.);
  } else if(mode==8){
    float moss=smoothstep(.48,.67,fbm3(p*2.6*sc)+uWetness*.18); float fuzz=fbm3(p*15.*sc); n=perturbNormal(p,n,.5); vec3 stone=mix(vec3(.19,.18,.15),tex,uHasAlbedo==1?.55:0.); base=mix(stone,mix(vec3(.025,.11,.035),vec3(.13,.34,.07),fuzz),moss*uIntensity); rough=mix(rough,.82,moss);
  } else if(mode==9){
    float scan=.55+.45*sin((p.y*48.*sc-t*9.)+fbm3(p*4.)*2.); float glitch=step(.86,noise2(vec2(floor(p.y*18.-t*2.),floor(t*3.)))); float rim=pow(1.-max(dot(n,v),0.),2.2); base=vec3(.02,.48,.92)*(scan*.65+.35)+vec3(.3,.8,1.)*rim; base*=1.+glitch*.8; emissive=1.1+uIntensity*2.; alpha=uOpacity*(.42+.58*rim);
  } else if(mode==10){
    float field=fbm3(p*(3.5+d*5.)*sc+vec3(0,t*.08,0)); float cut=uIntensity; float edge=1.-smoothstep(.0,.07,abs(field-cut)); if(field<cut-.045) discard; base=mix(vec3(.14,.16,.18),tex,uHasAlbedo==1?.75:0.); base=mix(base,vec3(1.,.18,.02),edge); emissive=edge*(2.+uTemperature*4.); alpha=1.;
  }
  return vec4(pbrLite(base,n,v,clamp(rough,0.,1.),metallic,emissive),alpha);
}

float volumeDensity(vec3 p,int mode,float time){
  float sc=max(.25,uScale), d=uDetail; vec3 q=p; float dens=0.;
  if(mode==11){
    float y=(p.y+.62)/2.2; float radius=mix(.62,.10,clamp(y,0.,1.)); q.xz/=max(radius,.08); q.y*=1.4; float core=max(0.,1.-length(q.xz)); float n=fbm3(vec3(q.x*2.4,q.y*2.2-time*1.7,q.z*2.4)*sc); dens=core*smoothstep(.28,.72,n+.36-y*.18)*(1.-smoothstep(.82,1.2,y));
  } else if(mode==12 || mode==13){
    float y=(p.y+.65)/2.4; float radius=mix(.34,.82,clamp(y,0.,1.)); q.xz/=radius; float core=max(0.,1.-length(q.xz)); float n=fbm3(vec3(q.x*1.7,q.y*1.25-time*(mode==13?.75:.38),q.z*1.7)*sc); dens=core*smoothstep(mode==13?.46:.38,.78,n+.22)*(1.-smoothstep(.88,1.25,y));
  } else if(mode==14){
    float h=exp(-max(0.,p.y+.6)*2.4); float n=fbm3(vec3(p.x*1.1,p.y*.55,p.z*1.1)*sc+vec3(time*.12,0,-time*.08)); dens=h*smoothstep(.32,.72,n)*.9;
  } else if(mode==15){
    vec3 c=p-vec3(0,.32,0); c.x*=.72; c.y*=1.05; float body=max(0.,1.-length(c)); float n=fbm3((p*1.45+vec3(time*.08,0,time*.025))*sc); dens=smoothstep(.28,.66,n+body*.42-.22)*(body);
  }
  return dens*uIntensity;
}
vec3 volumeColor(int mode,float d,float y){
  if(mode==11){ float hot=clamp(d*1.4+(1.-y)*.35,0.,1.); return mix(vec3(.65,.025,.003),mix(vec3(1.,.16,.005),vec3(1.,.92,.2),hot),uTemperature); }
  if(mode==12) return mix(vec3(.055,.06,.07),vec3(.34,.36,.38),uTemperature*.3+d*.35);
  if(mode==13) return mix(vec3(.48,.56,.62),vec3(.92,.95,.96),.55+d*.35);
  if(mode==14) return mix(vec3(.16,.20,.24),vec3(.58,.65,.7),uTemperature*.35+.25);
  return mix(vec3(.36,.43,.5),vec3(.96,.98,1.),.55+d*.35);
}
vec4 renderVolume(vec3 ro,vec3 rd,int mode){
  float t0=.2,t1=6.; vec3 col=vec3(0.); float trans=1.; float time=uTime*uSpeed; int steps=max(16,uVolumeSteps); float dt=(t1-t0)/float(steps);
  for(int i=0;i<64;i++){
    if(i>=steps) break; float t=t0+(float(i)+.5)*dt; vec3 p=ro+rd*t; if(abs(p.x)>2.8||p.y<-1.0||p.y>2.4||abs(p.z)>2.8) continue;
    float den=volumeDensity(p,mode,time); if(den<.006) continue; float alpha=1.-exp(-den*dt*(mode==13?1.35:2.6)*uOpacity); vec3 c=volumeColor(mode,den,clamp((p.y+.6)/2.4,0.,1.));
    float light=.45+.55*noise3(p*2.1+vec3(1.7,3.1,2.3)); if(mode==11) light=1.; c*=light; col+=trans*c*alpha; trans*=1.-alpha; if(trans<.02) break;
  }
  return vec4(col,1.-trans);
}

void main(){
  vec2 uv=(gl_FragCoord.xy*2.-uResolution.xy)/uResolution.y;
  vec3 target=vec3(0.,.16,0.); float cp=cos(uPitch),sp=sin(uPitch),cy=cos(uYaw),sy=sin(uYaw);
  vec3 ro=target+vec3(sy*cp,sp,cy*cp)*uZoom; vec3 fw=normalize(target-ro), rt=normalize(cross(fw,vec3(0,1,0))), up=cross(rt,fw); vec3 rd=normalize(fw+uv.x*rt+uv.y*up);
  vec3 bg=sky(rd);
  if(uMode>=11){
    float pg=planeHit(ro,rd,-.62); if(pg>0.){ vec3 p=ro+rd*pg; float grid=.5+.5*fbm2(p.xz*2.); vec3 ground=mix(vec3(.03),vec3(.075,.08,.085),grid); float fog=exp(-pg*.12); bg=mix(sky(rd),ground,fog); }
    vec4 vol=renderVolume(ro,rd,uMode); vec3 c=bg*(1.-vol.a)+vol.rgb; fragColor=vec4(pow(max(c,0.),vec3(.4545)),1.); return;
  }
  float ts=(uShape==1)?-1.:sphereHit(ro,rd,vec3(0,.18,0),.82); float tp=(uShape==2)?-1.:planeHit(ro,rd,-.62); float t=-1.; bool sphere=false;
  if(ts>0. && (tp<0.||ts<tp)){t=ts;sphere=true;} else if(tp>0.) t=tp;
  if(t<0.){fragColor=vec4(pow(max(bg,0.),vec3(.4545)),1.);return;}
  vec3 p=ro+rd*t; vec3 n=sphere?normalize(p-vec3(0,.18,0)):vec3(0,1,0); vec3 v=normalize(ro-p);
  if(!sphere){ float fade=smoothstep(5.5,1.2,length(p.xz)); bg=mix(bg,vec3(.025),fade*.05); }
  vec4 mat=surfaceMaterial(p,n,v,uMode); float distFog=1.-exp(-t*.035); vec3 c=mix(mat.rgb,bg,distFog); fragColor=vec4(pow(max(c,0.),vec3(.4545)),mat.a);
}`;

class SandboxRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('WebGL 2 ist nicht verfügbar.');
    this.program = this.createProgram(VERT, FRAG);
    this.uniform = {};
    for (const name of ['uResolution','uTime','uMode','uShape','uIntensity','uDetail','uScale','uSpeed','uRoughness','uWetness','uOpacity','uTemperature','uDisplacement','uYaw','uPitch','uZoom','uVolumeSteps','uAlbedo','uRough','uHasAlbedo','uHasRough']) {
      this.uniform[name] = this.gl.getUniformLocation(this.program, name);
    }
    this.albedo = this.makeFallbackTexture([255,255,255,255]);
    this.rough = this.makeFallbackTexture([128,128,128,255]);
    this.hasAlbedo = 0; this.hasRough = 0;
    this.started = performance.now(); this.last = performance.now(); this.frames = 0; this.fps = 0; this.raf = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas);
    this.resize(); this.frame = this.frame.bind(this); this.raf = requestAnimationFrame(this.frame);
  }
  shader(type, source) {
    const gl=this.gl,s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||'Shader compile failed'); return s;
  }
  createProgram(vs,fs){
    const gl=this.gl,p=gl.createProgram(); gl.attachShader(p,this.shader(gl.VERTEX_SHADER,vs)); gl.attachShader(p,this.shader(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||'Program link failed'); return p;
  }
  makeFallbackTexture(rgba){ const gl=this.gl,t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba)); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT); return t; }
  textureFromImage(img){ const gl=this.gl,t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT); return t; }
  async loadTexture(url, slot){ const img=new Image(); img.decoding='async'; img.src=url; await img.decode(); const tex=this.textureFromImage(img); if(slot==='albedo'){this.albedo=tex;this.hasAlbedo=1;} else {this.rough=tex;this.hasRough=1;} }
  clearTextures(){ this.hasAlbedo=0; this.hasRough=0; }
  resize(){ const dpr=Math.min(devicePixelRatio||1,2)*state.quality; const w=Math.max(2,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(2,Math.floor(this.canvas.clientHeight*dpr)); if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;} }
  frame(now){ this.raf=requestAnimationFrame(this.frame); if(state.paused) return; const gl=this.gl; this.resize(); gl.viewport(0,0,this.canvas.width,this.canvas.height); gl.useProgram(this.program);
    const p=state.params,u=this.uniform; gl.uniform2f(u.uResolution,this.canvas.width,this.canvas.height); gl.uniform1f(u.uTime,(now-this.started)/1000); gl.uniform1i(u.uMode,state.effect.mode); gl.uniform1i(u.uShape,({both:0,plane:1,sphere:2,volume:0})[state.shape]??0);
    gl.uniform1f(u.uIntensity,p.intensity);gl.uniform1f(u.uDetail,p.detail);gl.uniform1f(u.uScale,p.scale);gl.uniform1f(u.uSpeed,p.speed);gl.uniform1f(u.uRoughness,p.roughness);gl.uniform1f(u.uWetness,p.wetness);gl.uniform1f(u.uOpacity,p.opacity);gl.uniform1f(u.uTemperature,p.temperature);gl.uniform1f(u.uDisplacement,p.displacement);gl.uniform1f(u.uYaw,state.yaw);gl.uniform1f(u.uPitch,state.pitch);gl.uniform1f(u.uZoom,state.zoom);gl.uniform1i(u.uVolumeSteps,state.quality>.8?56:state.quality>.55?40:28);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.albedo);gl.uniform1i(u.uAlbedo,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.rough);gl.uniform1i(u.uRough,1);gl.uniform1i(u.uHasAlbedo,this.hasAlbedo);gl.uniform1i(u.uHasRough,this.hasRough); gl.drawArrays(gl.TRIANGLES,0,3);
    this.frames++; if(now-this.last>700){this.fps=this.frames*1000/(now-this.last);this.frames=0;this.last=now;fpsEl.textContent=`${this.fps.toFixed(0)} FPS · ${this.canvas.width}×${this.canvas.height}`;}
  }
}

let renderer;
try {
  renderer = new SandboxRenderer(canvas);
  statusEl.textContent = 'GLSL ES 3.00 · LIVE';
  $('#sandbox-engine-state').classList.add('ready');
} catch (error) {
  console.error(error); statusEl.textContent = `FAILED · ${error.message}`; statusEl.classList.add('error');
}

function renderLibrary() {
  const q=state.search.trim().toLowerCase(); libraryEl.innerHTML='';
  const groups=['ALL',...new Set(EFFECTS.map(e=>e.group))];
  $('#sandbox-groups').innerHTML=groups.map(g=>`<button type="button" class="group-chip${state.group===g?' active':''}" data-group="${g}">${g}</button>`).join('');
  for(const effect of EFFECTS){
    if(state.group!=='ALL'&&effect.group!==state.group) continue;
    if(q&&!`${effect.label} ${effect.id} ${effect.group} ${effect.note}`.toLowerCase().includes(q)) continue;
    const b=document.createElement('button'); b.type='button'; b.className=`effect-card${effect.id===state.effect.id?' active':''}`; b.dataset.effect=effect.id;
    b.innerHTML=`<span class="effect-dot effect-${effect.id}"></span><span><strong>${effect.label}</strong><small>${effect.group}</small></span>`; libraryEl.appendChild(b);
  }
}

function renderEffect() {
  effectTitleEl.textContent=state.effect.label; effectNoteEl.textContent=state.effect.note; donorEl.textContent=state.effect.donor; donorEl.href=state.effect.donorUrl;
  controlsEl.innerHTML='';
  for(const key of state.effect.controls){
    const def=CONTROL_DEFS[key],row=document.createElement('label'); row.className='sandbox-param';
    row.innerHTML=`<span>${def.label}</span><input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${state.params[key]}" data-param="${key}"><output>${Number(state.params[key]).toFixed(2)}</output>`;
    controlsEl.appendChild(row);
  }
  $('#shape-select').value=state.shape==='volume'?'both':state.shape;
  $('#shape-field').hidden=state.effect.mode>=11;
  renderLibrary();
}

function selectEffect(id){
  const effect=EFFECTS.find(e=>e.id===id); if(!effect) return; state.effect=effect; state.params={...effect.defaults}; state.shape=effect.shape; renderEffect();
  statusEl.textContent=`${effect.label.toUpperCase()} · LIVE`;
}

libraryEl.addEventListener('click',e=>{const b=e.target.closest('[data-effect]');if(b)selectEffect(b.dataset.effect);});
$('#sandbox-groups').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(!b)return;state.group=b.dataset.group;renderLibrary();});
$('#effect-search').addEventListener('input',e=>{state.search=e.target.value;renderLibrary();});
controlsEl.addEventListener('input',e=>{const input=e.target.closest('[data-param]');if(!input)return;state.params[input.dataset.param]=Number(input.value);input.parentElement.querySelector('output').textContent=Number(input.value).toFixed(2);});
$('#shape-select').addEventListener('change',e=>{state.shape=e.target.value;});

$('#btn-reset-effect').addEventListener('click',()=>{state.params={...state.effect.defaults};state.shape=state.effect.shape;state.yaw=.56;state.pitch=.16;state.zoom=3.2;renderEffect();});
$('#btn-pause').addEventListener('click',e=>{state.paused=!state.paused;e.currentTarget.textContent=state.paused?'WEITER':'PAUSE';e.currentTarget.classList.toggle('active',state.paused);});
$('#quality-select').value=state.quality>=.8?'hq':state.quality>=.55?'balanced':'fast';
$('#quality-select').addEventListener('change',e=>{state.quality=({hq:1,balanced:.68,fast:.48})[e.target.value];renderer?.resize();});
$('#btn-library-toggle').addEventListener('click',()=>document.body.classList.toggle('library-closed'));
$('#btn-controls-toggle').addEventListener('click',()=>document.body.classList.toggle('controls-closed'));
$('#btn-library-close').addEventListener('click',()=>document.body.classList.add('library-closed'));
$('#btn-controls-close').addEventListener('click',()=>document.body.classList.add('controls-closed'));
$('#btn-fullscreen').addEventListener('click',async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();else await document.exitFullscreen?.();});

let dragging=false,lastX=0,lastY=0;
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;state.yaw-=dx*.006;state.pitch=Math.max(-1.05,Math.min(1.05,state.pitch+dy*.005));});
canvas.addEventListener('pointerup',e=>{dragging=false;canvas.releasePointerCapture?.(e.pointerId);});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(1.65,Math.min(6,state.zoom+e.deltaY*.003));},{passive:false});

async function imageFromFile(file){const url=URL.createObjectURL(file);try{await renderer.loadTexture(url,'albedo');state.materialName=file.name;materialStatus.textContent=`CUSTOM · ${file.name}`;materialSelect.value='';}finally{URL.revokeObjectURL(url);}}
$('#material-file').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)imageFromFile(f).catch(err=>materialStatus.textContent=`Fehler: ${err.message}`);});
$('#btn-material-clear').addEventListener('click',()=>{renderer?.clearTextures();state.material=null;state.materialName='Procedural';materialSelect.value='';materialStatus.textContent='PROCEDURAL · keine PBR-Textur';});

async function loadLocalLibrary(){
  try{
    const res=await fetch('/.cache/materials/freestylized/library-1k.json',{cache:'no-store'}); if(!res.ok)throw new Error('local library absent'); const lib=await res.json();
    const rows=lib.materials.filter(m=>(m.status==='downloaded'||m.status==='cached')&&m.channels?.albedo); materialSelect.innerHTML='<option value="">FreeStylized Material wählen …</option>';
    const byCat=Map.groupBy?Map.groupBy(rows,m=>m.category||'other'):rows.reduce((a,m)=>(a.set(m.category||'other',[...(a.get(m.category||'other')||[]),m]),a),new Map());
    for(const [cat,items] of byCat){const g=document.createElement('optgroup');g.label=cat.replaceAll('_',' ');for(const m of items){const o=document.createElement('option');o.value=m.id;o.textContent=m.name||m.id;o._material=m;g.appendChild(o);}materialSelect.appendChild(g);}
    materialSelect.disabled=false; materialStatus.textContent=`LOCAL · ${rows.length} FreeStylized Materials`; materialSelect._materials=new Map(rows.map(m=>[m.id,m]));
  }catch{ materialSelect.disabled=true; materialStatus.textContent='LOCAL LIBRARY OFFLINE · npm run materials:freestylized'; }
}
materialSelect.addEventListener('change',async e=>{
  const m=e.currentTarget._materials?.get(e.target.value);if(!m)return; materialStatus.textContent=`LADE · ${m.name||m.id}`;
  try{
    const base=`/.cache/materials/freestylized/1k/${encodeURIComponent(m.category||'uncategorized')}/${encodeURIComponent(m.id)}/`;
    if(m.channels.albedo)await renderer.loadTexture(base+m.channels.albedo.split('/').map(encodeURIComponent).join('/'),'albedo');
    if(m.channels.roughness)await renderer.loadTexture(base+m.channels.roughness.split('/').map(encodeURIComponent).join('/'),'rough'); else renderer.hasRough=0;
    state.material=m;state.materialName=m.name||m.id;materialStatus.textContent=`${m.category?.toUpperCase()||'MATERIAL'} · ${state.materialName}`;
  }catch(err){console.error(err);materialStatus.textContent=`MATERIAL FEHLER · ${err.message}`;}
});

$('#btn-export-preset').addEventListener('click',()=>{
  const payload={schema:'shaded.sandbox.effect.v1',effect:state.effect.id,params:state.params,shape:state.shape,material:state.material?{id:state.material.id,category:state.material.category,resolution:state.material.resolution,provenance:state.material.provenance}:null,donor:{label:state.effect.donor,url:state.effect.donorUrl}};
  const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`shaded-${state.effect.id}-preset.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
});

window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){document.body.classList.add('library-closed','controls-closed');}
  if(e.key.toLowerCase()==='l'&&!/input|select|textarea/i.test(e.target.tagName))document.body.classList.toggle('library-closed');
  if(e.key.toLowerCase()==='p'&&!/input|select|textarea/i.test(e.target.tagName))document.body.classList.toggle('controls-closed');
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.paused=true;$('#btn-pause').textContent='WEITER';}});

renderEffect();
loadLocalLibrary();
