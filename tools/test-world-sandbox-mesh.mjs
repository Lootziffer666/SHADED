// Behavioural regression test for runtime/world-sandbox-mesh.mjs's sweepPlantGraph() (Phase 4:
// Sweep Geometry from the user's cultivation plan). Proves the concrete geometric claims: a
// straight segment's ring vertices sit at exactly the stored radius from the centerline, radius
// genuinely tapers between differently-sized ends rather than averaging or ignoring one end, a
// branch point's ring is shared (not duplicated) between however many segments start there,
// every produced index stays within bounds of the actual vertex buffer, and rootDistances (the
// wind-weight substitute for world-space height) accumulates real edge length along the graph
// rather than counting hops or staying flat.
import assert from 'node:assert/strict';
import {sweepPlantGraph} from '../runtime/world-sandbox-mesh.mjs';

const RADIAL_SEGMENTS = 8;

// Hand-built graphs, independent of world-sandbox-growth.mjs's own stepping logic -- this test
// is exercising sweep geometry math specifically, not growth-agent behaviour (already covered by
// tools/test-world-sandbox-growth.mjs and tools/test-world-sandbox-vine.mjs).
function makeGraph(nodeSpecs) {
  const graph = {nodes: []};
  nodeSpecs.forEach((spec, id) => {
    graph.nodes.push({id, x: spec.x, y: spec.y ?? 0, z: spec.z, radius: spec.radius, parentId: spec.parentId ?? null, children: []});
  });
  graph.nodes.forEach(node => { if (node.parentId != null) graph.nodes[node.parentId].children.push(node.id); });
  return graph;
}

function assertNoNaN(mesh, label) {
  for (const arr of [mesh.positions, mesh.normals, mesh.rootDistances]) {
    for (let i = 0; i < arr.length; i++) {
      assert.ok(Number.isFinite(arr[i]), `${label}: every coordinate is finite (found ${arr[i]} at index ${i})`);
    }
  }
  assert.equal(mesh.rootDistances.length, mesh.positions.length / 3, `${label}: exactly one rootDistances entry per vertex`);
}

// --- A single straight stick: two nodes, same radius --------------------------------------
{
  const graph = makeGraph([
    {x: 0, y: 0, z: 0, radius: 0.1, parentId: null},
    {x: 0, y: 1, z: 0, radius: 0.1, parentId: 0},
  ]);
  const mesh = sweepPlantGraph(graph, {radialSegments: RADIAL_SEGMENTS});
  assertNoNaN(mesh, 'straight stick');

  assert.equal(mesh.positions.length, 2 * RADIAL_SEGMENTS * 3, 'two nodes produce exactly two rings worth of vertices, no more');
  assert.equal(mesh.indices.length, RADIAL_SEGMENTS * 6, 'one edge produces exactly radialSegments quads (2 triangles each)');
  for (const i of mesh.indices) assert.ok(i >= 0 && i < mesh.positions.length / 3, `index ${i} stays within the actual vertex buffer`);

  // Every vertex in ring 0 must sit exactly `radius` away from node 0's own position in the
  // plane perpendicular to the stick's axis (here, the flat XZ plane, since the stick runs along
  // Y) -- proving the ring is actually centered and sized on its own node, not offset or scaled
  // wrong.
  for (let ring = 0; ring < 2; ring++) {
    const nodeY = ring === 0 ? 0 : 1;
    for (let i = 0; i < RADIAL_SEGMENTS; i++) {
      const o = (ring * RADIAL_SEGMENTS + i) * 3;
      const vx = mesh.positions[o], vy = mesh.positions[o + 1], vz = mesh.positions[o + 2];
      const distFromAxis = Math.hypot(vx - 0, vz - 0);
      assert.ok(Math.abs(distFromAxis - 0.1) < 1e-5, `ring ${ring} vertex ${i} sits at radius 0.1 from the stick's axis (got ${distFromAxis.toFixed(5)})`);
      assert.ok(Math.abs(vy - nodeY) < 1e-5, `ring ${ring} vertex ${i} sits at its own node's Y (${nodeY}), not blended with the other end (got ${vy.toFixed(5)})`);
    }
  }
}

// --- Radius genuinely tapers between differently-sized ends -------------------------------
{
  const graph = makeGraph([
    {x: 0, y: 0, z: 0, radius: 0.2, parentId: null},
    {x: 0, y: 1, z: 0, radius: 0.05, parentId: 0},
  ]);
  const mesh = sweepPlantGraph(graph, {radialSegments: RADIAL_SEGMENTS});
  assertNoNaN(mesh, 'tapered stick');

  for (let i = 0; i < RADIAL_SEGMENTS; i++) {
    const o0 = i * 3;
    const dist0 = Math.hypot(mesh.positions[o0], mesh.positions[o0 + 2]);
    assert.ok(Math.abs(dist0 - 0.2) < 1e-5, `the wide end's own ring keeps its own 0.2 radius, not averaged with the narrow end (got ${dist0.toFixed(5)})`);

    const o1 = (RADIAL_SEGMENTS + i) * 3;
    const dist1 = Math.hypot(mesh.positions[o1], mesh.positions[o1 + 2]);
    assert.ok(Math.abs(dist1 - 0.05) < 1e-5, `the narrow end's own ring keeps its own 0.05 radius (got ${dist1.toFixed(5)})`);
  }
}

// --- A branch point's ring is shared, not duplicated, between its two child segments -------
{
  const graph = makeGraph([
    {x: 0, y: 0, z: 0, radius: 0.15, parentId: null},   // the fork
    {x: 1, y: 0, z: 0, radius: 0.08, parentId: 0},        // child A
    {x: 0, y: 0, z: 1, radius: 0.08, parentId: 0},        // child B
  ]);
  const mesh = sweepPlantGraph(graph, {radialSegments: RADIAL_SEGMENTS});
  assertNoNaN(mesh, 'branch');

  // Three nodes total, but the fork's ring is generated ONCE and reused by both segments --
  // three rings' worth of vertices, not four.
  assert.equal(mesh.positions.length, 3 * RADIAL_SEGMENTS * 3, "the fork node's ring is built once and shared, not duplicated per child segment");
  assert.equal(mesh.indices.length, 2 * RADIAL_SEGMENTS * 6, 'two edges (fork->A, fork->B) each produce a full quad strip');
  for (const i of mesh.indices) assert.ok(i >= 0 && i < mesh.positions.length / 3, `index ${i} stays within the actual vertex buffer`);
}

// --- rootDistances accumulates real edge length, not hop count -----------------------------
{
  // A bent 3-segment chain with DELIBERATELY different edge lengths (2, 0.5, 3 world units), so
  // "count of hops from the root" (which would give 0,1,2,3) and "real accumulated distance"
  // (0, 2, 2.5, 5.5) disagree -- proving this is a real geodesic sum, not a hop counter.
  const graph = makeGraph([
    {x: 0, y: 0, z: 0, radius: 0.1, parentId: null},   // root, distance 0
    {x: 2, y: 0, z: 0, radius: 0.1, parentId: 0},        // +2 -> distance 2
    {x: 2.5, y: 0, z: 0, radius: 0.1, parentId: 1},      // +0.5 -> distance 2.5
    {x: 5.5, y: 0, z: 0, radius: 0.1, parentId: 2},      // +3 -> distance 5.5
  ]);
  const mesh = sweepPlantGraph(graph, {radialSegments: RADIAL_SEGMENTS});
  assertNoNaN(mesh, 'bent chain');

  const expectedByRing = [0, 2, 2.5, 5.5];
  for (let ring = 0; ring < 4; ring++) {
    for (let i = 0; i < RADIAL_SEGMENTS; i++) {
      const got = mesh.rootDistances[ring * RADIAL_SEGMENTS + i];
      assert.ok(Math.abs(got - expectedByRing[ring]) < 1e-5,
        `ring ${ring}'s rootDistances is the real accumulated edge length (${expectedByRing[ring]}), not a hop count or a flat value (got ${got})`);
    }
  }

  // A branch: both children of the fork start accumulating distance from the SAME fork value,
  // independently -- one child being far away must not affect the other child's own distance.
  const branchGraph = makeGraph([
    {x: 0, y: 0, z: 0, radius: 0.1, parentId: null},  // fork, distance 0
    {x: 10, y: 0, z: 0, radius: 0.1, parentId: 0},      // far child A, distance 10
    {x: 0, y: 0, z: 1, radius: 0.1, parentId: 0},       // near child B, distance 1
  ]);
  const branchMesh = sweepPlantGraph(branchGraph, {radialSegments: RADIAL_SEGMENTS});
  const distA = branchMesh.rootDistances[RADIAL_SEGMENTS]; // child A's ring starts right after the fork's ring
  const distB = branchMesh.rootDistances[2 * RADIAL_SEGMENTS];
  assert.ok(Math.abs(distA - 10) < 1e-5, `child A's own distance (10) is unaffected by its sibling (got ${distA})`);
  assert.ok(Math.abs(distB - 1) < 1e-5, `child B's own distance (1) is unaffected by its sibling (got ${distB})`);
}

// --- A graph with no edges at all (a lone, just-planted seed) produces valid empty buffers -
{
  const graph = makeGraph([{x: 0.3, y: 0, z: 0.3, radius: 0.05, parentId: null}]);
  const mesh = sweepPlantGraph(graph, {radialSegments: RADIAL_SEGMENTS});
  assert.equal(mesh.positions.length, 0, 'a graph with no parent-child edges produces no vertices yet -- nothing to sweep between');
  assert.equal(mesh.indices.length, 0, 'a graph with no parent-child edges produces no indices');
}

console.log('mesh: sweepPlantGraph builds real tube geometry from a plant graph -- rings sit at their own node\'s exact radius, taper genuinely differs per end, branch rings are shared not duplicated, every index stays in bounds, and rootDistances is a real accumulated edge-length sum independent per branch');
