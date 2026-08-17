// SHADED spatial presentation layer.
// The existing spatial-viewer remains the source of truth for reconstruction,
// navigation, collisions, camera and voxel edits. This module only renders the
// already-existing voxel surface mesh as actual triangles and adds coarse touch
// walking controls that call the existing collision-aware walkTo() API.

const viewer = document.getElementById('spatial-viewer');
const pointCanvas = document.getElementById('spatial-canvas');
const openButton = document.getElementById('btn-spatial-view');

if (viewer && pointCanvas && !document.getElementById('spatial-solid-canvas')) {
  const solidCanvas = document.createElement('canvas');
  solidCanvas.id = 'spatial-solid-canvas';
  solidCanvas.setAttribute('aria-hidden', 'true');
  solidCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;';
  pointCanvas.insertAdjacentElement('afterend', solidCanvas);

  const badge = document.createElement('div');
  badge.id = 'spatial-solid-badge';
  badge.textContent = 'VOXEL-SHELL · SOLID';
  badge.style.cssText = 'position:absolute;left:10px;top:10px;z-index:14;padding:5px 7px;border:1px solid rgba(148,163,184,.28);border-radius:5px;background:rgba(3,7,18,.66);color:#94a3b8;font:600 8px/1 ui-monospace,monospace;letter-spacing:.08em;pointer-events:none;';
  viewer.appendChild(badge);

  const gl = solidCanvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
  let program = null;
  let vao = null;
  let posBuffer = null;
  let colorBuffer = null;
  let indexBuffer = null;
  let indexCount = 0;
  let cachedRevision = -1;
  let cachedFloor = Number.NaN;

  const VS = `#version 300 es
    precision highp float;
    in vec3 a_position;
    in vec3 a_color;
    uniform mat4 u_matrix;
    out vec3 v_color;
    out vec3 v_world;
    void main(){
      v_color=a_color;
      v_world=a_position;
      gl_Position=u_matrix*vec4(a_position,1.0);
    }`;
  const FS = `#version 300 es
    precision highp float;
    in vec3 v_color;
    in vec3 v_world;
    out vec4 outColor;
    void main(){
      vec3 dx=dFdx(v_world),dy=dFdy(v_world);
      vec3 n=normalize(cross(dx,dy));
      float lambert=.36+.64*abs(dot(n,normalize(vec3(.42,.82,.37))));
      vec3 c=v_color*lambert;
      outColor=vec4(c,.96);
    }`;

  function shader(type, source) {
    const value = gl.createShader(type);
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
    return value;
  }

  function init() {
    if (!gl || program) return;
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    vao = gl.createVertexArray();
    posBuffer = gl.createBuffer();
    colorBuffer = gl.createBuffer();
    indexBuffer = gl.createBuffer();
  }

  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return out;
  }

  function cameraMatrix(camera, width, height) {
    const f = 1 / Math.tan(Math.PI / 6), aspect = width / Math.max(1, height);
    const projection = new Float32Array([f / aspect,0,0,0,0,f,0,0,0,0,-1.002,-1,0,0,-.2002,0]);
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
    const rotation = new Float32Array([cy,sy*sp,-sy*cp,0,0,cp,sp,0,sy,-cy*sp,cy*cp,0,0,0,0,1]);
    const translation = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,-camera.x,-camera.y,-camera.z,1]);
    return multiply(projection, multiply(rotation, translation));
  }

  function rebuildMesh(api, state) {
    const voxelState = api.voxel?.state?.();
    const revision = voxelState?.revision ?? -1;
    const floor = Number.isFinite(state?.floorY) ? state.floorY : -.25;
    if (revision === cachedRevision && floor === cachedFloor && indexCount) return;
    const mesh = api.voxel?.mesh?.();
    if (!mesh?.positions?.length || !mesh?.indices?.length) return;

    const positions = Array.from(mesh.positions);
    const colors = Array.from(mesh.colors);
    const indices = Array.from(mesh.indices);

    // Keep inferred/generated closure visibly distinct from observed surfaces.
    for (let vertex = 0; vertex < mesh.provenance.length; vertex++) {
      const provenance = mesh.provenance[vertex];
      if (provenance === 'GENERATED' || provenance === 'INFERRED' || provenance === 'RECONSTRUCTED') {
        const i = vertex * 3;
        colors[i] = colors[i] * .34 + .11;
        colors[i + 1] = colors[i + 1] * .38 + .13;
        colors[i + 2] = colors[i + 2] * .48 + .18;
      }
    }

    // Explicit ugly-but-solid generated walking floor. It is presentation geometry,
    // not claimed source geometry, and keeps the room readable at eye level.
    const base = positions.length / 3;
    positions.push(-.96,floor,-.96, .96,floor,-.96, .96,floor,.96, -.96,floor,.96);
    colors.push(.075,.085,.10, .075,.085,.10, .075,.085,.10, .075,.085,.10);
    indices.push(base,base+1,base+2, base,base+2,base+3);

    init();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    const pLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(pLoc);
    gl.vertexAttribPointer(pLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    const cLoc = gl.getAttribLocation(program, 'a_color');
    gl.enableVertexAttribArray(cLoc);
    gl.vertexAttribPointer(cLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    indexCount = indices.length;
    cachedRevision = revision;
    cachedFloor = floor;
    badge.textContent = `VOXEL-SHELL · ${Math.round(indexCount / 3).toLocaleString('de-DE')} △`;
  }

  function render() {
    requestAnimationFrame(render);
    if (!gl || viewer.hidden) return;
    const api = window.SHADED?.spatial;
    const state = api?.viewer?.state?.();
    if (!state?.camera) return;
    try { rebuildMesh(api, state); } catch (error) { badge.textContent = 'VOXEL-SHELL · FEHLER'; return; }
    if (!program || !indexCount) return;

    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(pointCanvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(pointCanvas.clientHeight * ratio));
    if (solidCanvas.width !== width || solidCanvas.height !== height) { solidCanvas.width = width; solidCanvas.height = height; }

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_matrix'), false, cameraMatrix(state.camera, width, height));
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
  }
  requestAnimationFrame(render);

  // A phone has no WASD. These controls feed targets into the existing Dijkstra/
  // collision-aware walkTo path instead of teleporting the camera through geometry.
  const pad = document.createElement('div');
  pad.id = 'spatial-touch-walk';
  pad.innerHTML = `
    <button type="button" data-step="forward" aria-label="Vorwärts">▲</button>
    <button type="button" data-step="left" aria-label="Links">◀</button>
    <button type="button" data-step="stop" aria-label="Stopp">•</button>
    <button type="button" data-step="right" aria-label="Rechts">▶</button>
    <button type="button" data-step="back" aria-label="Rückwärts">▼</button>`;
  pad.style.cssText = 'position:absolute;left:10px;bottom:66px;z-index:16;display:grid;grid-template-columns:repeat(3,42px);grid-template-areas:". f ." "l s r" ". b .";gap:4px;touch-action:none;';
  const area = { forward:'f',left:'l',stop:'s',right:'r',back:'b' };
  pad.querySelectorAll('button').forEach(button => {
    button.style.cssText = `grid-area:${area[button.dataset.step]};width:42px;height:42px;min-height:42px;padding:0;border:1px solid rgba(148,163,184,.36);border-radius:10px;background:rgba(3,7,18,.76);color:#e2e8f0;font:700 18px/1 system-ui;backdrop-filter:blur(8px);`;
  });
  viewer.appendChild(pad);

  let held = null, heldTimer = 0;
  function step(direction) {
    const api = window.SHADED?.spatial?.viewer;
    const state = api?.state?.();
    if (!state?.camera || state.mode !== 'walk') return;
    const camera = state.camera;
    if (direction === 'stop') { api.walkTo(camera.x, camera.z); return; }
    const yaw = camera.yaw, amount = .32;
    const forward = [Math.sin(yaw), -Math.cos(yaw)];
    const right = [Math.cos(yaw), Math.sin(yaw)];
    let dx = 0, dz = 0;
    if (direction === 'forward') [dx,dz] = forward;
    if (direction === 'back') [dx,dz] = [-forward[0],-forward[1]];
    if (direction === 'right') [dx,dz] = right;
    if (direction === 'left') [dx,dz] = [-right[0],-right[1]];
    api.walkTo(camera.x + dx * amount, camera.z + dz * amount);
  }
  function stopHeld() { held = null; clearInterval(heldTimer); heldTimer = 0; }
  pad.addEventListener('pointerdown', event => {
    const button = event.target.closest('button[data-step]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    held = button.dataset.step; step(held);
    if (held !== 'stop') heldTimer = setInterval(() => held && step(held), 170);
  });
  pad.addEventListener('pointerup', stopHeld);
  pad.addEventListener('pointercancel', stopHeld);
  pad.addEventListener('pointerleave', stopHeld);

  const style = document.createElement('style');
  style.textContent = `
    #spatial-solid-canvas{mix-blend-mode:normal}
    @media (pointer:fine){#spatial-touch-walk{display:none!important}}
    @media (max-width:720px){
      #spatial-solid-badge{top:10px!important;left:10px!important}
      #spatial-touch-walk{display:grid!important}
    }
  `;
  document.head.appendChild(style);

  // RAUM means enter the room. Orbit remains available via the existing toggle.
  openButton?.addEventListener('click', () => {
    setTimeout(() => {
      try { window.SHADED?.spatial?.viewer?.setMode?.('walk'); } catch {}
    }, 0);
  });
}
