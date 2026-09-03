// SHADED Solver Lab — Erosion. Dünne Canvas-Schicht, kennt keine
// Solver-Logik — sie liest nur runtime/solver/erosion-heightfield.js.
import {
  createHeightfield, generateHills, erode, totalMass, heightRange, toGrayscaleRGBA,
} from '../../runtime/solver/erosion-heightfield.js';

const SIZE = 128;
const canvas = document.getElementById('height-canvas');
const ctx = canvas.getContext('2d');

let field = createHeightfield(SIZE, SIZE);
let dropletsSoFar = 0;
let baselineMass = 0;

function reseed(seedValue) {
  field = createHeightfield(SIZE, SIZE);
  generateHills(field, seedValue, 8);
  dropletsSoFar = 0;
  baselineMass = totalMass(field);
  draw();
  updateStatus();
}

function draw() {
  const rgba = toGrayscaleRGBA(field);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), SIZE, SIZE), 0, 0);
}

function updateStatus() {
  const { min, max } = heightRange(field);
  const mass = totalMass(field);
  document.getElementById('status-droplets').textContent = String(dropletsSoFar);
  document.getElementById('status-min').textContent = min.toFixed(2);
  document.getElementById('status-max').textContent = max.toFixed(2);
  document.getElementById('status-mass').textContent = mass.toFixed(2);
  const el = document.getElementById('status-conservation');
  const drift = Math.abs(mass - baselineMass);
  const conserved = drift < 1e-6;
  el.textContent = conserved ? 'erhalten' : `Δ=${drift.toExponential(2)}`;
  el.className = conserved ? 'ok' : 'warn';
}

function runDroplets(n) {
  // `|| 1` coerced an explicitly-chosen seed of 0 (a legitimate, allowed minimum value) to
  // 1, so seed-zero erosion runs silently reproduced a different path than the one shown by
  // reset. A finite-value check keeps 0 valid while still falling back for empty/garbage input.
  const rawSeed = Number(document.getElementById('seed-input').value);
  const seed = Number.isFinite(rawSeed) ? rawSeed : 1;
  erode(field, n, seed * 1000 + dropletsSoFar); // Seed wandert mit, damit "10 dann 100" != zwei getrennte Läufe kollidieren
  dropletsSoFar += n;
  draw();
  updateStatus();
}

document.getElementById('btn-erode-10').addEventListener('click', () => runDroplets(10));
document.getElementById('btn-erode-100').addEventListener('click', () => runDroplets(100));
document.getElementById('btn-erode-1000').addEventListener('click', () => runDroplets(1000));
document.getElementById('btn-reset').addEventListener('click', () => {
  reseed(Number(document.getElementById('seed-input').value) || 0);
});

reseed(Number(document.getElementById('seed-input').value) || 1);

// Test-/Debug-Zugriff, gleiches Prinzip wie window.SHADED (CLAUDE.md) und
// window.__granularLab in der Nachbar-Lab-Seite.
window.__erosionLab = {
  totalMass: () => totalMass(field),
  heightRange: () => heightRange(field),
  erode: (n, seed) => { erode(field, n, seed); dropletsSoFar += n; draw(); updateStatus(); },
};
