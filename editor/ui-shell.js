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
const storyClose = document.getElementById('btn-story-close');

const isMobile = () => matchMedia('(max-width: 860px)').matches;

function setInspector(open) {
  body.classList.toggle('inspector-open', !!open);
  body.classList.toggle('inspector-collapsed', !open && !isMobile());
  inspectorToggle?.setAttribute('aria-expanded', String(!!open));
  inspectorMobile?.setAttribute('aria-expanded', String(!!open));
}

function openSection(id) {
  if (id === 'timeline-dock') {
    body.classList.remove('inspector-open');
    body.classList.add('story-open');
    return;
  }
  body.classList.remove('story-open');
  if (isMobile()) setInspector(true);
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

document.querySelectorAll('.rail-btn[data-target]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', b === button));
    openSection(button.dataset.target);
  });
});

inspectorToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  if (isMobile()) setInspector(!body.classList.contains('inspector-open'));
  else body.classList.toggle('inspector-collapsed');
});
inspector?.querySelector('.inspector-head')?.addEventListener('click', () => {
  if (isMobile()) setInspector(!body.classList.contains('inspector-open'));
});
inspectorMobile?.addEventListener('click', () => setInspector(!body.classList.contains('inspector-open')));
storyClose?.addEventListener('click', () => body.classList.remove('story-open'));

// app.js already owns #btn-erstellen. The duplicate inside the inspector only forwards to it.
createPanel?.addEventListener('click', () => createTop?.click());

function spatialChrome(doc) {
  const viewer = doc.getElementById('spatial-viewer');
  if (!viewer || viewer.dataset.editorUpgraded === '1') return;
  viewer.dataset.editorUpgraded = '1';

  const toolbar = doc.createElement('div');
  toolbar.id = 'shaded-spatial-toolbar';
  toolbar.innerHTML = '<button type="button" data-spatial-panel="pipeline">PIPELINE</button><button type="button" data-spatial-panel="laws">WELT</button>';
  viewer.appendChild(toolbar);

  const pipeline = doc.getElementById('spatial-pipeline');
  const laws = doc.getElementById('spatial-laws');
  const closePanels = () => {
    pipeline?.classList.remove('shaded-panel-open');
    laws?.classList.remove('shaded-panel-open');
  };
  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-spatial-panel]');
    if (!button) return;
    const target = button.dataset.spatialPanel === 'pipeline' ? pipeline : laws;
    const wasOpen = target?.classList.contains('shaded-panel-open');
    closePanels();
    if (!wasOpen) target?.classList.add('shaded-panel-open');
  });
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
      #canvas-wrap{max-width:100%!important;max-height:100%!important}
      #exit-cinema{display:none!important}
      #spatial-viewer{inset:0!important;border:0!important;border-radius:0!important;background:#050608!important;box-shadow:none!important}
      #spatial-pipeline,#spatial-laws{background:rgba(8,9,12,.86)!important;border:1px solid rgba(255,255,255,.12)!important;backdrop-filter:blur(18px)!important;-webkit-backdrop-filter:blur(18px)!important;box-shadow:0 12px 40px rgba(0,0,0,.38)!important}
      #spatial-pipeline{top:54px!important;left:10px!important;width:238px!important;max-height:calc(100% - 66px)!important}
      #spatial-map:not([hidden])~#spatial-pipeline{top:174px!important;max-height:calc(100% - 186px)!important}
      #spatial-laws{top:54px!important;right:10px!important;bottom:auto!important;width:292px!important;max-height:calc(100% - 66px)!important}
      #spatial-close,#spatial-walk{top:10px!important;z-index:8!important;min-height:32px!important;background:rgba(15,16,21,.88)!important;border:1px solid rgba(255,255,255,.14)!important}
      #spatial-help{left:50%!important;bottom:9px!important;transform:translateX(-50%)!important;max-width:60%!important;text-align:center!important;background:rgba(5,6,8,.72)!important}
      #shaded-spatial-toolbar{display:none;position:absolute;left:8px;top:8px;z-index:9;gap:5px}
      #shaded-spatial-toolbar button{min-height:32px;padding:5px 8px;background:rgba(13,14,18,.9);color:#cbd5e1;border:1px solid rgba(255,255,255,.14);border-radius:5px;font:600 9px/1 ui-monospace,monospace;letter-spacing:.08em}
      @media(max-width:720px){
        #spatial-viewer{inset:0!important}
        #spatial-map{display:none!important}
        #spatial-pipeline,#spatial-laws{display:none!important;left:7px!important;right:7px!important;top:auto!important;bottom:7px!important;width:auto!important;max-height:46dvh!important;border-radius:10px!important;padding:10px!important;overflow:auto!important;z-index:7!important}
        #spatial-pipeline.shaded-panel-open,#spatial-laws.shaded-panel-open{display:block!important}
        #shaded-spatial-toolbar{display:flex!important}
        #spatial-walk{right:78px!important;top:8px!important}
        #spatial-close{right:8px!important;top:8px!important}
        #spatial-help{left:8px!important;right:8px!important;bottom:8px!important;transform:none!important;max-width:none!important;padding:5px 7px!important;font-size:8px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
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

iframe?.addEventListener('load', () => {
  injectEnginePresentation();
  updateState();
});
setInterval(updateState, 750);

roomButton?.addEventListener('click', () => {
  injectEnginePresentation();
  const doc = iframe.contentDocument;
  const button = doc?.getElementById('btn-spatial-view');
  if (!button) {
    if (viewportStatus) viewportStatus.textContent = 'Raumansicht ist in diesem Engine-Zustand nicht verfügbar.';
    return;
  }
  button.click();
  spatialChrome(doc);
});

if (editorStatus && 'MutationObserver' in window) {
  new MutationObserver(() => {
    if (viewportStatus && editorStatus.textContent) viewportStatus.textContent = editorStatus.textContent.replace(/^[✅⚠️🧠]\s*/, '');
  }).observe(editorStatus, { childList: true, characterData: true, subtree: true });
}

if (isMobile()) setInspector(false);
