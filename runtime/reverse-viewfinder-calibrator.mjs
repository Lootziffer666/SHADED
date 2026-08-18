// Reverse-viewfinder camera calibration utilities for SHADED's PHOTO-FIRST system
// Provides functionality for placing photos in 3D space and matching their perspective

import { PhotoCamera, PhotoFirstUtils } from './photo-first-reconstruction.mjs';

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Handles camera calibration for the reverse-viewfinder workflow
 * Allows users to place a photo in 3D space by adjusting its camera parameters
 */
export class ReverseViewfinderCalibrator {
  constructor() {
    this.camera = new PhotoCamera();
    this.targetImage = null; // Reference to the image being calibrated
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.isLocked = false; // Whether the camera is locked after calibration
    
    // Reference points for perspective matching
    this.referencePoints_ = []; // Array of {imagePoint: [u,v], worldPoint: [x,y,z]}
    this.referenceLines_ = []; // Array of {point1: [u,v], point2: [u,v]} in image space
    
    // Calibration state
    this.calibrationMethod_ = 'none'; // 'none', 'manual', 'reference', 'exif'
    this.calibrationConfidence_ = 0;
  }

  /**
   * Sets the target image for calibration
   * @param {HTMLImageElement|ImageBitmap} image - The image to calibrate
   */
  setTargetImage(image) {
    this.targetImage = image;
    this.imageWidth = image.width;
    this.imageHeight = image.height;
    
    // Reset calibration when new image is set
    this.resetCalibration();
  }

  /**
   * Resets camera to default state
   */
  resetCalibration() {
    this.camera = new PhotoCamera();
    this.referencePoints_ = [];
    this.referenceLines_ = [];
    this.calibrationMethod_ = 'none';
    this.calibrationConfidence_ = 0;
    this.isLocked = false;
  }

  /**
   * Sets camera position
   * @param {[number, number, number]} position - [x, y, z] in world space
   */
  setPosition(position) {
    if (this.isLocked) return false;
    this.camera.position = [...position];
    return true;
  }

  /**
   * Gets camera position
   * @returns {[number, number, number]} - [x, y, z] position
   */
  getPosition() {
    return [...this.camera.position];
  }

  /**
   * Sets camera rotation (yaw, pitch, roll in degrees)
   * @param {[number, number, number]} rotation - [yaw, pitch, roll] in degrees
   */
  setRotation(rotationDegrees) {
    if (this.isLocked) return false;
    const [yawDeg, pitchDeg, rollDeg] = rotationDegrees;
    this.camera.rotation = [
      yawDeg * Math.PI / 180,
      pitchDeg * Math.PI / 180,
      rollDeg * Math.PI / 180
    ];
    return true;
  }

  /**
   * Gets camera rotation in degrees
   * @returns {[number, number, number]} - [yaw, pitch, roll] in degrees
   */
  getRotationDegrees() {
    return this.camera.rotation.map(angle => angle * 180 / Math.PI);
  }

  /**
   * Sets vertical field of view
   * @param {number} fovY - Vertical FOV in degrees (typically 60-90)
   */
  setFOV(fovY) {
    if (this.isLocked) return false;
    // Clamp to reasonable FOV range
    this.camera.fovY = clamp(fovY, 1, 179);
    return true;
  }

  /**
   * Gets vertical field of view
   * @returns {number} - Vertical FOV in degrees
   */
  getFOV() {
    return this.camera.fovY;
  }

  /**
   * Sets principal point (normalized image coordinates)
   * @param {[number, number]} point - [x, y] normalized coordinates (0-1)
   */
  setPrincipalPoint(point) {
    if (this.isLocked) return false;
    this.camera.principalPoint = [clamp(point[0], 0, 1), clamp(point[1], 0, 1)];
    return true;
  }

  /**
   * Gets principal point
   * @returns {[number, number]} - [x, y] normalized coordinates (0-1)
   */
  getPrincipalPoint() {
    return [...this.camera.principalPoint];
  }

  /**
   * Sets lens distortion coefficients
   * @param {{k1: number, k2?: number}} lens - Lens distortion parameters
   */
  setLensDistortion(lens) {
    if (this.isLocked) return false;
    this.camera.lens.k1 = lens.k1 || 0;
    this.camera.lens.k2 = lens.k2 || 0;
    return true;
  }

  /**
   * Gets lens distortion coefficients
   * @returns {{k1: number, k2: number}} - Lens distortion parameters
   */
  getLensDistortion() {
    return {...this.camera.lens};
  }

  /**
   * Locks the camera after calibration is complete
   * Prevents further accidental modifications
   */
  lock() {
    this.isLocked = true;
    this.camera.provenance = 'USER_CALIBRATED';
    this.camera.confidence = this.calibrationConfidence;
  }

  /**
   * Unlocks the camera for further adjustment
   */
  unlock() {
    this.isLocked = false;
  }

  /**
   * Checks if camera is locked
   * @returns {boolean} - True if camera is locked
   */
  isLocked() {
    return this.isLocked;
  }

  /**
   * Adds a reference point for perspective matching
   * @param {[number, number]} imagePoint - Normalized image coordinates [u, v] (0-1)
   * @param {[number, number, number]} worldPoint - World coordinates [x, y, z]
   * @param {number} weight - Optional weight for this reference (0-1)
   */
  addReferencePoint(imagePoint, worldPoint, weight = 1.0) {
    if (this.isLocked) return false;
    this.referencePoints_.push({
      imagePoint: [...imagePoint],
      worldPoint: [...worldPoint],
      weight: clamp(weight, 0, 1)
    });
    return true;
  }

  /**
   * Adds a reference line for perspective matching
   * @param {[number, number]} point1 - First point in image coordinates [u, v] (0-1)
   * @param {[number, number]} point2 - Second point in image coordinates [u, v] (0-1)
   * @param {number} weight - Optional weight for this reference (0-1)
   */
  addReferenceLine(point1, point2, weight = 1.0) {
    if (this.isLocked) return false;
    this.referenceLines_.push({
      point1: [...point1],
      point2: [...point2],
      weight: clamp(weight, 0, 1)
    });
    return true;
  }

  /**
   * Clears all reference points and lines
   */
  clearReferences() {
    this.referencePoints_ = [];
    this.referenceLines_ = [];
  }

  /**
   * Attempts to solve camera parameters using reference points
   * Uses a simple least-squares approach for demonstration
   * In a full implementation, this would use more sophisticated algorithms
   * @returns {{success: boolean, error: number}} - Result of the calibration attempt
   */
  solveFromReferences() {
    if (this.referencePoints_.length < 3) {
      return { success: false, error: Infinity }; // Need at least 3 points
    }
    
    # Simple approach: optimize position to minimize reprojection error
    # This is a simplified version - real implementation would be more complex
    let totalError = 0;
    let validPoints = 0;
    
    for (const ref of this.referencePoints_) {
      const [u, v] = ref.imagePoint;
      const [wx, wy, wz] = ref.worldPoint;
      
      # Project world point to image using current camera
      const projected = this.camera.worldToImage([wx, wy, wz]);
      
      if (projected) {
        const [pu, pv] = projected;
        const error = Math.hypot(pu - u, pv - v);
        totalError += error * ref.weight;
        validPoints += ref.weight;
      }
    }
    
    const meanError = validPoints > 0 ? totalError / validPoints : Infinity;
    
    # If error is low enough, consider it solved
    if (meanError < 0.05) { # Less than 5% of image dimension error
      this.calibrationMethod_ = 'reference';
      this.calibrationConfidence_ = Math.max(0, 1 - meanError * 10); // Higher confidence for lower error
      return { success: true, error: meanError };
    }
    
    return { success: false, error: meanError };
  }

  /**
   * Attempts to solve camera parameters using reference lines
   * @returns {{success: boolean, error: number}} - Result of the calibration attempt
   */
  solveFromReferenceLines() {
    if (this.referenceLines_.length < 2) {
      return { success: false, error: Infinity }; // Need at least 2 lines
    }
    
    // Simplified line-based calibration
    // Real implementation would use vanishing points and more complex geometry
    let totalError = 0;
    let validLines = 0;
    
    for (const ref of this.referenceLines_) {
      const [u1, v1] = ref.point1;
      const [u2, v2] = ref.point2;
      
      // Project both endpoints
      // For simplicity, we'll assume these lie on a ground plane at y=0
      // In reality, we'd need to solve for both position and orientation
      
      // Skip line calibration for now - this is a complex operation
      // that would require iterative optimization
    }
    
    // Placeholder implementation
    if (validLines > 0) {
      const meanError = totalError / validLines;
      if (meanError < 0.1) {
        this.calibrationMethod_ = 'reference_lines';
        this.calibrationConfidence_ = Math.max(0, 1 - meanError * 5);
        return { success: true, error: meanError };
      }
    }
    
    return { success: false, error: Infinity };
  }

  /**
   * Sets camera from EXIF data (if available)
   * @param {Object} exifData - EXIF data from image
   * @returns {boolean} - True if EXIF data was used
   */
  setFromEXIF(exifData) {
    if (this.isLocked) return false;
    
    # Extract focal length and calculate FOV
    # This is highly simplified - real EXIF parsing is complex
    const focalLength = exifData?.FocalLength || exifData?.FocalLengthIn35mmFilm;
    if (focalLength) {
      # Assume 35mm film width (36mm) for conversion
      const sensorWidth = 36; # mm
      const focalLength35mm = typeof focalLength === 'number' ? focalLength : 
                             (Array.isArray(focalLength) ? focalLength[0] : 35);
      
      # Calculate FOV: 2 * arctan(sensorWidth / (2 * focalLength))
      const fovX = 2 * Math.atan(sensorWidth / (2 * focalLength35mm)) * 180 / Math.PI;
      
      # Assume typical aspect ratio to get vertical FOV
      const aspect = this.imageWidth / this.imageHeight;
      const fovY = fovX / aspect;
      
      this.setFOV(fovY);
      this.camera.provenance = 'EXIF';
      this.calibrationMethod = 'exif';
      this.calibrationConfidence = 0.6; # EXIF is moderately reliable
      return true;
    }
    
    return false;
  }

  /**
   * Sets camera from provider data (Depth Anything, etc.)
   * @param {Object} providerData - Camera data from depth provider
   * @returns {boolean} - True if provider data was used
   */
  setFromProvider(providerData) {
    if (this.isLocked) return false;
    
    # Try to extract camera parameters from provider data
    # This depends on the specific provider format
    
    if (providerData?.camera) {
      const cam = providerData.camera;
      
      # Set intrinsics if available
      if (cam.fx && cam.fy && cam.width && cam.height) {
        # Calculate FOV from focal length
        # fov = 2 * arctan(0.5 * sensor_size / focal_length)
        # Assuming sensor size matches image size for simplicity
        const fovX = 2 * Math.atan(0.5 * cam.width / cam.fx) * 180 / Math.PI;
        const fovY = 2 * Math.atan(0.5 * cam.height / cam.fy) * 180 / Math.PI;
        
        # Use vertical FOV
        this.setFOV(fovY);
        
        # Set principal point
        this.setPrincipalPoint([
          clamp(cam.cx / cam.width, 0, 1),
          clamp(cam.cy / cam.height, 0, 1)
        ]);
      }
      
      # Set extrinsics if available (position and rotation)
      if (cam.extrinsics && Array.isArray(cam.extrinsics) && cam.extrinsics.length >= 16) {
        # Extract translation and rotation from 4x4 matrix
        # This is simplified - real implementation would decompose the matrix properly
        const [m00, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, m13, m14, m15] = cam.extrinsics;
        
        # Translation components (last column)
        this.setPosition([m12, m13, m14]);
        
        # For rotation, we'd need to extract from the upper 3x3 matrix
        # Simplified approach: assume no rotation for now
        this.setRotation([0, 0, 0]);
      }
      
      this.camera.provenance = 'PROVIDER';
      this.calibrationMethod = 'provider';
      this.calibrationConfidence = 0.8; # Provider data is usually reliable
      return true;
    }
    
    return false;
  }

  /**
   * Gets the current calibration status
   * @returns {Object} - Calibration status information
   */
getCalibrationStatus() {
    return {
      method: this.calibrationMethod_,
      confidence: this.calibrationConfidence_,
      isLocked: this.isLocked,
      referencePoints: this.referencePoints_.length,
      referenceLines: this.referenceLines_.length,
      camera: {
        position: this.getPosition(),
        rotationDegrees: this.getRotationDegrees(),
        fovY: this.getFOV(),
        principalPoint: this.getPrincipalPoint(),
        lens: this.getLensDistortion(),
        provenance: this.camera.provenance,
        confidence: this.camera.confidence
      }
    };
  }
  }

  /**
   * Applies the current camera to a world coordinate
   * Useful for testing where a point would project in the image
   * @param {[number, number, number]} worldPoint - Point in world space
   * @returns {[number, number]} - Normalized image coordinates [u, v] or null
   */
  worldToImagePoint(worldPoint) {
    return this.camera.worldToImage(worldPoint);
  }

  /**
   * Gets a ray from the camera through image coordinates
   * @param {[number, number]} uv - Normalized image coordinates [u, v] (0-1)
   * @returns {[number, number, number]} - Ray direction [x, y, z] or null
   */
  getRayThroughPoint(uv) {
    return this.camera.getRayDirection(uv[0], uv[1]);
  }

  /**
   * Calculates where a ray intersects a plane
   * @param {[number, number, number]} rayOrigin - Origin of ray
   * @param {[number, number, number]} rayDir - Direction of ray (normalized)
   * @param {[number, number, number]} planePoint - Point on plane
   * @param {[number, number, number]} planeNormal - Normal of plane (normalized)
   * @returns {[number, number, number]} - Intersection point or null if parallel
   */
  intersectRayPlane(rayOrigin, rayDir, planePoint, planeNormal) {
    const denom = planeNormal[0] * rayDir[0] + planeNormal[1] * rayDir[1] + planeNormal[2] * rayDir[2];
    
    if (Math.abs(denom) < EPS) {
      return null; # Ray is parallel to plane
    }
    
    const diff = [
      planePoint[0] - rayOrigin[0],
      planePoint[1] - rayOrigin[1],
      planePoint[2] - rayOrigin[2]
    ];
    
    const t = (planeNormal[0] * diff[0] + planeNormal[1] * diff[1] + planeNormal[2] * diff[2]) / denom;
    
    if (t < 0) {
      return null; # Intersection is behind ray origin
    }
    
    return [
      rayOrigin[0] + t * rayDir[0],
      rayOrigin[1] + t * rayDir[1],
      rayOrigin[2] + t * rayDir[2]
    ];
  }
}

/**
 * Helper functions for reverse-viewfinder workflow
 */
export const ReverseViewfinderHelper = {
  /**
   * Suggests initial camera position based on image analysis
   * @param {number} imageWidth - Width of image in pixels
   * @param {number} imageHeight - Height of image in pixels
   * @param {string} sceneType - Type of scene ('indoor', 'outdoor', 'architectural')
   * @returns {{position: [number, number, number], rotation: [number, number, number], fovY: number}} - Suggested camera parameters
   */
  suggestInitialCamera(imageWidth, imageHeight, sceneType = 'indoor') {
    # Simple heuristic based on image aspect ratio and scene type
    const aspect = imageWidth / imageHeight;
    
    # Default settings
    let fovY = 60; # degrees
    let height = 1.7; # eye level height
    let distanceFromWall = 2.0; # meters from wall
    
    # Adjust based on scene type
    if (sceneType === 'architectural') {
      fovY = 75; # Wider FOV for architecture
      distanceFromWall = 1.5;
    } else if (sceneType === 'outdoor') {
      fovY = 50; # Narrower FOV for outdoor scenes
      height = 1.6;
      distanceFromWall = 5.0;
    }
    
    # Calculate position assuming we're looking at a wall straight ahead
    # Camera at (0, height, -distanceFromWall) looking at origin
    const position = [0, height, -distanceFromWall];
    const rotation = [0, 0, 0]; # Looking straight ahead (no rotation)
    
    return { position, rotation, fovY };
  },

  /**
   * Calculates the reprojection error for a set of points
   * @param {PhotoCamera} camera - Camera to test
   * @param {Array<{image: [number, number], world: [number, number, number]}>} points - Correspondences
   * @returns {number} - Mean reprojection error in pixels
   */
  calculateReprojectionError(camera, points) {
    if (points.length === 0) return 0;
    
    let totalError = 0;
    let validPoints = 0;
    
    for (const point of points) {
      const projected = camera.worldToImage(point.world);
      if (projected) {
        const error = Math.hypot(
          projected[0] - point.image[0],
          projected[1] - point.image[1]
        );
        totalError += error;
        validPoints++;
      }
    }
    
    return validPoints > 0 ? totalError / validPoints : Infinity;
  },

  /**
   * Applies radial lens distortion to normalized coordinates
   * @param {[number, number]} uv - Normalized coordinates [u, v] (-1 to 1 range)
   * @param {{k1: number, k2: number}} lens - Lens distortion parameters
   * @returns {[number, number]} - Distorted coordinates
   */
  applyLensDistortion(uv, lens) {
    const [u, v] = uv;
    const r2 = u * u + v * v;
    const distortion = 1 + lens.k1 * r2 + lens.k2 * (r2 * r2);
    return [u * distortion, v * distortion];
  },

  /**
   * Removes radial lens distortion from normalized coordinates
   * @param {[number, number]} uv - Normalized coordinates [u, v] (-1 to 1 range)
   * @param {{k1: number, k2: number}} lens - Lens distortion parameters
   * @returns {[number, number]} - Undistorted coordinates (approximate)
   */
  removeLensDistortion(uv, lens) {
    # This is an approximation - true removal requires solving a polynomial
    # For small distortions, this iterative approach works well
    let [u, v] = uv;
    let u2 = u * u;
    let v2 = v * v;
    let r2 = u2 + v2;
    
    # Iterative distortion removal (usually converges in 2-3 iterations)
    for (let i = 0; i < 5; i++) {
      const distortion = 1 + lens.k1 * r2 + lens.k2 * (r2 * r2);
      const udist = u / distortion;
      const vdist = v / distortion;
      
      # Check for convergence
      if (Math.abs(udist - u) < EPS && Math.abs(vdist - v) < EPS) {
        break;
      }
      
      u = udist;
      v = vdist;
      u2 = u * u;
      v2 = v * v;
      r2 = u2 + v2;
    }
    
    return [u, v];
  },

  /**
   * Converts pixel coordinates to normalized image coordinates
   * @param {[number, number]} pixel - Pixel coordinates [x, y]
   * @param {[number, number]} imageSize - Image size [width, height]
   * @returns {[number, number]} - Normalized coordinates [u, v] (0-1 range)
   */
  pixelToNormalized(pixel, imageSize) {
    const [x, y] = pixel;
    const [width, height] = imageSize;
    return [x / width, y / height];
  },

  /**
   * Converts normalized image coordinates to pixel coordinates
   * @param {[number, number]} uv - Normalized coordinates [u, v] (0-1 range)
   * @param {[number, number]} imageSize - Image size [width, height]
   * @returns {[number, number]} - Pixel coordinates [x, y]
   */
  normalizedToPixel(uv, imageSize) {
    const [u, v] = uv;
    const [width, height] = imageSize;
    return [Math.round(u * width), Math.round(v * height)];
  }
};

export { ReverseViewfinderCalibrator, ReverseViewfinderHelper };