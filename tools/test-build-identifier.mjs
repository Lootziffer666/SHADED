// GOAL_WORLD.md G-2819 / GOAL_FOUNDATION.md F-0124: a delivered instance must be unambiguously
// traceable to the exact commit it was built from. This proves the wiring exists end to end
// (vite.config.js's real `git rev-parse HEAD` define -> main.js's debug handle) without needing a
// full Vite build -- this repo has no headless browser boot available (see Task 4's own note on
// WebGPU crashing on a real scene), so the actual runtime value can't be read back here, only the
// source-level contract that would produce it.
import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const viteConfig = readFileSync(join(REPO_ROOT, 'vite.config.js'), 'utf8');
ok(/execSync\(\s*["']git rev-parse HEAD["']/.test(viteConfig), 'vite.config.js derives the commit SHA from a real `git rev-parse HEAD` call, not a hardcoded string');
ok(/catch\s*\{\s*return\s*["']unknown["']/.test(viteConfig), 'vite.config.js falls back to "unknown" (never a fabricated SHA) if git is unavailable at build time');
ok(viteConfig.includes('__SHADED_COMMIT_SHA__: JSON.stringify(commitSha())'), 'vite.config.js exposes the real commit SHA as __SHADED_COMMIT_SHA__ via define');
ok(viteConfig.includes('__SHADED_BUILD_TIME__:'), 'vite.config.js exposes a build timestamp as __SHADED_BUILD_TIME__ via define');

// Sanity: the shell command itself resolves in this repo right now (proves the mechanism is not
// just plausible-looking text but an actually-working command in this checkout).
const sha = execSync('git rev-parse HEAD', {cwd: REPO_ROOT}).toString().trim();
ok(/^[0-9a-f]{40}$/.test(sha), `git rev-parse HEAD resolves to a real 40-hex-char commit SHA in this checkout (${sha})`);

const mainJs = readFileSync(join(REPO_ROOT, 'src/main.js'), 'utf8');
ok(mainJs.includes('commitSha: __SHADED_COMMIT_SHA__'), 'src/main.js reads __SHADED_COMMIT_SHA__ into its buildInfo');
ok(mainJs.includes('buildTime: __SHADED_BUILD_TIME__'), 'src/main.js reads __SHADED_BUILD_TIME__ into its buildInfo');
ok(/globalThis\.SHADED_RUNTIME\s*=\s*\{[\s\S]{0,400}buildInfo/.test(mainJs), 'the debug handle (globalThis.SHADED_RUNTIME) exposes buildInfo, so a running instance can be asked which commit it is');

console.log('\n✅ Build/commit identifier: real git-derived SHA wired from vite.config.js through to the runtime debug handle');
