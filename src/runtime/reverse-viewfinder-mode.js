// ReverseViewfinderMode editor implementation for SHADED's PHOTO-FIRST system
// Provides UI for placing photos in 3D space and matching their perspective

import { ReverseViewfinderCalibrator } from './reverse-viewfinder-calibrator.js';
import { PhotoFirstWorld } from './photo-first-reconstruction.js';
import { DepthToMeshProcessor } from './depth-to-local-mesh.js';
import { PatchRegistrar } from './patch-registration.js';
import { MonocularDepthProvider } from './reconstruction/depth-provider.js';

export class ReverseViewfinderMode {
  constructor(editorFacade) {
    this.facade = editorFacade;
    this.engine = () => editorFacade.win && editorFacade.win.SHADED;
    this.engineDoc = () => editorFacade.win && editorFacade.win.document;
    
    // State
    this.isActive = false;
    this.currentPhotoId = null;
    this.currentPatchId = null;
    this.isProcessing = false;
    
    // Calibration and processing objects
    this.calibrator = new ReverseViewfinderCalibrator();
    this.world = new PhotoFirstWorld();
    this.depthProcessor = new DepthToMeshProcessor();
    this.registrar = new PatchRegistrar();
    this.depthProvider = new MonocularDepthProvider();
    
    // UI elements
    this.uiElements = null;
    this.previewCanvas = null;
    this.previewCtx = null;
    
    // Reference points for perspective matching
    this.tempReferencePoints = []; // Points added during current session
    
    // Bind event handlers
    this.bindEvents = this.bindEvents.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onWheel = this.onWheel.bind(this);
    
    // Mode state
    this.mode = 'PLACE'; // PLACE, ADJUST, LOCK, EXTRUDE
    this.referencePointStage = 0; // 0 = none, 1 = first point placed, 2 = second point placed
  }

  /**
   * Activates the reverse viewfinder mode
   * @param {File|Blob|null} photoFile - Optional photo file to load
   */
  async activate(photoFile = null) {
    if (this.isActive) return;
    
    this.isActive = true;
    this.mode = 'PLACE';
    
    // Initialize depth provider if not already loaded
    if (!this.depthProvider.isLoaded) {
      this.showStatus('Loading depth model...', 'info');
      try {
        await this.depthProvider.loadModel('DA3-BASE', 'q4_k');
      } catch (e) {
        this.showStatus('Depth model load failed, using fallback', 'warn');
      }
    }
    
    // Create UI
    this.createUI();
    
    // Load photo if provided
    if (photoFile) {
      this.loadPhoto(photoFile);
    }
    
    // Bind events
    this.bindEvents();
    
    // Enter placement mode
    this.enterPlacementMode();
  }

  /**
   * Deactivates the reverse viewfinder mode
   */
  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    // Remove UI
    this.removeUI();
    
    // Unbind events
    this.unbindEvents();
    
    // Reset state
    this.resetState();
  }

  /**
   * Creates the UI elements for reverse viewfinder mode
   */
  createUI() {
    const doc = this.engineDoc();
    if (!doc) return;
    
    // Create main container
    this.uiElements = doc.createElement('div');
    this.uiElements.id = 'reverse-viewfinder-ui';
    this.uiElements.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      font-family: sans-serif;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    `;
    
    // Mode indicator
    this.modeIndicator = doc.createElement('div');
    this.modeIndicator.style.cssText = `
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 20px;
      pointer-events: auto;
    `;
    this.uiElements.appendChild(this.modeIndicator);
    
    // Instructions
    this.instructions = doc.createElement('div');
    this.instructions.style.cssText = `
      font-size: 18px;
      text-align: center;
      max-width: 80%;
      margin-bottom: 30px;
      line-height: 1.5;
      pointer-events: auto;
    `;
    this.uiElements.appendChild(this.instructions);
    
    // Controls panel
    this.controlsPanel = doc.createElement('div');
    this.controlsPanel.style.cssText = `
      display: flex;
      gap: 15px;
      margin-bottom: 20px;
      pointer-events: auto;
    `;
    this.uiElements.appendChild(this.controlsPanel);
    
    // Preview canvas for depth visualization
    this.previewContainer = doc.createElement('div');
    this.previewContainer.style.cssText = `
      width: 80%;
      max-width: 600px;
      height: 400px;
      background: #333;
      border: 2px solid #777;
      border: 2px solid //777;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 20px;
      pointer-events: auto;
    `;
    
    this.previewCanvas = doc.createElement('canvas');
    this.previewCanvas.width = 600;
    this.previewCanvas.height = 400;
    this.previewCtx = this.previewCanvas.getContext('2d');
    this.previewContainer.appendChild(this.previewCanvas);
    this.uiElements.appendChild(this.previewContainer);
    
    // Status display
    this.statusDisplay = doc.createElement('div');
    this.statusDisplay.style.cssText = `
      font-size: 16px;
      text-align: center;
      max-width: 90%;
      margin-top: 10px;
      pointer-events: auto;
    `;
    this.uiElements.appendChild(this.statusDisplay);
    
    // Add to document
    doc.body.appendChild(this.uiElements);
    
    // Update UI
    this.updateUI();
  }

  /**
   * Removes the UI elements
   */
  removeUI() {
    if (this.uiElements && this.uiElements.parentNode) {
      this.uiElements.parentNode.removeChild(this.uiElements);
    }
    this.uiElements = null;
    this.previewCanvas = null;
    this.previewCtx = null;
  }

  /**
   * Binds event handlers
   */
  bindEvents() {
    const doc = this.engineDoc();
    const win = this.engine();
    if (!doc || !win) return;
    
    doc.addEventListener('pointerdown', this.onPointerDown);
    doc.addEventListener('pointermove', this.onPointerMove);
    doc.addEventListener('pointerup', this.onPointerUp);
    doc.addEventListener('pointerleave', this.onPointerUp);
    win.addEventListener('keydown', this.onKeyDown);
    win.addEventListener('keyup', this.onKeyUp);
    win.addEventListener('wheel', this.onWheel);
  }

  /**
   * Unbinds event handlers
   */
  unbindEvents() {
    const doc = this.engineDoc();
    const win = this.engine();
    if (!doc || !win) return;
    
    doc.removeEventListener('pointerdown', this.onPointerDown);
    doc.removeEventListener('pointermove', this.onPointerMove);
    doc.removeEventListener('pointerup', this.onPointerUp);
    doc.removeEventListener('pointerleave', this.onPointerUp);
    win.removeEventListener('keydown', this.onKeyDown);
    win.removeEventListener('keyup', this.onKeyUp);
    win.removeEventListener('wheel', this.onWheel);
  }

  /**
   * Handles pointer down events
   * @param {PointerEvent} event - Pointer event
   */
  onPointerDown(event) {
    if (!this.isActive || this.isProcessing) return;
    
    event.preventDefault();
    
    const doc = this.engineDoc();
    if (!doc) return;
    
    // Get canvas coordinates
    const rect = this.previewCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Check if click is inside preview canvas
    if (x < 0 || x >= this.previewCanvas.width || y < 0 || y >= this.previewCanvas.height) {
      return;
    }
    
    // Handle based on current mode
    switch (this.mode) {
      case 'PLACE':
        this.handlePlaceModeClick(x, y);
        break;
      case 'ADJUST':
        this.handleAdjustModeClick(x, y);
        break;
      case 'LOCK':
        // Lock mode doesn't handle clicks
        break;
      case 'EXTRUDE':
        this.handleExtrudeModeClick(x, y);
        break;
    }
    
    this.updateUI();
  }

  /**
   * Handles pointer move events
   * @param {PointerEvent} event - Pointer event
   */
  onPointerMove(event) {
    if (!this.isActive || this.isProcessing) return;
    
    // Update cursor based on mode
    const doc = this.engineDoc();
    if (!doc) return;
    
    const rect = this.previewCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Update preview if needed
    if (this.mode === 'ADJUST' && this.isDragging) {
      this.handleAdjustModeDrag(x, y);
      this.updateUI();
    }
  }

  /**
   * Handles pointer up events
   * @param {PointerEvent} event - Pointer event
   */
  onPointerUp(event) {
    if (!this.isActive) return;
    
    this.isDragging = false;
  }

  /**
   * Handles key down events
   * @param {KeyboardEvent} event - Keyboard event
   */
  onKeyDown(event) {
    if (!this.isActive || this.isProcessing) return;
    
    // Handle mode switching and actions
    switch (event.key) {
      case 'Escape':
        // Cancel current operation
        this.cancelCurrentOperation();
        break;
      case 'Enter':
        // Confirm current action
        this.confirmCurrentAction();
        break;
      case ' ':
        // Spacebar - toggle between modes or perform action
        this.toggleModeOrAction();
        break;
      case 'r':
      case 'R':
        // Reset calibration
        this.resetCalibration();
        break;
      case 'c':
      case 'C':
        // Clear reference points
        this.clearReferencePoints();
        break;
      case '1':
        // Switch to place mode
        this.switchToPlaceMode();
        break;
      case '2':
        // Switch to adjust mode
        this.switchToAdjustMode();
        break;
      case '3':
        // Switch to lock mode
        this.switchToLockMode();
        break;
      case '4':
        // Switch to extrude mode
        this.switchToExtrudeMode();
        break;
    }
    
    this.updateUI();
  }

  /**
   * Handles key up events
   * @param {KeyboardEvent} event - Keyboard event
   */
  onKeyUp(event) {
    // Prevent default for certain keys to avoid interference
    if ([' ', 'Enter', 'Escape'].includes(event.key)) {
      event.preventDefault();
    }
  }

  /**
   * Handles wheel events for zooming/adjusting
   * @param {WheelEvent} event - Wheel event
   */
  onWheel(event) {
    if (!this.isActive || this.isProcessing) return;
    
    event.preventDefault();
    
    // Use wheel for adjusting FOV or other parameters based on mode
    const delta = event.deltaY > 0 ? -1 : 1; // Invert for intuitive scrolling
    
    switch (this.mode) {
      case 'ADJUST':
        this.adjustFOV(delta * 0.5); // Adjust FOV by 0.5 degrees per scroll
        break;
      case 'PLACE':
        // In place mode, wheel might adjust distance or height
        this.adjustCameraHeight(delta * 0.1); // Adjust height by 0.1m per scroll
        break;
    }
    
    this.updateUI();
  }

  /**
   * Loads a photo file and prepares it for reverse viewfinding
   * @param {File|Blob} photoFile - Photo file to load
   */
  async loadPhoto(photoFile) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.updateUI();
    
    try {
      // Create image blob URL
      const imageUrl = URL.createObjectURL(photoFile);
      
      // Load image
      const image = await this.loadImage(imageUrl);
      
      // Store photo info
      this.currentPhotoId = `photo_${Date.now()}`;
      this.photoFile = photoFile;
      this.photoImage = image;
      this.photoWidth = image.width;
      this.photoHeight = image.height;
      
      // Initialize calibrator with image
      this.calibrator.setTargetImage(image);
      
      // Set initial camera position based on image analysis
      const initialPose = ReverseViewfinderHelper.suggestInitialCamera(
        this.photoWidth,
        this.photoHeight,
        'indoor' // Default scene type
      );
      
      this.calibrator.setPosition(initialPose.position);
      this.calibrator.setRotation(initialPose.rotation.map(r => r * 180 / Math.PI)); // Convert to degrees
      this.calibrator.setFOV(initialPose.fovY);
      
      // Update UI
      this.updateUI();
      
      // Automatically enter adjust mode for fine-tuning
      this.switchToAdjustMode();
      
    } catch (error) {
      console.error('Failed to load photo:', error);
      this.showStatus(`Error loading photo: ${error.message}`, 'error');
    } finally {
      this.isProcessing = false;
      this.updateUI();
    }
  }

  /**
   * Loads an image from a URL
   * @param {string} url - Image URL
   * @returns {Promise<HTMLImageElement>} - Loaded image
   */
  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      img.src = url;
    });
  }

  /**
   * Enters placement mode (initial photo placement)
   */
  enterPlacementMode() {
    this.mode = 'PLACE';
    this.referencePointStage = 0;
    this.tempReferencePoints = [];
    this.updateUI();
  }

  /**
   * Switches to placement mode
   */
  switchToPlaceMode() {
    this.mode = 'PLACE';
    this.updateUI();
  }

  /**
   * Enters adjustment mode (fine-tuning camera pose)
   */
  enterAdjustmentMode() {
    this.mode = 'ADJUST';
    this.updateUI();
  }

  /**
   * Switches to adjustment mode
   */
  switchToAdjustMode() {
    this.mode = 'ADJUST';
    this.updateUI();
  }

  /**
   * Enters lock mode (finalizing calibration)
   */
  enterLockMode() {
    this.mode = 'LOCK';
    this.updateUI();
  }

  /**
   * Switches to lock mode
   */
  switchToLockMode() {
    this.mode = 'LOCK';
    this.updateUI();
  }

  /**
   * Enters extrusion mode (generating depth and mesh)
   */
  enterExtrusionMode() {
    this.mode = 'EXTRUDE';
    this.updateUI();
  }

  /**
   * Switches to extrusion mode
   */
  switchToExtrudeMode() {
    this.mode = 'EXTRUDE';
    this.updateUI();
  }

  /**
   * Handles click in placement mode
   * @param {number} x - Canvas x coordinate
   * @param {number} y - Canvas y coordinate
   */
  handlePlaceModeClick(x, y) {
    // In place mode, clicking sets the initial reference point for height
    // Convert canvas coordinates to normalized image coordinates
    const nx = x / this.previewCanvas.width;
    const ny = y / this.previewCanvas.height;
    
    // Store as first reference point (we'll need a second point to define height)
    this.tempReferencePoints.push([nx, ny]);
    this.referencePointStage = 1;
    
    this.showStatus('First point placed. Click again to set height reference.', 'info');
  }

  /**
   * Handles click in adjustment mode
   * @param {number} x - Canvas x coordinate
   * @param {number} y - Canvas y coordinate
   */
  handleAdjustModeClick(x, y) {
    // In adjust mode, clicking starts dragging for rotation adjustment
    this.isDragging = true;
    this.lastDragX = x;
    this.lastDragY = y;
  }

  /**
   * Handles drag in adjustment mode
   * @param {number} x - Current canvas x coordinate
   * @param {number} y - Current canvas y coordinate
   */
  handleAdjustModeDrag(x, y) {
    if (!this.isDragging) return;
    
    // Calculate drag delta
    const dx = x - this.lastDragX;
    const dy = y - this.lastDragY;
    
    // Convert to rotation changes
    // Horizontal drag = yaw rotation
    // Vertical drag = pitch rotation
    const sensitivity = 0.2; // Degrees per pixel
    
    const yawDelta = dx * sensitivity;
    const pitchDelta = dy * sensitivity;
    
    // Apply to current calibration
    const currentRot = this.calibrator.getRotationDegrees();
    this.calibrator.setRotation([
      currentRot[0] + yawDelta,   // yaw
      currentRot[1] + pitchDelta, // pitch
      currentRot[2]               // roll (unchanged)
    ]);
    
    // Update last position
    this.lastDragX = x;
    this.lastDragY = y;
  }

  /**
   * Handles click in extrusion mode
   * @param {number} x - Canvas x coordinate
   * @param {number} y - Canvas y coordinate
   */
  handleExtrudeModeClick(x, y) {
    // In extrude mode, clicking starts the depth generation process
    this.startDepthGeneration();
  }

  /**
   * Cancels the current operation
   */
  cancelCurrentOperation() {
    // Reset to placement mode
    this.enterPlacementMode();
    this.showStatus('Operation cancelled. Ready to place photo.', 'info');
  }

  /**
   * Confirms the current action
   */
  confirmCurrentAction() {
    switch (this.mode) {
      case 'PLACE':
        if (this.referencePointStage === 1) {
          // Second point clicked - process height reference
          this.processHeightReference();
        }
        break;
      case 'ADJUST':
        // Switch to lock mode after adjustment
        this.switchToLockMode();
        break;
      case 'LOCK':
        // Finalize calibration and switch to extrude
        this.finalizeCalibration();
        break;
      case 'EXTRUDE':
        // Already handled in click handler
        break;
    }
  }

  /**
   * Toggles between modes or performs mode-specific action
   */
  toggleModeOrAction() {
    switch (this.mode) {
      case 'PLACE':
        if (this.referencePointStage === 1) {
          this.processHeightReference();
        } else {
          // First click in place mode
          this.handlePlaceModeClick(
            this.previewCanvas.width / 2,
            this.previewCanvas.height / 2
          );
        }
        break;
      case 'ADJUST':
        this.switchToLockMode();
        break;
      case 'LOCK':
        this.finalizeCalibration();
        break;
      case 'EXTRUDE':
        this.startDepthGeneration();
        break;
    }
  }

  /**
   * Processes the height reference from two points
   */
  processHeightReference() {
    if (this.tempReferencePoints.length < 2) {
      this.showStatus('Need two points for height reference', 'warning');
      return;
    }
    
    // The two points define a vertical segment in the image
    // We'll use this to estimate camera height
    
    const [p1, p2] = this.tempReferencePoints;
    
    // Calculate vertical distance in pixels
    const pixelHeight = Math.abs(p2[1] - p1[1]) * this.previewCanvas.height;
    
    // Assume this represents a known height (e.g., 2 meters for a person)
    // This is a simplification - in reality users would specify the real-world height
    const assumedRealHeight = 2.0; // meters
    
    // Calculate pixels per meter
    const pixelsPerMeter = pixelHeight / assumedRealHeight;
    
    // Estimate camera distance based on focal length and sensor size
    // This is getting complex - let's use a simpler approach
    
    // For now, just switch to adjust mode for manual tuning
    this.switchToAdjustMode();
    this.showStatus('Height reference set. Adjust camera pose to match perspective.', 'info');
  }

  /**
   * Finalizes the camera calibration
   */
  finalizeCalibration() {
    // Lock the camera calibration
    this.calibrator.lock();
    
    // Create a photo entry in our world
    const photo = new Photo(
      this.currentPhotoId || `photo_${Date.now()}`,
      this.photoFile,
      this.photoWidth,
      this.photoHeight
    );
    
    photo.camera = this.calibrator.camera.clone();
    photo.provider = 'user_calibrated';
    
    // Add photo to world
    const photoId = this.world.addPhoto(photo);
    this.currentPhotoId = photoId;
    
    // Switch to extrude mode
    this.switchToExtrudeMode();
    this.showStatus('Camera calibrated. Click to generate depth and mesh.', 'success');
  }

  /**
   * Starts the depth generation and mesh creation process
   */
  async startDepthGeneration() {
    if (this.isProcessing || !this.currentPhotoId) return;
    
    this.isProcessing = true;
    this.updateUI();
    
    try {
      this.showStatus('Generating depth map...', 'info');
      
      // In a real implementation, we would:
      // 1. Send the photo to a depth provider (Depth Anything, etc.)
      // 2. Get back depth map, confidence, normals
      // 3. Process the depth map to generate a mesh
      // 4. Register the mesh to the world
      
      // For this implementation, we'll simulate the process
      await this.simulateDepthGeneration();
      
    } catch (error) {
      console.error('Depth generation failed:', error);
      this.showStatus(`Depth generation failed: ${error.message}`, 'error');
    } finally {
      this.isProcessing = false;
      this.updateUI();
    }
  }

  /**
   * Simulates depth generation for demonstration purposes
   * In a real implementation, this would call the depth provider
   */
  async simulateDepthGeneration() {
    // Wait a bit to simulate processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Use real depth provider if available, otherwise generate gradient
    let depthMap, confidenceMap;
    
    if (this.depthProvider && this.depthProvider.isLoaded) {
      this.showStatus('Running real depth estimation...', 'info');
      const result = await this.depthProvider.estimateDepth(this.photoImage, {
        maxDimension: 1024,
        returnPose: false,
        returnSky: false
      });
      depthMap = result.depth;
      confidenceMap = result.confidence;
    } else {
      // Fallback: simple gradient depth (for demo/offline)
      this.showStatus('Using gradient depth fallback...', 'warn');
      depthMap = new Float32Array(this.photoWidth * this.photoHeight);
      confidenceMap = new Float32Array(this.photoWidth * this.photoHeight);
      
      for (let y = 0; y < this.photoHeight; y++) {
        for (let x = 0; x < this.photoWidth; x++) {
          const index = y * this.photoWidth + x;
          const depth = 0.5 + (y / this.photoHeight) * 2.5;
          depthMap[index] = depth;
          
          const edgeDistance = Math.min(
            x, y, this.photoWidth - 1 - x, this.photoHeight - 1 - y
          );
          const confidence = Math.min(1.0, edgeDistance / 20.0);
          confidenceMap[index] = confidence;
        }
      }
    }
    
    // Show preview of depth map
    this.showDepthPreview(depthMap, this.photoWidth, this.photoHeight);
    
    // Process depth map to generate mesh
    this.showStatus('Processing depth map to generate mesh...', 'info');
    
    // Generate patch ID
    const patchId = `patch_${Date.now()}`;
    this.currentPatchId = patchId;
    
    // Process the depth map
    this.depthProcessor.setInputData(
      depthMap,
      confidenceMap,
      this.photoImage,
      this.calibrator.camera,
      this.photoWidth,
      this.photoHeight
    );
    
    const patch = this.depthProcessor.processDepthMap(
      patchId,
      this.currentPhotoId,
      `camera_${Date.now()}` // Simplified camera ID
    );
    
    // Add patch to world
    this.world.addSurfacePatch(patch);
    
    // Register patch to world (if there are other patches)
    if (this.world.getAllSurfacePatches().length > 1) {
      this.showStatus('Registering patch to existing world...', 'info');
      const registrationResult = this.registrar.registerPatchToWorld(patch.id, 'hybrid');
      
      if (registrationResult.success) {
        this.showStatus(`Patch registered successfully (fidelity: ${registrationResult.fidelity.toFixed(2)})`, 'success');
      } else {
        this.showStatus(`Registration failed: ${registrationResult.error}`, 'warning');
        // Still continue - patch is added even if registration fails
      }
    } else {
      this.showStatus('First patch added to world', 'success');
    }
    
    // Update 3D preview
    this.update3DPreview();
    
    // Ask if user wants to add another photo
    this.showStatus('Depth generation complete! Add another photo or exit mode.', 'success');
    
    // Reset for next photo
    this.resetForNextPhoto();
  }

  /**
   * Shows a preview of the depth map
   * @param {Float32Array} depthMap - Depth map data
   * @param {number} width - Width of depth map
   * @param {number} height - Height of depth map
   */
  showDepthPreview(depthMap, width, height) {
    if (!this.previewCtx) return;
    
    // Clear canvas
    this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    
    // Draw depth map as grayscale
    const imageData = this.previewCtx.createImageData(width, height);
    const data = imageData.data;
    
    // Find min and max depth for normalization
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    
    for (let i = 0; i < depthMap.length; i++) {
      const depth = depthMap[i];
      if (isFinite(depth) && depth > 0) {
        minDepth = Math.min(minDepth, depth);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    
    // Handle edge case
    if (minDepth === Infinity) {
      minDepth = 0;
      maxDepth = 1;
    }
    
    // Normalize and draw
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const i = (y * this.previewCanvas.width + x) * 4;
        
        const depth = depthMap[index];
        let gray = 0;
        
        if (isFinite(depth) && depth > 0) {
          // Normalize to [0, 1]
          const normalized = (depth - minDepth) / (maxDepth - minDepth);
          // Invert so near is black, far is white (typical depth map convention)
          gray = 255 * (1.0 - normalized);
        } else {
          gray = 0; // Invalid depth = black
        }
        
        data[i] = gray;     // R
        data[i + 1] = gray; // G
        data[i + 2] = gray; // B
        data[i + 3] = 255;  // A
      }
    }
    
    // Scale to fit canvas
    this.previewCtx.putImageData(imageData, 0, 0, 0, 0, 
      this.previewCanvas.width, this.previewCanvas.height);
  }

  /**
   * Updates the 3D preview of the world
   */
  update3DPreview() {
    // In a full implementation, this would update a 3D visualization
    // For now, we'll just update the status
    const patchCount = this.world.getAllSurfacePatches().length;
    this.showStatus(`${patchCount} patch${patchCount !== 1 ? 'es' : ''} in world`, 'info');
  }

  /**
   * Resets state for adding another photo
   */
  resetForNextPhoto() {
    // Clear current photo reference but keep world and accumulated patches
    this.currentPhotoId = null;
    this.photoFile = null;
    this.photoImage = null;
    this.photoWidth = 0;
    this.photoHeight = 0;
    
    // Reset calibrator for next photo
    this.calibrator.resetCalibration();
    
    // Return to placement mode
    this.enterPlacementMode();
  }

  /**
   * Resets all state
   */
  resetState() {
    this.isActive = false;
    this.currentPhotoId = null;
    this.currentPatchId = null;
    this.isProcessing = false;
    this.mode = 'PLACE';
    this.referencePointStage = 0;
    this.tempReferencePoints = [];
    
    // Reset processing objects
    this.calibrator = new ReverseViewfinderCalibrator();
    this.world = new PhotoFirstWorld();
    this.depthProcessor = new DepthToMeshProcessor();
    this.registrar = new PatchRegistrar();
    
    // Clear UI references
    this.uiElements = null;
    this.previewCanvas = null;
    this.previewCtx = null;
  }

  /**
   * Updates the UI based on current state
   */
  updateUI() {
    if (!this.uiElements) return;
    
    // Update mode indicator
    const modeText = {
      'PLACE': 'PLACE PHOTO',
      'ADJUST': 'ADJUST POSE',
      'LOCK': 'LOCK CALIBRATION',
      'EXTRUDE': 'EXTRUDE VIEW'
    }[this.mode] || this.mode;
    
    this.modeIndicator.textContent = modeText;
    
    // Update instructions based on mode
    let instructionsText = '';
    let statusText = '';
    let statusType = 'info';
    
    switch (this.mode) {
      case 'PLACE':
        if (this.referencePointStage === 0) {
          instructionsText = 'Click in the image to place first reference point';
        } else if (this.referencePointStage === 1) {
          instructionsText = 'Click again to place second reference point (height reference)';
        }
        statusText = 'Ready to place photo in 3D space';
        break;
        
      case 'ADJUST':
        instructionsText = 'Drag to adjust camera pose. Use wheel to adjust FOV.';
        statusText = 'Fine-tuning camera pose to match perspective';
        break;
        
      case 'LOCK':
        instructionsText = 'Press Enter to lock calibration and proceed to depth generation';
        statusText = 'Camera pose set. Ready to lock calibration.';
        statusType = 'warning';
        break;
        
      case 'EXTRUDE':
        instructionsText = 'Click to generate depth map and create 3D mesh from photo';
        statusText = 'Ready to generate depth and create 3D mesh';
        statusType = 'success';
        break;
    }
    
    this.instructions.textContent = instructionsText;
    this.statusDisplay.textContent = statusText;
    this.statusDisplay.style.color = 
      statusType === 'success' ? '#4ade80' :
      statusType === 'warning' ? '#fbbf24' :
      statusType === 'error' ? '#f87171' : '#60a5fa';
    
    // Update controls
    this.updateControls();
  }

  /**
   * Updates the control buttons
   */
  updateControls() {
    if (!this.controlsPanel) return;
    
    // Clear existing controls
    this.controlsPanel.innerHTML = '';
    
    // Create buttons based on mode
    const buttons = [];
    
    // Always show reset button
    buttons.push({
      label: 'Reset',
      action: () => this.resetCalibration(),
      disabled: this.isProcessing
    });
    
    // Mode-specific buttons
    switch (this.mode) {
      case 'PLACE':
        if (this.referencePointStage === 0) {
          buttons.push({
            label: 'Skip Reference',
            action: () => this.switchToAdjustMode(),
            disabled: this.isProcessing
          });
        }
        break;
        
      case 'ADJUST':
        buttons.push({
          label: 'Lock Pose',
          action: () => this.switchToLockMode(),
          disabled: this.isProcessing
        });
        break;
        
      case 'LOCK':
        buttons.push({
          label: 'Generate Depth',
          action: () => this.startDepthGeneration(),
          disabled: this.isProcessing || !this.currentPhotoId
        });
        break;
        
      case 'EXTRUDE':
        buttons.push({
          label: 'Add Another Photo',
          action: () => this.resetForNextPhoto(),
          disabled: this.isProcessing
        });
        buttons.push({
          label: 'Exit Mode',
          action: () => this.deactivate(),
          disabled: this.isProcessing
        });
        break;
    }
    
    // Create and append buttons
    buttons.forEach(buttonInfo => {
      const button = document.createElement('button');
      button.textContent = buttonInfo.label;
      button.disabled = buttonInfo.disabled;
      button.style.cssText = `
        padding: 8px 16px;
        font-size: 14px;
        border: none;
        border-radius: 4px;
        cursor: ${buttonInfo.disabled ? 'not-allowed' : 'pointer'};
        background: ${buttonInfo.disabled ? '#555' : '#1e40af'};
        color: white;
      `;
      
      button.addEventListener('click', () => {
        if (!buttonInfo.disabled) {
          buttonInfo.action();
        }
      });
      
      this.controlsPanel.appendChild(button);
    });
  }

  /**
   * Resets the camera calibration to initial state
   */
  resetCalibration() {
    this.calibrator.resetCalibration();
    this.showStatus('Camera calibration reset', 'info');
  }

  /**
   * Clears reference points
   */
  clearReferencePoints() {
    this.tempReferencePoints = [];
    this.referencePointStage = 0;
    this.showStatus('Reference points cleared', 'info');
  }

  /**
   * Adjusts the FOV by a specified amount
   * @param {number} delta - Amount to change FOV (in degrees)
   */
  adjustFOV(delta) {
    const currentFOV = this.calibrator.getFOV();
    this.calibrator.setFOV(currentFOV + delta);
  }

  /**
   * Adjusts the camera height by a specified amount
   * @param {number} delta - Amount to change height (in meters)
   */
  adjustCameraHeight(delta) {
    const currentPos = this.calibrator.getPosition();
    this.calibrator.setPosition([
      currentPos[0],
      currentPos[1] + delta,
      currentPos[2]
    ]);
  }

  /**
   * Shows a status message to the user
   * @param {string} message - Message to show
   * @param {string} type - Message type ('info', 'success', 'warning', 'error')
   */
  showStatus(message, type = 'info') {
    if (this.statusDisplay) {
      this.statusDisplay.textContent = message;
      this.statusDisplay.style.color = 
        type === 'success' ? '#4ade80' :
        type === 'warning' ? '#fbbf24' :
        type === 'error' ? '#f87171' : '#60a5fa';
    }
    console.log(`[ReverseViewfinder] ${type.toUpperCase()}: ${message}`);
  }
}

/**
 * Helper functions for reverse viewfinder mode
 */
export const ReverseViewfinderHelper = {
  /**
   * Suggests initial camera parameters based on image analysis
   * @param {number} imageWidth - Width of image in pixels
   * @param {number} imageHeight - Height of image in pixels
   * @param {string} sceneType - Type of scene ('indoor', 'outdoor', 'architectural')
   * @returns {{position: [number, number, number], rotation: [number, number, number], fovY: number}} - Suggested camera parameters
   */
  suggestInitialCamera(imageWidth, imageHeight, sceneType = 'indoor') {
    // Simple heuristic based on image aspect ratio and scene type
    const aspect = imageWidth / imageHeight;
    
    // Default settings
    let fovY = 60; // degrees
    let height = 1.7; // eye level height
    let distanceFromWall = 2.0; // meters from wall
    
    // Adjust based on scene type
    if (sceneType === 'architectural') {
      fovY = 75; // Wider FOV for architecture
      distanceFromWall = 1.5;
    } else if (sceneType === 'outdoor') {
      fovY = 50; // Narrower FOV for outdoor scenes
      height = 1.6;
      distanceFromWall = 5.0;
    }
    
    // Calculate position assuming we're looking at a wall straight ahead
    // Camera at (0, height, -distanceFromWall) looking at origin
    const position = [0, height, -distanceFromWall];
    const rotation = [0, 0, 0]; // Looking straight ahead (no rotation)
    
    return { position, rotation, fovY };
  }
};
