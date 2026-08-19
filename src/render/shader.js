// SHADED Render Pipeline — Core shader modules extracted from monolithic index.html
// This replaces the single-file shader with a proper multi-pass render graph

export const SHADER_VERSION = '2.0.0';

// --- Uniforms that must be bound each frame ---
export const REQUIRED_UNIFORMS = [
  'u_scene', 'u_maskA', 'u_maskB', 'u_phys', 'u_emis',
  'u_trail', 'u_depth', 'u_zone', 'u_material',
  'u_px', 'u_time', 'u_aspect',
  'u_dayNight', 'u_storm', 'u_rain', 'u_wet', 'u_puddle', 'u_fog', 'u_wind', 'u_glow', 'u_decay',
  'u_snow', 'u_snowfall', 'u_temperature', 'u_autumn', 'u_bloom', 'u_bleach',
  'u_flash', 'u_parallax', 'u_fires', 'u_fireCount',
  'u_grassAvg', 'u_mossBoost',
  'u_intrinsic',
  'u_rainPhase', 'u_windDrift', 'u_dryPhase', 'u_heatWarp', 'u_rustAccum',
  'u_smokeAmount', 'u_breathAmount', 'u_pressureDim', 'u_pollutionGlow',
  'u_moonBright', 'u_shelfShadow', 'u_vegFade', 'u_moodTint', 'u_worldTired',
  'u_forbiddenCold', 'u_runeGlow', 'u_shadowAge', 'u_smellDrift', 'u_touchWear',
  'u_repairMark', 'u_blessCurse', 'u_bloodStain', 'u_mudStain',
  'u_lens', 'u_sound', 'u_elementWetBurst', 'u_elementHeatBurst',
  'u_elementPressureBurst', 'u_elementAshBurst', 'u_elementHailBurst',
  'u_elementLavaBurst'
];

// --- Texture Unit Assignments (must match shader) ---
export const TEXTURE_UNITS = {
  SCENE: 0,
  MASK_A: 1,
  MASK_B: 2,
  PHYS: 3,
  EMIS: 4,
  TRAIL: 5,
  DEPTH: 6,
  ZONE: 7,
  MATERIAL: 8,
  SOUND: 9
};

// --- Vertex Shader (fullscreen quad) ---
export const VERTEX_SHADER = `#version 300 es
in vec2 a;
out vec2 v_uv;
void main() {
  v_uv = a * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a, 0., 1.);
}`;

// --- Fragment Shader Header (uniforms, constants, helpers) ---
export const FRAGMENT_HEADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

// Texture units
uniform sampler2D u_scene;      // 0: Source image
uniform sampler2D u_maskA;      // 1: Material masks A (r=grass, g=foliage, b=roof, a=path)
uniform sampler2D u_maskB;      // 2: Material masks B (r=wood, g=window, b=water, a=rock)
uniform sampler2D u_phys;       // 3: Physics data (r=puddleDepth, g=riverAngle, b=bleed, a=pathDist)
uniform sampler2D u_emis;       // 4: Emissive/Window light map
uniform sampler2D u_trail;      // 5: Trail texture (r=dent, g=impulse, b=path, a=heat/fire)
uniform sampler2D u_depth;      // 6: Depth map (white=near, black=far)
uniform sampler2D u_zone;       // 7: Building zones (K1: r=1 for fachwerk)
uniform sampler2D u_material;   // 8: Material layer (r=shading, g=confidence)
uniform sampler2D u_sound;      // 9: Sound wavefield

// Frame constants
uniform vec2  u_px;             // Pixel size (1/width, 1/height)
uniform float u_time;           // Global time
uniform float u_aspect;         // Aspect ratio

// High-level parameters (0..1)
uniform float u_dayNight, u_storm, u_rain, u_wet, u_puddle, u_fog, u_wind, u_glow, u_decay;
uniform float u_snow, u_snowfall, u_temperature, u_autumn, u_bloom, u_bleach;
uniform float u_flash;          // Lightning flash

// Parallax
uniform vec2 u_parallax;        // Mouse/camera offset (0,0 for deterministic frames)

// Fire array (max 8)
uniform vec4 u_fires[8];
uniform float u_fireCount;

// Material analysis results
uniform vec3 u_grassAvg;        // Average grass color
uniform float u_mossBoost;      // Moisture patina accumulation

// Material layer
uniform float u_intrinsic;      // 0 = identity-albedo (fallback), 1 = full separation

// Accumulated phases (CPU-side integration, never in phase term)
uniform float u_rainPhase;      // ∫(1 + 0.4*wind) dt
uniform float u_windDrift;      // ∫wind dt
uniform float u_dryPhase;       // ∫max(0, 0.8 - u_wet) dt  (Drying #42)
uniform float u_heatWarp;       // u_temperature * u_fireCount (Heat Distortion #41)
uniform float u_rustAccum;      // Accumulates at wet>0.3 (Rust #9)
uniform float u_smokeAmount;    // u_fog * (u_storm + u_fireCount*0.5) (Smoke Layering #43)
uniform float u_breathAmount;   // Breath clouds (cold/fear) (#44)
uniform float u_pressureDim;    // Ground under weight darkens (#4)
uniform float u_pollutionGlow;  // Light pollution (#26)
uniform float u_moonBright;     // Moonlight phase (#38)
uniform float u_shelfShadow;    // Biome edge shadows (#34)
uniform float u_vegFade;        // Vegetation reaction (#15)
uniform float u_moodTint;       // NPC mood (#24)
uniform float u_worldTired;     // World tiredness (#50)
uniform float u_forbiddenCold;  // Forbidden boundaries (#25)
uniform float u_runeGlow;       // Surface runes (#32)
uniform float u_shadowAge;      // Shadows slow decay (#11)
uniform float u_smellDrift;     // Scent clouds from decay/fire (#6)
uniform float u_touchWear;      // Touch traces (#45)
uniform float u_repairMark;     // Visible repairs (#30)
uniform float u_blessCurse;     // Blessing/curse (#49)
uniform float u_bloodStain;     // Blood transfer on shoes (#2)
uniform float u_mudStain;       // Mud transfer on shoes (#2)

// Inspection lenses (Wally-Monokel)
uniform float u_lens;           // 0=off, 1=dirt/wear, 2=pressure, 3=sound, 4=material, 5=edges

// Element playground (transient UI-driven)
uniform float u_elementWetBurst, u_elementHeatBurst, u_elementPressureBurst;
uniform float u_elementAshBurst, u_elementHailBurst, u_elementLavaBurst;

// --- Constants ---
const int CLASSES_COUNT = 8;
const float AW = 768.0;  // Analysis width
const float AH = 432.0;  // Analysis height

// Class indices
#define G 0  // grass
#define F 1  // foliage
#define R 2  // roof
#define P 3  // path
#define W 4  // wood
#define N 5  // window
#define A 6  // water
#define K 7  // rock

// --- Helper Functions ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x),
             mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

float lum(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// Day/Night/Storm grading
vec3 grade(vec3 c) {
  c *= 1.0 - u_storm * (1.0 - u_dayNight) * 0.20;
  c = mix(c, vec3(lum(c)), u_storm * 0.18);
  vec3 nc = pow(max(c, 0.0), vec3(1.28)) * vec3(0.34, 0.40, 0.62) * 1.35;
  return mix(c, nc, u_dayNight);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time;
  float night = u_dayNight;

// --- 2.5D Parallax (before all lookups - single material truth!) ---
  float depthVal = texture(u_depth, uv).r;
  uv += u_parallax * depthVal;
  uv = clamp(uv, vec2(0.001), vec2(0.999));

// --- Material Mask Sampling ---
  vec4 mA = texture(u_maskA, uv);
  vec4 mB = texture(u_maskB, uv);
  float mGrass = mA.r, mFol = mA.g, mRoof = mA.b, mPath = mA.a;
  float mWood = mB.r, mWin = mB.g, mWater = mB.b, mRock = mB.a;

  vec4 phys = texture(u_phys, uv);
  vec4 trail = texture(u_trail, uv);
  float zone = texture(u_zone, uv).r;
  float noZone = 1.0 - zone;

  // Intrinsic shading (1.0 = neutral, <1 shadow, >1 light)
  float shade = mix(1.0, max(texture(u_material, uv).r * 2.0, 0.18), u_intrinsic);

  float veg = clamp(mGrass + mFol, 0.0, 1.0);
  float ground = clamp(mPath + mGrass + mRock, 0.0, 1.0);
`;

// --- Fragment Shader Body (main rendering logic) ---
export const FRAGMENT_BODY = `
// --- Vegetation Wind Animation ---
  float gust = 0.45 + 0.55 * vnoise(vec2(u_windDrift * 0.12 + t * 0.10, uv.y * 1.5 + u_windDrift * 0.04));
  float treePhase = vnoise(uv * vec2(3.0 * u_aspect, 3.0)) * 6.2831;
  float wphi = t * (0.7 + 1.3 * u_wind) + u_windDrift * 0.4;
  float primary = sin(wphi + treePhase) * 0.75 + sin(wphi * 0.53 - treePhase * 0.8) * 0.25;
  float flutter = sin(t * 6.5 + uv.x * 55.0 + uv.y * 40.0 + treePhase * 3.0);

  float folBelow = texture(u_maskA, clamp(uv - vec2(0.0, 0.018), 0.001, 0.999)).g;
  float crownBody = mFol * smoothstep(0.04, 0.55, folBelow);
  float grassBelow = texture(u_maskA, clamp(uv - vec2(0.0, 0.012), 0.001, 0.999)).r;
  float grassBody = mGrass * smoothstep(0.04, 0.5, grassBelow);

  vec2 windDir = normalize(vec2(1.0, 0.14));
  float windAmt = u_wind * gust;
  float meanLean = windAmt * 0.010;
  float crownAmp = 0.014 * windAmt;
  float grassAmp = 0.007 * windAmt;

  uv += windDir * (crownBody * (meanLean + primary * crownAmp + flutter * 0.002 * crownAmp));
  uv += windDir * (grassBody * (meanLean * 0.5 + primary * grassAmp + flutter * 0.0015 * grassAmp));
  uv = clamp(uv, vec2(0.001), vec2(0.999));

// --- Base Color Sampling ---
  vec3 col = texture(u_scene, uv).rgb * shade;
  vec3 base = col;

// --- Snow Cover ---
  float snowMask = mRoof * u_snow + mFol * u_snow * 0.6 + mPath * u_snow * 0.3 + mGrass * u_snow * 0.8;
  vec3 snowCol = mix(vec3(0.95, 0.97, 1.0), vec3(0.85, 0.90, 0.98), fbm(uv * 50.0));
  col = mix(col, snowCol, snowMask);

// --- Autumn Tint ---
  if (u_autumn > 0.01) {
    float autumnMask = mFol * 0.8 + mGrass * 0.3;
    vec3 autumnCol = mix(vec3(1.0, 0.55, 0.15), vec3(0.9, 0.35, 0.08), fbm(uv * 20.0));
    col = mix(col, autumnCol, autumnMask * u_autumn);
  }

// --- Spring Bloom ---
  if (u_bloom > 0.01) {
    float bloomMask = mGrass * 0.6 + mFol * 0.2;
    float bloomNoise = fbm(uv * vec2(30.0 * u_aspect, 30.0));
    col = mix(col, vec3(1.0, 0.85, 0.4), bloomMask * u_bloom * smoothstep(0.3, 0.7, bloomNoise));
  }

// --- Wet Surfaces (darkens porous materials) ---
  float wetFactor = u_wet * (1.0 - u_snow);
  if (wetFactor > 0.01) {
    float porous = mGrass + mPath + mRock + mFol * 0.5 + mWood * 0.7;
    col *= 1.0 - wetFactor * 0.35 * porous;
  }

// --- Puddles ---
  float pnz = fbm(uv * vec2(9.0 * u_aspect, 9.0));
  float puddleDepth = max(phys.r * (mPath + mRock) * noZone, phys.b * mGrass * 0.6) * (0.55 + 0.45 * pnz);
  puddleDepth = max(puddleDepth, mWater);
  puddleDepth = max(puddleDepth, smoothstep(0.5, 0.95, trail.b) * mGrass * 0.65);
  float th = 0.95 - u_puddle * 0.78;
  float pud = smoothstep(th, th + 0.20, puddleDepth);
  if (pud > 0.002) {
    vec2 rip = vec2(vnoise(uv * vec2(150.0 * u_aspect, 150.0) + vec2(0.0, t * 1.3)),
                    vnoise(uv * vec2(120.0 * u_aspect, 120.0) - vec2(t * 0.9, 0.0))) - 0.5;
    vec2 roff = rip * (0.003 + 0.009 * u_rain);
    vec3 refl = grade(texture(u_scene, vec2(uv.x, uv.y - 0.055) + roff).rgb);
    vec3 pcol = mix(refl * 0.75, vec3(0.5, 0.55, 0.65), 0.45);
    vec4 eref = texture(u_emis, uv - vec2(0.0, 0.045) + roff * 2.0);
    pcol += eref.rgb * u_glow * (0.35 + 1.9 * night);
    col = mix(col, pcol, pud * clamp(u_puddle * 2.2, 0.0, 1.0) * ground);
  }

// --- Rain Impact Rings ---
  if (u_rain > 0.004) {
    vec2 cellUv = uv * vec2(38.0 * u_aspect, 38.0);
    vec2 cid = floor(cellUv), cf = fract(cellUv) - 0.5;
    float ph = fract(t * (0.7 + 0.6 * hash(cid + 3.1)) + hash(cid));
    vec2 cOff = (vec2(hash(cid + 1.7), hash(cid + 2.3)) - 0.5) * 0.5;
    float ring = smoothstep(0.05, 0.0, abs(length(cf - cOff) - ph * 0.42)) * (1.0 - ph)
               * step(hash(cid + 4.2), u_rain * 0.85);
    col += ring * (pud * 0.5 + u_wet * 0.22) * ground * vec3(0.7, 0.8, 0.92);
  }

// --- Drip Edges under Roofs ---
  if (u_rain > 0.004) {
    float dripEdge = clamp(texture(u_maskA, uv - vec2(0.0, 0.007)).b - mRoof, 0.0, 1.0);
    float colid = floor(uv.x * 180.0 * u_aspect);
    float drip = step(0.90, fract(uv.y * 34.0 - t * 2.2 + hash(vec2(colid, 1.0)) * 7.0))
               * step(hash(vec2(colid, 2.0)), 0.6);
    col += dripEdge * drip * u_rain * vec3(0.55, 0.65, 0.85) * 0.6;
  }

// --- Window Light ---
  vec4 emis = texture(u_emis, uv);
  float winId = hash(floor(uv * vec2(36.0 * u_aspect, 36.0)));
  float flick = 0.80 + 0.20 * vnoise(vec2(t * (1.6 + winId * 1.6), winId * 9.0));
  float lamp = u_glow * (0.22 + 0.78 * night) * flick * (1.0 - smoothstep(0.6, 0.92, u_decay));
  float litVar = 0.72 + 0.28 * step(0.25, fract(winId * 7.31));
  vec3 lampCol = mix(vec3(1.0, 0.83, 0.46), vec3(1.0, 0.58, 0.22), fract(winId * 3.77) * 0.7);
  vec3 glassCol = mix(vec3(0.16, 0.19, 0.24), vec3(0.5, 0.55, 0.65), 0.35);
  col = mix(col, glassCol, mWin * 0.92 * (1.0 - lamp * litVar));
  col = mix(col, lampCol, mWin * lamp * litVar * 0.88);
  col += emis.rgb * lamp * 0.7;
  col += emis.rgb * u_wet * ground * night * u_glow * 0.55;

// --- Fire / Scorch / Campfire ---
  float scorch = smoothstep(0.18, 0.85, trail.a);
  col = mix(col, vec3(0.09, 0.07, 0.06) * (0.5 + 0.6 * lum(base)), scorch * (1.0 - mWater) * 0.8);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= u_fireCount) break;
    vec4 fdef = u_fires[i];
    float dd = length((uv - fdef.xy) * vec2(u_aspect, 1.0));
    float ffl = 0.72 + 0.28 * vnoise(vec2(t * 7.0 + float(i) * 3.1, float(i) * 1.7));
    float fglow = exp(-dd * dd / (fdef.w * fdef.w)) * fdef.z * ffl;
    col += vec3(1.0, 0.52, 0.16) * fglow * (0.35 + 0.75 * night);
    col += vec3(1.0, 0.85, 0.45) * smoothstep(fdef.w * 0.35, 0.0, dd) * fdef.z * ffl * 0.5;
  }

// --- Heat / Lava / Embers ---
  float heatField = smoothstep(0.10, 0.92, trail.a) * (0.35 + 0.65 * u_elementHeatBurst);
  float lavaNoise = fbm(uv * vec2(65.0 * u_aspect, 65.0) + vec2(t * 0.7, -t * 0.35));
  float lavaCore = smoothstep(0.62, 0.92, lavaNoise) * heatField * u_elementLavaBurst;
  float crust = smoothstep(0.30, 0.72, lavaNoise) * heatField * (0.35 + 0.65 * u_elementLavaBurst);
  col = mix(col, vec3(0.05, 0.035, 0.025), crust * 0.35 * (1.0 - mWater));
  col += vec3(1.0, 0.22, 0.035) * heatField * (0.18 + 0.55 * night);
  col += vec3(1.0, 0.78, 0.22) * lavaCore * (0.65 + 0.65 * night);
  float heatShimmer = sin((uv.x + uv.y * 0.7) * 210.0 + t * 18.0) * heatField * u_elementHeatBurst;
  col.r += heatShimmer * 0.035; col.b -= heatShimmer * 0.025;

// --- Fog ---
  if (u_fog > 0.005) {
    float f1 = fbm(uv * vec2(3.2 * u_aspect, 3.2) + vec2((t * 0.5 + u_windDrift) * 0.060, -t * 0.010));
    float f2 = fbm(uv * vec2(6.5 * u_aspect, 6.5) + vec2(-(t * 0.5 + u_windDrift) * 0.045, t * 0.020) + 31.7);
    float edge = smoothstep(0.22, 0.60, length((uv - 0.5) * vec2(1.15, 1.35))) + smoothstep(0.75, 0.15, uv.y) * 0.3;
    float fogFade = u_fog * u_fog * (3.0 - 2.0 * u_fog);
    float fogAmt = clamp((0.45 * f1 + 0.38 * f2) * (0.3 + 0.7 * edge), 0.0, 1.0) * fogFade;
    vec3 fogCol = mix(vec3(0.86, 0.89, 0.93), vec3(0.40, 0.46, 0.62), night) + u_flash * 0.8 + u_snow * 0.05;
    col = mix(col, fogCol, fogAmt * 0.75);
  }

// --- Snowfall ---
  if (u_snowfall > 0.004) {
    float sf = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 fuv = uv * vec2((28.0 + fi * 14.0) * u_aspect, 28.0 + fi * 14.0);
      fuv.y -= t * (0.5 + fi * 0.25);
      fuv.x += sin(fuv.y * 1.7 + t * (0.8 + fi * 0.3)) * 0.35 + u_windDrift * (0.5 + fi * 0.25);
      vec2 ip = floor(fuv), fp = fract(fuv) - 0.5;
      float rnd = hash(ip);
      vec2 cO = (vec2(hash(ip + 2.1), hash(ip + 3.7)) - 0.5) * 0.55;
      float flake = smoothstep(0.13 + 0.07 * rnd, 0.02, length(fp - cO));
      sf += flake * step(1.0 - u_snowfall * 0.5, rnd) * (1.0 - fi * 0.22);
    }
    col = mix(col, vec3(0.93, 0.95, 1.0), clamp(sf, 0.0, 1.0) * 0.85);
  }

// --- Rain Streaks ---
  if (u_rain > 0.004) {
    float rn = 0.0;
    float slope = 0.16 + u_wind * 0.38;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float scaleX = 55.0 + fi * 35.0;
      float lineW = 0.12;
      float across = (uv.x - slope * uv.y) * scaleX;
      float colid = floor(across);
      float af = fract(across) - 0.5;
      float line = smoothstep(lineW, 0.0, abs(af));
      float along = vnoise(vec2(colid * 3.1 + fi * 5.0, uv.y * 1.6 - u_rainPhase * (0.8 + fi * 0.4)));
      float on = step(1.0 - u_rain * 0.5, hash(vec2(colid, fi + 9.0)));
      float streak = smoothstep(0.38, 0.70, along);
      rn += on * line * streak * (1.0 - fi * 0.22);
    }
    col = mix(col, vec3(0.72, 0.80, 0.95), clamp(rn, 0.0, 1.0) * u_rain * 0.42);
  }

// --- Lightning Flash ---
  col += u_flash * (vec3(0.30, 0.36, 0.55) + col * 0.9);

// --- Day After: Sun Glint on Wet ---
  float spTw = hash(floor(uv * vec2(420.0 * u_aspect, 420.0)) + vec2(floor(t * 7.0)));
  col += smoothstep(0.9976, 1.0, spTw) * u_wet * (1.0 - night) * (1.0 - u_storm) * ground * vec3(1.2);

// --- Breathing + Vignette ---
  col *= 1.0 + 0.012 * sin(t * 0.45);
  col *= 1.0 - (0.30 * night + 0.10 * u_storm) * pow(length(uv - 0.5) * 1.42, 1.8);

// --- Post-Processing: Bloom ---
  float bright = smoothstep(0.62, 1.05, lum(col)) + texture(u_emis, uv).a * u_glow * (0.35 + night);
  vec3 bloomCol = vec3(0.0);
  for (int bi = 0; bi < 6; bi++) {
    float a = float(bi) * 6.2831 / 6.0;
    vec2 o = vec2(cos(a), sin(a)) * u_px * (6.0 + 18.0 * u_bloom + 10.0 * night);
    bloomCol += grade(texture(u_scene, clamp(uv + o, 0.001, 0.999)).rgb);
  }
  bloomCol /= 6.0;
  col += bloomCol * bright * (0.10 + 0.45 * u_bloom + 0.22 * u_glow * night);

// --- Distortion ---
  float distortAmt = (u_storm * 0.25 + u_elementHeatBurst * 0.45 + u_elementLavaBurst * 0.55 + trail.a * 0.35);
  vec2 warp = (vec2(vnoise(uv * vec2(42.0 * u_aspect, 42.0) + t * 1.7),
                    vnoise(uv * vec2(39.0 * u_aspect, 39.0) - t * 1.3)) - 0.5) * u_px * 18.0 * distortAmt;
  vec3 warped = texture(u_scene, clamp(uv + warp, 0.001, 0.999)).rgb;
  col = mix(col, grade(warped), distortAmt * 0.08);

// --- Chromatic Aberration ---
  float edgeCA = pow(length(uv - 0.5) * 1.55, 2.0) * (0.20 + 0.55 * u_storm + 0.40 * u_elementHeatBurst);
  vec2 ca = normalize(uv - 0.5 + vec2(0.0001)) * u_px * edgeCA * 10.0;
  vec3 caCol = vec3(texture(u_scene, clamp(uv + ca, 0.001, 0.999)).r,
                    col.g,
                    texture(u_scene, clamp(uv - ca, 0.001, 0.999)).b);
  col = mix(col, grade(caCol), clamp(edgeCA, 0.0, 0.28));

// --- Point Cloud Motes ---
  vec2 pcGrid = uv * vec2(90.0 * u_aspect, 90.0);
  vec2 pcId = floor(pcGrid), pcF = fract(pcGrid) - 0.5;
  float pcRnd = hash(pcId);
  float pcDepth = texture(u_depth, clamp(uv, 0.001, 0.999)).r;
  vec2 pcOff = (vec2(hash(pcId + 1.7), hash(pcId + 2.9)) - 0.5) * 0.55 + vec2(sin(t + pcRnd * 6.0), cos(t * 0.7 + pcRnd)) * 0.10;
  float pcDot = smoothstep(0.070, 0.015, length(pcF - pcOff)) * step(0.965 - u_fog * 0.08 - u_elementAshBurst * 0.12, pcRnd);
  vec3 pcCol = mix(vec3(0.65, 0.75, 0.95), vec3(1.0, 0.42, 0.12), u_elementAshBurst + trail.a);
  col += pcCol * pcDot * (0.16 + 0.45 * u_fog + 0.55 * u_elementAshBurst) * (0.45 + 0.55 * pcDepth);

// --- Wally-Monokel (Inspection Lenses) ---
  if (u_lens > 0.5) {
    vec3 grey = vec3(lum(base)) * 0.35;
    if (u_lens < 1.5) {  // Lens 1: Dirt/Wear/Footprints
      float wear = clamp(trail.b * 1.4 + u_touchWear * 0.6, 0.0, 1.0);
      col = grey + wear * vec3(0.95, 0.70, 0.30);
    } else if (u_lens < 2.5) {  // Lens 2: Pressure/Load
      float press = clamp(u_pressureDim * 3.0, 0.0, 1.0);
      col = grey + press * vec3(1.0, 0.25, 0.20);
    } else if (u_lens < 3.5) {  // Lens 3: Sound Waves
      float wave = texture(u_sound, uv).r;
      col = grey + wave * vec3(0.35, 0.85, 1.0);
    } else if (u_lens < 4.5) {  // Lens 4: Material Fidelity (normal image)
      // Intentionally shows normal composed image
    } else if (u_lens < 5.5) {  // Lens 5: Material Edges
      float edge = length(vec2(
        texture(u_maskA, uv + vec2(u_px.x, 0.0)).r - texture(u_maskA, uv - vec2(u_px.x, 0.0)).r,
        texture(u_maskA, uv + vec2(0.0, u_px.y)).r - texture(u_maskA, uv - vec2(0.0, u_px.y)).r
      ));
      col = grey + edge * vec3(1.0, 1.0, 0.0);
    }
  }

  fragColor = vec4(col, 1.0);
}
`;

// --- Full Fragment Shader (header + body) ---
export const FRAGMENT_SHADER = FRAGMENT_HEADER + FRAGMENT_BODY;

// --- Compile-time shader validation ---
export function validateShaderSource() {
  const errors = [];
  if (!FRAGMENT_SHADER.includes('#version 300 es')) errors.push('Missing version directive');
  if (!FRAGMENT_SHADER.includes('fragColor')) errors.push('Missing fragColor output');
  for (const u of REQUIRED_UNIFORMS) {
    if (!FRAGMENT_SHADER.includes(u)) errors.push(`Missing uniform: ${u}`);
  }
  return { valid: errors.length === 0, errors };
}