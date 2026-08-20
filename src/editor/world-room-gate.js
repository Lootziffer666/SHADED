// Own the outer RAUM button before legacy shell handlers. The contract is:
// RAUM never asks for a manual *_depth.png. If no world exists yet,
// World Studio generates/imports one first and then enters walk mode.
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#btn-room-view');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const studio = window.SHADEDWorldStudio;
  if (studio?.enterRoom) {
    Promise.resolve(studio.enterRoom()).catch((error) => {
      const status = document.getElementById('world-status') || document.getElementById('editor-status');
      if (status) status.textContent = error?.message || String(error);
    });
    return;
  }
  document.getElementById('world-studio')?.classList.remove('collapsed');
  const status = document.getElementById('world-status') || document.getElementById('editor-status');
  if (status) status.textContent = 'Bild laden oder Demo starten. SHADED erzeugt die Tiefe automatisch.';
}, true);
