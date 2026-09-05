// -----------------------------------------------------------------------------
// snowSandbox — the read side of the world sandbox's live dune field.
//
// Edge-faded authority via snowDeform's `deformFalloff`, reused directly —
// that part is generic (just a distance-from-centre test) and doesn't care
// how the buffer is addressed. The UV mapping is its own function, though:
// `deformUV` assumes a toroidal buffer that's continuously scrolled on the
// GPU so world position 0 always lands on the same texel regardless of the
// window's centre. This buffer is nothing like that — the sandbox's window
// re-centres with a hard reset, a fresh patch each time, so its UV has to be
// taken *relative to the current centre* instead.
//
// The buffer itself comes from the CPU-side cellular sandbox simulation
// (world-sandbox-reference.mjs), uploaded once a frame as a plain texture
// rather than simulated on the GPU. Height and the ground's own colour are
// packed into one RGBA texel (R = height delta in metres, GBA = colour) so
// every consumer reads one fetch instead of juggling two buffers.
//
// Consumed by the same three places snowDeform is: the beauty vertex shader
// (displacement), the shadow-depth and prepass vertex shaders (so a dune casts
// its own shadow and shows up correctly in AO instead of acne-ing against a
// surface it isn't drawing), and the beauty fragment shader (the sand
// material blend). All three vertex shaders must agree on the height exactly,
// for the same reason snowDeform's three consumers do.
//
// This is what actually *replaces* the ground rather than laying a second
// surface over it or cutting the first one away: there is only ever the one
// clipmap mesh, and within the window it samples different data.
// -----------------------------------------------------------------------------

/// World XZ → this buffer's UV, centred on the window's current origin (not
/// toroidal — see the note above). The sampler should be in clamp mode:
/// `deformFalloff` reaches 0 well before the UV would leave [0, 1], so
/// nothing ever samples the wrapped edge, but clamping is the safe default
/// regardless.
fn sandboxUV(worldXZ: vec2f, centre: vec2f, size: f32) -> vec2f {
    return (worldXZ - centre) / size + vec2f(0.5, 0.5);
}

/// Manual bilinear sample. `tex`'s sampler is NEAREST — WebGPU's rgba32float
/// format isn't filterable by default, so a linear sampler on it is a
/// validation error, not a graceful fallback — so this does the blend by
/// hand instead: four nearest taps around the sample point, lerped by the
/// fractional texel position. Reads identically to hardware bilinear on the
/// GPU side and doesn't care what sampler type is actually bound.
///
/// Not optional polish: without this, every consumer sees this 64² grid's
/// raw ~1.25 m cells as hard blocks — hugely visible on the colour it feeds
/// into the terrain's albedo, since colorForCell swings from near-black
/// bedrock to stark white snow between neighbouring cells.
fn sandboxSampleBilinear(tex: texture_2d<f32>, samp: sampler, uv: vec2f) -> vec4f {
    let dims = vec2f(textureDimensions(tex));
    let texel = uv * dims - vec2f(0.5, 0.5);
    let i0 = floor(texel);
    let f = texel - i0;
    let invDims = vec2f(1.0, 1.0) / dims;
    let uv00 = (i0 + vec2f(0.5, 0.5)) * invDims;

    let s00 = textureSampleLevel(tex, samp, uv00, 0.0);
    let s10 = textureSampleLevel(tex, samp, uv00 + vec2f(invDims.x, 0.0), 0.0);
    let s01 = textureSampleLevel(tex, samp, uv00 + vec2f(0.0, invDims.y), 0.0);
    let s11 = textureSampleLevel(tex, samp, uv00 + invDims, 0.0);

    let sx0 = mix(s00, s10, f.x);
    let sx1 = mix(s01, s11, f.x);
    return mix(sx0, sx1, f.y);
}

/// Height delta in metres, already faded to 0 outside the window by
/// `deformFalloff`.
fn sandboxHeight(
    tex: texture_2d<f32>, samp: sampler,
    worldXZ: vec2f, centre: vec2f, size: f32
) -> f32 {
    if (size <= 0.0) { return 0.0; }
    let w = deformFalloff(worldXZ, centre, size);
    if (w <= 0.0) { return 0.0; }
    let uv = sandboxUV(worldXZ, centre, size);
    return sandboxSampleBilinear(tex, samp, uv).r * w;
}
