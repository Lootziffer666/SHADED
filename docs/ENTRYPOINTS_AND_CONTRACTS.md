# SHADED entry points and contracts

Status: **canonical for `architecture/ui-zero-contracts`**.

This branch deliberately has no authored production/editor UI. Capability is documented first;
presentation can be rebuilt later as a replaceable client.

## Rule zero: DOM is not an API

A button, panel, selector, CSS class or hidden element is never a runtime contract.

If logic needs an operation, expose a function, method, event or data contract. A future UI calls
that contract. It does not keep an old element alive so code can click it.

## Canonical browser entry points

| Entry point | Responsibility | Authored editor UI? |
|---|---|---|
| `index.html` | Boots the runtime and owns the render host. | No |
| `runtime/shaded-engine.mjs` | Canonical scene/material/runtime truth; creates `window.SHADED`. | No |
| `integrations/scene-runtime-facade.js` | UI-free adapter over `window.SHADED`. | No |
| `integrations/headless-orchestrator.js` | Creates `window.SHADED_ORCHESTRATOR`. | No |
| `integrations/world-sandbox-runtime.js` | Creates `window.SHADEDWorldSandbox`. | No |
| `service-worker.js` | Offline cache for the runtime host/contracts. | No |

The deleted `editor/` tree is not an entry point, cache target or compatibility layer.

## Stable public engine contract: `window.SHADED`

Repository code and external automation currently rely on:

- `erstellen()`
- `applyAct(id)`
- `getParams()` / `setParams(partial)`
- `setTime(...)`
- `isReady()`
- `getMaterialTypeAt(u, v)`
- `story`
- `loadDemo()`
- `loadImageFile(file, isMaterial)`
- `addActor(...)`
- `intrinsic`

The engine may extend this surface. UI code must not reach into engine internals to avoid adding a
named contract.

## Stable headless scene contract: `window.SHADED_ORCHESTRATOR`

Exposed by `integrations/headless-orchestrator.js` through `SceneRuntimeFacade`:

- `loadProject(project, assets)`
- `exportProject()`
- `addActorBundle(sheetFile, manifestFile, opts)`
- `getRuntimeStatus()`
- `getDebugSnapshot()`
- `isReady()`

The facade owns no rendering/material implementation. It delegates to the actual `window.SHADED`
contract.

## World Sandbox decomposition

The former `editor/world-sandbox.js` mixed five separate responsibilities:

1. simulation/controller state,
2. CPU fallback simulation + particles,
3. rendering/camera math,
4. browser input/event binding,
5. editor HUD/panel/inspector wiring.

It was deleted after the reusable pieces were extracted.

### Canonical modules

| Module | Contract |
|---|---|
| `runtime/world-sandbox-reference.mjs` | CPU reference world laws and state layout |
| `runtime/world-sandbox-webgpu.mjs` | WebGPU compute/render backend |
| `runtime/world-sandbox-camera.mjs` | Pure orbit/walk projection and screen/world transforms |
| `runtime/world-sandbox-cpu-backend.mjs` | CPU stepping, particle/deposit feedback and optional Canvas2D render adapter |
| `runtime/world-sandbox-browser-backend.mjs` | Browser canvas backend selection; WebGPU with explicit CPU fallback policy |
| `runtime/world-sandbox-runtime.mjs` | DOM-free controller and fixed-step orchestration |
| `integrations/world-sandbox-runtime.js` | Browser-global public API |

### `window.SHADEDWorldSandbox`

The public bridge currently exposes:

**Lifecycle/state**
- `enter()` / `exit()`
- `reset(seed, options)`
- `snapshot()`
- `active`, `backend`, `query`, `body`, `camera`, `walk`, `dayNight`, `stamps`, `world`

**World control**
- `setTool(tool)`
- `setViewMode(mode)`
- `setBrushRadius(radius)` — normalized world radius, not a DOM slider value
- `setSpeed(speed)`
- `setPaused(paused)`
- `setEnvironment(partial)`

**Tools**
- `setPointer(x, z, options)`
- `beginToolStroke(x, z)`
- `continueToolStroke(x, z)`
- `endToolStroke()`
- `useTool(x, z)`
- `queueStamp(...)`
- `queueEmitter(...)`
- `launchStone(x, z)`

**Navigation/camera**
- `enterWalk()` / `exitWalk()` / `toggleWalk()`
- `lookWalk(delta)`
- `orbitCamera(delta)`
- `resetCamera()`
- `walkInputFromGamepad(pad)`

**Stepping/render**
- `step(input)`
- `advance(seconds, input)`
- `render(time)`
- `startRealtime(options)` / `stopRealtime()`
- `attachCanvas(canvas, options)`

**Deterministic replay**
- `startCauseChain()`

A future UI is allowed to turn pointer/gamepad/keyboard gestures into these calls. The runtime is
not allowed to discover those controls itself.

## CPU fallback contract

The old `CpuWorldSandbox` class mixed solver state and a Canvas2D renderer. It is now split
semantically inside `runtime/world-sandbox-cpu-backend.mjs`:

- `CpuWorldSandboxBackend` runs the actual reference solver, airborne particles and particle
  deposits without any canvas.
- `CpuCanvasWorldSandboxBackend` adds rendering only when an explicit canvas is supplied.

The CPU path is therefore usable in Node/headless tests without inventing invisible DOM.

## Browser backend/fallback contract

`BrowserWorldSandboxBackend.create(canvas, options)` tries WebGPU when requested. If WebGPU cannot
start, it uses the real CPU/Canvas backend.

A WebGPU canvas may not be reusable as Canvas2D. Therefore late fallback accepts an explicit
`replaceCanvas(oldCanvas)` callback from the presentation client. The runtime never clones or
replaces DOM by itself.

## Input contract

Input polling/event binding was not preserved as runtime code.

Pure input semantics were preserved:

- analog deadzone mapping,
- standard gamepad axis -> forward/strafe/look mapping,
- analog magnitude preservation,
- walk movement and look,
- camera orbit/projection/screen-to-world math.

Keyboard, pointer, touch, stylus and gamepad event listeners belong to future input adapters.

## Preserved cause/effect behavior

The extraction keeps:

- sand/water/seed/dig/heat/focus/carve tool semantics,
- directional `STAMP.CARVE`,
- particle -> physical deposit feedback,
- stone rigid-body-ish fall/contact/buoyancy/impact stamps,
- walk state,
- day/night -> temperature -> actual world-state coupling,
- deterministic cause-chain replay,
- CPU reference query sampling,
- WebGPU backend compatibility,
- Canvas fallback visualization and debug field modes.

## What was intentionally destroyed

- `editor/world-sandbox.js`
- World Studio overlays/panels
- topbar/rail/inspector/drawer code
- editor CSS
- duplicate mobile/desktop sandbox toolbars
- UI event plumbing
- tests whose only purpose was proving old buttons/selectors existed
- `gui.html`

Git history remains the archive. Deleted presentation is not a migration target.

## Schema/data contracts

These survive presentation replacement:

- `contracts/shaded-scene-project.schema.json`
- `contracts/shaded-spatial-provider.schema.json`
- `contracts/shaded-style-profile.schema.json`
- `contracts/shaded-technique-registry.schema.json`

The schemas define data. HTML IDs do not.

## Rebuild condition for a future UI

A new control must be explainable as:

> user gesture -> named contract call -> state/result -> render

If implementing the control requires restoring an old selector/ID so hidden code starts working,
the boundary is wrong.
