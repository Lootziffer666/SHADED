// SHADED ist der Editor: die Engine läuft im selben Dokument (kein <iframe>
// mehr). Layout/Fullscreen-Regeln für den Viewport stehen jetzt statisch in
// editor/engine-shell.css statt hier per <style> in ein iframe-Dokument
// injiziert zu werden (frühere injectEnginePresentation()).
const body = document.body;
const inspector = document.getElementById('inspector');
const inspectorToggle = document.getElementById('btn-inspector-toggle');
const inspectorMobile = document.getElementById('btn-inspector-mobile');
const roomButton = document.getElementById('btn-room-view');
const createTop = document.getElementById('btn-erstellen');
const createPanel = document.getElementById('btn-erstellen-panel');
const state = document.getElementById('engine-state');
const viewportStatus = document.getElementById('viewport-status');
const editorStatus = document.getElementById('editor-status');

if (!document.querySelector('link[data-viewport-first]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/editor/viewport-first.css';
  link.dataset.viewportFirst = '1';
  document.head.appendChild(link);
}

const inspectorIsOpen = () => body.classList.contains('inspector-open');

function setInspector(open) {
  body.classList.toggle('inspector-open', !!open);
  body.classList.toggle('inspector-collapsed', !open);
  inspectorToggle?.setAttribute('aria-expanded', String(!!open));
  inspectorMobile?.setAttribute('aria-expanded', String(!!open));
}

function prepareCollapsibleSections() {
  document.querySelectorAll('.inspector-section').forEach((section) => {
    const title = section.querySelector(':scope > .section-title');
    if (!title || title.dataset.collapseReady === '1') return;
    title.dataset.collapseReady = '1';
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    section.classList.add('section-collapsed');
    const toggle = () => section.classList.toggle('section-collapsed');
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });
  });
}

function revealSection(id, exclusive = true) {
  const section = document.getElementById(id);
  if (!section) return;
  if (exclusive) document.querySelectorAll('.inspector-section').forEach(candidate => candidate.classList.toggle('section-collapsed', candidate !== section));
  else section.classList.remove('section-collapsed');
  requestAnimationFrame(() => section.scrollIntoView({ block: 'start', behavior: 'smooth' }));
}

function openSection(id) {
  setInspector(true);
  revealSection(id, true);
}

prepareCollapsibleSections();

document.querySelectorAll('.rail-btn[data-target]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.target;
    const wasActive = button.classList.contains('active');
    if (wasActive && inspectorIsOpen()) {
      setInspector(false);
      button.classList.remove('active');
      return;
    }
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b === button));
    openSection(target);
  });
});

inspectorToggle?.addEventListener('click', (event) => { event.stopPropagation(); setInspector(!inspectorIsOpen()); });
inspector?.querySelector('.inspector-head')?.addEventListener('click', (event) => { if (!event.target.closest('button')) setInspector(!inspectorIsOpen()); });
inspectorMobile?.addEventListener('click', () => {
  if (inspectorIsOpen()) return setInspector(false);
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.target === 'panel-world'));
  openSection('panel-world');
});

createPanel?.addEventListener('click', () => createTop?.click());

// Pipeline/Welt-Umschalter im Spatial-Viewer — dieselbe interaktive Logik wie
// zuvor, jetzt direkt auf dem eigenen Dokument statt auf einem iframe-Dokument.
function spatialChrome() {
  const viewer = document.getElementById('spatial-viewer');
  if (!viewer) return null;
  if (viewer.dataset.editorUpgraded === '1') return viewer._shadedSpatialChrome || null;
  viewer.dataset.editorUpgraded = '1';

  const toolbar = document.createElement('div');
  toolbar.id = 'shaded-spatial-toolbar';
  toolbar.innerHTML = '<button type="button" data-spatial-panel="pipeline">PIPELINE</button><button type="button" data-spatial-panel="laws">WELT</button>';
  viewer.appendChild(toolbar);
  const pipeline = document.getElementById('spatial-pipeline');
  const laws = document.getElementById('spatial-laws');
  const buttons = [...toolbar.querySelectorAll('button[data-spatial-panel]')];
  const syncButtons = () => buttons.forEach(button => {
    const target = button.dataset.spatialPanel === 'pipeline' ? pipeline : laws;
    button.classList.toggle('active', !!target?.classList.contains('shaded-panel-open'));
  });
  const closePanels = () => { pipeline?.classList.remove('shaded-panel-open'); laws?.classList.remove('shaded-panel-open'); syncButtons(); };
  closePanels();
  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-spatial-panel]'); if (!button) return;
    const target = button.dataset.spatialPanel === 'pipeline' ? pipeline : laws;
    const wasOpen = target?.classList.contains('shaded-panel-open'); closePanels(); if (!wasOpen) target?.classList.add('shaded-panel-open'); syncButtons();
  });
  viewer.addEventListener('pointerdown', (event) => { if (event.target === document.getElementById('spatial-canvas')) closePanels(); });
  viewer._shadedSpatialChrome = { closePanels };
  return viewer._shadedSpatialChrome;
}

function updateState() {
  const loaded = !!window.SHADED;
  const ready = !!(loaded && window.SHADED.isReady?.());
  state?.classList.toggle('loaded', loaded && !ready);
  state?.classList.toggle('ready', ready);
  if (state) state.lastElementChild.textContent = ready ? 'SCENE READY' : loaded ? 'ENGINE LIVE' : 'ENGINE';
  if (viewportStatus) viewportStatus.textContent = ready ? 'Szene bereit · direkt im echten Renderer' : loaded ? 'Engine live · Bild laden oder Demo starten' : 'Engine wird geladen …';
  if (loaded) spatialChrome();
}

updateState();
setInterval(updateState, 750);

// world-room-gate.js besitzt RAUM in der Capture-Phase. Dieser Listener bleibt
// nur als Kompatibilitäts-Fallback für Shells, die diese Datei nicht laden.
roomButton?.addEventListener('click', () => {
  if (window.SHADEDWorldStudio?.enterRoom) return;
  setInspector(false);
  document.querySelectorAll('.rail-btn').forEach(button => button.classList.remove('active'));
  const button = document.getElementById('btn-spatial-view');
  if (!button) { if (viewportStatus) viewportStatus.textContent = 'Raumansicht ist in diesem Engine-Zustand nicht verfügbar.'; return; }
  button.click();
  spatialChrome()?.closePanels();
});

if (editorStatus && 'MutationObserver' in window) {
  new MutationObserver(() => {
    if (viewportStatus && editorStatus.textContent) viewportStatus.textContent = editorStatus.textContent.replace(/^[✅⚠️🧠]\s*/, '');
  }).observe(editorStatus, { childList: true, characterData: true, subtree: true });
}

setInspector(false);
