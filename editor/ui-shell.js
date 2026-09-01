// SHADED is the editor: renderer + controls live in the same document.
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

const WORKSPACE_THEME_KEY = 'shaded.workspace-theme';
const WORKSPACE_THEME_DEFAULT = 'carbonight';
const WORKSPACE_THEMES = [
  { id: 'carbonight', label: 'Carbonight', colors: ['#2E2C2B', '#C4C4C4', '#8C8C8C', '#FFFFFF'] },
  { id: 'darkside', label: 'Darkside', colors: ['#222324', '#1CC3E8', '#E8341C', '#68C244', '#F08D24'] },
  { id: 'earthsong', label: 'Earthsong', colors: ['#36312C', '#95CC5E', '#DB784D', '#F8BB39'] },
  { id: 'legacy', label: 'Tron Legacy', colors: ['#14191F', '#267FB5', '#FFB20D', '#FF410D', '#C7F026'] },
  { id: 'glowfish', label: 'Glowfish', colors: ['#191F13', '#95CC5E', '#DB784D', '#F8BB39'] },
  { id: 'neutral', label: 'SHADED Neutral', colors: ['#141516', '#82AEE0', '#79C9A1', '#D5B070'] },
];

if (!document.querySelector('link[data-viewport-first]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/editor/viewport-first.css';
  link.dataset.viewportFirst = '1';
  document.head.appendChild(link);
}

function readWorkspaceTheme() {
  try {
    const stored = localStorage.getItem(WORKSPACE_THEME_KEY);
    return WORKSPACE_THEMES.some(theme => theme.id === stored) ? stored : WORKSPACE_THEME_DEFAULT;
  } catch {
    return WORKSPACE_THEME_DEFAULT;
  }
}

function applyWorkspaceTheme(themeId, persist = true) {
  const theme = WORKSPACE_THEMES.find(candidate => candidate.id === themeId)
    || WORKSPACE_THEMES.find(candidate => candidate.id === WORKSPACE_THEME_DEFAULT);
  if (!theme) return;
  document.documentElement.dataset.workspaceTheme = theme.id;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = theme.colors[0];
  const button = document.getElementById('workspace-theme-button');
  if (button) {
    button.dataset.theme = theme.id;
    button.title = `Theme: ${theme.label}`;
  }
  document.querySelectorAll('[data-workspace-theme-option]').forEach(option => {
    const active = option.dataset.workspaceThemeOption === theme.id;
    option.classList.toggle('active', active);
    option.setAttribute('aria-checked', String(active));
  });
  if (persist) {
    try { localStorage.setItem(WORKSPACE_THEME_KEY, theme.id); } catch { /* storage is optional */ }
  }
}

function setThemeMenuOpen(open) {
  const button = document.getElementById('workspace-theme-button');
  const menu = document.getElementById('workspace-theme-menu');
  if (!button || !menu) return;
  menu.hidden = !open;
  button.classList.toggle('active', open);
  button.setAttribute('aria-expanded', String(open));
}

function ensureThemePicker() {
  const actions = document.querySelector('.top-actions');
  if (!actions || document.getElementById('workspace-theme-button')) return;

  const button = document.createElement('button');
  button.id = 'workspace-theme-button';
  button.type = 'button';
  button.className = 'ghost compact workspace-theme-button';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span aria-hidden="true">◐</span><span class="workspace-theme-button-label">THEME</span>';
  actions.insertBefore(button, actions.firstChild);

  const menu = document.createElement('div');
  menu.id = 'workspace-theme-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Workspace colour theme');
  menu.innerHTML = `<div class="workspace-theme-menu-title">COLOUR THEMES</div>
    <div class="workspace-theme-options">${WORKSPACE_THEMES.map(theme => `
      <button type="button" role="menuitemradio" aria-checked="false" data-workspace-theme-option="${theme.id}">
        <span class="workspace-theme-swatches" aria-hidden="true">${theme.colors.map(color => `<i style="background:${color}"></i>`).join('')}</span>
        <b>${theme.label}</b>
      </button>`).join('')}
    </div>
    <div class="workspace-theme-credit">Palette adaptations · Dayle Rees · MIT</div>`;
  document.body.appendChild(menu);

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setThemeMenuOpen(menu.hidden);
  });
  menu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-workspace-theme-option]');
    if (!option) return;
    applyWorkspaceTheme(option.dataset.workspaceThemeOption);
    setThemeMenuOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (menu.hidden || menu.contains(event.target) || button.contains(event.target)) return;
    setThemeMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setThemeMenuOpen(false);
  });

  applyWorkspaceTheme(readWorkspaceTheme(), false);
}

const inspectorIsOpen = () => body.classList.contains('inspector-open');

function setInspector(open) {
  body.classList.toggle('inspector-open', !!open);
  body.classList.toggle('inspector-collapsed', !open);
  inspectorToggle?.setAttribute('aria-expanded', String(!!open));
  inspectorMobile?.setAttribute('aria-expanded', String(!!open));
}

function setInspectorTitle(label) {
  const title = inspector?.querySelector('.inspector-head strong');
  if (title) title.textContent = label || 'Workspace';
}

function sectionMarkup(id, number, title, bodyMarkup) {
  return `<section class="inspector-section section-collapsed workspace-generated" id="${id}">
    <div class="section-title"><span>${number}</span><h2>${title}</h2></div>${bodyMarkup}</section>`;
}

function ensureWorkspacePanels() {
  const scroll = inspector?.querySelector('.inspector-scroll');
  const rail = document.querySelector('.tool-rail');
  if (!scroll || !rail || rail.dataset.workspaceReady === '1') return;
  rail.dataset.workspaceReady = '1';

  // Material already has a real panel but historically no rail entry.
  const storyButton = rail.querySelector('[data-target="panel-story"]');
  if (!rail.querySelector('[data-target="panel-material"]')) {
    const button = document.createElement('button');
    button.className = 'rail-btn';
    button.type = 'button';
    button.dataset.target = 'panel-material';
    button.title = 'Material / Style';
    button.innerHTML = '<span>◩</span><b>Material</b>';
    rail.insertBefore(button, rail.querySelector('[data-target="panel-paint"]') || storyButton);
  }

  if (!document.getElementById('panel-reconstruct')) {
    scroll.insertAdjacentHTML('afterbegin', sectionMarkup('panel-reconstruct', '02', 'Reconstruct', `
      <p class="hint">Direkter Blick auf die räumliche Pipeline. Die globale Kamera bleibt nach dem Fit eingefroren; lokale Geometrie darf sich weiter anpassen.</p>
      <div class="workspace-proxy-grid">
        <button type="button" data-workspace-stage="primitive">Geometry</button>
        <button type="button" data-workspace-stage="components">Regions</button>
        <button type="button" data-workspace-stage="voxels">Voxels</button>
        <button type="button" data-workspace-stage="final">Final</button>
      </div>
      <div class="workspace-live-stack">
        <div class="workspace-live-row"><span>Projection</span><span data-live-copy="spatial-representation">—</span></div>
        <div class="workspace-live-row"><span>Fit</span><span data-live-copy="spatial-fit-status">—</span></div>
        <div class="workspace-live-row"><span>Runtime</span><span data-live-copy="spatial-performance">—</span></div>
      </div>
      <button type="button" class="wide accent" data-workspace-room style="margin-top:8px">Raum öffnen</button>`));
  }

  if (!document.getElementById('panel-debug')) {
    scroll.insertAdjacentHTML('beforeend', sectionMarkup('panel-debug', '08', 'Debug / Evidence', `
      <div class="workspace-live-stack">
        <div class="workspace-live-row"><span>Engine</span><span data-live-engine>—</span></div>
        <div class="workspace-live-row"><span>Editor</span><span data-live-copy="editor-status">—</span></div>
        <div class="workspace-live-row"><span>Scene</span><span data-live-copy="status">—</span></div>
        <div class="workspace-live-row"><span>Geometry</span><span data-live-copy="spatial-fit-status">—</span></div>
      </div>`));
  }

  if (!document.getElementById('panel-project')) {
    scroll.insertAdjacentHTML('beforeend', sectionMarkup('panel-project', '09', 'Project / History', `
      <p class="hint">Projektaktionen verwenden weiterhin die bestehenden SHADED-Handler; die Shell ändert nur deren Anordnung.</p>
      <div class="workspace-proxy-grid">
        <button type="button" data-proxy-click="btn-save-preset">Preset speichern</button>
        <button type="button" data-proxy-click="btn-json">Parameter JSON</button>
        <button type="button" data-proxy-click="btn-install">App installieren</button>
        <button type="button" data-proxy-click="btn-pointcloud">PointCloud</button>
      </div>`));
  }

  const defs = [
    ['panel-source', 'Source', '◫'],
    ['panel-reconstruct', 'Reconstruct', '◇'],
    ['panel-world', 'World', '◎'],
    ['panel-worldlaws', 'Laws', '⚖'],
    ['panel-material', 'Material', '◩'],
    ['panel-paint', 'Paint', '✎'],
    ['panel-actors', 'Actors', '♟'],
    ['panel-story', 'Story', '▶'],
    ['panel-debug', 'Debug', '◉'],
    ['panel-project', 'Project', '▣'],
  ];

  const byTarget = new Map([...rail.querySelectorAll('.rail-btn[data-target]')].map(button => [button.dataset.target, button]));
  defs.forEach(([target, label, icon]) => {
    let button = byTarget.get(target);
    if (!button) {
      button = document.createElement('button');
      button.className = 'rail-btn';
      button.type = 'button';
      button.dataset.target = target;
      rail.appendChild(button);
    }
    button.title = label;
    button.dataset.workspaceLabel = label;
    button.innerHTML = `<span>${icon}</span><b>${label}</b>`;
    rail.appendChild(button);
  });

  scroll.querySelectorAll('[data-proxy-click]').forEach(button => {
    button.addEventListener('click', () => document.getElementById(button.dataset.proxyClick)?.click());
  });
  scroll.querySelectorAll('[data-workspace-room]').forEach(button => {
    button.addEventListener('click', () => document.getElementById('btn-spatial-view')?.click());
  });
  scroll.querySelectorAll('[data-workspace-stage]').forEach(button => {
    button.addEventListener('click', () => openSpatialStage(button.dataset.workspaceStage));
  });
}

function openSpatialStage(stage) {
  const viewer = document.getElementById('spatial-viewer');
  if (viewer?.hidden) document.getElementById('btn-spatial-view')?.click();
  requestAnimationFrame(() => document.querySelector(`[data-spatial-stage="${stage}"]`)?.click());
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
  const railButton = document.querySelector(`.rail-btn[data-target="${id}"]`);
  setInspectorTitle(railButton?.dataset.workspaceLabel || railButton?.title || 'Workspace');
}

function ensureViewportToolbar() {
  if (document.getElementById('workspace-view-toolbar')) return;
  const toolbar = document.createElement('div');
  toolbar.id = 'workspace-view-toolbar';
  toolbar.setAttribute('aria-label', 'Viewport mode');
  toolbar.innerHTML = `
    <button type="button" data-workspace-view="image" class="active">IMAGE</button>
    <span class="workspace-sep"></span>
    <button type="button" data-workspace-view="geometry">GEOMETRY</button>
    <button type="button" data-workspace-view="voxels">VOXELS</button>
    <button type="button" data-workspace-view="final">FINAL</button>
    <span class="workspace-sep"></span>
    <button type="button" data-workspace-view="walk">WALK</button>`;
  document.body.appendChild(toolbar);
  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-workspace-view]');
    if (!button) return;
    const mode = button.dataset.workspaceView;
    if (mode === 'image') {
      if (!document.getElementById('spatial-viewer')?.hidden) document.getElementById('spatial-close')?.click();
    } else if (mode === 'walk') {
      const viewer = document.getElementById('spatial-viewer');
      if (viewer?.hidden) document.getElementById('btn-spatial-view')?.click();
      requestAnimationFrame(() => document.getElementById('spatial-walk')?.click());
    } else {
      openSpatialStage(mode === 'geometry' ? 'primitive' : mode);
    }
    toolbar.querySelectorAll('[data-workspace-view]').forEach(item => item.classList.toggle('active', item === button));
  });
}

function ensureBottomDock() {
  if (document.getElementById('workspace-bottom-dock')) return;
  const dock = document.createElement('section');
  dock.id = 'workspace-bottom-dock';
  dock.innerHTML = `
    <div class="workspace-dock-head">
      <button type="button" class="workspace-dock-tab active" data-dock-tab="output">OUTPUT</button>
      <button type="button" class="workspace-dock-tab" data-dock-tab="pipeline">PIPELINE</button>
      <button type="button" class="workspace-dock-tab" data-dock-tab="story">TIMELINE</button>
      <button type="button" class="workspace-dock-toggle" title="Dock ein-/ausklappen">⌄</button>
    </div>
    <div class="workspace-dock-body" data-dock-body></div>`;
  document.body.appendChild(dock);
  const render = () => renderBottomDock(dock.dataset.tab || 'output');
  dock.querySelectorAll('[data-dock-tab]').forEach(button => button.addEventListener('click', () => {
    dock.dataset.tab = button.dataset.dockTab;
    dock.querySelectorAll('[data-dock-tab]').forEach(item => item.classList.toggle('active', item === button));
    render();
  }));
  dock.querySelector('.workspace-dock-toggle')?.addEventListener('click', () => dock.classList.toggle('collapsed'));
  render();
}

function textOf(id, fallback = '—') {
  const text = document.getElementById(id)?.textContent?.trim();
  return text || fallback;
}

function renderBottomDock(tab) {
  const bodyEl = document.querySelector('#workspace-bottom-dock [data-dock-body]');
  if (!bodyEl) return;
  if (tab === 'pipeline') {
    bodyEl.innerHTML = `<div class="workspace-dock-grid">
      <div class="workspace-dock-card"><span class="workspace-dock-label">REPRESENTATION</span><div class="workspace-dock-value">${escapeHtml(textOf('spatial-representation'))}</div></div>
      <div class="workspace-dock-card"><span class="workspace-dock-label">FIT</span><div class="workspace-dock-value">${escapeHtml(textOf('spatial-fit-status'))}</div></div>
      <div class="workspace-dock-card"><span class="workspace-dock-label">PERFORMANCE</span><div class="workspace-dock-value">${escapeHtml(textOf('spatial-performance'))}</div></div>
    </div>`;
  } else if (tab === 'story') {
    const storyCount = document.getElementById('story-list')?.children?.length ?? 0;
    bodyEl.innerHTML = `<div class="workspace-dock-grid">
      <div class="workspace-dock-card"><span class="workspace-dock-label">STEPS</span><div class="workspace-dock-value">${storyCount}</div></div>
      <div class="workspace-dock-card"><span class="workspace-dock-label">RECORDING</span><div class="workspace-dock-value">${document.body.classList.contains('recording') ? 'ACTIVE' : 'IDLE'}</div></div>
      <div class="workspace-dock-card"><span class="workspace-dock-label">SCENE</span><div class="workspace-dock-value">${escapeHtml(textOf('status'))}</div></div>
    </div>`;
  } else {
    const log = textOf('spatial-log', '');
    bodyEl.innerHTML = `<div class="workspace-dock-grid">
      <div class="workspace-dock-card"><span class="workspace-dock-label">ENGINE</span><div class="workspace-dock-value">${escapeHtml(state?.lastElementChild?.textContent || 'ENGINE')}</div></div>
      <div class="workspace-dock-card"><span class="workspace-dock-label">EDITOR</span><div class="workspace-dock-value">${escapeHtml(textOf('editor-status'))}</div></div>
      <div class="workspace-dock-card"><span class="workspace-dock-label">LATEST EVIDENCE</span><div class="workspace-dock-value">${escapeHtml(log.split('\n').filter(Boolean).slice(-1)[0] || textOf('status'))}</div></div>
    </div>`;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function syncWorkspaceLiveCopies() {
  document.querySelectorAll('[data-live-copy]').forEach(target => {
    target.textContent = textOf(target.dataset.liveCopy);
  });
  document.querySelectorAll('[data-live-engine]').forEach(target => {
    target.textContent = state?.lastElementChild?.textContent || 'ENGINE';
  });
  renderBottomDock(document.getElementById('workspace-bottom-dock')?.dataset.tab || 'output');
}

ensureThemePicker();
ensureWorkspacePanels();
prepareCollapsibleSections();
ensureViewportToolbar();
ensureBottomDock();

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

// Pipeline/world switcher inside the spatial viewer.
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
  syncWorkspaceLiveCopies();
}

updateState();
setInterval(updateState, 750);

// world-room-gate.js owns ROOM in capture phase. This listener remains a compatibility fallback.
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
    syncWorkspaceLiveCopies();
  }).observe(editorStatus, { childList: true, characterData: true, subtree: true });
}

setInspector(false);