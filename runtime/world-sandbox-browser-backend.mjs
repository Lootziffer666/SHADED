// Browser render backend selection for the world sandbox.
// This module knows canvases and WebGPU/Canvas2D, but still knows nothing about UI structure.

import {WebGpuWorldSandbox} from './world-sandbox-webgpu.mjs';
import {CpuCanvasWorldSandboxBackend} from './world-sandbox-cpu-backend.mjs';

export class BrowserWorldSandboxBackend {
  static async create(canvas, options = {}) {
    const wrapper = new BrowserWorldSandboxBackend(canvas, options);
    await wrapper.initialize();
    return wrapper;
  }

  constructor(canvas, options = {}) {
    if (!canvas?.getContext) throw new TypeError('A canvas-like render target is required');
    this.canvas = canvas;
    this.options = options;
    this.mobile = !!options.mobile;
    this.onQuery = options.onQuery || (() => {});
    this.onError = options.onError || (() => {});
    this.replaceCanvas = options.replaceCanvas || null;
    this.preferWebGPU = options.preferWebGPU !== false;
    this.backend = null;
    this.kind = '';
    this.lastError = null;
  }

  async initialize() {
    if (this.preferWebGPU) {
      try {
        this.backend = await WebGpuWorldSandbox.create(this.canvas, {
          mobile: this.mobile,
          size: this.options.gpuSize,
          particleCount: this.options.gpuParticleCount,
          onQuery: query => this.onQuery(query),
          onError: error => this.activateCpuFallback(error),
        });
        this.kind = 'webgpu';
        return this;
      } catch (error) {
        this.lastError = error;
      }
    }
    this.activateCpuFallback(this.lastError || new Error('WebGPU disabled'));
    return this;
  }

  activateCpuFallback(error) {
    this.lastError = error || this.lastError;
    this.backend?.destroy?.();

    let target = this.canvas;
    try {
      this.backend = new CpuCanvasWorldSandboxBackend(target, {
        mobile: this.mobile,
        size: this.options.cpuSize,
        particleCount: this.options.cpuParticleCount,
        onQuery: query => this.onQuery(query),
        pixelRatio: this.options.pixelRatio,
      });
    } catch (firstError) {
      if (!this.replaceCanvas) {
        const message = 'WebGPU canvas cannot be reused as Canvas2D. Supply replaceCanvas(oldCanvas) to the render host.';
        const fallbackError = new Error(message, {cause: firstError});
        this.onError(fallbackError, {cause: error, fellBack: false});
        throw fallbackError;
      }
      target = this.replaceCanvas(this.canvas);
      if (!target?.getContext) throw new TypeError('replaceCanvas() must return a canvas-like render target');
      this.canvas = target;
      this.backend = new CpuCanvasWorldSandboxBackend(target, {
        mobile: this.mobile,
        size: this.options.cpuSize,
        particleCount: this.options.cpuParticleCount,
        onQuery: query => this.onQuery(query),
        pixelRatio: this.options.pixelRatio,
      });
    }
    this.kind = 'cpu';
    this.onError(error, {fellBack: true, backend: this.kind});
    return this.backend;
  }

  set onQuery(callback) {
    this._onQuery = callback || (() => {});
    if (this.backend) this.backend.onQuery = this._onQuery;
  }

  get onQuery() {
    return this._onQuery;
  }

  reset(...args) { return this.backend.reset(...args); }
  step(...args) { return this.backend.step(...args); }
  render(...args) { return this.backend.render?.(...args); }
  sample(...args) { return this.backend.sample?.(...args); }
  // No growth-agent render/step path on the WebGPU backend yet (CPU reference only, see
  // world-sandbox-cpu-backend.mjs) -- optional chaining makes this a silent no-op there rather
  // than a crash, a named follow-up rather than an invented WebGPU implementation.
  spawnPlant(...args) { return this.backend?.spawnPlant?.(...args); }
  destroy() { return this.backend?.destroy?.(); }

  get world() { return this.backend?.world || null; }
  get size() { return this.backend?.size || 0; }
  get particles() { return this.backend?.particles || null; }
  get plantSnapshot() { return this.backend?.plantSnapshot || []; }
  get label() {
    const label = this.backend?.label || 'WORLD SANDBOX';
    return this.kind === 'cpu' && this.lastError
      ? `${label} · WEBGPU UNAVAILABLE`
      : label;
  }
}
