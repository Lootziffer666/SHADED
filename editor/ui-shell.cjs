const iframe = document.getElementById('engine-frame');
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

function spatialChrome(doc) {
  const viewer = doc.getElementById('spatial-viewer');
  if (!viewer) return null;
  if (viewer.dataset.editorUpgraded === '1') return viewer._shadedSpatialChrome || null;
  viewer.dataset.editorUpgraded = '1';

  const toolbar = doc.createElement('div');
  toolbar.id = 'shaded-spatial-toolbar';
  toolbar.innerHTML = '<button type="button" data-spatial-panel="pipeline">PIPELINE</button><button type="button" data-spatial-panel="laws">WELT</button>';
  viewer.appendChild(toolbar);
  const pipeline = doc.getElementById('spatial-pipeline');
  const laws = doc.getElementById('spatial-laws');
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
  viewer.addEventListener('pointerdown', (event) => { if (event.target === doc.getElementById('spatial-canvas')) closePanels(); });
  viewer._shadedSpatialChrome = { closePanels };
  return viewer._shadedSpatialChrome;
}

function injectEnginePresentation() {
  const doc = iframe.contentDocument;
  if (!doc?.head || !doc.body) return;
  doc.body.classList.add('cinema');
  let style = doc.getElementById('shaded-editor-engine-style');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'shaded-editor-engine-style';
    style.textContent = `
      html,body{width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;background:#000!important}
      body{display:block!important}
      #sidebar{display:none!important}
      #stage{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;padding:0!important;background:#000!important}
      #canvas-wrap{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;display:block!important;background:#000!important}
      canvas#gl,canvas#ov{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;border-radius:0!important}
      #exit-cinema{display:none!important}
      #spatial-viewer{inset:0!important;border:0!important;border-radius:0!important;background:#050608!important;box-shadow:none!important}
      #spatial-pipeline,#spatial-laws{display:none!important;background:rgba(8,9,12,.88)!important;border:1px solid rgba(255,255,255,.12)!important;backdrop-filter:blur(18px)!important;-webkit-backdrop-filter:blur(18px)!important;box-shadow:0 12px 40px rgba(0,0,0,.38)!important;z-index:10!important}
      #spatial-pipeline.shaded-panel-open,#spatial-laws.shaded-panel-open{display:block!important}
      #spatial-pipeline{top:94px!important;left:10px!important;width:250px!important;max-height:calc(100% - 108px)!important}
      #spatial-map:not([hidden])~#spatial-pipeline{top:174px!important;max-height:calc(100% - 188px)!important}
      #spatial-laws{top:94px!important;right:10px!important;bottom:auto!important;width:300px!important;max-height:calc(100% - 108px)!important}
      #spatial-close,#spatial-walk{top:52px!important;z-index:12!important;min-height:32px!important;background:rgba(15,16,21,.88)!important;border:1px solid rgba(255,255,255,.14)!important}
      #spatial-help{left:50%!important;bottom:10px!important;transform:translateX(-50%)!important;max-width:60%!important;text-align:center!important;background:rgba(5,6,8,.72)!important}
      #shaded-spatial-toolbar{display:flex!important;position:absolute;left:50%;top:52px;transform:translateX(-50%);z-index:13;gap:5px}
      #shaded-spatial-toolbar button{min-height:32px;padding:5px 9px;background:rgba(13,14,18,.9);color:#cbd5e1;border:1px solid rgba(255,255,255,.14);border-radius:5px;font:600 9px/1 ui-monospace,monospace;letter-spacing:.08em}
      #shaded-spatial-toolbar button.active{background:#2563eb;color:#fff;border-color:#60a5fa}
      @media(max-width:720px){
        #spatial-map{display:none!important}
        #spatial-pipeline,#spatial-laws{left:7px!important;right:7px!important;top:auto!important;bottom:64px!important;width:auto!important;max-height:56dvh!important;border-radius:10px!important;padding:10px!important;overflow:auto!important}
        #spatial-walk{right:78px!important;top:52px!important}
        #spatial-close{right:8px!important;top:52px!important}
        #shaded-spatial-toolbar{top:52px!important;left:8px!important;transform:none!important}
        #spatial-help{left:8px!important;right:8px!important;bottom:64px!important;transform:none!important;max-width:none!important;padding:5px 7px!important;font-size:8px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        #spatial-pipeline.shaded-panel-open~#spatial-help,#spatial-laws.shaded-panel-open~#spatial-help{display:none!important}
        #spatial-laws label{display:grid!important;grid-template-columns:minmax(110px,1fr) minmax(100px,1fr)!important;gap:8px!important;align-items:center!important}
        #spatial-laws input,#spatial-laws select{width:100%!important;min-width:0!important}
      }
    `;
    doc.head.appendChild(style);
  }
  spatialChrome(doc);
}

function updateState() {
  const win = iframe.contentWindow;
  const loaded = !!win?.SHADED;
  const ready = !!(loaded && win.SHADED.isReady?.());
  state?.classList.toggle('loaded', loaded && !ready);
  state?.classList.toggle('ready', ready);
  if (state) state.lastElementChild.textContent = ready ? 'SCENE READY' : loaded ? 'ENGINE LIVE' : 'ENGINE';
  if (viewportStatus) viewportStatus.textContent = ready ? 'Szene bereit · direkt im echten Renderer' : loaded ? 'Engine live · Bild laden oder Demo starten' : 'Engine wird geladen …';
  if (loaded) injectEnginePresentation();
}

iframe?.addEventListener('load', () => { injectEnginePresentation(); updateState(); });
setInterval(updateState, 750);

// world-room-gate.js owns RAUM in capture phase. Keep this listener only as a
// compatibility fallback for shells that omit that file.
roomButton?.addEventListener('click', () => {
  if (window.SHADEDWorldStudio?.enterRoom) return;
  injectEnginePresentation();
  setInspector(false);
  document.querySelectorAll('.rail-btn').forEach(button => button.classList.remove('active'));
  const doc = iframe.contentDocument;
  const button = doc?.getElementById('btn-spatial-view');
  if (!button) { if (viewportStatus) viewportStatus.textContent = 'Raumansicht ist in diesem Engine-Zustand nicht verfügbar.'; return; }
  button.click();
  spatialChrome(doc)?.closePanels();
});

if (editorStatus && 'MutationObserver' in window) {
  new MutationObserver(() => {
    if (viewportStatus && editorStatus.textContent) viewportStatus.textContent = editorStatus.textContent.replace(/^[✅⚠️🧠]\s*/, '');
  }).observe(editorStatus, { childList: true, characterData: true, subtree: true });
}

setInspector(false);
