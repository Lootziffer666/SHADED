// SHADED — Phase 1 operator registration (texture pipeline)
// Registers the four texture operators in the OperatorRegistry so the
// experiment system can schedule, audit, and benchmark them.
import { OperatorRegistry } from '../core.js';
import { TEXTURE_OPERATORS } from './texture.js';

export function registerTextureOperators(registry = new OperatorRegistry()) {
  const meta = [
    {
      id: 'TextureStationarizer',
      version: '1.0.0',
      description: 'Turn a photographed patch into a tileable texture via seam feathering',
      category: 'texture',
      inputs: ['rgb_patch', 'mask', 'camera_pose'],
      outputs: ['tileable_texture', 'stationarization_metadata'],
      parameters: { feather: { type: 'number', default: 16 } },
      defaultParameters: { feather: 16 },
      dependencies: ['DepthProvider.DA3'],
      supportedSceneTypes: ['multi_rgb', 'single_rgb'],
      runtime: { cpu: true, gpu: false, memory: '2GB' },
      license: 'IMPLEMENT',                       // paper-only; re-implemented
      licenseUrl: '',
      commercialUse: true,
      substitutes: ['manual_texture_cleanup'],
      rescues: [],
      synergies: ['MultiViewTextureFuser', 'PaletteNormalizer'],
      negativeContributions: [],
      experimentRequired: true,
      priority: 0,
      impl: TEXTURE_OPERATORS.TextureStationarizer
    },
    {
      id: 'MultiViewTextureFuser',
      version: '1.0.0',
      description: 'Fuse multiple patches of the same surface (exposure alignment + average)',
      category: 'texture',
      inputs: ['rgb_patch[]'],
      outputs: ['fused_texture'],
      parameters: {},
      defaultParameters: {},
      dependencies: ['TextureStationarizer'],
      supportedSceneTypes: ['multi_rgb'],
      runtime: { cpu: true, gpu: false, memory: '4GB' },
      license: 'SAFE',                           // paper + code MIT
      licenseUrl: 'https://arxiv.org/abs/2103.15497',
      commercialUse: true,
      substitutes: [],
      rescues: ['single_view_texture'],
      synergies: ['TextureStationarizer', 'PaletteNormalizer'],
      negativeContributions: [],
      experimentRequired: true,
      priority: 0,
      impl: TEXTURE_OPERATORS.MultiViewTextureFuser
    },
    {
      id: 'PaletteNormalizer',
      version: '1.0.0',
      description: 'Cluster material colors (k-means in linear RGB) and quantize to a canonical palette',
      category: 'texture',
      inputs: ['tileable_texture[]'],
      outputs: ['normalized_texture', 'palette'],
      parameters: { numColors: { type: 'number', default: 4 } },
      defaultParameters: { numColors: 4 },
      dependencies: ['TextureStationarizer'],
      supportedSceneTypes: ['multi_rgb', 'single_rgb'],
      runtime: { cpu: true, gpu: false, memory: '1GB' },
      license: 'IMPLEMENT',                       // paper-only; extends intrinsic
      licenseUrl: '',
      commercialUse: true,
      substitutes: ['manual_palette'],
      rescues: [],
      synergies: ['MaterialExtractor', 'EmissiveSeparator'],
      negativeContributions: [],
      experimentRequired: true,
      priority: 0,
      impl: TEXTURE_OPERATORS.PaletteNormalizer
    },
    {
      id: 'EmissiveSeparator',
      version: '1.0.0',
      description: 'Split base color from self-lit (high linear-luminance) pixels',
      category: 'texture',
      inputs: ['tileable_texture'],
      outputs: ['baseColor', 'emissiveMask', 'emissiveColor'],
      parameters: { threshold: { type: 'number', default: 0.85 } },
      defaultParameters: { threshold: 0.85 },
      dependencies: ['PaletteNormalizer'],
      supportedSceneTypes: ['multi_rgb', 'single_rgb'],
      runtime: { cpu: true, gpu: false, memory: '1GB' },
      license: 'IMPLEMENT',
      licenseUrl: '',
      commercialUse: true,
      substitutes: [],
      rescues: [],
      synergies: ['PaletteNormalizer', 'StylizedRenderer'],
      negativeContributions: [],
      experimentRequired: true,
      priority: 0,
      impl: TEXTURE_OPERATORS.EmissiveSeparator
    }
  ];

  for (const m of meta) registry.register(m);
  return registry;
}

export default registerTextureOperators;
