# SHADED orchestration contract

Orchestration is a caller of the real engine. It is not a second engine and it is not UI
automation.

## Browser surface

`index.html` loads `integrations/headless-orchestrator.js`, which creates:

```js
window.SHADED_ORCHESTRATOR
```

The bridge is built from `integrations/scene-runtime-facade.js` and delegates to the canonical
`window.SHADED` API.

## Public methods

- `loadProject(project, assets)`
- `exportProject()`
- `addActorBundle(sheetFile, manifestFile, opts)`
- `getRuntimeStatus()`
- `getDebugSnapshot()`
- `isReady()`

These methods are intentionally presentation-independent.

## Scene project boundary

Structural state is carried by `shaded.scene-project/v1`
(`contracts/shaded-scene-project.schema.json`).

Binary/image assets remain out-of-band:

- scene image,
- material/marker image,
- actor sprite sheet,
- actor manifest,
- intrinsic shading image.

A JSON project does not pretend to contain image bytes it does not contain.

## Bridge rule

An orchestration step may call a real public method. It may not:

- click a hidden button,
- rely on an editor selector,
- mutate old panel DOM,
- duplicate shader/material logic,
- invent a parallel scene state.

If a needed capability is absent, add a named runtime contract first.

## World Sandbox

World Sandbox orchestration is separate from scene orchestration and exposed as:

```js
window.SHADEDWorldSandbox
```

See `docs/ENTRYPOINTS_AND_CONTRACTS.md` for its lifecycle, tool, walk, stepping and canvas-attach
contracts.

## End-to-end proof

Headless/browser workflows should wait for the relevant global contract, invoke it directly and
verify returned state/output. Browser automation is for proving the real browser runtime, not for
simulating clicks on presentation chrome.
