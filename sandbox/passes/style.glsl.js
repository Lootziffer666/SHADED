// SHADED Style Discovery Sandbox — Pass 2 (Style) und Pass 3 (Post).
//
// Der Style-Pass liest AUSSCHLIESSLICH den G-Buffer aus Pass 1 plus die
// indizierte MaterialResponse-Tabelle (Nässe/Ruß/Risse/Frost/Schnee/Rost/
// Hitze/Feuer je Primitiv) und wendet EIN StyleProfile über
// Uniform-Branches an — keine Shader-Forks pro Stil (Maintainer-Vorgabe).
// Der Post-Pass ist ein EIGENER, dritter Draw (Bloom+Grain ODER Halftone) —
// bewusst NICHT in den Style-Pass gecrammed (Korrektur 2).

import { MAX_PRIMS } from './gbuffer.glsl.js';

export const STYLE_FRAGMENT_SRC = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uG0;
uniform sampler2D uG1;
uniform sampler2D uG2;
uniform sampler2D uG3;
uniform sampler2D uDepth;
uniform vec2 u_gbufferTexel;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_camPos;

#define MAX_PRIMS ${MAX_PRIMS}
uniform float u_primWetness[MAX_PRIMS];
uniform float u_primChar[MAX_PRIMS];
uniform float u_primCrack[MAX_PRIMS];
uniform float u_primFrost[MAX_PRIMS];
uniform float u_primSnow[MAX_PRIMS];
uniform float u_primRust[MAX_PRIMS];
uniform float u_primHeat[MAX_PRIMS];
uniform float u_primFire[MAX_PRIMS];

// --- StyleProfile-Uniforms (ein Wert pro Dimension, siehe runtime/style/style-profile.js) ---
uniform int u_lightingMode;      // 0 halfLambert, 1 banded, 2 hardCel
uniform float u_rampBands;
uniform float u_rampSoftness;
uniform int u_specMode;          // 0 ggx, 1 banded
uniform float u_specIntensity;
uniform int u_rimMode;           // 0 off, 1 soft, 2 hard
uniform float u_rimWidth;
uniform float u_rimHue;
uniform int u_normalMode;        // 0 smooth, 1 curvature, 2 faceted
uniform float u_normalStrength;
uniform int u_outlineMode;       // 0 none, 1 sobel
uniform float u_outlineThickness;
uniform int u_paletteMode;       // 0 free, 1 gradientMap, 2 posterize
uniform float u_paletteSteps;
uniform float u_paletteHue;
uniform int u_textureMode;       // 0 clean, 1 breakup
uniform float u_textureStrength;
uniform float u_shadowWarmth;    // -1..1

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0, 0, 0));
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

void main() {
  vec4 g0 = texture(uG0, vUv);
  bool sky = g0.a >= 0.999;

  if (sky) {
    vec3 top = vec3(0.10, 0.13, 0.20);
    vec3 bottom = vec3(0.03, 0.04, 0.07);
    fragColor = vec4(mix(bottom, top, vUv.y), 1.0);
    return;
  }

  vec4 g1 = texture(uG1, vUv);
  vec4 g2 = texture(uG2, vUv);
  vec4 g3 = texture(uG3, vUv);

  vec3 baseColor = g0.rgb;
  int mi = int(floor(g0.a * float(MAX_PRIMS)));
  mi = clamp(mi, 0, MAX_PRIMS - 1);

  vec3 n = normalize(g1.rgb * 2.0 - 1.0);
  float roughness = g1.a;
  float reflectance = g2.r;
  float emission = g2.g;
  float curvature = g2.a;
  vec3 worldPos = (g3.rgb - 0.5) / 0.06;

  // --- Normal-Stil ---
  if (u_normalMode == 2) { // faceted: Normale auf grobe Buckets quantisieren
    float bucket = 4.0;
    n = normalize(floor(n * bucket + 0.5) / bucket + 1e-4);
  }
  float cavity = (u_normalMode == 1) ? curvature * u_normalStrength : 0.0;

  // --- Materialsemantik aus der indizierten Tabelle (Korrektur 1) ---
  float wetness = u_primWetness[mi];
  float charAmt = u_primChar[mi];
  float crackAmt = u_primCrack[mi];
  float frostAmt = u_primFrost[mi];
  float snowAmt = u_primSnow[mi];
  float rustAmt = u_primRust[mi];
  float heatAmt = u_primHeat[mi];
  float fireAmt = u_primFire[mi];

  // Risse dunkeln die Normale lokal ab (Kantenschatten), unabhängig vom Stil.
  vec3 litSurfaceColor = baseColor;
  litSurfaceColor *= (1.0 - crackAmt * 0.15);

  // --- Lighting-Stil ---
  float ndl = dot(n, u_lightDir);
  float diff;
  if (u_lightingMode == 0) { // halfLambert
    float hl = ndl * 0.5 + 0.5;
    diff = mix(hl * hl, hl, u_rampSoftness);
  } else { // banded / hardCel: quantisierte Rampe
    float bands = max(2.0, u_rampBands);
    float hl = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
    float quant = floor(hl * bands) / max(bands - 1.0, 1.0);
    diff = mix(quant, hl, u_rampSoftness * 0.5);
  }
  diff = clamp(diff - cavity * 0.4, 0.0, 1.0);

  // --- Schattenfarbe (warm/kalt statt nur dunkler) ---
  vec3 warmShadow = vec3(0.30, 0.16, 0.10);
  vec3 coolShadow = vec3(0.08, 0.12, 0.22);
  vec3 shadowTint = mix(coolShadow, warmShadow, clamp(u_shadowWarmth * 0.5 + 0.5, 0.0, 1.0));
  vec3 shadedColor = mix(litSurfaceColor * shadowTint * 1.4, litSurfaceColor * u_lightColor, diff);

  // --- Specular-Stil ---
  vec3 viewDir = normalize(u_camPos - worldPos);
  vec3 halfDir = normalize(u_lightDir + viewDir);
  float ndh = clamp(dot(n, halfDir), 0.0, 1.0);
  float spec;
  if (u_specMode == 0) { // GGX-artig
    float a = max(roughness * roughness, 0.02);
    float a2 = a * a;
    float d = ndh * ndh * (a2 - 1.0) + 1.0;
    spec = a2 / (3.14159265 * d * d + 1e-4);
    spec = clamp(spec * mix(0.04, 1.0, reflectance), 0.0, 4.0);
  } else { // banded specular
    float sharp = mix(2.0, 40.0, 1.0 - roughness);
    float raw = pow(ndh, sharp);
    spec = step(0.5, raw) * mix(0.3, 1.0, reflectance);
  }
  spec *= u_specIntensity;
  vec3 color = shadedColor + vec3(spec) * u_lightColor;

  // --- Rim-Stil ---
  if (u_rimMode != 0) {
    float fresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
    vec3 rimColor = hsv2rgb(vec3(u_rimHue, 0.65, 1.0));
    if (u_rimMode == 1) { // soft
      color += rimColor * fresnel * u_rimWidth;
    } else { // hard
      float hard = step(1.0 - u_rimWidth, fresnel);
      color = mix(color, rimColor, hard * 0.85);
    }
  }

  // --- Materialsemantik-Overlays (stilübergreifend, aber stilinterpretiert) ---
  color = mix(color, color * 0.55, wetness * 0.6);          // Nässe dunkelt & glänzt (spec bereits reflectance-gekoppelt)
  color = mix(color, vec3(0.03, 0.03, 0.03), charAmt * 0.7); // Ruß/Verkohlung Richtung Schwarz
  color = mix(color, vec3(0.55, 0.30, 0.12), rustAmt * 0.5); // Rost Richtung Orange-Braun
  color = mix(color, vec3(0.85, 0.90, 0.96), frostAmt * 0.4);
  color = mix(color, vec3(1.0), snowAmt * 0.6);
  color += u_lightColor * emission * (1.0 + fireAmt * 2.0) * mix(1.0, 1.6, heatAmt);

  // --- Textur-Breakup (objektraum-verankert, motion-stabil) ---
  if (u_textureMode == 1) {
    float n1 = valueNoise3(worldPos * 3.2);
    float n2 = valueNoise3(worldPos * 9.0 + 11.3);
    float breakup = (n1 * 0.7 + n2 * 0.3) - 0.5;
    color *= (1.0 + breakup * u_textureStrength * 0.6);
    color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))), abs(breakup) * u_textureStrength * 0.15);
  }

  // --- Palette-Stil ---
  if (u_paletteMode == 1) { // gradientMap
    float lum = clamp(dot(color, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    vec3 coolC = hsv2rgb(vec3(fract(u_paletteHue + 0.55), 0.55, 0.9));
    vec3 warmC = hsv2rgb(vec3(fract(u_paletteHue), 0.55, 1.0));
    color = mix(coolC * lum * 1.2, warmC * lum * 1.2, lum);
  } else if (u_paletteMode == 2) { // posterize
    float steps = max(2.0, u_paletteSteps);
    color = floor(color * steps + 0.5) / steps;
  }

  // --- Outline-Stil (Sobel auf Tiefe + Normale) ---
  if (u_outlineMode == 1) {
    vec2 texel = u_gbufferTexel;
    float d00 = texture(uDepth, vUv + texel * vec2(-1, -1)).r;
    float d10 = texture(uDepth, vUv + texel * vec2(0, -1)).r;
    float d20 = texture(uDepth, vUv + texel * vec2(1, -1)).r;
    float d01 = texture(uDepth, vUv + texel * vec2(-1, 0)).r;
    float d21 = texture(uDepth, vUv + texel * vec2(1, 0)).r;
    float d02 = texture(uDepth, vUv + texel * vec2(-1, 1)).r;
    float d12 = texture(uDepth, vUv + texel * vec2(0, 1)).r;
    float d22 = texture(uDepth, vUv + texel * vec2(1, 1)).r;
    float gx = -d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22;
    float gy = -d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22;
    float depthEdge = length(vec2(gx, gy));

    vec3 nn00 = normalize(texture(uG1, vUv + texel * vec2(-1, -1)).rgb * 2.0 - 1.0);
    vec3 nn22 = normalize(texture(uG1, vUv + texel * vec2(1, 1)).rgb * 2.0 - 1.0);
    float normalEdge = 1.0 - clamp(dot(nn00, nn22), 0.0, 1.0);

    float edge = clamp(depthEdge * 8.0 + normalEdge * 1.2, 0.0, 1.0);
    float threshold = mix(0.75, 0.1, u_outlineThickness);
    float lineFactor = smoothstep(threshold, threshold * 0.5, 1.0 - edge);
    color = mix(color, vec3(0.02, 0.02, 0.03), lineFactor);
  }

  fragColor = vec4(clamp(color, 0.0, 4.0), 1.0);
}
`;

export const POST_FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uStyleColor;
uniform vec2 u_texel;
uniform float u_time;
uniform int u_postMode; // 0 bloomGrain, 1 halftone
uniform float u_postIntensity;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Bayer-4x4-Schwellenmatrix (Bayer 1973) für Halftone.
float bayer4(ivec2 c) {
  int idx = (c.x & 3) + ((c.y & 3) << 2);
  float m[16] = float[16](
    0.0, 8.0, 2.0, 10.0,
    12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0
  );
  return m[idx] / 16.0;
}

void main() {
  vec3 base = texture(uStyleColor, vUv).rgb;
  vec3 result = base;

  if (u_postMode == 0) {
    // Einfacher Hellpass-Bloom: wenige Nachbartexel akkumulieren, additiv.
    vec3 bloom = vec3(0.0);
    float total = 0.0;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 offs = vec2(float(x), float(y)) * u_texel * 2.2;
        vec3 s = texture(uStyleColor, vUv + offs).rgb;
        float bright = max(0.0, dot(s, vec3(0.299, 0.587, 0.114)) - 0.65);
        float w = 1.0 / (1.0 + float(x * x + y * y));
        bloom += s * bright * w;
        total += w;
      }
    }
    bloom /= max(total, 1e-4);
    result = base + bloom * u_postIntensity * 1.5;

    float grain = (hash12(gl_FragCoord.xy + u_time * 60.0) - 0.5) * u_postIntensity * 0.12;
    result += grain;
  } else {
    float lum = clamp(dot(base, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    float threshold = bayer4(ivec2(gl_FragCoord.xy));
    float dot_ = step(threshold, lum);
    vec3 halftoneColor = mix(vec3(0.05), base, dot_);
    result = mix(base, halftoneColor, u_postIntensity);
  }

  fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
`;
