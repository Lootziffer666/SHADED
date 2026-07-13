# SHADED ↔ LAB

Load `integrations/lab-runtime.js` after `index.html` has created `window.SHADED`. LAB uses only SHADED's stable public API: `erstellen`, `applyAct`, `setParams`, `setTime`, `isReady`, and `addActor`.

```html
<script src="integrations/lab-runtime.js"></script>
<script>
  const result = await SHADED_LAB.apply({
    schemaVersion: "1.0.0",
    module: "trivium-lab",
    scene: { act: "sturmnacht", params: { rain: 1, wet: 1 }, time: 21.7 },
    actors: [{ image: "hero.png", manifest: "hero_manifest.json", x: 0.5, y: 0.7 }]
  });
</script>
```

LAB does not replace SHADED's image analysis. The background, optional correction overlay and optional depth map must be loaded through SHADED itself. Actors remain visual overlays and never alter `classGrid` or material truth.
