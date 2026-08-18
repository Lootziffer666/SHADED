// DepthAnythingUtils.ts
// Utility functions for processing depth maps from Depth Anything inference

/**
 * Normalizes depth map to [0,1] range for visualization
 * @param depth - Raw depth map from inference
 * @param method - Normalization method ('percentile', 'minmax', 'clamp')
 * @param params - Method-specific parameters
 * @returns Normalized depth map in [0,1] range
 */
export function normalizeDepth(
    depth: Float32Array,
    method: 'percentile' | 'minmax' | 'clamp' = 'percentile',
    params: {
        percentileLow?: number;   // Default: 2
        percentileHigh?: number;  // Default: 98
        minVal?: number;          // For minmax method
        maxVal?: number;          // For minmax method
        clampMin?: number;        // Default: 0.1
        clampMax?: number;        // Default: 10.0
    } = {}
): Float32Array {
    const result = new Float32Array(depth.length);
    const {
        percentileLow = 2,
        percentileHigh = 98,
        minVal = 0,
        maxVal = 10,
        clampMin = 0.1,
        clampMax = 10.0
    } = params;
    
    if (method === 'percentile') {
        // Filter out invalid values (NaN, Infinity)
        const validValues = depth.filter(val => 
            !isNaN(val) && 
            !isFinite(val) === false && 
            val !== null && 
            val !== undefined
        );
        
        if (validValues.length === 0) {
            return result; // Return zeros if no valid values
        }
        
        // Sort to compute percentiles
        const sorted = [...validValues].sort((a].sort((a, b) => a - b);
        const lowIndex = Math.floor((percentileLow / 100) * sorted.length);
        const highIndex = Math.ceil((percentileHigh / 100) * sorted.length);
        
        const lowVal = sorted[Math.max(0, lowIndex)];
        const highVal = sorted[Math.min(sorted.length - 1, highIndex)];
        
        // Avoid division by zero
        const range = Math.max(highVal - lowVal, 1e-6);
        
        for (let i = 0; i < depth.length; i++) {
            let val = depth[i];
            // Clamp invalid values to range
            if (!isFinite(val) || isNaN(val)) {
                val = (lowVal + highVal) / 2;
            }
            // Clamp to percentile range
            val = Math.max(lowVal, Math.min(highVal, val));
            // Normalize to [0,1]
            result[i] = (val - lowVal) / range;
        }
    } else if (method === 'minmax') {
        const range = Math.max(maxVal - minVal, 1e-6);
        for (let i = 0; i < depth.length; i++) {
            let val = depth[i];
            if (!isFinite(val) || isNaN(val)) {
                val = (minVal + maxVal) / 2;
            }
            val = Math.max(minVal, Math.max(maxVal, val));
            result[i] = (val - minVal) / range;
        }
    } else if (method === 'clamp') {
        const range = Math.max(clampMax - clampMin, 1e-6);
        for (let i = 0; i < depth.length; i++) {
            let val = depth[i];
            if (!isFinite(val) || isNaN(val)) {
                val = (clampMin + clampMax) / 2;
            }
            val = Math.max(clampMin, Math.min(clampMax, val));
            result[i] = (val - clampMin) / range;
        }
    }
    
    return result;
}

/**
 * Converts normalized depth map to grayscale ImageData for display
 * @param depthNorm - Normalized depth map [0,1]
 * @param width - Image width
 * @param height - Image height
 * @param invert - Whether to invert (true = near=black, false = near=white)
 * @returns ImageData suitable for putting on canvas
 */
export function depthToGrayscaleImageData(
    depthNorm: Float32Array,
    width: number,
    height: number,
    invert: boolean = false
): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let val = depthNorm[y * width + x];
            
            // Clamp to [0,1] just in case
            val = Math.max(0, Math.min(1, val));
            
            // Invert if needed (typical depth maps: near = dark, far = light)
            if (invert) {
                val = 1.0 - val;
            }
            
            const gray = Math.round(val * 255);
            data[idx] = gray;     // R
            data[idx+1] = gray;   // G
            data[idx+2] = gray;   // B
            data[idx+3] = 255;    // A (opaque)
        }
    }
    
    return new ImageData(data, width, height);
}

/**
 * Creates a color-mapped depth map for better visualization
 * Uses a cool-warm color map (blue = far, red = near)
 * @param depthNorm - Normalized depth map [0,1]
 * @param width - Image width
 * @param height - Image height
 * @returns ImageData with color mapping
 */
export function depthToColorImageData(
    depthNorm: Float32Array,
    width: number,
    height: number
): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let val = depthNorm[y * width + x];
            
            // Clamp to [0,1]
            val = Math.max(0, Math.min(1, val));
            
            // Cool-warm color map: blue (far) to red (near)
            // Blue: (0, 0, 255) to Red: (255, 0, 0)
            // Green stays at 0 for simplicity
            const blue = Math.round((1.0 - val) * 255);
            const red = Math.round(val * 255);
            const green = 0;
            
            data[idx] = red;     // R
            data[idx+1] = green; // G
            data[idx+2] = blue;  // B
            data[idx+3] = 255;   // A
        }
    }
    
    return new ImageData(data, width, height);
}

/**
 * Applies a bilateral filter to reduce noise while preserving edges
 * @param depth - Depth map to filter
 * @param width - Image width
 * @param height - Image height
 * @param diameter - Filter diameter (pixel radius)
 * @param sigmaDepth - Depth standard deviation for threshold
 * @param sigmaSpace - Spatial standard deviation for weight
 * @returns Filtered depth map
 */
export function bilateralFilterDepth(
    depth: Float32Array,
    width: number,
    height: number,
    diameter: number = 5,
    sigmaDepth: number = 0.1,
    sigmaSpace: number = 3.0
): Float32Array {
    const result = new Float32Array(depth.length);
    const radius = Math.floor(diameter / 2);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let weightSum = 0;
            const centerIdx = y * width + x;
            const centerDepth = depth[centerIdx];
            
            for (let ky = -radius; ky <= radius; ky++) {
                for (let kx = -radius; kx <= radius; kx++) {
                    const sampleX = Math.max(0, Math.min(width - 1, x + kx));
                    const sampleY = Math.max(0, Math.min(height - 1, y + ky));
                    const sampleIdx = sampleY * width + sampleX;
                    
                    if (!isFinite(depth[sampleIdx])) {
                        continue;
                    }
                    
                    // Spatial distance
                    const dx = sampleX - x;
                    const dy = sampleY - y;
                    const distSpatial = dx * dx + dy * dy;
                    
                    // Depth difference
                    const depthDiff = Math.abs(depth[sampleIdx] - centerDepth);
                    
                    // Gaussian weights
                    const weightSpace = Math.exp(-distSpatial / (2 * sigmaSpace * sigmaSpace));
                    const weightDepth = Math.exp(-(depthDiff * depthDiff) / (2 * sigmaDepth * sigmaDepth));
                    const weight = weightSpace * weightDepth;
                    
                    sum += depth[sampleIdx] * weight;
                    weightSum += weight;
                }
            }
            
            result[y * width + x] = weightSum > 0 ? sum / weightSum : depth[centerIdx];
        }
    }
    
    return result;
}

/**
 * Computes basic statistics of a depth map
 * @param depth - Depth map to analyze
 * @returns Statistics object
 */
export function computeDepthStatistics(depth: Float32Array): {
    min: number;
    max: number;
    mean: number;
    median: number;
    std: number;
    validCount: number;
    totalCount: number;
} {
    // Filter valid values
    const validValues = depth.filter(val => 
        isFinite(val) && 
        !isNaN(val) && 
        val !== null && 
        val !== undefined
    );
    
    const totalCount = depth.length;
    const validCount = validValues.length;
    
    if (validCount === 0) {
        return {
            min: 0,
            max: 0,
            mean: 0,
            median: 0,
            std: 0,
            validCount: 0,
            totalCount: totalCount
        };
    }
    
    // Basic statistics
    const min = Math.min(...validValues);
    const max = Math.max(...validValues);
    const sum = validValues.reduce((acc, val) => acc + val, 0);
    const mean = sum / validCount;
    
    // Median
    const sorted = [...validValues].sort((a, b) => a - b);
    const median = validCount % 2 === 0
        ? (sorted[validCount/2 - 1] + sorted[validCount/2]) / 2
        : sorted[Math.floor(validCount/2)];
    
    // Standard deviation
    const variance = validValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / validCount;
    const std = Math.sqrt(variance);
    
    return {
        min,
        max,
        mean,
        median,
        std,
        validCount,
        totalCount
    };
}

/**
 * Resizes an ImageData object to new dimensions
 * @param imageData - Input ImageData
 * @param newWidth - New width
 * @param newHeight - New height
 * @returns Resized ImageData
 */
export function resizeImageData(
    imageData: ImageData,
    newWidth: number,
    newHeight: number
): ImageData {
    // Create temporary canvas for resizing
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get canvas 2D context');
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Create output canvas
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = newWidth;
    outputCanvas.height = newHeight;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
        throw new Error('Could not get output canvas 2D context');
    }
    
    // Draw scaled image
    outputCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, newWidth, newHeight);
    
    // Get resized image data
    return outputCtx.getImageData(0, 0, newWidth, newHeight);
}

/**
 * Converts ImageData to depth map Float32Array
 * Assumes grayscale or uses red channel for depth
 * @param imageData - Input ImageData (grayscale or RGB)
 * @returns Depth map as Float32Array
 */
export function imageDataToDepthMap(imageData: ImageData): Float32Array {
    const depth = new Float32Array(imageData.width * imageData.height);
    
    for (let i = 0; i < imageData.data.length; i += 4) {
        // Use red channel as depth value (assuming grayscale or red-encoded depth)
        const normalized = imageData.data[i] / 255.0;
        depth[i/4] = normalized;
    }
    
    return depth;
}

/**
 * Validates that a depth map contains reasonable values
 * @param depth - Depth map to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateDepthMap(
    depth: Float32Array,
    options: {
        minValidDepth?: number;   // Default: 0.01 (1cm)
        maxValidDepth?: number;   // Default: 100.0 (100m)
        maxInvalidRatio?: number; // Default: 0.5 (50%)
    } = {}
): {
    isValid: boolean;
    issues: string[];
    stats: ReturnType<typeof computeDepthStatistics>;
} {
    const {
        minValidDepth = 0.01,
        maxValidDepth = 100.0,
        maxInvalidRatio = 0.5
    } = options;
    
    const stats = computeDepthStatistics(depth);
    const issues: string[] = [];
    
    // Check if we have enough valid data
    if (stats.validCount === 0) {
        issues.push('No valid depth values found');
        return { isValid: false, issues, stats };
    }
    
    // Check validity ratio
    const validityRatio = stats.validCount / stats.totalCount;
    if (validityRatio < (1.0 - maxInvalidRatio)) {
        issues.push(`Too many invalid values: ${((1.0 - validityRatio) * 100).toFixed(1)}% invalid`);
    }
    
    // Check range
    if (stats.min < minValidDepth) {
        issues.push(`Depth values too small (min: ${stats.min.toFixed(3)}m, expected ≥ ${minValidDepth}m)`);
    }
    
    if (stats.max > maxValidDepth) {
        issues.push(`Depth values too large (max: ${stats.max.toFixed(3)}m, expected ≤ ${maxValidDepth}m)`);
    }
    
    // Check for suspicious uniform values (could indicate failure)
    if (stats.max - stats.min < 0.001 && stats.validCount > 10) {
        issues.push('Depth map appears to be nearly uniform -可能 indicates inference failure');
    }
    
    return {
        isValid: issues.length === 0,
        issues,
        stats
    };
}