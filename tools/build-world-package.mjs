#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildSpatialEnvironment } from '../runtime/spatial-reconstruction.mjs';

const option = (args, name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

function readPoints(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const channel = manifest.channels?.points;
  if (!channel || channel.dtype !== 'float32-le' || channel.shape?.[1] !== 6) {
    throw new Error('Provider result has no [count,6] float32 point channel.');
  }
  const file = path.resolve(path.dirname(manifestPath), channel.file);
  const buffer = fs.readFileSync(file);
  const count = channel.shape[0];
  if (buffer.length !== count * 6 * 4) throw new Error('points.f32 size does not match manifest shape.');

  // shaded_provider_common.depth_points writes a regular row-major sample grid.
  // Reconstruct that grid metadata here so spatial-reconstruction can use its
  // structured O(n) neighbourhood path instead of the generic all-pairs fallback.
  const width = Number(manifest.camera?.width) || 1;
  const height = Number(manifest.camera?.height) || 1;
  const pointBudget = Number(manifest.provenance?.parameters?.pointBudget) || count;
  const providerStep = Math.max(1, Math.ceil(Math.sqrt((width * height) / Math.max(1, pointBudget))));
  const gridWidth = Math.max(1, Math.ceil(width / providerStep));

  const points = new Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * 24;
    const r = Math.max(0, Math.min(255, Math.round(buffer.readFloatLE(offset + 12) * 255)));
    const g = Math.max(0, Math.min(255, Math.round(buffer.readFloatLE(offset + 16) * 255)));
    const b = Math.max(0, Math.min(255, Math.round(buffer.readFloatLE(offset + 20) * 255)));
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let material = 'rock';
    if (b > r * 1.18 && b > g * 1.08 && max > 120) material = 'water';
    else if (g > r * 1.12 && g > b * 1.04) material = 'grass';
    else if (r > g * 1.12 && g > b * 1.05) material = 'wood';
    else if (max - min < 30 && max > 175) material = 'window';
    points[i] = {
      x: buffer.readFloatLE(offset),
      y: buffer.readFloatLE(offset + 4),
      z: buffer.readFloatLE(offset + 8),
      r, g, b, material,
      gridX: i % gridWidth,
      gridY: Math.floor(i / gridWidth),
      confidence: 0.72,
      sourceIndex: i,
    };
  }
  return { manifest, points, providerStep, gridWidth };
}

function reconstructionSample(points, target = 90000) {
  if (points.length <= target) return points;
  const factor = Math.max(2, Math.ceil(Math.sqrt(points.length / target)));
  const sampled = [];
  for (const point of points) {
    if (point.gridX % factor || point.gridY % factor) continue;
    sampled.push({ ...point, gridX: Math.floor(point.gridX / factor), gridY: Math.floor(point.gridY / factor) });
  }
  return sampled;
}

function writeWorldPoints(filename, points) {
  const buffer = Buffer.allocUnsafe(points.length * 24);
  points.forEach((point, index) => {
    const offset = index * 24;
    buffer.writeFloatLE(point.x, offset);
    buffer.writeFloatLE(point.y, offset + 4);
    buffer.writeFloatLE(point.z, offset + 8);
    buffer.writeFloatLE((point.r || 0) / 255, offset + 12);
    buffer.writeFloatLE((point.g || 0) / 255, offset + 16);
    buffer.writeFloatLE((point.b || 0) / 255, offset + 20);
  });
  fs.writeFileSync(filename, buffer);
}

function raymarchPrimitive(primitive) {
  const { id, type, confidence, model } = primitive;
  if (type === 'plane') return { id, type, confidence, center: model.center, normal: model.normal, axes: model.axes, halfExtents: model.halfExtents };
  if (type === 'box') return { id, type, confidence, center: model.center, axes: model.axes, halfExtents: model.halfExtents };
  return { id, type, confidence, center: model.center, axis: model.axis, halfHeight: model.halfHeight, radius: model.radius };
}

function copyPreviewMaps(manifestPath, output) {
  const source = path.dirname(manifestPath);
  const names = ['maps.json', 'depth-preview.png', 'height-map.png', 'bump-map.png', 'normal-map.png'];
  for (const name of names) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(output, name));
  }
}

function main() {
  const args = process.argv.slice(2);
  const manifestPath = path.resolve(option(args, 'manifest', ''));
  const output = path.resolve(option(args, 'out', path.dirname(manifestPath)));
  if (!manifestPath || !fs.existsSync(manifestPath)) throw new Error('--manifest must point to provider result.json');
  fs.mkdirSync(output, { recursive: true });

  const radius = Math.max(2, Number(option(args, 'radius', 12)) || 12);
  const mirrorThickness = Math.max(0.005, Number(option(args, 'mirror-thickness', 0.045)) || 0.045);
  const mirrorRelief = Math.max(0.01, Number(option(args, 'mirror-relief', 0.14)) || 0.14);
  const textureBlend = Math.max(0, Math.min(1, Number(option(args, 'texture-blend', 0.78)) || 0.78));
  const { manifest, points } = readPoints(manifestPath);
  const fitPoints = reconstructionSample(points);
  const environment = buildSpatialEnvironment(fitPoints, {
    mirrorShell: true,
    mirrorThickness,
    mirrorRelief,
    textureBlend,
    sideLayers: 3,
    maxMirrorPoints: 8000,
  });

  copyPreviewMaps(manifestPath, output);
  const worldPointsFile = path.join(output, 'world-points.f32');
  writeWorldPoints(worldPointsFile, environment.points);
  const previewStride = Math.max(1, Math.ceil(environment.points.length / 24000));
  const previewPoints = environment.points.filter((_, index) => index % previewStride === 0).map(point => ({
    x: point.x, y: point.y, z: point.z,
    r: Math.round(point.r || 0), g: Math.round(point.g || 0), b: Math.round(point.b || 0),
    generated: !!point.generated,
  }));

  const raymarch = {
    format: 'SHADED.raymarch-scene.v1',
    boundary: { type: 'sphere', radius },
    primitives: environment.primitives.map(raymarchPrimitive),
    mirroredShell: {
      enabled: true,
      generatedPoints: environment.mirroredCompletion.length,
      thickness: mirrorThickness,
      relief: mirrorRelief,
    },
  };
  fs.writeFileSync(path.join(output, 'raymarch-scene.json'), JSON.stringify(raymarch, null, 2) + '\n');

  const world = {
    format: 'SHADED.single-image-world.v1',
    provider: manifest.provider,
    modelVersion: manifest.modelVersion,
    boundary: { radius },
    source: manifest.provenance,
    geometry: {
      rawProviderPoints: points.length,
      reconstructionPoints: fitPoints.length,
      observedPoints: environment.observed.length,
      generatedPoints: environment.generated.length,
      primitivePoints: environment.primitiveCompletion.length,
      mirroredPoints: environment.mirroredCompletion.length,
      primitiveCount: environment.primitives.length,
      metrics: environment.metrics,
      bounds: environment.bounds,
    },
    artefacts: {
      points: { file: 'world-points.f32', dtype: 'float32-le', shape: [environment.points.length, 6] },
      raymarch: 'raymarch-scene.json',
      maps: 'maps.json',
      depth: 'depth-preview.png',
      height: 'height-map.png',
      bump: 'bump-map.png',
      normal: 'normal-map.png',
    },
    previewPoints,
  };
  fs.writeFileSync(path.join(output, 'world.json'), JSON.stringify(world, null, 2) + '\n');
  console.log(JSON.stringify({ output, world: 'world.json', raymarch: 'raymarch-scene.json', rawPoints: points.length, reconstructionPoints: fitPoints.length, points: environment.points.length, mirrored: environment.mirroredCompletion.length, primitives: environment.primitives.length }, null, 2));
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }