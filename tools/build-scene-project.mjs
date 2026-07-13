#!/usr/bin/env node
// Assembles a shaded.scene-project/v1 project.json (contracts/shaded-scene-project.schema.json)
// from (a) a costume-browser.html label export and (b) a simple placement list. Pure JSON
// plumbing - never touches image/audio bytes, matching exportProject()'s own rule that this
// format carries labels/positions only. The real sprite-sheet/manifest PNG+JSON files for each
// label are a separate, local, out-of-band step (see docs/round-9-asset-boundary.md) supplied
// to editor/facade.js's loadProject(project, assets) at load time.
//
// Nutzung:
//   node tools/build-scene-project.mjs costume-labels.json placements.json > project.json
//
// placements.json: [{ "label": "Guybrush-idle", "x": 0.5, "y": 0.72, "scale": 1,
//                      "anim": "idle", "depthLayer": "mid" }, ...]
// Labels not present in placements.json are skipped with a warning (nothing silently dropped).
import { readFileSync } from 'node:fs';

function main(argv) {
  const [labelsPath, placementsPath] = argv;
  if (!labelsPath || !placementsPath) {
    console.error('Usage: node build-scene-project.mjs costume-labels.json placements.json > project.json');
    return 2;
  }
  const labelsDoc = JSON.parse(readFileSync(labelsPath, 'utf8'));
  const placements = JSON.parse(readFileSync(placementsPath, 'utf8'));
  if (labelsDoc.tool !== 'shaded.costume-browser') {
    console.error(`warn: ${labelsPath} does not look like a costume-browser export (tool="${labelsDoc.tool}")`);
  }
  const knownLabels = new Set((labelsDoc.labels || []).map((l) => l.name));

  const actors = [];
  const warnings = [];
  for (const p of placements) {
    if (!p.label) { warnings.push('placement entry missing "label", skipped'); continue; }
    if (!knownLabels.has(p.label)) warnings.push(`"${p.label}" not found in ${labelsPath} - keeping anyway, but check the spelling`);
    if (typeof p.x !== 'number' || typeof p.y !== 'number') { warnings.push(`"${p.label}" missing numeric x/y, skipped`); continue; }
    actors.push({
      label: p.label,
      x: p.x,
      y: p.y,
      scale: p.scale ?? 1,
      anim: p.anim,
      depthLayer: p.depthLayer && ['front', 'mid', 'back'].includes(p.depthLayer) ? p.depthLayer : 'mid',
    });
  }

  const project = {
    schema: 'shaded.scene-project/v1',
    params: placements.__params || {},
    actors,
    storyboard: placements.__storyboard || [],
  };

  for (const w of warnings) console.error('warn:', w);
  process.stdout.write(JSON.stringify(project, null, 2) + '\n');
  return 0;
}

process.exitCode = main(process.argv.slice(2));
