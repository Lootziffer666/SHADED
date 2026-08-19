// Patch registration utilities for SHADED's PHOTO-FIRST system
// Implements ICP, feature matching, and overlap detection for aligning surface patches

import { PhotoFirstUtils, SurfacePatch } from '../photo-first-reconstruction.js';
import { DepthToMeshProcessor } from '../depth-to-local-mesh.js';

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Registers surface patches to each other and to the world using various algorithms
 */
export class PatchRegistrar {
  constructor() {
    this.patches = new Map(); // Map of patchId -> SurfacePatch
    this.world = null; // Reference to PhotoFirstWorld
    
    // Registration parameters
    this.maxIterations = 30;
    this.tolerance = 0.001;
    this.featureMatchDistanceThreshold = 0.1; // In world units
    this.overlapDistanceThreshold = 0.05; // For overlap detection
    this.minOverlapRatio = 0.1; // Minimum overlap to consider patches connected
    
    // Statistics
    this.registrationStats = {
      icpIterations: 0,
      featureMatches: 0,
      overlapsDetected: 0,
      registrationSuccess: 0,
      registrationFailure: 0
    };
  }

  /**
   * Sets the world reference
   * @param {PhotoFirstWorld} world - The world to register patches to
   */
  setWorld(world) {
    this.world = world;
  }

  /**
   * Adds a patch to the registrar
   * @param {SurfacePatch} patch - Patch to register
   */
  addPatch(patch) {
    this.patches.set(patch.id, patch);
  }

  /**
   * Removes a patch from the registrar
   * @param {string} patchId - ID of patch to remove
   */
  removePatch(patchId) {
    this.patches.delete(patchId);
  }

  /**
   * Registers a patch to the world using ICP
   * @param {string} patchId - ID of patch to register
   * @param {string} targetMethod - Method to use ('icp', 'feature', 'hybrid', 'none')
   * @returns {Object} - Registration result
   */
  registerPatchToWorld(patchId, targetMethod = 'hybrid') {
    const patch = this.patches.get(patchId);
    if (!patch) {
      return { success: false, error: 'Patch not found' };
    }
    
    if (!this.world) {
      return { success: false, error: 'World not set' };
    }
    
    // Get all other patches as potential targets
    const targetPatches = Array.from(this.patches.values())
      .filter(p => p.id !== patchId);
    
    if (targetPatches.length === 0) {
      // No other patches to register to - register to world origin
      return this.registerToWorldOrigin(patch);
    }
    
    let bestResult = null;
    let bestMethod = null;
    
    // Try different registration methods
    if (targetMethod === 'icp' || targetMethod === 'hybrid') {
      const icpResult = this.registerUsingICP(patch, targetPatches);
      if (icpResult.success) {
        bestResult = icpResult;
        bestMethod = 'icp';
      }
    }
    
    if (targetMethod === 'feature' || targetMethod === 'hybrid') {
      const featureResult = this.registerUsingFeatureMatching(patch, targetPatches);
      if (featureResult.success && 
          (!bestResult || featureResult.fidelity > bestResult.fidelity)) {
        bestResult = featureResult;
        bestMethod = 'feature';
      }
    }
    
    // If no specific method worked, try to register to world origin as fallback
    if (!bestResult) {
      const originResult = this.registerToWorldOrigin(patch);
      if (originResult.success) {
        bestResult = originResult;
        bestMethod = 'origin';
      }
    }
    
    // Apply the best transformation if found
    if (bestResult && bestResult.success) {
      this.applyRegistration(patch, bestResult.transformation, bestMethod);
      this.registrationStats.registrationSuccess++;
      return bestResult;
    } else {
      this.registrationStats.registrationFailure++;
      return { 
        success: false, 
        error: 'Registration failed with all methods', 
        triedMethods: targetMethod === 'hybrid' ? ['icp', 'feature', 'origin'] : [targetMethod]
      };
    }
  }

  /**
   * Registers a patch using Iterative Closest Point (ICP) algorithm
   * @param {SurfacePatch} patch - Patch to register
   * @param {SurfacePatch[]} targetPatches - Target patches to register to
   * @returns {Object} - Registration result
   */
  registerUsingICP(patch, targetPatches) {
    this.registrationStats.icpIterations++;
    
    // Combine all target patch vertices into a single point cloud
    const targetPoints = [];
    for (const target of targetPatches) {
      for (const vertex of target.vertices) {
        // Extract position [x, y, z] from vertex [x, y, z, u, v]
        targetPoints.push([vertex[0], vertex[1], vertex[2]]);
      }
    }
    
    if (targetPoints.length < 3) {
      return { success: false, error: 'Not enough target points for ICP' };
    }
    
    // Source points from the patch to be registered
    const sourcePoints = [];
    for (const vertex of patch.vertices) {
      sourcePoints.push([vertex[0], vertex[1], vertex[2]]);
    }
    
    if (sourcePoints.length < 3) {
      return { success: false, error: 'Not enough source points for ICP' };
    }
    
    // Initialize transformation as identity
    let transformation = PhotoFirstUtils.createIdentityMatrix();
    let lastError = Infinity;
    
    // ICP iterations
    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      // Transform source points by current transformation
      const transformedPoints = sourcePoints.map(pt => 
        PhotoFirstUtils.transformPoint(pt, transformation)
      );
      
      // Find closest points in target
      const closestPairs = this.findClosestPoints(transformedPoints, targetPoints);
      
      if (closestPairs.length < 3) {
        break; // Not enough correspondences
      }
      
      // Compute transformation between corresponding points
      const deltaTransform = this.computeRigidTransform(
        closestPairs.map(p => p.source),
        closestPairs.map(p => p.target)
      );
      
      // Apply the delta transformation
      transformation = PhotoFirstUtils.multiplyMatrices(
        deltaTransform,
        transformation
      );
      
      // Calculate mean squared error
      const mse = this.calculateMSE(
        closestPairs.map(p => p.source),
        closestPairs.map(p => p.target),
        transformation
      );
      
      // Check for convergence
      if (Math.abs(lastError - mse) < this.tolerance) {
        break;
      }
      
      lastError = mse;
    }
    
    // Calculate final fidelity based on inlier ratio and error
    const finalError = lastError;
    const inlierRatio = closestPairs.length / Math.max(sourcePoints.length, targetPoints.length);
    const fidelity = Math.max(0, 1 - finalError * 10) * inlierRatio; // Scale error to [0,1] range
    
    return {
      success: true,
      transformation: transformation,
      method: 'icp',
      fidelity: fidelity,
      error: finalError,
      inlierRatio: inlierRatio,
      iterations: this.registrationStats.icpIterations
    };
  }

  /**
   * Registers a patch using feature-based matching
   * @param {SurfacePatch} patch - Patch to register
   * @param {SurfacePatch[]} targetPatches - Target patches to register to
   * @returns {Object} - Registration result
   */
  registerUsingFeatureMatching(patch, targetPatches) {
    this.registrationStats.featureMatches++;
    
    // Extract features from source patch
    const sourceFeatures = this.extractPatchFeatures(patch);
    
    let bestMatch = null;
    let bestFidelity = 0;
    let bestTransformation = null;
    
    // Compare against each target patch
    for (const target of targetPatches) {
      // Extract features from target patch
      const targetFeatures = this.extractPatchFeatures(target);
      
      // Find feature matches
      const matches = this.matchFeatures(sourceFeatures, targetFeatures);
      
      if (matches.length >= 3) {
        // Estimate transformation from matches
        const transformation = this.estimateTransformFromMatches(
          matches.map(m => m.source),
          matches.map(m => m.target)
        );
        
        if (transformation) {
          // Calculate fidelity based on number of matches and consistency
          matchCount = matches.length;
          consistency = this.calculateMatchConsistency(matches);
          fidelity = Math.min(matchCount / 20, 1.0) * consistency; // Normalize by expected matches
          
          if (fidelity > bestFidelity) {
            bestFidelity = fidelity;
            bestMatch = { patch: target, matches: matches };
            bestTransformation = transformation;
          }
        }
      }
    }
    
    if (bestTransformation && bestFidelity > 0.1) {
      return {
        success: true,
        transformation: bestTransformation,
        method: 'feature',
        fidelity: bestFidelity,
        matchCount: bestMatch ? bestMatch.matches.length : 0,
        consistency: this.calculateMatchConsistency(bestMatch ? bestMatch.matches : [])
      };
    } else {
      return { success: false, error: 'No sufficient feature matches found' };
    }
  }

  /**
   * Detects overlap between patches
   * @param {string} patchId1 - ID of first patch
   * @param {string} patchId2 - ID of second patch
   * @returns {Object} - Overlap detection result
   */
  detectOverlap(patchId1, patchId2) {
    this.registrationStats.overlapsDetected++;
    
    const patch1 = this.patches.get(patchId1);
    const patch2 = this.patches.get(patchId2);
    
    if (!patch1 || !patch2) {
      return { success: false, error: 'One or both patches not found' };
    }
    
    // Get vertices as point clouds
    const points1 = patch1.vertices.map(v => [v[0], v[1], v[2]]);
    const points2 = patch2.vertices.map(v => [v[0], v[1], v[2]]);
    
    if (points1.length === 0 || points2.length === 0) {
      return { success: false, error: 'One or both patches have no vertices' };
    }
    
    // Find points in patch1 that are close to patch2
    const closePoints1 = [];
    const closePoints2 = [];
    
    for (const p1 of points1) {
      for (const p2 of points2) {
        const distance = PhotoFirstUtils.distance(p1, p2);
        if (distance < this.overlapDistanceThreshold) {
          closePoints1.push(p1);
          closePoints2.push(p2);
          break; // Each point only counts once
        }
      }
    }
    
    // Calculate overlap ratio
    const overlapRatio1 = closePoints1.length / points1.length;
    const overlapRatio2 = closePoints2.length / points2.length;
    const overlapRatio = Math.min(overlapRatio1, overlapRatio2);
    
    const hasOverlap = overlapRatio >= this.minOverlapRatio;
    
    // If there's significant overlap, compute the transformation
    let transformation = null;
    if (hasOverlap && closePoints1.length >= 3) {
      transformation = this.computeRigidTransform(closePoints1, closePoints2);
    }
    
    return {
      success: true,
      hasOverlap: hasOverlap,
      overlapRatio: overlapRatio,
      pointCount1: closePoints1.length,
      pointCount2: closePoints2.length,
      totalPoints1: points1.length,
      totalPoints2: points2.length,
      transformation: transformation
    };
  }

  /**
   * Registers a patch to the world origin (fallback when no other patches exist)
   * @param {SurfacePatch} patch - Patch to register
   * @returns {Object} - Registration result
   */
  registerToWorldOrigin(patch) {
    // For the first patch, we might want to position it at the origin
    // or keep its current position. Let's keep current position but
    // mark it as registered.
    
    return {
      success: true,
      transformation: PhotoFirstUtils.createIdentityMatrix(),
      method: 'origin',
      fidelity: 1.0, // High fidelity since we're not changing anything
      error: 0
    };
  }

  /**
   * Applies a registration transformation to a patch
   * @param {SurfacePatch} patch - Patch to transform
   * @param {number[]} transformation - 4x4 transformation matrix
   * @param {string} method - Registration method used
   */
  applyRegistration(patch, transformation, method) {
    // Apply transformation to all vertices
    for (let i = 0; i < patch.vertices.length; i++) {
      const vertex = patch.vertices[i];
      const position = [vertex[0], vertex[1], vertex[2]];
      const transformedPos = PhotoFirstUtils.transformPoint(position, transformation);
      
      // Update position but keep UV coordinates
      patch.vertices[i] = [
        transformedPos[0],
        transformedPos[1],
        transformedPos[2],
        vertex[3], // u
        vertex[4]  // v
      ];
    }
    
    // Update the patch's world transform
    // New world transform = registration transform * old world transform
    const oldTransform = patch.worldTransform;
    const newTransform = PhotoFirstUtils.multiplyMatrices(
      transformation,
      oldTransform
    );
    patch.worldTransform = newTransform;
    
    // Update registration metadata
    patch.registration.method = method;
    patch.registration.transform = [...transformation];
    patch.registration.fidelity = 0.8; // Would be calculated in actual registration
  }

  /**
   * Finds closest points between two point clouds
   * @param {[number, number, number][]} sourcePoints - Source points
   * @param {[number, number, number][]} targetPoints - Target points
   * @returns {Array<{source: [number, number, number], target: [number, number, number]}>} - Closest point pairs
   */
  findClosestPoints(sourcePoints, targetPoints) {
    const pairs = [];
    const usedTargetIndices = new Set();
    
    for (const sourcePoint of sourcePoints) {
      let minDistance = Infinity;
      let closestTargetIndex = -1;
      
      for (let i = 0; i < targetPoints.length; i++) {
        if (usedTargetIndices.has(i)) continue;
        
        const distance = PhotoFirstUtils.distance(sourcePoint, targetPoints[i]);
        if (distance < minDistance) {
          minDistance = distance;
          closestTargetIndex = i;
        }
      }
      
      if (closestTargetIndex !== -1 && minDistance < this.featureMatchDistanceThreshold) {
        pairs.push({
          source: sourcePoint,
          target: targetPoints[closestTargetIndex]
        });
        usedTargetIndices.add(closestTargetIndex);
      }
    }
    
    return pairs;
  }

  /**
   * Computes rigid transformation (rotation + translation) between corresponding points
   * @param {[number, number, number][]} sourcePoints - Source points
   * @param {[number, number, number][]} targetPoints - Target points
   * @returns {number[]} - 4x4 transformation matrix or null if computation fails
   */
  computeRigidTransform(sourcePoints, targetPoints) {
    if (sourcePoints.length !== targetPoints.length || sourcePoints.length < 3) {
      return null;
    }
    
    // Calculate centroids
    const sourceCentroid = this.calculateCentroid(sourcePoints);
    const targetCentroid = this.calculateCentroid(targetPoints);
    
    // Center the points
    const centeredSource = sourcePoints.map(p => 
      [p[0] - sourceCentroid[0], p[1] - sourceCentroid[1], p[2] - sourceCentroid[2]]
    );
    const centeredTarget = targetPoints.map(p => 
      [p[0] - targetCentroid[0], p[1] - targetCentroid[1], p[2] - targetCentroid[2]]
    );
    
    // Compute covariance matrix
    const covariance = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < centeredSource.length; i++) {
      const xs = centeredSource[i];
      const xt = centeredTarget[i];
      
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          covariance[r][c] += xs[r] * xt[c];
        }
      }
    }
    
    // Compute SVD of covariance matrix (simplified)
    // In a full implementation, we'd use a proper SVD algorithm
    // For now, we'll use a simplified approach that works for many cases
    
    // Calculate rotation matrix using Kabsch algorithm (simplified)
    let rotation = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    
    // Special case: if we have exactly 3 points, we can compute exact solution
    if (centeredSource.length === 3) {
      // Compute vectors
      const v1 = [centeredSource[1][0] - centeredSource[0][0],
                  centeredSource[1][1] - centeredSource[0][1],
                  centeredSource[1][2] - centeredSource[0][2]];
      const v2 = [centeredSource[2][0] - centeredSource[0][0],
                  centeredSource[2][1] - centeredSource[0][1],
                  centeredSource[2][2] - centeredSource[0][2]];
      
      const w1 = [centeredTarget[1][0] - centeredTarget[0][0],
                  centeredTarget[1][1] - centeredTarget[0][1],
                  centeredTarget[1][2] - centeredTarget[0][2]];
      const w2 = [centeredTarget[2][0] - centeredTarget[0][0],
                  centeredTarget[2][1] - centeredTarget[0][1],
                  centeredTarget[2][2] - centeredTarget[0][2]];
      
      // Compute cross products
      const v1xv2 = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
      ];
      
      const w1xw2 = [
        w1[1] * w2[2] - w1[2] * w2[1],
        w1[2] * w2[0] - w1[0] * w2[2],
        w1[0] * w2[1] - w1[1] * w2[0]
      ];
      
      // If cross products are not zero, we can compute rotation
      const vLen = Math.hypot(...v1xv2);
      const wLen = Math.hypot(...w1xw2);
      
      if (vLen > EPS && wLen > EPS) {
        // Normalize cross products
        const vNorm = [v1xv2[0]/vLen, v1xv2[1]/vLen, v1xv2[2]/vLen];
        const wNorm = [w1xw2[0]/wLen, w1xw2[1]/wLen, w1xw2[2]/wLen];
        
        // Calculate rotation axis and angle
        const dot = vNorm[0]*wNorm[0] + vNorm[1]*wNorm[1] + vNorm[2]*wNorm[2];
        const cross = [
          vNorm[1]*wNorm[2] - vNorm[2]*wNorm[1],
          vNorm[2]*wNorm[0] - vNorm[0]*wNorm[2],
          vNorm[0]*wNorm[1] - vNorm[1]*wNorm[0]
        ];
        
        const angle = Math.acos(clamp(dot, -1, 1));
        const axisLength = Math.hypot(...cross);
        
        if (axisLength > EPS) {
          const axis = [cross[0]/axisLength, cross[1]/axisLength, cross[2]/axisLength];
          rotation = this.axisAngleToRotationMatrix(axis, angle);
        }
      }
    }
    
    // Build homogeneous transformation matrix
    const R = rotation;
    const T = [
      targetCentroid[0] - (R[0][0] * sourceCentroid[0] + R[0][1] * sourceCentroid[1] + R[0][2] * sourceCentroid[2]),
      targetCentroid[1] - (R[1][0] * sourceCentroid[0] + R[1][1] * sourceCentroid[1] + R[1][2] * sourceCentroid[2]),
      targetCentroid[2] - (R[2][0] * sourceCentroid[0] + R[2][1] * sourceCentroid[1] + R[2][2] * sourceCentroid[2])
    ];
    
    return [
      R[0][0], R[1][0], R[2][0], T[0],
      R[0][1], R[1][1], R[2][1], T[1],
      R[0][2], R[1][2], R[2][2], T[2],
      0, 0, 0, 1
    ];
  }

  /**
   * Calculates the centroid of a point cloud
   * @param {[number, number, number][]} points - Points to calculate centroid for
   * @returns {[number, number, number]} - Centroid point
   */
  calculateCentroid(points) {
    if (points.length === 0) return [0, 0, 0];
    
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const point of points) {
      sumX += point[0];
      sumY += point[1];
      sumZ += point[2];
    }
    
    return [sumX / points.length, sumY / points.length, sumZ / points.length];
  }

  /**
   * Extracts features from a patch for feature-based matching
   * @param {SurfacePatch} patch - Patch to extract features from
   * @returns {Array<{position: [number, number, number], normal: [number, number, number], scale: number}>} - Features
   */
  extractPatchFeatures(patch) {
    const features = [];
    
    // Sample vertices for feature extraction
    // In a full implementation, we'd use more sophisticated feature detectors
    // like SIFT, SURF, or ORB adapted to 3D mesh vertices
    
    const step = Math.max(1, Math.floor(patch.vertices.length / 20)); // Sample up to 20 points
    
    for (let i = 0; i < patch.vertices.length; i += step) {
      const vertex = patch.vertices[i];
      const position = [vertex[0], vertex[1], vertex[2]];
      
      // Estimate normal from neighboring vertices (simplified)
      const normal = this.estimateVertexNormal(patch, i);
      
      // Estimate local scale (simplified as average distance to neighbors)
      const scale = this.estimateLocalScale(patch, i);
      
      features.push({
        position: position,
        normal: normal,
        scale: scale
      });
    }
    
    return features;
  }

  /**
   * Estimates normal at a vertex by averaging neighboring face normals
   * @param {SurfacePatch} patch - Patch containing the vertex
   * @param {number} vertexIndex - Index of vertex
   * @returns {[number, number, number]} - Estimated normal vector
   */
  estimateVertexNormal(patch, vertexIndex) {
    if (patch.indices.length === 0) {
      return [0, 0, 1]; // Default upward normal
    }
    
    // Find all triangles that use this vertex
    const vertexNormal = [0, 0, 0];
    let triangleCount = 0;
    
    for (let i = 0; i < patch.indices.length; i += 3) {
      if (i + 2 >= patch.indices.length) break;
      
      const i1 = patch.indices[i];
      const i2 = patch.indices[i + 1];
      const i3 = patch.indices[i + 2];
      
      if (i1 === vertexIndex || i2 === vertexIndex || i3 === vertexIndex) {
        // Get the triangle vertices
        const v1 = patch.vertices[i1];
        const v2 = patch.vertices[i2];
        const v3 = patch.vertices[i3];
        
        // Calculate triangle normal
        const p1 = [v1[0], v1[1], v1[2]];
        const p2 = [v2[0], v2[1], v2[2]];
        const p3 = [v3[0], v3[1], v3[2]];
        
        const u = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
        const v = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
        
        const normal = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0]
        ];
        
        // Normalize and add to sum
        const len = Math.hypot(...normal);
        if (len > EPS) {
          vertexNormal[0] += normal[0] / len;
          vertexNormal[1] += normal[1] / len;
          vertexNormal[2] += normal[2] / len;
          triangleCount++;
        }
      }
    }
    
    // Average the normal
    if (triangleCount > 0) {
      vertexNormal[0] /= triangleCount;
      vertexNormal[1] /= triangleCount;
      vertexNormal[2] /= triangleCount;
      
      // Normalize again
      const len = Math.hypot(...vertexNormal);
      if (len > EPS) {
        return [vertexNormal[0]/len, vertexNormal[1]/len, vertexNormal[2]/len];
      }
    }
    
    return [0, 0, 1]; // Default if no neighbors found
  }

  /**
   * Estimates local scale at a vertex
   * @param {SurfacePatch} patch - Patch containing the vertex
   * @param {number} vertexIndex - Index of vertex
   * @returns {number} - Estimated local scale
   */
  estimateLocalScale(patch, vertexIndex) {
    if (patch.vertices.length < 2) {
      return 1.0;
    }
    
    const vertexPos = [
      patch.vertices[vertexIndex][0],
      patch.vertices[vertexIndex][1],
      patch.vertices[vertexIndex][2]
    ];
    
    let sumDist = 0;
    let count = 0;
    
    // Find distances to neighboring vertices (those sharing a triangle)
    const neighborIndices = new Set();
    
    for (let i = 0; i < patch.indices.length; i += 3) {
      if (i + 2 >= patch.indices.length) break;
      
      const i1 = patch.indices[i];
      const i2 = patch.indices[i + 1];
      const i3 = patch.indices[i + 2];
      
      if (i1 === vertexIndex || i2 === vertexIndex || i3 === vertexIndex) {
        if (i1 !== vertexIndex) neighborIndices.add(i1);
        if (i2 !== vertexIndex) neighborIndices.add(i2);
        if (i3 !== vertexIndex) neighborIndices.add(i3);
      }
    }
    
    for (const neighborIndex of neighborIndices) {
      if (neighborIndex >= patch.vertices.length) continue;
      
      const neighborPos = [
        patch.vertices[neighborIndex][0],
        patch.vertices[neighborIndex][1],
        patch.vertices[neighborIndex][2]
      ];
      
      const dist = PhotoFirstUtils.distance(vertexPos, neighborPos);
      sumDist += dist;
      count++;
    }
    
    // If no neighbors found, use distance to a few random vertices
    if (count === 0 && patch.vertices.length > 1) {
      for (let i = 0; i < Math.min(5, patch.vertices.length); i++) {
        if (i === vertexIndex) continue;
        const neighborPos = [
          patch.vertices[i][0],
          patch.vertices[i][1],
          patch.vertices[i][2]
        ];
        const dist = PhotoFirstUtils.distance(vertexPos, neighborPos);
        sumDist += dist;
        count++;
      }
    }
    
    return count > 0 ? sumDist / count : 1.0;
  }

  /**
   * Matches features between two sets based on position similarity
   * @param {Array<{position: [number, number, number], normal: [number, number, number], scale: number}>} sourceFeatures - Source features
   * @param {Array<{position: [number, number, number], normal: [number, number, number], scale: number}>} targetFeatures - Target features
   * @returns {Array<{source: [number, number, number], target: [number, number, number], score: number}>} - Matched feature pairs
   */
  matchFeatures(sourceFeatures, targetFeatures) {
    const matches = [];
    const usedTargetIndices = new Set();
    
    for (const sourceFeature of sourceFeatures) {
      let bestScore = -Infinity;
      let bestTargetIndex = -1;
      
      for (let i = 0; i < targetFeatures.length; i++) {
        if (usedTargetIndices.has(i)) continue;
        
        const targetFeature = targetFeatures[i];
        
        // Calculate similarity score
        const posDist = PhotoFirstUtils.distance(
          sourceFeature.position,
          targetFeature.position
        );
        
        // Normal similarity (dot product)
        const normDot = 
          sourceFeature.normal[0] * targetFeature.normal[0] +
          sourceFeature.normal[1] * targetFeature.normal[1] +
          sourceFeature.normal[2] * targetFeature.normal[2];
        
        // Scale similarity
        const scaleRatio = Math.min(
          sourceFeature.scale, targetFeature.scale
        ) / Math.max(
          sourceFeature.scale, targetFeature.scale, EPS
        );
        
        // Combined score (lower is better for distance, higher is better for norm and scale)
        const score = 
          -(posDist * 0.5) +           // Position term (negative because we want to minimize)
          (normDot * 0.3) +            // Normal term
          (scaleRatio * 0.2);          // Scale term
        
        if (score > bestScore) {
          bestScore = score;
          bestTargetIndex = i;
        }
      }
      
      if (bestTargetIndex !== -1 && bestScore > 0.1) { // Minimum similarity threshold
        matches.push({
          source: sourceFeatures[sourceFeatures.indexOf(sourceFeature)].position,
          target: targetFeatures[bestTargetIndex].position,
          score: bestScore
        });
        usedTargetIndices.add(bestTargetIndex);
      }
    }
    
    return matches;
  }

  /**
   * Estimates transformation from matched feature pairs
   * @param {[number, number, number][]} sourcePoints - Source points from matches
   * @param {[number, number, number][]} targetPoints - Target points from matches
   * @returns {number[]} - 4x4 transformation matrix or null
   */
  estimateTransformFromMatches(sourcePoints, targetPoints) {
    if (sourcePoints.length !== targetPoints.length || sourcePoints.length < 3) {
      return null;
    }
    
    return this.computeRigidTransform(sourcePoints, targetPoints);
  }

  /**
   * Calculates consistency of matches based on transformation errors
   * @param {Array<{source: [number, number, number], target: [number, number, number]}>} matches - Matched pairs
   * @returns {number} - Consistency score [0,1]
   */
  calculateMatchConsistency(matches) {
    if (matches.length < 2) {
      return matches.length === 1 ? 0.5 : 0; // Single match gets medium consistency
    }
    
    // For simplicity, we'll just return a fixed value based on count
    // In a full implementation, we'd compute the actual transformation
    // for each subset and measure how consistent they are
    
    return Math.min(matches.length / 10, 1.0); // More matches = higher consistency
  }

  /**
   * Calculates mean squared error between corresponding points after transformation
   * @param {[number, number, number][]} sourcePoints - Source points
   * @param {[number, number, number][]} targetPoints - Target points
   * @param {number[]} transformation - 4x4 transformation matrix
   * @returns {number} - Mean squared error
   */
  calculateMSE(sourcePoints, targetPoints, transformation) {
    if (sourcePoints.length !== targetPoints.length || sourcePoints.length === 0) {
      return Infinity;
    }
    
    let sumSquaredError = 0;
    
    for (let i = 0; i < sourcePoints.length; i++) {
      const transformed = PhotoFirstUtils.transformPoint(sourcePoints[i], transformation);
      const target = targetPoints[i];
      
      const error = 
        Math.pow(transformed[0] - target[0], 2) +
        Math.pow(transformed[1] - target[1], 2) +
        Math.pow(transformed[2] - target[2], 2);
      
      sumSquaredError += error;
    }
    
    return sumSquaredError / sourcePoints.length;
  }

  /**
   * Converts axis-angle representation to rotation matrix
   * @param {[number, number, number]} axis - Rotation axis (normalized)
   * @param {number} angle - Rotation angle in radians
   * @returns {[number, number, number][]} - 3x3 rotation matrix
   */
  axisAngleToRotationMatrix(axis, angle) {
    const [x, y, z] = axis;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    
    return [
      [t*x*x + c, t*x*y - z*s, t*x*z + y*s],
      [t*x*y + z*s, t*y*y + c, t*y*z - x*s],
      [t*x*z - y*s, t*y*z + x*s, t*z*z + c]
    ];
  }

  /**
   * Gets registration statistics
   * @returns {Object} - Statistics about registration operations
   */
  getRegistrationStats() {
    return {...this.registrationStats};
  }

  /**
   * Resets registration statistics
   */
  resetRegistrationStats() {
    this.registrationStats = {
      icpIterations: 0,
      featureMatches: 0,
      overlapsDetected: 0,
      registrationSuccess: 0,
      registrationFailure: 0
    };
  }
};

/**
 * Utility functions for patch registration
 */
export const RegistrationUtils = {
  /**
   * Creates an identity 4x4 matrix
   * @returns {number[]} - 4x4 identity matrix (column-major)
   */
  createIdentityMatrix() {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
  },

  /**
   * Checks if two patches have significant overlap based on bounding boxes
   * @param {SurfacePatch} patch1 - First patch
   * @param {SurfacePatch} patch2 - Second patch
   * @returns {boolean} - True if patches overlap significantly
   */
  checkBoundingBoxOverlap(patch1, patch2) {
    const bounds1 = patch1.getBounds();
    const bounds2 = patch2.getBounds();
    
    // Check for overlap in each dimension
    const overlapX = 
      Math.max(0, 
        Math.min(bounds1.max[0], bounds2.max[0]) - 
        Math.max(bounds1.min[0], bounds2.min[0])
      );
    
    const overlapY = 
      Math.max(0, 
        Math.min(bounds1.max[1], bounds2.max[1]) - 
        Math.max(bounds1.min[1], bounds2.min[1])
      );
    
    const overlapZ = 
      Math.max(0, 
        Math.min(bounds1.max[2], bounds2.max[2]) - 
        Math.max(bounds1.min[2], bounds2.min[2])
      );
    
    // Calculate overlap volume
    const overlapVolume = overlapX * overlapY * overlapZ;
    
    // Calculate individual volumes
    const size1 = [
      bounds1.max[0] - bounds1.min[0],
      bounds1.max[1] - bounds1.min[1],
      bounds1.max[2] - bounds1.min[2]
    ];
    const size2 = [
      bounds2.max[0] - bounds2.min[0],
      bounds2.max[1] - bounds2.min[1],
      bounds2.max[2] - bounds2.min[2]
    ];
    
    const volume1 = size1[0] * size1[1] * size1[2];
    const volume2 = size2[0] * size2[1] * size2[2];
    
    // Avoid division by zero
    if (volume1 === 0 || volume2 === 0) {
      return false;
    }
    
    // Check if overlap ratio is significant for either patch
    const overlapRatio1 = overlapVolume / volume1;
    const overlapRatio2 = overlapVolume / volume2;
    
    return Math.max(overlapRatio1, overlapRatio2) > 0.1; // At least 10% overlap
  },

  /**
   * Merges overlapping patches by averaging vertices in overlap region
   * @param {SurfacePatch} patch1 - First patch
   * @param {SurfacePatch} patch2 - Second patch
   * @param {number} overlapThreshold - Distance threshold for considering vertices overlapping
   * @returns {SurfacePatch} - Merged patch (or null if no significant overlap)
   */
  mergeOverlappingPatches(patch1, patch2, overlapThreshold = 0.1) {
    if (!RegistrationUtils.checkBoundingBoxOverlap(patch1, patch2)) {
      return null;
    }
    
    // Build spatial index for patch1 vertices
    const vertMap1 = new Map();
    for (let i = 0; i < patch1.vertices.length; i += 3) {
      const x = patch1.vertices[i];
      const y = patch1.vertices[i + 1];
      const z = patch1.vertices[i + 2];
      const key = `${Math.round(x / overlapThreshold)},${Math.round(y / overlapThreshold)},${Math.round(z / overlapThreshold)}`;
      if (!vertMap1.has(key)) vertMap1.set(key, []);
      vertMap1.get(key).push(i / 3);
    }
    
    // Find overlapping vertices
    const overlapping = [];
    const used1 = new Set();
    const used2 = new Set();
    
    for (let i = 0; i < patch2.vertices.length; i += 3) {
      const x = patch2.vertices[i];
      const y = patch2.vertices[i + 1];
      const z = patch2.vertices[i + 2];
      const key = `${Math.round(x / overlapThreshold)},${Math.round(y / overlapThreshold)},${Math.round(z / overlapThreshold)}`;
      
      if (vertMap1.has(key)) {
        const idx1 = vertMap1.get(key)[0];
        overlapping.push({ idx1, idx2: i / 3, x, y, z });
        used1.add(idx1);
        used2.add(i / 3);
      }
    }
    
    if (overlapping.length < 3) {
      return patch1.clone(); // Not enough overlap to merge meaningfully
    }
    
    // Create merged patch
    const merged = new SurfacePatch(
      `merged_${patch1.id}_${patch2.id}`,
      patch1.camera ? patch1.camera.clone() : null
    );
    
    // Add all vertices from patch1
    const vertexMap = new Map(); // old index -> new index
    for (let i = 0; i < patch1.vertices.length; i += 3) {
      const idx = i / 3;
      if (used1.has(idx)) {
        // Find corresponding vertex in patch2 and average
        const overlap = overlapping.find(o => o.idx1 === idx);
        if (overlap) {
          const x = (patch1.vertices[i] + patch2.vertices[overlap.idx2 * 3]) * 0.5;
          const y = (patch1.vertices[i + 1] + patch2.vertices[overlap.idx2 * 3 + 1]) * 0.5;
          const z = (patch1.vertices[i + 2] + patch2.vertices[overlap.idx2 * 3 + 2]) * 0.5;
          merged.addVertex(x, y, z);
        } else {
          merged.addVertex(patch1.vertices[i], patch1.vertices[i + 1], patch1.vertices[i + 2]);
        }
      } else {
        merged.addVertex(patch1.vertices[i], patch1.vertices[i + 1], patch1.vertices[i + 2]);
      }
      vertexMap.set(idx, merged.vertices.length / 3 - 1);
    }
    
    // Add non-overlapping vertices from patch2
    for (let i = 0; i < patch2.vertices.length; i += 3) {
      const idx = i / 3;
      if (!used2.has(idx)) {
        merged.addVertex(patch2.vertices[i], patch2.vertices[i + 1], patch2.vertices[i + 2]);
        vertexMap.set(patch1.vertices.length / 3 + idx, merged.vertices.length / 3 - 1);
      }
    }
    
    // Merge triangles from patch1
    for (let i = 0; i < patch1.indices.length; i += 3) {
      const a = vertexMap.get(patch1.indices[i]);
      const b = vertexMap.get(patch1.indices[i + 1]);
      const c = vertexMap.get(patch1.indices[i + 2]);
      if (a !== undefined && b !== undefined && c !== undefined) {
        merged.addTriangle(a, b, c);
      }
    }
    
    // Merge triangles from patch2
    for (let i = 0; i < patch2.indices.length; i += 3) {
      const idxA = patch1.vertices.length / 3 + patch2.indices[i];
      const idxB = patch1.vertices.length / 3 + patch2.indices[i + 1];
      const idxC = patch1.vertices.length / 3 + patch2.indices[i + 2];
      const a = vertexMap.get(idxA);
      const b = vertexMap.get(idxB);
      const c = vertexMap.get(idxC);
      if (a !== undefined && b !== undefined && c !== undefined) {
        merged.addTriangle(a, b, c);
      }
    }
    
    // Merge UVs and colors if present
    if (patch1.uvs && patch2.uvs) {
      merged.uvs = [...patch1.uvs, ...patch2.uvs];
    }
    if (patch1.colors && patch2.colors) {
      merged.colors = [...patch1.colors, ...patch2.colors];
    }
    
    // Update bounding box
    merged.computeBoundingBox();
    
    return merged;
  }
};