# CLAUDE.md — SHADED canonical project rules

This file is the current architecture contract. Older specs, research notes and git history are
evidence and donors; when they conflict with this file or `docs/ENTRYPOINTS_AND_CONTRACTS.md`,
the current contract wins.

## Status: two subsystems, one repo (read this first)

`index.html` currently boots `/src/main.js` — **Snowflow**, a WebGPU-only Babylon.js world-sandbox
game (terrain, sand/water/weather tools, character, camera rig) — not the `runtime/*.mjs` chain
described below. This has been true since commit `ec32657` ("Drop in Snowflow as SHADED's runtime
appearance (1:1 import)"). Concretely, on the page a browser actually loads today:

- `window.SHADED`, `window.SHADED_ORCHESTRATOR` and `window.SHADEDWorldSandbox` do **not** exist —
  `src/main.js` creates none of them.
- `service-worker.js` is not registered by `index.html` and caches files that are not the ones
  served.

The **"Canonical browser entry point" / "Stable public engine contract" / "World Sandbox contract"**
sections below describe a real, still-present, still-internally-consistent subsystem
(`runtime/*.mjs` + `integrations/*.js`, the original image-to-world SHADED engine with its own
tests) — it is just **not reachable from `index.html` right now**. Do not "fix" it expecting the
browser to show the result, and do not delete it: it is parked, not dead. Treat any contract claim
below as "true of that parked subsystem," not "true of the page you get from a browser."

The world-sandbox game that `index.html` actually serves (`src/sandbox/*`, `src/terrain/*`,
`src/shaders/*`) is governed by a separate, current set of concept documents at the repo root —
**`WORLD_ARCHITECTURE.md`, `WORLD_KERNEL.md`, `DONORS.md`, `VEGETATION.md`, `SHADER_IR.md`,
`HYDROLOGY.md`, `PHYSICS.md`, `HABITATS.md`, `GAMEPLAY.md`, `STUDIO.md`, `STATE.md`,
`MATERIALS.md`** — written by the maintainer directly, and current for that subsystem. They are not
gated by the invariants below (`WORLD_ARCHITECTURE.md` says so explicitly: "Kein Claude.md. Die
Richtung gibt der Nutzer vor."). This file's rules keep governing the parked `runtime/*.mjs`
subsystem and the repo-wide provenance/contracts hygiene sections further down.

Note on `STUDIO.md` specifically: it proposes a new Editor+iframe+postMessage-protocol
architecture for the Snowflow/world-sandbox line. That is not a regression of this file's UI-zero
section (below) — UI-zero is a rule about the parked `runtime/*.mjs` engine and today's actual
`index.html`, not a permanent ban on ever building an editor for the Snowflow line, which is a
separate product `STUDIO.md` is free to design on its own terms.

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

## Canonical browser entry point (parked subsystem — see status note above)

`index.html` does not currently boot this chain; it boots `/src/main.js` (Snowflow). This section
describes the parked SHADED image-to-world engine's own internal contract, preserved for headless
use, tests and a future re-integration decision:

- `runtime/shaded-engine.mjs`
- `runtime/dialogue-engine.mjs`
- `runtime/actor-bridge.mjs`
- `runtime/weather-particles.mjs`
- `runtime/player-fire.mjs`
- `integrations/headless-orchestrator.js`
- `integrations/world-sandbox-runtime.js`

The runtime creates only the render substrate it requires. Authored editor controls do not belong
in the host.

## Stable public engine contract (parked subsystem)

`window.SHADED` is a contract for tests, integrations and agents of the parked engine — it does not
exist on the page `index.html` currently serves (see status note above). Existing contract names
are not renamed casually.

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

## World Sandbox contract (parked subsystem — not the sandbox `index.html` serves)

This is the `runtime/world-sandbox-*` decomposition and its `window.SHADEDWorldSandbox` bridge —
the parked engine's own world sandbox, unrelated to and not exposed by the live Snowflow sandbox in
`src/sandbox/*` (see status note above and `WORLD_ARCHITECTURE.md`/`WORLD_KERNEL.md` for that one).

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
- service-worker/docs caching or referencing deleted editor assets,
- deletion of the parked `runtime/*.mjs`/`integrations/*.js` engine files (they stay on disk even
  while unreachable from `index.html`; see status note above).

## Legacy and donor rule

Deleted UI is still available in git history. Mine behavior from history only when a capability is
actually needed, then place that behavior behind a current contract. Do not resurrect old DOM to
avoid understanding the dependency.

The old prototype `gaime_shader_editor_pro_v2_6_bio_physics_edition.html` remains an ideas
reference only, not an active runtime source.
