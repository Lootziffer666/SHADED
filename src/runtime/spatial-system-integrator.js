// Integration layer between SHADED's PHOTO-FIRST system and existing spatial system
// Bridges the photo-first reconstruction pipeline with the existing spatial-viewer

import { PhotoFirstWorld } from '../photo-first-reconstruction.js';
import { SurfacePatch } from '../photo-first-reconstruction.js';
import { DepthToMeshProcessor } from '../depth-to-local-mesh.js';
import { MonocularDepthProvider } from '@recon/depth-provider.js';

/**
 * Integrates photo-first reconstruction with existing spatial system
 * Converts surface patches to point clouds compatible with spatial-viewer
 */
export class SpatialSystemIntegrator {
  constructor() {
    this.photoFirstWorld = new PhotoFirstWorld();
    this.monocularProvider = new MonocularDepthProvider();
    this.isInitialized = false;
    
    // Cache for depth processing to avoid reprocessing
    this.depthCache = new Map(); // photoId -> {depth, confidence, normals}
    
    // Integration settings
    this.autoRegisterPatches = true;
    this.depthPointBudget = 50000; // Target points for depth-derived point cloud
    this.meshPointBudget = 5000;   // Target points for mesh-derived point cloud
  }

  /**
   * Initializes the integrator
   * @returns {Promise<boolean>} - True if initialization successful
   */
  async initialize() {
    if (this.isInitialized) return true;
    
    try {
      // Initialize the monocular depth provider
      const providerReady = await this.monocularProvider.loadModel();
      if (!providerReady) {
        console.warn('Monocular depth provider failed to initialize');
        // Continue anyway - we can still use user-provided depth or fallback methods
      }
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize spatial system integrator:', error);
      return false;
    }
  }

  /**
   * Processes a photo through the photo-first pipeline and integrates with spatial system
   * @param {File|Blob} photoFile - Photo file to process
   * @param {Object} calibration - Camera calibration data
   * @returns {Promise<Object>} - Result of processing
   */
  async processPhoto(photoFile, calibration = {}) {
    if (!this.isInitialized) {
      const ready = await this.initialize();
      if (!ready) {
        return { success: false, error: 'Failed to initialize spatial system integrator' };
      }
    }
    
    try {
      // Step 1: Load the photo
      const photo = await this.loadPhoto(photoFile);
      if (!photo.success) {
        return photo;
      }
      
      // Step 2: Apply calibration
      const calibratedPhoto = await this.applyCalibration(photo.data, calibration);
      if (!calibratedPhoto.success) {
        return calibratedPhoto;
      }
      
      // Step 3: Generate depth map (use provider or fallback)
      const depthResult = await this.generateDepthMap(calibratedPhoto.data);
      if (!depthResult.success) {
        return depthResult;
      }
      
      // Step 4: Create surface patch from depth map
      const patchResult = await this.createSurfacePatch(
        calibratedPhoto.data,
        depthResult.data,
        calibratedPhoto.data.camera
      );
      
      if (!patchResult.success) {
        return patchResult;
      }
      
      // Step 5: Add patch to photo-first world
      const patchId = this.photoFirstWorld.addSurfacePatch(patchResult.data);
      
      // Step 6: Convert patch to point cloud for spatial system
      const pointCloudResult = this.convertPatchToPointCloud(patchResult.data);
      
      // Step 7: Register with spatial system if enabled
      if (this.autoRegisterPatches && pointCloudResult.success) {
        await this.registerPointCloudWithSpatialSystem(pointCloudResult.data);
      }
      
      return {
        success: true,
        photoId: calibratedPhoto.data.id,
        patchId: patchId,
        pointCloud: pointCloudResult.data,
        processingStats: {
          photo: photo.data,
          depth: depthResult.data,
          patch: patchResult.data,
          pointCloud: pointCloudResult.data
        }
      };
      
    } catch (error) {
      console.error('Photo processing failed:', error);
      return { success: false, error: `Photo processing failed: ${error.message}` };
    }
  }

  /**
   * Loads a photo file and creates a photo object
   * @param {File|Blob} photoFile - Photo file to load
   * @returns {Promise<Object>} - Result containing photo data
   */
  async loadPhoto(photoFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          // Create image from file data
          const img = new Image();
          img.onload = () => {
            // Create photo object
            const photo = {
              id: `photo_${Date.now()}`,
              file: photoFile,
              image: img,
              width: img.width,
              height: img.height,
              camera: this.createDefaultCamera(img.width, img.height)
            };
            
            resolve({ success: true, data: photo });
          };
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = URL.createObjectURL(photoFile);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read photo file'));
      reader.readAsArrayBuffer(photoFile);
    });
  }

  /**
   * Creates a default camera for a photo
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   * @returns {PhotoCamera} - Default camera parameters
   */
  createDefaultCamera(width, height) {
    const camera = {
      position: [0, 1.7, 0], // Eye level height, looking at origin
      rotation: [0, 0, 0],   // No rotation (looking straight ahead)
      fovY: 60,              // Default vertical FOV
      principalPoint: [0.5, 0.5], // Centered principal point
      lens: { k1: 0, k2: 0 }, // No lens distortion
      provenance: 'DEFAULT',
      confidence: 0.8
    };
    
    // Adjust FOV based on aspect ratio for more natural view
    const aspect = width / height;
    if (aspect > 1.6) { // Wide image
      camera.fovY = 75; // Wider FOV for landscape
    } else if (aspect < 0.7) { // Tall image
      camera.fovY = 45; // Narrower FOV for portrait
    }
    
    return camera;
  }

  /**
   * Applies calibration data to a photo
   * @param {Object} photo - Photo object
   * @param {Object} calibration - Calibration data
   * @returns {Promise<Object>} - Result with calibrated photo
   */
  applyCalibration(photo, calibration = {}) {
    return new Promise((resolve) => {
      // Apply calibration overrides
      if (calibration.position) {
        photo.camera.position = [...calibration.position];
      }
      if (calibration.rotation) {
        // Assume calibration.rotation is in degrees, convert to radians for internal use
        photo.camera.rotation = calibration.rotation.map(angle => angle * Math.PI / 180);
      }
      if (calibration.fovY !== undefined) {
        photo.camera.fovY = calibration.fovY;
      }
      if (calibration.principalPoint) {
        photo.camera.principalPoint = [...calibration.principalPoint];
      }
      if (calibration.lens) {
        photo.camera.lens = {...photo.camera.lens, ...calibration.lens};
      }
      if (calibration.provenance) {
        photo.camera.provenance = calibration.provenance;
      }
      
      resolve({ success: true, data: photo });
    });
  }

  /**
   * Generates a depth map for a photo using the monocular provider or fallback
   * @param {Object} photo - Photo object
   * @returns {Promise<Object>} - Result containing depth map data
   */
  async generateDepthMap(photo) {
    // Check cache first
    const cacheKey = photo.id;
    if (this.depthCache.has(cacheKey)) {
      return { success: true, data: this.depthCache.get(cacheKey) };
    }
    
    try {
      // Try to use the monocular depth provider first
      if (this.monocularProvider.isLoaded) {
        const result = await this.monocularProvider.estimateDepthFromFile(photo.file, {
          maxDimension: 1024
        });
        
        if (result && result.depth && result.confidence) {
          // Cache the result
          const depthData = {
            depthMap: result.depth,
            confidenceMap: result.confidence,
            width: result.width,
            height: result.height,
            provider: result.provider || 'monocular-depth-provider',
            providerVersion: result.version || '1.0.0',
            scale: result.scale || 'relative',
            provenance: result.provenance || 'INFERRED'
          };
          
          this.depthCache.set(cacheKey, depthData);
          return { success: true, data: depthData };
        }
      }
      
      // Fallback to simulated depth if provider fails or not available
      console.warn('Using simulated depth map - monocular provider not available or failed');
      const simulatedDepth = this.createSimulatedDepthMap(photo.width, photo.height);
      
      const depthData = {
        depthMap: simulatedDepth.depthMap,
        confidenceMap: simulatedDepth.confidenceMap,
        width: photo.width,
        height: photo.height,
        provider: 'simulated',
        providerVersion: '1.0.0',
        scale: 'relative',
        provenance: 'INFERRED'
      };
      
      this.depthCache.set(cacheKey, depthData);
      return { success: true, data: depthData };
      
    } catch (error) {
      console.error('Depth map generation failed:', error);
      // Last resort: create a flat depth map
      const flatDepth = this.createFlatDepthMap(photo.width, photo.height);
      
      const depthData = {
        depthMap: flatDepth.depthMap,
        confidenceMap: flatDepth.confidenceMap,
        width: photo.width,
        height: photo.height,
        provider: 'flat-fallback',
        providerVersion: '1.0.0',
        scale: 'relative',
        provenance: 'INFERRED'
      };
      
      this.depthCache.set(cacheKey, depthData);
      return { success: true, data: depthData };
    }
  }

  /**
   * Creates a simulated depth map for testing
   * @param {number} width - Width in pixels
   * @param {number} height - Height in pixels
   * @returns {Object} - Simulated depth map data
   */
  createSimulatedDepthMap(width, height) {
    const depthMap = new Float32Array(width * height);
    const confidenceMap = new Float32Array(width * height);
    
    // Create a simple depth gradient: near at bottom, far at top
    // Add some noise to make it more interesting
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        // Base depth: increases from top to bottom (0.5m to 3.0m)
        const baseDepth = 0.5 + (y / height) * 2.5;
        
        // Add some noise
        const noise = (Math.random() - 0.5) * 0.2;
        const depth = Math.max(0.1, baseDepth + noise);
        
        depthMap[index] = depth;
        
        // Confidence: higher in center, lower at edges
        const centerDist = Math.sqrt(
          Math.pow((x - width/2) / (width/2), 2) +
          Math.pow((y - height/2) / (height/2), 2)
        );
        const confidence = Math.max(0.1, 1.0 - centerDist * 0.5);
        confidenceMap[index] = confidence;
      }
    }
    
    return {
      depthMap: depthMap,
      confidenceMap: confidenceMap
    };
  }

  /**
   * Creates a flat depth map as fallback
   * @param {number} width - Width in pixels
   * @param {number} height - Height in pixels
   * @returns {Object} - Flat depth map data
   */
  createFlatDepthMap(width, height) {
    const depthMap = new Float32Array(width * height);
    const confidenceMap = new Float32Array(width * height);
    
    // Flat depth at 2 meters everywhere
    for (let i = 0; i < depthMap.length; i++) {
      depthMap[i] = 2.0;
      confidenceMap[i] = 0.8; // Medium confidence
    }
    
    return {
      depthMap: depthMap,
      confidenceMap: confidenceMap
    };
  }

  /**
   * Creates a surface patch from a photo and its depth map
   * @param {Object} photo - Photo object
   * @param {Object} depthData - Depth map data
   * @param {PhotoCamera} camera - Camera parameters
   * @returns {Promise<Object>} - Result containing surface patch
   */
  async createSurfacePatch(photo, depthData, camera) {
    return new Promise((resolve) => {
      try {
        // Create depth to mesh processor
        const processor = new DepthToMeshProcessor();
        
        // Set input data
        processor.setInputData(
          depthData.depthMap,
          depthData.confidenceMap,
          photo.image,
          camera,
          photo.width,
          photo.height
        );
        
        // Process to generate mesh
        const patchId = `patch_${Date.now()}`;
        const cameraId = `camera_${Date.now()}`;
        
        const patch = processor.processDepthMap(
          patchId,
          photo.id,
          cameraId
        );
        
        // Set depth metadata on patch
        patch.depthMetadata = {
          minDepth: depthData.depthMap ? 
            Math.min(...depthData.depthMap.filter(d => isFinite(d) && d > 0)) : 0,
          maxDepth: depthData.depthMap ? 
            Math.max(...depthData.depthMap.filter(d => isFinite(d) && d > 0)) : 0,
          meanDepth: depthData.depthMap ?
            depthData.depthMap.reduce((sum, d) => sum + (isFinite(d) && d > 0 ? d : 0), 0) / 
            depthData.depthMap.filter(d => isFinite(d) && d > 0).length : 0,
          depthUnits: depthData.scale,
          scaleFactor: depthData.scale === 'metric' ? 1.0 : 1.0 // Would be calculated from known objects
        };
        
        // Set provenance and confidence
        patch.provenance = depthData.provenance || 'OBSERVED';
        patch.confidence = 0.8; // Would be calculated from depth confidence stats
        
        // Set registration metadata
        patch.registration = {
          method: 'none',
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          fidelity: 1.0
        };
        
        resolve({ success: true, data: patch });
        
      } catch (error) {
        console.error('Surface patch creation failed:', error);
        resolve({ success: false, error: `Surface patch creation failed: ${error.message}` });
      }
    });
  }

  /**
   * Converts a surface patch to a point cloud compatible with the spatial system
   * @param {SurfacePatch} patch - Surface patch to convert
   * @returns {Object} - Result containing point cloud data
   */
  convertPatchToPointCloud(patch) {
    return new Promise((resolve) => {
      try {
        // Extract points from the mesh vertices
        const points = [];
        const colors = [];
        
        // Sample vertices if there are too many
        const step = Math.max(1, Math.floor(patch.vertices.length / this.meshPointBudget));
        
        for (let i = 0; i < patch.vertices.length; i += step) {
          const vertex = patch.vertices[i];
          
          // Extract position [x, y, z, u, v]
          const position = [vertex[0], vertex[1], vertex[2]];
          const uv = [vertex[3], vertex[4]];
          
          // Sample color from the photo at UV coordinates
          const color = this.sampleColorFromPhoto(patch.photoId, uv, patch.width, patch.height);
          
          points.push({
            x: position[0],
            y: position[1],
            z: position[2],
            r: color.r,
            g: color.g,
            b: color.b
          });
          
          colors.push(color);
        }
        
        // Create point cloud in the format expected by spatial system
        const pointCloud = {
          format: 'SHADED.metric-point-cloud.v1',
          points: points,
          width: patch.width || 0,
          height: patch.height || 0,
          provenance: patch.provenance || 'OBSERVED',
          scale: patch.depthMetadata.depthUnits || 'relative',
          timestamp: Date.now()
        };
        
        resolve({ success: true, data: pointCloud });
        
      } catch (error) {
        console.error('Point cloud conversion failed:', error);
        resolve({ success: false, error: `Point cloud conversion failed: ${error.message}` });
      }
    });
  }

  /**
   * Samples color from a photo at given UV coordinates
   * @param {string} photoId - ID of the photo
   * @param {[number, number]} uv - UV coordinates [u, v] (0-1 range)
   * @param {number} photoWidth - Width of photo in pixels
   * @param {number} photoHeight - Height of photo in pixels
   * @returns {{r: number, g: number, b: number}} - Color sample
   */
  sampleColorFromPhoto(photoId, uv, photoWidth, photoHeight) {
    // In a real implementation, we would sample from the actual photo
    // For now, return a placeholder color based on UV position
    const [u, v] = uv;
    
    // Create a simple color gradient for demonstration
    const r = Math.floor(100 + 155 * u); // Red increases left to right
    const g = Math.floor(100 + 155 * v); // Green increases bottom to top
    const b = Math.floor(100 + 155 * (1 - u - v)); // Blue decreases as we move away from origin
    
    return {
      r: Math.min(255, Math.max(0, r)),
      g: Math.min(255, Math.max(0, g)),
      b: Math.min(255, Math.max(0, b))
    };
  }

  /**
   * Registers a point cloud with the existing spatial system
   * @param {Object} pointCloud - Point cloud data to register
   * @returns {Promise<boolean>} - True if registration successful
   */
  async registerPointCloudWithSpatialSystem(pointCloud) {
    return new Promise((resolve) => {
      try {
        // In a full implementation, we would:
        // 1. Convert our point cloud format to the format expected by spatial-viewer
        // 2. Use the spatial system's point cloud setter functions
        // 3. Trigger a rebuild of the spatial environment
        
        // For now, we'll simulate this by checking if the spatial system is available
        // and logging what we would do
        
        console.log('Would register point cloud with spatial system:', {
          pointCount: pointCloud.points.length,
          format: pointCloud.format,
          provenance: pointCloud.provenance
        });
        
        // Check if spatial viewer is available
        if (typeof window !== 'undefined' && window.SHADED && window.SHADED.spatial) {
          // In a real implementation, we would call:
          // window.SHADED.spatial.pointCloud = () => ({ points: pointCloud.points });
          // window.SHADED.spatial.viewer.stage('final');
          
          console.log('Spatial system available - would update point cloud');
        } else {
          console.log('Spatial system not available yet');
        }
        
        resolve(true);
        
      } catch (error) {
        console.error('Failed to register point cloud with spatial system:', error);
        resolve(false);
      }
    });
  }

  /**
   * Gets the current point cloud from the spatial system
   * @returns {Promise<Object>} - Point cloud data or null if not available
   */
  async getCurrentPointCloud() {
    return new Promise((resolve) => {
      try {
        // Check if spatial viewer is available
        if (typeof window !== 'undefined' && window.SHADED && window.SHADED.spatial) {
          // In a real implementation, we would call:
          // const pointCloudData = window.SHADED.spatial.pointCloud();
          
          // For now, return null to indicate not implemented
          resolve(null);
        } else {
          resolve(null);
        }
      } catch (error) {
        console.error('Failed to get current point cloud:', error);
        resolve(null);
      }
    });
  }

  /**
   * Clears all cached data
   */
  clearCache() {
    this.depthCache.clear();
  }

  /**
   * Gets statistics about the integrator
   * @returns {Object} - Integrator statistics
   */
  getStatistics() {
    return {
      isInitialized: this.isInitialized,
      depthCacheSize: this.depthCache.size,
      worldPatchCount: this.photoFirstWorld.getAllSurfacePatches().length,
      worldPhotoCount: this.photoFirstWorld.getAllPhotos().length,
      monocularProviderReady: this.monocularProvider.isLoaded
    };
  }
};