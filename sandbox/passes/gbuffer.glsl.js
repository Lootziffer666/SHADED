// SHADED Style Discovery Sandbox — Pass 1: Material/G-Buffer (stilfrei).
//
// Raymarcht die Benchmark-Szene (SDF-Vereinigung) in einen G-Buffer. Kennt
// NUR MaterialResponse-Werte (baseColor/roughness/reflectance/emission/
// damage/normal/curvature/worldPos), keinerlei Stil-Uniform. Die
// zusätzlichen semantischen MaterialResponse-Kanäle (Nässe, Ruß, Risse,
// Frost, Schnee, Rost, Hitze, Feuer …) werden NICHT in den G-Buffer gepackt
// — sie erreichen den Style-Pass als indizierte Uniform-Tabelle
// (u_primWetness[i] usw. in style.glsl.js), siehe docs/STYLE_DISCOVERY.md
// „Korrektur 1". Das hält den G-Buffer bei den WebGL2-garantierten
// mindestens 4 Farb-Attachments (G0..G3) plus einer echten Tiefentextur.

export const FULLSCREEN_VERTEX_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const MAX_PRIMS = 10;

export const GBUFFER_FRAGMENT_SRC = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
layout(location = 0) out vec4 outG0; // baseColor.rgb, matIndexNorm (1.0 = kein Treffer)
layout(location = 1) out vec4 outG1; // normal.xyz*0.5+0.5, roughness
layout(location = 2) out vec4 outG2; // reflectance, emission, damage, curvature
layout(location = 3) out vec4 outG3; // worldPos codiert (*0.06+0.5), unbenutzt.a

uniform vec2 u_resolution;
uniform vec3 u_camPos;
uniform mat3 u_camBasis;
uniform float u_camFov;
uniform int u_maxSteps;
uniform int u_primCount;

#define MAX_PRIMS ${MAX_PRIMS}
uniform int u_primType[MAX_PRIMS];
uniform vec3 u_primCenter[MAX_PRIMS];
uniform vec4 u_primParams[MAX_PRIMS];
uniform vec3 u_primBaseColor[MAX_PRIMS];
uniform float u_primRoughness[MAX_PRIMS];
uniform float u_primReflectance[MAX_PRIMS];
uniform float u_primEmission[MAX_PRIMS];
uniform float u_primDamage[MAX_PRIMS];

float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  float m = p.x + p.y + p.z - s;
  vec3 q;
  if (3.0 * p.x < m) q = p.xyz;
  else if (3.0 * p.y < m) q = p.yzx;
  else if (3.0 * p.z < m) q = p.zxy;
  else return m * 0.57735027;
  float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return length(vec3(q.x, q.y - s + k, q.z - k));
}
float sdCapsule(vec3 p, float h, float r) {
  p.y -= clamp(p.y, -h, h);
  return length(p) - r;
}

float primDist(int i, vec3 p) {
  vec3 lp = p - u_primCenter[i];
  int t = u_primType[i];
  vec4 pr = u_primParams[i];
  if (t == 0) return sdSphere(lp, pr.x);
  if (t == 1) return sdBox(lp, pr.xyz);
  if (t == 2) return sdTorus(lp, pr.xy);
  if (t == 3) return sdOctahedron(lp, pr.x);
  return sdCapsule(lp, pr.x, pr.y);
}

vec2 mapScene(vec3 p) {
  float d = 1.0e5;
  float mi = 0.0;
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i >= u_primCount) break;
    float di = primDist(i, p);
    if (di < d) { d = di; mi = float(i); }
  }
  return vec2(d, mi);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.0006;
  return normalize(
    e.xyy * mapScene(p + e.xyy).x +
    e.yyx * mapScene(p + e.yyx).x +
    e.yxy * mapScene(p + e.yxy).x +
    e.xxx * mapScene(p + e.xxx).x);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec3 rd = normalize(u_camBasis * normalize(vec3(ndc.x * aspect * u_camFov, ndc.y * u_camFov, -1.0)));
  vec3 ro = u_camPos;

  float t = 0.0;
  float matIndex = 0.0;
  vec3 pos = ro;
  bool hit = false;
  int steps = clamp(u_maxSteps, 8, 128);
  for (int i = 0; i < 128; i++) {
    if (i >= steps) break;
    pos = ro + rd * t;
    vec2 res = mapScene(pos);
    if (res.x < 0.0009) { hit = true; matIndex = res.y; break; }
    t += max(res.x, 0.0008);
    if (t > 40.0) break;
  }

  if (!hit) {
    outG0 = vec4(0.05, 0.07, 0.10, 1.0); // Sentinel: matIndexNorm == 1.0 => Himmel/kein Treffer
    outG1 = vec4(0.5, 0.5, 1.0, 1.0);
    outG2 = vec4(0.0, 0.0, 0.0, 0.0);
    outG3 = vec4(0.5, 0.5, 0.5, 0.0);
    gl_FragDepth = 1.0;
    return;
  }

  int mi = int(matIndex + 0.5);
  vec3 n = calcNormal(pos);
  vec3 n2 = calcNormal(pos + n * 0.03);
  float curvature = clamp(length(n2 - n) * 4.0, 0.0, 1.0);
  float matIdxNorm = (float(mi) + 0.5) / float(MAX_PRIMS);

  outG0 = vec4(u_primBaseColor[mi], matIdxNorm);
  outG1 = vec4(n * 0.5 + 0.5, u_primRoughness[mi]);
  outG2 = vec4(u_primReflectance[mi], u_primEmission[mi], u_primDamage[mi], curvature);
  outG3 = vec4(clamp(pos * 0.06 + 0.5, 0.0, 1.0), 0.0);
  gl_FragDepth = clamp(t / 40.0, 0.0, 1.0);
}
`;
