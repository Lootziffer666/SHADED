// Guaranteed escape hatch for every remaining editor sheet.
const body = document.body;

function closeOuterSheets() {
  body.classList.remove('inspector-open');
  body.classList.add('inspector-collapsed');
  document.querySelectorAll('.rail-btn.active').forEach(button => button.classList.remove('active'));
  document.getElementById('btn-inspector-toggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('btn-inspector-mobile')?.setAttribute('aria-expanded', 'false');
}

function addHandle(host, label = 'Menü schließen') {
  if (!host || host.querySelector(':scope > .drawer-drop-handle')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'drawer-drop-handle';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = '⌄';
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopImmediatePropagation(); closeOuterSheets();
  }, true);
  host.prepend(button);
}

addHandle(document.getElementById('inspector'), 'Inspector schließen');

let backdrop = document.getElementById('drawer-backdrop');
if (!backdrop) {
  backdrop = document.createElement('button');
  backdrop.id = 'drawer-backdrop';
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Menü schließen');
  backdrop.addEventListener('click', event => {
    event.preventDefault(); event.stopImmediatePropagation(); closeOuterSheets();
  }, true);
  document.querySelector('.editor-shell')?.appendChild(backdrop);
}

function installSpatialHandles() {
  const doc = document;
  if (!doc.getElementById('spatial-sheet-handle-style')) {
    const style = doc.createElement('style');
    style.id = 'spatial-sheet-handle-style';
    style.textContent = `
      #spatial-pipeline,#spatial-laws{overflow:visible!important}
      .spatial-sheet-drop{position:sticky;top:0;left:50%;z-index:30;display:block;width:88px;height:34px;min-height:34px;margin:-5px auto 7px;padding:0 0 7px;border:1px solid rgba(255,255,255,.22);border-top:0;border-radius:0 0 18px 18px;background:rgba(18,19,23,.98);color:#e5e7eb;font:800 24px/1 system-ui,sans-serif;touch-action:manipulation}
    `;
    doc.head.appendChild(style);
  }
  for (const id of ['spatial-pipeline', 'spatial-laws']) {
    const panel = doc.getElementById(id);
    if (!panel || panel.querySelector(':scope > .spatial-sheet-drop')) continue;
    const close = doc.createElement('button');
    close.type = 'button'; close.className = 'spatial-sheet-drop'; close.textContent = '⌄';
    close.setAttribute('aria-label', `${id === 'spatial-pipeline' ? 'Pipeline' : 'Welt'} schließen`);
    close.addEventListener('click', event => {
      event.preventDefault(); event.stopImmediatePropagation(); panel.classList.remove('shaded-panel-open');
      doc.querySelectorAll('#shaded-spatial-toolbar button.active').forEach(button => button.classList.remove('active'));
    }, true);
    panel.prepend(close);
  }
}

setInterval(installSpatialHandles, 750);
installSpatialHandles();
