import {WorldSandboxRuntime, walkInputFromGamepad} from '../runtime/world-sandbox-runtime.mjs';
import {BrowserWorldSandboxBackend} from '../runtime/world-sandbox-browser-backend.mjs';

// Public browser bridge. It exposes capability, not controls.
// A future UI may create/pass a canvas and input values; the simulation never searches the DOM.
const runtime = new WorldSandboxRuntime({
  mobile: globalThis.matchMedia?.('(max-width: 700px)')?.matches || false,
});

async function attachCanvas(canvas, options = {}) {
  const backend = await BrowserWorldSandboxBackend.create(canvas, {
    ...options,
    mobile: options.mobile ?? runtime.mobile,
    onQuery: query => runtime.updateQuery(query),
    onError: (error, detail) => {
      runtime.onError(error, detail);
      options.onError?.(error, detail);
    },
  });
  runtime.useBackend(backend, backend.kind);
  return {backend: backend.kind, label: backend.label, canvas: backend.canvas};
}

const api = {
  enter: () => runtime.enter(),
  exit: () => runtime.exit(),
  reset: (seed, options) => runtime.reset(seed, options),
  setTool: tool => runtime.setTool(tool),
  setViewMode: mode => runtime.setViewMode(mode),
  setBrushRadius: radius => runtime.setBrushRadius(radius),
  setSpeed: speed => runtime.setSpeed(speed),
  setPaused: paused => runtime.setPaused(paused),
  setEnvironment: partial => runtime.setEnvironment(partial),
  setPointer: (x, z, options) => runtime.setPointer(x, z, options),
  beginToolStroke: (x, z) => runtime.beginToolStroke(x, z),
  continueToolStroke: (x, z) => runtime.continueToolStroke(x, z),
  endToolStroke: () => runtime.endToolStroke(),
  useTool: (x, z) => runtime.useTool(x, z),
  spawnPlant: (x, z) => runtime.spawnPlant(x, z),
  queueStamp: (...args) => runtime.queueStamp(...args),
  queueEmitter: (...args) => runtime.queueEmitter(...args),
  launchStone: (x, z) => runtime.launchStone(x, z),
  enterWalk: () => runtime.enterWalk(),
  exitWalk: () => runtime.exitWalk(),
  toggleWalk: () => runtime.toggleWalk(),
  lookWalk: delta => runtime.lookWalk(delta),
  orbitCamera: delta => runtime.orbitCamera(delta),
  resetCamera: () => runtime.resetCamera(),
  startCauseChain: () => runtime.startCauseChain(),
  step: input => runtime.stepOnce(input),
  advance: (seconds, input) => runtime.advance(seconds, input),
  render: time => runtime.render(time),
  startRealtime: options => runtime.startRealtime(options),
  stopRealtime: () => runtime.stopRealtime(),
  walkInputFromGamepad,
  attachCanvas,
  snapshot: () => runtime.snapshot(),
  get active() { return runtime.state.active; },
  get backend() { return runtime.backendKind; },
  get query() { return {...runtime.state.query}; },
  get body() { return {...runtime.state.body}; },
  get camera() { return {...runtime.state.camera}; },
  get walk() { return {...runtime.state.walk}; },
  get dayNight() { return runtime.state.dayNight; },
  get stamps() { return runtime.state.stamps.map(stamp => ({...stamp})); },
  get world() { return runtime.world; },
  get plants() { return runtime.plants; },
};

window.SHADEDWorldSandbox = Object.freeze(api);
window.dispatchEvent(new CustomEvent('shaded:world-sandbox-ready'));
