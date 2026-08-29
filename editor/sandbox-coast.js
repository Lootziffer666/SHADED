const coastHost = document.querySelector('.sandbox-viewport');
const coastTop = document.querySelector('.sandbox-topbar .top-actions');
if (!coastHost || !coastTop) throw new Error('Coast Lab host missing');

const coastLaunch = document.createElement('button');
coastLaunch.type = 'button';
coastLaunch.className = 'ghost compact coast-launch';
coastLaunch.textContent = 'COAST';
coastLaunch.title = 'Depth-aware water, shoreline and dune lab';
const granularLaunch = coastTop.querySelector('.granular-launch');
coastTop.insertBefore(coastLaunch, granularLaunch || document.getElementById('btn-library-toggle'));

const coastCanvas = document.createElement('canvas');
coastCanvas.id = 'coast-canvas';
coastCanvas.setAttribute('aria-label', 'Stylized coast shader lab');
coastHost.prepend(coastCanvas);

const coastPanel = document.createElement('section');
coastPanel.className = 'coast-panel';
coastPanel.innerHTML = `
  <div class="coast-head"><strong>COAST LAB · DEPTH / SHORE / DUNES</strong><span class="coast-state" id="coast-state">START …</span></div>
  <div class="coast-grid" id="coast-controls"></div>
  <div class="coast-actions"><button type="button" id="coast-pause">PAUSE</button><button type="button" id="coast-reset">RESET</button><button type="button" id="coast-exit">MATERIAL LAB</button></div>
  <div class="coast-note">Ufer ist Geometrie: Wassertiefe steuert shallow/deep color, Absorption und Foam. Dünenrippel reagieren auf Windseite und Hangnormalen statt nur UV zu scrollen.</div>`;
coastHost.appendChild(coastPanel);

const coastDefaults = {
  waterLevel: 0.03,
  duneHeight: 0.72,
  waveHeight: 0.20,
  waveSpeed: 0.48,
  foam: 0.72,
  refraction: 0.34,
  absorption: 0.68,
  wind: 0.18,
  ripples: 0.72,
};
const coastState = {...coastDefaults, yaw:.64, pitch:.22, zoom:7.2, paused:false, active:false};
const coastDefs = {
  waterLevel:['Wasserstand',-.45,.55,.01], duneHeight:['Dünenhöhe',0,1.5,.01], waveHeight:['Wellenhöhe',0,.55,.01], waveSpeed:['Wellentempo',0,1.5,.01],
  foam:['Foam',0,1,.01], refraction:['Refraction',0,1,.01], absorption:['Absorption',0,1.5,.01], wind:['Windwinkel',-1,1,.01], ripples:['Sandrippel',0,1,.01],
};
const coastControls = coastPanel.querySelector('#coast-controls');
for (const [key,[label,min,max,step]] of Object.entries(coastDefs)) {
  const row=document.createElement('label'); row.className='coast-param';
  row.innerHTML=`<span>${label}</span><input data-coast="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${coastState[key]}"><output>${coastState[key].toFixed(2)}</output>`;
  coastControls.appendChild(row);
}
coastControls.addEventListener('input',e=>{const input=e.target.closest('[data-coast]');if(!input)return;coastState[input.dataset.coast]=Number(input.value);input.parentElement.querySelector('output').textContent=Number(input.value).toFixed(2);});

const COAST_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;

const COAST_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uWaterLevel;
uniform float uDuneHeight;
uniform float uWaveHeight;
uniform float uWaveSpeed;
uniform float uFoam;
uniform float uRefraction;
uniform float uAbsorption;
uniform float uWind;
uniform float uRipples;
uniform float uYaw;
uniform float uPitch;
uniform float uZoom;

float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.62,1.18,-1.18,1.62);for(int i=0;i<5;i++){v+=a*noise2(p);p=m*p+.13;a*=.5;}return v;}
float voronoi(vec2 x){vec2 n=floor(x),f=fract(x);float md=8.;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=vec2(hash21(n+g),hash21(n+g+19.17));vec2 r=g+o-f;md=min(md,dot(r,r));}return sqrt(md);}
vec2 windDir(){float a=uWind*3.14159265;return normalize(vec2(cos(a),sin(a)));}
float terrainHeight(vec2 p){
  float shore=.135*p.x-.20;
  float land=smoothstep(-2.2,3.2,p.x);
  float broad=sin(p.x*.52+p.y*.19)*.32+sin(p.x*.23-p.y*.41+1.7)*.24;
  float organic=(fbm(p*.21)-.5)*1.15;
  return shore+land*uDuneHeight*(broad+organic);
}
float waterHeight(vec2 p){
  float t=uTime*uWaveSpeed;
  vec2 w=windDir();
  float a=sin(dot(p,w)*2.0+t*1.8);
  float b=sin(dot(p,vec2(-w.y,w.x))*.95-t*.75+fbm(p*.12)*2.0);
  float c=(fbm(p*.48+w*t*.08)-.5)*1.2;
  return uWaterLevel+uWaveHeight*(a*.42+b*.23+c*.35);
}
vec3 normalTerrain(vec2 p){float e=.025,h=terrainHeight(p);return normalize(vec3(h-terrainHeight(p+vec2(e,0)),e,h-terrainHeight(p+vec2(0,e))));}
vec3 normalWater(vec2 p){float e=.018,h=waterHeight(p);return normalize(vec3(h-waterHeight(p+vec2(e,0)),e,h-waterHeight(p+vec2(0,e))));}
vec3 sky(vec3 rd){float h=clamp(rd.y*.5+.5,0.,1.);vec3 c=mix(vec3(.11,.15,.19),vec3(.42,.62,.82),pow(h,.7));vec3 sun=normalize(vec3(-.55,.72,.34));c+=pow(max(dot(rd,sun),0.),600.)*vec3(5.,3.5,2.);return c;}
float hitTerrain(vec3 ro,vec3 rd,float start){float t=max(.05,start);for(int i=0;i<110;i++){vec3 p=ro+rd*t;float h=p.y-terrainHeight(p.xz);if(h<.003)return t;t+=clamp(abs(h)*.38,.025,.32);if(t>32.)break;}return -1.;}
float hitWater(vec3 ro,vec3 rd){if(abs(rd.y)<.001)return -1.;float t=(uWaterLevel-ro.y)/rd.y;if(t<=0.)return -1.;for(int i=0;i<5;i++){vec3 p=ro+rd*t;float f=p.y-waterHeight(p.xz);t-=f/rd.y;}if(t<=0.||t>32.)return -1.;vec3 p=ro+rd*t;if(waterHeight(p.xz)<=terrainHeight(p.xz)+.01)return -1.;return t;}
vec3 sandColor(vec3 p,vec3 n,float dist){
  vec2 w=windDir(),side=vec2(-w.y,w.x);float slopeW=clamp(4.0*dot(n,normalize(vec3(w.x,.12,w.y))),0.,1.);float slopeL=clamp(10.0*dot(n,normalize(vec3(-w.x,.08,-w.y))),0.,1.);
  float along=dot(p.xz,w),across=dot(p.xz,side);float rw=.5+.5*sin(along*22.+across*1.6+uTime*.28);float rl=.5+.5*sin(along*9.-across*2.2-uTime*.12);
  float fade=1.-smoothstep(8.,22.,dist);float detail=(rw*slopeW+rl*slopeL)*uRipples*fade;float grain=(fbm(p.xz*5.5)-.5)*.18;
  vec3 base=mix(vec3(.34,.17,.055),vec3(.82,.57,.24),.58+grain);base*=.86+detail*.18;
  vec3 l=normalize(vec3(-.55,.72,.34));float ndl=max(dot(n,l),0.);return base*(.28+.72*ndl);
}
vec3 waterColor(vec3 ro,vec3 rd,vec3 p,vec3 n,float thickness,float dist){
  vec3 v=normalize(ro-p);float fres=pow(1.-max(dot(n,v),0.),4.);vec2 refracted=p.xz+n.xz*uRefraction*thickness*.42;
  float bedY=terrainHeight(refracted);vec3 bedP=vec3(refracted.x,bedY,refracted.y);vec3 bedN=normalTerrain(refracted);vec3 seabed=sandColor(bedP,bedN,dist+thickness);
  float depthRatio=clamp(thickness/2.7,0.,1.);vec3 shallow=vec3(.055,.43,.48),deep=vec3(.008,.075,.14);vec3 volume=mix(shallow,deep,depthRatio);
  vec3 absorbCoeff=mix(vec3(.22,.10,.05),vec3(.85,.32,.12),clamp(uAbsorption/1.5,0.,1.));vec3 trans=exp(-max(thickness,0.)*absorbCoeff*uAbsorption);
  vec3 refractedColor=mix(volume,seabed*volume*2.0,trans);
  vec3 reflected=sky(reflect(rd,n));vec3 c=mix(refractedColor,reflected,.12+fres*.72);
  float shore=1.-smoothstep(.05,.72,thickness);float crest=smoothstep(.58,.92,clamp((waterHeight(p.xz)-uWaterLevel)/max(.001,uWaveHeight)*.5+.5,0.,1.));
  vec2 flow=p.xz*1.7+windDir()*uTime*uWaveSpeed*.16;vec2 warp=vec2(noise2(flow),noise2(flow+vec2(4.7,1.9)))-.5;float cells=1.-voronoi(flow*2.1+warp*1.4);float bubbles=smoothstep(.26,.62,cells);
  float foamMask=clamp((shore+crest*.42)*uFoam,0.,1.)*bubbles;float foamEdge=clamp((shore+crest*.3)*uFoam,0.,1.)*smoothstep(.18,.38,cells)*(1.-bubbles);
  c=mix(c,vec3(.69,.77,.70),foamEdge*.38);c=mix(c,vec3(.92,.96,.90),foamMask*.88);return c;
}
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-uResolution.xy)/uResolution.y;
  float cp=cos(uPitch),sp=sin(uPitch),cy=cos(uYaw),sy=sin(uYaw);vec3 target=vec3(0.,-.05,0.);vec3 ro=target+vec3(sy*cp,sp,cy*cp)*uZoom;
  vec3 fw=normalize(target-ro),rt=normalize(cross(fw,vec3(0,1,0))),up=cross(rt,fw),rd=normalize(fw+uv.x*rt+uv.y*up);
  vec3 col=sky(rd);float tt=hitTerrain(ro,rd,.05),tw=hitWater(ro,rd);
  if(tw>0.&&(tt<0.||tw<tt)){
    vec3 p=ro+rd*tw;vec3 n=normalWater(p.xz);float thickness=max(0.,waterHeight(p.xz)-terrainHeight(p.xz));col=waterColor(ro,rd,p,n,thickness,tw);
  }else if(tt>0.){
    vec3 p=ro+rd*tt,n=normalTerrain(p.xz);col=sandColor(p,n,tt);float wet=1.-smoothstep(.02,.30,terrainHeight(p.xz)-uWaterLevel);col=mix(col,col*.55+vec3(.015,.035,.04),wet*.42);
  }
  float horizon=exp(-max(0.,min(tt>0.?tt:24.,tw>0.?tw:24.))*.028);col=mix(sky(rd),col,horizon);outColor=vec4(pow(max(col,0.),vec3(.4545)),1.);
}`;

class CoastRenderer{
  constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!this.gl)throw new Error('WebGL2 unavailable');this.program=this.makeProgram(COAST_VERT,COAST_FRAG);this.started=performance.now();this.last=this.started;this.frames=0;this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();this.loop=this.loop.bind(this);requestAnimationFrame(this.loop);}
  shader(type,src){const g=this.gl,s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s)||'coast shader compile failed');return s;}
  makeProgram(v,f){const g=this.gl,p=g.createProgram();g.attachShader(p,this.shader(g.VERTEX_SHADER,v));g.attachShader(p,this.shader(g.FRAGMENT_SHADER,f));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p)||'coast program link failed');return p;}
  resize(){const q=matchMedia('(max-width:700px)').matches ? .58 : .82;const dpr=Math.min(devicePixelRatio||1,2)*q,w=Math.max(2,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(2,Math.floor(this.canvas.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
  set(name,value){const g=this.gl,l=g.getUniformLocation(this.program,name);if(l!==null)g.uniform1f(l,value);}
  loop(now){requestAnimationFrame(this.loop);if(!coastState.active||coastState.paused)return;this.resize();const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.canvas.width,this.canvas.height);g.useProgram(this.program);g.uniform2f(g.getUniformLocation(this.program,'uResolution'),this.canvas.width,this.canvas.height);this.set('uTime',(now-this.started)/1000);this.set('uWaterLevel',coastState.waterLevel);this.set('uDuneHeight',coastState.duneHeight);this.set('uWaveHeight',coastState.waveHeight);this.set('uWaveSpeed',coastState.waveSpeed);this.set('uFoam',coastState.foam);this.set('uRefraction',coastState.refraction);this.set('uAbsorption',coastState.absorption);this.set('uWind',coastState.wind);this.set('uRipples',coastState.ripples);this.set('uYaw',coastState.yaw);this.set('uPitch',coastState.pitch);this.set('uZoom',coastState.zoom);g.drawArrays(g.TRIANGLES,0,3);this.frames++;if(now-this.last>700){const fps=this.frames*1000/(now-this.last);this.frames=0;this.last=now;document.getElementById('coast-state').textContent=`DEPTH LIVE · ${fps.toFixed(0)} FPS`;}}
}

let coastRenderer;
try{coastRenderer=new CoastRenderer(coastCanvas);document.getElementById('coast-state').textContent='GLSL READY';}
catch(error){console.error(error);document.getElementById('coast-state').textContent=`FAILED · ${error.message}`;coastLaunch.disabled=true;}

function coastEnter(){if(!coastRenderer)return;if(document.body.classList.contains('granular-mode'))document.querySelector('.granular-launch')?.click();document.body.classList.add('coast-mode','library-closed','controls-closed');coastLaunch.classList.add('active');coastState.active=true;}
function coastExit(){document.body.classList.remove('coast-mode');coastLaunch.classList.remove('active');coastState.active=false;}
coastLaunch.addEventListener('click',()=>document.body.classList.contains('coast-mode')?coastExit():coastEnter());
document.getElementById('coast-exit').addEventListener('click',coastExit);
document.getElementById('coast-pause').addEventListener('click',e=>{coastState.paused=!coastState.paused;e.currentTarget.textContent=coastState.paused?'PLAY':'PAUSE';e.currentTarget.classList.toggle('active',coastState.paused);});
document.getElementById('coast-reset').addEventListener('click',()=>{Object.assign(coastState,{...coastDefaults,yaw:.64,pitch:.22,zoom:7.2});coastControls.querySelectorAll('[data-coast]').forEach(input=>{input.value=coastState[input.dataset.coast];input.parentElement.querySelector('output').textContent=Number(input.value).toFixed(2);});});

document.addEventListener('click',e=>{if(document.body.classList.contains('coast-mode')&&e.target.closest('.granular-launch'))coastExit();},true);
for (const id of ['btn-library-toggle','btn-controls-toggle']) document.getElementById(id)?.addEventListener('click',()=>{if(document.body.classList.contains('coast-mode'))coastExit();},{capture:true});
let coastDrag=false,coastX=0,coastY=0;
coastCanvas.addEventListener('pointerdown',e=>{coastDrag=true;coastX=e.clientX;coastY=e.clientY;coastCanvas.setPointerCapture(e.pointerId);});
coastCanvas.addEventListener('pointermove',e=>{if(!coastDrag)return;coastState.yaw-=(e.clientX-coastX)*.006;coastState.pitch=Math.max(-.15,Math.min(1.05,coastState.pitch+(e.clientY-coastY)*.005));coastX=e.clientX;coastY=e.clientY;});
coastCanvas.addEventListener('pointerup',e=>{coastDrag=false;coastCanvas.releasePointerCapture?.(e.pointerId);});
coastCanvas.addEventListener('pointercancel',()=>{coastDrag=false;});
coastCanvas.addEventListener('wheel',e=>{e.preventDefault();coastState.zoom=Math.max(3.5,Math.min(14,coastState.zoom+e.deltaY*.006));},{passive:false});
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='c'&&!/input|select|textarea/i.test(e.target.tagName)){document.body.classList.contains('coast-mode')?coastExit():coastEnter();}});
