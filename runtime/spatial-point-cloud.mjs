/**
 * Der eine aktive Bild+Tiefe-Operator.
 *
 * Er interpretiert eine 8-Bit-Companion-Datei als relative Staffelung. Er
 * schaetzt weder Kameraintrinsics noch metrische Tiefe oder Zuverlaessigkeit.
 */
export function buildRelativePointCloud({
  rgba,
  depthRgba,
  width,
  height,
  sourceSize,
  source = {kind: 'UNKNOWN', label: null},
  depthSource = {},
  step: requestedStep,
  fovDegrees: requestedFov,
  materialAt = null,
}) {
  if (!(rgba instanceof Uint8ClampedArray) && !(rgba instanceof Uint8Array)) throw new Error('RGB-Pixel fehlen.');
  if (!(depthRgba instanceof Uint8ClampedArray) && !(depthRgba instanceof Uint8Array)) throw new Error('Tiefenpixel fehlen.');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Ungueltige Bildgroesse.');
  if (rgba.length < width * height * 4 || depthRgba.length < width * height * 4) throw new Error('Pixelpuffer ist kleiner als die angegebene Bildgroesse.');
  if (requestedFov != null && (!Number.isFinite(Number(requestedFov)) || Number(requestedFov) <= 0 || Number(requestedFov) >= 180)) throw new Error('fovDegrees muss zwischen 0 und 180 liegen.');

  const fovSupplied = requestedFov != null;
  const fovDegrees = fovSupplied ? Number(requestedFov) : 60;
  const step = Math.max(1, Number(requestedStep) | 0 || Math.ceil(Math.sqrt((width * height) / 65000)));
  const fov = fovDegrees * Math.PI / 180;
  const fx = width / (2 * Math.tan(fov / 2));
  const fy = fx;
  const cx = width / 2;
  const cy = height / 2;
  const points = [];

  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const index = (y * width + x) * 4;
    const depth = depthRgba[index] / 255;
    if (depth < 0.02) continue;
    const u = (x + 0.5) / width;
    const v = (y + 0.5) / height;
    points.push({
      x: (x - cx) * depth / fx,
      y: (cy - y) * depth / fy,
      z: depth,
      r: rgba[index],
      g: rgba[index + 1],
      b: rgba[index + 2],
      size: 0.006 + 0.010 * depth,
      alpha: 0.35 + 0.55 * depth,
      u,
      v,
      pixelX: x,
      pixelY: y,
      gridX: Math.floor(x / step),
      gridY: Math.floor(y / step),
      step,
      sourceIndex: points.length,
      material: materialAt ? materialAt(u, v) : null,
      confidence: null,
      reliability: 'UNKNOWN',
      synthesized: false,
      provenance: 'INFERRED',
      geometryProvenance: 'UNKNOWN_DEPTH_IMAGE',
      colorProvenance: 'OBSERVED_SOURCE_RGB',
    });
  }

  return {
    format: 'SHADED.spatial-point-cloud.v1',
    representation: {visible: 'POINTS', viewerState: 'VOXELS', meshRendered: false},
    source: {w: sourceSize?.w ?? width, h: sourceSize?.h ?? height, ...source, color: 'ORIGINAL_RGB_SAMPLED'},
    depth: {w: width, h: height, convention: 'white-near', units: 'normalized-8bit', metric: false, ...depthSource},
    camera: {
      model: 'PINHOLE_APPROXIMATION', fovDegrees, fx, fy, cx, cy, step,
      source: fovSupplied ? 'CALLER_SUPPLIED_FOV' : 'ASSUMED_DEFAULT_60_DEGREES',
      intrinsicsKnown: false,
      principalPoint: 'ASSUMED_IMAGE_CENTER',
    },
    scale: {kind: 'RELATIVE_NORMALIZED_DEPTH', metric: false, units: 'arbitrary'},
    reliability: {kind: 'UNKNOWN', perPoint: false, reason: 'Die Tiefenbild-Schnittstelle liefert keinen Konfidenzkanal.'},
    registration: {performed: false, targetFrame: null},
    fusion: {performed: false, inputCount: 1},
    grid: {width: Math.ceil(width / step), height: Math.ceil(height / step), step},
    productRule: 'Single-image point clouds expose visible surfaces only; hidden backsides/disocclusions are not measured.',
    points,
  };
}
