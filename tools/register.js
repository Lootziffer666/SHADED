// SHADED – Registrierung: Finde die exakte Kameraprojektion eines Referenz-
// bilds gegenüber einem 3D-Modell (GLB). ERST danach dürfen Depth/Normal/
// Masken/AO abgeleitet werden – in GENAU dieser Projektion, nie als eigene
// Interpretation (Regel siehe docs/registrierung.md).
//
// Nutzung:
//   npm i playwright three          (einmalig; nie committen)
//   node tools/register.js <referenz.png> <modell.glb>
// Ausgabe in tools/register-out/:
//   camera.json   – gefundene Projektion (el, az, fov|ortho, zoom, look, score)
//   overlay.png   – Referenz + registrierter Render halbtransparent (KONTROLLE!)
//   normal.png    – Normalen-Render in Referenzprojektion
//   depth.png     – Tiefenkarte (Weiß = nah) in Referenzprojektion,
//                   kontrastgespreizt, Außenbereich = Zeilen-Median, weichgezeichnet
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'register-out');
fs.mkdirSync(OUT, { recursive: true });
const REF = process.argv[2] || 'file_00000000974871f49fe71f6b456f9579.png';
const GLB = process.argv[3] || 'Hitem3d-1783102077836-v1.glb';

// three.js aus node_modules servieren (Pfad wie bei Playwright per NODE_PATH)
function findThree() {
  for (const base of [path.join(REPO, 'node_modules'),
                      ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [])]) {
    if (base && fs.existsSync(path.join(base, 'three'))) return path.join(base, 'three');
  }
  console.error('three nicht gefunden – npm i three'); process.exit(1);
}
const THREE_DIR = findThree();

const PAGE = `<!doctype html><body style="margin:0">
<script src="/three/build/three.min.js"></script>
<script src="/three/examples/js/loaders/GLTFLoader.js"></script>
<script src="/three/examples/js/libs/meshopt_decoder.js"></script>
<script>
window.status='lade';
const SW=208; let SH=117;                 // Score-Auflösung (folgt dem Referenz-Seitenverhältnis)
let renderer, scene, bbox, refEdge=null, refW=0, refH=0;
const cv=document.createElement('canvas');

function edgeMap(data,w,h){               // Graustufen -> Sobel -> 2x Boxblur -> normiert
  const g=new Float32Array(w*h);
  for(let i=0;i<w*h;i++) g[i]=data[i*4]*0.299+data[i*4+1]*0.587+data[i*4+2]*0.114;
  const e=new Float32Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const j=y*w+x;
    const gx=g[j+1]-g[j-1], gy=g[j+w]-g[j-w];
    e[j]=Math.sqrt(gx*gx+gy*gy);
  }
  const b=new Float32Array(w*h);
  for(let p=0;p<2;p++){
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const j=y*w+x;
      b[j]=(e[j]+e[j-1]+e[j+1]+e[j-w]+e[j+w])/5;
    }
    e.set(b);
  }
  let m=0; for(let i=0;i<w*h;i++)m+=e[i]; m/=w*h;
  let v=0; for(let i=0;i<w*h;i++){e[i]-=m; v+=e[i]*e[i];}
  v=Math.sqrt(v/(w*h))||1;
  for(let i=0;i<w*h;i++)e[i]/=v;
  return e;
}

window.setup=async function(refUrl){
  renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,preserveDrawingBuffer:true});
  renderer.setClearColor(0x000000);
  scene=new THREE.Scene();
  const img=new Image();
  await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=refUrl;});
  refW=img.width; refH=img.height;
  SH=Math.round(SW*refH/refW);
  const c2=document.createElement('canvas'); c2.width=SW; c2.height=SH;
  const cx=c2.getContext('2d'); cx.drawImage(img,0,0,SW,SH);
  refEdge=edgeMap(cx.getImageData(0,0,SW,SH).data,SW,SH);
  const loader=new THREE.GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  await new Promise((res,rej)=>loader.load('/model.glb',g=>{
    scene.add(g.scene); bbox=new THREE.Box3().setFromObject(g.scene); res();
  },undefined,rej));
  window.status='bereit';
};

function makeCam(o,w,h){
  const c=bbox.getCenter(new THREE.Vector3()), s=bbox.getSize(new THREE.Vector3());
  const span=Math.max(s.x,s.z);
  const el=o.el*Math.PI/180, az=o.az*Math.PI/180;
  const r=span*(o.fov? (0.55/Math.tan(o.fov*Math.PI/360))/(o.zoom||1) : 2);
  const cam=o.fov
    ? new THREE.PerspectiveCamera(o.fov, w/h, r-span, r+span)
    : new THREE.OrthographicCamera(-1,1,1,-1,r-span,r+span);
  if(!o.fov){
    const hw=span*0.55/(o.zoom||1);
    cam.left=-hw; cam.right=hw; cam.top=hw*h/w; cam.bottom=-hw*h/w;
  }
  const look=new THREE.Vector3(c.x+(o.ox||0)*span, c.y, c.z+(o.oz||0)*span);
  cam.position.set(
    look.x+r*Math.cos(el)*Math.sin(az),
    look.y+r*Math.sin(el),
    look.z+r*Math.cos(el)*Math.cos(az));
  cam.up.set(0,1,0); if(o.el>=89.5)cam.up.set(0,0,Math.cos(az)>=0?1:-1);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
  return {cam,span,look};
}

function renderInto(o,w,h,mode){
  cv.width=w; cv.height=h;
  renderer.setSize(w,h,false);
  const {cam,span}= makeCam(o,w,h);
  if(mode==='depth'){
    const r=cam.position.distanceTo(bbox.getCenter(new THREE.Vector3()));
    cam.near=Math.max(0.01,r-span*0.85); cam.far=r+span*0.85; cam.updateProjectionMatrix();
    scene.overrideMaterial=new THREE.MeshDepthMaterial();
  } else scene.overrideMaterial=new THREE.MeshNormalMaterial();
  renderer.render(scene,cam);
  scene.overrideMaterial=null;
  return cam;
}

// Score: normierte Kantenkorrelation, Maximum über ganzzahlige Verschiebungen
window.score=function(o){
  renderInto(o,SW,SH,'normal');
  const cx2=document.createElement('canvas'); cx2.width=SW; cx2.height=SH;
  const g2=cx2.getContext('2d'); g2.drawImage(cv,0,0);
  const e=edgeMap(g2.getImageData(0,0,SW,SH).data,SW,SH);
  let best=-1,bdx=0,bdy=0;
  for(let dy=-14;dy<=14;dy+=2)for(let dx=-14;dx<=14;dx+=2){
    let sum=0,n=0;
    for(let y=Math.max(0,-dy);y<SH-Math.max(0,dy);y+=1){
      const ry=y+dy;
      for(let x=Math.max(0,-dx);x<SW-Math.max(0,dx);x+=2){
        sum+=refEdge[y*SW+x]*e[(ry)*SW+(x+dx)]; n++;
      }
    }
    const sc=sum/n;
    if(sc>best){best=sc;bdx=dx;bdy=dy;}
  }
  return {score:best,dx:bdx,dy:bdy};
};

// Verschiebung in Look-Offset umrechnen (Screen-Shift -> Weltversatz am Boden)
window.bakeShift=function(o,dx,dy){
  const {cam,span,look}=makeCam(o,SW,SH);
  const ndc1=new THREE.Vector3(0,0,0.5).unproject(cam);
  const ndcX=new THREE.Vector3(2/SW,0,0.5).unproject(cam);
  const ndcY=new THREE.Vector3(0,-2/SH,0.5).unproject(cam);
  const px=ndcX.sub(ndc1), py=ndcY.sub(ndc1);
  // Render ist um (+dx,+dy) gegen die Referenz versetzt -> Look um (+dx,+dy) Pixel schieben
  const off=px.multiplyScalar(dx).add(py.multiplyScalar(dy));
  return {ox:(o.ox||0)+off.x/span, oz:(o.oz||0)+off.z/span};
};

window.finalRender=function(o){
  const w=refW,h=refH;
  // Normal + Overlay
  renderInto(o,w,h,'normal');
  const normal=cv.toDataURL('image/png');
  // Depth + Aufbereitung (Spreizung, Zeilen-Median-Füllung, Blur)
  renderInto(o,w,h,'depth');
  const dctx=document.createElement('canvas'); dctx.width=w; dctx.height=h;
  const dg=dctx.getContext('2d'); dg.drawImage(cv,0,0);
  const im=dg.getImageData(0,0,w,h), D=im.data;
  const vals=[];
  for(let i=0;i<w*h;i++){const v=D[i*4]; if(v>8)vals.push(v);}
  vals.sort((a,b)=>a-b);
  const lo=vals[Math.floor(vals.length*0.02)]||0, hi=vals[Math.floor(vals.length*0.995)]||255;
  const rowFill=new Array(h); let prev=lo;
  for(let y=0;y<h;y++){
    const row=[];
    for(let x=0;x<w;x+=7){const v=D[(y*w+x)*4]; if(v>8)row.push(v);}
    row.sort((a,b)=>a-b);
    prev=row.length>10? row[row.length>>1] : prev;
    rowFill[y]=prev;
  }
  const gray=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let v=D[(y*w+x)*4]; if(v<=8)v=rowFill[y];
    gray[y*w+x]=Math.max(0,Math.min(255,(v-lo)/(hi-lo)*255));
  }
  // 3x Boxblur ~ Gauss
  const tmp=new Float32Array(w*h); const R=5;
  for(let p=0;p<3;p++){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let s=0,n=0;
      for(let k=-R;k<=R;k++){const xx=x+k; if(xx>=0&&xx<w){s+=gray[y*w+xx];n++;}}
      tmp[y*w+x]=s/n;
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let s=0,n=0;
      for(let k=-R;k<=R;k++){const yy=y+k; if(yy>=0&&yy<h){s+=tmp[yy*w+x];n++;}}
      gray[y*w+x]=s/n;
    }
  }
  for(let i=0;i<w*h;i++){const v=gray[i]|0; D[i*4]=v; D[i*4+1]=v; D[i*4+2]=v; D[i*4+3]=255;}
  dg.putImageData(im,0,0);
  const depth=dctx.toDataURL('image/png');
  return {normal,depth};
};

window.overlay=async function(refUrl,normalUrl){
  const w=refW,h=refH;
  const oc=document.createElement('canvas'); oc.width=w; oc.height=h;
  const g=oc.getContext('2d');
  const a=new Image(); await new Promise(r=>{a.onload=r;a.src=refUrl;});
  const b=new Image(); await new Promise(r=>{b.onload=r;b.src=normalUrl;});
  g.globalAlpha=1; g.drawImage(a,0,0,w,h);
  g.globalAlpha=0.45; g.drawImage(b,0,0,w,h);
  return oc.toDataURL('image/png');
};
</script></body>`;

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  let p;
  if (rel === 'reg.html') { res.writeHead(200, {'Content-Type':'text/html'}); res.end(PAGE); return; }
  if (rel === 'model.glb') p = path.isAbsolute(GLB) ? GLB : path.join(REPO, GLB);
  else if (rel.startsWith('three/')) p = path.join(THREE_DIR, rel.slice(6));
  else p = path.join(REPO, rel);
  try { const d = fs.readFileSync(p); res.writeHead(200); res.end(d); }
  catch (e) { try { res.writeHead(404); } catch (_) {} res.end(); }
});

(async () => {
  await new Promise(r => server.listen(8937, r));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.error('[pageerror]', String(e).slice(0, 300)));
  await page.goto('http://localhost:8937/reg.html');
  await page.evaluate(u => window.setup(u), '/' + encodeURIComponent(REF));
  await page.waitForFunction(() => window.status === 'bereit', null, { timeout: 180000 });
  console.log('Referenz + Modell geladen. Registrierung läuft …');

  const evalScore = o => page.evaluate(o2 => window.score(o2), o);

  // Stufe 1: grobes Raster über Elevation × Azimut (orthographisch)
  let cands = [];
  for (let el = 35; el <= 85; el += 10)
    for (let az = 0; az < 360; az += 15)
      cands.push({ el, az, zoom: 1 });
  let results = [];
  for (const o of cands) results.push({ o, ...(await evalScore(o)) });
  results.sort((a, b) => b.score - a.score);
  console.log('Grob:', results.slice(0, 3).map(r =>
    `el${r.o.el}/az${r.o.az} s=${r.score.toFixed(3)}`).join('  '));

  // Stufe 2: Verfeinerung um die Top-3 (el/az fein + Zoom)
  let stage2 = [];
  for (const r of results.slice(0, 3))
    for (let el = r.o.el - 6; el <= r.o.el + 6; el += 3)
      for (let az = r.o.az - 8; az <= r.o.az + 8; az += 4)
        for (const zoom of [0.85, 0.95, 1.05, 1.15])
          stage2.push({ el, az: (az + 360) % 360, zoom });
  results = [];
  for (const o of stage2) results.push({ o, ...(await evalScore(o)) });
  results.sort((a, b) => b.score - a.score);
  let best = results[0];
  console.log('Fein:', `el${best.o.el}/az${best.o.az}/zoom${best.o.zoom} s=${best.score.toFixed(3)}`);

  // Stufe 3: Shift einbacken, dann Projektion (ortho vs. fov) + Feinzoom
  let ofs = await page.evaluate(([o, dx, dy]) => window.bakeShift(o, dx, dy), [best.o, best.dx, best.dy]);
  let stage3 = [];
  for (const fov of [0, 20, 30, 40])
    for (let el = best.o.el - 2; el <= best.o.el + 2; el += 2)
      for (let az = best.o.az - 3; az <= best.o.az + 3; az += 3)
        for (const zoom of [best.o.zoom - 0.05, best.o.zoom, best.o.zoom + 0.05])
          stage3.push({ el, az: (az + 360) % 360, zoom, fov: fov || undefined, ...ofs });
  results = [];
  for (const o of stage3) results.push({ o, ...(await evalScore(o)) });
  results.sort((a, b) => b.score - a.score);
  best = results[0];
  ofs = await page.evaluate(([o, dx, dy]) => window.bakeShift(o, dx, dy), [best.o, best.dx, best.dy]);
  const FINAL = { ...best.o, ...ofs };
  console.log('Final:', JSON.stringify(FINAL), 'score', best.score.toFixed(3));

  const { normal, depth } = await page.evaluate(o => window.finalRender(o), FINAL);
  fs.writeFileSync(path.join(OUT, 'normal.png'), Buffer.from(normal.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'depth.png'), Buffer.from(depth.split(',')[1], 'base64'));
  const ov = await page.evaluate(([u, n]) => window.overlay(u, n), ['/' + encodeURIComponent(REF), normal]);
  fs.writeFileSync(path.join(OUT, 'overlay.png'), Buffer.from(ov.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'camera.json'), JSON.stringify({
    referenz: REF, modell: GLB, projektion: FINAL.fov ? 'perspektivisch' : 'orthographisch',
    ...FINAL, score: best.score,
    hinweis: 'Depth/Normal/Masken IMMER in dieser Projektion ableiten – nie neu interpretieren.'
  }, null, 2));
  console.log('-> tools/register-out/{camera.json, overlay.png, normal.png, depth.png}');
  console.log('overlay.png ANSEHEN: Registrierung ist nur gut, wenn die Kanten sitzen.');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
