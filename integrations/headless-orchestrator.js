import {SceneRuntimeFacade} from './scene-runtime-facade.js';

// Stable automation bridge. It depends on window.SHADED, never on authored DOM.
const facade = new SceneRuntimeFacade();

window.SHADED_ORCHESTRATOR = Object.freeze({
  loadProject: (project, assets) => facade.loadProject(project, assets),
  exportProject: () => facade.exportProject(),
  addActorBundle: (sheetFile, manifestFile, opts) => facade.addActorBundle(sheetFile, manifestFile, opts),
  getRuntimeStatus: () => facade.getRuntimeStatus(),
  getDebugSnapshot: () => facade.getDebugSnapshot(),
  isReady: () => facade.isReady(),
});

window.dispatchEvent(new CustomEvent('shaded:orchestrator-ready'));
