const host = document.querySelector('.sandbox-viewport');
const topActions = document.querySelector('.sandbox-topbar .top-actions');
if (!host || !topActions) throw new Error('Granular lab host missing');

const launch = document.createElement('button');
launch.type = 'button';
launch.className = 'ghost compact granular-launch';
launch.textContent = 'GRANULAR';
launch.title = 'GPU falling-sand / granular simulation';
topActions.insertBefore(launch, document.getElementById('btn-library-toggle'));

const canvas = document.createElement('canvas');
canvas.id = 'granular-canvas';
canvas.setAttribute('aria-label', 'GPU granular simulation');
host.prepend(canvas);

const panel = document.createElement('section');
panel.className = 'granular-panel';
panel.innerHTML = `
  <div class="granular-row">
    <span class="granular-kicker">GPU GRANULAR LAB</span>
    <span class="granular-state" id="granular-state">START …</span>
  </div>
  <div class="granular-row" role="group" aria-label="Granular brush">
    <button type="button" class="active" data-grain="sand">SAND</button>
    <button type="button" data-grain="water">WATER</button>
    <button type="button" data-grain="wall">WALL</button>
    <button type="button" data-grain="erase">ERASE</button>
    <select id="granular-size" aria-label="Brush size"><option value="5">BRUSH 5</option><option value="9" selected>BRUSH 9</option><option value="15">BRUSH 15</option><option value="24">BRUSH 24</option></select>
    <button type="button" id="granular-pause">PAUSE</button>
    <button type="button" id="granular-reset">RESET</button>
    <button type="button" id="granular-exit">MATERIAL LAB</button>
  </div>
  <div class="granular-row"><span class="granular-help">Malen statt nur angucken: Sand fällt und häuft sich, Wasser sinkt und verteilt sich, Wände sperren den Fluss. Zwei Ping-Pong-Simulationsphasen pro Frame, komplett auf der GPU.</span></div>`;
host.appendChild(panel);

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  vUv=p;
  gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;

const SIM = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;
uniform sampler2D uState;
uniform ivec2 uSize;
uniform int uPhase;
uniform int uFrame;
uniform int uBrushActive;
uniform vec2 uBrushPos;
uniform float uBrushRadius;
uniform float uBrushCode;

float codeAt(ivec2 p){
  p=clamp(p,ivec2(0),uSize-1);
  return floor(texelFetch(uState,p,0).r*255.0+0.5);
}
float pick(float a,float b){return abs(a-b)<1.0?1.0:0.0;}
float rnd(ivec2 p){
  uint n=uint(p.x*1973+p.y*9277+uFrame*26699)+0x68bc21ebu;
  n=(n^(n>>13))*1274126177u;
  return float(n&65535u)/65535.0;
}
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);
  float cur=codeAt(p);
  if(p.x<=0||p.x>=uSize.x-1||p.y<=1){outColor=vec4(192.0/255.0,0,0,1);return;}

  if(uBrushActive==1){
    vec2 bp=uBrushPos*vec2(uSize);
    if(distance(vec2(p)+0.5,bp)<=uBrushRadius){outColor=vec4(uBrushCode/255.0,0,0,1);return;}
  }

  const float SAND=64.0;
  const float WATER=128.0;
  const float WALL=192.0;
  float next=cur;

  if(uPhase==0){
    float up=codeAt(p+ivec2(0,1));
    float down=codeAt(p+ivec2(0,-1));
    if(cur<1.0 && (pick(up,SAND)>0.5||pick(up,WATER)>0.5)) next=up;
    else if((pick(cur,SAND)>0.5||pick(cur,WATER)>0.5) && down<1.0) next=0.0;
  } else {
    int dir=rnd(p)>0.5?1:-1;
    float down=codeAt(p+ivec2(0,-1));
    float dl=codeAt(p+ivec2(-1,-1));
    float dr=codeAt(p+ivec2(1,-1));
    float left=codeAt(p+ivec2(-1,0));
    float right=codeAt(p+ivec2(1,0));

    if(pick(cur,SAND)>0.5 && down>1.0){
      bool goLeft=dir<0&&dl<1.0;
      bool goRight=dir>0&&dr<1.0;
      if(goLeft||goRight) next=0.0;
    } else if(pick(cur,WATER)>0.5 && down>1.0){
      bool goLeft=dir<0&&left<1.0;
      bool goRight=dir>0&&right<1.0;
      if(goLeft||goRight) next=0.0;
    } else if(cur<1.0){
      float ul=codeAt(p+ivec2(-1,1));
      float ur=codeAt(p+ivec2(1,1));
      float ulDown=codeAt(p+ivec2(-1,0));
      float urDown=codeAt(p+ivec2(1,0));
      bool fromUL=pick(ul,SAND)>0.5&&ulDown>1.0&&rnd(p+ivec2(-1,1))>0.5;
      bool fromUR=pick(ur,SAND)>0.5&&urDown>1.0&&rnd(p+ivec2(1,1))<=0.5;
      if(fromUL!=fromUR) next=SAND;
      else {
        bool fromL=pick(left,WATER)>0.5&&codeAt(p+ivec2(-1,-1))>1.0&&rnd(p+ivec2(-1,0))>0.5;
        bool fromR=pick(right,WATER)>0.5&&codeAt(p+ivec2(1,-1))>1.0&&rnd(p+ivec2(1,0))<=0.5;
        if(fromL!=fromR) next=WATER;
      }
    }
  }
  outColor=vec4(next/255.0,0,0,1);
}`;

const DISPLAY = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uState;
uniform ivec2 uSize;
uniform float uTime;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/vec2(textureSize(uState,0));
  ivec2 p=ivec2(clamp(uv*vec2(uSize),vec2(0),vec2(uSize-1)));
  float c=floor(texelFetch(uState,p,0).r*255.0+0.5);
  vec3 col=vec3(.018,.021,.026);
  float grain=hash(vec2(p));
  if(abs(c-64.0)<1.0) col=mix(vec3(.45,.25,.08),vec3(.90,.66,.29),.35+.65*grain);
  else if(abs(c-128.0)<1.0){
    float ripple=.5+.5*sin(float(p.x)*.12+uTime*2.0+hash(vec2(p.y))*2.0);
    col=mix(vec3(.02,.12,.19),vec3(.08,.42,.57),.35+.45*ripple);
  } else if(abs(c-192.0)<1.0) col=mix(vec3(.20,.21,.23),vec3(.40,.42,.45),grain*.35);
  float vignette=smoothstep(.92,.35,length(uv-.5));
  col*=.72+.28*vignette;
  outColor=vec4(pow(col,vec3(.4545)),1.0);
}`;

class GranularLab {
  constructor(canvas){
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
    if(!this.gl) throw new Error('WebGL2 unavailable');
    this.w=matchMedia('(max-width:700px)').matches?220:320;
    this.h=matchMedia('(max-width:700px)').matches?140:180;
    this.simProgram=this.program(VERT,SIM);
    this.displayProgram=this.program(VERT,DISPLAY);
    this.textures=[this.texture(),this.texture()];
    this.fbos=[this.fbo(this.textures[0]),this.fbo(this.textures[1])];
    this.read=0;this.frameNo=0;this.active=false;this.paused=false;
    this.brush={down:false,x:.5,y:.7,radius:9,code:64};
    this.last=performance.now();this.frames=0;this.fps=0;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
    this.loop=this.loop.bind(this);requestAnimationFrame(this.loop);
  }
  shader(type,src){const g=this.gl,s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s));return s;}
  program(vs,fs){const g=this.gl,p=g.createProgram();g.attachShader(p,this.shader(g.VERTEX_SHADER,vs));g.attachShader(p,this.shader(g.FRAGMENT_SHADER,fs));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));return p;}
  texture(){const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,this.w,this.h,0,g.RGBA,g.UNSIGNED_BYTE,null);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);return t;}
  fbo(texture){const g=this.gl,f=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,f);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,texture,0);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw new Error('Granular framebuffer incomplete');return f;}
  reset(){const g=this.gl,zero=new Uint8Array(this.w*this.h*4);for(const t of this.textures){g.bindTexture(g.TEXTURE_2D,t);g.texSubImage2D(g.TEXTURE_2D,0,0,0,this.w,this.h,g.RGBA,g.UNSIGNED_BYTE,zero);}this.frameNo=0;}
  resize(){const dpr=Math.min(devicePixelRatio||1,2);const w=Math.max(2,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(2,Math.floor(this.canvas.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
  simPass(phase){const g=this.gl,write=1-this.read,p=this.simProgram;g.bindFramebuffer(g.FRAMEBUFFER,this.fbos[write]);g.viewport(0,0,this.w,this.h);g.useProgram(p);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.textures[this.read]);g.uniform1i(g.getUniformLocation(p,'uState'),0);g.uniform2i(g.getUniformLocation(p,'uSize'),this.w,this.h);g.uniform1i(g.getUniformLocation(p,'uPhase'),phase);g.uniform1i(g.getUniformLocation(p,'uFrame'),this.frameNo);g.uniform1i(g.getUniformLocation(p,'uBrushActive'),this.brush.down?1:0);g.uniform2f(g.getUniformLocation(p,'uBrushPos'),this.brush.x,this.brush.y);g.uniform1f(g.getUniformLocation(p,'uBrushRadius'),this.brush.radius);g.uniform1f(g.getUniformLocation(p,'uBrushCode'),this.brush.code);g.drawArrays(g.TRIANGLES,0,3);this.read=write;}
  display(now){const g=this.gl,p=this.displayProgram;this.resize();g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.canvas.width,this.canvas.height);g.useProgram(p);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.textures[this.read]);g.uniform1i(g.getUniformLocation(p,'uState'),0);g.uniform2i(g.getUniformLocation(p,'uSize'),this.w,this.h);g.uniform1f(g.getUniformLocation(p,'uTime'),now/1000);g.drawArrays(g.TRIANGLES,0,3);}
  loop(now){requestAnimationFrame(this.loop);if(!this.active)return;if(!this.paused){this.simPass(0);this.simPass(1);this.frameNo++;}this.display(now);this.frames++;if(now-this.last>700){this.fps=this.frames*1000/(now-this.last);this.frames=0;this.last=now;document.getElementById('granular-state').textContent=`${this.w}×${this.h} · 2 PASS · ${this.fps.toFixed(0)} FPS`;}}
}

let lab;
try{lab=new GranularLab(canvas);document.getElementById('granular-state').textContent='GPU READY';}
catch(error){console.error(error);document.getElementById('granular-state').textContent=`FAILED · ${error.message}`;launch.disabled=true;}

function enter(){if(!lab)return;document.body.classList.add('granular-mode','library-closed','controls-closed');launch.classList.add('active');lab.active=true;}
function exit(){document.body.classList.remove('granular-mode');launch.classList.remove('active');lab.active=false;}
launch.addEventListener('click',()=>document.body.classList.contains('granular-mode')?exit():enter());
document.getElementById('granular-exit').addEventListener('click',exit);
document.getElementById('granular-reset').addEventListener('click',()=>lab?.reset());
document.getElementById('granular-pause').addEventListener('click',e=>{if(!lab)return;lab.paused=!lab.paused;e.currentTarget.textContent=lab.paused?'PLAY':'PAUSE';});
document.getElementById('granular-size').addEventListener('change',e=>{if(lab)lab.brush.radius=Number(e.target.value);});
panel.addEventListener('click',e=>{const b=e.target.closest('[data-grain]');if(!b||!lab)return;panel.querySelectorAll('[data-grain]').forEach(x=>x.classList.toggle('active',x===b));lab.brush.code=({sand:64,water:128,wall:192,erase:0})[b.dataset.grain];});

function pointer(e,down){if(!lab||!lab.active)return;const r=canvas.getBoundingClientRect();lab.brush.x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));lab.brush.y=1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));if(down!=null)lab.brush.down=down;}
canvas.addEventListener('pointerdown',e=>{pointer(e,true);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(lab?.brush.down)pointer(e,null);});
canvas.addEventListener('pointerup',e=>{pointer(e,false);canvas.releasePointerCapture?.(e.pointerId);});
canvas.addEventListener('pointercancel',e=>pointer(e,false));
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='g'&&!/input|select|textarea/i.test(e.target.tagName)){document.body.classList.contains('granular-mode')?exit():enter();}});
