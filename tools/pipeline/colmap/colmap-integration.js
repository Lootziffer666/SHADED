/**
 * COLMAP Integration for Koelnmesse Pipeline
 * Runs COLMAP SfM/MVS, parses outputs, and converts to JSON for downstream processing
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * COLMAP executable paths (adjust for your installation)
 */
export const COLMAP_DEFAULTS = {
  executable: 'colmap',
  databasePath: 'database.db',
  imagePath: 'images',
  sparsePath: 'sparse',
  densePath: 'dense',
  workspacePath: '.'
};

/**
 * Run COLMAP command
 */
export async function runCOLMAP(args, options = {}) {
  const {
    executable = COLMAP_DEFAULTS.executable,
    cwd = process.cwd(),
    timeout = 3600000 // 1 hour default
  } = options;
  
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { cwd, timeout });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`COLMAP exited with code ${code}\n${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn COLMAP: ${err.message}`));
    });
  });
}

/**
 * Full COLMAP SfM pipeline
 */
export async function runSfM(imagesDir, workspaceDir, options = {}) {
  const {
    databasePath = path.join(workspaceDir, 'database.db'),
    sparsePath = path.join(workspaceDir, 'sparse'),
    singleCamera = true,
    cameraModel = 'SIMPLE_PINHOLE',
    matcherType = 'exhaustive',
    numThreads = -1,
    verbose = true
  } = options;
  
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(sparsePath, { recursive: true });
  
  console.log('[COLMAP] Feature extraction...');
  await runCOLMAP([
    'feature_extractor',
    '--database_path', databasePath,
    '--image_path', imagesDir,
    '--ImageReader.single_camera', singleCamera ? '1' : '0',
    '--ImageReader.camera_model', cameraModel,
    '--SiftExtraction.num_threads', numThreads.toString()
  ], { cwd: workspaceDir });
  
  console.log('[COLMAP] Feature matching...');
  await runCOLMAP([
    matcherType + '_matcher',
    '--database_path', databasePath,
    '--SiftMatching.num_threads', numThreads.toString()
  ], { cwd: workspaceDir });
  
  console.log('[COLMAP] Sparse reconstruction...');
  await runCOLMAP([
    'mapper',
    '--database_path', databasePath,
    '--image_path', imagesDir,
    '--output_path', sparsePath,
    '--Mapper.num_threads', numThreads.toString(),
    '--Mapper.ba_global_function_tolerance', '1e-6',
    '--Mapper.ba_global_max_iterations', '100'
  ], { cwd: workspaceDir });
  
  return { databasePath, sparsePath };
}

/**
 * Dense reconstruction (MVS)
 */
export async function runMVS(workspaceDir, sparsePath, options = {}) {
  const {
    densePath = path.join(workspaceDir, 'dense'),
    imagePath = path.join(workspaceDir, 'images'),
    stereoWindowRadius = 5,
    stereoMinTriAngle = 1.0,
    stereoMaxDepth = 100,
    patchMatchNumThreads = -1
  } = options;
  
  await fs.mkdir(densePath, { recursive: true });
  
  console.log('[COLMAP] Image undistorter...');
  await runCOLMAP([
    'image_undistorter',
    '--image_path', imagePath,
    '--input_path', path.join(sparsePath, '0'),
    '--output_path', densePath,
    '--output_type', 'COLMAP'
  ], { cwd: workspaceDir });
  
  console.log('[COLMAP] Patch match stereo...');
  await runCOLMAP([
    'patch_match_stereo',
    '--workspace_path', densePath,
    '--workspace_format', 'COLMAP',
    '--PatchMatchStereo.geom_consistency', 'true',
    '--PatchMatchStereo.window_radius', stereoWindowRadius.toString(),
    '--PatchMatchStereo.min_triangulation_angle', stereoMinTriAngle.toString(),
    '--PatchMatchStereo.max_depth', stereoMaxDepth.toString(),
    '--PatchMatchStereo.num_threads', patchMatchNumThreads.toString()
  ], { cwd: workspaceDir });
  
  console.log('[COLMAP] Stereo fusion...');
  await runCOLMAP([
    'stereo_fusion',
    '--workspace_path', densePath,
    '--workspace_format', 'COLMAP',
    '--input_type', 'geometric',
    '--output_path', path.join(densePath, 'fused.ply')
  ], { cwd: workspaceDir });
  
  return { densePath };
}

/**
 * Parse COLMAP sparse reconstruction to JSON
 */
export async function parseSparseReconstruction(sparseDir) {
  const cameras = await parseCamerasBin(path.join(sparseDir, 'cameras.bin'));
  const images = await parseImagesBin(path.join(sparseDir, 'images.bin'));
  const points3D = await parsePoints3DBin(path.join(sparseDir, 'points3D.bin'));
  
  return { cameras, images, points3D };
}

/**
 * Parse cameras.bin
 */
async function parseCamerasBin(filePath) {
  const buffer = await fs.readFile(filePath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  let offset = 0;
  const numCameras = view.getUint64(offset, true); // little-endian
  offset += 8;
  
  const cameras = [];
  for (let i = 0; i < numCameras; i++) {
    const cameraId = view.getUint32(offset, true);
    offset += 4;
    
    const modelId = view.getUint32(offset, true);
    offset += 4;
    
    const width = view.getUint32(offset, true);
    offset += 4;
    const height = view.getUint32(offset, true);
    offset += 4;
    
    const numParams = getModelNumParams(modelId);
    const params = [];
    for (let j = 0; j < numParams; j++) {
      params.push(view.getFloat64(offset, true));
      offset += 8;
    }
    
    cameras.push({
      id: cameraId,
      model: getModelName(modelId),
      width,
      height,
      params
    });
  }
  
  return cameras;
}

/**
 * Parse images.bin
 */
async function parseImagesBin(filePath) {
  const buffer = await fs.readFile(filePath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  let offset = 0;
  const numImages = view.getUint64(offset, true);
  offset += 8;
  
  const images = [];
  for (let i = 0; i < numImages; i++) {
    const imageId = view.getUint32(offset, true);
    offset += 4;
    
    // qvec (4 doubles)
    const qvec = [
      view.getFloat64(offset, true); offset += 8,
      view.getFloat64(offset, true); offset += 8,
      view.getFloat64(offset, true); offset += 8,
      view.getFloat64(offset, true); offset += 8
    ];
    
    // tvec (3 doubles)
    const tvec = [
      view.getFloat64(offset, true); offset += 8,
      view.getFloat64(offset, true); offset += 8,
      view.getFloat64(offset, true); offset += 8
    ];
    
    const cameraId = view.getUint32(offset, true);
    offset += 4;
    
    // Image name (null-terminated string)
    let name = '';
    while (offset < view.byteLength) {
      const char = view.getUint8(offset);
      offset++;
      if (char === 0) break;
      name += String.fromCharCode(char);
    }
    
    // Number of 2D points
    const numPoints2D = view.getUint64(offset, true);
    offset += 8;
    
    const points2D = [];
    for (let j = 0; j < numPoints2D; j++) {
      const x = view.getFloat64(offset, true); offset += 8;
      const y = view.getFloat64(offset, true); offset += 8;
      const point3DId = view.getUint64(offset, true); offset += 8;
      points2D.push({ x, y, point3DId });
    }
    
    images.push({
      id: imageId,
      qvec,
      tvec,
      cameraId,
      name,
      points2D
    });
  }
  
  return images;
}

/**
 * Parse points3D.bin
 */
async function parsePoints3DBin(filePath) {
  const buffer = await fs.readFile(filePath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  let offset = 0;
  const numPoints = view.getUint64(offset, true);
  offset += 8;
  
  const points3D = [];
  for (let i = 0; i < numPoints; i++) {
    const point3DId = view.getUint64(offset, true);
    offset += 8;
    
    const xyz = [
      view.getFloat64(offset, true); offset += 8,
      view.getFloat64(offset, true); offset += 8,
      view.getFloat64(offset, true); offset += 8
    ];
    
    const rgb = [
      view.getUint8(offset); offset++,
      view.getUint8(offset); offset++,
      view.getUint8(offset); offset++
    ];
    
    const error = view.getFloat64(offset, true);
    offset += 8;
    
    const trackLength = view.getUint64(offset, true);
    offset += 8;
    
    const track = [];
    for (let j = 0; j < trackLength; j++) {
      const imageId = view.getUint32(offset, true); offset += 4;
      const point2DIdx = view.getUint32(offset, true); offset += 4;
      track.push({ imageId, point2DIdx });
    }
    
    points3D.push({
      id: point3DId,
      xyz,
      rgb,
      error,
      track
    });
  }
  
  return points3D;
}

/**
 * COLMAP model name/param mapping
 */
function getModelName(modelId) {
  const models = {
    0: 'SIMPLE_PINHOLE',  // f, cx, cy
    1: 'PINHOLE',         // fx, fy, cx, cy
    2: 'SIMPLE_RADIAL',   // f, cx, cy, k1
    3: 'RADIAL',          // f, cx, cy, k1, k2
    4: 'OPENCV',          // fx, fy, cx, cy, k1, k2, p1, p2
    5: 'OPENCV_FISHEYE',  // fx, fy, cx, cy, k1, k2, k3, k4
    6: 'FULL_OPENCV',     // fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, k5, k6
    7: 'FOV',             // fx, fy, cx, cy, omega
    8: 'SIMPLE_RADIAL_FISHEYE', // f, cx, cy, k1
    9: 'RADIAL_FISHEYE',  // f, cx, cy, k1, k2
    10: 'THIN_PRISM_FISHEYE' // fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1
  };
  return models[modelId] || 'UNKNOWN';
}

function getModelNumParams(modelId) {
  const params = {
    0: 3,  // SIMPLE_PINHOLE
    1: 4,  // PINHOLE
    2: 4,  // SIMPLE_RADIAL
    3: 5,  // RADIAL
    4: 8,  // OPENCV
    5: 8,  // OPENCV_FISHEYE
    6: 12, // FULL_OPENCV
    7: 5,  // FOV
    8: 4,  // SIMPLE_RADIAL_FISHEYE
    9: 5,  // RADIAL_FISHEYE
    10: 12 // THIN_PRISM_FISHEYE
  };
  return params[modelId] || 0;
}

/**
 * Export COLMAP data to JSON for pipeline
 */
export async function exportCOLMAPToJSON(sparseDir, outputPath) {
  const { cameras, images, points3D } = await parseSparseReconstruction(sparseDir);
  
  const output = {
    version: '1.0',
    cameras,
    images,
    points3D,
    metadata: {
      numCameras: cameras.length,
      numImages: images.length,
      numPoints3D: points3D.length,
      exportedAt: new Date().toISOString()
    }
  };
  
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  return output;
}

/**
 * Export depth maps from dense reconstruction
 */
export async function exportDepthMaps(denseDir, outputDir, options = {}) {
  const {
    format = 'json', // 'json' | 'png' | 'exr'
    maxDepth = 100
  } = options;
  
  await fs.mkdir(outputDir, { recursive: true });
  
  // Parse depth maps from dense folder
  const depthFiles = await fs.readdir(denseDir);
  const depthMaps = [];
  
  for (const file of depthFiles) {
    if (file.endsWith('.bin') || file.endsWith('.png')) {
      // Parse depth map
      // This is a placeholder - actual implementation depends on COLMAP version
      depthMaps.push({
        imagePath: path.join(denseDir, file),
        cameraId: parseInt(file.split('_')[0]) || 0,
        width: 0,
        height: 0,
        depth: [] // Float32Array
      });
    }
  }
  
  if (format === 'json') {
    await fs.writeFile(
      path.join(outputDir, 'depth_maps.json'),
      JSON.stringify({ depthMaps }, null, 2)
    );
  }
  
  return depthMaps;
}

/**
 * Create COLMAP project from GIS-aligned cameras
 * Uses GIS building positions as initial camera poses
 */
export async function createProjectFromGIS(gisMetadataPath, imagesDir, workspaceDir, options = {}) {
  const gis = JSON.parse(await fs.readFile(gisMetadataPath, 'utf8'));
  
  // This would:
  // 1. Extract building centroids as approximate camera positions
  // 2. Create initial COLMAP database with priors
  // 3. Run SfM with geometric verification
  
  console.log('[COLMAP] Creating project from GIS priors...');
  
  // For now, run standard SfM
  return runSfM(imagesDir, workspaceDir, options);
}

export default {
  runCOLMAP,
  runSfM,
  runMVS,
  parseSparseReconstruction,
  exportCOLMAPToJSON,
  exportDepthMaps,
  createProjectFromGIS
};