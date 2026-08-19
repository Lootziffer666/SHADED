// ActorPlacer — third small, stable facade: places SWIFT-style animated sprite-sheet
// actors via the existing `window.SHADED.addActor()` contract (CLAUDE.md §"Actor-System
// & Depth-Integration"). Never renders actors itself and never touches classGrid/
// getMaterialTypeAt — actors stay purely optical, exactly as the engine already
// guarantees.
//
// Cross-iframe note: `addActor`'s internal `loadInto()` does `src instanceof
// HTMLImageElement`, which only matches for images constructed inside the SAME
// window realm. Passing a parent-window `Image()` would silently fail that check.
// This class therefore always hands over `image`/`depthImage`/`emissiveImage` as
// blob: URL strings (loaded via `new Image()` *inside* the iframe by `addActor`
// itself) and `manifest` as a JSON string — never DOM objects across the boundary.
export class ActorPlacer {
  constructor(facade) {
    this.facade = facade;
    this.actors = [];
    this._nextId = 1;
  }

  async addFromFiles(sheetFile, manifestFile, opts = {}) {
    const manifestText = await manifestFile.text();
    let manifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch (e) {
      throw new Error(`Manifest ist kein gültiges JSON: ${e.message}`);
    }
    const animNames = Object.keys(manifest.animations || {});
    if (animNames.length === 0) throw new Error('Manifest enthält keine "animations".');

    const sheetUrl = URL.createObjectURL(sheetFile);
    const x = opts.x ?? 0.5;
    const y = opts.y ?? 0.6;
    const scale = opts.scale ?? 1;
    const anim = opts.anim && animNames.includes(opts.anim) ? opts.anim : animNames[0];
    const depthLayer = opts.depthLayer || 'mid';

    const handle = this.facade.win.SHADED.addActor({
      image: sheetUrl,
      manifest: manifestText,
      x, y, scale, anim, depthLayer,
    });

    const entry = {
      id: this._nextId++,
      label: sheetFile.name,
      handle,
      sheetUrl,
      manifestText,
      animNames,
      x, y, scale, anim, depthLayer,
    };
    this.actors.push(entry);
    return entry;
  }

  setPosition(id, x, y) {
    const e = this._find(id);
    e.handle.setPosition(x, y);
    e.x = x; e.y = y;
  }

  setAnim(id, name) {
    const e = this._find(id);
    e.handle.setAnim(name);
    e.anim = name;
  }

  setDepthLayer(id, layer) {
    const e = this._find(id);
    e.handle.setDepthLayer(layer);
    e.depthLayer = layer;
  }

  setVisible(id, visible) {
    const e = this._find(id);
    e.handle.setVisible(visible);
  }

  /**
   * `addActor`'s handle has no `setScale` (scale is create-time only in the real
   * engine — this class does not invent one). Changing scale means removing and
   * re-adding the actor at the same position/anim/depthLayer, using the sheet/
   * manifest already cached on the entry (no re-upload needed).
   */
  setScale(id, scale) {
    const e = this._find(id);
    e.handle.remove();
    const handle = this.facade.win.SHADED.addActor({
      image: e.sheetUrl,
      manifest: e.manifestText,
      x: e.x, y: e.y, scale, anim: e.anim, depthLayer: e.depthLayer,
    });
    e.handle = handle;
    e.scale = scale;
  }

  remove(id) {
    const e = this._find(id);
    e.handle.remove();
    this.actors = this.actors.filter((a) => a.id !== id);
  }

  list() {
    return this.actors;
  }

  _find(id) {
    const e = this.actors.find((a) => a.id === id);
    if (!e) throw new Error(`Kein Actor mit id ${id}.`);
    return e;
  }
}
