import { SceneEditorFacade } from '../editor/facade.js';

// Contract-only bridge. No buttons, panels, selectors or presentation logic live here.
// It preserves the existing headless orchestration surface while editor/app.js is quarantined.
const facade = new SceneEditorFacade();

window.SHADED_ORCHESTRATOR = Object.freeze({
  loadProject: (project, assets) => facade.loadProject(project, assets),
  exportProject: () => facade.exportProject(),
  addActorBundle: (sheetFile, manifestFile, opts) => facade.addActorBundle(sheetFile, manifestFile, opts),
  getRuntimeStatus: () => facade.getRuntimeStatus(),
  getDebugSnapshot: () => facade.getDebugSnapshot(),
  isReady: () => facade.isReady(),
});

window.dispatchEvent(new CustomEvent('shaded:orchestrator-ready'));
