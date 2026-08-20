// Installable application shell. Rendering stays in the real SHADED engine;
// this module owns only browser installation and offline lifecycle concerns.
const installButton = document.getElementById('btn-install');
let installPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (installButton) installButton.hidden = false;
});

installButton?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installButton.disabled = true;
  try {
    await installPrompt.prompt();
    await installPrompt.userChoice;
  } finally {
    installPrompt = null;
    installButton.hidden = true;
    installButton.disabled = false;
  }
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  if (installButton) installButton.hidden = true;
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    // Absolute path is intentional: the install module also runs from /editor/.
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch((error) => {
      // Installation is an enhancement. A failed worker must never stop WebGL.
      console.warn('SHADED Offline-Modus konnte nicht aktiviert werden:', error);
    });
  });
}
