// Compiles every WGSL shader module SHADED's WebGPU World Lab ships (world-sandbox-webgpu.mjs)
// against a REAL WebGPU device via headless Chromium's own shader compiler and asserts zero
// validation errors. Every other check on this file (test-world-sandbox.mjs's regex/text
// assertions, verify-shader-sandbox.mjs) reads the WGSL source as a string -- none of them ever
// actually compile it. That gap let three separate reserved-keyword collisions (`smooth`,
// `meta`, `target` -- all real WGSL reserved words, none of them GLSL/JS reserved, which is
// exactly why they slipped through) and a swizzle-compound-assignment portability bug ship and
// stay invisible for as long as the WebGPU path silently fell back to the CPU renderer whenever
// initialization failed -- passing every existing test the whole time. This test exists so that
// specific failure mode (a compile error nobody sees because there's always a working fallback)
// can't happen silently again.
//
// Deliberately does NOT go through WebGpuWorldSandbox.create() -- that also allocates buffers,
// bind groups and pipelines, which this sandboxed headless environment's software WebGPU
// (Dawn on SwiftShader) has been observed to tear down ("a valid external Instance reference no
// longer exists") independently of whether the shaders themselves are valid. Shader compilation
// validation alone (device.createShaderModule + getCompilationInfo(), the exact mechanism
// world-sandbox-webgpu.mjs's own checkedModule() uses) is the narrower, stable thing this test
// needs to prove.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

// This test only needs a page context with a real WebGPU device to import
// `/runtime/world-sandbox-webgpu.mjs` (a plain relative-path module) into --
// it was never testing the live Snowflow entry point (`index.html` ->
// `/src/main.js`). Navigating to `index.html` itself would now (a) crash on
// Snowflow's bare `@babylonjs/core/...` specifiers, which only a bundler
// resolves (see CLAUDE.md's "Status: two subsystems, one repo" note -- a
// raw static server can't do this, same as `python3 -m http.server`), and
// even bundled, (b) race this test's own device/adapter request against
// Snowflow's own WebGPU init for the sandboxed software adapter, which is
// exactly the "Instance dropped" teardown instability this test's own
// top-of-file comment already warns is real for this environment. A blank
// fixture page sidesteps both: no bare specifiers, nothing else touches
// WebGPU.
const FIXTURE_HTML = '<!doctype html><meta charset="utf-8"><script type="module"></script>';

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/_harness.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(FIXTURE_HTML);
      return;
    }
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

  await page.goto(`http://127.0.0.1:${port}/_harness.html`, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    if (!navigator.gpu) return { skipped: 'navigator.gpu unavailable in this browser' };
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { skipped: 'no WebGPU adapter available' };
    const device = await adapter.requestDevice();
    const module = await import('/runtime/world-sandbox-webgpu.mjs');
    const shaders = {
      WORLD_COMPUTE_WGSL: module.WORLD_COMPUTE_WGSL,
      PARTICLE_COMPUTE_WGSL: module.PARTICLE_COMPUTE_WGSL,
      QUERY_COMPUTE_WGSL: module.QUERY_COMPUTE_WGSL,
      WORLD_SPATIAL_RENDER_WGSL: module.WORLD_SPATIAL_RENDER_WGSL,
      PARTICLE_SPATIAL_RENDER_WGSL: module.PARTICLE_SPATIAL_RENDER_WGSL,
    };
    const failures = [];
    for (const [name, code] of Object.entries(shaders)) {
      const shaderModule = device.createShaderModule({ label: name, code });
      const info = await shaderModule.getCompilationInfo();
      const errors = info.messages.filter(message => message.type === 'error');
      if (errors.length) failures.push(`${name}: ${errors.map(error => error.message).join(' | ')}`);
    }
    return { failures };
  });

  if (result.skipped) {
    console.log(`test-webgpu-shader-compile: SKIPPED (${result.skipped}) -- not a pass, just unavailable in this environment`);
  } else {
    if (result.failures.length) {
      throw new Error('WGSL shader module(s) failed to compile against a real WebGPU device:\n' + result.failures.join('\n'));
    }
    console.log('test-webgpu-shader-compile: all 5 WGSL modules (world/particle/query compute, world/particle spatial render) compile cleanly against a real WebGPU device');
  }
  if (consoleErrors.length) {
    throw new Error('unexpected browser console errors during shader-compile check: ' + consoleErrors.join(' | '));
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
