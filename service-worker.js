const CACHE_NAME = "shaded-shell-v25";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/assets/icon.svg",
  "/assets/icon-maskable.svg",
  "/editor/editor.css?v=9",
  "/editor/viewport-first.css?v=8",
  "/editor/drawer-handle.css?v=3",
  "/editor/world-studio.css?v=4",
  "/editor/world-studio-shell.css?v=2",
  "/editor/world-studio-imports.css?v=1",
  "/editor/engine-shell.css?v=3",
  "/editor/world-sandbox.css?v=1",
  "/editor/app.js?v=9",
  "/editor/world-room-gate.js?v=2",
  "/editor/ui-shell.js?v=10",
  "/editor/ux-fixes.js?v=10",
  "/editor/drawer-handle.js?v=4",
  "/editor/world-studio.js?v=5",
  "/editor/world-studio-bridge-settings.js?v=1",
  "/editor/material-preview-live.js?v=1",
  "/editor/world-studio-expert.js?v=2",
  "/editor/world-sandbox.js?v=1",
  "/runtime/world-sandbox-reference.mjs",
  "/runtime/world-sandbox-webgpu.mjs",
  "/runtime/install.js",
  "/runtime/spatial-solid-runtime.js",
  "/runtime/dialogue-engine.mjs",
  "/runtime/actor-bridge.mjs",
  "/runtime/weather-particles.mjs",
  "/runtime/player-fire.mjs",
  "/runtime/spatial-viewer.js",
  "/editor/themes/theia-dark.css?v=3",
  "/editor/themes/eclipse-dark.css?v=3",
  "/editor/themes/eclipse-light.css?v=3",
  "/editor/themes/eclipse-dark-legacy.css?v=1",
  "/editor/themes/theia-light.css?v=1",
  "/editor/themes/daylerees.css?v=1",
  "/editor/workspace-extra-themes.css?v=1",
  "/editor/world-studio-pro.css?v=2",
  "/editor/world-studio-pro.js?v=3",
  "/editor/editor.css?v=3",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = req.mode === "navigate";
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .catch(() => caches.match(req))
        .then((response) => response || caches.match("/")),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
