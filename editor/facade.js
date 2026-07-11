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

  loadSceneFile(file) {
    this.win.SHADED.loadImageFile(file, false);
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
}
