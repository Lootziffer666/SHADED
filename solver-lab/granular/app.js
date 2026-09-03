// SHADED Solver Lab — Granular. Dünne Canvas-Schicht, kennt keine
// Solver-Logik — sie liest nur runtime/solver/granular-grid.js.
import {
  MATERIAL, createGrid, fillRandom, setCell, step, countMaterial, toRGBA,
} from '../../runtime/solver/granular-grid.js';

const GRID_W = 120, GRID_H = 80;
const canvas = document.getElementById('grid-canvas');
const ctx = canvas.getContext('2d');

let grid = createGrid(GRID_W, GRID_H);
let running = true;
let paintMaterial = MATERIAL.SAND;
let baselineSand = 0, baselineWater = 0;

function reseed(seedValue) {
  grid = createGrid(GRID_W, GRID_H);
  fillRandom(grid, MATERIAL.SAND, 0.22, seedValue);
  fillRandom(grid, MATERIAL.WATER, 0.08, seedValue + 1000);
  baselineSand = countMaterial(grid, MATERIAL.SAND);
  baselineWater = countMaterial(grid, MATERIAL.WATER);
  draw();
  updateStatus();
}

function draw() {
  const rgba = toRGBA(grid);
  const imageData = new ImageData(new Uint8ClampedArray(rgba.buffer), GRID_W, GRID_H);
  ctx.putImageData(imageData, 0, 0);
}

function updateStatus() {
  const sand = countMaterial(grid, MATERIAL.SAND);
  const water = countMaterial(grid, MATERIAL.WATER);
  document.getElementById('status-step').textContent = String(grid.step);
  document.getElementById('status-sand').textContent = String(sand);
  document.getElementById('status-water').textContent = String(water);
  const el = document.getElementById('status-conservation');
  const conserved = sand === baselineSand && water === baselineWater;
  el.textContent = conserved ? 'erhalten (nur Bewegung)' : `verändert (Malen/Löschen aktiv)`;
  el.className = conserved ? 'ok' : 'warn';
}

function tick() {
  if (running) {
    step(grid);
    draw();
    updateStatus();
  }
  requestAnimationFrame(tick);
}

// --- UI-Verdrahtung --------------------------------------------------------
document.getElementById('btn-play').addEventListener('click', (e) => {
  running = !running;
  e.target.textContent = running ? '▶ Start' : '⏸ Pause';
  e.target.classList.toggle('active', running);
});
document.getElementById('btn-step').addEventListener('click', () => { step(grid); draw(); updateStatus(); });
document.getElementById('btn-reset').addEventListener('click', () => {
  reseed(Number(document.getElementById('seed-input').value) || 0);
});

for (const btn of document.querySelectorAll('.material-picker button')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.material-picker button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    paintMaterial = Number(btn.dataset.material);
  });
}

let painting = false;
function paintAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const gx = Math.floor(((clientX - rect.left) / rect.width) * GRID_W);
  const gy = Math.floor(((clientY - rect.top) / rect.height) * GRID_H);
  setCell(grid, gx, gy, paintMaterial);
  draw();
}
canvas.addEventListener('pointerdown', (e) => { painting = true; paintAt(e.clientX, e.clientY); });
window.addEventListener('pointerup', () => { painting = false; });
canvas.addEventListener('pointermove', (e) => { if (painting) paintAt(e.clientX, e.clientY); });

reseed(Number(document.getElementById('seed-input').value) || 1);
requestAnimationFrame(tick);
