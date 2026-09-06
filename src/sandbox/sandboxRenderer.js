/**
 * The Babylon-facing replacement for the old Canvas2D/WebGPU sandbox
 * renderers (see world-sandbox-cpu-backend.mjs's header comment). Reads the
 * same field grid (`FIELD.*`, `colorForCell`) the original renderers read;
 * everything here is new, everything it reads is the revived original.
 *
 * This actually *replaces* the ground within its window — not a second mesh
 * drawn over the real terrain, not a hole cut into it, one continuous clipmap
 * mesh (the real Terrain's own) that samples different data where the
 * sandbox is live. Every frame this class packs its simulation's height
 * delta and ground colour into `sandboxTex`, a small RGBA texture (R = height
 * delta in metres, GBA = colour straight from `colorForCell`), which
 * `Terrain.setSandboxWindow` binds into the beauty, shadow-depth and
 * depth-prepass materials alongside the window's centre and size. Those
 * materials add the height and blend the colour in their own shaders
 * (`snowSandbox` in `src/shaders/lib/sandbox.wgsl`), the exact pattern
 * footprints, the surf wake and every spell already use for
 * `terrain/deformation.js`'s state buffer — a proven single-mesh mechanism,
 * not a new one. A second, smaller texture, `sandboxFieldTex` (R = FIELD.SNOW's
 * own canonical value; see its own comment in `_buildSandboxTexture`), goes
 * only to the beauty material — the renderer-facing auxiliary field container
 * so real field magnitudes (not colour, not a derived proxy) reach the
 * fragment shader's own material-property terms.
 *
 * Height is *also* the real ground for the character: `heightfield.js`'s
 * `heightAt` reads this same delta through an overlay hook
 * (`sampleHeight`/`setOverlaySampler`), so grounding, sliding and digging
 * agree with what's drawn by construction — both read the same
 * `_baseHeight`/`_initialGround` arrays this class already keeps for its own
 * per-cell bookkeeping. That overlay is a pure CPU height query, independent
 * of how the ground is drawn, so it's untouched by any of the above.
 *
 * Its ground is sand, not rock: `createWorldState`'s `terrain: 'desert'`
 * mode (see `WORLD_GEN_OPTIONS`) keeps FIELD.SAND high everywhere, because
 * that's what `colorForCell` actually paints with — dunes are sand, not
 * granite.
 *
 * This class still owns separate meshes for water, vegetation, particles,
 * the rolling stone and the aim cursor — those are real objects sitting on
 * the ground, not a second ground, so they don't have the "two surfaces
 * fighting for the same pixels" problem the old terrain mesh did.
 *
 * The whole point is that this has to work wherever the player actually is,
 * not just in one fixed patch — so the window re-centres on the player once
 * they wander far enough from its middle, the same "follow the player, not
 * the whole map" shape terrain/deformation.js's own deform buffer already
 * uses. Re-centring is a hard reset (a fresh patch generated at the new
 * spot, the old one's marks left behind) rather than a true scroll —
 * simpler, and consistent with every other mark in this world (footprints,
 * wake, spell carving) already being something that fades rather than
 * something that's remembered forever.
 *
 * All seven tools already defined in world-sandbox-runtime.mjs (sand, water,
 * seed, dig, heat, focus, carve) are selectable — see `cycleTool` — through
 * the exact same aim/stroke pipeline `handleInput` already drove for sand
 * alone; the tool only changes which stamp kind that pipeline applies.
 * Sand is the starting surface, matching the ground this actually is.
 * Per-object settings (aim at something placed, adjust just that) are the
 * next step.
 */

// Side-effect import: registers Scene.prototype.createPickingRay, which
// handleInput()'s crosshair ray-march needs — nothing else in this codebase
// creates a picking ray, so nothing else has pulled this in yet.
import "@babylonjs/core/Culling/ray";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";

import { WorldSandboxRuntime } from "./world-sandbox-runtime.mjs";
import { CELL_STRIDE, FIELD, srgbToLinear } from "./world-sandbox-reference.mjs";

const SIZE = 64; // field grid resolution
// 80m — matches terrain/deformation.js's own COVERAGE constant, so the soil
// layer and the snow deformation buffer it sits above cover the same scale.
const WORLD_SPAN = 80; // metres
const HEIGHT_SCALE = 1.6; // metres per normalised height-delta unit
const WATER_HEIGHT_SCALE = 1.1;
// Metres the decorative meshes (water, vegetation, particles, the rolling
// stone) sit above their computed ground height — they're real separate
// objects resting on the ground, not a second ground, so this just keeps
// them from clipping into it visually.
const LIFT = 0.025;
const WATER_THRESHOLD = 0.006;
const VEG_THRESHOLD = 0.02;
const VEG_STEP = 2; // sample every Nth cell for vegetation — 64² would be too many instances
const MAX_VEG = 900;
const MAX_PARTICLES = 600;
/** Metres from the window's centre the player can roam before it re-centres on them. */
const RECENTER_MARGIN = 26;
/** Brush radius (world-sandbox's own 0..0.5 normalised unit) without an analog input driving it
 *  — mouse/keyboard/touch have no pressure signal, so they always get this fixed size. */
const DEFAULT_BRUSH_RADIUS = 0.025;
/** Gamepad trigger pressure maps to this range — see setBrushStrength. */
const MIN_BRUSH_RADIUS = 0.015;
const MAX_BRUSH_RADIUS = 0.06;
/** world-sandbox-reference.mjs's createWorldState() defaults to a generic bedrock-heavy mixed
 *  landscape (mountains/ridges/basins, sand mostly ~0.02-0.05) unless told otherwise — its
 *  colorForCell only reads `sand` for the base tone, so that default reads as dark bare rock, not
 *  dunes. `terrain: 'desert'` switches to generateDunes(), which keeps sand high (up to ~0.26)
 *  everywhere: real wind-shaped dune ridges, sand as the actual mass, not a rock field with a
 *  sand dusting. Dunes are sand. Not granite. */
const WORLD_GEN_OPTIONS = { terrain: "desert", windDeg: 34 };

/** All seven already exist as full tool definitions in world-sandbox-runtime.mjs
 *  (createToolDefinitions) — this is purely the order the player cycles through them in.
 *  Sand first: it's the ground's own default surface, so it's the natural starting tool. */
const TOOL_ORDER = ["sand", "water", "seed", "dig", "heat", "focus", "carve"];
const TOOL_LABELS = {
    sand: "Sand", water: "Water", seed: "Seed",
    dig: "Dig", heat: "Heat", focus: "Focus", carve: "Carve",
};

const _scale = new Vector3();
const _rot = Quaternion.Identity();
const _pos = new Vector3();
const _mat = new Matrix();

export class SandboxRenderer {
    /**
     * @param {import("@babylonjs/core/scene").Scene} scene
     * @param {{heightAt(x:number,z:number):number}} terrain — the real SHADED terrain (src/terrain/terrain.js)
     * @param {{x?:number, z?:number}} [opts] world-space centre of the patch
     */
    constructor(scene, terrain, opts = {}) {
        this.scene = scene;
        this.terrain3d = terrain;
        const cx = opts.x ?? 0;
        const cz = opts.z ?? 0;
        this.origin = new Vector3(cx, terrain.heightAtBase(cx, cz), cz);

        this.runtime = new WorldSandboxRuntime({ cpuSize: SIZE });
        this.runtime.enter();
        // The runtime's own construction-time world defaults to generic mixed terrain — reset
        // straight into an actual dune field before anything reads it.
        const seed = (Math.floor(cx * 131) ^ Math.floor(cz * 131) ^ 0x53484144) >>> 0;
        this.runtime.reset(seed || 1, WORLD_GEN_OPTIONS);
        this._toolIndex = 0; // sand — see TOOL_ORDER
        this.runtime.setTool(TOOL_ORDER[this._toolIndex]);
        this.setBrushStrength(null);
        // Warm desert: comfortably above the melt/freeze thresholds
        // (stepWorldReference's melt/ice terms key off ~0.42-0.46), so any
        // moisture that ever precipitates comes down as rain and any snow
        // would melt straight back off — this is a sand world, and freshly
        // generated ground reads as bare dunes from the first frame.
        this.runtime.setEnvironment({ temperature: 0.65 });

        this._buildSandboxTexture();
        this._buildWater();
        this._buildVegetation();
        this._buildParticles();
        this._buildStone();
        this._buildCursor();
        this._buildToolLabel();
        this._toolLabelText.text = TOOL_LABELS[TOOL_ORDER[this._toolIndex]];

        this._toolWasDown = false;
        this._aiming = false;
        /** Caller's own setVisible() intent -- see that method's comment. */
        this._externallyVisible = true;

        this._updateWorldPositions();
        this._captureBaseline();
        this._refresh();
    }

    // -------------------------------------------------------------- build

    /**
     * The actual ground-replacement channel: a small RGBA float texture (R =
     * height delta in metres, GBA = ground colour 0..1) `Terrain` samples
     * directly in its own clipmap mesh's shaders. No geometry of its own —
     * see the class doc comment for why that's the point.
     */
    _buildSandboxTexture() {
        const size = SIZE;
        const n = size * size;
        this._texData = new Float32Array(n * 4);
        // NEAREST, not bilinear: WebGPU's rgba32float format isn't filterable
        // by default (that needs the optional float32-filterable feature,
        // not something to depend on) — a linear sampler on an unfilterable
        // texture is a validation error, not a graceful fallback. This is
        // the same reason deformation.js's own float32 RawTexture (brushTex)
        // uses NEAREST rather than bilinear; its half-float ping-pong
        // targets get bilinear only because half-float *is* filterable.
        this.sandboxTex = RawTexture.CreateRGBATexture(
            this._texData, size, size, this.scene,
            false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT
        );
        // Clamp, not wrap: the window is a hard-reset patch, not a
        // continuously-scrolled toroidal buffer like deformTex — nothing
        // should ever sample past its edge (deformFalloff reaches 0 first),
        // but clamping is the safe default regardless.
        this.sandboxTex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
        this.sandboxTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

        // Renderer-facing auxiliary field container (EXECUTION_PLAN.md Task 4) -- the first
        // scalar SHADED field (FIELD.SNOW) exposed to the shader as its own real value instead of
        // only baked into `colorForCell`'s colour. R = FIELD.SNOW's canonical value, unmodified;
        // G/B/A are reserved for future independent scalar fields (e.g. FIELD.ICE) needing the
        // same treatment -- packing a channel here later, not building a second texture. Same
        // NEAREST/CLAMP reasoning as sandboxTex above (unfilterable rgba32float, hard-reset
        // window, not a toroidal buffer).
        this._fieldTexData = new Float32Array(n * 4);
        this.sandboxFieldTex = RawTexture.CreateRGBATexture(
            this._fieldTexData, size, size, this.scene,
            false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT
        );
        this.sandboxFieldTex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
        this.sandboxFieldTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

        // Per-cell bookkeeping the height sampling (both the texture upload
        // below and the CPU-side sampleHeight/heightAt overlay) is built
        // from. Filled by _updateWorldPositions()/_captureBaseline() —
        // depends on `origin`, which can change on re-centre.
        this._worldX = new Float32Array(n);
        this._worldZ = new Float32Array(n);
        this._baseHeight = new Float32Array(n);
    }

    _buildWater() {
        const size = SIZE;
        const n = size * size;
        const positions = new Float32Array(n * 3);
        const indices = new Uint32Array((size - 1) * (size - 1) * 6);
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const i = z * size + x;
                positions[i * 3] = (x / (size - 1) - 0.5) * WORLD_SPAN;
                positions[i * 3 + 2] = (z / (size - 1) - 0.5) * WORLD_SPAN;
            }
        }
        let ii = 0;
        for (let z = 0; z < size - 1; z++) {
            for (let x = 0; x < size - 1; x++) {
                const a = z * size + x, b = a + 1, c = a + size, d = c + 1;
                indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
                indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
            }
        }
        const mesh = new Mesh("sandboxWater", this.scene);
        const vd = new VertexData();
        vd.positions = positions;
        vd.indices = indices;
        vd.colors = new Float32Array(n * 4);
        vd.applyToMesh(mesh, true);
        mesh.position.copyFrom(this.origin);
        mesh.isPickable = false;
        mesh.renderingGroupId = 2;

        // No Babylon Light exists anywhere in this scene (terrain and character are lit by their
        // own custom WGSL shaders instead) -- a lit StandardMaterial with nothing to multiply
        // against renders flat black, not its diffuseColor. disableLighting + emissiveColor make
        // this mesh self-illuminating the same way sandboxParticleMat/sandboxCursorMat already are.
        const mat = new StandardMaterial("sandboxWaterMat", this.scene);
        mat.disableLighting = true;
        mat.emissiveColor = new Color3(0.14, 0.42, 0.5);
        mat.hasVertexAlpha = true;
        mat.backFaceCulling = false;
        mesh.material = mat;

        this.water = mesh;
        this._waterPositions = positions;
        this._waterColors = new Float32Array(n * 4);
    }

    _buildVegetation() {
        const cone = MeshBuilder.CreateCylinder(
            "sandboxVeg", { diameterTop: 0, diameterBottom: 0.18, height: 1, tessellation: 5 }, this.scene
        );
        cone.position.copyFrom(this.origin);
        // Same "no scene Light exists" reasoning as sandboxWaterMat above.
        const mat = new StandardMaterial("sandboxVegMat", this.scene);
        mat.disableLighting = true;
        mat.emissiveColor = new Color3(0.16, 0.42, 0.14);
        cone.material = mat;
        cone.renderingGroupId = 1;
        cone.thinInstanceCount = 0;
        this.veg = cone;
        this._vegBuf = new Float32Array(MAX_VEG * 16);
    }

    _buildParticles() {
        const sphere = MeshBuilder.CreateSphere("sandboxParticles", { diameter: 0.09, segments: 4 }, this.scene);
        sphere.position.copyFrom(this.origin);
        const mat = new StandardMaterial("sandboxParticleMat", this.scene);
        mat.diffuseColor = new Color3(0.7, 0.72, 0.6);
        mat.disableLighting = true;
        mat.emissiveColor = new Color3(0.55, 0.55, 0.48);
        sphere.material = mat;
        sphere.renderingGroupId = 2;
        sphere.isPickable = false;
        sphere.thinInstanceCount = 0;
        this.particleMesh = sphere;
        this._particleBuf = new Float32Array(MAX_PARTICLES * 16);
    }

    _buildStone() {
        const sphere = MeshBuilder.CreateSphere("sandboxStone", { diameter: 0.7, segments: 8 }, this.scene);
        // Same "no scene Light exists" reasoning as sandboxWaterMat above.
        const mat = new StandardMaterial("sandboxStoneMat", this.scene);
        mat.disableLighting = true;
        mat.emissiveColor = new Color3(0.35, 0.36, 0.34);
        sphere.material = mat;
        sphere.renderingGroupId = 1;
        sphere.isPickable = false;
        sphere.setEnabled(false);
        this.stone = sphere;
    }

    _buildCursor() {
        const torus = MeshBuilder.CreateTorus("sandboxCursor", { diameter: 1, thickness: 0.02, tessellation: 32 }, this.scene);
        const mat = new StandardMaterial("sandboxCursorMat", this.scene);
        mat.diffuseColor = new Color3(0, 0, 0);
        mat.emissiveColor = new Color3(0.85, 0.9, 0.95);
        mat.disableLighting = true;
        torus.material = mat;
        torus.renderingGroupId = 2;
        torus.isPickable = false;
        torus.setEnabled(false);
        this.cursor = torus;
    }

    /** Floating name of the currently selected tool, shown above the aim cursor. */
    _buildToolLabel() {
        const plane = MeshBuilder.CreatePlane("sandboxToolLabel", { width: 0.5, height: 0.14 }, this.scene);
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.renderingGroupId = 2;
        plane.isPickable = false;
        plane.setEnabled(false);

        const adt = AdvancedDynamicTexture.CreateForMesh(plane, 256, 72, false);
        const text = new TextBlock("sandboxToolLabelText", "");
        text.color = "#eaf4ff";
        text.fontSize = 34;
        text.fontFamily = "ui-sans-serif, system-ui, sans-serif";
        text.outlineWidth = 4;
        text.outlineColor = "#0a1420";
        adt.addControl(text);

        this.toolLabel = plane;
        this._toolLabelText = text;
    }

    /**
     * Switch the active tool by `dir` steps (+1/-1) through TOOL_ORDER, wrapping
     * around. All seven tools already run through the exact same aim/stroke
     * pipeline `handleInput` drives — this only changes which one that pipeline
     * stamps with.
     * @param {number} dir
     */
    cycleTool(dir) {
        const n = TOOL_ORDER.length;
        this._toolIndex = ((this._toolIndex + dir) % n + n) % n;
        const tool = TOOL_ORDER[this._toolIndex];
        this.runtime.setTool(tool);
        this._toolLabelText.text = TOOL_LABELS[tool];
    }

    /** The currently selected tool's name, e.g. "sand". */
    get currentTool() {
        return TOOL_ORDER[this._toolIndex];
    }

    /**
     * Set the brush radius from an analog 0..1 pressure value (gamepad trigger),
     * or pass `null`/`undefined` to fall back to the fixed default mouse/keyboard/
     * touch always get, since none of them carry an actual pressure signal.
     * @param {number|null} [t]
     */
    setBrushStrength(t) {
        const radius =
            t === null || t === undefined
                ? DEFAULT_BRUSH_RADIUS
                : MIN_BRUSH_RADIUS + Math.max(0, Math.min(1, t)) * (MAX_BRUSH_RADIUS - MIN_BRUSH_RADIUS);
        this.runtime.setBrushRadius(radius);
    }

    /**
     * Recompute each cell's world-space X/Z from its fixed local grid offset
     * and the current origin. Called at construction and again on every
     * re-centre.
     */
    _updateWorldPositions() {
        const size = SIZE;
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const i = z * size + x;
                this._worldX[i] = this.origin.x + (x / (size - 1) - 0.5) * WORLD_SPAN;
                this._worldZ[i] = this.origin.z + (z / (size - 1) - 0.5) * WORLD_SPAN;
            }
        }
    }

    /**
     * Sample the real terrain's height at every cell, and record the
     * sandbox field's own starting ground level there too — everything
     * `_refresh` writes into `sandboxTex` each frame is a delta from these
     * two baselines, which is what keeps a fresh patch flush with the real
     * terrain (delta 0) until the simulation actually moves sand.
     */
    _captureBaseline() {
        const n = SIZE * SIZE;
        for (let i = 0; i < n; i++) {
            this._baseHeight[i] = this.terrain3d.heightAtBase(this._worldX[i], this._worldZ[i]);
        }
        const world = this.runtime.world;
        this._initialGround = new Float32Array(n);
        let sum = 0;
        for (let i = 0; i < n; i++) {
            const o = i * CELL_STRIDE;
            const g = world[o + FIELD.BEDROCK] + world[o + FIELD.SAND];
            this._initialGround[i] = g;
            sum += g;
        }
        this._avgInitialGround = sum / n;
    }

    // ------------------------------------------------------------ runtime

    /**
     * @param {number} dt seconds
     * @param {number} [playerX] current player world X — re-centres the
     *   window on the player once they've wandered far enough from its
     *   middle, so the soil layer is live wherever they actually are.
     * @param {number} [playerZ]
     */
    update(dt, playerX, playerZ) {
        if (playerX !== undefined && playerZ !== undefined) {
            const dx = playerX - this.origin.x;
            const dz = playerZ - this.origin.z;
            if (Math.hypot(dx, dz) > RECENTER_MARGIN) this._recenter(playerX, playerZ);
        }
        this.runtime.advance(dt, {});
        this._refresh();
    }

    /**
     * Re-anchor the whole patch on a new world position: a fresh field
     * state (seeded off the new location, so different spots don't all
     * regenerate the same look), the meshes moved to the new origin, and both
     * baselines recaptured against the new origin. A hard cut, not a
     * scroll — see the class doc comment for why that's an acceptable
     * trade for now.
     */
    _recenter(px, pz) {
        this.origin.set(px, this.terrain3d.heightAtBase(px, pz), pz);
        this.water.position.copyFrom(this.origin);
        this.veg.position.copyFrom(this.origin);
        this.particleMesh.position.copyFrom(this.origin);

        this._updateWorldPositions();

        const seed = (Math.floor(px * 131) ^ Math.floor(pz * 131) ^ 0x53484144) >>> 0;
        this.runtime.reset(seed || 1, WORLD_GEN_OPTIONS);

        this._captureBaseline();
        this._refresh();
    }

    /**
     * Find where the crosshair (screen centre, consistent with the
     * pointer-locked camera-look everywhere else in the scene) is aiming at
     * the ground, and drive a tool stroke from it.
     *
     * There's no separate mesh to pick against any more — the ground is the
     * real clipmap terrain, displaced entirely in its own vertex shader, and
     * Babylon's CPU-side picking has no idea that displacement happened (it
     * tests the mesh's raw, undisplaced position buffer, which for this
     * clipmap doesn't even hold real-world coordinates — see
     * snow.vertex.wgsl). So instead this marches the same ray Babylon's own
     * `scene.pick` would build, straight against `terrain3d.heightAt`, the
     * exact analytic height function grounding already trusts — the cursor
     * can never disagree with where the character would actually stand.
     *
     * @param {import("@babylonjs/core/Cameras/camera").Camera} camera
     * @param {boolean} toolDown primary action held this frame
     */
    handleInput(camera, toolDown) {
        const point = this._raymarchGround(camera);
        this._aiming = !!point;

        if (point) {
            const u = (point.x - this.origin.x) / WORLD_SPAN + 0.5;
            const v = (point.z - this.origin.z) / WORLD_SPAN + 0.5;
            this.cursor.setEnabled(true);
            this.cursor.position.set(point.x, point.y + 0.03, point.z);
            this.cursor.scaling.set(this.runtime.state.radius * WORLD_SPAN * 2, 1, this.runtime.state.radius * WORLD_SPAN * 2);
            this.toolLabel.setEnabled(true);
            this.toolLabel.position.set(point.x, point.y + 0.35, point.z);

            if (toolDown && !this._toolWasDown) this.runtime.beginToolStroke(u, v);
            else if (toolDown) this.runtime.continueToolStroke(u, v);
            else if (this._toolWasDown) this.runtime.endToolStroke();
        } else {
            this.cursor.setEnabled(false);
            this.toolLabel.setEnabled(false);
            if (this._toolWasDown) this.runtime.endToolStroke();
        }
        this._toolWasDown = toolDown && !!point;
    }

    /**
     * March the crosshair ray against `terrain3d.heightAt` (coarse fixed
     * steps, refined by bisection once a crossing is found) and return the
     * world-space hit point, or `null` if nothing was crossed within range.
     * `heightAt` is already the overlay-aware height — inside the window
     * that's this sandbox's own live simulation, outside it the baked
     * terrain — so aiming works correctly on both without this needing to
     * know which one it's hitting.
     * @param {import("@babylonjs/core/Cameras/camera").Camera} camera
     */
    _raymarchGround(camera) {
        const engine = this.scene.getEngine();
        const ray = this.scene.createPickingRay(
            engine.getRenderWidth() / 2, engine.getRenderHeight() / 2,
            Matrix.Identity(), camera
        );
        const o = ray.origin;
        const d = ray.direction;

        const maxDist = 50;
        const step = 1;
        let prevT = 0;
        let prevDiff = o.y - this.terrain3d.heightAt(o.x, o.z);

        for (let t = step; t <= maxDist; t += step) {
            const diff = (o.y + d.y * t) - this.terrain3d.heightAt(o.x + d.x * t, o.z + d.z * t);
            if (diff <= 0 && prevDiff > 0) {
                let lo = prevT;
                let hi = t;
                for (let i = 0; i < 6; i++) {
                    const mid = (lo + hi) * 0.5;
                    const my = o.y + d.y * mid;
                    const groundY = this.terrain3d.heightAt(o.x + d.x * mid, o.z + d.z * mid);
                    if (my - groundY > 0) lo = mid; else hi = mid;
                }
                return { x: o.x + d.x * hi, y: o.y + d.y * hi, z: o.z + d.z * hi };
            }
            prevDiff = diff;
            prevT = t;
        }
        return null;
    }

    // ------------------------------------------------------------- refresh

    _refresh() {
        const world = this.runtime.world;
        if (!world) return;
        const size = SIZE;
        const tex = this._texData;
        let maxWater = 0;

        for (let i = 0; i < size * size; i++) {
            const o = i * CELL_STRIDE;
            const ground = world[o + FIELD.BEDROCK] + world[o + FIELD.SAND];
            const delta = ground - this._initialGround[i];
            const water = world[o + FIELD.WATER];
            const localBase = this._baseHeight[i] - this.origin.y;

            // R = height delta in metres, no LIFT — this is the real ground
            // now, sampled by Terrain's own shaders (see
            // Terrain.setSandboxWindow) exactly as sampleHeight() computes
            // it for the character.
            //
            // GBA = ground colour. This is deliberately NOT colorForCell(world, o, 0)'s full
            // formula: that mix also tints from wetness/biomass/heat/ice/snowCoverage/ash/fire/
            // smoke, and this window (a desert dune field, WORLD_GEN_OPTIONS.terrain === 'desert')
            // has no business showing any of those -- ground here is sand, full stop. The old
            // full mix let those secondary fields paint dark/blotchy patches over otherwise-flat
            // dunes the moment any of them left zero (e.g. rain-driven wetness), which is exactly
            // the "Kuhflecken" the player reported: high-contrast patches on the sand that have
            // nothing to do with the terrain's own shape. Using just colorForCell's sand-driven
            // base term keeps the tan shading that DOES belong (it still varies smoothly with
            // dune height via the SAND field) and drops every modifier this window was never
            // meant to render in the first place.
            const sand = world[o + FIELD.SAND];
            const rgb = [
                73.977 + sand * 1014.199,
                74.888 + sand * 653.572,
                68.467 + sand * 270.685,
            ];
            // colorForCell's coefficients are additive/multiplicative and unclamped by design --
            // mode 1..7 debug views deliberately let them overshoot to make field magnitudes
            // visible. Reachable field states (dune crest SAND=0.24, sand stamps) push raw/255
            // past 1.0; clamped here, at the one place this colour stops being a debug value and
            // becomes GBA texel data (EXECUTION_PLAN.md Task 1). colorForCell's return values are
            // authored as sRGB-encoded bytes (WORLD_ARCHITECTURE.md's "sRGB -> Linear" open
            // point), so after clamping they're decoded to real linear albedo before reaching
            // snow.fragment.wgsl's linear PBR mix (EXECUTION_PLAN.md Task 2) -- clamp first,
            // decode second, since sRGB decode is only defined on the encoded [0,1] range.
            tex[i * 4] = delta * HEIGHT_SCALE;
            tex[i * 4 + 1] = srgbToLinear(Math.min(1, Math.max(0, rgb[0] / 255)));
            tex[i * 4 + 2] = srgbToLinear(Math.min(1, Math.max(0, rgb[1] / 255)));
            tex[i * 4 + 3] = srgbToLinear(Math.min(1, Math.max(0, rgb[2] / 255)));

            // Field container (EXECUTION_PLAN.md Task 4): FIELD.SNOW's own canonical value,
            // unmodified -- not a colour, not a coverage curve derived from it. snow.fragment.wgsl
            // applies whatever normalisation it needs for its own visual terms (SSS/glints/wrap);
            // that is deriving visual detail FROM this value, not deriving the value itself from
            // something else (colour, height, sandWeight) the way `nonSnow` used to.
            this._fieldTexData[i * 4] = world[o + FIELD.SNOW];

            this._waterPositions[i * 3 + 1] = localBase + delta * HEIGHT_SCALE + water * WATER_HEIGHT_SCALE + LIFT + 0.01;
            const wVisible = water > WATER_THRESHOLD ? Math.min(1, 0.55 + water * 6) : 0;
            this._waterColors[i * 4] = 1;
            this._waterColors[i * 4 + 1] = 1;
            this._waterColors[i * 4 + 2] = 1;
            this._waterColors[i * 4 + 3] = wVisible;
            if (water > maxWater) maxWater = water;
        }
        this.sandboxTex.update(tex);
        this.sandboxFieldTex.update(this._fieldTexData);

        this.water.updateVerticesData(VertexBuffer.PositionKind, this._waterPositions, true);
        this.water.updateVerticesData(VertexBuffer.ColorKind, this._waterColors, false);
        // Belt-and-braces on top of the per-vertex alpha above: this mesh is a full
        // WORLD_SPAN-covering grid regardless of how little water actually exists, so if vertex
        // alpha blending doesn't engage for any reason (material/pipeline state this class
        // doesn't control), a bone-dry desert must still never show it as an opaque sheet over
        // the sand. Setting the whole mesh disabled below the visibility threshold is a hard
        // guarantee independent of whether alpha blending is doing its job.
        this.water.setEnabled(this._externallyVisible && maxWater > WATER_THRESHOLD);

        this._refreshVegetation(world);
        this._refreshParticles();
        this._refreshStone();
    }

    _refreshVegetation(world) {
        const size = SIZE;
        let count = 0;
        const buf = this._vegBuf;
        for (let z = 0; z < size && count < MAX_VEG; z += VEG_STEP) {
            for (let x = 0; x < size && count < MAX_VEG; x += VEG_STEP) {
                const i = z * size + x;
                const o = i * CELL_STRIDE;
                const bio = world[o + FIELD.BIOMASS];
                if (bio < VEG_THRESHOLD) continue;
                const ground = world[o + FIELD.BEDROCK] + world[o + FIELD.SAND];
                const delta = ground - this._initialGround[i];
                const localBase = this._baseHeight[i] - this.origin.y;
                const h = 0.12 + Math.sqrt(bio) * 0.9;
                _pos.set(
                    (x / (size - 1) - 0.5) * WORLD_SPAN,
                    localBase + delta * HEIGHT_SCALE + LIFT + h * 0.5,
                    (z / (size - 1) - 0.5) * WORLD_SPAN
                );
                _scale.set(1, h, 1);
                Matrix.ComposeToRef(_scale, _rot, _pos, _mat);
                _mat.copyToArray(buf, count * 16);
                count++;
            }
        }
        this.veg.thinInstanceCount = count;
        if (count > 0) this.veg.thinInstanceSetBuffer("matrix", buf.subarray(0, count * 16), 16, false);
    }

    _refreshParticles() {
        const particles = this.runtime.backend.particles;
        const count = Math.min(MAX_PARTICLES, particles.length);
        const buf = this._particleBuf;
        for (let i = 0; i < count; i++) {
            const p = particles[i];
            const wx = this.origin.x + (p.x - 0.5) * WORLD_SPAN;
            const wz = this.origin.z + (p.z - 0.5) * WORLD_SPAN;
            const baseY = this.terrain3d.heightAtBase(wx, wz) - this.origin.y;
            const delta = p.y - this._avgInitialGround;
            _pos.set((p.x - 0.5) * WORLD_SPAN, baseY + delta * HEIGHT_SCALE + LIFT, (p.z - 0.5) * WORLD_SPAN);
            _scale.set(1, 1, 1);
            Matrix.ComposeToRef(_scale, _rot, _pos, _mat);
            _mat.copyToArray(buf, i * 16);
        }
        this.particleMesh.thinInstanceCount = count;
        if (count > 0) this.particleMesh.thinInstanceSetBuffer("matrix", buf.subarray(0, count * 16), 16, false);
    }

    _refreshStone() {
        const body = this.runtime.state.body;
        this.stone.setEnabled(body.active);
        if (body.active) {
            const wx = this.origin.x + (body.x - 0.5) * WORLD_SPAN;
            const wz = this.origin.z + (body.z - 0.5) * WORLD_SPAN;
            const baseY = this.terrain3d.heightAtBase(wx, wz);
            const delta = body.y - this._avgInitialGround;
            this.stone.position.set(wx, baseY + delta * HEIGHT_SCALE + LIFT, wz);
        }
    }

    /**
     * The overlay hook `heightfield.js`'s `heightAt` consults on every call
     * (see `setOverlaySampler`) — returns the live simulated ground height
     * at (x, z) if it falls inside the current window, or `null` outside it
     * so the caller falls through to the real baked terrain. Reuses the
     * exact same per-vertex `_baseHeight`/`_initialGround` arrays `_refresh`
     * renders from, so the ground the character stands on can never
     * disagree with the ground that's drawn.
     * @param {number} x @param {number} z
     * @returns {number|null}
     */
    sampleHeight(x, z) {
        const world = this.runtime.world;
        if (!world) return null;

        const dx = x - this.origin.x;
        const dz = z - this.origin.z;
        const half = WORLD_SPAN / 2;
        if (Math.abs(dx) > half || Math.abs(dz) > half) return null;

        const size = SIZE;
        let gx = Math.round((dx / WORLD_SPAN + 0.5) * (size - 1));
        let gz = Math.round((dz / WORLD_SPAN + 0.5) * (size - 1));
        gx = gx < 0 ? 0 : gx > size - 1 ? size - 1 : gx;
        gz = gz < 0 ? 0 : gz > size - 1 ? size - 1 : gz;
        const i = gz * size + gx;

        const o = i * CELL_STRIDE;
        const ground = world[o + FIELD.BEDROCK] + world[o + FIELD.SAND];
        const delta = ground - this._initialGround[i];
        return this._baseHeight[i] + delta * HEIGHT_SCALE;
    }

    /** Width (metres) of the square window `sandboxTex` covers — what main.js passes to
     *  `Terrain.setSandboxWindow` as `size`, alongside `origin` as its centre. */
    get windowSize() {
        return WORLD_SPAN;
    }

    setVisible(v) {
        // _refresh() re-derives this.water's own enabled state from live water depth every
        // frame regardless of this flag, so it has to remember the caller's intent too --
        // otherwise the very next _refresh() call after setVisible(false) would flip a
        // genuinely wet mesh back on, overriding an explicit "hide the whole sandbox" request.
        this._externallyVisible = v;
        this.water.setEnabled(v);
        this.veg.setEnabled(v);
        this.particleMesh.setEnabled(v);
        if (!v) {
            this.stone.setEnabled(false);
            this.cursor.setEnabled(false);
            this.toolLabel.setEnabled(false);
        }
    }

    dispose() {
        this.sandboxTex.dispose();
        this.sandboxFieldTex.dispose();
        this.water.dispose();
        this.veg.dispose();
        this.particleMesh.dispose();
        this.stone.dispose();
        this.cursor.dispose();
        this.toolLabel.dispose();
    }
}
