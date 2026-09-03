import {CELL_STRIDE, createWorldState} from './world-sandbox-reference.mjs';

const MAX_STAMPS = 32;
const PARTICLE_STRIDE = 12;
const QUERY_BYTES = 32;

export const WORLD_COMPUTE_WGSL = /* wgsl */ `
struct Params {
  sim: vec4<f32>,
  environment: vec4<f32>,
  rates: vec4<f32>,
  emitter: vec4<f32>,
  particle: vec4<f32>,
  probe: vec4<f32>,
  spare: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
}

struct Stamp {
  position: vec4<f32>,
  data: vec4<f32>,
}

struct Deposit {
  sand: atomic<u32>,
  water: atomic<u32>,
  heat: atomic<u32>,
  seed: atomic<u32>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> src: array<Cell>;
@group(0) @binding(2) var<storage, read_write> dst: array<Cell>;
@group(0) @binding(3) var<storage, read> stamps: array<Stamp>;
@group(0) @binding(4) var<storage, read_write> deposits: array<Deposit>;

fn gridSize() -> u32 {
  return u32(P.sim.y);
}

fn indexAt(x: i32, z: i32) -> u32 {
  let edge = i32(gridSize()) - 1;
  let cx = u32(clamp(x, 0, edge));
  let cz = u32(clamp(z, 0, edge));
  return cz * gridSize() + cx;
}

fn surface(cell: Cell) -> f32 {
  return cell.terrain.x + cell.terrain.y;
}

fn sandFlux(a: Cell, b: Cell) -> f32 {
  let dt = P.sim.x;
  let delta = surface(a) - surface(b);
  let cohesion = 0.006 + a.terrain.w * 0.026 + a.terrain.z * 0.018;
  let excess = max(0.0, delta - 0.009 - cohesion);
  return min(a.terrain.y * 0.19, excess * P.rates.x * dt * 0.24);
}

fn waterFlux(a: Cell, b: Cell) -> f32 {
  let dt = P.sim.x;
  let delta = surface(a) + a.water.x - surface(b) - b.water.x;
  let excess = max(0.0, delta - 0.00015);
  return min(a.water.x * 0.22, excess * P.rates.y * dt * 0.25);
}

fn smooth(a: f32, b: f32, value: f32) -> f32 {
  let t = clamp((value - a) / max(0.000001, b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let size = gridSize();
  if (gid.x >= size || gid.y >= size) {
    return;
  }

  let x = i32(gid.x);
  let z = i32(gid.y);
  let i = indexAt(x, z);
  let il = indexAt(x - 1, z);
  let ir = indexAt(x + 1, z);
  let it = indexAt(x, z - 1);
  let ib = indexAt(x, z + 1);
  var c = src[i];
  let left = src[il];
  let right = src[ir];
  let top = src[it];
  let bottom = src[ib];
  let dt = P.sim.x;

  var sandDelta = sandFlux(left, c) + sandFlux(right, c)
    + sandFlux(top, c) + sandFlux(bottom, c)
    - sandFlux(c, left) - sandFlux(c, right)
    - sandFlux(c, top) - sandFlux(c, bottom);
  var waterDelta = waterFlux(left, c) + waterFlux(right, c)
    + waterFlux(top, c) + waterFlux(bottom, c)
    - waterFlux(c, left) - waterFlux(c, right)
    - waterFlux(c, top) - waterFlux(c, bottom);

  var sand = max(0.0, c.terrain.y + sandDelta);
  var water = max(0.0, c.water.x + waterDelta + P.environment.x * dt * 0.018);
  let levelLeft = surface(left) + left.water.x;
  let levelRight = surface(right) + right.water.x;
  let levelTop = surface(top) + top.water.x;
  let levelBottom = surface(bottom) + bottom.water.x;
  let grad = vec2<f32>(levelRight - levelLeft, levelBottom - levelTop) * 0.5 * f32(size);
  let velocity = (c.water.yz - grad * dt * 0.84) * max(0.0, 1.0 - dt * 2.4);
  let speed = length(velocity);
  var sediment = max(0.0, c.water.w);
  let erosion = min(sand, water * speed * (1.0 - c.terrain.z) * dt * 0.032);
  let deposition = min(sediment, sediment * dt * (0.08 + max(0.0, 0.7 - speed) * 0.24));
  sand += deposition - erosion;
  sediment += erosion - deposition;

  let infiltration = min(water, P.rates.w * (1.0 - c.terrain.z) * dt * 0.035);
  let evaporation = min(water, P.environment.w * (0.25 + P.environment.y) * dt * 0.025);
  water -= infiltration + evaporation;
  var wetness = clamp(c.terrain.w + infiltration * 12.0 + water * dt * 0.45
    - dt * P.environment.w * (0.18 + P.environment.y * 0.52)
    - c.bio.z * dt * 0.16, 0.0, 1.0);

  let neighbourHeat = (left.bio.z + right.bio.z + top.bio.z + bottom.bio.z) * 0.25;
  var heat = clamp(c.bio.z + (neighbourHeat - c.bio.z) * dt * 0.8
    - (0.08 + wetness * 0.55 + water * 2.0) * dt, 0.0, 1.0);
  var disturbance = clamp(c.bio.w * max(0.0, 1.0 - dt * 0.16), 0.0, 1.0);
  let moistureFit = smooth(0.12, 0.46, wetness)
    * (1.0 - smooth(0.72, 1.05, wetness + water * 5.0));
  let temperatureFit = 1.0 - clamp(abs(P.environment.z - 0.55) / 0.52, 0.0, 1.0);
  let neighbourBiomass = (left.bio.x + right.bio.x + top.bio.x + bottom.bio.x) * 0.25;
  var seed = clamp(c.bio.y + neighbourBiomass * moistureFit * dt * 0.012 - dt * 0.0015, 0.0, 1.0);
  let growth = seed * moistureFit * P.environment.y * temperatureFit
    * (1.0 - disturbance) * P.rates.z * dt;
  let crowding = c.bio.x * c.bio.x * dt * 0.022;
  let damage = (heat * 0.72 + max(0.0, water - 0.12) * 0.4 + disturbance * 0.2) * dt;
  var biomass = clamp(c.bio.x + growth - crowding - damage, 0.0, 1.0);

  let fixedScale = 1.0 / 4096.0;
  sand += f32(atomicLoad(&deposits[i].sand)) * fixedScale;
  water += f32(atomicLoad(&deposits[i].water)) * fixedScale;
  heat = clamp(heat + f32(atomicLoad(&deposits[i].heat)) * fixedScale, 0.0, 1.0);
  seed = clamp(seed + f32(atomicLoad(&deposits[i].seed)) * fixedScale, 0.0, 1.0);

  let uv = (vec2<f32>(gid.xy) + 0.5) / f32(size);
  let stampCount = min(u32(P.sim.z), 32u);
  for (var si = 0u; si < 32u; si++) {
    if (si >= stampCount) {
      break;
    }
    let stamp = stamps[si];
    let radius = max(1.0 / f32(size), stamp.position.z);
    let distanceToStamp = distance(uv, stamp.position.xy);
    if (distanceToStamp > radius) {
      continue;
    }
    let weight = pow(1.0 - distanceToStamp / radius, 2.0);
    let amount = stamp.data.y * weight;
    let kind = u32(stamp.data.x + 0.5);
    if (kind == 1u) {
      sand += amount;
    } else if (kind == 2u) {
      water += amount;
      wetness = clamp(wetness + amount * 5.0, 0.0, 1.0);
    } else if (kind == 3u) {
      seed = clamp(seed + amount * 3.0, 0.0, 1.0);
    } else if (kind == 4u) {
      sand = max(0.0, sand - amount);
      c.terrain.z = clamp(c.terrain.z - amount * 2.0, 0.0, 1.0);
    } else if (kind == 5u) {
      heat = clamp(heat + amount * 4.0, 0.0, 1.0);
    } else if (kind == 6u) {
      disturbance = clamp(disturbance + amount * 3.0, 0.0, 1.0);
      c.terrain.z = clamp(c.terrain.z + amount * 2.0, 0.0, 1.0);
    } else if (kind == 7u) {
      sand = max(0.0, sand - amount * 0.45);
      water = max(0.0, water - amount * 0.08);
      disturbance = clamp(disturbance + amount * 4.0, 0.0, 1.0);
      c.terrain.z = clamp(c.terrain.z + amount * 2.5, 0.0, 1.0);
    }
  }

  var next = c;
  next.terrain.y = max(0.0, sand);
  next.terrain.w = wetness;
  next.water = vec4<f32>(max(0.0, water), velocity.x, velocity.y, max(0.0, sediment));
  next.bio = vec4<f32>(biomass, seed, heat, disturbance);
  dst[i] = next;
}
`;

export const PARTICLE_COMPUTE_WGSL = /* wgsl */ `
struct Params {
  sim: vec4<f32>,
  environment: vec4<f32>,
  rates: vec4<f32>,
  emitter: vec4<f32>,
  particle: vec4<f32>,
  probe: vec4<f32>,
  spare: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
}

struct Particle {
  position: vec4<f32>,
  velocity: vec4<f32>,
  meta: vec4<f32>,
}

struct Deposit {
  sand: atomic<u32>,
  water: atomic<u32>,
  heat: atomic<u32>,
  seed: atomic<u32>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> cells: array<Cell>;
@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(3) var<storage, read_write> deposits: array<Deposit>;

fn hash(value: u32) -> f32 {
  var n = value * 747796405u + 2891336453u;
  n = ((n >> ((n >> 28u) + 4u)) ^ n) * 277803737u;
  n = (n >> 22u) ^ n;
  return f32(n & 0x00ffffffu) / 16777215.0;
}

fn worldIndex(position: vec2<f32>) -> u32 {
  let size = u32(P.sim.y);
  let cell = min(
    vec2<u32>(size - 1u),
    vec2<u32>(clamp(position, vec2<f32>(0.0), vec2<f32>(0.999999)) * f32(size))
  );
  return cell.y * size + cell.x;
}

@compute @workgroup_size(128, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let count = u32(P.particle.z);
  if (i >= count || count == 0u) {
    return;
  }
  var particle = particles[i];
  let spawnBase = u32(P.particle.x) % count;
  let spawnCount = min(u32(P.particle.y), count);
  let relative = (i + count - spawnBase) % count;
  let shouldSpawn = spawnCount > 0u && relative < spawnCount;
  let tick = u32(P.sim.w);

  if (shouldSpawn) {
    let r0 = hash(i * 11u + tick * 101u);
    let r1 = hash(i * 17u + tick * 193u);
    let r2 = hash(i * 29u + tick * 241u);
    let angle = r0 * 6.2831853;
    let radius = sqrt(r1) * (0.006 + P.emitter.w * 0.026);
    let xz = clamp(
      P.emitter.xy + vec2<f32>(cos(angle), sin(angle)) * radius,
      vec2<f32>(0.002),
      vec2<f32>(0.998)
    );
    let cell = cells[worldIndex(xz)];
    let top = cell.terrain.x + cell.terrain.y + cell.water.x;
    let kind = max(1.0, P.emitter.z);
    particle.position = vec4<f32>(xz.x, top + 0.035 + r2 * 0.12, xz.y, 0.0);
    particle.velocity = vec4<f32>(
      cos(angle) * (0.03 + r2 * 0.09),
      0.22 + r1 * 0.36,
      sin(angle) * (0.03 + r0 * 0.09),
      0.65 + r2 * 1.1
    );
    particle.meta = vec4<f32>(kind, r0, 0.0, 1.0);
  }

  if (particle.meta.w < 0.5) {
    particles[i] = particle;
    return;
  }

  let dt = P.sim.x;
  let kind = u32(particle.meta.x + 0.5);
  let drag = select(0.7, 1.8, kind == 1u);
  particle.velocity.xyz *= max(0.0, 1.0 - drag * dt);
  particle.velocity.y -= 0.86 * dt;
  particle.position.xyz += particle.velocity.xyz * dt;
  particle.position.w += dt;

  if (particle.position.x < 0.0 || particle.position.x > 1.0) {
    particle.velocity.x *= -0.45;
    particle.position.x = clamp(particle.position.x, 0.001, 0.999);
  }
  if (particle.position.z < 0.0 || particle.position.z > 1.0) {
    particle.velocity.z *= -0.45;
    particle.position.z = clamp(particle.position.z, 0.001, 0.999);
  }

  let cellIndex = worldIndex(particle.position.xz);
  let cell = cells[cellIndex];
  let collisionHeight = cell.terrain.x + cell.terrain.y + select(0.0, cell.water.x, kind == 1u);
  let expired = particle.position.w >= particle.velocity.w;
  if (particle.position.y <= collisionHeight || expired) {
    let amount = u32(clamp(22.0 + length(particle.velocity.xyz) * 90.0, 1.0, 220.0));
    if (kind == 1u) {
      atomicAdd(&deposits[cellIndex].water, amount);
    } else if (kind == 2u) {
      atomicAdd(&deposits[cellIndex].sand, amount);
    } else if (kind == 3u) {
      atomicAdd(&deposits[cellIndex].seed, amount);
    } else if (kind == 4u) {
      atomicAdd(&deposits[cellIndex].heat, amount);
    }
    particle.meta.w = 0.0;
  }
  particles[i] = particle;
}
`;

export const QUERY_COMPUTE_WGSL = /* wgsl */ `
struct Params {
  sim: vec4<f32>,
  environment: vec4<f32>,
  rates: vec4<f32>,
  emitter: vec4<f32>,
  particle: vec4<f32>,
  probe: vec4<f32>,
  spare: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> cells: array<Cell>;
@group(0) @binding(2) var<storage, read> request: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> result: array<vec4<f32>>;

@compute @workgroup_size(1, 1, 1)
fn main() {
  let size = u32(P.sim.y);
  let query = request[0];
  let position = clamp(query.xy, vec2<f32>(0.0), vec2<f32>(0.999999));
  let cellPosition = min(vec2<u32>(size - 1u), vec2<u32>(position * f32(size)));
  let cell = cells[cellPosition.y * size + cellPosition.x];
  let ground = cell.terrain.x + cell.terrain.y;
  result[0] = vec4<f32>(query.z, ground, ground + cell.water.x, cell.terrain.w);
  result[1] = vec4<f32>(cell.water.x, cell.bio.x, cell.bio.z, cell.terrain.y);
}
`;

export const WORLD_RENDER_WGSL = /* wgsl */ `
struct RenderParams {
  resolution: vec4<f32>,
  view: vec4<f32>,
  body: vec4<f32>,
  cursor: vec4<f32>,
}

struct Cell {
  terrain: vec4<f32>,
  water: vec4<f32>,
  bio: vec4<f32>,
}

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> R: RenderParams;
@group(0) @binding(1) var<storage, read> cells: array<Cell>;

fn hash(position: vec2<f32>) -> f32 {
  return fract(sin(dot(position, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn indexAt(position: vec2<i32>) -> u32 {
  let size = i32(R.resolution.z);
  let p = clamp(position, vec2<i32>(0), vec2<i32>(size - 1));
  return u32(p.y * size + p.x);
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  let positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let p = positions[vertexIndex];
  var output: VertexOut;
  output.position = vec4<f32>(p, 0.0, 1.0);
  output.uv = vec2<f32>(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return output;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4<f32> {
  let size = i32(R.resolution.z);
  let p = vec2<i32>(clamp(input.uv, vec2<f32>(0.0), vec2<f32>(0.999999)) * f32(size));
  let cell = cells[indexAt(p)];
  let left = cells[indexAt(p + vec2<i32>(-1, 0))];
  let right = cells[indexAt(p + vec2<i32>(1, 0))];
  let top = cells[indexAt(p + vec2<i32>(0, -1))];
  let bottom = cells[indexAt(p + vec2<i32>(0, 1))];
  let ground = cell.terrain.x + cell.terrain.y;
  let grad = vec2<f32>(
    (right.terrain.x + right.terrain.y) - (left.terrain.x + left.terrain.y),
    (bottom.terrain.x + bottom.terrain.y) - (top.terrain.x + top.terrain.y)
  ) * f32(size) * 0.38;
  let normal = normalize(vec3<f32>(-grad.x, 1.0, -grad.y));
  let light = normalize(vec3<f32>(-0.46, 0.82, -0.33));
  let diffuse = 0.38 + 0.62 * max(dot(normal, light), 0.0);
  let grain = hash(vec2<f32>(p));
  let sandCoverage = smoothstep(0.002, 0.055, cell.terrain.y);
  var color = mix(
    vec3<f32>(0.19, 0.17, 0.14),
    vec3<f32>(0.69, 0.43, 0.18) + (grain - 0.5) * 0.055,
    sandCoverage
  );
  color *= diffuse;
  color = mix(color, color * vec3<f32>(0.43, 0.51, 0.55), clamp(cell.terrain.w * 0.72, 0.0, 0.78));

  let speed = length(cell.water.yz);
  if (cell.water.x > 0.0003) {
    let depth = clamp(cell.water.x * 11.0, 0.0, 1.0);
    let waterColor = mix(vec3<f32>(0.08, 0.44, 0.47), vec3<f32>(0.015, 0.10, 0.20), depth);
    let waterNormal = normalize(vec3<f32>(
      -(right.water.x - left.water.x) * 18.0,
      1.0,
      -(bottom.water.x - top.water.x) * 18.0
    ));
    let sparkle = pow(max(dot(waterNormal, normalize(vec3<f32>(-0.45, 0.82, -0.31))), 0.0), 34.0);
    let foam = smoothstep(0.34, 1.2, speed)
      * (0.45 + 0.55 * hash(vec2<f32>(p) + floor(R.view.y * 8.0)));
    color = mix(color, waterColor + sparkle * vec3<f32>(0.65, 0.78, 0.82), 0.42 + depth * 0.45);
    color = mix(color, vec3<f32>(0.82, 0.88, 0.80), foam * 0.58);
  }

  let vegetationPattern = smoothstep(0.30, 0.75, hash(vec2<f32>(p) * 0.47 + 19.3));
  let vegetation = clamp(cell.bio.x * (0.75 + vegetationPattern * 0.45), 0.0, 1.0);
  color = mix(color, vec3<f32>(0.08, 0.31 + grain * 0.08, 0.11) * (0.72 + diffuse * 0.42), vegetation * 0.92);
  color = mix(color, vec3<f32>(0.92, 0.20, 0.035), cell.bio.z * (0.35 + grain * 0.35));

  let mode = u32(R.view.x + 0.5);
  if (mode == 1u) {
    color = vec3<f32>(clamp(ground * 2.1, 0.0, 1.0));
  } else if (mode == 2u) {
    color = vec3<f32>(0.02, 0.16, 0.24)
      + vec3<f32>(0.03, 0.62, 0.88) * clamp(cell.water.x * 12.0, 0.0, 1.0);
  } else if (mode == 3u) {
    color = mix(vec3<f32>(0.17, 0.075, 0.025), vec3<f32>(0.08, 0.55, 0.92), cell.terrain.w);
  } else if (mode == 4u) {
    color = mix(vec3<f32>(0.025, 0.035, 0.028), vec3<f32>(0.18, 0.93, 0.26), cell.bio.x);
  } else if (mode == 5u) {
    color = vec3<f32>(0.06) + vec3<f32>(abs(cell.water.y), length(cell.water.yz), abs(cell.water.z)) * 0.8;
  } else if (mode == 6u) {
    color = mix(vec3<f32>(0.025, 0.04, 0.09), vec3<f32>(1.0, 0.12, 0.015), cell.bio.z);
  }

  let cursorDistance = distance(input.uv, R.cursor.xy);
  let cursorEdge = 1.0 - smoothstep(0.003, 0.008, abs(cursorDistance - R.cursor.z));
  color = mix(color, vec3<f32>(0.70, 0.81, 1.0), cursorEdge * R.cursor.w * 0.8);

  if (R.body.w > 0.5) {
    let shadowUv = R.body.xy + vec2<f32>(0.006, 0.008);
    let shadow = 1.0 - smoothstep(0.012, 0.026 + R.body.z * 0.008, distance(input.uv, shadowUv));
    color *= 1.0 - shadow * 0.35;
    let stone = 1.0 - smoothstep(0.010, 0.018, distance(input.uv, R.body.xy));
    let stoneLight = clamp(0.42 + R.body.z * 0.5, 0.42, 0.92);
    color = mix(color, vec3<f32>(0.27, 0.29, 0.31) * stoneLight, stone);
  }

  let vignette = 1.0 - smoothstep(0.55, 0.88, distance(input.uv, vec2<f32>(0.5)));
  color *= 0.78 + vignette * 0.22;
  return vec4<f32>(pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2)), 1.0);
}
`;

export const PARTICLE_RENDER_WGSL = /* wgsl */ `
struct RenderParams {
  resolution: vec4<f32>,
  view: vec4<f32>,
  body: vec4<f32>,
  cursor: vec4<f32>,
}

struct Particle {
  position: vec4<f32>,
  velocity: vec4<f32>,
  meta: vec4<f32>,
}

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) @interpolate(flat) kind: u32,
  @location(2) alpha: f32,
}

@group(0) @binding(0) var<uniform> R: RenderParams;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );
  let particle = particles[instanceIndex];
  let corner = corners[vertexIndex];
  let active = particle.meta.w;
  let centre = vec2<f32>(
    particle.position.x * 2.0 - 1.0,
    (1.0 - particle.position.z) * 2.0 - 1.0 + particle.position.y * 0.10
  );
  let kind = u32(particle.meta.x + 0.5);
  let pixelSize = select(2.0, 3.2, kind == 1u) + clamp(particle.position.y * 2.0, 0.0, 2.0);
  let clipSize = vec2<f32>(
    pixelSize * 2.0 / max(1.0, R.resolution.x),
    pixelSize * 2.0 / max(1.0, R.resolution.y)
  );
  var output: VertexOut;
  output.position = vec4<f32>(
    select(vec2<f32>(-4.0), centre + corner * clipSize, active > 0.5),
    0.0,
    1.0
  );
  output.local = corner;
  output.kind = kind;
  output.alpha = active;
  return output;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4<f32> {
  let radial = length(input.local);
  if (radial > 1.0 || input.alpha < 0.5) {
    discard;
  }
  var color = vec3<f32>(0.90, 0.65, 0.28);
  if (input.kind == 1u) {
    color = vec3<f32>(0.35, 0.76, 1.0);
  } else if (input.kind == 3u) {
    color = vec3<f32>(0.50, 0.92, 0.28);
  } else if (input.kind == 4u) {
    color = vec3<f32>(1.0, 0.31, 0.045);
  }
  let alpha = (1.0 - smoothstep(0.45, 1.0, radial)) * 0.9;
  return vec4<f32>(color, alpha);
}
`;

function assertGpuGlobals() {
  if (!globalThis.navigator?.gpu) throw new Error('WebGPU unavailable');
  if (!globalThis.GPUBufferUsage || !globalThis.GPUMapMode || !globalThis.GPUTextureUsage) {
    throw new Error('WebGPU constants unavailable');
  }
}

async function checkedModule(device, label, code) {
  const module = device.createShaderModule({label, code});
  if (typeof module.getCompilationInfo === 'function') {
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(message => message.type === 'error');
    if (errors.length) {
      throw new Error(label + ': ' + errors.map(error => error.message).join(' | '));
    }
  }
  return module;
}

export class WebGpuWorldSandbox {
  static async create(canvas, options = {}) {
    assertGpuGlobals();
    const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();
    const instance = new WebGpuWorldSandbox(canvas, adapter, device, options);
    await instance.initialize();
    return instance;
  }

  constructor(canvas, adapter, device, options) {
    this.canvas = canvas;
    this.adapter = adapter;
    this.device = device;
    this.onQuery = options.onQuery || (() => {});
    this.onError = options.onError || (() => {});
    this.mobile = options.mobile ?? matchMedia('(max-width: 700px)').matches;
    this.size = options.size || (this.mobile ? 96 : 128);
    this.particleCount = options.particleCount || (this.mobile ? 2048 : 8192);
    this.read = 0;
    this.tick = 0;
    this.spawnCursor = 0;
    this.queryId = 0;
    this.readbackBusy = [false, false, false];
    this.simFloats = new Float32Array(32);
    this.renderFloats = new Float32Array(32);
    this.stampFloats = new Float32Array(MAX_STAMPS * 8);
  }

  async initialize() {
    const {device} = this;
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) throw new Error('GPUCanvasContext unavailable');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({device, format: this.format, alphaMode: 'opaque'});

    const modules = await Promise.all([
      checkedModule(device, 'SHADED world compute', WORLD_COMPUTE_WGSL),
      checkedModule(device, 'SHADED particle compute', PARTICLE_COMPUTE_WGSL),
      checkedModule(device, 'SHADED query compute', QUERY_COMPUTE_WGSL),
      checkedModule(device, 'SHADED world render', WORLD_RENDER_WGSL),
      checkedModule(device, 'SHADED particle render', PARTICLE_RENDER_WGSL),
    ]);
    const [worldModule, particleModule, queryModule, worldRenderModule, particleRenderModule] = modules;

    this.worldPipeline = await device.createComputePipelineAsync({
      label: 'SHADED coupled world step',
      layout: 'auto',
      compute: {module: worldModule, entryPoint: 'main'},
    });
    this.particlePipeline = await device.createComputePipelineAsync({
      label: 'SHADED secondary particle step',
      layout: 'auto',
      compute: {module: particleModule, entryPoint: 'main'},
    });
    this.queryPipeline = await device.createComputePipelineAsync({
      label: 'SHADED local world query',
      layout: 'auto',
      compute: {module: queryModule, entryPoint: 'main'},
    });
    this.worldRenderPipeline = await device.createRenderPipelineAsync({
      label: 'SHADED world field renderer',
      layout: 'auto',
      vertex: {module: worldRenderModule, entryPoint: 'vs'},
      fragment: {module: worldRenderModule, entryPoint: 'fs', targets: [{format: this.format}]},
      primitive: {topology: 'triangle-list'},
    });
    this.particleRenderPipeline = await device.createRenderPipelineAsync({
      label: 'SHADED particle renderer',
      layout: 'auto',
      vertex: {module: particleRenderModule, entryPoint: 'vs'},
      fragment: {
        module: particleRenderModule,
        entryPoint: 'fs',
        targets: [{
          format: this.format,
          blend: {
            color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add'},
            alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
          },
        }],
      },
      primitive: {topology: 'triangle-list'},
    });

    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const allocate = (label, size, usage = storage) => device.createBuffer({
      label,
      size: Math.max(16, size),
      usage,
    });
    const stateBytes = this.size * this.size * CELL_STRIDE * 4;
    this.stateBuffers = [
      allocate('SHADED world state A', stateBytes),
      allocate('SHADED world state B', stateBytes),
    ];
    this.particleBuffer = allocate('SHADED particles', this.particleCount * PARTICLE_STRIDE * 4);
    this.depositBuffer = allocate('SHADED particle deposits', this.size * this.size * 16);
    this.stampBuffer = allocate('SHADED CPU stamps', this.stampFloats.byteLength);
    this.simUniform = allocate(
      'SHADED simulation params',
      this.simFloats.byteLength,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );
    this.renderUniform = allocate(
      'SHADED render params',
      this.renderFloats.byteLength,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );
    this.queryRequest = allocate('SHADED query request', 16);
    this.queryResult = allocate('SHADED query result', QUERY_BYTES);
    this.readbacks = [0, 1, 2].map(index => allocate(
      'SHADED query readback ' + index,
      QUERY_BYTES,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    ));

    const worldLayout = this.worldPipeline.getBindGroupLayout(0);
    const particleLayout = this.particlePipeline.getBindGroupLayout(0);
    const queryLayout = this.queryPipeline.getBindGroupLayout(0);
    const worldRenderLayout = this.worldRenderPipeline.getBindGroupLayout(0);
    this.worldGroups = [0, 1].map(read => device.createBindGroup({
      label: 'SHADED world ping-pong ' + read,
      layout: worldLayout,
      entries: [
        {binding: 0, resource: {buffer: this.simUniform}},
        {binding: 1, resource: {buffer: this.stateBuffers[read]}},
        {binding: 2, resource: {buffer: this.stateBuffers[1 - read]}},
        {binding: 3, resource: {buffer: this.stampBuffer}},
        {binding: 4, resource: {buffer: this.depositBuffer}},
      ],
    }));
    this.particleGroups = [0, 1].map(read => device.createBindGroup({
      label: 'SHADED particle world ' + read,
      layout: particleLayout,
      entries: [
        {binding: 0, resource: {buffer: this.simUniform}},
        {binding: 1, resource: {buffer: this.stateBuffers[read]}},
        {binding: 2, resource: {buffer: this.particleBuffer}},
        {binding: 3, resource: {buffer: this.depositBuffer}},
      ],
    }));
    this.queryGroups = [0, 1].map(read => device.createBindGroup({
      label: 'SHADED query world ' + read,
      layout: queryLayout,
      entries: [
        {binding: 0, resource: {buffer: this.simUniform}},
        {binding: 1, resource: {buffer: this.stateBuffers[read]}},
        {binding: 2, resource: {buffer: this.queryRequest}},
        {binding: 3, resource: {buffer: this.queryResult}},
      ],
    }));
    this.worldRenderGroups = [0, 1].map(read => device.createBindGroup({
      label: 'SHADED render world ' + read,
      layout: worldRenderLayout,
      entries: [
        {binding: 0, resource: {buffer: this.renderUniform}},
        {binding: 1, resource: {buffer: this.stateBuffers[read]}},
      ],
    }));
    this.particleRenderGroup = device.createBindGroup({
      label: 'SHADED render particles',
      layout: this.particleRenderPipeline.getBindGroupLayout(0),
      entries: [
        {binding: 0, resource: {buffer: this.renderUniform}},
        {binding: 1, resource: {buffer: this.particleBuffer}},
      ],
    });

    this.reset();
    device.lost.then(info => {
      this.onError(new Error('WebGPU device lost: ' + (info.message || info.reason)));
    });
  }

  reset(seed = 0x53484144) {
    const initial = createWorldState(this.size, seed);
    this.device.queue.writeBuffer(this.stateBuffers[0], 0, initial);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, initial);
    this.device.queue.writeBuffer(
      this.particleBuffer,
      0,
      new Float32Array(this.particleCount * PARTICLE_STRIDE),
    );
    const encoder = this.device.createCommandEncoder({label: 'SHADED world reset'});
    encoder.clearBuffer(this.depositBuffer);
    encoder.clearBuffer(this.queryResult);
    this.device.queue.submit([encoder.finish()]);
    this.read = 0;
    this.tick = 0;
    this.spawnCursor = 0;
  }

  packSimulation({dt, stamps = [], environment = {}, emitter = null}) {
    const values = this.simFloats;
    values.fill(0);
    values[0] = dt;
    values[1] = this.size;
    values[2] = Math.min(MAX_STAMPS, stamps.length);
    values[3] = this.tick;
    values[4] = environment.rain || 0;
    values[5] = environment.sun ?? 0.64;
    values[6] = environment.temperature ?? 0.52;
    values[7] = environment.evaporation ?? 0.018;
    values[8] = environment.sandRate ?? 2.35;
    values[9] = environment.waterRate ?? 5.4;
    values[10] = environment.growthRate ?? 0.21;
    values[11] = environment.permeability ?? 0.052;

    let spawnCount = 0;
    if (emitter?.count > 0) {
      values[12] = emitter.x;
      values[13] = emitter.z;
      values[14] = emitter.kind;
      values[15] = emitter.strength ?? 1;
      spawnCount = Math.min(this.particleCount, Math.max(0, emitter.count | 0));
    }
    values[16] = this.spawnCursor;
    values[17] = spawnCount;
    values[18] = this.particleCount;
    this.spawnCursor = (this.spawnCursor + spawnCount) % this.particleCount;

    this.stampFloats.fill(0);
    for (let index = 0; index < Math.min(MAX_STAMPS, stamps.length); index++) {
      const stamp = stamps[index];
      const offset = index * 8;
      this.stampFloats[offset] = stamp.x;
      this.stampFloats[offset + 1] = stamp.z;
      this.stampFloats[offset + 2] = stamp.radius;
      this.stampFloats[offset + 4] = stamp.kind;
      this.stampFloats[offset + 5] = stamp.amount;
      this.stampFloats[offset + 6] = stamp.directionX || 0;
      this.stampFloats[offset + 7] = stamp.directionZ || 0;
    }
    this.device.queue.writeBuffer(this.simUniform, 0, values);
    if (stamps.length) this.device.queue.writeBuffer(this.stampBuffer, 0, this.stampFloats);
  }

  step({dt = 1 / 30, stamps = [], environment = {}, emitter = null, query = null} = {}) {
    this.packSimulation({dt, stamps, environment, emitter});
    const {device} = this;
    const next = 1 - this.read;
    const encoder = device.createCommandEncoder({label: 'SHADED world tick ' + this.tick});
    const worldPass = encoder.beginComputePass({label: 'world fields'});
    worldPass.setPipeline(this.worldPipeline);
    worldPass.setBindGroup(0, this.worldGroups[this.read]);
    worldPass.dispatchWorkgroups(Math.ceil(this.size / 8), Math.ceil(this.size / 8));
    worldPass.end();

    encoder.clearBuffer(this.depositBuffer);
    const particlePass = encoder.beginComputePass({label: 'secondary particles'});
    particlePass.setPipeline(this.particlePipeline);
    particlePass.setBindGroup(0, this.particleGroups[next]);
    particlePass.dispatchWorkgroups(Math.ceil(this.particleCount / 128));
    particlePass.end();

    let readbackIndex = -1;
    if (query) {
      readbackIndex = this.readbackBusy.findIndex(busy => !busy);
      if (readbackIndex >= 0) {
        this.queryId += 1;
        this.device.queue.writeBuffer(this.queryRequest, 0, new Float32Array([
          query.x,
          query.z,
          this.queryId,
          query.flags || 0,
        ]));
        const queryPass = encoder.beginComputePass({label: 'local CPU query'});
        queryPass.setPipeline(this.queryPipeline);
        queryPass.setBindGroup(0, this.queryGroups[next]);
        queryPass.dispatchWorkgroups(1);
        queryPass.end();
        encoder.copyBufferToBuffer(
          this.queryResult,
          0,
          this.readbacks[readbackIndex],
          0,
          QUERY_BYTES,
        );
        this.readbackBusy[readbackIndex] = true;
      }
    }

    device.queue.submit([encoder.finish()]);
    this.read = next;
    this.tick += 1;
    if (readbackIndex >= 0) this.beginReadback(readbackIndex);
  }

  beginReadback(index) {
    const buffer = this.readbacks[index];
    const requestedAt = performance.now();
    buffer.mapAsync(GPUMapMode.READ).then(() => {
      const values = new Float32Array(buffer.getMappedRange()).slice();
      buffer.unmap();
      this.readbackBusy[index] = false;
      this.onQuery({
        id: values[0],
        ground: values[1],
        waterSurface: values[2],
        wetness: values[3],
        waterDepth: values[4],
        biomass: values[5],
        heat: values[6],
        sand: values[7],
        latencyMs: performance.now() - requestedAt,
      });
    }).catch(error => {
      this.readbackBusy[index] = false;
      this.onError(error);
    });
  }

  resize() {
    const quality = this.mobile ? 0.72 : 0.9;
    const dpr = Math.min(devicePixelRatio || 1, 2) * quality;
    const width = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render({viewMode = 0, time = 0, body = null, cursor = null} = {}) {
    this.resize();
    const values = this.renderFloats;
    values.fill(0);
    values[0] = this.canvas.width;
    values[1] = this.canvas.height;
    values[2] = this.size;
    values[3] = this.particleCount;
    values[4] = viewMode;
    values[5] = time;
    if (body?.active) {
      values[8] = body.x;
      values[9] = body.z;
      values[10] = body.y;
      values[11] = 1;
    }
    if (cursor) {
      values[12] = cursor.x;
      values[13] = cursor.z;
      values[14] = cursor.radius;
      values[15] = cursor.visible === false ? 0 : 1;
    }
    this.device.queue.writeBuffer(this.renderUniform, 0, values);

    const encoder = this.device.createCommandEncoder({label: 'SHADED world render'});
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: {r: 0.008, g: 0.009, b: 0.012, a: 1},
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.worldRenderPipeline);
    pass.setBindGroup(0, this.worldRenderGroups[this.read]);
    pass.draw(3);
    pass.setPipeline(this.particleRenderPipeline);
    pass.setBindGroup(0, this.particleRenderGroup);
    pass.draw(6, this.particleCount);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  get label() {
    return 'WEBGPU COMPUTE · ' + this.size + '² · '
      + this.particleCount.toLocaleString('de-DE') + ' PARTICLES';
  }

  destroy() {
    for (const buffer of [
      ...this.stateBuffers,
      this.particleBuffer,
      this.depositBuffer,
      this.stampBuffer,
      this.simUniform,
      this.renderUniform,
      this.queryRequest,
      this.queryResult,
      ...this.readbacks,
    ]) buffer?.destroy?.();
  }
}
