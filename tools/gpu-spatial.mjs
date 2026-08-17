#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(moduleDirectory, '../contracts/shaded-spatial-provider.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

export function gpuProfile(memoryMiB = 0) {
  if (memoryMiB >= 11000) return { name: 'gpu-11gb-plus', precision: 'fp16', maxEdge: 1024, pointBudget: 1_000_000, sequentialProviders: true };
  if (memoryMiB >= 7000) return { name: 'gpu-7gb-plus', precision: 'fp16', maxEdge: 768, pointBudget: 500_000, sequentialProviders: true };
  return { name: 'cpu', precision: 'fp32', maxEdge: 518, pointBudget: 250_000, sequentialProviders: true };
}

export function probeNvidia() {
  const result = spawnSync('nvidia-smi', ['--query-gpu=index,name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  if (result.status !== 0) return {
    available: false,
    gpus: [],
    profile: gpuProfile(),
    diagnostic: result.error?.message || result.stderr?.trim() || 'nvidia-smi ist nicht verfügbar'
  };
  const gpus = result.stdout.trim().split('\n').filter(Boolean).map(line => {
    const [index, name, memory] = line.split(',').map(part => part.trim());
    return { index: Number(index), name, memoryMiB: Number(memory) };
  }).filter(gpu => Number.isInteger(gpu.index) && Number.isFinite(gpu.memoryMiB));
  return { available: gpus.length > 0, gpus, profile: gpuProfile(gpus[0]?.memoryMiB) };
}

const replace = (value, vars) => String(value).replace(/\{(\w+)\}/g, (_, key) => {
  if (!(key in vars)) throw new Error(`Unbekannter Platzhalter: {${key}}`);
  return String(vars[key]);
});

const validationMessage = errors => errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
const product = shape => shape.reduce((count, value) => {
  const next = count * value;
  if (!Number.isSafeInteger(next)) throw new Error(`Shape ist zu groß: ${shape.join('×')}`);
  return next;
}, 1);
const bytesPerValue = Object.freeze({ 'float32-le': 4, uint8: 1, 'uint16-le': 2 });

function containedFile(manifestPath, relativeFile) {
  const directory = fs.realpathSync(path.dirname(path.resolve(manifestPath)));
  const resolved = path.resolve(directory, relativeFile);
  const relative = path.relative(directory, resolved);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error(`Kanalpfad verlässt den Provider-Ordner: ${relativeFile}`);
  if (!fs.existsSync(resolved)) throw new Error(`Kanaldaten fehlen: ${relativeFile}`);
  const real = fs.realpathSync(resolved), realRelative = path.relative(directory, real);
  if (realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative)) throw new Error(`Kanal-Symlink verlässt den Provider-Ordner: ${relativeFile}`);
  return real;
}

function readFloat32(file) {
  const buffer = fs.readFileSync(file), values = new Float32Array(buffer.length / 4);
  for (let offset = 0, index = 0; offset < buffer.length; offset += 4, index++) values[index] = buffer.readFloatLE(offset);
  return values;
}

function assertFiniteFloatChannel(name, file) {
  const values = readFloat32(file);
  for (let index = 0; index < values.length; index++) if (!Number.isFinite(values[index])) throw new Error(`${name} enthält bei Index ${index} keinen endlichen float32-Wert`);
}

export function validateResult(manifestPath) {
  if (!manifestPath) throw new Error('Manifestpfad fehlt');
  const absoluteManifest = path.resolve(manifestPath), result = JSON.parse(fs.readFileSync(absoluteManifest, 'utf8'));
  if (!validateSchema(result)) throw new Error(`Schemafehler: ${validationMessage(validateSchema.errors)}`);
  if (result.provenance.provider !== result.provider || result.provenance.modelVersion !== result.modelVersion) throw new Error('Provider-/Modell-Provenienz stimmt nicht mit dem Manifest überein');
  if (result.metric !== (result.depthConvention === 'metric-depth-meters')) throw new Error('metric und depthConvention widersprechen sich');

  const channelFiles = {};
  for (const [name, channel] of Object.entries(result.channels)) {
    const file = containedFile(absoluteManifest, channel.file), count = product(channel.shape);
    if (channel.dtype === 'json') JSON.parse(fs.readFileSync(file, 'utf8'));
    else {
      const expectedBytes = count * bytesPerValue[channel.dtype], actualBytes = fs.statSync(file).size;
      if (actualBytes !== expectedBytes) throw new Error(`${name}: ${actualBytes} Byte passen nicht zu Shape ${channel.shape.join('×')} (${expectedBytes} Byte)`);
      if (channel.dtype === 'float32-le') assertFiniteFloatChannel(name, file);
    }
    channelFiles[name] = file;
  }

  const depth = result.channels.depth, [height, width] = depth.shape;
  if (depth.dtype !== 'float32-le' || depth.shape.length !== 2) throw new Error('depth muss float32-le mit Shape [height,width] sein');
  if (result.camera && (result.camera.width !== width || result.camera.height !== height)) throw new Error('Kameraabmessungen stimmen nicht mit depth überein');
  const confidence = result.channels.confidence;
  if (confidence && (confidence.dtype !== 'float32-le' || confidence.shape.length !== 2 || confidence.shape[0] !== height || confidence.shape[1] !== width)) throw new Error('confidence muss dieselbe H×W-Shape wie depth haben');
  const normals = result.channels.normals;
  if (normals && (normals.dtype !== 'float32-le' || normals.shape.length !== 3 || normals.shape[0] !== height || normals.shape[1] !== width || normals.shape[2] !== 3)) throw new Error('normals muss float32-le mit Shape [height,width,3] sein');
  const points = result.channels.points;
  if (points && (points.dtype !== 'float32-le' || points.shape.length !== 2 || ![3, 6].includes(points.shape[1]))) throw new Error('points muss float32-le mit Shape [count,3|6] sein');
  return { manifestPath: absoluteManifest, result, channelFiles, depthFile: channelFiles.depth };
}

export async function runProvider(definition, vars) {
  if (!definition?.command || !Array.isArray(definition.args)) throw new Error('Provider braucht command und args');
  fs.mkdirSync(vars.output, { recursive: true });
  const manifestPath = path.join(vars.output, 'result.json'), previousMtime = fs.existsSync(manifestPath) ? fs.statSync(manifestPath).mtimeMs : -1;
  const args = definition.args.map(arg => replace(arg, vars));
  await new Promise((resolve, reject) => {
    const child = spawn(definition.command, args, { stdio: 'inherit', shell: false, cwd: definition.cwd ? path.resolve(definition.cwd) : undefined });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Provider beendet mit Code ${code}`)));
  });
  if (!fs.existsSync(manifestPath)) throw new Error(`Provider lieferte kein ${manifestPath}`);
  if (previousMtime >= 0 && fs.statSync(manifestPath).mtimeMs <= previousMtime) throw new Error('Provider hat das vorhandene result.json nicht erneuert');
  return validateResult(manifestPath);
}

const canonicalDepth = (values, convention) => Array.from(values, value => value * (convention === 'relative-disparity-higher-near' ? -1 : 1));
function meanAndDeviation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return { mean, deviation };
}

export function compareResults(aPath, bPath) {
  const a = validateResult(aPath), b = validateResult(bPath);
  if (a.result.channels.depth.shape.join(',') !== b.result.channels.depth.shape.join(',')) throw new Error('Depth-Shapes unterscheiden sich');
  const rawA = canonicalDepth(readFloat32(a.depthFile), a.result.depthConvention), rawB = canonicalDepth(readFloat32(b.depthFile), b.result.depthConvention);
  const bothMetric = a.result.metric && b.result.metric, statsA = meanAndDeviation(rawA), statsB = meanAndDeviation(rawB);
  const av = bothMetric ? rawA : rawA.map(value => (value - statsA.mean) / Math.max(statsA.deviation, 1e-12));
  const bv = bothMetric ? rawB : rawB.map(value => (value - statsB.mean) / Math.max(statsB.deviation, 1e-12));
  let absolute = 0, squared = 0, covariance = 0, varianceA = 0, varianceB = 0, absRelative = 0;
  const centerA = meanAndDeviation(av).mean, centerB = meanAndDeviation(bv).mean;
  for (let index = 0; index < av.length; index++) {
    const delta = av[index] - bv[index]; absolute += Math.abs(delta); squared += delta * delta;
    covariance += (av[index] - centerA) * (bv[index] - centerB); varianceA += (av[index] - centerA) ** 2; varianceB += (bv[index] - centerB) ** 2;
    if (bothMetric) absRelative += Math.abs(delta) / Math.max(Math.abs(av[index]), 1e-6);
  }
  const count = av.length;
  return {
    format: 'SHADED.spatial-comparison.v1', providers: [a.result.provider, b.result.provider], samples: count,
    comparison: bothMetric ? 'absolute-metric-depth' : 'standardized-depth-structure', mae: absolute / count, rmse: Math.sqrt(squared / count),
    pearson: varianceA > 0 && varianceB > 0 ? covariance / Math.sqrt(varianceA * varianceB) : null,
    absRel: bothMetric ? absRelative / count : null,
    interpretation: 'Provider agreement only; this is not a reconstruction-quality score.'
  };
}

export function bundleResult(manifestPath, outputPath) {
  const validated = validateResult(manifestPath), channelData = {};
  for (const [name, file] of Object.entries(validated.channelFiles)) {
    const data = fs.readFileSync(file);
    channelData[name] = { encoding: 'base64', bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), data: data.toString('base64') };
  }
  const bundle = { format: 'SHADED.spatial-provider-bundle.v1', result: validated.result, channelData }, absoluteOutput = path.resolve(outputPath);
  fs.writeFileSync(absoluteOutput, JSON.stringify(bundle));
  return { output: absoluteOutput, bytes: fs.statSync(absoluteOutput).size, channels: Object.keys(channelData) };
}

export function doctorProviders(config) {
  const providers = {};
  for (const [name, definition] of Object.entries(config.providers || {})) {
    if (!definition.command || !Array.isArray(definition.doctorArgs)) { providers[name] = { ready: false, exitCode: null, diagnostic: 'doctorArgs fehlen' }; continue; }
    const check = spawnSync(definition.command, definition.doctorArgs, { encoding: 'utf8', shell: false, cwd: definition.cwd ? path.resolve(definition.cwd) : undefined });
    let details = check.stdout?.trim();
    try { details = details ? JSON.parse(details) : null; } catch { /* preserve diagnostic text */ }
    providers[name] = { ready: check.status === 0, exitCode: check.status, details, diagnostic: check.error?.message || check.stderr?.trim() || null };
  }
  return { hardware: probeNvidia(), providers };
}

function readConfig(filename) {
  const config = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
  if (!config.providers || typeof config.providers !== 'object') throw new Error('Provider-Konfiguration enthält kein providers-Objekt');
  return config;
}

async function main(argv) {
  const [command, ...args] = argv;
  const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index < 0 ? fallback : args[index + 1]; };
  const required = name => { const value = option(name); if (!value) throw new Error(`--${name} fehlt`); return value; };
  if (command === 'probe') return console.log(JSON.stringify(probeNvidia(), null, 2));
  if (command === 'doctor') {
    const report = doctorProviders(readConfig(required('config')));
    console.log(JSON.stringify(report, null, 2));
    if (Object.values(report.providers).some(provider => !provider.ready)) process.exitCode = 2;
    return;
  }
  if (command === 'validate') return console.log(JSON.stringify(validateResult(required('manifest')).result, null, 2));
  if (command === 'bundle') return console.log(JSON.stringify(bundleResult(required('manifest'), required('out')), null, 2));
  if (command === 'compare') {
    const result = compareResults(required('a'), required('b')), output = option('out');
    if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(result, null, 2) + '\n');
    return console.log(JSON.stringify(result, null, 2));
  }
  if (command === 'run') {
    const config = readConfig(required('config')), provider = required('provider'), definition = config.providers[provider];
    if (!definition) throw new Error(`Unbekannter Provider: ${provider}`);
    const hardware = probeNvidia(), profile = hardware.profile;
    const validated = await runProvider(definition, {
      input: path.resolve(required('input')), output: path.resolve(required('out')),
      device: option('device', hardware.available ? 'cuda:0' : 'cpu'), precision: option('precision', profile.precision),
      max_edge: Number(option('max-edge', profile.maxEdge)), point_budget: Number(option('point-budget', profile.pointBudget))
    });
    return console.log(JSON.stringify({ manifest: validated.manifestPath, provider: validated.result.provider, device: validated.result.device, precision: validated.result.precision, channels: Object.keys(validated.result.channels) }, null, 2));
  }
  throw new Error('Nutzung: gpu-spatial.mjs probe | doctor --config … | run --config … --provider … --input … --out … | validate --manifest … | bundle --manifest … --out … | compare --a … --b … [--out …]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
