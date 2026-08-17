import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundleResult, compareResults, doctorProviders, gpuProfile, probeNvidia, runProvider, validateResult } from './gpu-spatial.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shaded-provider-'));
const writeFloats = (filename, values) => {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  fs.writeFileSync(filename, buffer);
};
const manifestFor = (provider, convention, channels, metric = false) => ({
  format: 'SHADED.spatial-provider-result.v1', provider, modelVersion: provider + '-fixture', device: 'cpu', precision: 'fp32',
  depthConvention: convention, metric, channels,
  camera: { intrinsics: [[2, 0, 1], [0, 2, 1], [0, 0, 1]], width: 2, height: 2, fx: 2, fy: 2, cx: 1, cy: 1 },
  timingsMs: { inference: 1 },
  provenance: {
    class: 'INFERRED', sourceSha256: '0'.repeat(64), sourceFile: 'fixture.png',
    sourceSize: { width: 2, height: 2 }, processedSize: { width: 2, height: 2 },
    provider, modelVersion: provider + '-fixture', parameters: { fixture: true }
  }
});
const writeResult = (name, provider, values, convention = 'relative-depth-higher-far') => {
  const directory = path.join(root, name); fs.mkdirSync(directory);
  writeFloats(path.join(directory, 'depth.f32'), values);
  writeFloats(path.join(directory, 'confidence.f32'), [0.8, 0.9, 0.7, 1]);
  writeFloats(path.join(directory, 'normals.f32'), Array(12).fill(0).map((_, index) => index % 3 === 2 ? 1 : 0));
  writeFloats(path.join(directory, 'points.f32'), Array.from({ length: 24 }, (_, index) => index / 24));
  const channels = {
    depth: { file: 'depth.f32', dtype: 'float32-le', shape: [2, 2] },
    confidence: { file: 'confidence.f32', dtype: 'float32-le', shape: [2, 2] },
    normals: { file: 'normals.f32', dtype: 'float32-le', shape: [2, 2, 3] },
    points: { file: 'points.f32', dtype: 'float32-le', shape: [4, 6] }
  };
  const manifest = path.join(directory, 'result.json');
  fs.writeFileSync(manifest, JSON.stringify(manifestFor(provider, convention, channels)));
  return manifest;
};

try {
  const largeProfile = gpuProfile(12288);
  assert.equal(largeProfile.name, 'gpu-11gb-plus');
  assert.equal(largeProfile.precision, 'fp16');
  assert.equal(largeProfile.maxEdge, 1024);
  assert.equal('voxelResolution' in largeProfile, false);
  assert.equal(typeof probeNvidia().available, 'boolean');

  const a = writeResult('a', 'depth-anything-3.official', [1, 2, 3, 4]);
  const b = writeResult('b', 'depth-anything-v2.transformers', [4, 3, 2, 1], 'relative-disparity-higher-near');
  const validated = validateResult(a);
  assert.deepEqual(Object.keys(validated.channelFiles), ['depth', 'confidence', 'normals', 'points']);
  const comparison = compareResults(a, b);
  assert.equal(comparison.samples, 4);
  assert.equal(comparison.comparison, 'standardized-depth-structure');
  assert.ok(comparison.mae < 1e-6);
  assert.ok(comparison.pearson > 0.999999);
  assert.equal(comparison.absRel, null);
  assert.match(comparison.interpretation, /not a reconstruction-quality score/);

  const bundlePath = path.join(root, 'provider.bundle.json'), bundleInfo = bundleResult(a, bundlePath);
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  assert.equal(bundle.format, 'SHADED.spatial-provider-bundle.v1');
  assert.equal(bundle.channelData.depth.bytes, 16);
  assert.equal(bundle.channelData.depth.sha256.length, 64);
  assert.deepEqual(bundleInfo.channels, ['depth', 'confidence', 'normals', 'points']);

  const invalidSchema = path.join(root, 'a', 'invalid-schema.json');
  const invalidObject = JSON.parse(fs.readFileSync(a, 'utf8')); invalidObject.unimplementedVoxelClaim = true;
  fs.writeFileSync(invalidSchema, JSON.stringify(invalidObject));
  assert.throws(() => validateResult(invalidSchema), /Schemafehler/);

  const outside = path.join(root, 'outside.f32'); writeFloats(outside, [1, 2, 3, 4]);
  const invalidPath = path.join(root, 'a', 'invalid-path.json'), escapedObject = JSON.parse(fs.readFileSync(a, 'utf8'));
  escapedObject.channels.depth.file = '../outside.f32'; fs.writeFileSync(invalidPath, JSON.stringify(escapedObject));
  assert.throws(() => validateResult(invalidPath), /verlässt den Provider-Ordner/);

  const nanManifest = writeResult('nan', 'nan-provider', [1, 2, Number.NaN, 4]);
  assert.throws(() => validateResult(nanManifest), /keinen endlichen/);

  const fixtureScript = path.join(root, 'fixture-provider.mjs');
  fs.writeFileSync(fixtureScript, `
    import fs from 'node:fs'; import path from 'node:path';
    const args=process.argv.slice(2), get=n=>args[args.indexOf('--'+n)+1];
    if(args.includes('--doctor')){console.log(JSON.stringify({fixture:'ready'}));process.exit(0);}
    const out=get('output');fs.mkdirSync(out,{recursive:true});const buffer=Buffer.alloc(16);[1,2,3,4].forEach((v,i)=>buffer.writeFloatLE(v,i*4));fs.writeFileSync(path.join(out,'depth.f32'),buffer);
    const provider='executed-fixture', modelVersion='executed-fixture-v1';
    const result={format:'SHADED.spatial-provider-result.v1',provider,modelVersion,device:get('device'),precision:get('precision'),depthConvention:'relative-depth-higher-far',metric:false,channels:{depth:{file:'depth.f32',dtype:'float32-le',shape:[2,2]}},timingsMs:{inference:1},provenance:{class:'INFERRED',sourceSha256:'0'.repeat(64),sourceFile:'fixture.png',sourceSize:{width:2,height:2},processedSize:{width:2,height:2},provider,modelVersion,parameters:{maxEdge:Number(get('max-edge')),pointBudget:Number(get('point-budget'))}}};
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result));
  `);
  const executionOutput = path.join(root, 'executed');
  const definition = {
    command: process.execPath,
    args: [fixtureScript, '--output', '{output}', '--device', '{device}', '--precision', '{precision}', '--max-edge', '{max_edge}', '--point-budget', '{point_budget}'],
    doctorArgs: [fixtureScript, '--doctor']
  };
  const executed = await runProvider(definition, { output: executionOutput, device: 'cpu', precision: 'fp32', max_edge: 518, point_budget: 1234 });
  assert.equal(executed.result.provider, 'executed-fixture');
  assert.deepEqual(executed.result.provenance.parameters, { maxEdge: 518, pointBudget: 1234 });
  const doctor = doctorProviders({ providers: { fixture: definition, broken: { command: process.execPath } } });
  assert.equal(doctor.providers.fixture.ready, true);
  assert.equal(doctor.providers.fixture.details.fixture, 'ready');
  assert.equal(doctor.providers.broken.ready, false);

  console.log('✅ Provider-Prozess, JSON-Schema, Binärkanäle, Bundle und Vergleich bestanden (keine CUDA-Inferenz behauptet)');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
