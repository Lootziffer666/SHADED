import {addProceduralBoundaries,boxSet,buildNavigationGrid,buildSpatialEnvironment,cellToWorld,dijkstraGrid,diskSet,dykstraProject,seededRandom,segmentIsTraversable,SparseVoxelWorld,SpatialWorldSimulation,worldToCell} from './spatial-navigation.mjs';

const openButton=document.getElementById('btn-spatial-view'),viewer=document.getElementById('spatial-viewer');
const closeButton=document.getElementById('spatial-close'),walkButton=document.getElementById('spatial-walk');
const canvas=document.getElementById('spatial-canvas'),map=document.getElementById('spatial-map');
const boundarySlider=document.getElementById('spatial-boundary'),boundaryForm=document.getElementById('spatial-boundary-form');
const thicknessSlider=document.getElementById('spatial-thickness'),textureBlendSlider=document.getElementById('spatial-texture-blend'),seedInput=document.getElementById('spatial-seed'),fitStatus=document.getElementById('spatial-fit-status'),vegetationSlider=document.getElementById('spatial-vegetation');
const canopyFlexSlider=document.getElementById('spatial-canopy-flex');
const windDirection=document.getElementById('spatial-wind-direction');
const seasonsButton=document.getElementById('spatial-seasons'),seasonStatus=document.getElementById('spatial-season-status');
const lightningRate=document.getElementById('spatial-lightning-rate'),urineRate=document.getElementById('spatial-urine-rate'),bloodRate=document.getElementById('spatial-blood-rate'),rainExtinguish=document.getElementById('spatial-rain-extinguish'),timeScale=document.getElementById('spatial-time-scale');
const sceneSeason=document.getElementById('spatial-scene-season'),sceneEvent=document.getElementById('spatial-scene-event'),sceneDuration=document.getElementById('spatial-scene-duration'),sceneAdd=document.getElementById('spatial-scene-add'),sceneList=document.getElementById('spatial-scene-list'),recordDuration=document.getElementById('spatial-record-duration'),recordButton=document.getElementById('spatial-record'),logElement=document.getElementById('spatial-log');
const nowLightning=document.getElementById('spatial-now-lightning'),nowBlood=document.getElementById('spatial-now-blood'),nowUrine=document.getElementById('spatial-now-urine');
const paintButton=document.getElementById('spatial-paint'),paintMaterial=document.getElementById('spatial-paint-material'),paintRadius=document.getElementById('spatial-paint-radius'),paintOpacity=document.getElementById('spatial-paint-opacity'),paintColor=document.getElementById('spatial-paint-color'),pressureStatus=document.getElementById('spatial-pressure');
const undoButton=document.getElementById('spatial-undo'),redoButton=document.getElementById('spatial-redo'),voxelExport=document.getElementById('spatial-voxel-export'),voxelImport=document.getElementById('spatial-voxel-import');
const performanceStatus=document.getElementById('spatial-performance');
const pipelineButtons=Array.from(document.querySelectorAll('[data-spatial-stage]')),stageCopy=document.getElementById('spatial-stage-copy');
const gl=canvas?.getContext('webgl2',{antialias:true,alpha:false}),map2d=map?.getContext('2d');
let program,skyProgram,vao,pointBuffer,count=0,environment,sourceCloud,basePoints=[],boundaryPoints=[],voxelEditPoints=[],simulation,currentWorldState,grid,path=[],pathIndex=0,mode='orbit',dragging=null,raf=0,last=0,lastWorldUpload=0;
let camera={x:0,y:0,z:2.3,yaw:0,pitch:0},keys=new Set();
let seasonRun=null,seasonPhase=-1,lastShowcaseStep=0,seasonRate=1,pendingSceneEvent=null,recording=false,mediaRecorder=null,customScenes=[],logLines=[];
let random=seededRandom(17);
let paintMode=false,painting=false,lastPaintTime=0;
let frameWindowStart=0,frameCount=0,lastFps=0,lastFrameMs=0,worstFrameMs=0,renderScale=.45;
let pipelineStage='final',pipelineCache={};
const PIPELINE_STAGES={
  input:'Nur die aus der geladenen Vorlage übernommenen Ausgangspunkte. Noch keine ergänzte Rückseite.',
  depth:'Der relative Tiefenhinweis wird als Helligkeit gezeigt. Hell und dunkel bedeuten hier nur Staffelung, keine Meter.',
  normals:'Farben zeigen grob die lokalen Oberflächenrichtungen, die aus benachbarten sichtbaren Punkten abgeleitet wurden.',
  components:'Zusammenhängende sichtbare Bereiche erhalten getrennte Farben. Die Farben sind reine Diagnosekennungen.',
  primitive:'Grobe gefittete Flächenkörper und ihre neu abgetasteten Ergänzungen. Das sind Hypothesen, keine Messpunkte.',
  mirror:'Bewusst einfache, dunkle Spiegel-Rückseite plus Randwände für einen geschlossenen begehbaren Platzhalter.',
  voxels:'Die Punktmenge als diskrete freie beziehungsweise belegte Raumzellen. Unbekannter Raum bleibt unsichtbar.',
  fields:'Das gemeinsame Oberflächenraster für Wasser, Feuer, Schnee, Rauch, Matsch und weitere laufende Zustände.',
  nav:'Rot markiert blockierte Zellen; Grün bis Gelb zeigt begehbare Zellen mit steigenden laufenden Kosten.',
  boundary:'Nur die prozedural erzeugten, kollidierenden Begrenzungsbäume beziehungsweise Felsen.',
  sky:'Nur der richtungsabhängige Hintergrund. Er ist nicht aus der Point Cloud rekonstruiert.',
  final:'Alle Stufen gemeinsam. Beobachtetes und Erzeugtes bleiben in den Daten getrennt.'
};
const SEASONS=[
  {name:'🌱 Frühling · Tau und Blüte',dur:8,p:{bloom:1,wet:.55,rain:.18,puddle:.18,temperature:.52,wind:.12,dew:1,vegetation:1}},
  {name:'🌸 Vollblüte · Blumencluster',dur:7,p:{bloom:1,wet:.38,temperature:.62,wind:.2,dew:.45,vegetation:1}},
  {name:'🍎 Sommer · Fruchtbildung',dur:7,p:{bloom:.35,seasonFruit:1,temperature:.78,wind:.18,vegetation:.9}},
  {name:'☀️ Sengende Hitze',dur:6,p:{temperature:1,bleach:.8,wind:.3,wet:.02,puddle:0,vegetation:.6},e:{heat:.8}},
  {name:'⛈️ Sturm · Regen und Hagel',dur:8,p:{storm:1,rain:1,wet:1,puddle:.85,fog:.45,wind:1,temperature:.48},e:{hail:.8,wet:1}},
  {name:'🍂 Herbst · Laub und Zerfall',dur:8,p:{autumn:1,decay:.5,wind:.72,wet:.25,temperature:.42,vegetation:.45}},
  {name:'❄️ Winter · Schnee und Eis',dur:8,p:{snow:1,snowfall:1,temperature:0,wet:.65,puddle:.7,fog:.3,wind:.35}},
  {name:'🌫️ Tauwetter · Nebel und Matsch',dur:7,p:{snow:.15,temperature:.46,rain:.35,wet:1,puddle:1,fog:.8,wind:.12,dew:.8}},
  {name:'🌿 Zuwachsen · Pfade verschwinden',dur:9,p:{bloom:1,wet:.55,temperature:.58,wind:.16,dew:.65,vegetation:1}}
];
const SEASON_TOTAL=SEASONS.reduce((sum,phase)=>sum+phase.dur,0);
const CUSTOM_SEASONS={Frühling:SEASONS[0],Sommer:SEASONS[2],Herbst:SEASONS[5],Winter:SEASONS[6],Tauwetter:SEASONS[7]};
const EVENT_PATCH={none:{},lightning:{p:{storm:.7},event:'lightning'},storm:{p:{storm:1,rain:1,wind:1,fog:.5},e:{hail:.35}},fire:{p:{temperature:.9},e:{heat:.8},event:'fire'},blood:{event:'blood'},urine:{event:'urine'},regrow:{p:{bloom:1,wet:.55,vegetation:1},event:'regrow'}};
function log(message,data){const stamp=new Date().toISOString().slice(11,23),suffix=data===undefined?'':` ${JSON.stringify(data)}`;logLines.push(`[${stamp}] ${message}${suffix}`);if(logLines.length>180)logLines.shift();if(logElement){logElement.textContent=logLines.join('\n');logElement.scrollTop=logElement.scrollHeight;}}
function activeTimeline(){if(!customScenes.length)return SEASONS;return customScenes.map(scene=>{const base=CUSTOM_SEASONS[scene.season]||SEASONS[0],patch=EVENT_PATCH[scene.event]||{};return {name:`${scene.season} · ${scene.event}`,dur:scene.duration,p:{...base.p,...(patch.p||{})},e:{...(base.e||{}),...(patch.e||{})},event:patch.event};});}
function renderSceneList(){sceneList.innerHTML='';customScenes.forEach((scene,index)=>{const row=document.createElement('div'),label=document.createElement('span');label.textContent=`${index+1}. ${scene.season} / ${scene.event} / ${scene.duration}s`;const controls=document.createElement('span');for(const [text,delta] of [['↑',-1],['↓',1]]){const move=document.createElement('button');move.textContent=text;move.disabled=index+delta<0||index+delta>=customScenes.length;move.onclick=()=>{const target=index+delta;[customScenes[index],customScenes[target]]=[customScenes[target],customScenes[index]];log('Szenenreihenfolge geändert',{from:index,to:target});renderSceneList();};controls.appendChild(move);}const remove=document.createElement('button');remove.textContent='×';remove.onclick=()=>{log('Szene entfernt',customScenes[index]);customScenes.splice(index,1);renderSceneList();};controls.appendChild(remove);row.append(label,controls);sceneList.appendChild(row);});}

const VS=`#version 300 es
in vec3 a_position;in vec3 a_color;in float a_kind;uniform mat4 u_matrix;uniform float u_pointScale;uniform float u_time,u_wind;out vec3 v_color;out float v_kind;
void main(){vec3 pos=a_position;if(a_kind>.5&&a_kind<1.5)pos.y+=sin(u_time*2.+pos.x*19.+pos.z*17.)*.006;if(a_kind==4.||a_kind==10.)pos+=vec3(sin(u_time+pos.z*9.)*.025,mod(u_time*.035+pos.x,0.22),0.);if(a_kind>=15.&&a_kind<=17.){float speed=a_kind==16.0?0.08:0.19;pos.y-=mod(u_time*speed+abs(pos.x*3.),.72);pos.x+=sin(u_time+pos.z*8.)*.035*u_wind;}if(a_kind==8.||a_kind==9.)pos+=vec3(sin(u_time*7.+pos.z*20.)*.012,abs(sin(u_time*5.+pos.x))*0.035,0.);if(a_kind==14.)pos.x+=sin(u_time*.35+pos.z*18.)*.008;if(a_kind==26.)pos.y+=sin(u_time*1.4+pos.x*22.)*.009;if(a_kind==28.)pos.y+=sin(u_time*.8+pos.z*14.)*.004;if(a_kind==19.)pos.x+=sin(u_time*2.+pos.z*15.)*.025*u_wind;if(a_kind==21.)pos.x+=sin(u_time*.7+pos.z*8.)*.018*u_wind;if(a_kind==22.)pos.x+=sin(u_time*1.3+pos.z*8.)*.07*u_wind;if(a_kind==23.)pos+=vec3(sin(u_time*3.+pos.z*12.)*.12*u_wind,abs(sin(u_time*2.+pos.x))*.06,cos(u_time*2.)*.05*u_wind);vec4 p=u_matrix*vec4(pos,1.);gl_Position=p;gl_PointSize=clamp(u_pointScale/max(.12,p.w),1.,10.);v_color=a_color;v_kind=a_kind;}`;
const FS=`#version 300 es
precision mediump float;in vec3 v_color;in float v_kind;uniform float u_bloom,u_autumn,u_snow,u_heat,u_night;out vec4 outColor;
void main(){vec2 q=gl_PointCoord-.5;if(dot(q,q)>.25)discard;vec3 c=v_kind>0.5&&v_kind<1.5?mix(v_color,vec3(.55,.85,1.),.35):v_color;float l=dot(c,vec3(.299,.587,.114));c=mix(c,mix(vec3(l),c,1.35),u_bloom*.55);c=mix(c,c*vec3(1.28,.83,.42),u_autumn*.65);c=mix(c,vec3(.88,.94,1.),u_snow*.42);c=mix(c,c*vec3(1.2,.91,.72),u_heat*.35);c*=1.-u_night*.45;outColor=vec4(c,1.);}`;
const SKY_VS=`#version 300 es
precision highp float;const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));out vec2 uv;void main(){uv=P[gl_VertexID]*.5+.5;gl_Position=vec4(P[gl_VertexID],0.,1.);}`;
const SKY_FS=`#version 300 es
precision highp float;in vec2 uv;out vec4 outColor;uniform vec2 u_resolution;uniform vec2 u_look;uniform float u_time,u_night,u_storm,u_fog;
void main(){vec2 p=(gl_FragCoord.xy*2.-u_resolution)/u_resolution.y;vec3 rd=normalize(vec3(p.x,p.y,1.));float cy=cos(u_look.x),sy=sin(u_look.x),cp=cos(u_look.y),sp=sin(u_look.y);rd=mat3(cy,0.,-sy,sy*sp,cp,cy*sp,sy*cp,-sp,cy*cp)*rd;float altitude=clamp(rd.y*.75+.45,0.,1.);vec3 day=mix(vec3(.16,.28,.43),vec3(.58,.77,.94),altitude);vec3 night=mix(vec3(.008,.012,.035),vec3(.035,.055,.12),altitude);vec3 col=mix(day,night,u_night);float longitude=atan(rd.x,rd.z),wave=.5+.27*sin(longitude*5.+rd.y*7.+u_time*.025)+.16*sin(longitude*11.-rd.y*13.-u_time*.017);float cloud=smoothstep(.53-.12*u_storm,.72,wave)*smoothstep(-.05,.28,rd.y)*(1.-smoothstep(.72,.92,rd.y));vec3 cloudColor=mix(vec3(.88,.91,.94),vec3(.20,.23,.30),clamp(u_storm+u_night*.35,0.,1.));col=mix(col,cloudColor,cloud*(.24+.38*u_fog+.28*u_storm));float ridge=-.10+.035*sin(longitude*3.)+.018*sin(longitude*9.+1.4);float mountain=1.-smoothstep(ridge,ridge+.025,rd.y);col=mix(col,mix(vec3(.075,.095,.10),vec3(.012,.018,.032),u_night),mountain*.92);outColor=vec4(col,1.);}`;

function makeShader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function link(vs,fs){const p=gl.createProgram();gl.attachShader(p,makeShader(gl.VERTEX_SHADER,vs));gl.attachShader(p,makeShader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
function init(){if(program)return;if(!gl)throw new Error('WebGL 2 ist für die Raumansicht erforderlich.');program=link(VS,FS);skyProgram=link(SKY_VS,SKY_FS);vao=gl.createVertexArray();gl.bindVertexArray(vao);}
function multiply(a,b){const o=new Float32Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function cameraMatrix(){
  const f=1/Math.tan(Math.PI/6),aspect=canvas.width/canvas.height;
  const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,-1.002,-1,0,0,-.2002,0]);
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const rotation=new Float32Array([cy,sy*sp,-sy*cp,0,0,cp,sp,0,sy,-cy*sp,cy*cp,0,0,0,0,1]);
  const translation=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,-camera.x,-camera.y,-camera.z,1]);
  return multiply(projection,multiply(rotation,translation));
}
function upload(points){
  init();const data=new Float32Array(points.length*7);points.forEach((p,i)=>data.set([p.x,p.y,p.z,p.generated?p.r/510:p.r/255,p.generated?p.g/510:p.g/255,p.generated?p.b/400:p.b/255,p.kind||0],i*7));
  pointBuffer ||= gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  for(const [name,size,offset] of [['a_position',3,0],['a_color',3,12],['a_kind',1,24]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,28,offset);}count=points.length;
}
const diagnosticPalette=[[56,189,248],[244,114,182],[250,204,21],[74,222,128],[167,139,250],[251,146,60],[45,212,191],[248,113,113]];
function gridDiagnosticPoints(kind){
  if(!grid)return [];const points=[],floor=walkEyeY()-.195;
  for(let z=1;z<grid.size-1;z++)for(let x=1;x<grid.size-1;x++){
    const index=z*grid.size+x,blocked=!!grid.cells[index],cost=grid.cost?.[index]||1,fields=grid.fields||{};let color;
    if(kind==='nav')color=blocked?[230,50,65]:[Math.min(240,35+cost*8),Math.max(55,220-cost*6),70];
    else{const water=fields.waterVolume?.[index]||0,fire=fields.fireEnergy?.[index]||0,snow=fields.snowMass?.[index]||0,smoke=fields.smokeMass?.[index]||0,mud=fields.mudMass?.[index]||0;color=[55+fire*200+mud*80,75+snow*170,85+water*170+smoke*65];}
    points.push({x:cellToWorld(x,grid.size),y:floor,z:cellToWorld(z,grid.size),r:color[0],g:color[1],b:color[2],kind:0,generated:false});
  }
  return points;
}
function cachedPipelinePoints(stage){
  if(!environment)return [];
  if(pipelineCache[stage])return pipelineCache[stage];
  const observed=environment.observed||environment.points||[];let points=[];
  if(stage==='input')points=observed;
  else if(stage==='depth'){
    const values=observed.map(point=>point.z),minimum=values.length?Math.min(...values):0,maximum=values.length?Math.max(...values):1;
    points=observed.map(point=>{const value=(point.z-minimum)/Math.max(maximum-minimum,1e-6),shade=35+value*220;return {...point,r:shade,g:shade,b:shade,generated:false};});
  }else if(stage==='normals')points=observed.map((point,index)=>{const normal=environment.normals?.[index]?.normal||[0,0,0];return {...point,r:(normal[0]*.5+.5)*255,g:(normal[1]*.5+.5)*255,b:(normal[2]*.5+.5)*255,generated:false};});
  else if(stage==='components'){
    const componentByPoint=new Int32Array(observed.length);componentByPoint.fill(-1);(environment.components||[]).forEach((component,id)=>component.forEach(index=>{componentByPoint[index]=id;}));
    points=observed.map((point,index)=>{const color=componentByPoint[index]<0?[75,85,100]:diagnosticPalette[componentByPoint[index]%diagnosticPalette.length];return {...point,r:color[0],g:color[1],b:color[2],generated:false};});
  }else if(stage==='primitive')points=[...observed.filter((_,index)=>index%4===0).map(point=>({...point,r:65,g:70,b:80,generated:false})),...(environment.primitiveCompletion||[])];
  else if(stage==='mirror')points=[...observed.filter(point=>['wood','roof','window','rock'].includes(point.material)).map(point=>({...point,r:80,g:90,b:105,generated:false})),...(environment.mirroredCompletion||[])];
  else if(stage==='voxels')points=environment.voxelWorld?.surfacePoints()||[];
  else if(stage==='nav')points=gridDiagnosticPoints('nav');
  else if(stage==='boundary')points=boundaryPoints;
  pipelineCache[stage]=points;return points;
}
function pipelinePoints(params={}){
  if(pipelineStage==='fields')return [...gridDiagnosticPoints('fields'),...(simulation?.points()||[])];
  if(pipelineStage==='sky')return [];
  if(pipelineStage==='final')return [...basePoints,...boundaryPoints,...seasonalCanopyPoints(params),...(simulation?.points()||[])];
  return cachedPipelinePoints(pipelineStage);
}
function selectPipelineStage(stage){
  if(!(stage in PIPELINE_STAGES))throw new Error(`Unbekannte Raumstufe: ${stage}`);pipelineStage=stage;
  pipelineButtons.forEach(button=>button.classList.toggle('active',button.dataset.spatialStage===stage));if(stageCopy)stageCopy.textContent=PIPELINE_STAGES[stage];
  if(environment)upload(pipelinePoints(currentWorldState?.params||{}));log('Raumstufe sichtbar',{stage,meaning:PIPELINE_STAGES[stage]});return {stage,description:PIPELINE_STAGES[stage],points:count};
}
function rebuildEnvironment(){
  if(!sourceCloud)return;
  pipelineCache={};
  const previousSimulation=simulation,previousWorld=environment?.voxelWorld;
  const approved=previousWorld?Array.from(previousWorld.voxels).filter(([,voxel])=>voxel.provenance==='USER_APPROVED').map(([key,voxel])=>[key,JSON.parse(JSON.stringify(voxel))]):[];
  const seed=Number(seedInput.value)||17;random=seededRandom(seed);
  environment=buildSpatialEnvironment(sourceCloud,{seed,thickness:Number(thicknessSlider.value),textureBlend:Number(textureBlendSlider.value),ransacIterations:48,maxMirrorPoints:4500,sideLayers:2});
  basePoints=environment.points;grid=buildNavigationGrid(environment);
  for(const [key,voxel] of approved)environment.voxelWorld.voxels.set(key,voxel);
  if(approved.length)grid=buildNavigationGrid(environment);
  voxelEditPoints=environment.voxelWorld.surfacePoints({provenance:'USER_APPROVED'});
  boundaryPoints=addProceduralBoundaries(grid,boundarySlider.value,boundaryForm.value,Number(canopyFlexSlider.value));
  simulation=previousSimulation?previousSimulation.transferTo(grid):new SpatialWorldSimulation(grid,{seed});
  upload(pipelinePoints(currentWorldState?.params||{}));path=[];pathIndex=0;
  const m=environment.metrics,types=environment.primitives.reduce((out,p)=>{out[p.type]=(out[p.type]||0)+1;return out;},{});
  if(fitStatus)fitStatus.textContent=`Fit: ${(m.coverage*100).toFixed(1)} % · RMSE ${m.rmse==null?'—':m.rmse.toFixed(5)} · Spiegelhülle ${m.mirroredPoints||0} Punkte · ${Object.entries(types).map(([type,n])=>`${n} ${type}`).join(', ')||'keine Primitive'}`;
  log('Geometrie gefittet',{seed,coverage:m.coverage,rmse:m.rmse,normalizedRmse:m.normalizedRmse,score:m.score,primitives:types,primitivePoints:m.primitivePoints,mirroredPoints:m.mirroredPoints,generatedPoints:environment.generated.length,stateTransferred:!!previousSimulation,userVoxels:approved.length});drawMap();
}
function hexColor(value){const hex=(value||'#808080').replace('#','');return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];}
function refreshVoxelDerivedGrid(){
  const world=environment?.voxelWorld;if(!world)return;
  pipelineCache={};
  basePoints=world.surfacePoints();voxelEditPoints=[];
  const nextGrid=buildNavigationGrid(environment);boundaryPoints=addProceduralBoundaries(nextGrid,boundarySlider.value,boundaryForm.value,Number(canopyFlexSlider.value));
  simulation=simulation?simulation.transferTo(nextGrid):new SpatialWorldSimulation(nextGrid,{seed:Number(seedInput.value)||17});grid=nextGrid;path=[];pathIndex=0;
  upload(pipelinePoints(currentWorldState?.params||{}));drawMap();
}
function screenRay(event){
  const rect=canvas.getBoundingClientRect(),nx=((event.clientX-rect.left)/rect.width)*2-1,ny=1-((event.clientY-rect.top)/rect.height)*2;
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const forward=[-sy*cp,-sp,-cy*cp],right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],scale=Math.tan(Math.PI/6),aspect=rect.width/Math.max(1,rect.height);
  const direction=[forward[0]+right[0]*nx*scale*aspect+up[0]*ny*scale,forward[1]+right[1]*nx*scale*aspect+up[1]*ny*scale,forward[2]+right[2]*nx*scale*aspect+up[2]*ny*scale],length=Math.hypot(...direction)||1;
  return {origin:[camera.x,camera.y,camera.z],direction:direction.map(value=>value/length)};
}
function paintAt(event){
  const world=environment?.voxelWorld;if(!world)return false;
  const ray=screenRay(event),hit=world.raycast(ray.origin,ray.direction,{maxDistance:8});if(!hit)return false;
  const pressure=event.pressure>0?event.pressure:.5,eraser=paintMaterial.value==='erase'||event.button===5||(event.buttons&32)!==0;
  const result=world.paint(hit.position,{pressure,tiltX:event.tiltX||0,tiltY:event.tiltY||0,radius:Number(paintRadius.value),opacity:Number(paintOpacity.value),material:eraser?'user':paintMaterial.value,color:hexColor(paintColor.value),eraser});
  if(pressureStatus)pressureStatus.textContent=`Druck: ${pressure.toFixed(3)} · Neigung: ${event.tiltX||0}°/${event.tiltY||0}° · ${result.changed} Voxel`;
  if(result.changed){refreshVoxelDerivedGrid();return true;}return false;
}
function downloadJson(name,data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function seasonalOverride(now){
  if(!seasonRun)return null;const timeline=activeTimeline(),total=timeline.reduce((sum,phase)=>sum+phase.dur,0);let t=(((now-seasonRun)/1000)*seasonRate)%total,index=0;while(t>=timeline[index].dur){t-=timeline[index].dur;index++;}
  const phase=timeline[index],next=timeline[(index+1)%timeline.length],raw=Math.max(0,(t/phase.dur-.65)/.35),blend=raw*raw*(3-2*raw),mix=(a,b)=>(a||0)+((b||0)-(a||0))*blend,keys=new Set([...Object.keys(phase.p),...Object.keys(next.p)]),elementKeys=new Set([...Object.keys(phase.e||{}),...Object.keys(next.e||{})]);if(index!==seasonPhase){seasonPhase=index;seasonStatus.textContent=phase.name;pendingSceneEvent=phase.event||null;log('Szenenwechsel',{index,name:phase.name,duration:phase.dur,params:phase.p,elements:phase.e||{}});}
  const params={};for(const key of keys)params[key]=mix(phase.p[key],next.p[key]);const elements={};for(const key of elementKeys)elements[key]=mix(phase.e?.[key],next.e?.[key]);params.dayNight=.5+.5*Math.sin((now-seasonRun)/1000*seasonRate*Math.PI/2.4);
  return {params,elements,phase:index};
}
function engineWorldState(now){const params={...(window.SHADED?.getParams?.()||{}),vegetation:Number(vegetationSlider.value),rainExtinguish:Number(rainExtinguish.value),windDirectionDegrees:Number(windDirection.value)},live=window.SHADED?.worldState?.()||{},season=seasonalOverride(now);return {params:{...params,...(season?.params||{})},elements:{...(live.elements||{}),...(season?.elements||{})},fireCount:season?.phase===3?3:(live.fireCount||0),player:live.player||{},season};}
function seasonalCanopyPoints(params){
  const out=[],bloom=params.bloom||0,fruit=params.seasonFruit||0;if(bloom<.08&&fruit<.08)return out;
  boundaryPoints.filter(p=>p.kind>=20&&p.kind<=22).forEach((p,i)=>{if(i%3)return;if(bloom>.08)out.push({...p,x:p.x+Math.sin(i*7)*.018,y:p.y+.018,r:250,g:145,b:205,kind:26,size:bloom});if(fruit>.08)out.push({...p,x:p.x+Math.cos(i*5)*.022,y:p.y-.025,r:218,g:58,b:35,kind:27,size:fruit});});return out;
}
function randomPosition(){return {x:random()*1.6-.8,z:random()*1.6-.8};}
function applySceneEvent(event){if(!simulation||!event)return;let result;if(event==='lightning'||event==='fire'){result=simulation.strikeLightning(random);log(event==='lightning'?'⚡ Blitz schlägt in Holz ein':'🔥 Holz entzündet',result||'kein Holz');}else if(event==='blood'){const p=randomPosition();result=simulation.contaminateAt(p.x,p.z,'blood',1);log('🩸 Blut eingebracht',result);}else if(event==='urine'){const p=randomPosition();result=simulation.contaminateAt(p.x,p.z,'urine',1);log('🦌 Waldtier markiert',result);}pendingSceneEvent=null;}
let lastAudit=0,lastAudited={};
function auditState(now,state){if(now-lastAudit<250)return;lastAudit=now;for(const [key,value] of Object.entries({...state.params,...state.elements})){if(typeof value!=='number')continue;const rounded=+value.toFixed(3);if(lastAudited[key]!==rounded){log(`Wert ${key}`,{from:lastAudited[key],to:rounded});lastAudited[key]=rounded;}}for(const key of ['fire','water','snow','ice','mud','smoke','blood','urine','trail']){const field=simulation?.[key];if(!field)continue;const average=+(field.reduce((sum,value)=>sum+value,0)/field.length).toFixed(2),auditKey=`field.${key}`;if(lastAudited[auditKey]!==average){log(`Feld ${key}`,{from:lastAudited[auditKey],to:average});lastAudited[auditKey]=average;}}}
function advanceWorld(dt,state){const scale=seasonRun?seasonRate:Number(timeScale.value),total=dt*Math.max(1,scale),steps=Math.max(1,Math.ceil(total/.2));for(let i=0;i<steps;i++)simulation?.step(total/steps,state);applySceneEvent(pendingSceneEvent);if(random()<Number(lightningRate.value)*total*.08){const hit=simulation?.strikeLightning(random);if(hit)log('⚡ Zufallsblitz',{...hit,rain:state.params.rain||0});}if(random()<Number(urineRate.value)*total*.035){const p=randomPosition();log('🦌 Urin',simulation?.contaminateAt(p.x,p.z,'urine',.8));}if(random()<Number(bloodRate.value)*total*.025){const p=randomPosition();log('🩸 Blut',simulation?.contaminateAt(p.x,p.z,'blood',.75));}}
function nearestWalkable(x,z){
  if(!grid)return [x,z];let best=null,bestDistance=Infinity;
  for(let cz=1;cz<grid.size-1;cz++)for(let cx=1;cx<grid.size-1;cx++){const index=cz*grid.size+cx;if(grid.cells[index]||!Number.isFinite(grid.cost?.[index]??1))continue;const wx=cellToWorld(cx,grid.size),wz=cellToWorld(cz,grid.size),distance=(wx-x)**2+(wz-z)**2;if(distance<bestDistance){bestDistance=distance;best=[wx,wz];}}
  return best||[x,z];
}
function walkEyeY(){return Number.isFinite(environment?.floorY)?environment.floorY+.20:-.05;}
function reset(){const spawn=nearestWalkable(0,.62);camera={x:mode==='walk'?spawn[0]:0,y:mode==='walk'?walkEyeY():0,z:mode==='walk'?spawn[1]:2.3,yaw:0,pitch:0};path=[];pathIndex=0;}
function setMode(next){mode=next;walkButton.textContent=mode==='walk'?'👁 Orbit-Modus':'🚶 Lauf-Modus';map.hidden=mode!=='walk';reset();drawMap();}
function routeBetween(startWorld,goalWorld){
  if(!grid)return [];const startOpen=nearestWalkable(...startWorld),goalOpen=nearestWalkable(...goalWorld);
  return dijkstraGrid(grid,[worldToCell(startOpen[0],grid.size),worldToCell(startOpen[1],grid.size)],[worldToCell(goalOpen[0],grid.size),worldToCell(goalOpen[1],grid.size)]);
}
function projectedMove(x,z,maxStep){
  // Dykstra enforces both convex constraints at once: generated room bounds and
  // this frame's movement disk. It replaces ad-hoc sequential clamping.
  return dykstraProject([x,z],[boxSet(-.92,.92,-.92,.92),diskSet(camera.x,camera.z,maxStep)]).point;
}
function moveIfFree(x,z,maxStep){
  const candidate=projectedMove(x,z,maxStep);
  if(!grid)return candidate;
  return segmentIsTraversable(grid,[camera.x,camera.z],candidate)?candidate:[camera.x,camera.z];
}
function tickWalk(dt){
  if(mode!=='walk')return;let dx=0,dz=0,moved=false;const speed=dt*.7;
  if(keys.has('w')||keys.has('arrowup'))dz-=speed;if(keys.has('s')||keys.has('arrowdown'))dz+=speed;
  if(keys.has('a')||keys.has('arrowleft'))dx-=speed;if(keys.has('d')||keys.has('arrowright'))dx+=speed;
  if(dx||dz){path=[];const c=Math.cos(camera.yaw),s=Math.sin(camera.yaw);[camera.x,camera.z]=moveIfFree(camera.x+dx*c-dz*s,camera.z+dx*s+dz*c,Math.hypot(dx,dz));moved=true;}
  if(pathIndex<path.length){const [cx,cz]=path[pathIndex],tx=cellToWorld(cx,grid.size),tz=cellToWorld(cz,grid.size),vx=tx-camera.x,vz=tz-camera.z,d=Math.hypot(vx,vz);if(d<.025)pathIndex++;else{[camera.x,camera.z]=moveIfFree(camera.x+vx/d*speed,camera.z+vz/d*speed,speed);moved=true;}}
  if(moved)simulation?.trampleAt(camera.x,camera.z,currentWorldState?.player?.blood||0);
  camera.y=walkEyeY();
}
function drawMap(){
  if(!map2d||!grid)return;const size=grid.size,cell=map.width/size;map2d.fillStyle='#080b12';map2d.fillRect(0,0,map.width,map.height);
  map2d.fillStyle='#475569';for(let z=0;z<size;z++)for(let x=0;x<size;x++)if(grid.cells[z*size+x])map2d.fillRect(x*cell,z*cell,cell+1,cell+1);
  if(path.length){map2d.strokeStyle='#38bdf8';map2d.lineWidth=2;map2d.beginPath();path.forEach(([x,z],i)=>(i?map2d.lineTo(x*cell+cell/2,z*cell+cell/2):map2d.moveTo(x*cell+cell/2,z*cell+cell/2)));map2d.stroke();}
  map2d.fillStyle='#f8fafc';map2d.beginPath();map2d.arc((camera.x+1)*.5*map.width,(camera.z+1)*.5*map.height,4,0,Math.PI*2);map2d.fill();
}
function draw(now=0){
  if(viewer.hidden)return;const rawFrameMs=last?now-last:0,dt=Math.min(.05,rawFrameMs/1000||0);last=now;lastFrameMs=rawFrameMs;worstFrameMs=Math.max(worstFrameMs,rawFrameMs);frameCount++;if(!frameWindowStart)frameWindowStart=now;if(now-frameWindowStart>=1000){lastFps=frameCount*1000/(now-frameWindowStart);if(lastFps<28)renderScale=Math.max(.45,renderScale-.08);else if(lastFps>52)renderScale=Math.min(1,renderScale+.08);if(performanceStatus)performanceStatus.textContent=`${lastFps.toFixed(0)} FPS · ${count.toLocaleString('de-DE')} Punkte · ${Math.round(renderScale*100)} % Auflösung · max ${worstFrameMs.toFixed(0)} ms`;frameWindowStart=now;frameCount=0;worstFrameMs=0;}tickWalk(dt);
  const ratio=Math.min(devicePixelRatio||1,2)*renderScale,w=Math.max(1,Math.floor(canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(canvas.clientHeight*ratio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const state=engineWorldState(now),params=state.params;currentWorldState=state;advanceWorld(dt,state);auditState(now,state);if(seasonRun&&[4,7].includes(state.season?.phase)&&now-lastShowcaseStep>180){lastShowcaseStep=now;const t=(now-seasonRun)/1000;simulation?.trampleAt(Math.sin(t*.8)*.65,Math.cos(t*.47)*.35,0);}if(now-lastWorldUpload>400){lastWorldUpload=now;upload(pipelinePoints(params));}gl.viewport(0,0,w,h);gl.clear(gl.DEPTH_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.useProgram(skyProgram);gl.uniform2f(gl.getUniformLocation(skyProgram,'u_resolution'),w,h);gl.uniform2f(gl.getUniformLocation(skyProgram,'u_look'),camera.yaw,camera.pitch);gl.uniform1f(gl.getUniformLocation(skyProgram,'u_time'),now/1000);gl.uniform1f(gl.getUniformLocation(skyProgram,'u_night'),params.dayNight||0);gl.uniform1f(gl.getUniformLocation(skyProgram,'u_storm'),params.storm||0);gl.uniform1f(gl.getUniformLocation(skyProgram,'u_fog'),params.fog||0);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);gl.useProgram(program);gl.uniformMatrix4fv(gl.getUniformLocation(program,'u_matrix'),false,cameraMatrix());gl.uniform1f(gl.getUniformLocation(program,'u_pointScale'),2*ratio);gl.uniform1f(gl.getUniformLocation(program,'u_time'),now/1000);gl.uniform1f(gl.getUniformLocation(program,'u_wind'),Math.max(params.wind||0,params.storm||0));gl.uniform1f(gl.getUniformLocation(program,'u_bloom'),params.bloom||0);gl.uniform1f(gl.getUniformLocation(program,'u_autumn'),params.autumn||0);gl.uniform1f(gl.getUniformLocation(program,'u_snow'),params.snow||0);gl.uniform1f(gl.getUniformLocation(program,'u_heat'),Math.max(0,(params.temperature||0)-.65));gl.uniform1f(gl.getUniformLocation(program,'u_night'),params.dayNight||0);gl.drawArrays(gl.POINTS,0,count);drawMap();raf=requestAnimationFrame(draw);
}
function close(){if(recording&&mediaRecorder?.state==='recording')mediaRecorder.stop();viewer.hidden=true;cancelAnimationFrame(raf);keys.clear();}
openButton?.addEventListener('click',()=>{try{sourceCloud=window.SHADED?.spatial.pointCloud({step:8}).points;rebuildEnvironment();reset();setMode('orbit');viewer.hidden=false;last=performance.now();draw(last);}catch(error){window.alert(`Raumansicht nicht verfügbar: ${error.message}`);}});
closeButton?.addEventListener('click',close);walkButton?.addEventListener('click',()=>setMode(mode==='walk'?'orbit':'walk'));
canvas?.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);if(paintMode){painting=true;paintAt(e);return;}dragging={x:e.clientX,y:e.clientY,pan:e.shiftKey};});
canvas?.addEventListener('pointermove',e=>{if(paintMode){const pressure=e.pressure>0?e.pressure:.5;if(pressureStatus)pressureStatus.textContent=`Druck: ${pressure.toFixed(3)} · Neigung: ${e.tiltX||0}°/${e.tiltY||0}°`;if(painting&&e.buttons&&performance.now()-lastPaintTime>24){lastPaintTime=performance.now();paintAt(e);}return;}if(!dragging)return;const dx=(e.clientX-dragging.x)/canvas.clientWidth,dy=(e.clientY-dragging.y)/canvas.clientHeight;if((dragging.pan||e.shiftKey)&&mode==='orbit'){dragging.pan=true;camera.x-=dx*2;camera.y+=dy*2;}else{camera.yaw+=dx*4;camera.pitch=Math.max(-1.45,Math.min(1.45,camera.pitch+dy*4));}dragging.x=e.clientX;dragging.y=e.clientY;});
canvas?.addEventListener('pointerup',()=>{dragging=null;painting=false;});canvas?.addEventListener('pointercancel',()=>{dragging=null;painting=false;});canvas?.addEventListener('wheel',e=>{e.preventDefault();if(mode==='orbit')camera.z=Math.max(.35,Math.min(8,camera.z*Math.exp(e.deltaY*.001)));},{passive:false});canvas?.addEventListener('dblclick',reset);
map?.addEventListener('click',e=>{if(!grid)return;const rect=map.getBoundingClientRect(),goal=[Math.floor((e.clientX-rect.left)/rect.width*grid.size),Math.floor((e.clientY-rect.top)/rect.height*grid.size)],start=[worldToCell(camera.x,grid.size),worldToCell(camera.z,grid.size)];path=dijkstraGrid(grid,start,goal);pathIndex=1;drawMap();});
boundarySlider?.addEventListener('input',rebuildEnvironment);boundaryForm?.addEventListener('change',rebuildEnvironment);
thicknessSlider?.addEventListener('input',rebuildEnvironment);textureBlendSlider?.addEventListener('input',rebuildEnvironment);seedInput?.addEventListener('change',rebuildEnvironment);
canopyFlexSlider?.addEventListener('input',rebuildEnvironment);
paintButton?.addEventListener('click',()=>{paintMode=!paintMode;paintButton.textContent=paintMode?'🖊️ Malen aktiv · Orbit gesperrt':'🖊️ Malen aktivieren';canvas.style.cursor=paintMode?'crosshair':'grab';log('Voxel-Pinsel',{active:paintMode});});
undoButton?.addEventListener('click',()=>{if(environment?.voxelWorld?.undo()){refreshVoxelDerivedGrid();log('Voxel Undo');}});
redoButton?.addEventListener('click',()=>{if(environment?.voxelWorld?.redo()){refreshVoxelDerivedGrid();log('Voxel Redo');}});
voxelExport?.addEventListener('click',()=>{if(!environment?.voxelWorld)return;downloadJson(`SHADED_voxel_${Date.now()}.json`,environment.voxelWorld.toJSON());log('Voxel-Projekt exportiert',{voxels:environment.voxelWorld.voxels.size,free:environment.voxelWorld.free.size});});
voxelImport?.addEventListener('change',async()=>{const file=voxelImport.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text()),provider=data?.format==='SHADED.spatial-provider-bundle.v1';const world=provider?SparseVoxelWorld.fromProviderBundle(data):SparseVoxelWorld.fromJSON(data);const importedPoints=world.surfacePoints();sourceCloud=importedPoints;environment={points:importedPoints,voxelWorld:world,metrics:{coverage:1,rmse:null,normalizedRmse:null,score:null},primitives:[],generated:[]};refreshVoxelDerivedGrid();if(fitStatus)fitStatus.textContent=provider?`Provider importiert: ${data.result.provider} · ${world.voxels.size} Oberflächenvoxel`:`Voxel-Projekt importiert · ${world.voxels.size} Oberflächenvoxel`;log(provider?'Provider-Bundle importiert':'Voxel-Projekt importiert',{provider:provider?data.result.provider:undefined,model:provider?data.result.modelVersion:undefined,voxels:world.voxels.size,free:world.free.size});}catch(error){log('Räumlicher Import fehlgeschlagen',error.message);}});
seasonsButton?.addEventListener('click',()=>{if(seasonRun&&!recording){seasonRun=null;seasonPhase=-1;seasonsButton.textContent='🌸 Jahreszeiten-Showcase';seasonStatus.textContent='Manuelle Weltzeit';log('Showcase gestoppt');}else if(!seasonRun){seasonRate=Number(timeScale.value);seasonRun=performance.now();seasonPhase=-1;lastShowcaseStep=0;seasonsButton.textContent='⏹ Showcase stoppen';log('Showcase gestartet',{rate:seasonRate,timeline:activeTimeline().length});}});
sceneAdd?.addEventListener('click',()=>{const scene={season:sceneSeason.value,event:sceneEvent.value,duration:Math.max(1,Number(sceneDuration.value)||1)};customScenes.push(scene);renderSceneList();log('Szene hinzugefügt',scene);});
recordButton?.addEventListener('click',()=>{
  if(recording){mediaRecorder?.stop();return;}if(!canvas.captureStream||typeof MediaRecorder==='undefined'){log('Aufnahme nicht unterstützt');return;}
  const duration=Math.max(5,Number(recordDuration.value)||45),timeline=activeTimeline(),logical=timeline.reduce((sum,phase)=>sum+phase.dur,0),chunks=[],stream=canvas.captureStream(30),options=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?{mimeType:'video/webm;codecs=vp9'}:{mimeType:'video/webm'};
  mediaRecorder=new MediaRecorder(stream,options);mediaRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};mediaRecorder.onstop=()=>{recording=false;recordButton.textContent='🔴 Showcase aufnehmen';seasonRun=null;seasonPhase=-1;seasonStatus.textContent='Manuelle Weltzeit';seasonsButton.textContent='🌸 Jahreszeiten-Showcase';stream.getTracks().forEach(track=>track.stop());const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));a.download=`SHADED_Jahreszeiten_${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);log('Aufnahme gespeichert',{duration});};
  seasonRate=logical/duration;seasonRun=performance.now();seasonPhase=-1;lastShowcaseStep=0;recording=true;recordButton.textContent='⏹ Aufnahme stoppen';mediaRecorder.start(500);log('Aufnahme gestartet',{duration,logicalSeconds:logical,rate:seasonRate,scenes:timeline.length});setTimeout(()=>{if(recording&&mediaRecorder?.state==='recording')mediaRecorder.stop();},duration*1000);
});
for(const input of [boundarySlider,boundaryForm,thicknessSlider,textureBlendSlider,seedInput,vegetationSlider,canopyFlexSlider,windDirection,lightningRate,urineRate,bloodRate,rainExtinguish,timeScale,recordDuration])input?.addEventListener('input',()=>log(`UI ${input.id}`,input.value));
pipelineButtons.forEach(button=>button.addEventListener('click',()=>selectPipelineStage(button.dataset.spatialStage)));
nowLightning?.addEventListener('click',()=>applySceneEvent('lightning'));nowBlood?.addEventListener('click',()=>applySceneEvent('blood'));nowUrine?.addEventListener('click',()=>applySceneEvent('urine'));
window.addEventListener('keydown',e=>{if(viewer.hidden)return;if(e.key==='Escape')close();keys.add(e.key.toLowerCase());});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
if(window.SHADED?.spatial)window.SHADED.spatial.voxel={
  state:()=>environment?.voxelWorld?{format:'SHADED.sparse-voxel-world.v1',resolution:environment.voxelWorld.resolution,voxels:environment.voxelWorld.voxels.size,free:environment.voxelWorld.free.size,revision:environment.voxelWorld.revision,bounds:environment.voxelWorld.bounds}:null,
  fit:()=>environment?JSON.parse(JSON.stringify(environment.metrics||{})):null,
  paint:(center,brush)=>{if(!environment?.voxelWorld)throw new Error('Raumansicht zuerst öffnen');const result=environment.voxelWorld.paint(center,brush);if(result.changed)refreshVoxelDerivedGrid();return result;},
  undo:()=>{const changed=!!environment?.voxelWorld?.undo();if(changed)refreshVoxelDerivedGrid();return changed;},
  redo:()=>{const changed=!!environment?.voxelWorld?.redo();if(changed)refreshVoxelDerivedGrid();return changed;},
  importProviderBundle:bundle=>{const world=SparseVoxelWorld.fromProviderBundle(bundle),points=world.surfacePoints();sourceCloud=points;environment={points,voxelWorld:world,metrics:{coverage:1,rmse:null,normalizedRmse:null,score:null},primitives:[],generated:[]};refreshVoxelDerivedGrid();return {provider:bundle.result.provider,modelVersion:bundle.result.modelVersion,voxels:world.voxels.size,free:world.free.size};},
  project:()=>environment?.voxelWorld?.toJSON()||null,
  mesh:()=>environment?.voxelWorld?.extractSurfaceMesh()||null,
  audit:()=>simulation?{events:simulation.events.slice(),mass:simulation.massBudget(),tick:simulation.tick,time:simulation.time}:null
};
if(window.SHADED?.spatial)window.SHADED.spatial.viewer={
  state:()=>environment?{mode,pipelineStage,camera:{...camera},points:count,observed:environment.observed?.length||0,generated:environment.generated?.length||0,mirrored:environment.mirroredCompletion?.length||0,primitiveGenerated:environment.primitiveCompletion?.length||0,floorY:environment.floorY,skybox:'procedural-directional-background',boundaryTrees:boundaryPoints.filter(point=>point.treeId!=null).length,fps:lastFps,lastFrameMs,renderScale}:null,
  stages:()=>Object.entries(PIPELINE_STAGES).map(([id,description])=>({id,description})),
  stage:stage=>selectPipelineStage(stage),
  setMode:next=>{if(!['orbit','walk'].includes(next))throw new Error('Modus muss orbit oder walk sein');setMode(next);return {...camera};},
  setCamera:next=>{for(const key of ['x','y','z','yaw','pitch'])if(Number.isFinite(next?.[key]))camera[key]=next[key];camera.pitch=Math.max(-1.55,Math.min(1.55,camera.pitch));return {...camera};},
  route:(start=[0,.62],goal=[0,-.62])=>routeBetween(start,goal),
  walkTo:(x,z)=>{const start=[worldToCell(camera.x,grid.size),worldToCell(camera.z,grid.size)],goalWorld=nearestWalkable(x,z),goal=[worldToCell(goalWorld[0],grid.size),worldToCell(goalWorld[1],grid.size)];path=dijkstraGrid(grid,start,goal);pathIndex=1;return path.slice();}
};
