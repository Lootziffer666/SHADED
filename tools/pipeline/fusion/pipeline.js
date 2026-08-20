/**
 * Koelnmesse Fusion Pipeline
 * Combines GIS base mesh + COLMAP reconstruction + SHADED depth enhancement
 * into a unified, georeferenced 3D model
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { generateBaseMesh, alignToCOLMAP, fuseSHADEDDepths, exportFinalAssets } from '../blender/blender-integration.js';
import { runSfM, runMVS, exportCOLMAPToJSON, exportDepthMaps, parseSparseReconstruction } from '../colmap/colmap-integration.js';
import { SHADEDHeadless, runSHADEDDepthEnhancement } from '../shaded/shaded-headless.js';

/**
 * Full Koelnmesse Pipeline Orchestration
 */
export class KoelnmessePipeline {
  constructor(options = {}) {
    this.options = {
      // Paths
      gmlPath: null,
      imagesDir: null,
      workspaceDir: null,
      outputDir: null,
      
      // CRS
      sourceCRS: 'EPSG:25832', // ETRS89 / UTM 32N
      targetCRS: 'EPSG:25832',
      
      // Pipeline stages
      runGIS: true,
      runCOLMAP: true,
      runSHADED: true,
      runBlender: true,
      runFusion: true,
      exportFinal: true,
      
      // COLMAP options
      colmapOptions: {
        singleCamera: true,
        cameraModel: 'SIMPLE_PINHOLE',
        matcherType: 'exhaustive',
        dense: true
      },
      
      // SHADED options
      shadedOptions: {
        useMaterialSegmentation: true,
        useWorldLaws: true,
        maxImages: -1
      },
      
      // Blender options
      blenderOptions: {
        blenderExecutable: 'blender',
        centerAtOrigin: false, // Keep georeferenced coordinates
        exportFormats: ['gltf', 'obj', 'usd']
      },
      
      ...options
    };
    
    this.state = {
      stage: 'init',
      gmlData: null,
      colmapData: null,
      shadedData: null,
      blenderFiles: {},
      finalAssets: {}
    };
  }
  
  /**
   * Run complete pipeline
   */
  async run() {
    console.log('========================================');
    console.log('Koelnmesse Reconstruction Pipeline');
    console.log('========================================\n');
    
    const startTime = Date.now();
    
    try {
      // Stage 1: GIS Processing
      if (this.options.runGIS) {
        await this.runGISStage();
      }
      
      // Stage 2: COLMAP SfM
      if (this.options.runCOLMAP) {
        await this.runCOLMAPStage();
      }
      
      // Stage 3: SHADED Depth Enhancement
      if (this.options.runSHADED) {
        await this.runSHADEDStage();
      }
      
      // Stage 4: Blender Integration & Fusion
      if (this.options.runBlender || this.options.runFusion) {
        await this.runBlenderStage();
      }
      
      // Stage 5: Export Final Assets
      if (this.options.exportFinal) {
        await this.runExportStage();
      }
      
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`\n✅ Pipeline completed in ${elapsed.toFixed(1)}s`);
      
      return this.generateReport();
      
    } catch (err) {
      console.error('\n❌ Pipeline failed:', err.message);
      throw err;
    }
  }
  
  /**
   * Stage 1: Process GML geodata
   */
  async runGISStage() {
    this.state.stage = 'gis';
    console.log('\n📍 Stage 1: GIS/GML Processing');
    
    const { parseGMLBuildingData, exportForBlender } = await import('../gis/gml-processor.js');
    
    console.log(`  Parsing GML: ${this.options.gmlPath}`);
    this.state.gmlData = await parseGMLBuildingData(this.options.gmlPath, {
      sourceCRS: this.options.sourceCRS,
      targetCRS: this.options.targetCRS,
      simplifyTolerance: 0.1
    });
    
    console.log(`  Found ${this.state.gmlData.buildings.length} buildings`);
    console.log(`  CRS: ${this.state.gmlData.crs}`);
    console.log(`  BBox:`, this.state.gmlData.metadata.bbox);
    
    // Export for Blender
    const gisOutputDir = path.join(this.options.workspaceDir, 'gis');
    await exportForBlender(this.state.gmlData, gisOutputDir);
    this.state.gisOutputDir = gisOutputDir;
    this.state.gmlMetadataPath = path.join(gisOutputDir, 'metadata.json');
    
    console.log(`  GIS output: ${gisOutputDir}`);
  }
  
  /**
   * Stage 2: COLMAP Structure from Motion
   */
  async runCOLMAPStage() {
    this.state.stage = 'colmap';
    console.log('\n📸 Stage 2: COLMAP SfM/MVS');
    
    const colmapWorkspace = path.join(this.options.workspaceDir, 'colmap');
    
    // Run SfM
    console.log('  Running feature extraction + matching...');
    const { sparsePath } = await runSfM(this.options.imagesDir, colmapWorkspace, this.options.colmapOptions);
    
    // Parse sparse reconstruction
    this.state.colmapData = await parseSparseReconstruction(sparsePath);
    console.log(`  Sparse: ${this.state.colmapData.cameras.length} cameras, ${this.state.colmapData.images.length} images, ${this.state.colmapData.points3D.length} points`);
    
    // Export to JSON for pipeline
    const colmapJsonPath = path.join(colmapWorkspace, 'colmap_sparse.json');
    await exportCOLMAPToJSON(sparsePath, colmapJsonPath);
    this.state.colmapJsonPath = colmapJsonPath;
    
    // Run dense if requested
    if (this.options.colmapOptions.dense) {
      console.log('  Running dense reconstruction (MVS)...');
      await runMVS(colmapWorkspace, sparsePath);
      
      // Export depth maps
      const denseDir = path.join(colmapWorkspace, 'dense');
      const depthOutputDir = path.join(colmapWorkspace, 'depth_maps');
      await exportDepthMaps(denseDir, depthOutputDir);
      this.state.colmapDepthDir = depthOutputDir;
    }
    
    console.log(`  COLMAP output: ${colmapWorkspace}`);
  }
  
  /**
   * Stage 3: SHADED Depth Enhancement
   */
  async runSHADEDStage() {
    this.state.stage = 'shaded';
    console.log('\n🎨 Stage 3: SHADED Depth Enhancement');
    
    const shadedOutputDir = path.join(this.options.workspaceDir, 'shaded');
    
    const result = await runSHADEDDepthEnhancement({
      colmapJson: this.state.colmapJsonPath,
      imagesDir: this.options.imagesDir,
      outputDir: shadedOutputDir,
      maxImages: this.options.shadedOptions.maxImages,
      useMaterial: this.options.shadedOptions.useMaterialSegmentation,
      useWorldLaws: this.options.shadedOptions.useWorldLaws
    });
    
    this.state.shadedData = result;
    this.state.shadedOutputDir = shadedOutputDir;
    this.state.shadedJsonPath = result.outputPath;
    
    console.log(`  Enhanced ${result.results.filter(r => !r.error).length} images`);
    console.log(`  SHADED output: ${shadedOutputDir}`);
  }
  
  /**
   * Stage 4: Blender Integration & Fusion
   */
  async runBlenderStage() {
    this.state.stage = 'blender';
    console.log('\n🔧 Stage 4: Blender Integration & Fusion');
    
    // 4a: Generate base mesh from GIS
    console.log('  Generating base mesh from GIS...');
    const baseMesh = await generateBaseMesh(this.state.gmlMetadataPath, {
      outputDir: this.options.workspaceDir,
      ...this.options.blenderOptions
    });
    this.state.blenderFiles.baseMesh = baseMesh;
    
    // 4b: Align GIS to COLMAP
    if (this.state.colmapJsonPath && this.state.gmlMetadataPath) {
      console.log('  Aligning GIS to COLMAP...');
      const aligned = await alignToCOLMAP(this.state.gmlMetadataPath, this.state.colmapJsonPath, {
        outputDir: this.options.workspaceDir,
        blenderExecutable: this.options.blenderOptions.blenderExecutable
      });
      this.state.blenderFiles.aligned = aligned;
    }
    
    // 4c: Fuse SHADED depths
    if (this.state.shadedJsonPath && this.state.blenderFiles.aligned) {
      console.log('  Fusing SHADED depths...');
      const fused = await fuseSHADEDDepths(
        this.state.blenderFiles.aligned.alignedBlend,
        this.state.shadedJsonPath,
        {
          outputDir: this.options.workspaceDir,
          blenderExecutable: this.options.blenderOptions.blenderExecutable
        }
      );
      this.state.blenderFiles.fused = fused;
    }
    
    console.log(`  Blender files:`, Object.keys(this.state.blenderFiles));
  }
  
  /**
   * Stage 5: Export Final Assets
   */
  async runExportStage() {
    this.state.stage = 'export';
    console.log('\n📦 Stage 5: Export Final Assets');
    
    const finalBlend = this.state.blenderFiles.fused?.fusedBlend || 
                       this.state.blenderFiles.aligned?.alignedBlend || 
                       this.state.blenderFiles.baseMesh?.blendFile;
    
    if (finalBlend) {
      console.log('  Exporting final assets...');
      this.state.finalAssets = await exportFinalAssets(finalBlend, {
        outputDir: this.options.outputDir,
        formats: this.options.blenderOptions.exportFormats,
        blenderExecutable: this.options.blenderOptions.blenderExecutable
      });
      console.log(`  Exported to: ${this.options.outputDir}`);
    } else {
      console.warn('  No fused blend file found, skipping export');
    }
  }
  
  /**
   * Generate pipeline report
   */
  generateReport() {
    return {
      pipeline: 'Koelnmesse Reconstruction',
      timestamp: new Date().toISOString(),
      options: this.options,
      results: {
        gis: this.state.gmlData?.metadata || null,
        colmap: {
          cameras: this.state.colmapData?.cameras?.length || 0,
          images: this.state.colmapData?.images?.length || 0,
          points3D: this.state.colmapData?.points3D?.length || 0,
          jsonPath: this.state.colmapJsonPath
        },
        shaded: {
          processed: this.state.shadedData?.results?.filter(r => !r.error).length || 0,
          total: this.state.shadedData?.results?.length || 0,
          jsonPath: this.state.shadedJsonPath
        },
        blender: this.state.blenderFiles,
        finalAssets: this.state.finalAssets
      },
      workspace: this.options.workspaceDir,
      output: this.options.outputDir
    };
  }
}

/**
 * CLI entry point
 */
export async function runKoelnmessePipeline(configPath) {
  let options = {};
  
  if (configPath) {
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    options = config;
  }
  
  // Required paths
  if (!options.gmlPath || !options.imagesDir) {
    throw new Error('Required: gmlPath and imagesDir');
  }
  
  // Set defaults
  options.workspaceDir = options.workspaceDir || path.join(path.dirname(options.gmlPath), 'workspace');
  options.outputDir = options.outputDir || path.join(options.workspaceDir, 'output');
  
  await fs.mkdir(options.workspaceDir, { recursive: true });
  await fs.mkdir(options.outputDir, { recursive: true });
  
  const pipeline = new KoelnmessePipeline(options);
  const report = await pipeline.run();
  
  // Save report
  const reportPath = path.join(options.outputDir, 'pipeline_report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n📄 Report saved to: ${reportPath}`);
  return report;
}

/**
 * Resume pipeline from a specific stage
 */
export async function resumePipeline(workspaceDir, fromStage) {
  const statePath = path.join(workspaceDir, 'pipeline_state.json');
  let state = {};
  
  try {
    state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    console.warn('No previous state found, starting fresh');
  }
  
  // Create pipeline with saved state
  const pipeline = new KoelnmessePipeline(state.options);
  pipeline.state = state;
  
  // Run from specified stage
  const stages = ['gis', 'colmap', 'shaded', 'blender', 'export'];
  const startIndex = stages.indexOf(fromStage);
  
  if (startIndex === -1) {
    throw new Error(`Invalid stage: ${fromStage}`);
  }
  
  for (let i = startIndex; i < stages.length; i++) {
    const stage = stages[i];
    const method = `run${stage.charAt(0).toUpperCase() + stage.slice(1)}Stage`;
    if (pipeline[method]) {
      await pipeline[method]();
    }
  }
  
  return pipeline.generateReport();
}

export default {
  KoelnmessePipeline,
  runKoelnmessePipeline,
  resumePipeline
};