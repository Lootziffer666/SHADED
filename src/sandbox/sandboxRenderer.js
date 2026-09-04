/**
 * The Babylon-facing replacement for the old Canvas2D/WebGPU sandbox
 * renderers (see world-sandbox-cpu-backend.mjs's header comment). Reads the
 * same field grid (`FIELD.*`, `colorForCell`) the original renderers read;
 * everything here is new, everything it reads is the revived original.
 *
 * This IS the ground within its window, not a cosmetic layer sitting on
 * unmovable terrain: every vertex's baseline comes from
 * `terrain.heightAtBase` (the real Snowflow dune field, read once and never
 * written back to — the fixed rock this sits on), and what's rendered is
 * that baseline plus the sandbox field's own live delta. And — critically —
 * `heightfield.js`'s `heightAt` reads this same delta through an overlay
 * hook, so it isn't only what you see: it's what the character stands on,
 * slides down, and gets grounded against, across the *whole* window, not
 * just where it happens to be visible. Real wind-shaped dunes you can carve
 * into and ride, not a decal.
 *
 * It is fully opaque across the whole window (feathered only at the outer
 * edge, to blend rather than cut) — this replaces the real terrain here, it
 * isn't a decal that only shows itself once poked. Its ground is sand, not
 * rock: `createWorldState`'s `terrain: 'desert'` mode (see
 * `WORLD_GEN_OPTIONS`) keeps FIELD.SAND high everywhere, because that's
 * what `colorForCell` actually paints with — dunes are sand, not granite.
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
 * Step 1 of the revival: the simulation runs, is visible in real 3D, is the
 * real ground, and is touchable with one tool (sand) via aim + click.
 * Multi-tool selection and per-object settings are the next step.
 */

// Side-effect import: registers Scene.prototype.pick/createPickingRay, which
// handleInput()'s crosshair raycast needs — nothing else in this codebase
// picks meshes, so nothing else has pulled this in yet.
import "@babylonjs/core/Culling/ray";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";

import { WorldSandboxRuntime } from "./world-sandbox-runtime.mjs";
import { CELL_STRIDE, FIELD } from "./world-sandbox-reference.mjs";
import { colorForCell } from "./world-sandbox-cpu-backend.mjs";

const SIZE = 64; // field grid resolution
// 80m — matches terrain/deformation.js's own COVERAGE constant, so the soil
// layer and the snow deformation buffer it sits above cover the same scale.
const WORLD_SPAN = 80; // metres
const HEIGHT_SCALE = 1.6; // metres per normalised height-delta unit
const WATER_HEIGHT_SCALE = 1.1;
const LIFT = 0.025; // metres, keeps the overlay a hair above the real terrain (avoids z-fighting)
const WATER_THRESHOLD = 0.006;
const VEG_THRESHOLD = 0.02;
const VEG_STEP = 2; // sample every Nth cell for vegetation — 64² would be too many instances
const MAX_VEG = 900;
const MAX_PARTICLES = 600;
/** Metres from the window's centre the player can roam before it re-centres on them. */
const RECENTER_MARGIN = 26;
/** Fraction of the half-span (as a distance ratio, 0=centre..1=edge) where the edge feather starts. */
const EDGE_FEATHER_START = 0.82;
/** Initial FIELD.SNOW value seeded across a fresh patch, so it reads as snow-covered ground from
 *  the first frame rather than bare sand — colorForCell.js's own snowCoverage term is full white
 *  by snow=0.06 ((snow-0.006)/0.054 clamped to 1), so this needs to clear that, not just approach it. */
const SNOW_SEED = 0.08;
/** world-sandbox-reference.mjs's createWorldState() defaults to a generic bedrock-heavy mixed
 *  landscape (mountains/ridges/basins, sand mostly ~0.02-0.05) unless told otherwise — its
 *  colorForCell only reads `sand` for the base tone, so that default reads as dark bare rock, not
 *  dunes. `terrain: 'desert'` switches to generateDunes(), which keeps sand high (up to ~0.26)
 *  everywhere: real wind-shaped dune ridges, sand as the actual mass, not a rock field with a
 *  sand dusting. Dunes are sand. Not granite. */
const WORLD_GEN_OPTIONS = { terrain: "desert", windDeg: 34 };

const _scale = new Vector3();
const _rot = Quaternion.Identity();
const _pos = new Vector3();
const _mat = new Matrix();

export class SandboxRenderer {
    /**
     * @param {import("@babylonjs/core/scene").Scene} scene
     * @param {{heightAt(x:number,z:number):number}} terrain — the real Snowflow terrain
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
        this.runtime.setTool("sand");
        this.runtime.setBrushRadius(0.025);
        // Cold enough that seeded snow holds rather than melting straight
        // back off (stepWorldReference's melt/ice terms key off ~0.42-0.46) —
        // this is a snow world, and freshly generated ground should read as
        // snow-covered from the first frame, not bare sand.
        this.runtime.setEnvironment({ temperature: 0.25 });
        this._seedSnowCover();

        this._buildTerrainOverlay();
        this._buildWater();
        this._buildVegetation();
        this._buildParticles();
        this._buildStone();
        this._buildCursor();

        this._toolWasDown = false;
        this._aiming = false;

        this._updateWorldPositions();
        this._captureBaseline();
        this._refresh();
    }

    // -------------------------------------------------------------- build

    _buildTerrainOverlay() {
        const size = SIZE;
        const n = size * size;
        const positions = new Float32Array(n * 3);
        const uvs = new Float32Array(n * 2);
        const indices = new Uint32Array((size - 1) * (size - 1) * 6);

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const i = z * size + x;
                positions[i * 3] = (x / (size - 1) - 0.5) * WORLD_SPAN;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = (z / (size - 1) - 0.5) * WORLD_SPAN;
                uvs[i * 2] = x / (size - 1);
                uvs[i * 2 + 1] = z / (size - 1);
            }
        }
        let ii = 0;
        for (let z = 0; z < size - 1; z++) {
            for (let x = 0; x < size - 1; x++) {
                const a = z * size + x;
                const b = a + 1;
                const c = a + size;
                const d = c + 1;
                indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
                indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
            }
        }

        const mesh = new Mesh("sandboxTerrain", this.scene);
        const vd = new VertexData();
        vd.positions = positions;
        vd.indices = indices;
        vd.uvs = uvs;
        vd.colors = new Float32Array(n * 4).fill(1);
        vd.applyToMesh(mesh, true);
        mesh.position.copyFrom(this.origin);
        mesh.isPickable = true;
        mesh.renderingGroupId = 1;

        const mat = new StandardMaterial("sandboxTerrainMat", this.scene);
        mat.specularColor = new Color3(0.05, 0.05, 0.05);
        mat.backFaceCulling = false;
        // Vertex alpha is opaque across almost the whole window — this is
        // standing ground, not an occasional-marks decal — and only
        // feathers to 0 in the outer rim (see _refresh), so the patch
        // blends into the surrounding dune field instead of ending in a hard
        // edge.
        mat.hasVertexAlpha = true;
        mesh.material = mat;

        this.terrain = mesh;
        this._indices = indices;
        this._positions = positions;
        this._normals = new Float32Array(n * 3);
        this._colors = new Float32Array(n * 4).fill(1);
        // Filled by _updateWorldPositions() — depends on `origin`, which can
        // change on re-centre, so it's kept separate from the local (fixed)
        // vertex offsets in `_positions`.
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

        const mat = new StandardMaterial("sandboxWaterMat", this.scene);
        mat.diffuseColor = new Color3(0.14, 0.42, 0.5);
        mat.specularColor = new Color3(0.5, 0.55, 0.6);
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
        const mat = new StandardMaterial("sandboxVegMat", this.scene);
        mat.diffuseColor = new Color3(0.16, 0.42, 0.14);
        mat.specularColor = new Color3(0.02, 0.02, 0.02);
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
        const mat = new StandardMaterial("sandboxStoneMat", this.scene);
        mat.diffuseColor = new Color3(0.35, 0.36, 0.34);
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

    /**
     * Recompute each vertex's world-space X/Z from its fixed local offset
     * (`_positions`' X/Z never change, only Y does) and the current origin.
     * Called at construction and again on every re-centre.
     */
    _updateWorldPositions() {
        const n = SIZE * SIZE;
        for (let i = 0; i < n; i++) {
            this._worldX[i] = this.origin.x + this._positions[i * 3];
            this._worldZ[i] = this.origin.z + this._positions[i * 3 + 2];
        }
    }

    /**
     * Sample the real terrain's height at every vertex, and record the
     * sandbox field's own starting ground level per cell — everything the
     * per-frame refresh renders is a delta from these two baselines, which
     * is what keeps the overlay flush and invisible until something changes.
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
     * regenerate the same look), the meshes moved to match, and both
     * baselines recaptured against the new origin. A hard cut, not a
     * scroll — see the class doc comment for why that's an acceptable
     * trade for now.
     */
    _recenter(px, pz) {
        this.origin.set(px, this.terrain3d.heightAtBase(px, pz), pz);
        this.terrain.position.copyFrom(this.origin);
        this.water.position.copyFrom(this.origin);
        this.veg.position.copyFrom(this.origin);
        this.particleMesh.position.copyFrom(this.origin);

        this._updateWorldPositions();

        const seed = (Math.floor(px * 131) ^ Math.floor(pz * 131) ^ 0x53484144) >>> 0;
        this.runtime.reset(seed || 1, WORLD_GEN_OPTIONS);
        this._seedSnowCover();

        this._captureBaseline();
        this._refresh();
    }

    /** Every fresh patch starts under a light, holding snow cover — see the constructor. */
    _seedSnowCover() {
        const world = this.runtime.world;
        if (!world) return;
        for (let o = 0; o < world.length; o += CELL_STRIDE) {
            world[o + FIELD.SNOW] = SNOW_SEED;
        }
    }

    /**
     * Raycast from screen centre (crosshair aim, consistent with the
     * pointer-locked camera-look everywhere else in the scene) against the
     * terrain patch, and drive a tool stroke from it.
     *
     * @param {import("@babylonjs/core/Cameras/camera").Camera} camera
     * @param {boolean} toolDown primary action held this frame
     */
    handleInput(camera, toolDown) {
        const engine = this.scene.getEngine();
        const hit = this.scene.pick(
            engine.getRenderWidth() / 2, engine.getRenderHeight() / 2,
            (m) => m === this.terrain, false, camera
        );
        const point = hit?.hit ? hit.pickedPoint : null;
        this._aiming = !!point;

        if (point) {
            const u = (point.x - this.origin.x) / WORLD_SPAN + 0.5;
            const v = (point.z - this.origin.z) / WORLD_SPAN + 0.5;
            this.cursor.setEnabled(true);
            this.cursor.position.set(point.x, point.y + 0.03, point.z);
            this.cursor.scaling.set(this.runtime.state.radius * WORLD_SPAN * 2, 1, this.runtime.state.radius * WORLD_SPAN * 2);

            if (toolDown && !this._toolWasDown) this.runtime.beginToolStroke(u, v);
            else if (toolDown) this.runtime.continueToolStroke(u, v);
            else if (this._toolWasDown) this.runtime.endToolStroke();
        } else {
            this.cursor.setEnabled(false);
            if (this._toolWasDown) this.runtime.endToolStroke();
        }
        this._toolWasDown = toolDown && !!point;
    }

    // ------------------------------------------------------------- refresh

    _refresh() {
        const world = this.runtime.world;
        if (!world) return;
        const size = SIZE;
        const halfSpan = WORLD_SPAN / 2;

        for (let i = 0; i < size * size; i++) {
            const o = i * CELL_STRIDE;
            const ground = world[o + FIELD.BEDROCK] + world[o + FIELD.SAND];
            const delta = ground - this._initialGround[i];
            const water = world[o + FIELD.WATER];
            const localBase = this._baseHeight[i] - this.origin.y;

            this._positions[i * 3 + 1] = localBase + delta * HEIGHT_SCALE + LIFT;

            const rgb = colorForCell(world, o, 0);
            this._colors[i * 4] = rgb[0] / 255;
            this._colors[i * 4 + 1] = rgb[1] / 255;
            this._colors[i * 4 + 2] = rgb[2] / 255;
            // Opaque across almost the whole window — this replaces the
            // real terrain here, it isn't a decal that only shows where
            // touched — and only feathers to 0 in the outer rim (below), so
            // the patch blends into the surrounding dune field instead of
            // ending in a hard edge. (The earlier "only where changed"
            // gating was working around a colour bug — see
            // WORLD_GEN_OPTIONS — not a real need to hide this.)
            const lx = this._positions[i * 3];
            const lz = this._positions[i * 3 + 2];
            const edgeDist = Math.max(Math.abs(lx), Math.abs(lz)) / halfSpan;
            this._colors[i * 4 + 3] = 1 - smoothstep01((edgeDist - EDGE_FEATHER_START) / (1 - EDGE_FEATHER_START));

            this._waterPositions[i * 3 + 1] = localBase + delta * HEIGHT_SCALE + water * WATER_HEIGHT_SCALE + LIFT + 0.01;
            const wVisible = water > WATER_THRESHOLD ? Math.min(1, 0.55 + water * 6) : 0;
            this._waterColors[i * 4] = 1;
            this._waterColors[i * 4 + 1] = 1;
            this._waterColors[i * 4 + 2] = 1;
            this._waterColors[i * 4 + 3] = wVisible;
        }

        // `updateExtends: true` on the position update — the mesh's bounding info
        // has to track the live heightfield, or the crosshair raycast's broad-phase
        // rejects real hits once the overlay has deformed away from its initial shape.
        this.terrain.updateVerticesData(VertexBuffer.PositionKind, this._positions, true);
        this.terrain.updateVerticesData(VertexBuffer.ColorKind, this._colors, false);
        VertexData.ComputeNormals(this._positions, this._indices, this._normals);
        this.terrain.updateVerticesData(VertexBuffer.NormalKind, this._normals, false);

        this.water.updateVerticesData(VertexBuffer.PositionKind, this._waterPositions, true);
        this.water.updateVerticesData(VertexBuffer.ColorKind, this._waterColors, false);

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

    setVisible(v) {
        this.terrain.setEnabled(v);
        this.water.setEnabled(v);
        this.veg.setEnabled(v);
        this.particleMesh.setEnabled(v);
        if (!v) {
            this.stone.setEnabled(false);
            this.cursor.setEnabled(false);
        }
    }

    dispose() {
        this.terrain.dispose();
        this.water.dispose();
        this.veg.dispose();
        this.particleMesh.dispose();
        this.stone.dispose();
        this.cursor.dispose();
    }
}

/** Hermite smoothstep, clamped to [0,1] on an already-normalised parameter. */
function smoothstep01(t) {
    const x = t < 0 ? 0 : t > 1 ? 1 : t;
    return x * x * (3 - 2 * x);
}
