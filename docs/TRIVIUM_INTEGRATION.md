# SHADED ↔ TRIVIUM Integration Contract

## Role

TRIVIUM defines what a world state means. SHADED projects that meaning into perceivable and reactive world behavior.

SHADED is not merely a visual post-process target. It is the first proof that one high-level state can drive materials, weather, traces, actors, atmosphere and delayed consequences without scene-specific animation.

## Input contract

SHADED should consume semantic axes and world obligations rather than engine-specific effect toggles.

```yaml
state:
  stress: 0.82
  stability: 0.31
  precipitation: 0.4
projection_requirements:
  - corridor_edges_disintegrate
  - ash_drift_follows_wind
  - audio_reverb_widens
  - traversability_changes_below_threshold
```

The adapter decides whether the realization uses shader parameters, field data, generated geometry, particles, audio or engine hooks.

## Shader-first and field-first

A shader may provide the visible projection, but visual deformation alone is insufficient when the contract requires geometry, collision, navigation, actors or audio to follow.

Preferred model:

```text
canonical world/field state
├── visual shader projection
├── geometry realization
├── collision realization
├── navigation realization
├── particles and traces
└── audio/haptic projection
```

Each channel may be native, bridged, approximated or preserved for later realization. A vertex-only illusion must never be reported as physical deformation.

## Perception profiles

SHADED should support more than vision. A world may be primarily projected through:

- spatial audio
- language and timing
- haptics
- light and gesture
- texture/material response
- 2D, 2.5D, 3D, ASCII or other representational modes

This enables blind-playable, deaf-centered and deliberately unfamiliar perception grammars without treating accessibility as a late overlay.

## Evidence

For every TRIVIUM-driven projection, SHADED should expose:

- parameter/state snapshot
- runtime trace of applied laws
- screenshots or recordings where relevant
- state transition evidence
- explicit declaration of visual-only versus physically coupled behavior

## Boundaries

SHADED does not:

- define canonical world meaning
- select source assets
- claim collision/navigation changes it did not perform
- replace TRIVIUM's loss ledger

## Canonical references

- TRIVIUM architecture: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/architecture-v1.1.md
- Realization contracts: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/realization-contracts.md
- WIR specification: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/wir-spec.md
