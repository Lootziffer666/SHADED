// SHADED Spatial Kernel — WorldFields (spec §11, part A: WORLD STATE).
//
// A grid of named scalar fields is the authoritative simulation state. The
// kernel owns it; the renderer reads it to produce VISUAL EFFECTS (part C) but
// effects are never fed back as state (spec §11).
//
// Pure, dependency-free; deterministic via a seeded RNG.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class WorldFields {
  constructor(size = 36, seed = 1) {
    this.size = size;
    this.fields = new Map();
    this.params = {}; // high-level 13 params (dayNight…snow) live here too
    this.rng = mulberry32(seed);
    this.seed = seed;
    this.time = 0;
  }

  ensure(name, fill = 0) {
    if (!this.fields.has(name)) {
      const a = new Float32Array(this.size * this.size);
      if (fill) a.fill(fill);
      this.fields.set(name, a);
    }
    return this.fields.get(name);
  }

  get(name) { return this.fields.get(name) || null; }
  has(name) { return this.fields.has(name); }
  set(name, arr) { this.fields.set(name, arr); return arr; }

  // Cheap deterministic checksum for reproducibility tests.
  crc() {
    let h = 2166136261 >>> 0;
    for (const arr of this.fields.values()) {
      for (let i = 0; i < arr.length; i++) {
        const v = Math.round(arr[i] * 1000) & 0xff;
        h ^= v; h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h >>> 0;
  }

  clone() {
    const c = new WorldFields(this.size, this.seed);
    for (const [k, v] of this.fields) c.fields.set(k, Float32Array.from(v));
    c.params = { ...this.params };
    c.time = this.time;
    return c;
  }
}
