import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareResults, gpuProfile, validateResult } from './gpu-spatial.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shaded-gpu-'));
const writeResult = (name, provider, values) => {
  const dir = path.join(root, name); fs.mkdirSync(dir);
  const depth = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => depth.writeFloatLE(value, index * 4));
  fs.writeFileSync(path.join(dir, 'depth.f32'), depth);
  const result = { format: 'SHADED.spatial-provider-result.v1', provider, channels: { depth: { file: 'depth.f32', dtype: 'float32-le', shape: [2, 2] } } };
  const manifest = path.join(dir, 'result.json'); fs.writeFileSync(manifest, JSON.stringify(result)); return manifest;
};

try {
  assert.equal(gpuProfile(12288).name, 'rtx-12gb');
  assert.equal(gpuProfile(12288).voxelResolution, 256);
  const a = writeResult('a', 'depth-anything-3', [1, 2, 3, 4]);
  const b = writeResult('b', 'depth-anything-v2', [1, 3, 3, 5]);
  assert.equal(validateResult(a).result.provider, 'depth-anything-3');
  const comparison = compareResults(a, b);
  assert.equal(comparison.samples, 4);
  assert.equal(comparison.mae, 0.5);
  assert.equal(comparison.providers[1], 'depth-anything-v2');
  console.log('✅ GPU-Provider-Vertrag und DA3/DA2-Vergleich funktionieren');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
