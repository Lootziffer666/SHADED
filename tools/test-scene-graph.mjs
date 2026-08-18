// Node-runnable tests for Semantic SceneGraph (spec §9). Run: node tools/test-scene-graph.mjs
import assert from 'node:assert/strict';
import { SceneGraph, NODE_FAMILY } from '../runtime/spatial-kernel/index.js';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

const g = new SceneGraph();

// World root.
const world = g.createNode({ family: NODE_FAMILY.WORLD, id: 'world_0' });
ok('world node created', world.family === NODE_FAMILY.WORLD);
ok('root registered', g.rootId === 'world_0');

// Structure (wall) under world; surface under wall.
const wall = g.createNode({ family: NODE_FAMILY.WALL, parent: 'world_0', id: 'wall_1' });
const surf = g.createNode({ family: NODE_FAMILY.SURFACE, parent: 'wall_1', id: 'surf_2' });
ok('wall parented to world', g.get('wall_1').parent === 'world_0');
ok('world has wall child', g.get('world_0').children.has('wall_1'));
ok('surface parented to wall', surf.parent === 'wall_1');

// Unknown family rejected.
let threw = false;
try { g.createNode({ family: 'NOT_A_FAMILY' }); } catch { threw = true; }
ok('unknown family rejected', threw);

// Representations (a wall has mesh + voxel + collision, not separate truths).
wall.addRepresentation({ kind: 'mesh', ref: 'mesh_abc' });
wall.addRepresentation({ kind: 'voxel', ref: 'vox_wall_1' });
wall.addRepresentation({ kind: 'collision', ref: 'col_wall_1' });
ok('wall has 3 representations', wall.representations.length === 3);

// Dirty tracking.
wall.markDirty(false);
ok('wall marked clean', g.get('wall_1').dirty === false);
wall.markDirty(true);
ok('wall marked dirty', g.dirtyNodes().some((n) => n.id === 'wall_1'));
g.markAllClean();
ok('markAllClean', g.dirtyNodes().length === 0);

// Semantic links (support relation: surface supported-by floor).
g.createNode({ family: NODE_FAMILY.FLOOR, parent: 'world_0', id: 'floor_3' });
g.addSemanticLink('surf_2', 'floor_3', 'supported-by');
ok('semantic link added', g.get('surf_2').semanticLinks.get('supported-by').has('floor_3'));

// Query by family / type.
ok('query WALL finds wall', g.queryByFamily(NODE_FAMILY.WALL).length === 1);
ok('query SURFACE finds surface', g.queryByType(NODE_FAMILY.SURFACE).length === 1);

// Bounds spatial query.
surf.bounds = { min: [0, 0, 0], max: [2, 2, 2] };
floor_3_bounds: { /* noop */ }
g.get('floor_3').bounds = { min: [1, 1, 1], max: [5, 5, 5] };
const hit = g.queryByBounds({ min: [1.5, 1.5, 1.5], max: [2, 2, 2] });
ok('bounds query returns overlapping node', hit.some((n) => n.id === 'surf_2'));

// Re-parent on remove preserves subgraph.
g.remove('wall_1');
ok('wall removed', !g.has('wall_1'));
ok('surface re-parented to world', g.get('surf_2').parent === 'world_0');

// Persistence round-trip.
const json = g.toJSON();
const g2 = SceneGraph.fromJSON(json);
ok('round-trip node count', g2.nodes.size === g.nodes.size);
ok('round-trip preserves parent', g2.get('surf_2').parent === 'world_0');
ok('round-trip preserves semantic link', g2.get('surf_2').semanticLinks.get('supported-by').has('floor_3'));

console.log(`✅ Semantic SceneGraph tests passed (${passed} assertions)`);
