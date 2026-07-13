/* LAB runtime adapter for SHADED's stable public browser API. */
(function attachLabRuntime(global) {
  "use strict";

  const VERSION = "1.0.0";
  const handles = new Set();

  function requireApi() {
    const api = global.SHADED;
    if (!api) throw new Error("SHADED_LAB: window.SHADED is unavailable");
    for (const name of ["erstellen", "applyAct", "setParams", "setTime", "isReady", "addActor"]) {
      if (typeof api[name] !== "function") throw new Error(`SHADED_LAB: missing SHADED.${name}()`);
    }
    return api;
  }

  async function waitUntilReady(api, timeoutMs) {
    const started = Date.now();
    while (!api.isReady()) {
      if (Date.now() - started > timeoutMs) throw new Error("SHADED_LAB: scene analysis timed out");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function loadManifest(value) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string" || !value.trim()) throw new Error("SHADED_LAB: actor manifest is required");
    const response = await fetch(value);
    if (!response.ok) throw new Error(`SHADED_LAB: manifest fetch failed (${response.status})`);
    return response.json();
  }

  async function addActor(api, actor) {
    const manifest = await loadManifest(actor.manifest);
    const handle = api.addActor({
      image: actor.image,
      manifest,
      depthImage: actor.depthImage || undefined,
      x: actor.x == null ? 0.5 : actor.x,
      y: actor.y == null ? 0.5 : actor.y,
      scale: actor.scale == null ? 1 : actor.scale,
      anim: actor.anim || Object.keys(manifest.animations || {})[0] || "idle",
      depthLayer: actor.depthLayer || "mid",
    });
    handles.add(handle);
    return handle;
  }

  async function apply(bundle, options) {
    const api = requireApi();
    const config = options || {};
    if (!bundle || bundle.schemaVersion !== VERSION) throw new Error(`SHADED_LAB: bundle.schemaVersion must be ${VERSION}`);
    if (bundle.module !== "trivium-lab") throw new Error("SHADED_LAB: bundle.module must be trivium-lab");

    if (!api.isReady()) {
      if (config.autoCreate === false) throw new Error("SHADED_LAB: load the scene and call SHADED.erstellen() first");
      api.erstellen();
      await waitUntilReady(api, config.timeoutMs || 15000);
    }

    const scene = bundle.scene || {};
    if (scene.act) api.applyAct(scene.act);
    if (scene.params && Object.keys(scene.params).length) api.setParams(scene.params);
    if (typeof scene.time === "number") api.setTime(scene.time, scene.freezeTime !== false);

    const actorHandles = [];
    for (const actor of bundle.actors || []) actorHandles.push(await addActor(api, actor));
    return {
      status: "success",
      sceneReady: api.isReady(),
      actors: actorHandles,
      warnings: bundle.warnings || [],
    };
  }

  function removeAllActors() {
    for (const handle of handles) {
      try { if (handle && typeof handle.remove === "function") handle.remove(); } catch (_) {}
    }
    handles.clear();
  }

  global.SHADED_LAB = Object.freeze({ VERSION, apply, removeAllActors });
})(window);
