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

/// Height delta in metres, already faded to 0 outside the window by
/// `deformFalloff`. One bilinear tap is enough — the data comes off a coarse
/// ~1.25 m simulation grid, so there is no sub-texel content for a wider
/// filter to protect the way `deformHeight`'s binomial protects a footprint's
/// sharp walls.
fn sandboxHeight(
    tex: texture_2d<f32>, samp: sampler,
    worldXZ: vec2f, centre: vec2f, size: f32
) -> f32 {
    if (size <= 0.0) { return 0.0; }
    let w = deformFalloff(worldXZ, centre, size);
    if (w <= 0.0) { return 0.0; }
    let uv = sandboxUV(worldXZ, centre, size);
    return textureSampleLevel(tex, samp, uv, 0.0).r * w;
}
