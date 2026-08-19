// Makes the World Studio material preview genuinely live without duplicating its renderer.
// world-studio.js redraws on slider input; while a flowing preset is visible we re-emit
// the current flow value each frame so time-based liquid waves keep moving.
let frame = 0;

function animate() {
  const lab = document.querySelector('#world-studio .material-lab');
  const flow = document.querySelector('#world-studio [data-material-slider="flow"]');
  if (lab?.open && flow && Number(flow.value) > 0.01) {
    flow.dispatchEvent(new Event('input', { bubbles: true }));
  }
  frame = requestAnimationFrame(animate);
}

if (!frame) frame = requestAnimationFrame(animate);
