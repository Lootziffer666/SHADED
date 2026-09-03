// Proves runtime/world-sandbox-wind.mjs's WGSL mirror (WIND_DISPLACEMENT_WGSL) NUMERICALLY
// AGREES with its CPU reference (computeWindDisplacement), not just that it compiles -- the same
// lockstep discipline world-sandbox-reference.mjs/world-sandbox-webgpu.mjs already keep for the
// rest of this sandbox. Runs the actual WGSL function on a real WebGPU device via a compute
// pass, reads the results back, and compares against the same test cases run through the CPU
// function in this same Node process.
//
// Deliberately does NOT reuse WebGpuWorldSandbox.create() (see test-webgpu-shader-compile.mjs's
// own comment on why: this sandboxed environment's software WebGPU has been observed to lose the
// device during full buffer/pipeline/bind-group setup for the MAIN world sandbox, independent of
// shader correctness) -- but a single small compute pass with two storage buffers is exactly the
// kind of minimal, self-contained GPU work that test-webgpu-shader-compile.mjs's own shader-
// compile checks have already proven stable here. If device/buffer setup itself fails for
// environment reasons (not a compile error), this test reports SKIPPED rather than a false FAIL,
// matching that same file's precedent -- but a numeric mismatch between CPU and GPU results is
// always a real failure, never swallowed as an environment quirk.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeWindDisplacement } from '../runtime/world-sandbox-wind.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + pathname);
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

// [x, z, rootDistance, maxDistance, time, windDirX, windDirZ, bendStrength] -- varied enough to
// exercise every term (root-clamped, mid-range, past-tip, both wind axes, several times).
const CASES = [
  [0.4, 0.6, 0, 2.0, 3.1, 1, 0, 0.5],
  [0.31, 0.72, 1.4, 2.0, 5.2, 1, 0, 0.8],
  [0.62, 0.18, 1.8, 2.0, 7.0, 1, 0, 0.4],
  [0.5, 0.5, 1.5, 2.0, 3.0, 0, 1, 1.0],
  [0.3, 0.9, 2.0, 2.0, 12.0, 1, 0, 0.6],
  [0.3, 0.9, 10.0, 2.0, 12.0, 1, 0, 0.6], // well past the tip -- clamp should engage
  [0.05, 0.95, 0.7, 2.0, 0.0, 0.707, 0.707, 0.3], // t=0, diagonal wind
];

const cpuResults = CASES.map(([x, z, rootDistance, maxDistance, time, windDirX, windDirZ, bendStrength]) =>
  computeWindDisplacement(x, z, rootDistance, maxDistance, time, windDirX, windDirZ, bendStrength));

let browser;
try {
  const fallbackChromium = '/opt/pw-browsers/chromium';
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || (existsSync(fallbackChromium) ? fallbackChromium : undefined),
    args: ['--enable-unsafe-webgpu', '--use-gl=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push('pageerror: ' + error.message));

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async (cases) => {
    if (!navigator.gpu) return { skipped: 'navigator.gpu unavailable in this browser' };
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { skipped: 'no WebGPU adapter available' };
    let device;
    try {
      device = await adapter.requestDevice();
    } catch (err) {
      return { skipped: 'requestDevice failed: ' + err.message };
    }

    const module = await import('/runtime/world-sandbox-wind.mjs');
    const code = `
struct WindCase {
  x: f32, z: f32, rootDistance: f32, maxDistance: f32,
  time: f32, windDirX: f32, windDirZ: f32, bendStrength: f32,
};
@group(0) @binding(0) var<storage, read> cases: array<WindCase>;
@group(0) @binding(1) var<storage, read_write> results: array<vec4<f32>>;

${module.WIND_DISPLACEMENT_WGSL}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let c = cases[id.x];
  let d = windDisplacement(c.x, c.z, c.rootDistance, c.maxDistance, c.time, c.windDirX, c.windDirZ, c.bendStrength);
  results[id.x] = vec4<f32>(d, 0.0);
}
`;

    try {
      const shaderModule = device.createShaderModule({ label: 'wind-lockstep', code });
      const compileInfo = await shaderModule.getCompilationInfo();
      const compileErrors = compileInfo.messages.filter(m => m.type === 'error');
      if (compileErrors.length) return { failures: ['compile: ' + compileErrors.map(e => e.message).join(' | ')] };

      const caseCount = cases.length;
      const inputBuffer = new Float32Array(caseCount * 8);
      cases.forEach((c, i) => inputBuffer.set(c, i * 8));

      const inputGpuBuffer = device.createBuffer({
        size: inputBuffer.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(inputGpuBuffer, 0, inputBuffer);

      const outputByteSize = caseCount * 4 * 4; // vec4<f32> per case
      const outputGpuBuffer = device.createBuffer({
        size: outputByteSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const readbackBuffer = device.createBuffer({
        size: outputByteSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shaderModule, entryPoint: 'main' },
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputGpuBuffer } },
          { binding: 1, resource: { buffer: outputGpuBuffer } },
        ],
      });

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(caseCount);
      pass.end();
      encoder.copyBufferToBuffer(outputGpuBuffer, 0, readbackBuffer, 0, outputByteSize);
      device.queue.submit([encoder.finish()]);

      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const resultArray = Array.from(new Float32Array(readbackBuffer.getMappedRange().slice(0)));
      readbackBuffer.unmap();

      const gpuResults = [];
      for (let i = 0; i < caseCount; i++) {
        gpuResults.push([resultArray[i * 4], resultArray[i * 4 + 1], resultArray[i * 4 + 2]]);
      }
      return { gpuResults };
    } catch (err) {
      return { skipped: 'GPU buffer/pipeline setup failed: ' + err.message };
    }
  }, CASES);

  if (result.skipped) {
    console.log(`test-world-sandbox-wind-gpu: SKIPPED (${result.skipped}) -- not a pass, just unavailable/unstable in this environment`);
  } else if (result.failures) {
    throw new Error('WGSL wind shader failed:\n' + result.failures.join('\n'));
  } else {
    const gpuResults = result.gpuResults;
    let worstDelta = 0;
    for (let i = 0; i < CASES.length; i++) {
      const cpu = cpuResults[i];
      const gpu = gpuResults[i];
      const deltas = [Math.abs(cpu.dx - gpu[0]), Math.abs(cpu.dy - gpu[1]), Math.abs(cpu.dz - gpu[2])];
      const maxDelta = Math.max(...deltas);
      worstDelta = Math.max(worstDelta, maxDelta);
      if (maxDelta > 1e-4) {
        throw new Error(
          `WGSL/CPU wind displacement disagree on case ${i} (${JSON.stringify(CASES[i])}): ` +
          `CPU={dx:${cpu.dx}, dy:${cpu.dy}, dz:${cpu.dz}}, GPU=[${gpu.join(', ')}], maxDelta=${maxDelta}`
        );
      }
    }
    console.log(`test-world-sandbox-wind-gpu: WGSL windDisplacement() run on a real GPU compute pass numerically matches the CPU reference across ${CASES.length} cases (worst delta ${worstDelta.toExponential(2)})`);
  }
  if (consoleErrors.length) {
    throw new Error('unexpected browser console errors during wind GPU lockstep check: ' + consoleErrors.join(' | '));
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
