# UI ZERO — branch constitution

Branch: `architecture/ui-zero-contracts`

## Purpose

The old production/editor UI is deleted. This branch exists to make runtime boundaries real before
any new authoring surface is built.

A few hours with no UI is cheaper than another year of hidden DOM acting as architecture.

## Hard rules

1. `index.html` is a runtime host, not an editor composition.
2. The production `editor/` tree does not exist on this branch.
3. `display:none`, hidden controls and transparent compatibility buttons are not migration tools.
4. Runtime capability must be callable without authored DOM.
5. A future UI calls named contracts; runtime never searches for the UI.
6. `window.SHADED`, `window.SHADED_ORCHESTRATOR` and `window.SHADEDWorldSandbox` are the browser
   contract surfaces.
7. An explicit canvas/render target may be passed to a renderer. A selector for a legacy canvas
   may not be baked into runtime code.
8. Input adapters may translate keyboard/pointer/touch/gamepad events into runtime calls. The
   runtime does not install presentation event listeners.
9. Deleted UI may be mined from git history for behavior only. Copying its DOM/CSS structure back
   into production is prohibited.
10. Solver/research labs are separate development artifacts and are not production UI.

## World Sandbox result

`editor/world-sandbox.js` is gone.

Its useful pieces now live behind:

- `runtime/world-sandbox-runtime.mjs`
- `runtime/world-sandbox-cpu-backend.mjs`
- `runtime/world-sandbox-camera.mjs`
- `runtime/world-sandbox-browser-backend.mjs`
- `runtime/world-sandbox-reference.mjs`
- `runtime/world-sandbox-webgpu.mjs`
- `integrations/world-sandbox-runtime.js`

The old file's panel/HUD/rail/DOM event plumbing was intentionally not migrated.

## Definition of done for a future UI

Every control must have a sentence of this shape:

> This gesture calls `<contract method>` with `<data>`, observes `<state/result>`, then renders
> `<presentation>`.

If the sentence instead contains "find this old element", "click this hidden button" or "toggle
this legacy class", the design fails.

## Guard

Run:

```bash
npm run check
```

`tools/verify-no-legacy-ui.mjs` rejects restoration of the deleted production editor tree and
authored controls in the runtime host.
