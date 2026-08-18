// Simple test to verify basic functionality works
import { PhotoCamera } from './runtime/photo-first-reconstruction.mjs';

console.log('Testing PhotoCamera...');

const camera = new PhotoCamera();
console.log('Camera created:', camera.position);

// Set position directly
camera.position = [1, 2, 3];
console.log('Position set:', camera.position);

// Set rotation directly (in radians)
camera.rotation = [10 * Math.PI / 180, 20 * Math.PI / 180, 30 * Math.PI / 180];
console.log('Rotation set (degrees):', camera.rotation.map(r => r * 180 / Math.PI));

camera.fovY = 75;
console.log('FOV set:', camera.fovY);

console.log('Basic PhotoCamera test completed successfully');