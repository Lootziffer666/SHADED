#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const host = process.env.SHADED_HOST || '127.0.0.1';
const port = Number(process.env.SHADED_PORT || 49666);
const maxBody = 64 * 1024 * 1024;
const python = process.platform === 'win32'
  ? path.join(root, '.venv-depth-win', 'Scripts', 'python.exe')
  : path.join(root, '.venv-depth', 'bin', 'python');

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.wasm', 'application/wasm'], ['.bin', 'application/octet-stream'],
]);

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBody) {
        reject(new Error('Bild ist fuer den lokalen Bridge-Upload zu gross.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(new Error(`Ungueltiges JSON: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        HF_HUB_DISABLE_TELEMETRY: '1',
        HF_HUB_DISABLE_PROGRESS_BARS: '1',
        PYTHONUTF8: '1',
        ...options.env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data.toString(); if (stdout.length > 20000) stdout = stdout.slice(-20000); });
    child.stderr.on('data', data => { stderr += data.toString(); if (stderr.length > 20000) stderr = stderr.slice(-20000); });
    child.once('error', error => resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}`.trim() }));
    child.once('exit', code => resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

const providerDefinitions = {
  'depth-anything-3': {
    script: 'tools/providers/shaded_depth_anything_3.py',
    model: 'depth-anything/DA3-SMALL',
  },
  'depth-anything-v2': {
    script: 'tools/providers/depth_anything_v2.py',
    model: 'depth-anything/Depth-Anything-V2-Small-hf',
  },
};

function providerOrder(requested) {
  if (requested === 'software') return [];
  if (requested === 'depth-anything-v2') return ['depth-anything-v2'];
  return ['depth-anything-3', 'depth-anything-v2'];
}

async function runProvider(name, input, output, options) {
  const definition = providerDefinitions[name];
  if (!definition) return { ok: false, provider: name, message: 'Unbekannter Provider.' };
  if (!fs.existsSync(python)) return { ok: false, provider: name, message: `Python-Umgebung fehlt: ${python}` };
  const script = path.join(root, definition.script);
  if (!fs.existsSync(script)) return { ok: false, provider: name, message: `Provider-Skript fehlt: ${definition.script}` };

  const args = [
    script,
    '--input', input,
    '--output', output,
    '--device', 'cuda:0',
    '--precision', 'fp16',
    '--max-edge', String(options.maxEdge),
    '--point-budget', String(options.pointBudget),
    '--model', options.model || definition.model,
  ];
  const result = await run(python, args);
  if (result.code !== 0) {
    return {
      ok: false,
      provider: name,
      message: result.stderr.split(/\r?\n/).filter(Boolean).slice(-8).join('\n') || `Exit ${result.code}`,
    };
  }

  const manifest = path.join(output, 'result.json');
  if (!fs.existsSync(manifest)) return { ok: false, provider: name, message: 'Provider lieferte kein result.json.' };
  const bundlePath = path.join(output, 'bundle.shaded-provider.json');
  const bundled = await run(process.execPath, ['tools/gpu-spatial.mjs', 'bundle', '--manifest', manifest, '--out', bundlePath]);
  if (bundled.code !== 0 || !fs.existsSync(bundlePath)) {
    return { ok: false, provider: name, message: bundled.stderr || bundled.stdout || 'Bundle konnte nicht gebaut werden.' };
  }
  return { ok: true, provider: name, bundle: JSON.parse(fs.readFileSync(bundlePath, 'utf8')) };
}

async function generate(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message });
  }

  const requested = payload.provider || 'auto';
  if (!payload.imageBase64 || typeof payload.imageBase64 !== 'string') {
    return json(res, 400, { ok: false, error: 'imageBase64 fehlt.' });
  }
  if (requested === 'software') {
    return json(res, 200, { ok: true, fallback: 'software', attempts: [] });
  }

  const ext = payload.mime === 'image/jpeg' ? '.jpg' : payload.mime === 'image/webp' ? '.webp' : '.png';
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shaded-world-'));
  const input = path.join(tempRoot, `input${ext}`);
  const raw = payload.imageBase64.includes(',') ? payload.imageBase64.split(',').pop() : payload.imageBase64;
  fs.writeFileSync(input, Buffer.from(raw, 'base64'));

  const options = {
    maxEdge: Math.max(256, Math.min(4096, Number(payload.maxEdge) || 1024)),
    pointBudget: Math.max(1000, Math.min(4000000, Number(payload.pointBudget) || 500000)),
    model: typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : null,
  };
  const attempts = [];
  try {
    for (const provider of providerOrder(requested)) {
      const output = path.join(tempRoot, provider.replace(/[^a-z0-9-]/gi, '_'));
      fs.mkdirSync(output, { recursive: true });
      const result = await runProvider(provider, input, output, options);
      attempts.push({ provider, ok: result.ok, message: result.message || null });
      if (result.ok) {
        return json(res, 200, { ok: true, provider, bundle: result.bundle, attempts });
      }
    }
    return json(res, 200, { ok: true, fallback: 'software', attempts });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function safeStaticPath(urlPath) {
  let pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (pathname === '/') pathname = '/editor/';
  if (pathname.endsWith('/')) pathname += 'index.html';
  const candidate = path.resolve(root, `.${pathname}`);
  if (!candidate.startsWith(root + path.sep)) return null;
  return candidate;
}

function serveStatic(req, res) {
  const file = safeStaticPath(req.url);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const type = mime.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }
  if (req.url?.startsWith('/api/health')) {
    return json(res, 200, {
      ok: true,
      name: 'SHADED local bridge',
      python: fs.existsSync(python),
      cudaVenv: python,
      providers: Object.fromEntries(Object.entries(providerDefinitions).map(([name, definition]) => [name, fs.existsSync(path.join(root, definition.script))])),
    });
  }
  if (req.url?.startsWith('/api/generate') && req.method === 'POST') return generate(req, res);
  return serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`SHADED local bridge: http://${host}:${port}/editor/`);
  console.log('Bild laden -> Modell waehlen -> Erzeugen. Provider laufen nur bei Bedarf; Fehler fallen automatisch weiter.');
});
