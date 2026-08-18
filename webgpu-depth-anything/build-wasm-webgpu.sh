#!/bin/bash
# Build script for depth-anything.cpp with WebGPU backend for WASM

set -e  # Exit on any error

echo "Building depth-anything.cpp with WebGPU backend for WASM..."

# Navigate to the depth-anything-work directory
cd "$(dirname "$0")/../depth-anything-work"

# Check if Emscripten is available
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten not found. Please install Emscripten SDK."
    echo "Visit: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Create build directory
mkdir -p build_wasm_webgpu
cd build_wasm_webgpu

# Configure with Emscripten for WebGPU
echo "Configuring build with Emscripten and WebGPU support..."
emcmake cmake .. \
    -DDA_GGML_WEBGPU=ON \
    -DDA_BUILD_CLI=OFF \
    -DDA_SHARED=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_SYSTEM_NAME=Emscripten

# Build the project
echo "Building WebGPU-enabled WASM module..."
cmake --build . -j --target depthanything --config Release

echo "Build completed successfully!"
echo "Generated files:"
ls -la depthanything.js depthanything.wasm depthanything.wasm.js 2>/dev/null || echo "Files not found - checking build output..."

# Show build info
echo ""
echo "Build Information:"
echo "-----------------"
echo "Backend: WebGPU via WASM"
echo "Target: WebAssembly (WASM)"
echo "Optimization: Release"
echo "Model Support: All DA3 models (via GGUF)"
echo ""
echo "Next Steps:"
echo "1. Copy the generated .js and .wasm files to your web server"
echo "2. Use the DepthAnythingBackendSelector class to load and use the module"
echo "3. Process images through the inferDepth() method"