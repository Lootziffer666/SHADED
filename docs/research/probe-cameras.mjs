// probe-cameras.mjs — Canonical probe views for post-GOLD experiments.
// Derived from tools/verify.js canonical views + docs/bildkanon.md K1-K8.
export const PROBE_CAMERAS = {
  version: "1.0",
  cameras: [
    { id: "K1-building", scene: "file_00000000974871f49fe71f6b456f9579.png", sceneId: "dorf-marker", purpose: "Fachwerk building facade", camera: { fov: 60, pose: { x: 0, y: 2, z: 5 } } },
    { id: "K2-ground", scene: "file_00000000974871f49fe71f6b456f9579.png", sceneId: "dorf-marker", purpose: "Ground continuity", camera: { fov: 60, pose: { x: 0, y: 0.5, z: 3 } } },
    { id: "K3-canopy", scene: "file_00000000974871f49fe71f6b456f9579.png", sceneId: "dorf-marker", purpose: "Tree/sky boundary", camera: { fov: 60, pose: { x: 5, y: 4, z: 3, yaw: -30 } } },
    { id: "K-sky", scene: "file_00000000c40471f4859a10d6bf3ac39b.png", sceneId: "dorf-kanon", purpose: "Sky inert rule", camera: { fov: 60, pose: { x: 0, y: 10, z: 0, pitch: -90 } } },
    { id: "storm-night", scene: "file_00000000b27471f4a8aeb27484b46720.png", sceneId: "sturmnacht", purpose: "Night rendering", camera: { fov: 60, pose: { x: 0, y: 1.5, z: 5 } } },
    { id: "day-after", scene: "file_00000000fbc472438dcc92aff24bed6e.png", sceneId: "danach", purpose: "Recovery rendering", camera: { fov: 60, pose: { x: 0, y: 1.5, z: 5 } } }
  ],
  meta: { derivedFrom: "verify.js + bildkanon.md K1-K8", gOldCommit: "b341f7f" }
};
