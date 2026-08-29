import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseCategoryLinks,
  parseMaterialLinks,
  parseResolutionDownloads,
  extractZipBuffer,
  detectChannels,
} from './freestylized-materials.mjs';

assert.deepEqual(parseCategoryLinks(`
  <a href="https://freestylized.com/category/stylized-textures/ground/">Ground</a>
  <a href='/category/stylized-textures/wood/'>Wood</a>
  <a href='/category/3d-model/urban/'>Nope</a>
`), [
  'https://freestylized.com/category/stylized-textures/ground/',
  'https://freestylized.com/category/stylized-textures/wood/',
]);

assert.deepEqual(parseMaterialLinks(`
  <a href="/material/ground_05/">Ground 05</a>
  <a href="https://freestylized.com/material/metal_01/">Metal 01</a>
  <a href="https://example.com/material/nope/">Nope</a>
`), [
  'https://freestylized.com/material/ground_05/',
  'https://freestylized.com/material/metal_01/',
]);

assert.deepEqual(parseResolutionDownloads(`
  <a href="https://pub-a67cbe8efa4c4ce3b56e525e91e4c311.r2.dev/Textures/1k/ground_05_1k.zip">1K</a>
  <a href="https://pub-a67cbe8efa4c4ce3b56e525e91e4c311.r2.dev/Textures/4k/ground_05_4k.zip">4K</a>
`), {
  '1k': 'https://pub-a67cbe8efa4c4ce3b56e525e91e4c311.r2.dev/Textures/1k/ground_05_1k.zip',
  '4k': 'https://pub-a67cbe8efa4c4ce3b56e525e91e4c311.r2.dev/Textures/4k/ground_05_4k.zip',
});

function zipStore(entries) {
  const u16 = (n) => Buffer.from([n & 255, (n >> 8) & 255]);
  const u32 = (n) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, dataText] of entries) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(dataText);
    const local = Buffer.concat([
      Buffer.from('504b0304', 'hex'), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(data.length), u32(data.length), u16(nameBuf.length), u16(0), nameBuf, data,
    ]);
    locals.push(local);
    const central = Buffer.concat([
      Buffer.from('504b0102', 'hex'), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(data.length), u32(data.length), u16(nameBuf.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBuf,
    ]);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    Buffer.from('504b0506', 'hex'), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralDir.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, eocd]);
}

const temp = await mkdtemp(join(tmpdir(), 'shaded-fs-materials-'));
try {
  const zip = zipStore([
    ['ground_05_BaseColor.png', 'albedo'],
    ['ground_05_Normal.png', 'normal'],
    ['ground_05_Roughness.png', 'rough'],
  ]);
  await extractZipBuffer(zip, temp);
  assert.equal(await readFile(join(temp, 'ground_05_BaseColor.png'), 'utf8'), 'albedo');
  assert.deepEqual(await detectChannels(temp), {
    albedo: 'ground_05_BaseColor.png',
    normal: 'ground_05_Normal.png',
    roughness: 'ground_05_Roughness.png',
  });

  const evil = zipStore([['../escape.txt', 'nope']]);
  await assert.rejects(() => extractZipBuffer(evil, temp), /path traversal blocked/);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log('freestylized material importer tests: ok');
