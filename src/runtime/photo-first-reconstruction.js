// Core data structures for SHADED's PHOTO-FIRST / REVERSE VIEWFINDER → WORLD reconstruction
// Implements the photo-first approach where photos are placed in 3D space from their 
// original camera perspective and used to generate textured surface patches

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Represents a calibrated camera from a photo
 * Based on the schema described in the task requirements
 */
export class PhotoCamera {
  constructor() {
    this.position = [0, 0, 0]; // X, Y, Z in world space
    this.rotation = [0, 0, 0]; // Yaw, Pitch, Roll in radians
    this.fovY = 60; // Vertical field of view in degrees
    this.principalPoint = [0.5, 0.5]; // Normalized principal point [x, y] (0-1)
    this.lens = {
      k1: 0, // Radial distortion coefficient
      k2: 0  // Second order radial distortion (optional)
    };
    this.provenance = 'USER_CALIBRATED'; // USER_CALIBRATED, PROVIDER, EXIF
    this.confidence = 1.0; // Confidence in this calibration (0-1)
  }

  /**
   * Creates a ray from camera space through pixel coordinates (u, v)
   * @param {number} u - Normalized x coordinate (0-1)
   * @param {number} v - Normalized y coordinate (0-1)
   * @returns {[number, number, number]} - Ray direction vector in world space
   */
  getRayDirection(u, v) {
    // Apply principal point offset
    const uOffset = (u - this.principalPoint[0]) * 2; // Convert to [-1, 1] range
    const vOffset = (v - this.principalPoint[1]) * 2; // Convert to [-1, 1] range

    // Apply lens distortion correction
    const r2 = uOffset * uOffset + vOffset * vOffset;
    const radialDistortion = 1 + this.lens.k1 * r2 + this.lens.k2 * (r2 * r2);
    const uCorrected = uOffset * radialDistortion;
    const vCorrected = vOffset * radialDistortion;

    // Convert to camera space coordinates
    const aspect = 16 / 9; // Default aspect ratio, should come from image
    const fovX = this.fovY * aspect;
    const tanHalfFovY = Math.tan((this.fovY * Math.PI / 180) / 2);
    const tanHalfFovX = Math.tan((fovX * Math.PI / 180) / 2);

    const cameraX = uCorrected * tanHalfFovX;
    const cameraY = vCorrected * tanHalfFovY;
    const cameraZ = 1.0; // Forward direction in camera space

    // Create direction vector in camera space
    const cameraDir = [cameraX, cameraY, cameraZ];

    // Apply camera rotation (Yaw, Pitch, Roll)
    const [yaw, pitch, roll] = this.rotation;
    
    // Roll (around Z axis)
    const cosRoll = Math.cos(roll);
    const sinRoll = Math.sin(roll);
    const rollX = cameraDir[0] * cosRoll - cameraDir[1] * sinRoll;
    const rollY = cameraDir[0] * sinRoll + cameraDir[1] * cosRoll;
    const rollZ = cameraDir[2];
    
    // Pitch (around X axis)
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const pitchX = rollX;
    const pitchY = rollY * cosPitch - rollZ * sinPitch;
    const pitchZ = rollY * sinPitch + rollZ * cosPitch;
    
    // Yaw (around Y axis)
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const worldX = pitchX * cosYaw + pitchZ * sinYaw;
    const worldY = pitchY;
    const worldZ = -pitchX * sinYaw + pitchZ * cosYaw;

    // Normalize the direction vector
    const length = Math.hypot(worldX, worldY, worldZ);
    return [worldX / length, worldY / length, worldZ / length];
  }

  /**
   * Projects a 3D world point to image coordinates
   * @param {[number, number, number]} worldPoint - Point in world space [x, y, z]
   * @returns {[number, number]} - Normalized image coordinates [u, v] (0-1) or null if behind camera
   */
  worldToImage(worldPoint) {
    // Transform world point to camera space
    const [wx, wy, wz] = worldPoint;
    const [cx, cy, cz] = this.position;
    
    // Translate by camera position
    const tx = wx - cx;
    const ty = wy - cy;
    const tz = wz - cz;
    
    // Apply inverse rotation (negative angles)
    const [yaw, pitch, roll] = this.rotation.map(a => -a);
    
    // Yaw (around Y axis)
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const rx = tx * cosYaw - tz * sinYaw;
    const ry = ty;
    const rz = tx * sinYaw + tz * cosYaw;
    
    // Pitch (around X axis)
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const sx = rx;
    const sy = ry * cosPitch - rz * sinPitch;
    const sz = ry * sinPitch + rz * cosPitch;
    
    // Roll (around Z axis)
    const cosRoll = Math.cos(roll);
    const sinRoll = Math.sin(roll);
    const cameraX = sx * cosRoll - sy * sinRoll;
    const cameraY = sx * sinRoll + sy * cosRoll;
    const cameraZ = sz;
    
    // Check if point is behind camera
    if (cameraZ <= EPS) return null;
    
    // Project to image plane
    const aspect = 16 / 9; // Default aspect ratio
    const fovX = this.fovY * aspect;
    const tanHalfFovY = Math.tan((this.fovY * Math.PI / 180) / 2);
    const tanHalfFovX = Math.tan((fovX * Math.PI / 180) / 2);
    
    const normalizedX = cameraX / (cameraZ * tanHalfFovX);
    const normalizedY = cameraY / (cameraZ * tanHalfFovY);
    
    // Convert from [-1, 1] to [0, 1] range
    const u = (normalizedX + 1) / 2;
    const v = (normalizedY + 1) / 2;
    
    // Apply lens distortion
    const uOffset = u - 0.5;
    const vOffset = v - 0.5;
    const r2 = uOffset * uOffset + vOffset * vOffset;
    const radialDistortion = 1 + this.lens.k1 * r2 + this.lens.k2 * (r2 * r2);
    const uCorrected = 0.5 + uOffset * radialDistortion;
    const vCorrected = 0.5 + vOffset * radialDistortion;
    
    // Apply principal point
    const finalU = uCorrected * 0.5 + this.principalPoint[0];
    const finalV = vCorrected * 0.5 + this.principalPoint[1];
    
    return [finalU, finalV];
  }

  /**
   * Calculates the 3D position of a point given depth along the camera ray
   * @param {[number, number]} uv - Normalized image coordinates [u, v] (0-1)
   * @param {number} depth - Depth value along camera ray (in world units)
   * @returns {[number, number, number]} - 3D world position [x, y, z]
   */
  unproject(uv, depth) {
    const [u, v] = uv;
    const rayDir = this.getRayDirection(u, v);
    return [
      this.position[0] + rayDir[0] * depth,
      this.position[1] + rayDir[1] * depth,
      this.position[2] + rayDir[2] * depth
    ];
  }

  /**
   * Clone this camera
   * @returns {PhotoCamera} - Deep copy of this camera
   */
  clone() {
    const clone = new PhotoCamera();
    clone.position = [...this.position];
    clone.rotation = [...this.rotation];
    clone.fovY = this.fovY;
    clone.principalPoint = [...this.principalPoint];
    clone.lens = {...this.lens};
    clone.provenance = this.provenance;
    clone.confidence = this.confidence;
    return clone;
  }
}

/**
 * Represents a photo used in the reconstruction process
 */
export class Photo {
  constructor(id, imageData, width, height) {
    this.id = id; // Unique identifier for the photo
    this.imageData = imageData; // Actual image data (can be URL, Blob, etc.)
    this.width = width; // Image width in pixels
    this.height = height; // Image height in pixels
    this.camera = new PhotoCamera(); // Associated camera parameters
    this.depthMap = null; // Associated depth map (float32 array)
    this.confidenceMap = null; // Associated confidence map (float32 array)
    this.normalsMap = null; // Associated normals map (float32 array)
    this.provider = null; // Depth provider used (e.g., 'depth-anything-3.official')
    this.providerVersion = null; // Version of the provider
    this.timestamp = Date.now(); // When this photo was added
  }

  /**
   * Sets the depth data for this photo
   * @param {Float32Array} depth - Depth map data (width x height)
   * @param {Float32Array} confidence - Confidence map data (width x height)
   * @param {Float32Array} normals - Normals map data (width x height x 3)
   * @param {string} provider - Provider identifier
   * @param {string} providerVersion - Provider version
   */
  setDepthData(depth, confidence, normals, provider, providerVersion) {
    this.depthMap = depth;
    this.confidenceMap = confidence;
    this.normalsMap = normals;
    this.provider = provider;
    this.providerVersion = providerVersion;
  }

  /**
   * Gets the UV coordinates for a pixel
   * @param {number} pixelX - Pixel x coordinate
   * @param {number} pixelY - Pixel y coordinate
   * @returns {[number, number]} - Normalized UV coordinates [u, v] (0-1)
   */
  getUVFromPixel(pixelX, pixelY) {
    return [pixelX / this.width, pixelY / this.height];
  }

  /**
   * Gets pixel coordinates from UV
   * @param {[number, number]} uv - Normalized UV coordinates [u, v] (0-1)
   * @returns {[number, number]} - Pixel coordinates [x, y]
   */
  getPixelFromUV(uv) {
    const [u, v] = uv;
    return [Math.round(u * this.width), Math.round(v * this.height)];
  }

  /**
   * Clone this photo
   * @returns {Photo} - Deep copy of this photo (without heavy data)
   */
  clone() {
    const clone = new Photo(
      this.id + '_clone',
      this.imageData,
      this.width,
      this.height
    );
    clone.camera = this.camera.clone();
    // Note: Not cloning heavy data like depthMap, confidenceMap, normalsMap
    // to avoid memory issues. These should be shared or reloaded as needed.
    clone.provider = this.provider;
    clone.providerVersion = this.providerVersion;
    clone.timestamp = this.timestamp;
    return clone;
  }
}

/**
 * Represents a local textured surface mesh patch generated from a photo
 */
export class SurfacePatch {
  constructor(id, photoId, cameraId) {
    this.id = id; // Unique identifier for the patch
    this.photoId = photoId; // Reference to source photo
    this.cameraId = cameraId; // Reference to source camera
    this.vertices = []; // Array of [x, y, z, u, v] vertices
    this.indices = []; // Array of triangle indices
    this.worldTransform = [ // 4x4 transformation matrix (column-major)
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
    this.depthMetadata = {
      minDepth: 0,
      maxDepth: 0,
      meanDepth: 0,
      depthUnits: 'relative', // 'relative' or 'metric'
      scaleFactor: 1 // Scale factor applied to convert relative to metric
    };
    this.confidence = 0.8; // Overall confidence in this patch (0-1)
    this.registration = {
      method: 'none', // 'none', 'manual', 'feature', 'icp', 'hybrid'
      transform: [ // 4x4 transformation matrix applied during registration
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ],
      fidelity: 0 // Registration fidelity score (0-1)
    };
    this.provenance = 'OBSERVED'; // OBSERVED, GENERATED, etc.
    this.visible = true; // Whether this patch is currently visible
  }

  /**
   * Adds a vertex to the patch
   * @param {[number, number, number, number, number]} vertex - [x, y, z, u, v]
   * @returns {number} - Index of the added vertex
   */
  addVertex(vertex) {
    this.vertices.push(vertex);
    return this.vertices.length - 1;
  }

  /**
   * Adds a triangle to the patch
   * @param {[number, number, number]} indices - [i1, i2, i3] vertex indices
   */
  addTriangle(indices) {
    this.indices.push(...indices);
  }

  /**
   * Gets the position of a vertex
   * @param {number} index - Vertex index
   * @returns {[number, number, number]} - [x, y, z] position
   */
  getVertexPosition(index) {
    const vertex = this.vertices[index];
    return [vertex[0], vertex[1], vertex[2]];
  }

  /**
   * Gets the UV coordinates of a vertex
   * @param {number} index - Vertex index
   * @returns {[number, number]} - [u, v] UV coordinates
   */
  getVertexUV(index) {
    const vertex = this.vertices[index];
    return [vertex[3], vertex[4]];
  }

  /**
   * Applies the world transform to a vertex position
   * @param {[number, number, number]} position - Local position [x, y, z]
   * @returns {[number, number, number]} - World position [x, y, z]
   */
  transformPosition(position) {
    const [x, y, z] = position;
    const w = 1;
    const worldX =
      this.worldTransform[0] * x +
      this.worldTransform[4] * y +
      this.worldTransform[8] * z +
      this.worldTransform[12] * w;
    const worldY =
      this.worldTransform[1] * x +
      this.worldTransform[5] * y +
      this.worldTransform[9] * z +
      this.worldTransform[13] * w;
    const worldZ =
      this.worldTransform[2] * x +
      this.worldTransform[6] * y +
      this.worldTransform[10] * z +
      this.worldTransform[14] * w;
    return [worldX, worldY, worldZ];
  }

  /**
   * Sets the world transform from a 4x4 matrix
   * @param {number[]} matrix - 16-element array representing 4x4 matrix (column-major)
   */
  setWorldTransform(matrix) {
    this.worldTransform = [...matrix];
  }

  /**
   * Gets the current world transform
   * @returns {number[]} - Copy of the 4x4 world transform matrix
   */
  getWorldTransform() {
    return [...this.worldTransform];
  }

  /**
   * Calculates the bounding box of the patch in world space
   * @returns {{min: [number, number, number], max: [number, number, number]}} - Bounding box
   */
  getBounds() {
    if (this.vertices.length === 0) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const vertex of this.vertices) {
      const [x, y, z] = this.getVertexPosition(vertex);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  /**
   * Clone this patch
   * @returns {SurfacePatch} - Deep copy of this patch
   */
  clone() {
    const clone = new SurfacePatch(
      this.id + '_clone',
      this.photoId,
      this.cameraId
    );
    clone.vertices = this.vertices.map(v => [...v]);
    clone.indices = [...this.indices];
    clone.worldTransform = [...this.worldTransform];
    clone.depthMetadata = {...this.depthMetadata};
    clone.confidence = this.confidence;
    clone.registration = {...this.registration};
    clone.provenance = this.provenance;
    clone.visible = this.visible;
    return clone;
  }
}

/**
 * Represents the world state containing multiple photos and surface patches
 */
export class PhotoFirstWorld {
  constructor() {
    this.photos = new Map(); // Map of photoId -> Photo
    this.cameras = new Map(); // Map of cameraId -> PhotoCamera
    this.surfacePatches = new Map(); // Map of patchId -> SurfacePatch
    this.completionSurfaces = []; // Array of generated completion points
    this.anchors = []; // Array of world anchors for scale constraint
    this.nextPhotoId = 1;
    this.nextCameraId = 1;
    this.nextPatchId = 1;
    this.bounds = {
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
    };
  }

  /**
   * Adds a photo to the world
   * @param {Photo} photo - Photo to add
   * @returns {string} - ID of the added photo
   */
  addPhoto(photo) {
    const id = `photo_${this.nextPhotoId++}`;
    photo.id = id;
    this.photos.set(id, photo);
    
    // Also store the camera separately for easy access
    const cameraId = `camera_${this.nextCameraId++}`;
    photo.camera.id = cameraId;
    this.cameras.set(cameraId, photo.camera);
    
    this.updateBoundsFromPhoto(photo);
    return id;
  }

  /**
   * Adds a surface patch to the world
   * @param {SurfacePatch} patch - Surface patch to add
   * @returns {string} - ID of the added patch
   */
  addSurfacePatch(patch) {
    const id = `patch_${this.nextPatchId++}`;
    patch.id = id;
    this.surfacePatches.set(id, patch);
    
    // Update world bounds
    const patchBounds = patch.getBounds();
    this.bounds.minX = Math.min(this.bounds.minX, patchBounds.min[0]);
    this.bounds.minY = Math.min(this.bounds.minY, patchBounds.min[1]);
    this.bounds.minZ = Math.min(this.bounds.minZ, patchBounds.min[2]);
    this.bounds.maxX = Math.max(this.bounds.maxX, patchBounds.max[0]);
    this.bounds.maxY = Math.max(this.bounds.maxY, patchBounds.max[1]);
    this.bounds.maxZ = Math.max(this.bounds.maxZ, patchBounds.max[2]);
    
    return id;
  }

  /**
   * Updates world bounds based on a photo's potential view frustum
   * @param {Photo} photo - Photo to update bounds from
   */
  updateBoundsFromPhoto(photo) {
    // For now, we'll update bounds when patches are created
    // In a full implementation, we might estimate the view frustum
  }

  /**
   * Gets a photo by ID
   * @param {string} id - Photo ID
   * @returns {Photo|null} - The photo or null if not found
   */
  getPhoto(id) {
    return this.photos.get(id) || null;
  }

  /**
   * Gets a camera by ID
   * @param {string} id - Camera ID
   * @returns {PhotoCamera|null} - The camera or null if not found
   */
  getCamera(id) {
    return this.cameras.get(id) || null;
  }

  /**
   * Gets a surface patch by ID
   * @param {string} id - Patch ID
   * @returns {SurfacePatch|null} - The patch or null if not found
   */
  getSurfacePatch(id) {
    return this.surfacePatches.get(id) || null;
  }

  /**
   * Removes a photo and its associated data
   * @param {string} id - Photo ID
   * @returns {boolean} - True if removed, false if not found
   */
  removePhoto(id) {
    const photo = this.photos.get(id);
    if (!photo) return false;
    
    // Remove associated camera
    // In a full implementation, we'd track camera-photo relationships
    
    // Remove associated patches
    for (const [patchId, patch] of this.surfacePatches.entries()) {
      if (patch.photoId === id) {
        this.surfacePatches.delete(patchId);
      }
    }
    
    this.photos.delete(id);
    return true;
  }

  /**
   * Removes a surface patch
   * @param {string} id - Patch ID
   * @returns {boolean} - True if removed, false if not found
   */
  removeSurfacePatch(id) {
    return this.surfacePatches.delete(id);
  }

  /**
   * Gets all surface patches
   * @returns {SurfacePatch[]} - Array of all surface patches
   */
  getAllSurfacePatches() {
    return Array.from(this.surfacePatches.values());
  }

  /**
   * Gets all photos
   * @returns {Photo[]} - Array of all photos
   */
  getAllPhotos() {
    return Array.from(this.photos.values());
  }

  /**
   * Clear the world
   */
  clear() {
    this.photos.clear();
    this.cameras.clear();
    this.surfacePatches.clear();
    this.completionSurfaces = [];
    this.anchors = [];
    this.nextPhotoId = 1;
    this.nextCameraId = 1;
    this.nextPatchId = 1;
    this.bounds = {
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
    };
  }

  /**
   * Export the world to a JSON-serializable object
   * @returns {Object} - Serializable world state
   */
  exportWorld() {
    return {
      photos: Array.from(this.photos.entries()).map(([id, photo]) => ({
        id: photo.id,
        width: photo.width,
        height: photo.height,
        camera: {
          position: photo.camera.position,
          rotation: photo.camera.rotation,
          fovY: photo.camera.fovY,
          principalPoint: photo.camera.principalPoint,
          lens: photo.camera.lens,
          provenance: photo.camera.provenance,
          confidence: photo.camera.confidence
        },
        provider: photo.provider,
        providerVersion: photo.providerVersion,
        timestamp: photo.timestamp
      })),
      surfacePatches: Array.from(this.surfacePatches.entries()).map(([id, patch]) => ({
        id: patch.id,
        photoId: patch.photoId,
        cameraId: patch.cameraId,
        vertices: patch.vertices,
        indices: patch.indices,
        worldTransform: patch.worldTransform,
        depthMetadata: patch.depthMetadata,
        confidence: patch.confidence,
        registration: patch.registration,
        provenance: patch.provenance,
        visible: patch.visible
      })),
      completionSurfaces: this.completionSurfaces,
      anchors: this.anchors,
      bounds: this.bounds
    };
  }

  /**
   * Import world from a serialized object
   * @param {Object} data - Serialized world state
   */
  importWorld(data) {
    this.clear();
    
    // Import photos
    for (const photoData of data.photos || []) {
      const photo = new Photo(
        photoData.id,
        null, // imageData would need to be reloaded externally
        photoData.width,
        photoData.height
      );
      photo.camera.position = photoData.camera.position;
      photo.camera.rotation = photoData.camera.rotation;
      photo.camera.fovY = photoData.camera.fovY;
      photo.camera.principalPoint = photoData.camera.principalPoint;
      photo.camera.lens = photoData.camera.lens;
      photo.camera.provenance = photoData.camera.provenance;
      photo.camera.confidence = photoData.camera.confidence;
      photo.provider = photoData.provider;
      photo.providerVersion = photoData.providerVersion;
      photo.timestamp = photoData.timestamp;
      
      this.addPhoto(photo);
    }
    
    // Import surface patches
    for (const patchData of data.surfacePatches || []) {
      const patch = new SurfacePatch(
        patchData.id,
        patchData.photoId,
        patchData.cameraId
      );
      patch.vertices = patchData.vertices;
      patch.indices = patchData.indices;
      patch.worldTransform = patchData.worldTransform;
      patch.depthMetadata = patchData.depthMetadata;
      patch.confidence = patchData.confidence;
      patch.registration = patchData.registration;
      patch.provenance = patchData.provenance;
      patch.visible = patchData.visible;
      
      this.addSurfacePatch(patch);
    }
    
    // Import other data
    this.completionSurfaces = data.completionSurfaces || [];
    this.anchors = data.anchors || [];
    this.bounds = data.bounds || {
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
    };
    
    // Update ID counters
    let maxPhotoId = 0;
    let maxCameraId = 0;
    let maxPatchId = 0;
    
    for (const photo of this.photos.values()) {
      const num = parseInt(photo.id.split('_')[1]);
      if (!isNaN(num) && num > maxPhotoId) maxPhotoId = num;
    }
    
    for (const camera of this.cameras.values()) {
      const num = parseInt(camera.id.split('_')[1]);
      if (!isNaN(num) && num > maxCameraId) maxCameraId = num;
    }
    
    for (const patch of this.surfacePatches.values()) {
      const num = parseInt(patch.id.split('_')[1]);
      if (!isNaN(num) && num > maxPatchId) maxPatchId = num;
    }
    
    this.nextPhotoId = maxPhotoId + 1;
    this.nextCameraId = maxCameraId + 1;
    this.nextPatchId = maxPatchId + 1;
  }
}

/**
 * Utility functions for photo-first reconstruction
 */
export const PhotoFirstUtils = {
  /**
   * Creates a perspective projection matrix
   * @param {number} fovY - Field of view in Y direction (degrees)
   * @param {number} aspect - Aspect ratio (width/height)
   * @param {number} near - Near clipping plane
   * @param {number} far - Far clipping plane
   * @returns {number[]} - 4x4 perspective matrix (column-major)
   */
  createPerspectiveMatrix(fovY, aspect, near, far) {
    const f = 1.0 / Math.tan((fovY * Math.PI / 180) / 2);
    const rangeInv = 1.0 / (near - far);
    
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * rangeInv, -1,
      0, 0, near * far * rangeInv * 2, 0
    ];
  },

  /**
   * Creates a view matrix from camera position and rotation
   * @param {[number, number, number]} position - Camera position [x, y, z]
   * @param {[number, number, number]} rotation - Camera rotation [yaw, pitch, roll] in radians
   * @returns {number[]} - 4x4 view matrix (column-major)
   */
  createViewMatrix(position, rotation) {
    const [yaw, pitch, roll] = rotation;
    
    // Calculate forward, right, up vectors
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cosRoll = Math.cos(roll);
    const sinRoll = Math.sin(roll);
    
    // Forward vector (what the camera is looking at)
    const forwardX = cosYaw * cosPitch;
    const forwardY = sinPitch;
    const forwardZ = sinYaw * cosPitch;
    
    // Right vector (perpendicular to forward and up)
    const rightX = cosYaw * sinPitch * sinRoll - sinYaw * cosRoll;
    const rightY = cosPitch * sinRoll;
    const rightZ = sinYaw * sinPitch * sinRoll + cosYaw * cosRoll;
    
    // Up vector (perpendicular to forward and right)
    const upX = -(cosYaw * sinPitch * cosRoll + sinYaw * sinRoll);
    const upY = cosPitch * cosRoll;
    const upZ = -(sinYaw * sinPitch * cosRoll - cosYaw * sinRoll);
    
    // Create view matrix (inverse of camera transformation)
    return [
      rightX, upX, -forwardX, 0,
      rightY, upY, -forwardY, 0,
      rightZ, upZ, -forwardZ, 0,
      -(rightX * position[0] + rightY * position[1] + rightZ * position[2]),
      -(upX * position[0] + upY * position[1] + upZ * position[2]),
      forwardX * position[0] + forwardY * position[1] + forwardZ * position[2],
      1
    ];
  },

  /**
   * Creates a model matrix from position, rotation, and scale
   * @param {[number, number, number]} position - Position [x, y, z]
   * @param {[number, number, number]} rotation - Rotation [x, y, z] in radians
   * @param {[number, number, number]} scale - Scale [x, y, z]
   * @returns {number[]} - 4x4 model matrix (column-major)
   */
  createModelMatrix(position, rotation, scale) {
    const [rotX, rotY, rotZ] = rotation;
    const [scaleX, scaleY, scaleZ] = scale;
    
    // Calculate rotation matrix
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);
    
    const m00 = cosY * cosZ * scaleX;
    const m01 = (cosY * sinZ * scaleX) - (sinY * sinX * scaleY);
    const m02 = (cosY * sinX * scaleY) + (sinY * cosZ * scaleX);
    const m03 = 0;
    
    const m04 = sinZ * scaleX;
    const m05 = cosZ * scaleX;
    const m06 = 0;
    const m07 = 0;
    
    const m08 = (-sinY * cosZ * scaleZ) + (cosY * sinX * scaleY);
    const m09 = (sinY * sinZ * scaleY) + (cosY * cosX * scaleY);
    const m10 = cosY * cosX * scaleZ;
    const m11 = 0;
    
    const m12 = position[0];
    const m13 = position[1];
    const m14 = position[2];
    const m15 = 1;
    
    return [
      m00, m04, m08, m12,
      m01, m05, m09, m13,
      m02, m06, m10, m14,
      m03, m07, m11, m15
    ];
  },

  /**
   * Multiplies two 4x4 matrices (column-major)
   * @param {number[]} a - First 4x4 matrix
   * @param {number[]} b - Second 4x4 matrix
   * @returns {number[]} - Result of a * b (column-major)
   */
  multiplyMatrices(a, b) {
    const result = new Array(16);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let sum = 0;
        for (let i = 0; i < 4; i++) {
          sum += a[row * 4 + i] * b[i * 4 + col];
        }
        result[row * 4 + col] = sum;
      }
    }
    return result;
  },

  /**
   * Calculates depth discontinuity between two points
   * @param {number} depth1 - Depth value at point 1
   * @param {number} depth2 - Depth value at point 2
   * @param {number} threshold - Discontinuity threshold (relative difference)
   * @returns {boolean} - True if there's a significant depth discontinuity
   */
  hasDepthDiscontinuity(depth1, depth2, threshold = 0.3) {
    if (depth1 <= EPS || depth2 <= EPS) return false;
    const ratio = Math.max(depth1, depth2) / Math.min(depth1, depth2);
    return ratio > (1.0 + threshold);
  },

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
   * Transforms a 3D point by a 4x4 matrix
   * @param {[number, number, number]} pt - Point [x, y, z]
   * @param {number[]} matrix - 4x4 matrix (column-major)
   * @returns {[number, number, number]} - Transformed point
   */
  transformPoint(pt, matrix) {
    const [x, y, z] = pt;
    const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    return [
      (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w,
      (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w,
      (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w
    ];
  },

  /**
   * Calculates Euclidean distance between two 3D points
   * @param {[number, number, number]} a - First point
   * @param {[number, number, number]} b - Second point
   * @returns {number} - Distance
   */
  distance(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  /**
   * Calculates normal deviation between two points
   * @param {[number, number, number]} normal1 - First normal vector
   * @param {[number, number, number]} normal2 - Second normal vector
   * @param {number} threshold - Deviation threshold (dot product threshold)
   * @returns {boolean} - True if there's significant normal deviation
   */
  hasNormalDeviation(normal1, normal2, threshold = 0.5) {
    // Normalize normals
    const len1 = Math.hypot(...normal1);
    const len2 = Math.hypot(...normal2);
    if (len1 < EPS || len2 < EPS) return true;
    
    const nx1 = normal1[0] / len1;
    const ny1 = normal1[1] / len1;
    const nz1 = normal1[2] / len1;
    
    const nx2 = normal2[0] / len2;
    const ny2 = normal2[1] / len2;
    const nz2 = normal2[2] / len2;
    
    const dot = nx1 * nx2 + ny1 * ny2 + nz1 * nz2;
    return Math.abs(dot) < threshold;
  }
};

// No export statement needed - classes are exported individually above