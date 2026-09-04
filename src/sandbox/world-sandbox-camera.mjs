// Pure camera/projection math extracted from the former editor/world-sandbox.js.
// No DOM, events, canvas ownership or UI state lives here.

export const WALK_NEAR = 0.006;
export const WALK_FOV_TAN = 0.62;

export const DEFAULT_CAMERA = Object.freeze({
  yaw: -0.68,
  pitch: 0.76,
  zoom: 1.34,
  verticalScale: 1.55,
  targetY: 0.29,
});

export const DEFAULT_WALK = Object.freeze({
  active: false,
  x: 0.5,
  z: 0.62,
  yaw: 0,
  pitch: 0.06,
  eyeY: 0.09,
  vx: 0,
  vz: 0,
});

// Shared by cameraBasis/walkBasis: both cameras (orbit and walk) build an
// orthonormal forward/right/up frame from nothing but yaw+pitch.
function basisFromYawPitch(yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  const forward = [
    Math.sin(yaw) * cosPitch,
    -Math.sin(pitch),
    Math.cos(yaw) * cosPitch,
  ];
  const rightLength = Math.hypot(forward[2], forward[0]) || 1;
  const right = [forward[2] / rightLength, 0, -forward[0] / rightLength];
  const up = [
    forward[1] * right[2],
    forward[2] * right[0] - forward[0] * right[2],
    -forward[1] * right[0],
  ];
  return {forward, right, up};
}

export function cameraBasis(camera = DEFAULT_CAMERA) {
  return basisFromYawPitch(camera.yaw, camera.pitch);
}

export function walkBasis(walk = DEFAULT_WALK) {
  return basisFromYawPitch(walk.yaw, walk.pitch);
}

export function projectWorld(world, width, height, camera = DEFAULT_CAMERA) {
  const {forward, right, up} = cameraBasis(camera);
  const delta = [world[0], world[1] - camera.targetY, world[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const aspect = width / Math.max(1, height);
  const ndcX = dot(delta, right) / Math.max(0.2, camera.zoom * aspect);
  const ndcY = dot(delta, up) / Math.max(0.55, camera.zoom);
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    depth: dot(delta, forward),
  };
}

export function projectWalk(world, width, height, walk = DEFAULT_WALK) {
  const {forward, right, up} = walkBasis(walk);
  const eye = [walk.x * 2 - 1, walk.eyeY, walk.z * 2 - 1];
  const delta = [world[0] - eye[0], world[1] - eye[1], world[2] - eye[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const aspect = width / Math.max(1, height);
  const viewX = dot(delta, right);
  const viewY = dot(delta, up);
  const clipZ = Math.max(dot(delta, forward), WALK_NEAR);
  return {
    x: (viewX / (WALK_FOV_TAN * aspect * clipZ) * 0.5 + 0.5) * width,
    y: (0.5 - viewY / (WALK_FOV_TAN * clipZ) * 0.5) * height,
    depth: clipZ,
  };
}

export function screenToWorld(clientX, clientY, bounds, camera = DEFAULT_CAMERA) {
  const aspect = bounds.width / Math.max(1, bounds.height);
  const ndcX = ((clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
  const ndcY = 1 - ((clientY - bounds.top) / Math.max(1, bounds.height)) * 2;
  const {forward, right, up} = cameraBasis(camera);
  const viewX = ndcX * camera.zoom * aspect;
  const viewY = ndcY * camera.zoom;
  const line = [
    right[0] * viewX + up[0] * viewY,
    camera.targetY + right[1] * viewX + up[1] * viewY,
    right[2] * viewX + up[2] * viewY,
  ];
  const distance = Math.abs(forward[1]) > 1e-5
    ? (camera.targetY - line[1]) / forward[1]
    : 0;
  return {
    x: Math.max(0, Math.min(1, (line[0] + forward[0] * distance) * 0.5 + 0.5)),
    z: Math.max(0, Math.min(1, (line[2] + forward[2] * distance) * 0.5 + 0.5)),
  };
}

export function clampCamera(camera = DEFAULT_CAMERA) {
  return {
    ...camera,
    pitch: Math.max(0.42, Math.min(1.18, camera.pitch)),
    zoom: Math.max(0.72, Math.min(2.35, camera.zoom)),
  };
}

export function clampWalkLook(walk = DEFAULT_WALK) {
  return {...walk, pitch: Math.max(-0.95, Math.min(0.95, walk.pitch))};
}
