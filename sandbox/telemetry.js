// SHADED Style Discovery Sandbox — Telemetry (nur Expertenpanel).
//
// Reines Datenmodul: sammelt FPS/Frametime/Renderauflösung/aktives Budget/
// aktives Profil/aktive Primitiven/Drawcalls/Raymarch-Steps. Kein DOM-Zugriff.

export function createTelemetry() {
  const state = {
    fps: 0, frameMs: 0, renderWidth: 0, renderHeight: 0,
    budgetTier: 'FULL', styleProfileId: '', primitiveCount: 0,
    drawCalls: 0, raymarchSteps: 0,
    frameCount: 0, windowStart: 0,
  };

  function beginFrame(nowMs) {
    if (state.windowStart === 0) state.windowStart = nowMs;
    state._frameStart = nowMs;
  }

  function endFrame(nowMs) {
    state.frameMs = nowMs - state._frameStart;
    state.frameCount += 1;
    const elapsed = nowMs - state.windowStart;
    if (elapsed >= 500) {
      state.fps = (state.frameCount / elapsed) * 1000;
      state.frameCount = 0;
      state.windowStart = nowMs;
    }
  }

  function setRenderSize(w, h) { state.renderWidth = w; state.renderHeight = h; }
  function setBudgetTier(tier) { state.budgetTier = tier; }
  function setStyleProfileId(id) { state.styleProfileId = id; }
  function setPrimitiveCount(n) { state.primitiveCount = n; }
  function setDrawCalls(n) { state.drawCalls = n; }
  function setRaymarchSteps(n) { state.raymarchSteps = n; }

  function snapshot() {
    return {
      fps: Math.round(state.fps * 10) / 10,
      frameMs: Math.round(state.frameMs * 100) / 100,
      renderWidth: state.renderWidth, renderHeight: state.renderHeight,
      budgetTier: state.budgetTier, styleProfileId: state.styleProfileId,
      primitiveCount: state.primitiveCount, drawCalls: state.drawCalls,
      raymarchSteps: state.raymarchSteps,
    };
  }

  return { beginFrame, endFrame, setRenderSize, setBudgetTier, setStyleProfileId, setPrimitiveCount, setDrawCalls, setRaymarchSteps, snapshot };
}
