/**
 * SHADED Headless CLI for Depth Enhancement
 * Uses SHADED's Spatial Kernel to enhance COLMAP depth maps with material-aware processing
 */

import { SpatialKernel, GeometryObservation, ObservationStore, SOURCE_TYPE, OBS_PROVENANCE } from '../../../src/runtime/spatial-kernel/index.js';
import { MonocularDepthProvider } from '../../../src/runtime/reconstruction/depth-provider.js';
import { DepthToMeshProcessor } from '../../../src/runtime/reconstruction/mesh-pipeline.js';
import { PatchRegistrar } from '../../../src/runtime/reconstruction/patch-registration.js';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * SHADED Headless Engine
 * Runs without browser, uses Spatial Kernel directly
 */
export class SHADEDHeadless {
  constructor(options = {}) {
    this.options = {
      analysisResolution: 768,
      enableMaterialLayer: true,
      enableWorldLaws: true,
      ...options
    };
    
    this.kernel = new SpatialKernel({
      worldId: options.worldId || 'koelnmesse',
      observations: new ObservationStore()
    });
    
    this.depthProvider = new MonocularDepthProvider();
    this.meshProcessor = new DepthToMeshProcessor();
    this.patchRegistrar = new PatchRegistrar();
    
    this.initialized = false;
  }
  
  /**
   * Initialize SHADED headless engine
   */
  async initialize() {
    if (this.initialized) return;
    
    // Register subsystems
    const { SparseField } = await import('../../../src/runtime/spatial-kernel/sparse-field.js');
    const { SceneGraph } = await import('../../../src/runtime/spatial-kernel/scene-graph.js');
    const { WorldFields } = await import('../../../src/runtime/spatial-kernel/world-fields.js');
    const { WorldLawSolver } = await import('../../../src/runtime/simulation/world-law-solver.js');
    const { SpatialMemory } = await import('../../../src/runtime/simulation/spatial-memory.js');
    
    this.kernel.registerSubsystem('field', new SparseField({ chunkSize: 8 }));
    this.kernel.registerSubsystem('graph', new SceneGraph());
    this.kernel.registerSubsystem('fields', new WorldFields());
    this.kernel.registerSubsystem('laws', new WorldLawSolver());
    this.kernel.registerSubsystem('memory', new SpatialMemory());
    
    // Register recipes
    const { PhotoFirstRecipe } = await import('../../../src/runtime/spatial-kernel/recipes/photo-first-recipe.js');
    this.kernel.registerRecipe('photo-first', new PhotoFirstRecipe());
    
    // Initialize depth provider
    await this.depthProvider.initialize();
    
    this.initialized = true;
    console.log('[SHADED Headless] Initialized');
  }
  
  /**
   * Enhance COLMAP depth maps using SHADED's material-aware processing
   * @param {Object} colmapData - COLMAP sparse reconstruction JSON
   * @param {string} imagesDir - Directory with source images
   * @param {Object} options - Enhancement options
   */
  async enhanceDepths(colmapData, imagesDir, options = {}) {
    if (!this.initialized) await this.initialize();
    
    const {
      useMaterialSegmentation = true,
      useWorldLaws = true,
      outputFormat = 'json', // 'json' | 'ply' | 'bin'
      outputDir = path.join(imagesDir, '..', 'shaded_enhanced'),
      maxImages = -1
    } = options;
    
    await fs.mkdir(outputDir, { recursive: true });
    
    const images = colmapData.images || [];
    const cameras = colmapData.cameras || [];
    const points3D = colmapData.points3D || [];
    
    const results = [];
    let processed = 0;
    
    for (const image of images) {
      if (maxImages > 0 && processed >= maxImages) break;
      
      const imagePath = path.join(imagesDir, image.name);
      
      try {
        console.log(`[SHADED] Enhancing depth for ${image.name}...`);
        
        // Load image
        const imageResult = await this.processImage(image, imagePath, cameras, options);
        
        results.push({
          imageId: image.id,
          imageName: image.name,
          cameraId: image.cameraId,
          ...imageResult
        });
        
        processed++;
      } catch (err) {
        console.error(`[SHADED] Failed to process ${image.name}:`, err.message);
        results.push({
          imageId: image.id,
          imageName: image.name,
          error: err.message
        });
      }
    }
    
    // Save results
    const outputPath = path.join(outputDir, 'shaded_depth_enhancement.json');
    await fs.writeFile(outputPath, JSON.stringify({
      version: '1.0',
      timestamp: new Date().toISOString(),
      images: results,
      metadata: {
        totalImages: images.length,
        processedImages: processed,
        kernelSnapshot: this.kernel.snapshot()
      }
    }, null, 2));
    
    return { outputPath, results };
  }
  
  /**
   * Process a single image through SHADED pipeline
   */
  async processImage(image, imagePath, cameras, options) {
    // 1. Run SHADED's photo-first recipe on the image
    const recipeResult = await this.kernel.runRecipe('photo-first', {
      image: { path: imagePath },
      camera: this.findCamera(cameras, image.cameraId),
      calibration: {
        qvec: image.qvec,
        tvec: image.tvec
      }
    }, {
      allowFallback: true,
      useSHADEDMaterial: options.useMaterialSegmentation !== false,
      useWorldLaws: options.useWorldLaws !== false
    });
    
    // 2. If recipe succeeded, extract enhanced depth
    if (recipeResult.ok && recipeResult.observationId) {
      const observation = this.kernel.observations.get(recipeResult.observationId);
      
      // Get depth from observation
      let enhancedDepth = null;
      if (observation.depth) {
        enhancedDepth = await this.loadDepthData(observation.depth);
      }
      
      // Get material segmentation if available
      let materialMask = null;
      if (options.useMaterialSegmentation && observation.semanticMasks) {
        materialMask = await this.loadMaskData(observation.semanticMasks);
      }
      
      return {
        depth: enhancedDepth,
        materialMask,
        confidence: observation.confidence,
        provenance: observation.provenanceClass,
        recipeResult: recipeResult
      };
    }
    
    // 3. Fallback: use COLMAP depth + SHADED material classification
    return this.fallbackEnhancement(image, imagePath, cameras);
  }
  
  /**
   * Fallback: Run SHADED analysis on image directly
   */
  async fallbackEnhancement(image, imagePath, cameras) {
    // Create observation from image
    const observation = new GeometryObservation({
      sourceType: SOURCE_TYPE.PHOTO,
      image: imagePath,
      camera: this.findCamera(cameras, image.cameraId),
      provenanceClass: OBS_PROVENANCE.INFERRED
    });
    
    const ingestResult = this.kernel.ingest(observation);
    
    if (!ingestResult.ok) {
      throw new Error(`SHADED analysis failed: ${ingestResult.errors.join(', ')}`);
    }
    
    const obs = this.kernel.observations.get(ingestResult.id);
    
    return {
      depth: obs.depth ? await this.loadDepthData(obs.depth) : null,
      materialMask: obs.semanticMasks ? await this.loadMaskData(obs.semanticMasks) : null,
      confidence: obs.confidence,
      provenance: 'SHADED_ANALYSIS',
      fallback: true
    };
  }
  
  /**
   * Find camera by ID
   */
  findCamera(cameras, cameraId) {
    return cameras.find(c => c.id === cameraId) || cameras[0];
  }
  
  /**
   * Load depth data from observation reference
   */
  async loadDepthData(depthRef) {
    if (!depthRef || !depthRef.ref) return null;
    
    if (depthRef.ref.file) {
      // Load from file
      const buffer = await fs.readFile(depthRef.ref.file);
      return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    }
    
    if (depthRef.ref.data) {
      return new Float32Array(depthRef.ref.data);
    }
    
    return null;
  }
  
  /**
   * Load mask data from observation reference
   */
  async loadMaskData(maskRef) {
    // Similar to loadDepthData
    return null;
  }
  
  /**
   * Generate depth maps for all COLMAP cameras
   * Uses SHADED's depth provider for monocular estimation
   */
  async generateDepthMaps(imagesDir, cameras, options = {}) {
    const imageFiles = await fs.readdir(imagesDir);
    const imagePaths = imageFiles
      .filter(f => /\.(jpg|jpeg|png|tiff?)$/i.test(f))
      .map(f => path.join(imagesDir, f));
    
    const depthMaps = [];
    
    for (const imagePath of imagePaths) {
      try {
        const result = await this.depthProvider.estimateDepthFromFile(imagePath, {
          maxDimension: options.maxDimension || 1024,
          returnPose: false,
          returnSky: false
        });
        
        depthMaps.push({
          imagePath,
          imageName: path.basename(imagePath),
          depth: Array.from(result.depth),
          confidence: Array.from(result.confidence),
          width: result.width,
          height: result.height,
          model: result.model,
          quantization: result.quantization
        });
      } catch (err) {
        console.error(`[SHADED] Depth estimation failed for ${imagePath}:`, err.message);
      }
    }
    
    return depthMaps;
  }
  
  /**
   * Fuse COLMAP sparse points with SHADED depth
   */
  async fuseWithCOLMAP(colmapData, shadedDepthMaps, options = {}) {
    const points3D = colmapData.points3D || [];
    const images = colmapData.images || [];
    
    const fusedPoints = points3D.map(pt => {
      // For each 3D point, find corresponding SHADED depth
      // This is a simplified version - real implementation would project
      // the 3D point into each camera and compare depths
      
      let shadedDepth = null;
      let shadedConfidence = 0;
      
      for (const track of pt.track) {
        const image = images.find(img => img.id === track.imageId);
        if (!image) continue;
        
        const depthMap = shadedDepthMaps.find(dm => 
          dm.imageName === path.basename(image.name)
        );
        
        if (depthMap && depthMap.depth) {
          // Project 3D point to image coordinates (simplified)
          // In reality, use camera matrix
          const depthIdx = 0; // placeholder
          if (depthIdx < depthMap.depth.length) {
            shadedDepth = depthMap.depth[depthIdx];
            shadedConfidence = depthMap.confidence[depthIdx];
          }
        }
      }
      
      return {
        ...pt,
        shadedDepth,
        shadedConfidence,
        fused: shadedDepth !== null
      };
    });
    
    return {
      points: fusedPoints,
      metadata: {
        totalPoints: points3D.length,
        fusedPoints: fusedPoints.filter(p => p.fused).length,
        timestamp: new Date().toISOString()
      }
    };
  }
  
  /**
   * Export enhanced data for Blender
   */
  async exportForBlender(enhancedData, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    
    // Export depth maps as JSON
    await fs.writeFile(
      path.join(outputDir, 'shaded_depths.json'),
      JSON.stringify(enhancedData, null, 2)
    );
    
    // Export as PLY for point cloud visualization
    const plyPath = path.join(outputDir, 'shaded_fused.ply');
    await this.writePLY(enhancedData, plyPath);
    
    return { jsonPath: path.join(outputDir, 'shaded_depths.json'), plyPath };
  }
  
  async writePLY(data, filePath) {
    const points = data.points || [];
    const fused = points.filter(p => p.fused);
    
    let ply = `ply
format ascii 1.0
element vertex ${fused.length}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
property float shaded_depth
property float shaded_confidence
end_header
`;
    
    for (const pt of fused) {
      ply += `${pt.xyz[0]} ${pt.xyz[1]} ${pt.xyz[2]} ${pt.rgb[0]} ${pt.rgb[1]} ${pt.rgb[2]} ${pt.shadedDepth || 0} ${pt.shadedConfidence || 0}\n`;
    }
    
    await fs.writeFile(filePath, ply);
  }
  
  /**
   * Get kernel snapshot for debugging
   */
  getKernelSnapshot() {
    return this.kernel.snapshot();
  }
}

/**
 * CLI entry point
 */
export async function runSHADEDDepthEnhancement(args) {
  const {
    colmapJson,
    imagesDir,
    outputDir,
    maxImages = -1,
    useMaterial = true,
    useWorldLaws = true
  } = args;
  
  if (!colmapJson || !imagesDir) {
    throw new Error('Usage: --colmap-json <path> --images-dir <path> [--output-dir <path>] [--max-images <n>]');
  }
  
  const shaded = new SHADEDHeadless();
  await shaded.initialize();
  
  const colmapData = JSON.parse(await fs.readFile(colmapJson, 'utf8'));
  
  const result = await shaded.enhanceDepths(colmapData, imagesDir, {
    maxImages,
    useMaterialSegmentation: useMaterial,
    useWorldLaws,
    outputDir
  });
  
  await shaded.exportForBlender(result, outputDir);
  
  console.log('[SHADED] Enhancement complete:', result.outputPath);
  return result;
}

export default {
  SHADEDHeadless,
  runSHADEDDepthEnhancement
};