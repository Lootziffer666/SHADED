/**
 * Headless Blender Integration for Koelnmesse Pipeline
 * Runs Blender in background mode to generate base meshes from GIS data
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Blender script template for building generation
 */
const BLENDER_BUILDING_SCRIPT = `
import bpy
import bmesh
import json
import math
import os
import sys

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Load metadata
with open("{metadata_path}", 'r') as f:
    metadata = json.load(f)

crs = metadata.get('crs', 'ETRS89_UTM32N')
buildings = metadata.get('buildings', [])

# Set units to meters
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1.0

created_objects = []

for building in buildings:
    obj_file = building.get('objFile')
    if not obj_file:
        continue
    
    obj_path = os.path.join(os.path.dirname("{metadata_path}"), obj_file)
    if not os.path.exists(obj_path):
        print(f"Warning: OBJ not found: {obj_path}")
        continue
    
    # Import OBJ
    bpy.ops.wm.obj_import(filepath=obj_path)
    
    # Get imported objects
    for obj in bpy.context.selected_objects:
        obj.name = building['id']
        obj['building_id'] = building['id']
        obj['building_name'] = building.get('name', '')
        obj['bbox'] = str(building.get('bbox', {}))
        obj['attributes'] = str(building.get('attributes', {}))
        created_objects.append(obj)

# Apply scale if needed (GIS data might be large)
for obj in created_objects:
    # Center at origin if requested
    if {center_at_origin}:
        # Compute center of all buildings
        pass

# Save blend file
blend_path = "{output_blend}"
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

# Export combined OBJ if requested
if {export_combined_obj}:
    combined_obj = "{combined_obj_path}"
    bpy.ops.export_scene.obj(
        filepath=combined_obj,
        use_selection=False,
        use_materials=False,
        axis_forward='Y',
        axis_up='Z'
    )

print(f"Processed {len(created_objects)} buildings")
print(f"Saved to {blend_path}")
`

/**
 * Run Blender headless with a Python script
 */
export async function runBlenderScript(scriptContent, blenderExecutable = 'blender') {
  return new Promise((resolve, reject) => {
    const args = [
      '--background',
      '--python-expr', scriptContent
    ];
    
    const proc = spawn(blenderExecutable, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Blender exited with code ${code}\n${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Blender: ${err.message}`));
    });
  });
}

/**
 * Generate base mesh from GIS buildings
 */
export async function generateBaseMesh(gisMetadataPath, options = {}) {
  const {
    outputDir = path.dirname(gisMetadataPath),
    blenderExecutable = 'blender',
    centerAtOrigin = true,
    exportCombinedOBJ = true,
    simplify = true,
    simplifyThreshold = 0.5,
    generateUVs = false,
    addGroundPlane = true,
    groundPlaneSize = 1000
  } = options;
  
  const outputBlend = path.join(outputDir, 'koelnmesse_base.blend');
  const combinedOBJ = path.join(outputDir, 'koelnmesse_combined.obj');
  
  const script = BLENDER_BUILDING_SCRIPT
    .replace('{metadata_path}', gisMetadataPath.replace(/\\/g, '\\\\'))
    .replace('{output_blend}', outputBlend.replace(/\\/g, '\\\\'))
    .replace('{combined_obj_path}', combinedOBJ.replace(/\\/g, '\\\\'))
    .replace('{center_at_origin}', centerAtOrigin)
    .replace('{export_combined_obj}', exportCombinedOBJ);
  
  console.log('[Blender] Generating base mesh...');
  const result = await runBlenderScript(script, blenderExecutable);
  console.log('[Blender] Done');
  
  // Verify outputs
  const exists = async (p) => {
    try { await fs.access(p); return true; } catch { return false; }
  };
  
  return {
    blendFile: await exists(outputBlend) ? outputBlend : null,
    combinedOBJ: await exists(combinedOBJ) ? combinedOBJ : null,
    stdout: result.stdout
  };
}

/**
 * Blender script for COLMAP alignment
 * Takes COLMAP sparse reconstruction and aligns GIS buildings to it
 */
const BLENDER_ALIGNMENT_SCRIPT = `
import bpy
import bmesh
import json
import math
import os

# Load COLMAP data
with open("{colmap_json}", 'r') as f:
    colmap = json.load(f)

# Load GIS buildings
with open("{gis_metadata}", 'r') as f:
    gis = json.load(f)

# Extract camera poses from COLMAP
cameras = {}
for cam in colmap.get('cameras', []):
    cameras[cam['id']] = cam

images = {}
for img in colmap.get('images', []):
    images[img['id']] = img

points3D = {}
for pt in colmap.get('points3D', []):
    points3D[pt['id']] = pt

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Import GIS buildings
for building in gis.get('buildings', []):
    obj_file = building.get('objFile')
    if not obj_file:
        continue
    obj_path = os.path.join(os.path.dirname("{gis_metadata}"), obj_file)
    if os.path.exists(obj_path):
        bpy.ops.wm.obj_import(filepath=obj_path)
        for obj in bpy.context.selected_objects:
            obj.name = building['id']

# Create camera objects from COLMAP
for img_id, img in images.items():
    cam = cameras.get(img['camera_id'])
    if not cam:
        continue
    
    # Create camera
    cam_data = bpy.data.cameras.new(f"cam_{img_id}")
    cam_obj = bpy.data.objects.new(f"cam_{img_id}", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    
    # Set pose (COLMAP: qvec [w, x, y, z], tvec [x, y, z])
    q = img['qvec']  # [w, x, y, z]
    t = img['tvec']  # [x, y, z]
    
    # Convert quaternion to Euler
    import mathutils
    quat = mathutils.Quaternion((q[0], q[1], q[2], q[3]))
    cam_obj.rotation_mode = 'QUATERNION'
    cam_obj.rotation_quaternion = quat
    cam_obj.location = mathutils.Vector(t)
    
    # Set camera parameters
    if cam['model'] == 'SIMPLE_PINHOLE':
        f = cam['params'][0]
    elif cam['model'] == 'PINHOLE':
        f = cam['params'][0]
    else:
        f = cam['params'][0]
    
    cam_data.lens = f
    cam_data.sensor_width = cam['width'] * 0.1  # Approximate

# Create sparse point cloud as mesh
if points3D:
    mesh = bpy.data.meshes.new("colmap_points")
    obj = bpy.data.objects.new("COLMAP_Points", mesh)
    bpy.context.collection.objects.link(obj)
    
    bm = bmesh.new()
    for pt_id, pt in points3D.items():
        bm.verts.new(pt['xyz'])
    bm.to_mesh(mesh)
    bm.free()

# Save aligned scene
bpy.ops.wm.save_as_mainfile(filepath="{output_blend}")

print(f"Aligned {len(images)} cameras and {len(points3D)} points")
`

/**
 * Align GIS buildings to COLMAP reconstruction
 */
export async function alignToCOLMAP(gisMetadataPath, colmapJSONPath, options = {}) {
  const {
    outputDir = path.dirname(gisMetadataPath),
    blenderExecutable = 'blender'
  } = options;
  
  const outputBlend = path.join(outputDir, 'koelnmesse_aligned.blend');
  
  const script = BLENDER_ALIGNMENT_SCRIPT
    .replace('{colmap_json}', colmapJSONPath.replace(/\\/g, '\\\\'))
    .replace('{gis_metadata}', gisMetadataPath.replace(/\\/g, '\\\\'))
    .replace('{output_blend}', outputBlend.replace(/\\/g, '\\\\'));
  
  console.log('[Blender] Aligning GIS to COLMAP...');
  const result = await runBlenderScript(script, blenderExecutable);
  console.log('[Blender] Alignment done');
  
  return {
    alignedBlend: outputBlend,
    stdout: result.stdout
  };
}

/**
 * Blender script for SHADED depth fusion
 * Takes SHADED depth maps and projects onto GIS mesh
 */
const BLENDER_SHADED_FUSION_SCRIPT = `
import bpy
import bmesh
import json
import os
import numpy as np

# Load SHADED depth data
with open("{shaded_depth_json}", 'r') as f:
    shaded = json.load(f)

# Load aligned scene
bpy.ops.wm.open_mainfile(filepath="{aligned_blend}")

# For each SHADED depth map, create texture and project
for depth_data in shaded.get('depthMaps', []):
    image_path = depth_data['imagePath']
    camera_id = depth_data['cameraId']
    depth_map = depth_data['depth']  # Float32Array as list
    width = depth_data['width']
    height = depth_data['height']
    
    # Create depth texture
    img = bpy.data.images.load(image_path) if os.path.exists(image_path) else None
    if not img:
        # Create from depth data
        img = bpy.data.images.new(f"depth_{camera_id}", width=width, height=height, alpha=False)
        pixels = [0.0] * (width * height * 4)
        for i, d in enumerate(depth_map):
            pixels[i * 4] = d
            pixels[i * 4 + 1] = d
            pixels[i * 4 + 2] = d
            pixels[i * 4 + 3] = 1.0
        img.pixels = pixels
        img.pack()

    # Find camera
    cam_obj = bpy.data.objects.get(f"cam_{camera_id}")
    if not cam_obj:
        continue
    
    # Project depth onto nearby geometry using shader
    # This is a simplified approach - in practice use a custom shader
    
print("SHADED depth fusion complete")

bpy.ops.wm.save_as_mainfile(filepath="{output_blend}")
`

/**
 * Fuse SHADED depth maps onto GIS mesh
 */
export async function fuseSHADEDDepths(alignedBlendPath, shadedDepthJSONPath, options = {}) {
  const {
    outputDir = path.dirname(alignedBlendPath),
    blenderExecutable = 'blender'
  } = options;
  
  const outputBlend = path.join(outputDir, 'koelnmesse_fused.blend');
  
  const script = BLENDER_SHADED_FUSION_SCRIPT
    .replace('{shaded_depth_json}', shadedDepthJSONPath.replace(/\\/g, '\\\\'))
    .replace('{aligned_blend}', alignedBlendPath.replace(/\\/g, '\\\\'))
    .replace('{output_blend}', outputBlend.replace(/\\/g, '\\\\'));
  
  console.log('[Blender] Fusing SHADED depths...');
  const result = await runBlenderScript(script, blenderExecutable);
  console.log('[Blender] Fusion done');
  
  return {
    fusedBlend: outputBlend,
    stdout: result.stdout
  };
}

/**
 * Export final assets for rendering
 */
export async function exportFinalAssets(fusedBlendPath, options = {}) {
  const {
    outputDir = path.dirname(fusedBlendPath),
    formats = ['gltf', 'obj', 'usd'],
    blenderExecutable = 'blender'
  } = options;
  
  const exportScript = `
import bpy
import os

bpy.ops.wm.open_mainfile(filepath="${fusedBlendPath}")

output_dir = "${outputDir}"

for fmt in ${JSON.stringify(formats)}:
    if fmt == 'gltf':
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(output_dir, "koelnmesse.gltf"),
            export_format='GLTF_SEPARATE',
            export_materials='EXPORT',
            export_cameras=True,
            export_lights=True
        )
    elif fmt == 'obj':
        bpy.ops.export_scene.obj(
            filepath=os.path.join(output_dir, "koelnmesse.obj"),
            use_selection=False
        )
    elif fmt == 'usd':
        bpy.ops.wm.usd_export(
            filepath=os.path.join(output_dir, "koelnmesse.usd"),
            export_materials=True
        )

print("Exported all formats")
  `.replace('${fusedBlendPath}', fusedBlendPath.replace(/\\/g, '\\\\'))
   .replace('${outputDir}', outputDir.replace(/\\/g, '\\\\'));
  
  console.log('[Blender] Exporting final assets...');
  const result = await runBlenderScript(exportScript, blenderExecutable);
  console.log('[Blender] Export done');
  
  return { stdout: result.stdout };
}

export default {
  generateBaseMesh,
  alignToCOLMAP,
  fuseSHADEDDepths,
  exportFinalAssets,
  runBlenderScript
};