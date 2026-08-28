const mobile = () => matchMedia('(max-width: 860px)').matches;
const body = document.body;
const library = document.getElementById('btn-library-toggle');
const controls = document.getElementById('btn-controls-toggle');
const libraryClose = document.getElementById('btn-library-close');
const controlsClose = document.getElementById('btn-controls-close');

function openLibrary() {
  body.classList.remove('library-closed');
  if (mobile()) body.classList.add('controls-closed');
}

function openControls() {
  body.classList.remove('controls-closed');
  if (mobile()) body.classList.add('library-closed');
}

library?.addEventListener('click', () => requestAnimationFrame(() => {
  if (!body.classList.contains('library-closed')) openLibrary();
  else if (mobile()) openLibrary();
}));

controls?.addEventListener('click', () => requestAnimationFrame(() => {
  if (!body.classList.contains('controls-closed')) openControls();
  else if (mobile()) openControls();
}));

libraryClose?.addEventListener('click', () => body.classList.add('library-closed'));
controlsClose?.addEventListener('click', () => body.classList.add('controls-closed'));

window.addEventListener('resize', () => {
  if (mobile() && !body.classList.contains('library-closed') && !body.classList.contains('controls-closed')) {
    body.classList.add('library-closed');
  }
});

if (mobile()) body.classList.add('library-closed');
