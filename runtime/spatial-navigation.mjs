// Spatial algorithms shared by the free viewer and deterministic tests.
// Generated mirror points are explicitly marked; observed points stay untouched.
export function dykstraProject(point, sets, { maxIterations=48, tolerance=1e-6 }={}) {
  const x=Float64Array.from(point);
  const residuals=sets.map(()=>new Float64Array(x.length));
  for(let iteration=0;iteration<maxIterations;iteration++){
    let change=0;
    sets.forEach((set,i)=>{
      const input=x.map((value,j)=>value+residuals[i][j]);
      const output=set.project(input);
      for(let j=0;j<x.length;j++){
        residuals[i][j]=input[j]-output[j];
        change=Math.max(change,Math.abs(output[j]-x[j]));
        x[j]=output[j];
      }
    });
    if(change<tolerance)return {point:Array.from(x),iterations:iteration+1};
  }
  return {point:Array.from(x),iterations:maxIterations};
}

export function boxSet(minX,maxX,minZ,maxZ) {
  return {project:([x,z])=>[Math.max(minX,Math.min(maxX,x)),Math.max(minZ,Math.min(maxZ,z))]};
}

export function diskSet(centerX,centerZ,radius) {
  return {project:([x,z])=>{
    const dx=x-centerX,dz=z-centerZ,length=Math.hypot(dx,dz);
    return length<=radius||length===0?[x,z]:[centerX+dx*radius/length,centerZ+dz*radius/length];
  }};
}

const stableNoise=(a,b=0)=>Math.sin(a*127.1+b*311.7)*43758.5453-Math.floor(Math.sin(a*127.1+b*311.7)*43758.5453);

export function buildPositivePrimitiveSet(points) {
  if(!points.length)return [];
  const bins=new Map(),resolution=8;
  points.forEach((p,index)=>{
    const bx=Math.max(0,Math.min(resolution-1,Math.floor((p.x+.8)*.625*resolution))),by=Math.max(0,Math.min(resolution-1,Math.floor((p.y+.8)*.625*resolution))),key=`${bx}:${by}`;
    if(!bins.has(key))bins.set(key,{indices:[],minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity,color:[0,0,0]});
    const b=bins.get(key);b.indices.push(index);b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);b.minZ=Math.min(b.minZ,p.z);b.maxZ=Math.max(b.maxZ,p.z);b.color[0]+=p.r;b.color[1]+=p.g;b.color[2]+=p.b;
  });
  return Array.from(bins.values()).map((b,id)=>{
    const n=b.indices.length,w=b.maxX-b.minX,h=b.maxY-b.minY,d=b.maxZ-b.minZ;
    const type=h>w*1.6?'column':(b.maxY<-.12?'ground':(w>h*1.8?'surface':'mass'));
    return {id,type,center:[(b.minX+b.maxX)/2,(b.minY+b.maxY)/2,(b.minZ+b.maxZ)/2],extent:[Math.max(.01,w/2),Math.max(.01,h/2),Math.max(.01,d/2)],color:b.color.map(v=>v/n),sourceIndices:b.indices,confidence:.9};
  });
}

export function synthesizePrimitiveBackside(observed,primitives,{similarity=.9,repair=.75,seed=17}={}) {
  const variation=1-Math.max(.85,Math.min(.95,similarity)),out=[];
  for(const primitive of primitives){
    for(const sourceIndex of primitive.sourceIndices){
      const p=observed[sourceIndex],n1=stableNoise(sourceIndex+seed,primitive.id),n2=stableNoise(sourceIndex+seed*2,primitive.id);
      const source=observed[primitive.sourceIndices[Math.floor(n1*primitive.sourceIndices.length)]]||p;
      const stamp=Math.max(0,Math.min(1,repair)),jitter=(n1-.5)*variation*1.8;
      out.push({...p,x:p.x+jitter*(primitive.type==='ground'?.35:1),y:p.y+(n2-.5)*variation*(primitive.type==='column'?.35:1),z:-p.z+(n2-.5)*variation*2,
        r:p.r*(1-stamp)+source.r*stamp,g:p.g*(1-stamp)+source.g*stamp,b:p.b*(1-stamp)+source.b*stamp,
        generated:true,synthesized:true,primitiveId:primitive.id,primitiveType:primitive.type,repairSource:sourceIndex,confidence:similarity*.38});
    }
  }
  return out;
}

export function mirrorPointCloud(points,options={}) {
  if(!points.length)return {points:[],bounds:{minX:-1,maxX:1,minZ:-1,maxZ:1}};
  let max=0;
  for(const p of points)max=Math.max(max,Math.abs(p.x),Math.abs(p.y),Math.abs(p.z-.5));
  const scale=max?.9/max:1;
  const observed=points.map(p=>({...p,x:p.x*scale,y:p.y*scale,z:(p.z-.5)*scale,generated:false}));
  // The unseen side is synthesised from positive observed primitives. Keep
  // provenance on every varied point so it can never be mistaken for measurement.
  const primitives=buildPositivePrimitiveSet(observed),generated=synthesizePrimitiveBackside(observed,primitives,options);
  return {points:[...observed,...generated],primitives,bounds:{minX:-1,maxX:1,minZ:-1,maxZ:1}};
}

export function buildNavigationGrid(environment,size=36) {
  const cells=new Uint8Array(size*size),material=new Uint8Array(size*size);
  // A sparse density map turns strong vertical clusters into simple obstacles.
  const density=new Uint16Array(size*size);
  for(const p of environment.points){
    if(p.y<-.2)continue;
    const x=Math.max(0,Math.min(size-1,Math.floor((p.x+1)*.5*size)));
    const z=Math.max(0,Math.min(size-1,Math.floor((p.z+1)*.5*size)));
    density[z*size+x]++;
  }
  const sorted=Array.from(density).filter(Boolean).sort((a,b)=>a-b);
  const threshold=sorted[Math.floor(sorted.length*.82)]||Infinity;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const edge=x<1||z<1||x>=size-1||z>=size-1;
    cells[z*size+x]=edge||density[z*size+x]>=threshold?1:0;
  }
  // Always retain a small navigable spawn area in the centre.
  const c=Math.floor(size/2);
  for(let z=c-2;z<=c+2;z++)for(let x=c-2;x<=c+2;x++)cells[z*size+x]=0;
  return {size,cells,material};
}

class MinHeap {
  constructor(){this.items=[];}
  push(item){this.items.push(item);let i=this.items.length-1;while(i){const p=(i-1)>>1;if(this.items[p][0]<=item[0])break;this.items[i]=this.items[p];i=p;}this.items[i]=item;}
  pop(){
    if(!this.items.length)return null;
    const root=this.items[0],last=this.items.pop();
    if(this.items.length){
      let i=0;
      while(true){
        const l=i*2+1,r=l+1;
        if(l>=this.items.length)break;
        const child=r<this.items.length&&this.items[r][0]<this.items[l][0]?r:l;
        if(this.items[child][0]>=last[0])break;
        this.items[i]=this.items[child];i=child;
      }
      this.items[i]=last;
    }
    return root;
  }
}

export function dijkstraGrid(grid,start,goal) {
  const {size,cells}=grid,total=size*size,index=([x,z])=>z*size+x;
  const startIndex=index(start),goalIndex=index(goal),distance=new Float64Array(total),previous=new Int32Array(total);
  distance.fill(Infinity);previous.fill(-1);distance[startIndex]=0;
  const queue=new MinHeap();queue.push([0,startIndex]);
  const directions=[[1,0],[-1,0],[0,1],[0,-1]];
  while(queue.items.length){
    const [cost,current]=queue.pop();if(cost!==distance[current])continue;if(current===goalIndex)break;
    const x=current%size,z=Math.floor(current/size);
    for(const [dx,dz] of directions){const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=size||nz>=size)continue;const next=nz*size+nx;if(cells[next])continue;const candidate=cost+1;if(candidate<distance[next]){distance[next]=candidate;previous[next]=current;queue.push([candidate,next]);}}
  }
  if(!Number.isFinite(distance[goalIndex]))return [];
  const path=[];for(let at=goalIndex;at!==-1;at=previous[at])path.push([at%size,Math.floor(at/size)]);
  return path.reverse();
}

export function worldToCell(value,size){return Math.max(1,Math.min(size-2,Math.floor((value+1)*.5*size)));}
export function cellToWorld(value,size){return ((value+.5)/size)*2-1;}

export function addProceduralBoundaries(grid,density=0,form='trees',canopyFlex=.6) {
  const points=[],amount=Math.max(0,Math.min(1,Number(density)||0));
  if(!amount)return points;
  const count=Math.max(4,Math.round(8+amount*40)),radius=.82;
  for(let i=0;i<count;i++){
    const angle=i/count*Math.PI*2,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    const cx=worldToCell(x,grid.size),cz=worldToCell(z,grid.size),blockRadius=form==='rocks'?1:0;
    for(let dz=-blockRadius;dz<=blockRadius;dz++)for(let dx=-blockRadius;dx<=blockRadius;dx++){
      const nx=cx+dx,nz=cz+dz;if(nx>0&&nz>0&&nx<grid.size-1&&nz<grid.size-1){const cell=nz*grid.size+nx;grid.cells[cell]=1;if(grid.material)grid.material[cell]=form==='trees'?1:2;}
    }
    if(form==='trees'){
      for(let y=-.32;y<.28;y+=.045)points.push({x,y,z,r:91,g:58,b:34,kind:2,generated:true,confidence:.25});
      const bend=canopyFlex<.25?20:(canopyFlex<.7?20+(i%2):21+(i%2));
      for(let a=0;a<12;a++){const t=a/12*Math.PI*2;points.push({x:x+Math.cos(t)*.085,y:.29+Math.sin(t*2)*.04,z:z+Math.sin(t)*.085,r:38,g:128,b:67,kind:bend,generated:true,confidence:.25});}
    }else{
      for(let a=0;a<18;a++){const t=a/18*Math.PI*2;points.push({x:x+Math.cos(t)*.11,y:-.28+Math.abs(Math.sin(t))*.12,z:z+Math.sin(t)*.08,r:91,g:101,b:116,kind:3,generated:true,confidence:.25});}
    }
  }
  return points;
}

export function buildWorldLawPoints(grid,params={}) {
  const points=[],water=Math.max(0,Math.min(1,Math.max(params.rain||0,params.wet||0,params.puddle||0)));
  if(water<.05)return points;
  // Water is only emitted on FREE cells, remains below eye/floor level, and
  // favours deterministic basins. It can never occupy a boundary/obstacle cell.
  for(let z=1;z<grid.size-1;z++)for(let x=1;x<grid.size-1;x++){
    if(grid.cells[z*grid.size+x])continue;
    const basin=(Math.sin(x*12.9898+z*78.233)*43758.5453)%1;
    if(Math.abs(basin)>water*.38)continue;
    points.push({x:cellToWorld(x,grid.size),y:-.31,z:cellToWorld(z,grid.size),r:45,g:132,b:190,kind:1,generated:true,confidence:.5});
  }
  return points;
}

const clamp01=value=>Math.max(0,Math.min(1,value));
export class SpatialWorldSimulation {
  constructor(grid){
    this.grid=grid;this.time=0;
    for(const name of ['water','wet','dry','steam','snow','ice','hail','fire','ember','smoke','soot','mud','decay','growth','heat','grass','pressed','leafDry','leafWet','blood','urine','flower','fruit','dew','trail'])this[name]=new Float32Array(grid.size*grid.size);
    this.bloodMemory=new Float32Array(grid.size*grid.size);
  }
  trampleAt(x,z,blood=0){
    const cx=worldToCell(x,this.grid.size),cz=worldToCell(z,this.grid.size);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,nz=cz+dz;if(nx<1||nz<1||nx>=this.grid.size-1||nz>=this.grid.size-1)continue;const i=nz*this.grid.size+nx;if(this.grid.cells[i])continue;const weight=(dx!==0||dz!==0)?0.45:1;this.pressed[i]=clamp01(this.pressed[i]+.24*weight);this.trail[i]=clamp01(this.trail[i]+.3*weight);this.grass[i]*=.82;this.flower[i]*=.65;this.water[i]=clamp01(this.water[i]+this.wet[i]*.025*weight);this.mud[i]=clamp01(this.mud[i]+this.wet[i]*.08*weight);if(blood>0){this.blood[i]=Math.max(this.blood[i],blood*weight);this.bloodMemory[i]=Math.max(this.bloodMemory[i],blood*.22*weight);}}
  }
  contaminateAt(x,z,type='blood',amount=1){const cx=worldToCell(x,this.grid.size),cz=worldToCell(z,this.grid.size),field=type==='urine'?this.urine:this.blood;for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const i=(cz+dz)*this.grid.size+cx+dx;if(i<0||i>=field.length||this.grid.cells[i])continue;const value=clamp01(amount*((dx!==0||dz!==0)?0.45:1));field[i]=Math.max(field[i],value);if(type==='blood')this.bloodMemory[i]=Math.max(this.bloodMemory[i],value*.22);}return {x:cx,z:cz,type,amount};}
  strikeLightning(random=Math.random){const wood=[];for(let i=0;i<this.grid.cells.length;i++)if(this.grid.material?.[i]===1)wood.push(i);if(!wood.length)return null;const i=wood[Math.floor(random()*wood.length)];this.fire[i]=1;this.heat[i]=1;this.ember[i]=.65;return {x:i%this.grid.size,z:Math.floor(i/this.grid.size),material:'wood'};}
  step(dt,state={}){
    dt=Math.max(0,Math.min(.25,dt));this.time+=dt;
    const p=state.params||state,e=state.elements||{},n=this.grid.cells.length;
    const rain=clamp01(Math.max(p.rain||0,e.wet||0)),snowfall=clamp01(Math.max(p.snowfall||0,p.snow||0));
    const cold=clamp01(1-(p.temperature??.5)*1.7),heatWeather=clamp01(((p.temperature??.5)-.55)*2.2+(e.heat||0)+(e.lava||0));
    const wind=clamp01(Math.max(p.wind||0,p.storm||0)),hailfall=clamp01(e.hail||0),fireSeed=clamp01((state.fireCount||0)*.35+(e.heat||0)*.45+(e.lava||0)*.8);
    this.weather={rain,snowfall,hailfall,wind};
    for(let i=0;i<n;i++){
      const wood=this.grid.material?.[i]===1;if(this.grid.cells[i]&&!wood)continue;
      const x=i%this.grid.size,z=Math.floor(i/this.grid.size),noise=Math.abs(Math.sin(x*12.9898+z*78.233));
      this.water[i]=clamp01(this.water[i]+dt*(rain*.22+this.snow[i]*heatWeather*.18-this.ice[i]*cold*.04-this.steam[i]*.02));
      this.wet[i]=clamp01(this.wet[i]+dt*(rain*.35+this.water[i]*.12-(.035+wind*.07+heatWeather*.12)));
      this.dry[i]=clamp01(this.dry[i]+dt*((1-this.wet[i])*(.03+wind*.08+heatWeather*.14)-rain*.3-this.water[i]*.12));
      this.snow[i]=clamp01(this.snow[i]+dt*(snowfall*cold*.24-this.snow[i]*(heatWeather*.3+rain*.08)));
      this.ice[i]=clamp01(this.ice[i]+dt*(this.water[i]*cold*.28-this.ice[i]*(heatWeather*.36+this.fire[i]*.5)));
      this.water[i]=clamp01(this.water[i]-this.ice[i]*cold*dt*.08);
      this.hail[i]=clamp01(this.hail[i]+dt*(hailfall*.5-this.hail[i]*(heatWeather*.4+.04)));
      const dryFuel=clamp01(1-this.wet[i]-this.snow[i]*.7-this.ice[i]*.4);
      if(fireSeed>.05&&noise>.82)this.fire[i]=Math.max(this.fire[i],fireSeed*dryFuel);
      this.fire[i]=clamp01(this.fire[i]+dt*(this.ember[i]*.08+wind*this.fire[i]*dryFuel*.06-rain*.55*(p.rainExtinguish??1)-this.water[i]*.34-.11));
      this.ember[i]=clamp01(this.ember[i]+dt*(this.fire[i]*.24-rain*.28-.035));
      this.heat[i]=clamp01(this.heat[i]+dt*(this.fire[i]*.8+heatWeather*.12-this.water[i]*.2-this.heat[i]*.2));
      const evaporate=dt*(this.water[i]+this.wet[i])*(this.heat[i]+heatWeather)*.18;
      this.water[i]=clamp01(this.water[i]-evaporate);this.wet[i]=clamp01(this.wet[i]-evaporate*.6);
      this.steam[i]=clamp01(this.steam[i]+evaporate+dt*(rain*this.fire[i]*.35-this.steam[i]*(.12+wind*.1)));
      this.smoke[i]=clamp01(this.smoke[i]+dt*(this.fire[i]*.4+this.ember[i]*.05-this.smoke[i]*(.06+wind*.14)));
      this.soot[i]=clamp01(this.soot[i]+dt*(this.smoke[i]*.035+this.fire[i]*.025-rain*.02));
      this.mud[i]=clamp01(this.mud[i]+dt*(this.water[i]*this.wet[i]*.18-this.mud[i]*(.015+heatWeather*.06)));
      this.decay[i]=clamp01(this.decay[i]+dt*((p.decay||0)*.08+this.wet[i]*.018+this.soot[i]*.006-this.fire[i]*.08));
      this.growth[i]=clamp01(this.growth[i]+dt*((p.bloom||0)*this.wet[i]*.08+this.decay[i]*this.wet[i]*.02-this.fire[i]*.3-this.snow[i]*.04));
      const vegetation=clamp01(p.vegetation??.65);
      this.grass[i]=clamp01(this.grass[i]+dt*(vegetation*(.015+this.wet[i]*.07+(p.bloom||0)*.08)-this.pressed[i]*.1-this.fire[i]*.35-this.snow[i]*.025));
      this.pressed[i]=clamp01(this.pressed[i]-dt*(.008+this.grass[i]*.012));
      this.leafWet[i]=clamp01(this.leafWet[i]+dt*(rain*.18+this.wet[i]*.025-this.leafWet[i]*(.025+heatWeather*.08)));
      this.leafDry[i]=clamp01(this.leafDry[i]+dt*(vegetation*wind*.035+this.dry[i]*wind*.02-this.leafWet[i]*.12-this.fire[i]*.4));
      if(this.leafDry[i]>.2&&fireSeed>.05&&dryFuel>.35)this.fire[i]=clamp01(this.fire[i]+this.leafDry[i]*fireSeed*dt*.3);
      this.blood[i]=Math.max(this.bloodMemory[i],clamp01(this.blood[i]-dt*(rain*.025+this.water[i]*.008)));
      this.urine[i]=clamp01(this.urine[i]-dt*(rain*.09+this.water[i]*.025+heatWeather*.035));
      this.flower[i]=clamp01(this.flower[i]+dt*((p.bloom||0)*this.grass[i]*.11-this.flower[i]*(heatWeather*.06+this.snow[i]*.12+this.pressed[i]*.2)));
      this.fruit[i]=clamp01(this.fruit[i]+dt*((p.seasonFruit||0)*this.flower[i]*.14-this.fruit[i]*(wind*.04+this.fire[i]*.3)));
      this.dew[i]=clamp01(this.dew[i]+dt*((p.dew||0)*(.08+this.grass[i]*.08)-(heatWeather*.16+wind*.045)*this.dew[i]));
      this.trail[i]=clamp01(this.trail[i]-dt*(this.growth[i]*.045+this.grass[i]*.025+(p.bloom||0)*.015));
    }
    // Wind transports airborne properties to the neighbouring downwind cell.
    if(wind>.05){for(const field of [this.smoke,this.steam]){const copy=field.slice();for(let z=1;z<this.grid.size-1;z++)for(let x=1;x<this.grid.size-1;x++){const i=z*this.grid.size+x,j=z*this.grid.size+Math.min(this.grid.size-2,x+1);const moved=copy[i]*wind*dt*.22;field[i]-=moved;field[j]=clamp01(field[j]+moved);}}}
    // Creepers colonise adjacent wet cells instead of appearing as isolated dots.
    const oldGrowth=this.growth.slice();for(let z=1;z<this.grid.size-1;z++)for(let x=1;x<this.grid.size-1;x++){const i=z*this.grid.size+x;if(this.grid.cells[i]||this.wet[i]<.08)continue;const neighbour=Math.max(oldGrowth[i-1],oldGrowth[i+1],oldGrowth[i-this.grid.size],oldGrowth[i+this.grid.size]);this.growth[i]=clamp01(this.growth[i]+neighbour*this.wet[i]*dt*.035);}
  }
  points(){
    const out=[],s=this.grid.size,add=(x,z,y,value,kind,color,threshold=.04)=>{if(value<threshold)return;out.push({x:cellToWorld(x,s),y,z:cellToWorld(z,s),r:color[0],g:color[1],b:color[2],kind,generated:true,confidence:.5,size:value});};
    for(let z=1;z<s-1;z++)for(let x=1;x<s-1;x++){const i=z*s+x;if(this.grid.cells[i]&&this.grid.material?.[i]!==1)continue;const pigment=clamp01(this.blood[i]+this.urine[i]),waterColor=[45+this.blood[i]*125+this.urine[i]*95,132-this.blood[i]*85+this.urine[i]*35,190-this.blood[i]*115-this.urine[i]*130],snowColor=[235,this.blood[i]>0?190:242-this.urine[i]*55,250-this.blood[i]*90-this.urine[i]*145];
      add(x,z,-.31,this.water[i],1,waterColor);add(x,z,-.305,this.mud[i],12,[92+pigment*35,58,35]);add(x,z,-.302,this.dry[i],18,[164,132,88]);add(x,z,-.30,this.ice[i],6,[150+this.blood[i]*70,210-this.blood[i]*80,235-this.urine[i]*80]);add(x,z,-.29,this.snow[i],5,snowColor);add(x,z,-.27,this.hail[i],7,[185,220,245]);add(x,z,-.18,this.fire[i],8,[255,92,20]);add(x,z,-.12,this.ember[i],9,[255,156,35]);add(x,z,-.28,this.soot[i],11,[32,34,39]);add(x,z,-.26,this.decay[i],13,[86,69,50]);add(x,z,-.20,this.growth[i],14,[42,126,62]);add(x,z,-.18-this.pressed[i]*.09,this.grass[i],19,[62,145,65]);add(x,z,-.12,this.leafDry[i],23,[159,103,43]);add(x,z,-.16,this.leafWet[i],24,[74,103,45]);add(x,z,-.275,this.blood[i],25,[112,18,24]);add(x,z,-.27,this.urine[i],30,[190,170,48]);add(x,z,-.10,this.flower[i],26,[245,105,180]);add(x,z,-.08,this.fruit[i],27,[220,65,35]);add(x,z,-.16,this.dew[i],28,[170,225,245]);add(x,z,-.285,this.trail[i],29,[76,57,38]);add(x,z,.02,this.steam[i],4,[190,210,215]);add(x,z,.16,this.smoke[i],10,[65,68,75]);
    }
    const weather=this.weather||{};
    for(let z=2;z<s-2;z+=3)for(let x=2;x<s-2;x+=3){const seed=Math.abs(Math.sin(x*31.17+z*17.31));
      if(seed<(weather.rain||0)*.7)add(x,z,.38,weather.rain,15,[115,175,225]);
      if(seed<(weather.snowfall||0)*.55)add(x,z,.42,weather.snowfall,16,[240,246,255]);
      if(seed<(weather.hailfall||0)*.7)add(x,z,.44,weather.hailfall,17,[190,225,250]);
    }
    return out;
  }
}
