// UI-free adapter over the stable window.SHADED contract.
// This used to live in editor/facade.js; the behavior survives, the editor dependency does not.

export class SceneRuntimeFacade {
  constructor(realm = null) {
    this.realm = realm;
    this.actorBundles = [];
    this._nextBundleId = 1;
  }

  get win() {
    return this.realm?.contentWindow || this.realm?.window || globalThis.window;
  }

  get doc() {
    return this.realm?.contentDocument || this.realm?.document || globalThis.document;
  }

  isEngineLoaded() {
    return !!this.win?.SHADED;
  }

  isReady() {
    return this.isEngineLoaded() && this.win.SHADED.isReady();
  }

  loadDemo() {
    if (!this.isEngineLoaded()) return Promise.reject(new Error('SHADED-Engine ist noch nicht geladen.'));
    if (typeof this.win.SHADED.loadDemo === 'function') return this.win.SHADED.loadDemo();
    return Promise.reject(new Error('Diese SHADED-Engine unterstützt das Laden der Demo nicht.'));
  }

  loadSceneFile(file) {
    if (!this.isEngineLoaded()) return Promise.reject(new Error('SHADED-Engine ist noch nicht geladen.'));
    return Promise.resolve(this.win.SHADED.loadImageFile(file, false));
  }

  loadMaterialFile(file) {
    if (!this.isEngineLoaded()) return Promise.reject(new Error('SHADED-Engine ist noch nicht geladen.'));
    return Promise.resolve(this.win.SHADED.loadImageFile(file, true));
  }

  create() {
    return this.win.SHADED.erstellen();
  }

  getParams() {
    return this.win.SHADED.getParams();
  }

  setParams(partial) {
    return this.win.SHADED.setParams(partial);
  }

  applyAct(id) {
    return this.win.SHADED.applyAct(id);
  }

  getMaterialTypeAt(u, v) {
    return this.win.SHADED.getMaterialTypeAt(u, v);
  }

  waitUntilReady(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        if (this.isReady()) return resolve();
        if (performance.now() - start > timeoutMs) {
          return reject(new Error('SHADED-Engine wurde innerhalb der Zeitgrenze nicht bereit.'));
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async addActorBundle(sheetFile, manifestFile, opts = {}) {
    const manifestText = await manifestFile.text();
    let manifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch (error) {
      throw new Error(`Manifest ist kein gültiges JSON: ${error.message}`);
    }
    const animNames = Object.keys(manifest.animations || {});
    if (!animNames.length) throw new Error('Manifest enthält keine "animations".');

    const sheetUrl = URL.createObjectURL(sheetFile);
    const x = opts.x ?? 0.5;
    const y = opts.y ?? 0.6;
    const scale = opts.scale ?? 1;
    const anim = opts.anim && animNames.includes(opts.anim) ? opts.anim : animNames[0];
    const depthLayer = opts.depthLayer || 'mid';
    const handle = this.win.SHADED.addActor({
      image: sheetUrl,
      manifest: manifestText,
      x, y, scale, anim, depthLayer,
    });

    const entry = {
      id: this._nextBundleId++,
      label: sheetFile.name,
      handle,
      x, y, scale, anim, depthLayer, animNames,
    };
    this.actorBundles.push(entry);
    return entry;
  }

  getIntrinsicState() {
    if (!this.isEngineLoaded() || !this.win.SHADED.intrinsic) return null;
    return this.win.SHADED.intrinsic.state();
  }

  setIntrinsicStrength(strength) {
    if (!this.isEngineLoaded() || !this.win.SHADED.intrinsic) return null;
    return this.win.SHADED.intrinsic.setStrength(strength);
  }

  acceptIntrinsic() {
    if (!this.isEngineLoaded() || !this.win.SHADED.intrinsic) return false;
    return this.win.SHADED.intrinsic.accept();
  }

  resetIntrinsic() {
    if (!this.isEngineLoaded() || !this.win.SHADED.intrinsic) return false;
    return this.win.SHADED.intrinsic.reset();
  }

  async setIntrinsicFromImage(source, meta = {}) {
    if (!this.isReady() || !this.win.SHADED.intrinsic) return false;
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const img = this.doc.createElement('img');
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error(`Shading-Feld nicht ladbar: ${url}`));
        img.src = url;
      });
      return this.win.SHADED.intrinsic.set({...meta, shading: img});
    } finally {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    }
  }

  getRuntimeStatus() {
    return {
      engineLoaded: this.isEngineLoaded(),
      ready: this.isReady(),
      actorCount: this.actorBundles.length,
      storyboardSteps: this.isEngineLoaded() ? this.win.SHADED.story.board().length : 0,
      intrinsic: this.getIntrinsicState(),
    };
  }

  getDebugSnapshot() {
    return {
      ...this.getRuntimeStatus(),
      params: this.isReady() ? this.getParams() : null,
      actors: this.actorBundles.map(({id, label, x, y, scale, anim, depthLayer}) => ({
        id, label, x, y, scale, anim, depthLayer,
      })),
      storyboard: this.isEngineLoaded() ? this.win.SHADED.story.board() : [],
    };
  }

  exportProject() {
    if (!this.isReady()) {
      throw new Error('exportProject() verlangt eine bereits erstellte Szene (erst create()/waitUntilReady()).');
    }
    const project = {
      schema: 'shaded.scene-project/v1',
      params: this.getParams(),
      actors: this.actorBundles.map(({label, x, y, scale, anim, depthLayer}) => ({
        label, x, y, scale, anim, depthLayer,
      })),
      storyboard: this.win.SHADED.story.board(),
    };
    const intrinsic = this.getIntrinsicState();
    if (intrinsic) {
      project.intrinsic = {
        provider: intrinsic.provider,
        providerVersion: intrinsic.providerVersion,
        channelSetId: intrinsic.channelSetId,
        provenance: intrinsic.provenance,
        confidence: intrinsic.confidence,
        colorSpace: intrinsic.colorSpace,
        strength: intrinsic.strength,
        accepted: intrinsic.accepted,
      };
    }
    return project;
  }

  async loadProject(project, assets = {}) {
    if (!assets.sceneFile) {
      throw new Error('loadProject() braucht assets.sceneFile (echtes File-Objekt, kein Pfad/String).');
    }
    await this.loadSceneFile(assets.sceneFile);
    if (assets.materialFile) await this.loadMaterialFile(assets.materialFile);
    this.create();
    await this.waitUntilReady();

    if (project.params) this.setParams(project.params);

    const actorSpecs = project.actors || [];
    const actorFiles = assets.actorFiles || [];
    for (let i = 0; i < actorSpecs.length; i++) {
      const files = actorFiles[i];
      if (!files?.sheetFile || !files?.manifestFile) {
        throw new Error(`loadProject(): fehlende Sprite-/Manifest-Dateien für Actor #${i} ("${actorSpecs[i].label || '?'}").`);
      }
      await this.addActorBundle(files.sheetFile, files.manifestFile, actorSpecs[i]);
    }

    if (project.storyboard) {
      const board = this.win.SHADED.story.board();
      board.length = 0;
      project.storyboard.forEach(step => board.push(step));
    }

    if (project.intrinsic && this.win.SHADED.intrinsic) {
      if (assets.intrinsicShading) {
        const meta = {
          provider: project.intrinsic.provider,
          providerVersion: project.intrinsic.providerVersion,
          channelSetId: project.intrinsic.channelSetId,
          provenance: project.intrinsic.provenance,
          confidence: project.intrinsic.confidence,
          colorSpace: project.intrinsic.colorSpace,
        };
        if (typeof assets.intrinsicShading === 'string' || assets.intrinsicShading instanceof Blob) {
          await this.setIntrinsicFromImage(assets.intrinsicShading, meta);
        } else {
          this.win.SHADED.intrinsic.set({...meta, shading: assets.intrinsicShading});
        }
      }
      if (typeof project.intrinsic.strength === 'number') {
        this.setIntrinsicStrength(project.intrinsic.strength);
      }
      if (project.intrinsic.accepted) this.acceptIntrinsic();
    }

    return this.getDebugSnapshot();
  }
}
