// SHADED sweep/tube geometry -- "Phase 4: Sweep Geometry" from the user's cultivation plan
// (section 5): "Growth Graph -> Spline/segment chain -> Sweep/Tube -> Mesh." Turns a PlantGraph
// (the `{nodes: [...]}` shape world-sandbox-growth.mjs's createPlantGraph/createRootTip/
// createVineTip/stepGrowthTips/stepVineTips build) into real, renderer-agnostic vertex/index
// buffers: a tube of `radialSegments`-sided cross-section following each parent-child edge,
// radius tapering from the parent node's own stored radius to the child's.
//
// Reads graph.nodes directly as plain data (id/x/y/z/radius/parentId/children) -- no import from
// world-sandbox-growth.mjs needed, and this module writes nothing back into the graph, matching
// the read-only-consumer relationship the rest of this codebase keeps between simulation state
// and anything downstream of it.
//
// Deliberately minimal for this first slice, limitations documented rather than hidden:
//   - No branch blending: a node with multiple children gets ONE ring shared by however many
//     tube segments start there -- a valid but geometrically simple T-junction, not a smoothed
//     fork. A real follow-up, not built here.
//   - No end caps: a tube's open ends read as hollow, not a capped rod. A real follow-up.
//   - Normals are the simple ring-outward radial direction, not smoothed across a taper -- correct
//     for a cylinder's side wall, produces a visible facet where radius changes sharply between
//     segments. A real follow-up (e.g. blending with the segment's own tangent) if that facet
//     ever reads as wrong in practice.
//   - Every graph node this module has seen so far has y=0 (this world-sandbox has no vertical
//     growth axis wired up yet -- see world-sandbox-growth.mjs's own addGraphNode comment); this
//     module itself is fully 3D and does not assume y=0 anywhere, so it needs no changes once
//     real vertical growth exists.

const DEFAULT_RADIAL_SEGMENTS = 8;

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z);
  if (len < 1e-9) return [0, 1, 0]; // degenerate (zero-length) direction -- fall back to "up"
  return [x / len, y / len, z / len];
}

// An orthonormal (right, up) basis perpendicular to a unit `tangent`, used to place a ring's
// vertices around the tube's centerline. Picks a stable world-reference axis (world Y, unless
// the tangent is nearly parallel to it, in which case world Z) so a ring's own orientation
// doesn't flip unpredictably as the tangent direction changes slightly from one node to the next
// -- the standard fix for the "reference axis parallel to tangent" degenerate case any tube-sweep
// implementation has to handle.
function perpendicularBasis(tx, ty, tz) {
  const refX = 0, refY = Math.abs(ty) > 0.99 ? 0 : 1, refZ = Math.abs(ty) > 0.99 ? 1 : 0;
  let [rx, ry, rz] = normalize3(
    ty * refZ - tz * refY,
    tz * refX - tx * refZ,
    tx * refY - ty * refX,
  );
  // up = right x tangent (already unit length: right and tangent are unit and perpendicular)
  const ux = ry * tz - rz * ty;
  const uy = rz * tx - rx * tz;
  const uz = rx * ty - ry * tx;
  return {right: [rx, ry, rz], up: [ux, uy, uz]};
}

// Builds real vertex/index buffers for `graph`. Returns {positions, normals, indices} as typed
// arrays (Float32Array/Float32Array/Uint32Array) -- plain data, no Three.js or WebGL dependency
// here; an actual renderer consuming these is a real follow-up, not built here.
export function sweepPlantGraph(graph, options = {}) {
  const radialSegments = Math.max(3, options.radialSegments || DEFAULT_RADIAL_SEGMENTS);
  const positions = [];
  const normals = [];
  const indices = [];
  const ringStart = new Map(); // nodeId -> index of that node's first ring vertex in `positions`

  function tangentAt(node) {
    // A node with a parent points from parent to itself -- the direction it actually grew. A
    // parentless (root/seed) node with at least one child instead points toward its first
    // child, so even a lone seed still gets a well-defined ring orientation rather than an
    // arbitrary default; a truly isolated node (no parent, no children) never reaches this
    // function at all, since the main loop below only visits edges.
    const parent = node.parentId != null ? graph.nodes[node.parentId] : null;
    if (parent) return normalize3(node.x - parent.x, node.y - parent.y, node.z - parent.z);
    const child = graph.nodes[node.children[0]];
    return normalize3(child.x - node.x, child.y - node.y, child.z - node.z);
  }

  function ensureRing(node) {
    const existing = ringStart.get(node.id);
    if (existing !== undefined) return existing;
    const [tx, ty, tz] = tangentAt(node);
    const {right, up} = perpendicularBasis(tx, ty, tz);
    const start = positions.length / 3;
    for (let i = 0; i < radialSegments; i++) {
      const angle = (i / radialSegments) * Math.PI * 2;
      const c = Math.cos(angle), s = Math.sin(angle);
      const ox = right[0] * c + up[0] * s;
      const oy = right[1] * c + up[1] * s;
      const oz = right[2] * c + up[2] * s;
      positions.push(node.x + ox * node.radius, node.y + oy * node.radius, node.z + oz * node.radius);
      normals.push(ox, oy, oz);
    }
    ringStart.set(node.id, start);
    return start;
  }

  for (const node of graph.nodes) {
    if (node.parentId == null) continue; // edges only -- a graph with no edges yields no geometry
    const parent = graph.nodes[node.parentId];
    const parentRing = ensureRing(parent);
    const childRing = ensureRing(node);
    for (let i = 0; i < radialSegments; i++) {
      const next = (i + 1) % radialSegments;
      const p0 = parentRing + i, p1 = parentRing + next;
      const c0 = childRing + i, c1 = childRing + next;
      indices.push(p0, c0, c1, p0, c1, p1);
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
  };
}
