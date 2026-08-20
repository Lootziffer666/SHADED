#!/usr/bin/env node
/**
 * Koelnmesse Pipeline CLI
 * Usage: node koelnmesse-pipeline.js --config config.json
 *        node koelnmesse-pipeline.js --gml-path ... --images-dir ...
 */

import { runKoelnmessePipeline, resumePipeline } from './tools/pipeline/fusion/pipeline.js';
import { promises as fs } from 'fs';
import * as path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '--config':
        options.config = next; i++; break;
      case '--gml-path':
        options.gmlPath = next; i++; break;
      case '--images-dir':
        options.imagesDir = next; i++; break;
      case '--workspace-dir':
        options.workspaceDir = next; i++; break;
      case '--output-dir':
        options.outputDir = next; i++; break;
      case '--source-crs':
        options.sourceCRS = next; i++; break;
      case '--target-crs':
        options.targetCRS = next; i++; break;
      case '--resume':
        options.resume = true; break;
      case '--from-stage':
        options.fromStage = next; i++; break;
      case '--no-gis':
        options.runGIS = false; break;
      case '--no-colmap':
        options.runCOLMAP = false; break;
      case '--no-shaded':
        options.runSHADED = false; break;
      case '--no-blender':
        options.runBlender = false; break;
      case '--no-export':
        options.exportFinal = false; break;
      case '--colmap-dense':
        options.colmapOptions = { ...options.colmapOptions, dense: true }; break;
      case '--max-images':
        options.shadedOptions = { ...options.shadedOptions, maxImages: parseInt(next) }; i++; break;
      case '--blender-executable':
        options.blenderOptions = { ...options.blenderOptions, blenderExecutable: next }; i++; break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }
  
  return options;
}

function printHelp() {
  console.log(`
Koelnmesse Reconstruction Pipeline

Usage:
  node koelnmesse-pipeline.js --config config.json
  node koelnmesse-pipeline.js --gml-path <path> --images-dir <path> [options]

Required:
  --gml-path <path>       Path to Koelnmesse GML file
  --images-dir <path>     Directory with photos for COLMAP

Options:
  --config <path>         Load options from JSON config file
  --workspace-dir <path>  Working directory (default: ./workspace)
  --output-dir <path>     Final output directory (default: ./workspace/output)
  --source-crs <epsg>     Source CRS (default: EPSG:25832)
  --target-crs <epsg>     Target CRS (default: EPSG:25832)
  --blender-executable    Blender binary (default: blender)

Stage Control:
  --no-gis                Skip GIS processing
  --no-colmap             Skip COLMAP SfM
  --no-shaded             Skip SHADED enhancement
  --no-blender            Skip Blender fusion
  --no-export             Skip final export

COLMAP Options:
  --colmap-dense          Run dense reconstruction (MVS)

SHADED Options:
  --max-images <n>        Limit SHADED processing (default: all)

Resume:
  --resume                Resume from saved state
  --from-stage <stage>    Resume from specific stage (gis|colmap|shaded|blender|export)

Examples:
  # Full pipeline from config
  node koelnmesse-pipeline.js --config koelnmesse_config.json

  # Full pipeline from CLI
  node koelnmesse-pipeline.js \\
    --gml-path data/koelnmesse.gml \\
    --images-dir data/photos \\
    --workspace-dir ./workspace \\
    --output-dir ./output \\
    --colmap-dense

  # Resume from SHADED stage
  node koelnmesse-pipeline.js --resume --from-stage shaded
`);
}

async function main() {
  const options = parseArgs();
  
  if (options.help) {
    printHelp();
    return;
  }
  
  try {
    let report;
    
    if (options.resume) {
      const workspace = options.workspaceDir || path.join(path.dirname(options.gmlPath || ''), 'workspace');
      report = await resumePipeline(workspace, options.fromStage || 'gis');
    } else if (options.config) {
      report = await runKoelnmessePipeline(options.config);
    } else {
      if (!options.gmlPath || !options.imagesDir) {
        console.error('Error: --gml-path and --images-dir are required (or use --config)');
        printHelp();
        process.exit(1);
      }
      report = await runKoelnmessePipeline(null, options);
    }
    
    console.log('\n✅ Pipeline completed successfully!');
    console.log('Report:', JSON.stringify(report, null, 2));
    
  } catch (err) {
    console.error('\n❌ Pipeline failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();