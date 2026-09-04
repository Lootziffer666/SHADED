# UI ZERO — branch constitution

Branch: `architecture/ui-zero-contracts`

## Purpose

Remove the accumulated editor presentation from the running application long enough to expose the actual engine boundaries. A broken/absent authoring UI is preferable to preserving accidental DOM contracts.

## Hard rules

1. `index.html` is a **runtime host**, not an editor composition.
2. No legacy World Studio, topbar/rail/inspector shell, drawer or hidden legacy panel is loaded by the host.
3. `display:none` is not a migration strategy. Hidden presentation elements are not kept as API adapters.
4. Code that needs an action receives a function/API/event. It does not receive a fake visible button, a hidden button or a selector to an old panel.
5. Runtime code may temporarily create internal compatibility stubs while it is decomposed, but no new code may depend on those stubs as a public contract.
6. New UI work starts from contracts in `docs/ENTRYPOINTS_AND_CONTRACTS.md`, not by re-enabling quarantined modules.
7. `editor/world-sandbox.js` is not reattached until simulation/controller behavior is separable from its current DOM host requirements.
8. Legacy UI files can be mined for useful behavior, then the behavior is moved behind a contract. Their markup/CSS structure has no preservation value.

## What must remain alive while the UI is gone

- `window.SHADED`
- canonical material/classification truth
- scene load/create APIs
- actor/intrinsic/story contracts
- headless `window.SHADED_ORCHESTRATOR`
- provider/schema contracts
- solver and WebGPU/reference simulation modules and their tests

## Definition of done for the next UI

The replacement UI is allowed to exist only when every control can be described as:

> user gesture → named contract call → state/result → render

and not:

> user gesture → DOM element expected by old code → side effect nobody can name.

Run `node tools/verify-no-legacy-ui.mjs` before merging UI work.
