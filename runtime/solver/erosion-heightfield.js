// SHADED Solver Lab — Hydraulic erosion (renderer-independent core).
//
// Second Solver Lab slice (first was runtime/solver/granular-grid.js).
// Fills the Erosion/Sediment Lab gap named in
// docs/sandbox-element-donor-matrix.md ("Missing SHADED labs"), whose
// strongest available donor is SebLague/Hydraulic-Erosion (MIT, verified
// in repo root -- see docs/sandbox-element-license-audit.md). That project
// itself is a Unity/C# implementation of a published, well-known method
// (Hans Theobald Beyer, "Implementation of a Method for Hydraulic
// Erosion", firespark.de; cross-referenced against ranmantaru.com's
// "Water erosion on heightmap terrain"). This module is an independent
// JavaScript implementation of that published algorithm -- not a port of
// SebLague's C# source -- because the algorithm itself, not any one
// codebase, is what SHADED needs to own.
//
// Same three-layer rule as runtime/style/ and runtime/solver/granular-grid.js:
// WORLD STATE (the heightfield) -> SOLVER (erode()) -> RENDERER
// (solver-lab/erosion/, thin, visuals never become authoritative state).
// No DOM/WebGL dependency, Node-testable.
//
// Algorithm sketch (one simulated water droplet):
//   1. sample height + gradient under the droplet (bilinear),
//   2. blend the droplet's direction toward -gradient (inertia),
//   3. step the droplet one unit along that direction,
//   4. compare old/new height to get a sediment capacity,
//   5. erode (pick up sediment, bilinear-distributed across the 4
//      surrounding cells) when capacity allows, or deposit when it
//      doesn't or the droplet just went uphill,
//   6. gain speed falling downhill, evaporate water, repeat until the
//      droplet runs out of life, water, or leaves the map -- depositing
//      every last grain of sediment it still carries at that point, so a
//      full erosion run conserves total heightfield mass exactly (the
//      real, testable invariant; see tools/test-erosion-heightfield.mjs).

export const DEFAULT_EROSION_PARAMS = Object.freeze({
  inertia: 0.05,
  sedimentCapacityFactor: 4,
  minSedimentCapacity: 0.01,
  erodeSpeed: 0.3,
  depositSpeed: 0.3,
  evaporateSpeed: 0.02,
  gravity: 4,
  maxDropletLifetime: 32,
  initialWaterVolume: 1,
  initialSpeed: 1,
  minWater: 0.01,
  minSpeed: 0.01,
});

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Float64, nicht Float32: die Erosionsschleife summiert über hunderte
// Tropfen je bis zu 32 kleine bilinear gewichtete Beträge auf -- bei
// Float32 (7 signifikante Stellen) läppert sich das über einen ganzen
// Lauf zu sichtbarem Massendrift auf (tools/test-erosion-heightfield.mjs
// hat genau das zuerst gemessen: 2e-5 Abweichung bei ~12500 Gesamtmasse).
// Algebraisch ist jede Erosions-/Ablagerungsoperation exakt massenneutral
// (die vier bilinearen Gewichte summieren immer zu 1); Float64 macht das
// auch numerisch nahezu exakt, statt die Prüfung künstlich aufzuweichen.
export function createHeightfield(width, height) {
  return { width, height, heights: new Float64Array(width * height) };
}

export function cloneHeightfield(field) {
  return { width: field.width, height: field.height, heights: field.heights.slice() };
}

export function totalMass(field) {
  let sum = 0;
  for (let i = 0; i < field.heights.length; i++) sum += field.heights[i];
  return sum;
}

// Terraingenerierung ist bewusst einfach gehalten -- die Wahrheit dieses
// Moduls ist die Erosion, nicht der Ausgangszustand. Gedämpfte Summe
// weniger Sinuswellen plus geseedeter Höhen-Jitter, deterministisch.
export function generateHills(field, seed, amplitude = 8) {
  const rng = mulberry32(seed);
  const freqA = 0.04 + rng() * 0.03, freqB = 0.07 + rng() * 0.05;
  const phaseA = rng() * Math.PI * 2, phaseB = rng() * Math.PI * 2;
  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) {
      const i = y * field.width + x;
      const h = Math.sin(x * freqA + phaseA) * Math.cos(y * freqA + phaseA)
        + 0.5 * Math.sin(x * freqB + phaseB) * Math.cos(y * freqB + phaseB);
      field.heights[i] = (h + 1.5) * amplitude * 0.5;
    }
  }
  return field;
}

function heightAndGradient(field, x, y) {
  const { width, height, heights } = field;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const cx = x - x0, cy = y - y0;
  const cx0 = Math.min(Math.max(x0, 0), width - 1), cx1 = Math.min(Math.max(x0 + 1, 0), width - 1);
  const cy0 = Math.min(Math.max(y0, 0), height - 1), cy1 = Math.min(Math.max(y0 + 1, 0), height - 1);
  const h00 = heights[cy0 * width + cx0], h10 = heights[cy0 * width + cx1];
  const h01 = heights[cy1 * width + cx0], h11 = heights[cy1 * width + cx1];
  const gx = (h10 - h00) * (1 - cy) + (h11 - h01) * cy;
  const gy = (h01 - h00) * (1 - cx) + (h11 - h10) * cx;
  const h = h00 * (1 - cx) * (1 - cy) + h10 * cx * (1 - cy) + h01 * (1 - cx) * cy + h11 * cx * cy;
  return { height: h, gx, gy };
}

// Trägt einen Höhen-/Sediment-Betrag bilinear gewichtet auf die vier
// umliegenden Zellen auf (positiv = Ablagerung, negativ = Abtrag). Sorgt
// dafür, dass Erosion nicht an Gitterzellen "einrastet".
function addHeightBilinear(field, x, y, amount) {
  const { width, height, heights } = field;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const cx = x - x0, cy = y - y0;
  const cx0 = Math.min(Math.max(x0, 0), width - 1), cx1 = Math.min(Math.max(x0 + 1, 0), width - 1);
  const cy0 = Math.min(Math.max(y0, 0), height - 1), cy1 = Math.min(Math.max(y0 + 1, 0), height - 1);
  heights[cy0 * width + cx0] += amount * (1 - cx) * (1 - cy);
  heights[cy0 * width + cx1] += amount * cx * (1 - cy);
  heights[cy1 * width + cx0] += amount * (1 - cx) * cy;
  heights[cy1 * width + cx1] += amount * cx * cy;
}

// Simuliert einen einzelnen Tropfen ab (x, y). Verändert `field` in-place.
export function simulateDroplet(field, x, y, params = DEFAULT_EROSION_PARAMS) {
  let dirX = 0, dirY = 0;
  let posX = x, posY = y;
  let speed = params.initialSpeed;
  let water = params.initialWaterVolume;
  let sediment = 0;

  for (let life = 0; life < params.maxDropletLifetime; life++) {
    const inBoundsMargin = 1; // wir brauchen (x0+1, y0+1) für bilineares Sampling
    if (posX < 0 || posX >= field.width - inBoundsMargin || posY < 0 || posY >= field.height - inBoundsMargin) break;

    const old = heightAndGradient(field, posX, posY);
    dirX = dirX * params.inertia - old.gx * (1 - params.inertia);
    dirY = dirY * params.inertia - old.gy * (1 - params.inertia);
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len; dirY /= len;

    const newX = posX + dirX, newY = posY + dirY;
    if (newX < 0 || newX >= field.width - inBoundsMargin || newY < 0 || newY >= field.height - inBoundsMargin) break;

    const next = heightAndGradient(field, newX, newY);
    const deltaHeight = next.height - old.height;

    const capacity = Math.max(-deltaHeight * speed * water * params.sedimentCapacityFactor, params.minSedimentCapacity);

    if (deltaHeight > 0) {
      // bergauf: fülle die Mulde hinter dem Tropfen auf, so viel wie er trägt
      const deposit = Math.min(deltaHeight, sediment);
      sediment -= deposit;
      addHeightBilinear(field, posX, posY, deposit);
    } else if (sediment > capacity) {
      const deposit = (sediment - capacity) * params.depositSpeed;
      sediment -= deposit;
      addHeightBilinear(field, posX, posY, deposit);
    } else {
      const erode = Math.min((capacity - sediment) * params.erodeSpeed, -deltaHeight);
      sediment += erode;
      addHeightBilinear(field, posX, posY, -erode);
    }

    speed = Math.sqrt(Math.max(0, speed * speed + (-deltaHeight) * params.gravity));
    water *= (1 - params.evaporateSpeed);
    posX = newX; posY = newY;

    if (water < params.minWater || speed < params.minSpeed) break;
  }

  // Egal warum der Tropfen endet: verbleibendes Sediment wird vollständig
  // abgelagert, nicht verworfen -- das ist es, was totalMass() über einen
  // ganzen erode()-Lauf exakt erhält (siehe tools/test-erosion-heightfield.mjs).
  if (sediment > 0) addHeightBilinear(field, posX, posY, sediment);
}

export function erode(field, numDroplets, seed, params = DEFAULT_EROSION_PARAMS) {
  const rng = mulberry32(seed);
  for (let i = 0; i < numDroplets; i++) {
    const x = 1 + rng() * (field.width - 3);
    const y = 1 + rng() * (field.height - 3);
    simulateDroplet(field, x, y, params);
  }
  return field;
}

export function heightRange(field) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < field.heights.length; i++) { const h = field.heights[i]; if (h < min) min = h; if (h > max) max = h; }
  return { min, max };
}

// Graustufen-RGBA für die dünne Renderer-Schicht -- kennt keine Solver-Logik.
export function toGrayscaleRGBA(field) {
  const { min, max } = heightRange(field);
  const range = Math.max(max - min, 1e-6);
  const out = new Uint8ClampedArray(field.width * field.height * 4);
  for (let i = 0; i < field.heights.length; i++) {
    const v = Math.round(((field.heights[i] - min) / range) * 255);
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}
