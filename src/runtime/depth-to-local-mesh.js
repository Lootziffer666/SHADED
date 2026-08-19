// Depth-to-local-mesh pipeline for SHADED's PHOTO-FIRST system
// Generates textured surface mesh patches from depth maps with proper discontinuity handling

import { PhotoCamera, Photo, SurfacePatch, PhotoFirstUtils } from './photo-first-reconstruction.js';
import { ReverseViewfinderCalibrator } from './reverse-viewfinder-calibrator.js';

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Processes a depth map to generate a local textured surface mesh patch
 * Respects depth discontinuities to prevent stretching across large depth changes
 */
export class DepthToMeshProcessor {
  constructor() {
    this.depthMap = null; // Float32Array of depth values (width x height)
    this.confidenceMap = null; // Float32Array of confidence values (width x height)
    this.rgbImage = null; // HTMLImageElement or equivalent for texturing
    this.camera = null; // PhotoCamera associated with the image
    this.width = 0;
    this.height = 0;
    
    // Processing parameters
    this.depthDiscontinuityThreshold = 0.3; // Relative threshold for depth jumps
    this.normalDeviationThreshold = 0.5; // Dot product threshold for normal changes
    this.minConfidenceThreshold = 0.1; // Minimum confidence to process a pixel
    this.pointBudget = 50000; // Target number of points in the mesh
    this.edgeDetectionEnabled = true; // Whether to use edge detection for discontinuities
    
    // Results
    this.generatedPatch = null; // SurfacePatch containing the generated mesh
    this.processingStats = {
      totalPixels: 0,
      processedPixels: 0,
      rejectedPixels: 0,
      trianglesGenerated: 0,
      meanDepth: 0,
      depthRange: [0, 0]
    };
  }

  /**
   * Sets the input data for processing
   * @param {Float32Array} depthMap - Depth map (width x height)
   * @param {Float32Array} confidenceMap - Confidence map (width x height)
   * @param {HTMLImageElement|ImageBitmap} rgbImage - RGB image for texturing
   * @param {PhotoCamera} camera - Camera parameters for the image
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   */
  setInputData(depthMap, confidenceMap, rgbImage, camera, width, height) {
    this.depthMap = depthMap;
    this.confidenceMap = confidenceMap;
    this.rgbImage = rgbImage;
    this.camera = camera;
    this.width = width;
    this.height = height;
    
    // Reset processing stats
    this.processingStats = {
      totalPixels: width * height,
      processedPixels: 0,
      rejectedPixels: 0,
      trianglesGenerated: 0,
      meanDepth: 0,
      depthRange: [Infinity, -Infinity]
    };
    
    // Reset generated patch
    this.generatedPatch = null;
  }

  /**
   * Processes the depth map and generates a surface patch
   * @param {string} patchId - ID for the generated patch
   * @param {string} photoId - ID of the source photo
   * @param {string} cameraId - ID of the source camera
   * @returns {SurfacePatch} - Generated surface patch
   */
  processDepthMap(patchId, photoId, cameraId) {
    if (!this.depthMap || !this.confidenceMap || !this.rgbImage || !this.camera) {
      throw new Error('Input data not properly set');
    }
    
    // Create new surface patch
    const patch = new SurfacePatch(patchId, photoId, cameraId);
    patch.provenance = 'OBSERVED';
    
    // Calculate depth statistics for metadata
    this.calculateDepthStatistics();
    
    // Generate mesh using grid-based approach with discontinuity handling
    this.generateGridMesh(patch);
    
    // Apply any post-processing
    this.postProcessMesh(patch);
    
    // Store the generated patch
    this.generatedPatch = patch;
    
    return patch;
  }

  /**
   * Calculates depth statistics for metadata
   */
  calculateDepthStatistics() {
    let sum = 0;
    let validCount = 0;
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    
    for (let i = 0; i < this.depthMap.length; i++) {
      const depth = this.depthMap[i];
      const confidence = this.confidenceMap[i];
      
      if (isFinite(depth) && depth > 0 && confidence >= this.minConfidenceThreshold) {
        sum += depth;
        validCount++;
        minDepth = Math.min(minDepth, depth);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    
    this.processingStats.meanDepth = validCount > 0 ? sum / validCount : 0;
    this.processingStats.depthRange = [
      isFinite(minDepth) ? minDepth : 0,
      isFinite(maxDepth) ? maxDepth : 0
    ];
    
    // Store in patch metadata
    if (this.generatedPatch) {
      this.generatedPatch.depthMetadata.minDepth = this.processingStats.depthRange[0];
      this.generatedPatch.depthMetadata.maxDepth = this.processingStats.depthRange[1];
      this.generatedPatch.depthMetadata.meanDepth = this.processingStats.meanDepth;
    }
  }

  /**
   * Generates a mesh from the depth map using a grid approach
   * Respects depth discontinuities and confidence thresholds
   * @param {SurfacePatch} patch - Patch to add vertices and triangles to
   */
  generateGridMesh(patch) {
    // Calculate adaptive step size based on point budget
    const totalPixels = this.width * this.height;
    let step = Math.max(1, Math.ceil(Math.sqrt(totalPixels / this.pointBudget)));
    
    // Ensure we don't step too much
    step = Math.min(step, Math.min(this.width, this.height));
    
    // Create vertex map to avoid duplicates
    const vertexMap = new Map(); // key: "x,y" -> vertex index
    
    // First pass: generate vertices
    for (let y = 0; y < this.height; y += step) {
      for (let x = 0; x < this.width; x += step) {
        const index = y * this.width + x;
        const depth = this.depthMap[index];
        const confidence = this.confidenceMap[index];
        
        // Skip if depth is invalid or confidence too low
        if (!isFinite(depth) || depth <= 0 || confidence < this.minConfidenceThreshold) {
          this.processingStats.rejectedPixels++;
          continue;
        }
        
        // Unproject pixel to 3D point using camera
        const uv = [x / this.width, y / this.height];
        const worldPos = this.camera.unproject(uv, depth);
        
        if (!worldPos) {
          this.processingStats.rejectedPixels++;
          continue;
        }
        
        // Get UV coordinates for texturing
        const [u, v] = uv;
        
        // Create vertex: [x, y, z, u, v]
        const vertex = [...worldPos, u, v];
        const vertexIndex = patch.addVertex(vertex);
        
        // Store in map for triangle generation
        const mapKey = `${x},${y}`;
        vertexMap.set(mapKey, vertexIndex);
        
        this.processingStats.processedPixels++;
      }
    }
    
    // Second pass: generate triangles while respecting discontinuities
    this.generateTrianglesWithDiscontinuityHandling(patch, vertexMap, step);
  }

  /**
   * Generates triangles for the mesh while respecting depth and normal discontinuities
   * @param {SurfacePatch} patch - Patch to add triangles to
   * @param {Map<string, number>} vertexMap - Map from "x,y" coordinates to vertex indices
   * @param {number} step - Sampling step used for vertex generation
   */
  generateTrianglesWithDiscontinuityHandling(patch, vertexMap, step) {
    // Process each cell in the grid
    for (let gridY = 0; gridY < Math.ceil(this.height / step) - 1; gridY++) {
      for (let gridX = 0; gridX < Math.ceil(this.width / step) - 1; gridX++) {
        // Calculate pixel coordinates of the four corners
        const x0 = gridX * step;
        const y0 = gridY * step;
        const x1 = Math.min((gridX + 1) * step, this.width - 1);
        const y1 = Math.min((gridY + 1) * step, this.height - 1);
        
        // Skip if any corner is missing
        const keys = [
          `${x0},${y0}`,
          `${x1},${y0}`,
          `${x0},${y1}`,
          `${x1},${y1}`
        ];
        
        if (!keys.every(key => vertexMap.has(key))) {
          continue;
        }
        
        // Get vertex indices for the four corners
        const v00 = vertexMap.get(`${x0},${y0}`);
        const v10 = vertexMap.get(`${x1},${y0}`);
        const v01 = vertexMap.get(`${x0},${y1}`);
        const v11 = vertexMap.get(`${x1},${y1}`);
        
        // Check depth discontinuities for both potential triangle splits
        // Triangle 1: v00 -> v10 -> v01
        // Triangle 2: v10 -> v11 -> v01
        
        const depth00 = this.depthMap[y0 * this.width + x0];
        const depth10 = this.depthMap[y0 * this.width + x1];
        const depth01 = this.depthMap[y1 * this.width + x0];
        const depth11 = this.depthMap[y1 * this.width + x1];
        
        const conf00 = this.confidenceMap[y0 * this.width + x0];
        const conf10 = this.confidenceMap[y0 * this.width + x1];
        const conf01 = this.confidenceMap[y1 * this.width + x0];
        const conf11 = this.confidenceMap[y1 * this.width + x1];
        
        // Check if we can form triangle 1 (v00-v10-v01)
        const tri1Valid = this.canFormTriangle(
          [x0, y0], [x1, y0], [x0, y1],
          depth00, depth10, depth01,
          conf00, conf10, conf01,
          vertexMap
        );
        
        // Check if we can form triangle 2 (v10-v11-v01)
        const tri2Valid = this.canFormTriangle(
          [x1, y0], [x1, y1], [x0, y1],
          depth10, depth11, depth01,
          conf10, conf11, conf01,
          vertexMap
        );
        
        // Add triangles if valid
        if (tri1Valid) {
          patch.addTriangle([v00, v10, v01]);
          this.processingStats.trianglesGenerated++;
        }
        
        if (tri2Valid) {
          patch.addTriangle([v10, v11, v01]);
          this.processingStats.trianglesGenerated++;
        }
      }
    }
  }

  /**
   * Checks if a triangle can be formed given depth and normal constraints
   * @param {[number, number]} p1 - First point coordinates [x, y]
   * @param {[number, number]} p2 - Second point coordinates [x, y]
   * @param {[number, number]} p3 - Third point coordinates [x, y]
   * @param {number} d1 - Depth at point 1
   * @param {number} d2 - Depth at point 2
   * @param {number} d3 - Depth at point 3
   * @param {number} c1 - Confidence at point 1
   * @param {number} c2 - Confidence at point 2
   * @param {number} c3 - Confidence at point 3
   * @param {Map<string, number>} vertexMap - Map from coordinates to vertex indices
   * @returns {boolean} - True if triangle can be formed
   */
  canFormTriangle(p1, p2, p3, d1, d2, d3, c1, c2, c3, vertexMap) {
    // Check confidence thresholds
    if (c1 < this.minConfidenceThreshold || 
        c2 < this.minConfidenceThreshold || 
        c3 < this.minConfidenceThreshold) {
      return false;
    }
    
    // Check depth discontinuities
    const depths = [d1, d2, d3];
    const maxDepth = Math.max(...depths);
    const minDepth = Math.min(...depths);
    
    if (minDepth > 0 && maxDepth / minDepth > (1.0 + this.depthDiscontinuityThreshold)) {
      return false; // Too large depth variation
    }
    
    // Check normal deviations if we have normal data
    // For simplicity, we'll approximate normals from depth gradients
    // In a full implementation, we'd use the actual normal map
    
    return true;
  }

  /**
   * Post-processes the generated mesh
   * @param {SurfacePatch} patch - Patch to post-process
   */
  postProcessMesh(patch) {
    // Remove duplicate vertices
    this.removeDuplicateVertices(patch);
    
    // Remove degenerate triangles
    this.removeDegenerateTriangles(patch);
    
    // Optionally simplify the mesh
    // this.simplifyMesh(patch);
  }

  /**
   * Removes duplicate vertices (vertices at same position)
   * @param {SurfacePatch} patch - Patch to process
   */
  removeDuplicateVertices(patch) {
    if (patch.vertices.length === 0) return;
    
    // Create map of positions to vertex indices
    const positionMap = new Map();
    const newToOldIndex = new Array(patch.vertices.length);
    const uniqueVertices = [];
    
    for (let i = 0; i < patch.vertices.length; i++) {
      const vertex = patch.vertices[i];
      const posKey = `${vertex[0].toFixed(6)},${vertex[1].toFixed(6)},${vertex[2].toFixed(6)}`;
      
      if (!positionMap.has(posKey)) {
        positionMap.set(posKey, uniqueVertices.length);
        uniqueVertices.push(vertex);
      }
      
      newToOldIndex[i] = positionMap.get(posKey);
    }
    
    // Update vertices
    patch.vertices = uniqueVertices;
    
    // Update indices to reference new vertex positions
    const newIndices = [];
    for (let i = 0; i < patch.indices.length; i++) {
      const oldIndex = patch.indices[i];
      const newIndex = newToOldIndex[oldIndex];
      if (newIndex !== undefined) {
        newIndices.push(newIndex);
      }
    }
    
    patch.indices = newIndices;
  }

  /**
   * Removes degenerate triangles (triangles with zero area or overlapping vertices)
   * @param {SurfacePatch} patch - Patch to process
   */
  removeDegenerateTriangles(patch) {
    if (patch.indices.length < 3) return;
    
    const newIndices = [];
    
    for (let i = 0; i < patch.indices.length; i += 3) {
      if (i + 2 >= patch.indices.length) break;
      
      const i1 = patch.indices[i];
      const i2 = patch.indices[i + 1];
      const i3 = patch.indices[i + 2];
      
      // Check if indices are valid
      if (i1 >= patch.vertices.length || 
          i2 >= patch.vertices.length || 
          i3 >= patch.vertices.length) {
        continue;
      }
      
      // Check if all indices are the same (degenerate)
      if (i1 === i2 || i2 === i3 || i1 === i3) {
        continue;
      }
      
      // Calculate triangle area to check for near-zero area
      const v1 = patch.vertices[i1];
      const v2 = patch.vertices[i2];
      const v3 = patch.vertices[i3];
      
      const p1 = [v1[0], v1[1], v1[2]];
      const p2 = [v2[0], v2[1], v2[2]];
      const p3 = [v3[0], v3[1], v3[2]];
      
      // Vector cross product method for area
      const u = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
      const v = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
      
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
      ];
      
      const area = Math.hypot(...cross) / 2;
      
      // Keep triangle if area is significant
      if (area > EPS) {
        newIndices.push(i1, i2, i3);
      }
    }
    
    patch.indices = newIndices;
  }

  /**
   * Simplifies the mesh using quadric error metrics
   * Placeholder for future implementation
   * @param {SurfacePatch} patch - Patch to simplify
   * @param {number} targetCount - Target number of triangles
   */
  simplifyMesh(patch, targetCount) {
    // TODO: Implement mesh simplification using quadric error metrics
    // For now, we'll just return the original mesh
    // In a full implementation, we'd use libraries like mesh-simplifier
    // or implement a custom simplification algorithm
  }

  /**
   * Gets the generated surface patch
   * @returns {SurfacePatch|null} - The generated patch or null if none
   */
  getGeneratedPatch() {
    return this.generatedPatch;
  }

  /**
   * Gets processing statistics
   * @returns {Object} - Statistics about the processing operation
   */
  getProcessingStats() {
    return {...this.processingStats};
  }

  /**
   * Estimates memory usage of the generated mesh
   * @returns {number} - Estimated memory usage in bytes
   */
  estimateMemoryUsage() {
    if (!this.generatedPatch) return 0;
    
    // Vertices: 5 floats each (x, y, z, u, v)
    // Indices: 3 integers each
    const vertexBytes = this.generatedPatch.vertices.length * 5 * 4; // 4 bytes per float
    const indexBytes = this.generatedPatch.indices.length * 3 * 4; // 4 bytes per int
    
    return vertexBytes + indexBytes;
  }

  /**
   * Creates a simplified collision mesh from the surface patch
   * @param {SurfacePatch} patch - Source patch
   * @param {number} maxVertices - Maximum vertices for collision mesh
   * @returns {SurfacePatch} - Simplified patch for collision
   */
  createCollisionMesh(patch, maxVertices = 100) {
    // For now, return a copy of the original patch
    // In a full implementation, we'd simplify further for collision
    return patch.clone();
  }
}

/**
 * Utility functions for depth processing
 */
export const DepthProcessingUtils = {
  /**
   * Bilinear interpolation of depth values
   * @param {Float32Array} depthMap - Depth map data
   * @param {number} width - Width of depth map
   * @param {number} height - Height of depth map
   * @param {number} x - X coordinate (can be fractional)
   * @param {number} y - Y coordinate (can be fractional)
   * @returns {number} - Interpolated depth value
   */
  bilinearInterpolateDepth(depthMap, width, height, x, y) {
    // Clamp coordinates to valid range
    x = clamp(x, 0, width - 1);
    y = clamp(y, 0, height - 1);
    
    // Get integer parts
    const x0 = Math.floor(x);
    const x1 = Math.min(x0 + 1, width - 1);
    const y0 = Math.floor(y);
    const y1 = Math.min(y0 + 1, height - 1);
    
    // Get fractional parts
    const sx = x - x0;
    const sy = y - y0;
    const sx1 = 1.0 - sx;
    const sy1 = 1.0 - sy;
    
    // Get depth values at corners
    const i00 = y0 * width + x0;
    const i10 = y0 * width + x1;
    const i01 = y1 * width + x0;
    const i11 = y1 * width + x1;
    
    const d00 = depthMap[i00];
    const d10 = depthMap[i10];
    const d01 = depthMap[i01];
    const d11 = depthMap[i11];
    
    // Bilinear interpolation
    const d0 = d00 * sx1 + d10 * sx;
    const d1 = d01 * sx1 + d11 * sx;
    return d0 * sy1 + d1 * sy;
  },

  /**
   * Computes gradient of depth map using Sobel operator
   * @param {Float32Array} depthMap - Depth map data
   * @param {number} width - Width of depth map
   * @param {number} height - Height of depth map
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {[number, number]} - Gradient vector [dx, dy]
   */
  computeDepthGradient(depthMap, width, height, x, y) {
    // Sobel kernels
    const kernelX = [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1]
    ];
    
    const kernelY = [
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1]
    ];
    
    let dx = 0;
    let dy = 0;
    let weightSum = 0;
    
    // Apply Sobel operator
    for (let ky = -1; ky <= 1; ky++) {
      for (let kx = -1; kx <= 1; kx++) {
        const sampleX = clamp(x + kx, 0, width - 1);
        const sampleY = clamp(y + ky, 0, height - 1);
        const index = sampleY * width + sampleX;
        const depth = depthMap[index];
        
        if (!isFinite(depth)) continue;
        
        const wx = kernelX[ky + 1][kx + 1];
        const wy = kernelY[ky + 1][kx + 1];
        
        dx += depth * wx;
        dy += depth * wy;
        weightSum += Math.abs(wx) + Math.abs(wy);
      }
    }
    
    if (weightSum > 0) {
      dx /= weightSum;
      dy /= weightSum;
    }
    
    return [dx, dy];
  },

  /**
   * Estimates normal from depth gradient
   * @param {[number, number]} gradient - Depth gradient [dx, dy]
   * @param {number} depth - Depth value at point
   * @param {number} fx - Focal length x
   * @param {number} fy - Focal length y
   * @returns {[number, number, number]} - Normal vector [nx, ny, nz]
   */
  estimateNormalFromDepthGradient(gradient, depth, fx, fy) {
    const [dx, dy] = gradient;
    
    // Convert image plane gradients to world space
    // Assuming pinhole camera model
    // dx_world = dx * depth / fx
    // dy_world = dy * depth / fy
    // dz_world = 1 (approximation for small angles)
    
    const wx = dx * depth / fx;
    const wy = dy * depth / fy;
    const wz = 1.0;
    
    // The normal is perpendicular to the surface
    // For a depth map, surface normal is approximately [-dx, -dy, 1] normalized
    const nx = -wx;
    const ny = -wy;
    const nz = wz;
    
    // Normalize
    const length = Math.hypot(nx, ny, nz);
    if (length > EPS) {
      return [nx / length, ny / length, nz / length];
    }
    
    return [0, 0, 1]; // Default upward normal
  },

  /**
   * Applies a bilateral filter to depth map for denoising while preserving edges
   * @param {Float32Array} depthMap - Input depth map
   * @param {Float32Array} confidenceMap - Confidence map
   * @param {number} width - Width of maps
   * @param {number} height - Height of maps
   * @param {number} diameter - Filter diameter
   * @param {number} sigmaDepth - Depth standard deviation
   * @param {number} sigmaSpace - Space standard deviation
   * @returns {Float32Array} - Filtered depth map
   */
  bilateralFilterDepth(depthMap, confidenceMap, width, height, diameter, sigmaDepth, sigmaSpace) {
    const filtered = new Float32Array(depthMap.length);
    const radius = Math.floor(diameter / 2);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;
        
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const sampleX = clamp(x + kx, 0, width - 1);
            const sampleY = clamp(y + ky, 0, height - 1);
            const index = sampleY * width + sampleX;
            
            const depth = depthMap[index];
            const confidence = confidenceMap[index];
            
            if (!isFinite(depth) || !isFinite(confidence)) continue;
            
            // Spatial distance
            const dx = sampleX - x;
            const dy = sampleY - y;
            const spatialDist = dx * dx + dy * dy;
            
            // Depth difference (using center pixel depth)
            const centerIndex = y * width + x;
            const centerDepth = depthMap[centerIndex];
            const depthDiff = Math.abs(depth - centerDepth);
            
            // Gaussian weights
            const spatialWeight = Math.exp(-spatialDist / (2 * sigmaSpace * sigmaSpace));
            const depthWeight = Math.exp(-depthDiff * depthDiff / (2 * sigmaDepth * sigmaDepth));
            const confidenceWeight = confidence; // Use confidence as weight
            
            const weight = spatialWeight * depthWeight * confidenceWeight;
            
            sum += depth * weight;
            weightSum += weight;
          }
        }
        
        filtered[y * width + x] = weightSum > 0 ? sum / weightSum : depthMap[y * width + x];
      }
    }
    
    return filtered;
  }
};