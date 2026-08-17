#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function gpuProfile(memoryMiB = 0) {
  if (memoryMiB >= 11000) return { name: 'rtx-12gb', precision: 'fp16', pointBudget: 2_000_000, voxelResolution: 256, navResolution: 256, sequentialProviders: true };
  if (memoryMiB >= 7000) return { name: 'gpu-8gb', precision: 'fp16', pointBudget: 1_000_000, voxelResolution: 192, navResolution: 192, sequentialProviders: true };
  return { name: 'portable', precision: 'fp32', pointBudget: 250_000, voxelResolution: 96, navResolution: 96, sequentialProviders: true };
}

export function probeNvidia() {
  const result = spawnSync('nvidia-smi', ['--query-gpu=index,name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  if (result.status !== 0) return { available: false, gpus: [], profile: gpuProfile() };
  const gpus = result.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [index, name, memory] = line.split(',').map((part) => part.trim());
    return { index: Number(index), name, memoryMiB: Number(memory) };
  });
  return { available: gpus.length > 0, gpus, profile: gpuProfile(gpus[0]?.memoryMiB) };
}

const replace = (value, vars) => value.replace(/\{(\w+)\}/g, (_, key) => {
  if (!(key in vars)) throw new Error(`Unbekannter Platzhalter: {${key}}`);
  return String(vars[key]);
});

export async function runProvider(definition, vars) {
  if (!definition?.command || !Array.isArray(definition.args)) throw new Error('Provider braucht command und args');
  fs.mkdirSync(vars.output, { recursive: true });
  const args = definition.args.map((arg) => replace(arg, vars));
  await new Promise((resolve, reject) => {
    const child = spawn(definition.command, args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Provider beendet mit Code ${code}`)));
  });
  const manifestPath = path.join(vars.output, 'result.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Provider lieferte kein ${manifestPath}`);
  return validateResult(manifestPath);
}

export function validateResult(manifestPath) {
  const result = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (result.format !== 'SHADED.spatial-provider-result.v1' || !result.provider || !result.channels?.depth) throw new Error('Ungültiger SHADED Provider-Vertrag');
  const channel = result.channels.depth;
  if (channel.dtype !== 'float32-le' || channel.shape?.length !== 2) throw new Error('Depth muss float32-le mit [height,width] sein');
  const file = path.resolve(path.dirname(manifestPath), channel.file);
  if (!fs.existsSync(file) || fs.statSync(file).size !== channel.shape[0] * channel.shape[1] * 4) throw new Error('Depth-Datei passt nicht zur Shape');
  return { manifestPath, result, depthFile: file };
}

function readDepth(validated) {
  const buffer = fs.readFileSync(validated.depthFile);
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

export function compareResults(aPath, bPath) {
  const a = validateResult(aPath), b = validateResult(bPath);
  const av = readDepth(a), bv = readDepth(b);
  if (av.length !== bv.length) throw new Error('Depth-Shapes unterscheiden sich');
  let count = 0, abs = 0, squared = 0, relative = 0;
  for (let i = 0; i < av.length; i++) {
    if (!Number.isFinite(av[i]) || !Number.isFinite(bv[i])) continue;
    const delta = av[i] - bv[i]; count++; abs += Math.abs(delta); squared += delta * delta; relative += Math.abs(delta) / Math.max(Math.abs(av[i]), 1e-6);
  }
  if (!count) throw new Error('Keine vergleichbaren Depth-Werte');
  return { format: 'SHADED.spatial-comparison.v1', providers: [a.result.provider, b.result.provider], samples: count, mae: abs / count, rmse: Math.sqrt(squared / count), absRel: relative / count };
}

async function main(argv) {
  const [command, ...args] = argv;
  const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
  if (command === 'probe') return console.log(JSON.stringify(probeNvidia(), null, 2));
  if (command === 'compare') {
    const result = compareResults(option('a'), option('b'));
    const out = option('out'); if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
    return console.log(JSON.stringify(result, null, 2));
  }
  if (command === 'run') {
    const config = JSON.parse(fs.readFileSync(option('config'), 'utf8'));
    const provider = option('provider');
    const hardware = probeNvidia();
    await runProvider(config.providers?.[provider], { input: path.resolve(option('input')), output: path.resolve(option('out')), device: hardware.available ? 'cuda:0' : 'cpu', precision: hardware.profile.precision });
    return;
  }
  throw new Error('Nutzung: gpu-spatial.mjs probe | run --config … --provider … --input … --out … | compare --a … --b … [--out …]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
