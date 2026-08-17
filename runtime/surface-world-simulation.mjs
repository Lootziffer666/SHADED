import {seededRandom} from './spatial-reconstruction.mjs';

const clamp01 = value => Math.max(0, Math.min(1, value));
const worldToCell = (value, size) => Math.max(1, Math.min(size - 2, Math.floor((value + 1) * 0.5 * size)));
const cellToWorld = (value, size) => ((value + 0.5) / size) * 2 - 1;

const LEGACY_FIELDS = [
  'water', 'wet', 'dry', 'steam', 'snow', 'ice', 'hail', 'fire', 'ember',
  'smoke', 'soot', 'mud', 'decay', 'growth', 'heat', 'grass', 'pressed',
  'leafDry', 'leafWet', 'blood', 'urine', 'flower', 'fruit', 'dew', 'trail'
];

function field(grid, canonical, legacy, length) {
  if (grid.fields?.[canonical]) return grid.fields[canonical];
  const array = new Float32Array(length);
  if (grid.fields) grid.fields[canonical] = array;
  return array;
}

export class SpatialWorldSimulation {
  constructor(grid, {seed = 17} = {}) {
    this.grid = grid;
    this.time = 0;
    this.seed = Number(seed) || 17;
    this.random = seededRandom(this.seed);
    this.events = [];
    this.tick = 0;
    const length = grid.size * grid.size;
    for (const name of LEGACY_FIELDS) this[name] = new Float32Array(length);

    // These aliases are the same arrays stored on the provenance-aware surface grid.
    this.water = field(grid, 'waterVolume', 'water', length);
    this.wet = field(grid, 'moisture', 'wet', length);
    this.snow = field(grid, 'snowMass', 'snow', length);
    this.ice = field(grid, 'iceMass', 'ice', length);
    this.fire = field(grid, 'fireEnergy', 'fire', length);
    this.smoke = field(grid, 'smokeMass', 'smoke', length);
    this.soot = field(grid, 'sootMass', 'soot', length);
    this.mud = field(grid, 'mudMass', 'mud', length);
    this.grass = field(grid, 'grassMass', 'grass', length);
    this.blood = field(grid, 'bloodMass', 'blood', length);
    this.urine = field(grid, 'urineMass', 'urine', length);
    this.fuel = field(grid, 'fuelMass', 'fuel', length);
    this.temperatureC = field(grid, 'temperatureC', 'temperature', length);
    this.bloodMemory = new Float32Array(length);
    this.navigationCost = new Float32Array(length);
    this.navigationCost.fill(1);

    for (let i = 0; i < length; i++) {
      if (!this.temperatureC[i]) this.temperatureC[i] = 18;
      if (!this.fuel[i]) {
        if (grid.material?.[i] === 1) this.fuel[i] = 1;
        else if (grid.material?.[i] === 3) this.fuel[i] = 0.3;
      }
    }
    this.updateNavigationCosts();
  }

  record(type, payload = {}) {
    this.events.push({ sequence: this.events.length, tick: this.tick, time: this.time, type, ...payload });
    if (this.events.length > 20000) this.events.splice(0, this.events.length - 20000);
  }

  trampleAt(x, z, blood = 0) {
    const cx = worldToCell(x, this.grid.size), cz = worldToCell(z, this.grid.size), changed = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 1 || nz < 1 || nx >= this.grid.size - 1 || nz >= this.grid.size - 1) continue;
      const i = nz * this.grid.size + nx; if (this.grid.cells[i]) continue;
      const weight = dx || dz ? 0.45 : 1;
      this.pressed[i] = clamp01(this.pressed[i] + 0.24 * weight);
      this.trail[i] = clamp01(this.trail[i] + 0.3 * weight);
      this.grass[i] *= 0.82; this.flower[i] *= 0.65;
      const compressed = Math.min(this.water[i], this.wet[i] * 0.025 * weight);
      this.water[i] += compressed; this.mud[i] = clamp01(this.mud[i] + this.wet[i] * 0.08 * weight);
      if (blood > 0) { this.blood[i] = Math.max(this.blood[i], blood * weight); this.bloodMemory[i] = Math.max(this.bloodMemory[i], blood * 0.22 * weight); }
      changed.push(i);
    }
    this.record('trample', { x, z, cells: changed }); this.updateNavigationCosts(); this.sync();
  }

  contaminateAt(x, z, type = 'blood', amount = 1) {
    const cx = worldToCell(x, this.grid.size), cz = worldToCell(z, this.grid.size), target = type === 'urine' ? this.urine : this.blood, cells = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, nz = cz + dz, i = nz * this.grid.size + nx;
      if (nx < 0 || nz < 0 || nx >= this.grid.size || nz >= this.grid.size || this.grid.cells[i]) continue;
      const value = clamp01(amount * (dx || dz ? 0.45 : 1)); target[i] = Math.max(target[i], value);
      if (type === 'blood') this.bloodMemory[i] = Math.max(this.bloodMemory[i], value * 0.22);
      cells.push(i);
    }
    this.record('contaminate', { x: cx, z: cz, contaminant: type, amount, cells }); this.sync();
    return {x: cx, z: cz, type, amount};
  }

  strikeLightning(random = this.random) {
    const fuel = [];
    for (let i = 0; i < this.grid.cells.length; i++) if (this.fuel[i] > 0.05) fuel.push(i);
    if (!fuel.length) return null;
    const i = fuel[Math.min(fuel.length - 1, Math.floor(random() * fuel.length))];
    this.fire[i] = Math.max(this.fire[i], 1); this.heat[i] = 1; this.ember[i] = 0.65; this.temperatureC[i] = Math.max(this.temperatureC[i], 320);
    const hit = {x: i % this.grid.size, z: Math.floor(i / this.grid.size), material: this.grid.material?.[i] === 1 ? 'wood' : 'fuel', fuelBefore: this.fuel[i]};
    this.record('lightning', hit); this.updateNavigationCosts(); this.sync(); return hit;
  }

  seedExternalFire(count) {
    if (count <= 0 || this.fire.some(value => value > 0.05)) return;
    for (let attempt = 0; attempt < count; attempt++) this.strikeLightning(this.random);
  }

  conservativeWaterFlow(dt) {
    const {size, cells, height} = this.grid, before = this.water.slice(), delta = new Float32Array(before.length), flowRate = Math.min(0.45, dt * 2.2);
    let moved = 0;
    for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) {
      const i = z * size + x; if (cells[i] || before[i] <= 1e-7) continue;
      const neighbours = [i - 1, i + 1, i - size, i + size].filter(j => !cells[j]);
      const potential = (height?.[i] || 0) + before[i] * 0.08;
      const lower = neighbours.map(j => ({j, drop: potential - ((height?.[j] || 0) + before[j] * 0.08)})).filter(item => item.drop > 1e-6);
      if (!lower.length) continue;
      const totalDrop = lower.reduce((sum, item) => sum + item.drop, 0), available = before[i] * flowRate;
      for (const item of lower) { const amount = available * item.drop / totalDrop; delta[i] -= amount; delta[item.j] += amount; moved += amount; }
    }
    for (let i = 0; i < before.length; i++) this.water[i] = Math.max(0, before[i] + delta[i]);
    return moved;
  }

  spreadFire(dt, wind, windAngle) {
    const {size, cells} = this.grid, before = this.fire.slice(), additions = new Float32Array(before.length), windVector = [Math.cos(windAngle), Math.sin(windAngle)];
    let consumed = 0;
    for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) {
      const i = z * size + x; if (before[i] <= 0.01) continue;
      const burn = Math.min(this.fuel[i], before[i] * dt * 0.16); this.fuel[i] -= burn; consumed += burn;
      if (this.fuel[i] <= 1e-5) this.fire[i] = Math.max(0, this.fire[i] - dt * 0.5);
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of neighbours) {
        const j = (z + dz) * size + x + dx; if (cells[j] || this.fuel[j] <= 0.01) continue;
        const alignment = Math.max(0, dx * windVector[0] + dz * windVector[1]), dryness = clamp01(1 - this.wet[j] - this.snow[j] * 0.7 - this.ice[j] * 0.4);
        const transfer = before[i] * this.fuel[j] * dryness * dt * (0.012 + wind * (0.025 + alignment * 0.08));
        additions[j] += transfer;
      }
    }
    for (let i = 0; i < additions.length; i++) this.fire[i] = clamp01(this.fire[i] + additions[i]);
    return consumed;
  }

  advect(field, dt, strength, angle) {
    if (strength <= 0.01) return;
    const {size, cells} = this.grid, source = field.slice(), delta = new Float32Array(field.length), dx = Math.cos(angle), dz = Math.sin(angle);
    for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) {
      const i = z * size + x; if (cells[i] || source[i] <= 1e-7) continue;
      const nx = Math.max(1, Math.min(size - 2, Math.round(x + dx))), nz = Math.max(1, Math.min(size - 2, Math.round(z + dz))), j = nz * size + nx;
      if (cells[j]) continue;
      const moved = source[i] * Math.min(0.45, strength * dt * 0.35); delta[i] -= moved; delta[j] += moved;
    }
    for (let i = 0; i < field.length; i++) field[i] = Math.max(0, source[i] + delta[i]);
  }

  step(dt, state = {}) {
    dt = Math.max(0, Math.min(0.25, dt)); if (!dt) return;
    this.time += dt; this.tick++;
    const p = state.params || state, e = state.elements || {}, n = this.grid.cells.length;
    const rain = clamp01(Math.max(p.rain || 0, e.wet || 0)), snowfall = clamp01(Math.max(p.snowfall || 0, p.snow || 0));
    const weatherTemperature = -12 + clamp01(p.temperature ?? 0.5) * 52;
    const wind = clamp01(Math.max(p.wind || 0, p.storm || 0)), windAngle = (Number(p.windDirectionDegrees) || 0) * Math.PI / 180;
    const hailfall = clamp01(e.hail || 0), heatWeather = clamp01(((p.temperature ?? 0.5) - 0.55) * 2.2 + (e.heat || 0) + (e.lava || 0));
    this.weather = {rain, snowfall, hailfall, wind, windAngle}; this.seedExternalFire(Math.ceil(state.fireCount || 0));
    const waterBefore = this.water.reduce((sum, value) => sum + value, 0), fuelBefore = this.fuel.reduce((sum, value) => sum + value, 0);

    for (let i = 0; i < n; i++) {
      if (this.grid.cells[i] && this.fuel[i] <= 0) continue;
      const localFire = this.fire[i], targetTemperature = weatherTemperature + localFire * 620 + (e.lava || 0) * 850;
      this.temperatureC[i] += (targetTemperature - this.temperatureC[i]) * Math.min(1, dt * (0.18 + localFire * 1.2));
      const cold = clamp01((0 - this.temperatureC[i]) / 18), hot = clamp01((this.temperatureC[i] - 25) / 95);
      const precipitation = rain * dt * 0.035, snowInput = snowfall * Math.max(0, 1 - rain) * dt * 0.026;
      this.water[i] += precipitation; this.wet[i] = clamp01(this.wet[i] + precipitation * 3 + this.water[i] * dt * 0.08 - dt * (0.018 + wind * 0.035 + hot * 0.08));
      this.snow[i] += snowInput; const freeze = Math.min(this.water[i], cold * dt * 0.08), melt = Math.min(this.ice[i], hot * dt * 0.12), snowMelt = Math.min(this.snow[i], hot * dt * 0.09);
      this.water[i] += melt + snowMelt - freeze; this.ice[i] += freeze - melt; this.snow[i] -= snowMelt;
      const evaporation = Math.min(this.water[i], hot * (0.01 + wind * 0.012) * dt); this.water[i] -= evaporation; this.steam[i] = Math.max(0, this.steam[i] + evaporation - this.steam[i] * dt * 0.08);
      this.hail[i] = clamp01(this.hail[i] + dt * (hailfall * 0.5 - this.hail[i] * (hot * 0.4 + 0.04)));
      this.fire[i] = clamp01(this.fire[i] + dt * (this.ember[i] * 0.08 - rain * 0.55 * (p.rainExtinguish ?? 1) - this.water[i] * 0.34 - 0.07));
      this.ember[i] = clamp01(this.ember[i] + dt * (this.fire[i] * 0.24 - rain * 0.28 - 0.035));
      this.heat[i] = clamp01((this.temperatureC[i] + 12) / 650);
      this.smoke[i] = Math.max(0, this.smoke[i] + dt * (this.fire[i] * 0.4 + this.ember[i] * 0.05 - this.smoke[i] * 0.06));
      this.soot[i] = clamp01(this.soot[i] + dt * (this.smoke[i] * 0.035 + this.fire[i] * 0.025 - rain * 0.02));
      this.mud[i] = clamp01(this.mud[i] + dt * (this.water[i] * this.wet[i] * 0.18 - this.mud[i] * (0.015 + hot * 0.06)));
      this.dry[i] = clamp01(this.dry[i] + dt * ((1 - this.wet[i]) * (0.03 + wind * 0.08 + hot * 0.14) - rain * 0.3 - this.water[i] * 0.12));
      this.decay[i] = clamp01(this.decay[i] + dt * ((p.decay || 0) * 0.08 + this.wet[i] * 0.018 + this.soot[i] * 0.006 - this.fire[i] * 0.08));
      this.growth[i] = clamp01(this.growth[i] + dt * ((p.bloom || 0) * this.wet[i] * 0.08 + this.decay[i] * this.wet[i] * 0.02 - this.fire[i] * 0.3 - this.snow[i] * 0.04));
      const vegetation = clamp01(p.vegetation ?? 0.65);
      this.grass[i] = clamp01(this.grass[i] + dt * (vegetation * (0.015 + this.wet[i] * 0.07 + (p.bloom || 0) * 0.08) - this.pressed[i] * 0.1 - this.fire[i] * 0.35 - this.snow[i] * 0.025));
      this.pressed[i] = clamp01(this.pressed[i] - dt * (0.008 + this.grass[i] * 0.012));
      this.leafWet[i] = clamp01(this.leafWet[i] + dt * (rain * 0.18 + this.wet[i] * 0.025 - this.leafWet[i] * (0.025 + hot * 0.08)));
      this.leafDry[i] = clamp01(this.leafDry[i] + dt * (vegetation * wind * 0.035 + this.dry[i] * wind * 0.02 - this.leafWet[i] * 0.12 - this.fire[i] * 0.4));
      this.blood[i] = Math.max(this.bloodMemory[i], clamp01(this.blood[i] - dt * (rain * 0.025 + this.water[i] * 0.008)));
      this.urine[i] = clamp01(this.urine[i] - dt * (rain * 0.09 + this.water[i] * 0.025 + hot * 0.035));
      this.flower[i] = clamp01(this.flower[i] + dt * ((p.bloom || 0) * this.grass[i] * 0.11 - this.flower[i] * (hot * 0.06 + this.snow[i] * 0.12 + this.pressed[i] * 0.2)));
      this.fruit[i] = clamp01(this.fruit[i] + dt * ((p.seasonFruit || 0) * this.flower[i] * 0.14 - this.fruit[i] * (wind * 0.04 + this.fire[i] * 0.3)));
      this.dew[i] = clamp01(this.dew[i] + dt * ((p.dew || 0) * (0.08 + this.grass[i] * 0.08) - (hot * 0.16 + wind * 0.045) * this.dew[i]));
      this.trail[i] = clamp01(this.trail[i] - dt * (this.growth[i] * 0.045 + this.grass[i] * 0.025 + (p.bloom || 0) * 0.015));
    }

    const waterMoved = this.conservativeWaterFlow(dt), fuelConsumed = this.spreadFire(dt, wind, windAngle);
    this.advect(this.smoke, dt, wind, windAngle); this.advect(this.steam, dt, wind, windAngle);
    const oldGrowth = this.growth.slice(), size = this.grid.size;
    for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) {
      const i = z * size + x; if (this.grid.cells[i] || this.wet[i] < 0.08) continue;
      const neighbour = Math.max(oldGrowth[i - 1], oldGrowth[i + 1], oldGrowth[i - size], oldGrowth[i + size]); this.growth[i] = clamp01(this.growth[i] + neighbour * this.wet[i] * dt * 0.035);
    }
    this.record('step', {dt, waterInput: rain * dt * 0.035 * n, waterMoved, waterBefore, waterAfter: this.water.reduce((sum, value) => sum + value, 0), fuelBefore, fuelConsumed, fuelAfter: this.fuel.reduce((sum, value) => sum + value, 0)});
    this.updateNavigationCosts(); this.sync();
  }

  updateNavigationCosts() {
    for (let i = 0; i < this.navigationCost.length; i++) {
      if (this.grid.cells[i]) { this.navigationCost[i] = Infinity; continue; }
      this.navigationCost[i] = 1 + this.water[i] * 3.5 + this.ice[i] * 5 + this.mud[i] * 2.2 + this.fire[i] * 80 + this.smoke[i] * 1.5 + this.growth[i] * 0.7;
    }
    this.grid.cost = this.navigationCost;
  }

  sync() { this.grid.syncFieldsToVoxels?.(); }

  transferTo(newGrid) {
    const next = new SpatialWorldSimulation(newGrid, {seed: this.seed}), oldSize = this.grid.size, newSize = newGrid.size;
    for (const name of [...LEGACY_FIELDS, 'bloodMemory', 'fuel', 'temperatureC']) {
      const from = this[name], to = next[name]; if (!from || !to) continue;
      for (let z = 0; z < newSize; z++) for (let x = 0; x < newSize; x++) {
        const ox = Math.min(oldSize - 1, Math.floor((x + 0.5) / newSize * oldSize)), oz = Math.min(oldSize - 1, Math.floor((z + 0.5) / newSize * oldSize));
        to[z * newSize + x] = from[oz * oldSize + ox];
      }
    }
    next.time = this.time; next.tick = this.tick; next.events = this.events.slice(); next.updateNavigationCosts(); next.sync(); return next;
  }

  massBudget() {
    const sum = array => array.reduce((total, value) => total + value, 0);
    return {water: sum(this.water), ice: sum(this.ice), snow: sum(this.snow), fuel: sum(this.fuel), smoke: sum(this.smoke), blood: sum(this.blood), urine: sum(this.urine)};
  }

  points() {
    const out = [], s = this.grid.size;
    const add = (x, z, y, value, kind, color, threshold = 0.04) => { if (value < threshold) return; out.push({x: cellToWorld(x, s), y, z: cellToWorld(z, s), r: color[0], g: color[1], b: color[2], kind, generated: true, provenance: 'GENERATED', confidence: 0.5, size: value}); };
    for (let z = 1; z < s - 1; z++) for (let x = 1; x < s - 1; x++) {
      const i = z * s + x; if (this.grid.cells[i] && this.grid.material?.[i] !== 1) continue;
      const pigment = clamp01(this.blood[i] + this.urine[i]);
      const waterColor = [45 + this.blood[i] * 125 + this.urine[i] * 95, 132 - this.blood[i] * 85 + this.urine[i] * 35, 190 - this.blood[i] * 115 - this.urine[i] * 130];
      const snowColor = [235, this.blood[i] > 0 ? 190 : 242 - this.urine[i] * 55, 250 - this.blood[i] * 90 - this.urine[i] * 145];
      add(x,z,-.31,this.water[i],1,waterColor);add(x,z,-.305,this.mud[i],12,[92+pigment*35,58,35]);add(x,z,-.302,this.dry[i],18,[164,132,88]);add(x,z,-.30,this.ice[i],6,[150+this.blood[i]*70,210-this.blood[i]*80,235-this.urine[i]*80]);add(x,z,-.29,this.snow[i],5,snowColor);add(x,z,-.27,this.hail[i],7,[185,220,245]);add(x,z,-.18,this.fire[i],8,[255,92,20]);add(x,z,-.12,this.ember[i],9,[255,156,35]);add(x,z,-.28,this.soot[i],11,[32,34,39]);add(x,z,-.26,this.decay[i],13,[86,69,50]);add(x,z,-.20,this.growth[i],14,[42,126,62]);add(x,z,-.18-this.pressed[i]*.09,this.grass[i],19,[62,145,65]);add(x,z,-.12,this.leafDry[i],23,[159,103,43]);add(x,z,-.16,this.leafWet[i],24,[74,103,45]);add(x,z,-.275,this.blood[i],25,[112,18,24]);add(x,z,-.27,this.urine[i],30,[190,170,48]);add(x,z,-.10,this.flower[i],26,[245,105,180]);add(x,z,-.08,this.fruit[i],27,[220,65,35]);add(x,z,-.16,this.dew[i],28,[170,225,245]);add(x,z,-.285,this.trail[i],29,[76,57,38]);add(x,z,.02,this.steam[i],4,[190,210,215]);add(x,z,.16,this.smoke[i],10,[65,68,75]);
    }
    const weather = this.weather || {};
    for (let z = 2; z < s - 2; z += 3) for (let x = 2; x < s - 2; x += 3) {
      const seed = Math.abs(Math.sin(x * 31.17 + z * 17.31));
      if (seed < (weather.rain || 0) * 0.7) add(x,z,.38,weather.rain,15,[115,175,225]);
      if (seed < (weather.snowfall || 0) * 0.55) add(x,z,.42,weather.snowfall,16,[240,246,255]);
      if (seed < (weather.hailfall || 0) * 0.7) add(x,z,.44,weather.hailfall,17,[190,225,250]);
    }
    return out;
  }
}

export function segmentCells(start, end, size) {
  const cells = [], dx = end[0] - start[0], dz = end[1] - start[1], steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) * size));
  let previous = -1;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps, x = worldToCell(start[0] + dx * t, size), z = worldToCell(start[1] + dz * t, size), index = z * size + x;
    if (index !== previous) cells.push([x, z]); previous = index;
  }
  return cells;
}

export function segmentIsTraversable(grid, start, end, maxCost = 40) {
  return segmentCells(start, end, grid.size).every(([x, z]) => {
    const index = z * grid.size + x; return !grid.cells[index] && (!grid.cost || grid.cost[index] < maxCost);
  });
}
