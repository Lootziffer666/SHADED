#!/usr/bin/env node
// SHADED – Syntax & Contract Check (CI gate, no browser required).
//
// Validates that core config files are syntactically valid JSON and
// Python provider stubs parse without syntax errors. This is a lightweight
// gate that runs before the browser-based verify suite — it does NOT launch
// a browser. For full visual verification, use `npm run verify`.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let errors = 0;
let checks = 0;

function ok(msg) { checks++; console.log(`  ✓ ${msg}`); }
function fail(msg) { errors++; console.error(`  ✗ ${msg}`); }

// 1. package.json parses
try {
  JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok('package.json valid');
} catch (e) { fail(`package.json invalid: ${e.message}`); }

// 2. Provider config (if present)
const cfgPath = path.join(ROOT, 'tools/gpu-providers.example.json');
if (fs.existsSync(cfgPath)) {
  try {
    JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    ok('gpu-providers.example.json valid');
  } catch (e) { fail(`gpu-providers.example.json invalid: ${e.message}`); }
} else {
  ok('gpu-providers.example.json not present (skipped)');
}

// 3. Python providers parse (if python3 available)
const providersDir = path.join(ROOT, 'tools/providers');
if (fs.existsSync(providersDir)) {
  const pyFiles = fs.readdirSync(providersDir).filter(f => f.endsWith('.py'));
  for (const f of pyFiles) {
    try {
      execSync(`python3 -c "import ast; ast.parse(open('${providersDir}/${f}').read())"`, { stdio: 'pipe' });
      ok(`python syntax: ${f}`);
    } catch (e) {
      fail(`python syntax: ${f} — ${e.stderr?.toString().trim() || e.message}`);
    }
  }
}

// 4. Verify tool files parse as valid JS (node --check)
const toolsDir = path.join(ROOT, 'tools');
if (fs.existsSync(toolsDir)) {
  const jsTools = fs.readdirSync(toolsDir).filter(f => f.endsWith('.cjs') || f.endsWith('.mjs'));
  for (const f of jsTools) {
    try {
      execSync(`node --check ${path.join(toolsDir, f)}`, { stdio: 'pipe' });
      ok(`js syntax: tools/${f}`);
    } catch (e) {
      fail(`js syntax: tools/${f} — ${e.stderr?.toString().trim() || e.message}`);
    }
  }
}

console.log(`\n${checks} checks, ${errors} failures`);
if (errors > 0) process.exit(1);
