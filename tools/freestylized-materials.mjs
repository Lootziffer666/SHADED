#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const SITE = 'https://freestylized.com';
const INDEX_URL = `${SITE}/all-textures/`;
const LICENSE_URL = `${SITE}/disclaimer/`;
const DEFAULT_LIBRARY_DIR = '.cache/materials/freestylized';
const DEFAULT_MANIFEST = `${DEFAULT_LIBRARY_DIR}/catalog.json`;
const USER_AGENT = 'SHADED-FreeStylized-Importer/1.0 (+https://github.com/Lootziffer666/SHADED)';
const RESOLUTIONS = new Set(['1k', '2k', '4k']);

const FALLBACK_CATEGORIES = [
  'bark', 'bricks', 'cliff', 'concrete', 'grass', 'ground', 'indoor_tiles',
  'industrial_sci_fi', 'metals', 'planks', 'rock', 'roof_tiles', 'snow',
  'stone_walls', 'tiles', 'wall_plaster', 'wood',
].map((slug) => `${SITE}/category/stylized-textures/${slug}/`);

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#038;', '&')
    .replaceAll('&#x2F;', '/')
    .replaceAll('&#47;', '/')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'");
}

function linksFromHtml(html) {
  const links = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(re)) {
    try {
      links.push(new URL(decodeHtml(match[1]), SITE).href);
    } catch {
      // Ignore malformed third-party markup.
    }
  }
  return links;
}

export function parseCategoryLinks(html) {
  return [...new Set(linksFromHtml(html).filter((url) => {
    const { hostname, pathname } = new URL(url);
    return hostname === 'freestylized.com'
      && /^\/category\/stylized-textures\/[^/]+\/?$/.test(pathname);
  }))].sort();
}

export function parseMaterialLinks(html) {
  return [...new Set(linksFromHtml(html).filter((url) => {
    const { hostname, pathname } = new URL(url);
    return hostname === 'freestylized.com' && /^\/material\/[^/]+\/?$/.test(pathname);
  }))].sort();
}

export function parseResolutionDownloads(html) {
  const downloads = {};
  for (const url of linksFromHtml(html)) {
    const match = url.match(/^https:\/\/[^/]+\.r2\.dev\/Textures\/(1k|2k|4k)\/([^/?#]+\.zip)(?:[?#].*)?$/i);
    if (match) downloads[match[1].toLowerCase()] = url;
  }
  return downloads;
}

function titleFromHtml(html, fallback) {
  const h = html.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const raw = h?.[1] ?? t?.[1] ?? fallback;
  return decodeHtml(raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .replace(/\s*\|\s*Free.*$/i, '') || fallback;
}

function slugFromMaterialUrl(url) {
  return new URL(url).pathname.split('/').filter(Boolean).at(-1);
}

function categorySlug(url) {
  return new URL(url).pathname.split('/').filter(Boolean).at(-1);
}

async function fetchResponse(url, { retries = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/zip;q=0.9,*/*;q=0.8',
        },
      });
      if (response.ok) return response;
      if (response.status === 404) return response;
      throw new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((r) => setTimeout(r, attempt * 700));
    }
  }
  throw new Error(`Fetch failed for ${url}: ${lastError?.message ?? lastError}`);
}

async function fetchText(url) {
  const response = await fetchResponse(url);
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return response.text();
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function discoverCategoryMaterials(categoryUrl) {
  const found = new Set();
  for (let page = 1; page <= 30; page += 1) {
    const pageUrl = page === 1 ? categoryUrl : new URL(`page/${page}/`, categoryUrl).href;
    const response = await fetchResponse(pageUrl);
    if (response.status === 404) break;
    if (!response.ok) throw new Error(`${response.status} while fetching ${pageUrl}`);
    const html = await response.text();
    const links = parseMaterialLinks(html);
    const fresh = links.filter((url) => !found.has(url));
    if (fresh.length === 0) break;
    for (const url of fresh) found.add(url);
  }
  return [...found].sort();
}

export async function buildCatalog({ concurrency = 6, limit = Infinity } = {}) {
  const indexHtml = await fetchText(INDEX_URL);
  const parsedCategories = parseCategoryLinks(indexHtml);
  const categories = parsedCategories.length ? parsedCategories : FALLBACK_CATEGORIES;

  const categoryRows = [];
  const materialToCategory = new Map();
  for (const categoryUrl of categories) {
    const urls = await discoverCategoryMaterials(categoryUrl);
    categoryRows.push({
      slug: categorySlug(categoryUrl),
      url: categoryUrl,
      materialCount: urls.length,
    });
    for (const url of urls) if (!materialToCategory.has(url)) materialToCategory.set(url, categorySlug(categoryUrl));
  }

  const materialUrls = [...materialToCategory.keys()].sort().slice(0, limit);
  const materials = await mapConcurrent(materialUrls, concurrency, async (pageUrl, index) => {
    const id = slugFromMaterialUrl(pageUrl);
    process.stdout.write(`\rCatalog ${index + 1}/${materialUrls.length}: ${id.padEnd(32)}`);
    const html = await fetchText(pageUrl);
    return {
      id,
      name: titleFromHtml(html, id),
      category: materialToCategory.get(pageUrl),
      pageUrl,
      downloads: parseResolutionDownloads(html),
    };
  });
  if (materialUrls.length) process.stdout.write('\n');

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      site: SITE,
      catalog: INDEX_URL,
      license: LICENSE_URL,
      note: 'FreeStylized permits commercial/non-commercial project use; redistribution restrictions in its disclaimer still apply. Downloaded files stay local and gitignored.',
    },
    categoryCount: categoryRows.length,
    materialCount: materials.length,
    categories: categoryRows,
    materials,
  };
}

function safeArchivePath(root, name) {
  const normalized = name.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0')) throw new Error(`Unsafe ZIP entry: ${JSON.stringify(name)}`);
  const target = resolve(root, normalized);
  const base = `${resolve(root)}${sep}`;
  if (target !== resolve(root) && !target.startsWith(base)) throw new Error(`ZIP path traversal blocked: ${name}`);
  return target;
}

function findEocd(buffer) {
  const min = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('ZIP end-of-central-directory not found');
}

export async function extractZipBuffer(buffer, outputDir) {
  const eocd = findEocd(buffer);
  const entries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const written = [];

  for (let i = 0; i < entries; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`Invalid ZIP central directory entry ${i}`);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString((flags & 0x800) ? 'utf8' : 'utf8');
    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    if (data.length !== uncompressedSize) throw new Error(`ZIP size mismatch for ${name}`);

    const target = safeArchivePath(outputDir, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    written.push(target);
  }
  return written;
}

const CHANNELS = [
  ['albedo', /(?:^|[_\-.\s])(base.?color|albedo|diffuse|color)(?:[_\-.\s]|$)/i],
  ['normal', /(?:^|[_\-.\s])(normal|nrm|nor)(?:[_\-.\s]|$)/i],
  ['roughness', /(?:^|[_\-.\s])(roughness|rough)(?:[_\-.\s]|$)/i],
  ['metallic', /(?:^|[_\-.\s])(metallic|metalness|metal)(?:[_\-.\s]|$)/i],
  ['height', /(?:^|[_\-.\s])(height|displacement|disp)(?:[_\-.\s]|$)/i],
  ['ao', /(?:^|[_\-.\s])(ambient.?occlusion|occlusion|ao)(?:[_\-.\s]|$)/i],
  ['emissive', /(?:^|[_\-.\s])(emissive|emission)(?:[_\-.\s]|$)/i],
];

async function walkFiles(root, current = root) {
  const out = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(root, path));
    else out.push(path);
  }
  return out;
}

export async function detectChannels(materialDir) {
  const files = await walkFiles(materialDir);
  const channels = {};
  for (const file of files) {
    const name = basename(file);
    if (!/\.(png|jpe?g|tga|webp|exr)$/i.test(name)) continue;
    for (const [channel, pattern] of CHANNELS) {
      if (!(channel in channels) && pattern.test(name)) channels[channel] = relative(materialDir, file).replaceAll('\\', '/');
    }
  }
  return channels;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function downloadToFile(url, path) {
  const response = await fetchResponse(url);
  if (!response.ok) throw new Error(`${response.status} while downloading ${url}`);
  if (!response.body) throw new Error(`Empty response body for ${url}`);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));
  await rm(path, { force: true });
  await import('node:fs/promises').then(({ rename }) => rename(temp, path));
}

async function syncOne(material, { libraryDir, resolution, keepZips }) {
  const downloadUrl = material.downloads?.[resolution];
  if (!downloadUrl) return { id: material.id, status: 'missing-resolution', resolution };

  const materialDir = join(libraryDir, resolution, material.category ?? 'uncategorized', material.id);
  const metadataPath = join(materialDir, 'material.json');
  if (await exists(metadataPath)) {
    const existing = JSON.parse(await readFile(metadataPath, 'utf8'));
    return { id: material.id, status: 'cached', ...existing };
  }

  const archiveDir = join(libraryDir, '.archives', resolution);
  const archivePath = join(archiveDir, `${material.id}_${resolution}.zip`);
  await downloadToFile(downloadUrl, archivePath);
  const bytes = await readFile(archivePath);
  await mkdir(materialDir, { recursive: true });
  await extractZipBuffer(bytes, materialDir);
  const channels = await detectChannels(materialDir);

  const metadata = {
    id: material.id,
    name: material.name,
    category: material.category,
    resolution,
    pageUrl: material.pageUrl,
    downloadUrl,
    licenseUrl: LICENSE_URL,
    provenance: 'freestylized.com',
    assignment: null,
    channels,
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  if (!keepZips) await rm(archivePath, { force: true });
  return { id: material.id, status: 'downloaded', ...metadata };
}

export async function syncCatalog(catalog, {
  libraryDir = DEFAULT_LIBRARY_DIR,
  resolution = '1k',
  concurrency = 3,
  keepZips = false,
  limit = Infinity,
} = {}) {
  if (!RESOLUTIONS.has(resolution)) throw new Error(`Resolution must be one of: ${[...RESOLUTIONS].join(', ')}`);
  const materials = catalog.materials.slice(0, limit);
  let finished = 0;
  const results = await mapConcurrent(materials, concurrency, async (material) => {
    const result = await syncOne(material, { libraryDir, resolution, keepZips });
    finished += 1;
    process.stdout.write(`\rSync ${finished}/${materials.length}: ${material.id.padEnd(32)} ${result.status.padEnd(18)}`);
    return result;
  });
  if (materials.length) process.stdout.write('\n');

  const library = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    sourceCatalogGeneratedAt: catalog.generatedAt,
    resolution,
    materialCount: results.length,
    downloaded: results.filter((x) => x.status === 'downloaded').length,
    cached: results.filter((x) => x.status === 'cached').length,
    missingResolution: results.filter((x) => x.status === 'missing-resolution').length,
    materials: results,
  };
  await mkdir(libraryDir, { recursive: true });
  await writeFile(join(libraryDir, `library-${resolution}.json`), `${JSON.stringify(library, null, 2)}\n`);
  return library;
}

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'keep-zips') { options.keepZips = true; continue; }
    const value = rest[++i];
    if (value == null) throw new Error(`Missing value for --${key}`);
    options[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  if (options.concurrency != null) options.concurrency = Number(options.concurrency);
  if (options.limit != null) options.limit = Number(options.limit);
  return { command, options };
}

function usage() {
  return `SHADED FreeStylized material library\n\n` +
    `  node tools/freestylized-materials.mjs catalog [--manifest PATH] [--concurrency 6] [--limit N]\n` +
    `  node tools/freestylized-materials.mjs sync [--manifest PATH] [--dir PATH] [--resolution 1k|2k|4k] [--concurrency 3] [--limit N] [--keep-zips]\n` +
    `  node tools/freestylized-materials.mjs all [same options as sync]\n\n` +
    `Downloaded FreeStylized content stays under .cache/materials/ (gitignored).\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const manifestPath = options.manifest ?? DEFAULT_MANIFEST;
  const libraryDir = options.dir ?? DEFAULT_LIBRARY_DIR;
  const concurrency = options.concurrency ?? (command === 'catalog' ? 6 : 3);
  const limit = options.limit ?? Infinity;

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return;
  }

  if (command === 'catalog' || command === 'all') {
    const catalog = await buildCatalog({ concurrency, limit });
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`Catalog: ${catalog.materialCount} materials across ${catalog.categoryCount} categories -> ${manifestPath}`);
    if (command === 'catalog') return;
  }

  if (command === 'sync' || command === 'all') {
    let catalog;
    if (command === 'all') catalog = JSON.parse(await readFile(manifestPath, 'utf8'));
    else {
      if (!(await exists(manifestPath))) {
        console.log(`No catalog at ${manifestPath}; building it first.`);
        catalog = await buildCatalog({ concurrency: Math.max(concurrency, 4), limit });
        await mkdir(dirname(manifestPath), { recursive: true });
        await writeFile(manifestPath, `${JSON.stringify(catalog, null, 2)}\n`);
      } else catalog = JSON.parse(await readFile(manifestPath, 'utf8'));
    }
    const library = await syncCatalog(catalog, {
      libraryDir,
      resolution: options.resolution ?? '1k',
      concurrency,
      keepZips: options.keepZips ?? false,
      limit,
    });
    console.log(`Library ready: ${library.materialCount} materials (${library.downloaded} new, ${library.cached} cached, ${library.missingResolution} missing).`);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
