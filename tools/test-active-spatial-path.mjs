import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {buildRelativePointCloud} from '../runtime/spatial-point-cloud.mjs';

// Explizite Testdaten: keine dieser Zahlen wird als Produktionsmessung ausgegeben.
const rgba = new Uint8ClampedArray([
  12, 34, 56, 255,   78, 90, 123, 255,
  210, 180, 140, 255, 5, 15, 25, 255,
]);
const depthRgba = new Uint8ClampedArray([
  255, 255, 255, 255, 128, 128, 128, 255,
  0, 0, 0, 255,       64, 64, 64, 255,
]);

const cloud = buildRelativePointCloud({
  rgba,
  depthRgba,
  width: 2,
  height: 2,
  sourceSize: {w: 2, h: 2},
  source: {kind: 'TEST_FIXTURE', label: 'rgb-fixture'},
  depthSource: {sourceKind: 'TEST_FIXTURE', label: 'depth-fixture', provider: 'UNKNOWN'},
  step: 1,
});

assert.equal(cloud.points.length, 3, 'schwarze/ungueltige Tiefenpixel werden ausgelassen');
assert.deepEqual([cloud.points[0].r, cloud.points[0].g, cloud.points[0].b], [12, 34, 56], 'RGB erreicht den Punkt unveraendert');
assert.ok(cloud.points.every(point => point.confidence === null && point.reliability === 'UNKNOWN'), 'fehlende Zuverlaessigkeit bleibt unbekannt');
assert.ok(cloud.points.every(point => point.provenance === 'INFERRED' && point.colorProvenance === 'OBSERVED_SOURCE_RGB'), 'Geometrie und Farbe tragen getrennte Provenienz');
assert.deepEqual(cloud.representation, {visible: 'POINTS', viewerState: 'VOXELS', meshRendered: false});
assert.equal(cloud.scale.metric, false);
assert.equal(cloud.camera.source, 'ASSUMED_DEFAULT_60_DEGREES');
assert.equal(cloud.camera.intrinsicsKnown, false);
assert.deepEqual(cloud.registration, {performed: false, targetFrame: null});
assert.deepEqual(cloud.fusion, {performed: false, inputCount: 1});
assert.equal(cloud.depth.provider, 'UNKNOWN');

const callerFov = buildRelativePointCloud({rgba, depthRgba, width: 2, height: 2, sourceSize: {w: 2, h: 2}, fovDegrees: 75});
assert.equal(callerFov.camera.source, 'CALLER_SUPPLIED_FOV');
assert.throws(
  () => buildRelativePointCloud({rgba, depthRgba, width: 2, height: 2, sourceSize: {w: 2, h: 2}, fovDegrees: 180}),
  /zwischen 0 und 180/,
  'ungueltige Kameraannahmen duerfen nicht still ersetzt werden',
);

const engine = readFileSync(new URL('../runtime/shaded-engine.mjs', import.meta.url), 'utf8');
const viewer = readFileSync(new URL('../runtime/spatial-viewer.js', import.meta.url), 'utf8');
assert.match(engine, /return buildRelativePointCloud\(/, 'die aktive API ruft den getesteten Operator auf');
assert.match(viewer, /visible:'POINTS',state:'VOXELS',meshRendered:false/, 'die Laufzeit-API nennt die sichtbare Darstellung');
// Die beiden Zusicherungen gegen index.html-Text/-DOM ("SHADED erzeugt hier keine Tiefe selbst"-
// Hinweistext, #spatial-representation) prüften die inzwischen gelöschte Editor-Oberfläche
// (architecture/ui-zero-contracts, docs/UI_ZERO.md) -- der heutige UI-lose index.html hat keine
// dieser Zeichenketten/Elemente mehr, und die eigentliche Provenienz-Zusicherung steht bereits
// oben (cloud.depth.provider, camera.source etc.), unabhängig von jeder Präsentation.

console.log('✅ Aktiver RGB+Tiefe→POINTS-Pfad bleibt relativ und ehrlich gekennzeichnet');
