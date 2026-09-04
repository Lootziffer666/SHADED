import assert from 'node:assert/strict';
import {SceneRuntimeFacade} from '../integrations/scene-runtime-facade.js';

const board = [];
const params = {rain: 0.2};
let applied = null;
const fakeWindow = {
  SHADED: {
    isReady: () => true,
    erstellen: () => true,
    getParams: () => ({...params}),
    setParams: partial => Object.assign(params, partial),
    applyAct: id => { applied = id; },
    getMaterialTypeAt: () => 'water',
    story: {board: () => board},
    intrinsic: {
      state: () => ({provider: 'builtin', providerVersion: '1', channelSetId: 'x', provenance: 'derived', confidence: 1, colorSpace: 'linear', strength: 0, accepted: false}),
      setStrength: value => value,
      accept: () => true,
      reset: () => true,
    },
  },
};
const fakeDocument = {createElement: () => ({})};
const facade = new SceneRuntimeFacade({window: fakeWindow, document: fakeDocument});

assert.equal(facade.isEngineLoaded(), true);
assert.equal(facade.isReady(), true);
assert.equal(facade.create(), true);
facade.setParams({rain: 0.8});
assert.equal(facade.getParams().rain, 0.8);
facade.applyAct('tag');
assert.equal(applied, 'tag');
assert.equal(facade.getMaterialTypeAt(0.5, 0.5), 'water');

board.push({act: 'tag'});
const project = facade.exportProject();
assert.equal(project.schema, 'shaded.scene-project/v1');
assert.equal(project.storyboard.length, 1);
assert.equal(project.params.rain, 0.8);

console.log('test-scene-runtime-facade: UI-free SHADED adapter PASS');
