# SHADED entry points and contracts

Status: **canonical for `architecture/ui-zero-contracts`**.

This document exists because presentation DOM had become an accidental API. That is no longer allowed.

## Rule zero: DOM is not an API

A button, panel, selector, CSS class or hidden element is never a runtime contract.

If logic needs an operation, expose a function, method, event or data contract. If a future UI needs that operation, it calls the contract. It does **not** keep an old button alive, hidden or visible, just so code can click it.

Engine-created hidden compatibility nodes may exist internally while old runtime code is decomposed, but no new UI or bridge may depend on their existence. They are implementation debt, not public surface.

## Canonical browser entry points

| Entry point | Responsibility | Visible UI allowed? |
|---|---|---|
| `index.html` | Boots the runtime and owns the render surface. | **No authored controls on this branch.** |
| `runtime/shaded-engine.mjs` | Canonical scene/material/runtime truth. Creates `window.SHADED`. | No editor UI dependency. |
| `integrations/headless-orchestrator.js` | Exposes the existing automation bridge as `window.SHADED_ORCHESTRATOR` without loading `editor/app.js`. | No. |
| `editor/facade.js` | Thin adapter over the public `window.SHADED` API. No shader/material reimplementation. | No. |
| `service-worker.js` | Caches the runtime host and runtime/contract modules. | No. |

## Stable public engine contract: `window.SHADED`

The invariant contract already used by tests, integrations and agents remains the source of truth. Existing names are not renamed merely because the UI is being rebuilt.

Core stable methods/properties currently relied on by the repository:

- `erstellen()` — create/build the active scene.
- `applyAct(id)` — apply a named world/story act.
- `getParams()` / `setParams(partial)` — read/write high-level world/render parameters.
- `setTime(...)` — drive explicit runtime time where supported.
- `isReady()` — readiness boundary for callers.
- `getMaterialTypeAt(u, v)` — canonical material query backed by the same classification truth as rendering.
- `story` — storyboard contract.
- `loadDemo()` — load the canonical demo assets when available.
- `loadImageFile(file, isMaterial)` — install scene/material input without UI mediation.
- `addActor(...)` — add a SWIFT-compatible actor overlay and return its handle.
- `intrinsic` — material/light separation contract (`state`, strength/set/accept/reset/clear/sample operations as implemented by the engine).

Additional runtime capabilities may extend `window.SHADED`; UI code must feature-detect optional extensions rather than reaching into engine internals.

## Stable headless contract: `window.SHADED_ORCHESTRATOR`

`integrations/headless-orchestrator.js` exposes exactly the orchestration surface that used to be mixed into `editor/app.js`:

- `loadProject(project, assets)`
- `exportProject()`
- `addActorBundle(sheetFile, manifestFile, opts)`
- `getRuntimeStatus()`
- `getDebugSnapshot()`
- `isReady()`

This bridge delegates to `SceneEditorFacade`; it does not reproduce engine logic.

## Schema/data contracts

These are contracts independent of any UI and survive UI replacement:

- `contracts/shaded-scene-project.schema.json`
- `contracts/shaded-spatial-provider.schema.json`
- `contracts/shaded-style-profile.schema.json`
- `contracts/shaded-technique-registry.schema.json`
- Provider/channel/provenance conventions documented under `docs/` and consumed by runtime/tools.

The schemas define data. HTML IDs do not.

## World Sandbox: capability kept, host quarantined

The sandbox solver stack is **not deleted**:

- `runtime/world-sandbox-reference.mjs`
- `runtime/world-sandbox-webgpu.mjs`
- `runtime/world-sandbox-light.mjs`
- `runtime/world-sandbox-growth.mjs`
- `runtime/world-sandbox-mesh.mjs`
- related solver modules/tests

However, `editor/world-sandbox.js` currently starts by requiring presentation elements (`#panel-sandbox`, `#btn-world-sandbox`, a rail button and `#world-sandbox-canvas`) and throws if its host is missing. That means the file currently mixes capability/controller/render/input/UI binding.

Therefore it is intentionally **not loaded by `index.html` on this branch**.

Re-entry condition: split the sandbox into a DOM-independent runtime/controller API plus a new UI binding. The new binding may call methods such as start/pause/setTool/setBrush/setEnvironment/query; it may not require legacy panel IDs to make the simulation exist.

## Quarantined presentation modules

The following may remain in git temporarily as donor/reference code, but they are **not active entry points** and must not be reattached wholesale:

- `editor/app.js` (UI wiring mixed with the old orchestrator exposure)
- `editor/ui-shell.js`
- `editor/ux-fixes.js`
- `editor/drawer-handle.js`
- `editor/world-room-gate.js`
- `editor/world-studio.js`
- `editor/world-studio-v4.js`
- `editor/world-studio-expert.js`
- `editor/world-studio-bridge-settings.js`
- `editor/material-preview-live.js`
- legacy World Studio/editor CSS

Useful logic must be extracted behind a named contract first. Presentation markup/styles are not migration targets.

## Rebuild order

1. Keep this UI-zero host bootable.
2. Extract capability APIs from modules that currently require DOM controls.
3. Add tests against those APIs without clicking UI.
4. Build a new UI from zero against those contracts.
5. Delete quarantined presentation files once their useful capability code has been extracted or proven redundant.

The UI is a client of SHADED. It is not SHADED's nervous system.
