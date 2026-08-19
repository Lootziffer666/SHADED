// SHADED Spatial Kernel — Semantic SceneGraph (spec §9, pascalorg/editor +
// REST3D inspired). The graph is NOT the renderer: a WALL is a semantic
// entity that MAY have mesh / voxel / collision / photo / SDF representations.
// Those are attached as representations, not as separate truths.
//
// Design: flat node store + parent/reference relationships + stable IDs +
// dirty nodes + type registry + transforms + bounds + semantic links.

export const NODE_FAMILY = Object.freeze({
  WORLD: 'WORLD',
  REGION: 'REGION',
  OBJECT: 'OBJECT',
  SURFACE: 'SURFACE',
  VOLUME: 'VOLUME',
  STRUCTURE: 'STRUCTURE',
  WALL: 'WALL',
  FLOOR: 'FLOOR',
  CEILING: 'CEILING',
  PORTAL: 'PORTAL',
  ANCHOR: 'ANCHOR',
  CAMERA: 'CAMERA',
  OBSERVATION: 'OBSERVATION',
  SCAN: 'SCAN',
  GUIDE: 'GUIDE',
  ACTOR: 'ACTOR',
  LIGHT: 'LIGHT',
  EMITTER: 'EMITTER',
  FIELD: 'FIELD',
  RULE: 'RULE',
  COMPLETION: 'COMPLETION',
  PLAN_ELEMENT: 'PLAN_ELEMENT',
});

let _nseq = 0;

export class SceneGraphNode {
  constructor(id, init = {}) {
    this.id = id;
    this.family = init.family || NODE_FAMILY.OBJECT;
    this.type = init.type || this.family;
    this.parent = init.parent || null; // node id or null
    this.children = new Set(init.children || []);
    this.refs = new Map(init.refs || []); // relation -> node id
    this.semanticLinks = new Map(); // relation -> Set(nodeId)
    this.transform = init.transform || { pos: [0, 0, 0], quat: [0, 0, 0, 1], scale: [1, 1, 1] };
    this.bounds = init.bounds || null; // { min:[x,y,z], max:[x,y,z] }
    this.metadata = init.metadata || {};
    this.representations = init.representations || []; // [{kind:'mesh'|'voxel'|'sdf'|'photo'|'collision', ref}]
    this.dirty = true;
    this.createdAt = init.createdAt ?? Date.now();
  }

  addRepresentation(rep) { this.representations.push(rep); return rep; }
  markDirty(v = true) { this.dirty = v; }
}

export class SceneGraph {
  constructor() {
    this.nodes = new Map();
    this.typeRegistry = new Set(Object.values(NODE_FAMILY));
    this._rootId = null;
  }

  // Create a node with a stable, unique id. `family` must be a registered type.
  createNode(init = {}) {
    const family = init.family || NODE_FAMILY.OBJECT;
    if (!this.typeRegistry.has(family)) {
      throw new Error(`unknown node family: ${family}`);
    }
    _nseq += 1;
    const id = init.id || `${family.toLowerCase()}_${_nseq.toString(36)}`;
    if (this.nodes.has(id)) throw new Error(`node id collision: ${id}`);
    const node = new SceneGraphNode(id, init);
    this.nodes.set(id, node);
    if (init.parent && this.nodes.has(init.parent)) {
      this.nodes.get(init.parent).children.add(id);
    }
    if (!this._rootId && (family === NODE_FAMILY.WORLD || init.parent == null && !this._rootId)) {
      if (family === NODE_FAMILY.WORLD) this._rootId = id;
    }
    return node;
  }

  get(id) { return this.nodes.get(id) || null; }
  has(id) { return this.nodes.has(id); }

  // Remove a node; its children are re-parented to the removed node's parent
  // (or detached) rather than deleted, preserving the subgraph's meaning.
  remove(id) {
    const node = this.nodes.get(id);
    if (!node) return false;
    if (node.parent && this.nodes.has(node.parent)) {
      this.nodes.get(node.parent).children.delete(id);
    }
    for (const childId of node.children) {
      const child = this.nodes.get(childId);
      if (child) child.parent = node.parent;
    }
    this.nodes.delete(id);
    return true;
  }

  setParent(id, parentId) {
    const node = this.nodes.get(id);
    if (!node) return false;
    const oldParent = node.parent;
    if (oldParent && this.nodes.has(oldParent)) this.nodes.get(oldParent).children.delete(id);
    node.parent = parentId || null;
    if (parentId && this.nodes.has(parentId)) this.nodes.get(parentId).children.add(id);
    node.markDirty();
    return true;
  }

  addSemanticLink(fromId, toId, relation) {
    const from = this.nodes.get(fromId);
    if (!from) return false;
    if (!from.semanticLinks.has(relation)) from.semanticLinks.set(relation, new Set());
    from.semanticLinks.get(relation).add(toId);
    from.markDirty();
    return true;
  }

  markDirty(id, v = true) { const n = this.nodes.get(id); if (n) n.dirty = v; }
  dirtyNodes() { return Array.from(this.nodes.values()).filter((n) => n.dirty); }
  markAllClean() { for (const n of this.nodes.values()) n.dirty = false; }

  queryByFamily(family) { return Array.from(this.nodes.values()).filter((n) => n.family === family); }
  queryByType(type) { return Array.from(this.nodes.values()).filter((n) => n.type === type); }

  // Spatial lookup by axis-aligned bounds overlap (coarse; sufficient for
  // dirty-region / portal queries).
  queryByBounds(box) {
    const out = [];
    for (const n of this.nodes.values()) {
      if (!n.bounds) continue;
      if (overlaps(n.bounds, box)) out.push(n);
    }
    return out;
  }

  get rootId() { return this._rootId; }

  toJSON() {
    return {
      rootId: this._rootId,
      nodes: Array.from(this.nodes.values()).map((n) => ({
        id: n.id, family: n.family, type: n.type, parent: n.parent,
        children: Array.from(n.children), refs: Array.from(n.refs.entries()),
        semanticLinks: Array.from(n.semanticLinks.entries()).map(([k, v]) => [k, Array.from(v)]),
        transform: n.transform, bounds: n.bounds, metadata: n.metadata,
        representations: n.representations, dirty: n.dirty,
      })),
    };
  }

  static fromJSON(data) {
    const g = new SceneGraph();
    if (data.rootId) g._rootId = data.rootId;
    for (const nd of data.nodes || []) {
      const node = new SceneGraphNode(nd.id, {
        family: nd.family, type: nd.type, parent: nd.parent,
        children: nd.children, refs: nd.refs, transform: nd.transform,
        bounds: nd.bounds, metadata: nd.metadata, representations: nd.representations,
        createdAt: nd.createdAt,
      });
      node.children = new Set(nd.children || []);
      node.refs = new Map(nd.refs || []);
      node.semanticLinks = new Map((nd.semanticLinks || []).map(([k, v]) => [k, new Set(v)]));
      node.dirty = nd.dirty ?? false;
      g.nodes.set(nd.id, node);
      g.typeRegistry.add(nd.family);
    }
    return g;
  }
}

function overlaps(a, b) {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0] &&
         a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
         a.min[2] <= b.max[2] && a.max[2] >= b.min[2];
}
