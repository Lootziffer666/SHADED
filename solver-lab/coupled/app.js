// SHADED Solver Lab — Erosion × Granular gekoppelt. Dünne Canvas-Schicht,
// kennt selbst keine Solver-Logik -- sie liest nur die drei runtime/solver/-
// Module und die Brücke dazwischen.
import {
  createHeightfield, generateHills, erode, heightRange, toGrayscaleRGBA,
} from '../../runtime/solver/erosion-heightfield.js';
import { createGrid, step, countMaterial, toRGBA, MATERIAL } from '../../runtime/solver/granular-grid.js';
import {
  profileFromHeightfield, applyTerrainProfile, erosionDelta, spawnErodedSediment,
} from '../../runtime/solver/erosion-granular-bridge.js';

const FIELD_SIZE = 120;
const GRID_W = 120, GRID_H = 70;
const PROFILE_ROW = Math.floor(FIELD_SIZE / 2);

const heightCanvas = document.getElementById('height-canvas');
const heightCtx = heightCanvas.getContext('2d');
const gridCanvas = document.getElementById('grid-canvas');
const gridCtx = gridCanvas.getContext('2d');

let field, grid, referenceRange, runs = 0, dropletsTotal = 0, playing = true, lastStepMs = 0;

function reseed(seedValue) {
  field = createHeightfield(FIELD_SIZE, FIELD_SIZE);
  generateHills(field, seedValue, 8);
  referenceRange = heightRange(field); // feste Referenzskala über alle folgenden Läufe hinweg
  grid = createGrid(GRID_W, GRID_H);
  const profile = profileFromHeightfield(field, PROFILE_ROW);
  applyTerrainProfile(grid, profile, referenceRange);
  runs = 0; dropletsTotal = 0;
  drawHeight();
  drawGrid();
  updateStatus();
}

function drawHeight() {
  const rgba = toGrayscaleRGBA(field);
  const img = new ImageData(new Uint8ClampedArray(rgba.buffer), FIELD_SIZE, FIELD_SIZE);
  heightCtx.putImageData(img, 0, 0);
  // markierte Profilzeile
  heightCtx.fillStyle = 'rgba(255, 90, 90, 0.9)';
  heightCtx.fillRect(0, PROFILE_ROW, FIELD_SIZE, 1);
}

function drawGrid() {
  const rgba = toRGBA(grid);
  gridCtx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), GRID_W, GRID_H), 0, 0);
}

function updateStatus() {
  document.getElementById('status-runs').textContent = String(runs);
  document.getElementById('status-droplets').textContent = String(dropletsTotal);
  document.getElementById('status-sand').textContent = String(countMaterial(grid, MATERIAL.SAND));
  document.getElementById('status-step').textContent = String(grid.step);
}

function erodeAndTransfer(dropletCount) {
  const before = profileFromHeightfield(field, PROFILE_ROW);
  erode(field, dropletCount, runs * 10007 + 1); // Lauf-abhängiger, aber deterministischer Seed
  const after = profileFromHeightfield(field, PROFILE_ROW);

  const groundY = applyTerrainProfile(grid, after, referenceRange);
  spawnErodedSediment(grid, erosionDelta(before, after), groundY);

  runs++; dropletsTotal += dropletCount;
  drawHeight();
  drawGrid();
  updateStatus();
}

function tick(nowMs) {
  if (playing && nowMs - lastStepMs >= 1000 / 12) {
    lastStepMs = nowMs;
    step(grid);
    drawGrid();
    updateStatus();
  }
  requestAnimationFrame(tick);
}

document.getElementById('btn-erode-transfer').addEventListener('click', () => erodeAndTransfer(500));
document.getElementById('btn-play-granular').addEventListener('click', (e) => {
  playing = !playing;
  e.target.textContent = playing ? '▶ Granular läuft' : '⏸ Granular pausiert';
  e.target.classList.toggle('active', playing);
});
document.getElementById('btn-reset').addEventListener('click', () => {
  reseed(Number(document.getElementById('seed-input').value) || 0);
});

reseed(Number(document.getElementById('seed-input').value) || 1);
requestAnimationFrame(tick);

// Test-/Debug-Zugriff, gleiches Prinzip wie window.SHADED (CLAUDE.md) und
// die Nachbar-Lab-Seiten.
window.__coupledLab = {
  erodeAndTransfer,
  countSand: () => countMaterial(grid, MATERIAL.SAND),
  step: () => { step(grid); drawGrid(); updateStatus(); },
};
