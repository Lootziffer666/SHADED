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
let baselineSand = 0;
let stepsPerSecond = Number(document.getElementById('speed-input').value);
let lastStepMs = 0;

function reseed(seedValue) {
  grid = createGrid(GRID_W, GRID_H);
  fillRandom(grid, MATERIAL.SAND, 0.22, seedValue);
  fillRandom(grid, MATERIAL.WATER, 0.08, seedValue + 1000);
  baselineSand = countMaterial(grid, MATERIAL.SAND);
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
  document.getElementById('status-wood').textContent = String(countMaterial(grid, MATERIAL.WOOD));
  document.getElementById('status-log').textContent = String(countMaterial(grid, MATERIAL.LOG));
  document.getElementById('status-fire').textContent = String(countMaterial(grid, MATERIAL.FIRE));
  document.getElementById('status-smoke').textContent = String(countMaterial(grid, MATERIAL.SMOKE));
  document.getElementById('status-ice').textContent = String(countMaterial(grid, MATERIAL.ICE));
  document.getElementById('status-steam').textContent = String(countMaterial(grid, MATERIAL.STEAM));
  const el = document.getElementById('status-conservation');
  // Nur Sand ist noch ein reines Bewegungsmaterial (nie Teil einer
  // Reaktion) -- seit Eis/Feuer/Wasser<->Dampf reagieren, wäre "Wasserzahl
  // == Baseline" keine ehrliche Aussage mehr: Wasser kann durch Kochen
  // verschwinden oder durch Schmelzen entstehen, ganz ohne dass irgendwer
  // etwas gemalt hat.
  const conserved = sand === baselineSand;
  el.textContent = conserved ? 'Sand erhalten (nur Bewegung)' : 'Sand verändert (Malen/Löschen aktiv)';
  el.className = conserved ? 'ok' : 'warn';
}

// Ohne Drosselung lief das hier mit voller Bildwiederholrate (~60
// Generationen/Sekunde) -- für einen Menschen nicht mehr als Bewegung
// wahrnehmbar, nur als "springt sofort in den Endzustand". Das war der
// gemeldete "Wasser nivelliert sich sofort"-Effekt: kein Solver-Bug,
// sondern zu schnelle Wiedergabe. Jetzt zeitakkumuliert auf eine
// einstellbare, tatsächlich beobachtbare Schrittrate gedrosselt.
function tick(nowMs) {
  if (running && nowMs - lastStepMs >= 1000 / stepsPerSecond) {
    lastStepMs = nowMs;
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
document.getElementById('speed-input').addEventListener('input', (e) => {
  stepsPerSecond = Number(e.target.value);
  document.getElementById('speed-readout').textContent = `${stepsPerSecond} Schritte/Sek`;
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
  updateStatus();
}
canvas.addEventListener('pointerdown', (e) => { painting = true; paintAt(e.clientX, e.clientY); });
window.addEventListener('pointerup', () => { painting = false; });
canvas.addEventListener('pointermove', (e) => { if (painting) paintAt(e.clientX, e.clientY); });

reseed(Number(document.getElementById('seed-input').value) || 1);
requestAnimationFrame(tick);

// Kleiner Test-/Debug-Zugriff, gleiches Prinzip wie window.SHADED als
// API-Vertrag für Tests und Agenten (siehe CLAUDE.md) -- exakte
// Grid-Koordinaten statt fragiler Maus-zu-Canvas-Pixel-Umrechnung in
// tools/verify-solver-lab-granular.js.
window.__granularLab = {
  MATERIAL,
  setCell: (x, y, material) => { setCell(grid, x, y, material); draw(); updateStatus(); },
  step: () => { step(grid); draw(); updateStatus(); },
  countMaterial: (material) => countMaterial(grid, material),
};
