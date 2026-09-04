import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function run(args, label) {
  const result = spawnSync(process.execPath, args, {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) {
    console.error(`CHECK FAILED: ${label}`);
    process.exit(result.status || 1);
  }
}

for (const file of [
  ...walk(path.join(root, 'runtime')),
  ...walk(path.join(root, 'integrations')),
  ...walk(path.join(root, 'tools')),
]) {
  run(['--check', file], `syntax ${path.relative(root, file)}`);
}

const behavior = [
  'tools/verify-no-legacy-ui.mjs',
  'tools/verify-no-legacy-ui-meta.mjs',
  'tools/verify-pwa.mjs',
  'tools/test-scene-runtime-facade.mjs',
  'tools/test-world-sandbox-runtime.mjs',
  'tools/test-world-sandbox.mjs',
  'tools/test-world-sandbox-growth.mjs',
  'tools/test-world-sandbox-vine.mjs',
  'tools/test-world-sandbox-life-state.mjs',
  'tools/test-world-sandbox-light.mjs',
  'tools/test-world-sandbox-mesh.mjs',
  'tools/test-erosion-heightfield.mjs',
  'tools/test-granular-solver.mjs',
  'tools/test-erosion-granular-bridge.mjs',
  'tools/test-webgpu-shader-compile.mjs',
  'tools/test-active-spatial-path.mjs',
  'tools/test-spatial-navigation.mjs',
  'tools/test-cost-format.mjs',
  'tools/test-minizip.mjs',
  'tools/test-content-lint.mjs',
  'tools/test-production-adapter.mjs',
  'tools/test-style-discovery.mjs',
  'tools/test-gpu-spatial.mjs',
];

for (const relative of behavior) {
  if (fs.existsSync(path.join(root, relative))) run([relative], relative);
}

console.log('SHADED UI-zero check: PASS');
