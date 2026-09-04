# CLAUDE.md — SHADED canonical project rules

This file is the current architecture contract. Older specs, research notes and git history are
evidence and donors; when they conflict with this file or `docs/ENTRYPOINTS_AND_CONTRACTS.md`,
the current contract wins.

## Core purpose

SHADED turns one observed image into a small, spatial, reactive world. Rendering style is not the
truth source. World state, provenance, material identity and explicit contracts are.

The target is not a particular API or format. WebGL, WebGPU, WGSL, GLSL, TSL, glTF and other
formats are replaceable last-mile mechanisms.

## UI-zero architecture

`index.html` is a **runtime host**, not an editor.

There is currently intentionally **no authored production/editor UI**. This is not a temporary CSS
state. The accumulated editor DOM was deleted so it cannot continue acting as an accidental API.

Hard rules:

1. DOM is not an API.
2. Runtime code must not query an editor panel, button, CSS class or selector to make capability
   exist.
3. `display:none`, hidden buttons and invisible compatibility controls are not migration patterns.
4. A future UI is a client: `gesture -> named contract -> state/result -> render`.
5. A future UI may be rebuilt only against the contracts documented in
   `docs/ENTRYPOINTS_AND_CONTRACTS.md`.
6. The deleted `editor/` tree may be consulted through git history as a donor only. Do not restore
   it wholesale.
7. Isolated research/solver labs are not production UI and may remain.

## Canonical browser entry point

`index.html` boots:

- `runtime/shaded-engine.mjs`
- `runtime/dialogue-engine.mjs`
- `runtime/actor-bridge.mjs`
- `runtime/weather-particles.mjs`
- `runtime/player-fire.mjs`
- `integrations/headless-orchestrator.js`
- `integrations/world-sandbox-runtime.js`

The runtime creates only the render substrate it requires. Authored editor controls do not belong
in the host.

## Stable public engine contract

`window.SHADED` is a contract for tests, integrations and agents. Existing contract names are not
renamed casually.

Core relied-upon surface includes:

- `erstellen()`
- `applyAct(id)`
- `getParams()` / `setParams(partial)`
- `setTime(...)`
- `isReady()`
- `getMaterialTypeAt(u, v)`
- `loadDemo()`
- `loadImageFile(file, isMaterial)`
- `addActor(...)`
- `story`
- `intrinsic`

New runtime capability extends named APIs rather than exposing internals or DOM.

## Headless scene orchestration

`integrations/scene-runtime-facade.js` is the UI-free adapter over `window.SHADED`.

`integrations/headless-orchestrator.js` exposes `window.SHADED_ORCHESTRATOR`:

- `loadProject(project, assets)`
- `exportProject()`
- `addActorBundle(sheetFile, manifestFile, opts)`
- `getRuntimeStatus()`
- `getDebugSnapshot()`
- `isReady()`

It must never depend on editor markup.

## World Sandbox contract

The former `editor/world-sandbox.js` was dismantled. Its useful behavior now lives in runtime
modules:

- `runtime/world-sandbox-reference.mjs` — canonical CPU/world-law truth.
- `runtime/world-sandbox-webgpu.mjs` — WebGPU backend.
- `runtime/world-sandbox-camera.mjs` — pure orbit/walk projection math.
- `runtime/world-sandbox-cpu-backend.mjs` — CPU backend, particles/deposits, optional Canvas2D
  renderer.
- `runtime/world-sandbox-browser-backend.mjs` — WebGPU -> CPU render-backend policy for a canvas
  supplied by a client.
- `runtime/world-sandbox-runtime.mjs` — DOM-free controller: tools, stamps, environment, fixed
  stepping, stone/body physics, walk, day/night temperature, deterministic cause-chain.
- `integrations/world-sandbox-runtime.js` — exposes `window.SHADEDWorldSandbox`.

`window.SHADEDWorldSandbox` is capability, not UI. A caller may set tools, queue stamps, step,
walk, attach a canvas and read snapshots without any button or panel existing.

## One material truth

CPU classification (`classGrid`, `getMaterialTypeAt`) and GPU masks derive from the same canonical
analysis. Never introduce a second independent material classifier.

Canonical map palette:

- grass `#16A34A`
- foliage `#AA0EB7`
- roof `#F97316`
- path `#DC2626`
- wood `#854D0E`
- window `#0F766E`
- water `#06B6D4`
- rock `#475569`

`#F972E9` is a historical typo and only a tolerated legacy alias.

Providers may produce parameters, depth, geometry, shading or confidence. They do not silently
replace canonical material identity.

## Provenance

Observed and generated information remain distinguishable. Do not launder inferred/generated
content into observed data. Only OBSERVED may be corrected as observation; dependent generated
state is then recomputed.

## Runtime decomposition

"One truth" means one semantic contract/implementation, not one giant file. Split by
responsibility when boundaries become clearer. A new module replaces its old responsibility; do
not leave two active implementations of the same semantic role.

Runtime modules must not depend on production editor DOM. Rendering adapters may accept explicit
canvas/render targets as arguments.

## Actors

SWIFT-compatible actors are visual overlays and do not mutate `classGrid` or material truth.
Actor/world-state/emissive/depth extensions remain governed by the `window.SHADED.addActor`
contract and scene-project schema.

## Material/light separation

`window.SHADED.intrinsic` is the contract for intrinsic/light separation. Provider failure falls
back to identity-albedo behavior. Provider output does not create a second material classifier.

## Schemas and data contracts

Keep these stable and versioned:

- `contracts/shaded-scene-project.schema.json`
- `contracts/shaded-spatial-provider.schema.json`
- `contracts/shaded-style-profile.schema.json`
- `contracts/shaded-technique-registry.schema.json`

HTML IDs are not schemas.

## Verification

Before merging architecture/UI work:

```bash
npm run check
```

At minimum the UI-zero guard and DOM-free world-sandbox runtime tests must pass.

The guard must reject:

- restoration of the production `editor/` tree,
- reintroduction of authored interactive controls into `index.html`,
- service-worker caching of deleted editor assets,
- loss of runtime/headless/world-sandbox entry points.

## Legacy and donor rule

Deleted UI is still available in git history. Mine behavior from history only when a capability is
actually needed, then place that behavior behind a current contract. Do not resurrect old DOM to
avoid understanding the dependency.

The old prototype `gaime_shader_editor_pro_v2_6_bio_physics_edition.html` remains an ideas
reference only, not an active runtime source.
