// SceneEditorFacade — the ONE small, stable surface the rest of the editor talks to.
// Everything else in editor/ only ever calls methods on this class, never touches
// iframe internals directly. This mirrors two things at once:
//   - Capybara's core idea (github.com/d-liya/capybara_2d_engine): a big engine
//     hides behind one small, documented, agent-friendly facade (their `Game.ts`).
//   - SHADED's own existing rule for `window.SHADED` itself (CLAUDE.md: "API-Vertrag
//     für Tests und Agenten ... nie entfernen oder umbenennen, nur erweitern").
//
// The facade never reimplements SHADED — it only calls the real, already-stable
// `window.SHADED` API inside the embedded engine iframe. No shader/analyze code is
// duplicated or forked here.
export class SceneEditorFacade {
  constructor(iframeEl) {
    this.iframe = iframeEl;
    // Eigene, kleine Buchführung für headless Orchestrierung (tools/orchestrate.js,
    // Real Golden Run R-08/R-09) — getrennt von der interaktiven ActorPlacer-Fassade,
    // aber beide rufen exakt dieselbe `window.SHADED.addActor()`-Wahrheit auf, keine
    // zweite Render-/Klassifikations-Logik.
    this.actorBundles = [];
    this._nextBundleId = 1;
  }

  get win() {
    return this.iframe.contentWindow;
  }

  get doc() {
    return this.iframe.contentDocument;
  }

  isEngineLoaded() {
    return !!(this.win && this.win.SHADED);
  }

  isReady() {
    return this.isEngineLoaded() && this.win.SHADED.isReady();
  }

  /** Loads SHADED's own canonical demo scene + marker pair (same-origin fetch, see index.html's #btn-demo). */
  loadDemo() {
    const btn = this.doc && this.doc.getElementById('btn-demo');
    if (btn) btn.click();
  }

  /**
   * `loadImageFile` decodes the image asynchronously (`new Image(); img.onload=...`) —
   * the canvas (`#gl`) only actually resizes once decoding finishes. Returns a promise
   * that resolves once that real resize happened, so callers (loadProject) never have
   * to guess a fixed delay (same technique already used for paint-canvas in
   * tools/verify-editor.js — poll the real DOM effect, not a sleep).
   */
  loadSceneFile(file) {
    const canvas = this.doc && this.doc.getElementById('gl');
    const widthBefore = canvas ? canvas.width : null;
    this.win.SHADED.loadImageFile(file, false);
    if (!canvas) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        if (canvas.width !== widthBefore) return resolve();
        if (performance.now() - start > 10000) {
          return reject(new Error('Szenenbild wurde innerhalb der Zeitgrenze nicht geladen (Canvas-Größe unverändert).'));
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  loadMaterialFile(file) {
    this.win.SHADED.loadImageFile(file, true);
  }

  create() {
    return this.win.SHADED.erstellen();
  }

  getParams() {
    return this.win.SHADED.getParams();
  }

  setParams(partial) {
    this.win.SHADED.setParams(partial);
  }

  applyAct(id) {
    this.win.SHADED.applyAct(id);
  }

  getMaterialTypeAt(u, v) {
    return this.win.SHADED.getMaterialTypeAt(u, v);
  }

  /** Resolves once the embedded engine has finished `erstellen()` (window.SHADED.isReady() === true). */
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

  /**
   * Fügt einen SWIFT-Sprite-Actor über die reale `window.SHADED.addActor()`-Schnittstelle
   * hinzu (dieselbe Engine-Methode wie ActorPlacer, siehe Klassenkommentar oben). Tracks
   * das Ergebnis in `this.actorBundles` für `getRuntimeStatus`/`getDebugSnapshot`/`exportProject`.
   */
  async addActorBundle(sheetFile, manifestFile, opts = {}) {
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

    const handle = this.win.SHADED.addActor({ image: sheetUrl, manifest: manifestText, x, y, scale, anim, depthLayer });

    const entry = {
      id: this._nextBundleId++,
      label: sheetFile.name,
      handle,
      x, y, scale, anim, depthLayer, animNames,
    };
    this.actorBundles.push(entry);
    return entry;
  }

  /** Reiner Laufzeit-Status, ausschließlich aus echten Engine-/Buchführungswerten — nichts erfunden. */
  getRuntimeStatus() {
    return {
      engineLoaded: this.isEngineLoaded(),
      ready: this.isReady(),
      actorCount: this.actorBundles.length,
      storyboardSteps: this.isEngineLoaded() ? this.win.SHADED.story.board().length : 0,
    };
  }

  /** Erweiterter Debug-Snapshot für headless Orchestrierung/Beweisführung (tools/orchestrate.js). */
  getDebugSnapshot() {
    const status = this.getRuntimeStatus();
    return {
      ...status,
      params: this.isReady() ? this.getParams() : null,
      actors: this.actorBundles.map(({ id, label, x, y, scale, anim, depthLayer }) => ({ id, label, x, y, scale, anim, depthLayer })),
      storyboard: this.isEngineLoaded() ? this.win.SHADED.story.board() : [],
    };
  }

  /**
   * Baut ein `shaded.scene-project/v1`-Projektobjekt (contracts/shaded-scene-project.schema.json)
   * aus dem aktuellen Live-Zustand. Kann die ursprünglichen Bild-/Manifest-Bytes NICHT erneut
   * emittieren (die Engine hält sie nicht als abrufbare Dateien vor) — `assetRefs` sind rein
   * informativ; ein erneutes `loadProject()` braucht wieder echte Dateien.
   */
  exportProject() {
    if (!this.isReady()) {
      throw new Error('exportProject() verlangt eine bereits erstellte Szene (erst create()/waitUntilReady()).');
    }
    return {
      schema: 'shaded.scene-project/v1',
      params: this.getParams(),
      actors: this.actorBundles.map(({ label, x, y, scale, anim, depthLayer }) => ({ label, x, y, scale, anim, depthLayer })),
      storyboard: this.win.SHADED.story.board(),
    };
  }

  /**
   * Lädt ein `shaded.scene-project/v1`-Projekt end-to-end: Szene(+Zweitbild) laden, `create()`,
   * auf Ready warten, Parameter setzen, Actors hinzufügen, Storyboard übernehmen. `assets` liefert
   * die echten File-Objekte (Projekt-JSON kann keine Bilddaten tragen) — `sceneFile` ist Pflicht,
   * `actorFiles[i]` muss zu `project.actors[i]` passen.
   */
  async loadProject(project, assets = {}) {
    if (!assets.sceneFile) {
      throw new Error('loadProject() braucht assets.sceneFile (echtes File-Objekt, kein Pfad/String).');
    }
    await this.loadSceneFile(assets.sceneFile);
    if (assets.materialFile) this.loadMaterialFile(assets.materialFile);
    this.create();
    await this.waitUntilReady();

    if (project.params) this.setParams(project.params);

    const actorSpecs = project.actors || [];
    const actorFiles = assets.actorFiles || [];
    for (let i = 0; i < actorSpecs.length; i++) {
      const files = actorFiles[i];
      if (!files || !files.sheetFile || !files.manifestFile) {
        throw new Error(`loadProject(): fehlende Sprite-/Manifest-Dateien für Actor #${i} ("${actorSpecs[i].label || '?'}").`);
      }
      await this.addActorBundle(files.sheetFile, files.manifestFile, actorSpecs[i]);
    }

    if (project.storyboard) {
      const board = this.win.SHADED.story.board();
      board.length = 0;
      project.storyboard.forEach((step) => board.push(step));
    }

    return this.getDebugSnapshot();
  }
}
