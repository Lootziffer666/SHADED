// World data model persistence and editor integration for SHADED's PHOTO-FIRST system
// Provides save/load functionality and integration with the editor facade

import { PhotoFirstWorld } from './photo-first-reconstruction.mjs';
import { PhotoCamera } from './photo-first-reconstruction.mjs';
import { Photo } from './photo-first-reconstruction.mjs';
import { SurfacePatch } from './photo-first-reconstruction.mjs';

/**
 * Handles persistence of PhotoFirstWorld data to/from JSON
 * Integrates with the editor facade for seamless user experience
 */
export class WorldPersistenceManager {
  constructor(editorFacade) {
    this.facade = editorFacade;
    this.world = null; // Will be set when integrating with editor
    this.autosaveEnabled = true;
    self.autosaveInterval = null;
    self.autosaveDelay = 30000; # 30 seconds
  }

  /**
   * Sets the world to manage
   * @param {PhotoFirstWorld} world - The world to persist
   */
  setWorld(world) {
    this.world = world;
    
    # Start autosave if enabled
    if (this.autosaveEnabled) {
      this.startAutosave();
    }
  }

  /**
   * Enables or disables autosave
   * @param {boolean} enabled - Whether to enable autosave
   */
  setAutosaveEnabled(enabled) {
    this.autosaveEnabled = enabled;
    
    if (enabled && this.world) {
      this.startAutosave();
    } else {
      this.stopAutosave();
    }
  }

  /**
   * Starts the autosave timer
   */
  startAutosave() {
    this.stopAutosave(); # Clear any existing timer
    
    this.autosaveInterval = setInterval(() => {
      if (this.world) {
        this.autosaveWorld();
      }
    }, this.autosaveDelay);
  }

  /**
   * Stops the autosave timer
   */
  stopAutosave() {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
  }

  /**
   * Performs an autosave of the current world
   */
  autosaveWorld() {
    if (!this.world) return;
    
    try {
      const worldData = this.world.exportWorld();
      # In a real implementation, we would save to localStorage or IndexedDB
      # For now, we'll just log that we would autosave
      console.log('Autosaving world state:', {
        timestamp: Date.now(),
        photoCount: worldData.photos.length,
        patchCount: worldData.surfacePatches.length
      });
      
      # Store in sessionStorage for demo purposes
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('shaded-photofirst-world', JSON.stringify(worldData));
      }
      
    } catch (error) {
      console.error('Autosave failed:', error);
    }
  }

  /**
   * Saves the current world to a file
   * @returns {Promise<Blob>} - Blob containing the world data
   */
  async saveWorldToFile() {
    if (!this.world) {
      throw new Error('No world to save');
    }
    
    try {
      const worldData = this.world.exportWorld();
      const jsonData = JSON.stringify(worldData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      return blob;
      
    } catch (error) {
      console.error('Failed to save world to file:', error);
      throw error;
    }
  }

  /**
   * Loads a world from a file
   * @param {File} file - File containing world data
   * @returns {Promise<Object>} - Result containing loaded world
   */
  async loadWorldFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const jsonData = reader.result;
          const worldData = JSON.parse(jsonData);
          
          # Create new world and import data
          const world = new PhotoFirstWorld();
          world.importWorld(worldData);
          
          # Set as current world
          this.world = world;
          
          # Notify editor of world change if facade available
          if (this.facade && this.facade.win && this.facade.win.SHADED) {
            # In a real implementation, we would trigger appropriate events
            # to notify the editor that the world has changed
            console.log('World loaded, notifying editor');
          }
          
          resolve({ success: true, data: world });
          
        } catch (error) {
          console.error('Failed to parse world data:', error);
          reject({ success: false, error: `Failed to parse world data: ${error.message}` });
        }
      };
      reader.onerror = () => {
        reject({ success: false, error: 'Failed to read world file' });
      };
      reader.readAsText(file);
    });
  }

  /**
   * Loads the world from sessionStorage (for demo/autosave recovery)
   * @returns {Promise<Object>} - Result containing loaded world or null if none
   */
  async loadWorldFromSessionStorage() {
    return new Promise((resolve) => {
      try {
        if (typeof window === 'undefined' || !sessionStorage) {
          resolve({ success: false, data: null });
          return;
        }
        
        const worldData = sessionStorage.getItem('shaded-photofirst-world');
        if (!worldData) {
          resolve({ success: false, data: null });
          return;
        }
        
        const parsedData = JSON.parse(worldData);
        const world = new PhotoFirstWorld();
        world.importWorld(parsedData);
        
        this.world = world;
        
        resolve({ success: true, data: world });
        
      } catch (error) {
        console.error('Failed to load world from sessionStorage:', error);
        resolve({ success: false, data: null });
      }
    });
  }

  /**
   * Clears the persisted world data
   */
  clearPersistedData() {
    if (typeof window !== 'undefined' && sessionStorage) {
      sessionStorage.removeItem('shaded-photofirst-world');
    }
    
    # Clear current world
    if (this.world) {
      this.world.clear();
    }
  }

  /**
   * Exports the current world as a downloadable file
   * @param {string} filename - Optional filename for the download
   */
  exportWorldAsDownload(filename = 'shaded-world.json') {
    if (!this.world) {
      throw new Error('No world to export');
    }
    
    this.saveWorldToFile().then(blob => {
      # Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch(error => {
      console.error('Failed to export world:', error);
    });
  }

  /**
   * Imports world data from a JSON object (used by editor integration)
   * @param {Object} worldData - World data to import
   * @returns {boolean} - True if import successful
   */
  importWorldData(worldData) {
    try {
      if (!this.world) {
        this.world = new PhotoFirstWorld();
      }
      
      this.world.importWorld(worldData);
      return true;
      
    } catch (error) {
      console.error('Failed to import world data:', error);
      return false;
    }
  }

  /**
   * Gets the current world data as a JSON object
   * @returns {Object|null} - Current world data or null if no world
   */
  getCurrentWorldData() {
    if (!this.world) return null;
    return this.world.exportWorld();
  }

  /**
   * Integrates with the editor facade to provide world persistence
   * @param {Object} facade - Editor facade to integrate with
   */
  integrateWithEditorFacade(facade) {
    this.facade = facade;
    
    # Add persistence methods to the facade if they don't exist
    if (facade && !facade.saveWorld) {
      facade.saveWorld = async () => {
        return await this.saveWorldToFile();
      };
    }
    
    if (facade && !facade.loadWorld) {
      facade.loadWorld = async (file) => {
        return await this.loadWorldFromFile(file);
      };
    }
    
    if (facade && !facade.exportWorld) {
      facade.exportWorld = (filename) => {
        this.exportWorldAsDownload(filename);
      };
    }
    
    if (facade && !facade.importWorld) {
      facade.importWorld = (worldData) => {
        return this.importWorldData(worldData);
      };
    }
    
    # Load any persisted world on integration
    this.loadWorldFromSessionStorage().then(result => {
      if (result.success && result.data) {
        this.world = result.data;
        console.log('Loaded persisted world on editor integration');
      }
    });
  }

  /**
   * Gets persistence statistics
   * @returns {Object} - Persistence statistics
   */
  getPersistenceStats() {
    return {
      autosaveEnabled: this.autosaveEnabled,
      autosaveDelayMs: this.autosaveDelay,
      hasPersistedData: typeof window !== 'undefined' && 
                        sessionStorage && 
                        !!sessionStorage.getItem('shaded-photofirst-world'),
      worldExists: !!this.world,
      photoCount: this.world ? this.world.getAllPhotos().length : 0,
      patchCount: this.world ? this.world.getAllSurfacePatches().length : 0
    };
  }
};

/**
 * Editor integration layer for Photo-First system
 * Connects the photo-first reconstruction system with the editor facade
 */
export class PhotoFirstEditorIntegration {
  constructor(editorFacade) {
    this.facade = editorFacade;
    this.worldPersistence = new WorldPersistenceManager(editorFacade);
    this.spatialIntegrator = null; # Will be initialized when needed
    
    # State
    this.enabled = false;
    this.currentMode = null; # Will hold reference to active mode (e.g., ReverseViewfinderMode)
    
    # Integration points
    this.integrationPoints = [];
  }

  /**
   * Enables the photo-first system in the editor
   */
  enable() {
    if (this.enabled) return;
    
    this.enabled = true;
    
    # Initialize world persistence
    this.worldPersistence.integrateWithEditorFacade(this.facade);
    
    # Add photo-first methods to the facade
    this.addPhotoFirstMethodsToFacade();
    
    # Load any persisted world
    this.loadPersistedWorld();
    
    console.log('Photo-First system enabled in editor');
  }

  /**
   * Disables the photo-first system in the editor
   */
  disable() {
    if (!this.enabled) return;
    
    this.enabled = false;
    
    # Stop any active modes
    if (this.currentMode) {
      this.currentMode.deactivate();
      this.currentMode = null;
    }
    
    # Stop autosave
    this.worldPersistence.stopAutosave();
    
    console.log('Photo-First system disabled in editor');
  }

  /**
   * Adds photo-first methods to the editor facade
   */
  addPhotoFirstMethodsToFacade() {
    if (!this.facade) return;
    
    # Add world persistence methods
    if (!this.facade.saveWorld) {
      this.facade.saveWorld = async () => {
        return await this.worldPersistence.saveWorldToFile();
      };
    }
    
    if (!this.facade.loadWorld) {
      this.facade.loadWorld = async (file) => {
        const result = await this.worldPersistence.loadWorldFromFile(file);
        if (result.success) {
          # Update the integrated world
          this.worldPersistence.world = result.data;
        }
        return result;
      };
    }
    
    if (!this.facade.exportWorld) {
      this.facade.exportWorld = (filename = 'shaded-world.json') => {
        this.worldPersistence.exportWorldAsDownload(filename);
      };
    }
    
    if (!this.facade.importWorld) {
      this.facade.importWorld = (worldData) => {
        return this.worldPersistence.importWorldData(worldData);
      };
    }
    
    # Add photo-first world access
    if (!this.facade.getPhotoFirstWorld) {
      this.facade.getPhotoFirstWorld = () => {
        return this.worldPersistence.world;
      };
    }
    
    # Add method to start reverse viewfinder mode
    if (!this.facade.startReverseViewfinder) {
      this.facade.startReverseViewfinder = async (photoFile = null) => {
        return await this.startReverseViewfinderMode(photoFile);
      };
    }
    
    # Add method to process a photo through the full pipeline
    if (!this.facade.processPhoto) {
      this.facade.processPhoto = async (photoFile, calibration = {}) => {
        return await this.processPhotoThroughPipeline(photoFile, calibration);
      };
    }
  }

  /**
   * Loads any persisted world data
   */
  loadPersistedWorld() {
    this.worldPersistence.loadWorldFromSessionStorage().then(result => {
      if (result.success && result.data) {
        this.worldPersistence.world = result.data;
        console.log('Loaded persisted Photo-First world');
      }
    });
  }

  /**
   * Starts the reverse viewfinder mode
   * @param {File|Blob|null} photoFile - Optional photo file to start with
   * @returns {Promise<Object>} - Result of starting the mode
   */
  async startReverseViewfinderMode(photoFile = null) {
    # Deactivate any current mode
    if (this.currentMode) {
      this.currentMode.deactivate();
    }
    
    # Import ReverseViewfinderMode dynamically to avoid circular dependencies
    try {
      const { ReverseViewfinderMode } = await import('./reverse-viewfinder-mode.mjs');
      
      # Create and activate the mode
      this.currentMode = new ReverseViewfinderMode(this.facade);
      this.currentMode.activate(photoFile);
      
      return { success: true, message: 'Reverse viewfinder mode activated' };
      
    } catch (error) {
      console.error('Failed to start reverse viewfinder mode:', error);
      return { success: false, error: `Failed to start reverse viewfinder mode: ${error.message}` };
    }
  }

  /**
   * Processes a photo through the full photo-first pipeline
   * @param {File|Blob} photoFile - Photo file to process
   * @param {Object} calibration - Optional calibration data
   * @returns {Promise<Object>} - Result of processing
   */
  async processPhotoThroughPipeline(photoFile, calibration = {}) {
    # Initialize spatial integrator if needed
    if (!this.spatialIntegrator) {
      try {
        const { SpatialSystemIntegrator } = await import('./spatial-system-integrator.mjs');
        this.spatialIntegrator = new SpatialSystemIntegrator();
        await this.spatialIntegrator.initialize();
      } catch (error) {
        console.warn('Spatial system integrator not available:', error);
        # Continue without spatial integration
      }
    }
    
    # Process the photo
    if (this.spatialIntegrator) {
      return await this.spatialIntegrator.processPhoto(photoFile, calibration);
    } else {
      # Fallback to basic photo processing without spatial integration
      return await this.processPhotoBasic(photoFile, calibration);
    }
  }

  /**
   * Basic photo processing without spatial integration
   * @param {File|Blob} photoFile - Photo file to process
   * @param {Object} calibration - Optional calibration data
   * @returns {Promise<Object>} - Result of processing
   */
  async processPhotoBasic(photoFile, calibration = {}) {
    return new Promise(async (resolve) => {
      try {
        # Load photo
        const img = await this.loadImageFromFile(photoFile);
        
        # Create photo object
        const photo = {
          id: `photo_${Date.now()}`,
          file: photoFile,
          image: img,
          width: img.width,
          height: img.height,
          camera: this.createDefaultCamera(img.width, img.height)
        };
        
        # Apply calibration
        if (calibration.position) {
          photo.camera.position = [...calibration.position];
        }
        if (calibration.rotation) {
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
        
        # Add to world
        const photoId = this.worldPersistence.world.addPhoto(photo);
        
        # Create a basic patch (placeholder)
        const patchId = `patch_${Date.now()}`;
        const patch = new SurfacePatch(
          patchId,
          photoId,
          `camera_${Date.now()}`
        );
        
        # Add a simple quad patch for demonstration
        patch.addVertex([-1, 0, -1, 0, 0]); # bottom-left
        patch.addVertex([ 1, 0, -1, 1, 0]); # bottom-right
        patch.addVertex([-1, 0,  1, 0, 1]); # top-left
        patch.addVertex([ 1, 0,  1, 1, 1]); # top-right
        
        patch.addTriangle([0, 1, 2]); # first triangle
        patch.addTriangle([1, 3, 2]); # second triangle
        
        # Add patch to world
        const patchIdResult = this.worldPersistence.world.addSurfacePatch(patch);
        
        resolve({
          success: true,
          photoId: photoId,
          patchId: patchIdResult,
          message: 'Photo processed successfully (basic mode)'
        });
        
      } catch (error) {
        console.error('Basic photo processing failed:', error);
        resolve({ success: false, error: `Basic photo processing failed: ${error.message}` });
      }
    });
  }

  /**
   * Loads an image from a file
   * @param {File|Blob} file - File to load as image
   * @returns {Promise<HTMLImageElement>} - Loaded image
   */
  loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src); # Clean up blob URL
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src); # Clean up blob URL
        reject(new Error('Failed to load image'));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Creates a default camera for a photo
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   * @returns {Object} - Default camera parameters
   */
  createDefaultCamera(width, height) {
    return {
      position: [0, 1.7, 0], # Eye level height
      rotation: [0, 0, 0],   # No rotation
      fovY: 60,              # Default vertical FOV
      principalPoint: [0.5, 0.5], # Centered
      lens: { k1: 0, k2: 0 }, # No distortion
      provenance: 'DEFAULT',
      confidence: 0.8
    };
  }

  /**
   * Gets the current persistence statistics
   * @returns {Object} - Persistence statistics
   */
  getPersistenceStats() {
    return this.worldPersistence.getPersistenceStats();
  }

  /**
   * Checks if the photo-first system is enabled
   * @returns {boolean} - True if enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Gets the current active mode
   * @returns {Object|null} - Current active mode or null
   */
  getCurrentMode() {
    return this.currentMode;
  }
};

export { WorldPersistenceManager, PhotoFirstEditorIntegration };