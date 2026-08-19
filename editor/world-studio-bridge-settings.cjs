// Adds the authored World Studio settings to the local /api/generate request without
// duplicating the studio state machine. The studio stays the UI truth; the bridge gets
// enough information to bake the same boundary/material/sky choices into world artefacts.
const nativeFetch = window.fetch.bind(window);
const RADII = { compact: 6, room: 12, wide: 24 };

window.fetch = async function shadedWorldFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || '';
  let nextInit = init;
  if (url.includes('/api/generate') && typeof init.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      const state = window.SHADEDWorldStudio?.state?.();
      const world = document.getElementById('world-size')?.value || 'room';
      const sun = Number(document.getElementById('world-sun')?.value ?? 0.62);
      const material = state?.material || {};
      payload.boundaryRadius = RADII[world] || 12;
      payload.materialPreset = state?.selectedMaterial || 'neutral';
      payload.skyPreset = state?.selectedSky || 'golden';
      payload.sunElevation = sun;
      payload.mirrorThickness = 0.018 + Number(material.height ?? 0.35) * 0.075;
      payload.mirrorRelief = 0.035 + Number(material.height ?? 0.35) * 0.22;
      payload.textureBlend = Math.max(0.45, Math.min(0.95, 0.58 + (1 - Number(material.roughness ?? 0.48)) * 0.32));
      nextInit = { ...init, body: JSON.stringify(payload) };
    } catch {
      // A malformed request should be handled by the bridge itself, not hidden here.
    }
  }

  const response = await nativeFetch(input, nextInit);
  if (url.includes('/api/generate') && response.ok) {
    response.clone().json().then(result => {
      if (result?.artefacts) window.SHADEDWorldArtefacts = result.artefacts;
    }).catch(() => {});
  }
  return response;
};
