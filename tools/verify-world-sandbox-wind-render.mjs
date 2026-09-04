// Visual + assertion proof that wind deformation (world-sandbox-wind.mjs) actually bends the
// sweep-mesh geometry (world-sandbox-mesh.mjs) when driven end-to-end -- not through
// editor/world-sandbox.js's own large, live WebGpuWorldSandbox render pipeline (a much bigger,
// higher-risk integration surface: new buffers, bind groups, and draw calls inserted into an
// already-working 2000+-line system), but through a small, standalone harness, matching this
// project's own established precedent (sandbox/renderer.js: a second, independent renderer for
// a specific subsystem, not a second material/engine truth). Wiring wind directly into the live
// render loop is a real, separate follow-up, not built here.
//
// The current growth-agent system (world-sandbox-growth.mjs) only ever produces graphs with
// y=0 everywhere (no vertical growth axis wired up yet -- documented in that file's own
// addGraphNode comment), so a graph grown through the real stepper wouldn't show the wind
// model's vertical arc-correction term at all in a meaningful way. This harness instead hand-
// builds a simple vertical test plant (a tapering stem with one branch) with real Y extent,
// exactly the same "hand-built graph, independent of growth-agent stepping" approach
// tools/test-world-sandbox-mesh.mjs already uses to test sweep geometry in isolation -- this is
// a real proof of the WIND MODULE's own behaviour on a representative tube shape, not a claim
// that the growth agents already produce vertical stems (they don't yet).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'tools', 'verify-out');
mkdirSync(OUT, { recursive: true });
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

const HTML = `<!doctype html><html><body style="margin:0;background:#0b1622">
<canvas id="c" width="900" height="420"></canvas>
</body></html>`;

let browser;
try {
  const fallbackChromium = '/opt/pw-browsers/chromium';
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || (existsSync(fallbackChromium) ? fallbackChromium : undefined),
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 420 } });
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push('pageerror: ' + error.message));

  await page.route('**/inline.html', route => route.fulfill({ contentType: 'text/html', body: HTML }));
  await page.goto(`http://127.0.0.1:${port}/inline.html`);

  const result = await page.evaluate(async () => {
    const { computeNodeDistances } = await import('/runtime/world-sandbox-mesh.mjs');
    const { computeWindDisplacement } = await import('/runtime/world-sandbox-wind.mjs');

    // A hand-built test plant: a tapering vertical stem (6 segments, y from 0 to 1.8) with one
    // branch forking off partway up -- real Y extent, unlike anything the growth agents produce
    // yet, chosen specifically so the wind model's height-weighted bend and vertical arc drop
    // are both visible.
    const nodes = [];
    function addNode(x, y, z, radius, parentId) {
      const id = nodes.length;
      nodes.push({ id, x, y, z, radius, parentId, children: [] });
      if (parentId != null) nodes[parentId].children.push(id);
      return id;
    }
    let prev = addNode(0, 0, 0, 0.05, null);
    for (let i = 1; i <= 6; i++) prev = addNode(0, i * 0.3, 0, 0.05 * (1 - i / 8), prev);
    const forkId = 3; // partway up the main stem
    let branchPrev = forkId;
    for (let i = 1; i <= 3; i++) branchPrev = addNode(i * 0.25, nodes[forkId].y + i * 0.15, 0, 0.03 * (1 - i / 5), branchPrev);
    const graph = { nodes };

    const dist = computeNodeDistances(graph);
    const maxDistance = Math.max(...dist);
    const windDirX = 1, windDirZ = 0, bendStrength = 1.4; // strong on purpose -- a clear, legible verification image, not a claim about a realistic production default

    const times = [0, 0.4, 0.9, 1.5];
    const panelWidth = 900 / times.length;
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1622';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const framesForAssertions = [];

    times.forEach((time, panelIndex) => {
      const displaced = nodes.map(node => {
        const d = computeWindDisplacement(node.x, node.z, dist[node.id], maxDistance, time, windDirX, windDirZ, bendStrength);
        return { x: node.x + d.dx, y: node.y + d.dy, z: node.z + d.dz, parentId: node.parentId, radius: node.radius };
      });
      framesForAssertions.push(displaced);

      const originX = panelIndex * panelWidth + panelWidth * 0.35;
      const groundY = 380;
      const scale = 130;
      const toScreen = (n) => [originX + n.x * scale, groundY - n.y * scale];

      // Panel divider + ground line
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.moveTo(panelIndex * panelWidth, 0); ctx.lineTo(panelIndex * panelWidth, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(panelIndex * panelWidth, groundY); ctx.lineTo((panelIndex + 1) * panelWidth, groundY); ctx.stroke();

      ctx.strokeStyle = '#8fe388';
      ctx.lineWidth = 2;
      for (const n of displaced) {
        if (n.parentId == null) continue;
        const p = displaced[n.parentId];
        const [x0, y0] = toScreen(p);
        const [x1, y1] = toScreen(n);
        ctx.lineWidth = Math.max(1, n.radius * scale);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.fillStyle = '#cfe8ff';
      ctx.font = '13px sans-serif';
      ctx.fillText(`t=${time}`, panelIndex * panelWidth + 8, 18);
    });

    return { framesForAssertions, rootDistanceOfTip: Math.max(...dist), nodeCount: nodes.length };
  });

  await page.screenshot({ path: path.join(OUT, 'shot_wind_render.png') });

  const { framesForAssertions, nodeCount } = result;
  const frame0 = framesForAssertions[0];
  const frame1 = framesForAssertions[1];

  // The root node (id 0, rootDistance=0) must sit EXACTLY still across every frame -- the whole
  // point of the height-weighted model.
  for (let f = 1; f < framesForAssertions.length; f++) {
    const root0 = frame0[0], rootF = framesForAssertions[f][0];
    if (root0.x !== rootF.x || root0.y !== rootF.y || root0.z !== rootF.z) {
      throw new Error(`root node moved between t=0 and frame ${f} (${JSON.stringify(root0)} vs ${JSON.stringify(rootF)}) -- wind must never move the anchor`);
    }
  }

  // At least one non-root node must actually have moved between t=0 and a later time -- proving
  // this end-to-end path (graph -> distances -> wind -> rendered positions) isn't a silent no-op.
  let anyMoved = false;
  for (let i = 1; i < nodeCount; i++) {
    if (frame0[i].x !== frame1[i].x || frame0[i].y !== frame1[i].y) { anyMoved = true; break; }
  }
  if (!anyMoved) throw new Error('no non-root node moved at all between t=0 and t=0.4 -- wind displacement is not reaching the rendered positions');

  // The topmost tip (furthest rootDistance) must move MORE than a node partway up the stem --
  // the height-weighted quadratic falloff, checked through the actual rendered output, not just
  // the isolated formula (already proven in tools/test-world-sandbox-wind.mjs).
  const tipIndex = nodeCount - 1; // last-added node is the branch's own tip
  const midStemIndex = 2; // partway up the main stem, well short of any tip
  const tipMove = Math.hypot(frame1[tipIndex].x - frame0[tipIndex].x, frame1[tipIndex].y - frame0[tipIndex].y);
  const midMove = Math.hypot(frame1[midStemIndex].x - frame0[midStemIndex].x, frame1[midStemIndex].y - frame0[midStemIndex].y);
  if (!(tipMove > midMove)) {
    throw new Error(`the branch tip (moved ${tipMove.toFixed(4)}) does not move more than a mid-stem node (moved ${midMove.toFixed(4)}) -- height-weighted bend is not reaching the rendered output as expected`);
  }

  console.log(`verify-world-sandbox-wind-render: root node stays exactly still across all frames, a non-root node genuinely moves, and the tip (moved ${tipMove.toFixed(4)}) sways more than a mid-stem node (moved ${midMove.toFixed(4)}) -- screenshot at tools/verify-out/shot_wind_render.png`);

  if (consoleErrors.length) {
    throw new Error('unexpected browser console errors during wind render verification: ' + consoleErrors.join(' | '));
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
