// Hard UX contract for the authoring shell.
// This file intentionally sits after app.js/ui-shell.js and owns only interaction
// state. It exists so a stale older shell cannot leave Inspector + Story stacked
// over the viewport again.

const body = document.body;
const iframe = document.getElementById('engine-frame');
const inspector = document.getElementById('inspector');
const status = document.getElementById('editor-status');

const railButtons = () => [...document.querySelectorAll('.rail-btn[data-target]')];
const sections = () => [...document.querySelectorAll('.inspector-section')];

function setStatus(text) {
  if (status) status.textContent = text;
}

function closeInspector() {
  body.classList.remove('inspector-open');
  body.classList.add('inspector-collapsed');
  document.getElementById('btn-inspector-toggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('btn-inspector-mobile')?.setAttribute('aria-expanded', 'false');
}

function openInspector(targetId) {
  body.classList.remove('story-open');
  body.classList.remove('inspector-collapsed');
  body.classList.add('inspector-open');
  document.getElementById('btn-inspector-toggle')?.setAttribute('aria-expanded', 'true');
  document.getElementById('btn-inspector-mobile')?.setAttribute('aria-expanded', 'true');
  sections().forEach(section => section.classList.toggle('section-collapsed', section.id !== targetId));
  const target = document.getElementById(targetId);
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}

function closeStory() {
  body.classList.remove('story-open');
}

function clearActive() {
  railButtons().forEach(button => button.classList.remove('active'));
}

function closeChrome() {
  closeInspector();
  closeStory();
  clearActive();
}

// Start from the only acceptable idle state: scene visible, tools absent.
sections().forEach(section => section.classList.add('section-collapsed'));
closeChrome();

// Capture before older/stale shell handlers can run. One tap always toggles the
// requested tool; a second tap on the same tool always closes it.
document.addEventListener('click', event => {
  const rail = event.target.closest('.rail-btn[data-target]');
  if (rail) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = rail.dataset.target;
    const sameActive = rail.classList.contains('active');

    if (target === 'timeline-dock') {
      const shouldOpen = !(sameActive && body.classList.contains('story-open'));
      closeInspector();
      closeStory();
      clearActive();
      if (shouldOpen) {
        body.classList.add('story-open');
        rail.classList.add('active');
      }
      return;
    }

    const shouldOpen = !(sameActive && body.classList.contains('inspector-open'));
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
    return;
  }

  if (event.target.closest('#btn-story-close')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeChrome();
    return;
  }

  const room = event.target.closest('#btn-room-view');
  if (room) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeChrome();
    const doc = iframe?.contentDocument;
    const button = doc?.getElementById('btn-spatial-view');
    if (!button) {
      setStatus('⚠️ Raumansicht ist noch nicht bereit.');
      return;
    }
    button.click();
    // The spatial runtime itself switches to walk mode after its own reconstruction.
    setTimeout(() => {
      try { iframe.contentWindow?.SHADED?.spatial?.viewer?.setMode?.('walk'); } catch {}
    }, 30);
    return;
  }
}, true);

// Escape and a tap into the actual renderer dismiss authoring chrome.
window.addEventListener('keydown', event => { if (event.key === 'Escape') closeChrome(); });

function installEngineHooks() {
  const doc = iframe?.contentDocument;
  if (!doc?.head || !doc.body) return;

  if (!doc.querySelector('script[data-solid-runtime]')) {
    const script = doc.createElement('script');
    script.type = 'module';
    script.src = '/runtime/spatial-solid-runtime.js?v=7';
    script.dataset.solidRuntime = '1';
    doc.head.appendChild(script);
  }

  if (!doc.body.dataset.editorDismissHook) {
    doc.body.dataset.editorDismissHook = '1';
    doc.addEventListener('pointerdown', event => {
      // Do not interpret taps on room controls as an outer-editor dismiss action;
      // RAUM already starts with outer chrome closed anyway.
      if (event.target.closest?.('#spatial-viewer')) return;
      closeChrome();
    }, true);
  }
}

iframe?.addEventListener('load', installEngineHooks);
if (iframe?.contentDocument?.readyState === 'complete') installEngineHooks();

// ---- Material correction canvas -------------------------------------------------
// This was previously exposed as generic "Paint" although it is actually SHADED's
// marker/material correction overlay. Seed it from the current live scene so it is
// immediately paintable instead of presenting an inert checkerboard.
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
  const doc = iframe?.contentDocument;
  const source = doc?.getElementById('gl') || doc?.querySelector('#canvas-wrap canvas');
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
paintCanvas?.addEventListener('pointermove', event => {
  if (correctionPainting) correctionPaint(event);
}, true);
paintCanvas?.addEventListener('pointerup', () => { correctionPainting = false; }, true);
paintCanvas?.addEventListener('pointercancel', () => { correctionPainting = false; }, true);

// If the user explicitly loads another correction source, snapshot that as our base
// after the existing MarkerPainter has decoded it.
document.getElementById('f-paint-source')?.addEventListener('change', () => {
  setTimeout(() => {
    if (!paintCtx || !paintCanvas.width || !paintCanvas.height) return;
    try { correctionBase = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height); correctionChanged = false; } catch {}
  }, 120);
});

document.getElementById('btn-paint-clear')?.addEventListener('click', event => {
  if (!correctionBase || !paintCtx) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  paintCtx.putImageData(correctionBase, 0, 0);
  correctionChanged = false;
  setStatus('Korrektur zurückgesetzt.');
}, true);

document.getElementById('btn-paint-apply')?.addEventListener('click', event => {
  if (!correctionChanged || !paintCanvas) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  paintCanvas.toBlob(async blob => {
    if (!blob) return;
    const win = iframe?.contentWindow;
    if (!win?.SHADED?.loadImageFile) { setStatus('⚠️ Engine ist noch nicht bereit.'); return; }
    try {
      const file = new File([blob], 'marker-overlay.png', { type: 'image/png' });
      await win.SHADED.loadImageFile(file, true);
      setStatus('Materialkorrektur übernommen — „Erstellen“ aktualisiert die Szene.');
      correctionChanged = false;
    } catch (error) {
      setStatus(`⚠️ Korrektur konnte nicht übernommen werden: ${error.message}`);
    }
  }, 'image/png');
}, true);
