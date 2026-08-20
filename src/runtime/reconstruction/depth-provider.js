/* ========================================================================
   SHADED – MonocularDepthProvider (depth-anything.cpp Integration)
   §3 Provider-Vertrag · §7 Tasks · §12 Abnahmekriterien
   Austauschbares Backend unter neutralem Vertrag – nicht an Produktname gebunden.
   ======================================================================== */

'use strict';

class MonocularDepthProvider {
  constructor() {
    this.id = 'reconstruction.depth.monocular.depth-anything-v3';
    this.version = '1.0.0';
    this.providerName = 'depth-anything.cpp (DA3)';
    this.supportedModels = [
      'DA3-SMALL', 'DA3-BASE', 'DA3-LARGE', 'DA3-GIANT',
      'DA3MONO-LARGE', 'DA3METRIC-LARGE', 'DA3NESTED-GIANT-LARGE',
      'Depth-Anything-V2-Small', 'Depth-Anything-V2-Base', 'Depth-Anything-V2-Large',
      'Depth-Anything-V2-Metric-Hypersim-Small', 'Depth-Anything-V2-Metric-Hypersim-Base', 'Depth-Anything-V2-Metric-Hypersim-Large',
      'Depth-Anything-V2-Metric-VKITTI-Small', 'Depth-Anything-V2-Metric-VKITTI-Base', 'Depth-Anything-V2-Metric-VKITTI-Large'
    ];
    this.currentModel = 'DA3-BASE';
    this.quantization = 'q4_k';
    this.backend = 'cpu'; // 'cpu' | 'cuda' | 'metal' | 'vulkan'
    this.threads = navigator.hardwareConcurrency || 4;
    this.inputSize = 518; // DA3 default
    this.isLoaded = false;
    this.worker = null;
    this.wasmModule = null;
    this.modelData = null;
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
  }

  setProgressCallback(cb) { this.onProgress = cb; }
  setCompleteCallback(cb) { this.onComplete = cb; }
  setErrorCallback(cb) { this.onError = cb; }

  // Graceful init used by the engine. Never throws — a missing WASM/model is a
  // benign fallback (gradient depth), not a fatal error.
  async initialize(modelName = this.currentModel, quantization = this.quantization) {
    try {
      const ok = await this.loadModel(modelName, quantization);
      this.isLoaded = ok;
      return ok;
    } catch (e) {
      console.warn('[DepthProvider] initialization skipped (model/WASM unavailable):', e && e.message);
      this.isLoaded = false;
      return false;
    }
  }

  async loadModel(modelName = 'DA3-BASE', quantization = 'q4_k') {
    this.currentModel = modelName;
    this.quantization = quantization;
    const modelUrl = this._getModelUrl(modelName, quantization);

    try {
      this._reportProgress(0, 'Lade Modell...');
      const response = await fetch(modelUrl);
      if (!response.ok) throw new Error(`Modell nicht gefunden: ${modelUrl}`);
      this.modelData = await response.arrayBuffer();
      this._reportProgress(50, 'Initialisiere WASM...');
      await this._initWasm();
      this._reportProgress(80, 'Lade Gewichte...');
      await this._loadWeights();
      this.isLoaded = true;
      this._reportProgress(100, 'Bereit');
      if (this.onComplete) this.onComplete();
      return true;
    } catch (e) {
      this._reportError(e);
      return false;
    }
  }

  _getModelUrl(name, quant) {
    const base = '/models/depth-anything/';
    const map = {
      'DA3-SMALL': `depth-anything-small-${quant}.gguf`,
      'DA3-BASE': `depth-anything-base-${quant}.gguf`,
      'DA3-LARGE': `depth-anything-large-${quant}.gguf`,
      'DA3-GIANT': `depth-anything-giant-${quant}.gguf`,
      'DA3MONO-LARGE': `depth-anything-mono-large-${quant}.gguf`,
      'DA3METRIC-LARGE': `depth-anything-metric-large-${quant}.gguf`,
      'DA3NESTED-GIANT-LARGE': `depth-anything-nested-giant-large-${quant}.gguf`,
      'Depth-Anything-V2-Small': `depth-anything-v2-small-${quant}.gguf`,
      'Depth-Anything-V2-Base': `depth-anything-v2-base-${quant}.gguf`,
      'Depth-Anything-V2-Large': `depth-anything-v2-large-${quant}.gguf`,
      'Depth-Anything-V2-Metric-Hypersim-Small': `depth-anything-v2-metric-hypersim-small-${quant}.gguf`,
      'Depth-Anything-V2-Metric-Hypersim-Base': `depth-anything-v2-metric-hypersim-base-${quant}.gguf`,
      'Depth-Anything-V2-Metric-Hypersim-Large': `depth-anything-v2-metric-hypersim-large-${quant}.gguf`,
      'Depth-Anything-V2-Metric-VKITTI-Small': `depth-anything-v2-metric-vkitti-small-${quant}.gguf`,
      'Depth-Anything-V2-Metric-VKITTI-Base': `depth-anything-v2-metric-vkitti-base-${quant}.gguf`,
      'Depth-Anything-V2-Metric-VKITTI-Large': `depth-anything-v2-metric-vkitti-large-${quant}.gguf`,
    };
    return base + (map[name] || `depth-anything-base-${quant}.gguf`);
  }

  async _initWasm() {
    const wasmUrl = '/wasm/depth-anything.wasm';
    const jsUrl = '/wasm/depth-anything.js';

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = jsUrl;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    if (window.DepthAnything) {
      this.wasmModule = await window.DepthAnything({
        locateFile: () => wasmUrl,
        print: (msg) => console.log('[depth-anything.cpp]', msg),
        printErr: (msg) => console.error('[depth-anything.cpp]', msg),
      });
    } else {
      throw new Error('WASM-Modul konnte nicht geladen werden');
    }
  }

  async _loadWeights() {
    if (!this.wasmModule) throw new Error('WASM nicht initialisiert');
    const ptr = this.wasmModule._malloc(this.modelData.byteLength);
    const heap = new Uint8Array(this.wasmModule.HEAPU8.buffer, ptr, this.modelData.byteLength);
    heap.set(new Uint8Array(this.modelData));
    const result = this.wasmModule._da_load_model(ptr, this.modelData.byteLength, this.threads);
    this.wasmModule._free(ptr);
    if (result !== 0) throw new Error(`Modell-Laden fehlgeschlagen (Code: ${result})`);
  }

  estimateDepth(imageElement, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isLoaded || !this.wasmModule) {
        reject(new Error('Provider nicht bereit'));
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const maxDim = options.maxDimension || 1024;
      let { width, height } = imageElement;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(imageElement, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const inputPtr = this.wasmModule._malloc(width * height * 4);
      const inputHeap = new Uint8Array(this.wasmModule.HEAPU8.buffer, inputPtr, width * height * 4);
      inputHeap.set(imageData.data);

      const depthPtr = this.wasmModule._malloc(width * height * 4);
      const confPtr = this.wasmModule._malloc(width * height * 4);

      const startTime = performance.now();
      const result = this.wasmModule._da_infer(
        inputPtr, width, height,
        depthPtr, confPtr,
        options.returnPose ? 1 : 0,
        options.returnSky ? 1 : 0
      );
      const inferTime = performance.now() - startTime;

      if (result !== 0) {
        this.wasmModule._free(inputPtr);
        this.wasmModule._free(depthPtr);
        this.wasmModule._free(confPtr);
        reject(new Error(`Inferenz fehlgeschlagen (Code: ${result})`));
        return;
      }

      const depthData = new Float32Array(this.wasmModule.HEAPF32.buffer, depthPtr, width * height);
      const confData = new Float32Array(this.wasmModule.HEAPF32.buffer, confPtr, width * height);

      const depthMap = new Float32Array(depthData);
      const confidenceMap = new Float32Array(confData);

      this.wasmModule._free(inputPtr);
      this.wasmModule._free(depthPtr);
      this.wasmModule._free(confPtr);

      resolve({
        depth: depthMap,
        confidence: confidenceMap,
        width,
        height,
        inferenceTimeMs: inferTime,
        model: this.currentModel,
        quantization: this.quantization,
        provenance: 'INFERRED',
        scale: 'relative',
        timestamp: Date.now(),
      });
    });
  }

  estimateDepthFromFile(file, options = {}) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
        URL.revokeObjectURL(url);
        try {
          const result = await this.estimateDepth(img, options);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Bild konnte nicht geladen werden'));
      };
      img.src = url;
    });
  }

  getMetadata() {
    return {
      id: this.id,
      version: this.version,
      providerName: this.providerName,
      currentModel: this.currentModel,
      quantization: this.quantization,
      backend: this.backend,
      threads: this.threads,
      inputSize: this.inputSize,
      supportedModels: this.supportedModels,
      provenance: 'INFERRED',
      scale: 'relative',
      isLoaded: this.isLoaded,
    };
  }

  _reportProgress(pct, msg) {
    if (this.onProgress) this.onProgress(pct, msg);
  }

  _reportError(err) {
    console.error('[MonocularDepthProvider]', err);
    if (this.onError) this.onError(err);
  }

  dispose() {
    if (this.wasmModule) {
      this.wasmModule._da_free();
      this.wasmModule = null;
    }
    this.modelData = null;
    this.isLoaded = false;
  }
}

if (typeof window !== 'undefined') {
  window.MonocularDepthProvider = MonocularDepthProvider;
}

export { MonocularDepthProvider };