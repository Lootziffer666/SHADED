// SHADED Style Discovery Sandbox — Benchmark-Szene (Daten, versioniert).
//
// 10 SDF-Primitive mit je einem MaterialKind (runtime/style/world-state.js)
// und einem manuell gesetzten WorldState-Preset. Reine Daten — kein WebGL
// hier; sandbox/renderer.js liest diese Liste und leitet pro Primitiv über
// runtime/style/material-response.js die MaterialResponse ab.

import { MaterialKind, createPresetWorldState, createWorldState } from '../runtime/style/world-state.js';

export const SCENE_VERSION = '1.0.0';

// SDF-Typindizes — müssen mit sandbox/passes/gbuffer.glsl.js (primDist)
// übereinstimmen.
export const SDF_TYPE = Object.freeze({ SPHERE: 0, BOX: 1, TORUS: 2, OCTAHEDRON: 3, CAPSULE: 4 });

// Primitivendefinitionen. params ist eine vec4-kompatible [x,y,z,w]-Liste
// je nach sdfType (Sphere: [r], Box: [hx,hy,hz], Torus: [R,r], Octahedron:
// [s], Capsule: [halfHeight,r]).
export const BENCHMARK_PRIMITIVES = Object.freeze([
  {
    id: 'matte-sphere', label: 'gewölbte matte Kugel', materialKind: MaterialKind.STONE,
    sdfType: SDF_TYPE.SPHERE, center: [-4.4, 1.0, 0], params: [0.85, 0, 0, 0],
    worldState: createPresetWorldState(MaterialKind.STONE, 'dry'),
  },
  {
    id: 'wood-box', label: 'Holzquader', materialKind: MaterialKind.WOOD,
    sdfType: SDF_TYPE.BOX, center: [-2.2, 1.0, 0], params: [0.72, 0.72, 0.72, 0],
    worldState: createPresetWorldState(MaterialKind.WOOD, 'wet'),
  },
  {
    id: 'metal-torus', label: 'Metalltorus', materialKind: MaterialKind.METAL,
    sdfType: SDF_TYPE.TORUS, center: [0, 1.0, 0], params: [0.7, 0.28, 0, 0],
    worldState: createPresetWorldState(MaterialKind.METAL, 'damaged'),
  },
  {
    id: 'glass-octahedron', label: 'Glas/Kristall-Oktaeder', materialKind: MaterialKind.GLASS,
    sdfType: SDF_TYPE.OCTAHEDRON, center: [2.2, 1.0, 0], params: [0.95, 0, 0, 0],
    worldState: createPresetWorldState(MaterialKind.GLASS, 'dry'),
  },
  {
    id: 'water-surface', label: 'Wasserfläche', materialKind: MaterialKind.WATER,
    sdfType: SDF_TYPE.BOX, center: [4.4, 0.85, 0], params: [0.9, 0.12, 0.9, 0],
    worldState: createPresetWorldState(MaterialKind.WATER, 'wet'),
  },
  {
    id: 'skin-capsule', label: 'hautartige Kapsel', materialKind: MaterialKind.SKIN,
    sdfType: SDF_TYPE.CAPSULE, center: [-4.4, -1.0, 0], params: [0.5, 0.42, 0, 0],
    worldState: createPresetWorldState(MaterialKind.SKIN, 'dry'),
  },
  {
    id: 'fiber-sphere', label: 'fell-/federartige Kugel', materialKind: MaterialKind.FIBER,
    sdfType: SDF_TYPE.SPHERE, center: [-2.2, -1.0, 0], params: [0.82, 0, 0, 0],
    worldState: createPresetWorldState(MaterialKind.FIBER, 'snow'),
  },
  {
    id: 'fire-sphere', label: 'emissive Feuerkugel', materialKind: MaterialKind.EMISSIVE,
    sdfType: SDF_TYPE.SPHERE, center: [0, -1.0, 0], params: [0.58, 0, 0, 0],
    worldState: createWorldState({ materialKind: MaterialKind.EMISSIVE, fields: { fire: 1, heat: 0.85, fuelMass: 1, soot: 0.15 } }),
  },
  {
    id: 'smoke-volume', label: 'Rauchvolumen', materialKind: MaterialKind.SMOKE,
    sdfType: SDF_TYPE.BOX, center: [2.2, -1.0, 0], params: [0.78, 0.78, 0.78, 0],
    worldState: createWorldState({ materialKind: MaterialKind.SMOKE, fields: { smoke: 0.85, soot: 0.3, heat: 0.2 } }),
  },
  {
    id: 'weathered-plate', label: 'verwitterte/beschädigte Platte', materialKind: MaterialKind.METAL,
    sdfType: SDF_TYPE.BOX, center: [4.4, -1.0, 0], params: [0.85, 0.55, 0.09, 0],
    worldState: createPresetWorldState(MaterialKind.METAL, 'damaged', { rust: 0.7, moisture: 0.35, mud: 0.45 }),
  },
]);

// Feste Kamera-Keyframes für den Orbit-/Bewegungstest (12-Frame-Orbit,
// Verify-Kriterium L). angle in Radiant, deterministisch über den Index.
export function orbitCameraKeyframe(index, frameCount = 12) {
  const angle = (index / frameCount) * Math.PI * 2;
  const distance = 9.5;
  const elevation = 0.55;
  return {
    eye: [Math.sin(angle) * distance, elevation * 3.2, Math.cos(angle) * distance],
    target: [0, 0, 0],
    up: [0, 1, 0],
  };
}

export function defaultCameraKeyframe() {
  return orbitCameraKeyframe(0.75, 12);
}
