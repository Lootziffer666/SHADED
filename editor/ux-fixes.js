// Hard UX contract for the authoring shell. The viewport stays visible and only
// the requested inspector section opens over it.
const body = document.body;
const status = document.getElementById('editor-status');

const railButtons = () => [...document.querySelectorAll('.rail-btn[data-target]')];
const sections = () => [...document.querySelectorAll('.inspector-section')];
const setStatus = text => { if (status) status.textContent = text; };

function closeInspector() {
  body.classList.remove('inspector-open');
  body.classList.add('inspector-collapsed');
  document.getElementById('btn-inspector-toggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('btn-inspector-mobile')?.setAttribute('aria-expanded', 'false');
}
function openInspector(targetId) {
  body.classList.remove('inspector-collapsed');
  body.classList.add('inspector-open');
  document.getElementById('btn-inspector-toggle')?.setAttribute('aria-expanded', 'true');
  document.getElementById('btn-inspector-mobile')?.setAttribute('aria-expanded', 'true');
  sections().forEach(section => section.classList.toggle('section-collapsed', section.id !== targetId));
  const target = document.getElementById(targetId);
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}
function clearActive() { railButtons().forEach(button => button.classList.remove('active')); }
function closeChrome() { closeInspector(); clearActive(); }

sections().forEach(section => section.classList.add('section-collapsed'));
closeChrome();

document.addEventListener('click', event => {
  const rail = event.target.closest('.rail-btn[data-target]');
  if (rail) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = rail.dataset.target;
    const shouldOpen = !(rail.classList.contains('active') && body.classList.contains('inspector-open'));
    closeChrome();
    if (shouldOpen) {
      rail.classList.add('active');
      openInspector(target);
      if (target === 'panel-paint') seedCorrectionCanvasFromScene();
    }
    return;
  }

  const title = event.target.closest('.inspector-section > .section-title');
  if (title) {
    event.preventDefault();
    event.stopImmediatePropagation();
    title.parentElement?.classList.toggle('section-collapsed');
    return;
  }

  if (event.target.closest('#btn-inspector-toggle') || event.target.closest('#btn-inspector-mobile')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (body.classList.contains('inspector-open')) closeChrome();
    else {
      clearActive();
      const world = document.querySelector('.rail-btn[data-target="panel-world"]');
      world?.classList.add('active');
      openInspector('panel-world');
    }
  }
}, true);

window.addEventListener('keydown', event => { if (event.key === 'Escape') closeChrome(); });

// Klick in den Viewport (außerhalb des Spatial-Viewers) schließt offene
// Inspector-Panels. runtime/spatial-solid-runtime.js wird jetzt statisch in
// index.html geladen, nicht mehr dynamisch in ein iframe-Dokument injiziert.
const previewWrap = document.getElementById('preview-wrap');
previewWrap?.addEventListener('pointerdown', event => {
  if (event.target.closest?.('#spatial-viewer')) return;
  if (event.target.closest?.('.actor-marker')) return;
  closeChrome();
}, true);

// Material correction canvas
const paintCanvas = document.getElementById('paint-canvas');
const paintCtx = paintCanvas?.getContext('2d', { willReadFrequently: true });
let correctionBase = null;
let correctionChanged = false;
let correctionPainting = false;

const paintRailLabel = document.querySelector('.rail-btn[data-target="panel-paint"] b');
if (paintRailLabel) paintRailLabel.textContent = 'Korr.';
const paintHeading = document.querySelector('#panel-paint .section-title h2');
if (paintHeading) paintHeading.textContent = 'Materialkorrektur';

function activeBrushColor() {
  const active = document.querySelector('#palette-buttons .swatch.active');
  return active ? getComputedStyle(active).backgroundColor : '#ff33cc';
}

function seedCorrectionCanvasFromScene() {
  if (!paintCanvas || !paintCtx) return false;
  const source = document.getElementById('gl') || document.querySelector('#canvas-wrap canvas');
  if (!source || !source.width || !source.height) {
    setStatus('Korrektur: erst eine Szene laden/erstellen.');
    return false;
  }
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / source.width);
  paintCanvas.width = Math.max(1, Math.round(source.width * scale));
  paintCanvas.height = Math.max(1, Math.round(source.height * scale));
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  try {
    paintCtx.drawImage(source, 0, 0, paintCanvas.width, paintCanvas.height);
    correctionBase = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
    correctionChanged = false;
    setStatus('Korrektur bereit: Bereiche markieren, dann „Auf Szene anwenden“.');
    return true;
  } catch {
    setStatus('⚠️ Aktuelle Szene konnte nicht in die Korrekturfläche übernommen werden.');
    return false;
  }
}

function canvasPoint(event) {
  const rect = paintCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * paintCanvas.width / Math.max(1, rect.width),
    y: (event.clientY - rect.top) * paintCanvas.height / Math.max(1, rect.height)
  };
}
function correctionPaint(event) {
  if (!correctionBase || !paintCtx) return;
  const { x, y } = canvasPoint(event);
  const visualRadius = Number(document.getElementById('brush-size')?.value || 12);
  const scale = paintCanvas.width / Math.max(1, paintCanvas.getBoundingClientRect().width);
  paintCtx.fillStyle = activeBrushColor();
  paintCtx.beginPath();
  paintCtx.arc(x, y, Math.max(2, visualRadius * scale), 0, Math.PI * 2);
  paintCtx.fill();
  correctionChanged = true;
}
paintCanvas?.addEventListener('pointerdown', event => {
  if (!correctionBase && !seedCorrectionCanvasFromScene()) return;
  correctionPainting = true;
  paintCanvas.setPointerCapture?.(event.pointerId);
  correctionPaint(event);
}, true);
paintCanvas?.addEventListener('pointermove', event => { if (correctionPainting) correctionPaint(event); }, true);
paintCanvas?.addEventListener('pointerup', () => { correctionPainting = false; }, true);
paintCanvas?.addEventListener('pointercancel', () => { correctionPainting = false; }, true);

document.getElementById('f-paint-source')?.addEventListener('change', () => {
  setTimeout(() => {
    if (!paintCtx || !paintCanvas.width || !paintCanvas.height) return;
    try { correctionBase = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height); correctionChanged = false; } catch {}
  }, 120);
});
document.getElementById('btn-paint-clear')?.addEventListener('click', event => {
  if (!correctionBase || !paintCtx) return;
  event.preventDefault(); event.stopImmediatePropagation();
  paintCtx.putImageData(correctionBase, 0, 0); correctionChanged = false; setStatus('Korrektur zurückgesetzt.');
}, true);
document.getElementById('btn-paint-apply')?.addEventListener('click', event => {
  if (!correctionChanged || !paintCanvas) return;
  event.preventDefault(); event.stopImmediatePropagation();
  paintCanvas.toBlob(async blob => {
    if (!blob) return;
    if (!window.SHADED?.loadImageFile) return setStatus('⚠️ Engine ist noch nicht bereit.');
    try {
      const file = new File([blob], 'marker-overlay.png', { type: 'image/png' });
      await window.SHADED.loadImageFile(file, true);
      setStatus('Materialkorrektur übernommen — „Erstellen“ aktualisiert die Szene.');
      correctionChanged = false;
    } catch (error) { setStatus(`⚠️ Korrektur konnte nicht übernommen werden: ${error.message}`); }
  }, 'image/png');
}, true);
