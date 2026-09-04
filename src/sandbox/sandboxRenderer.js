/**
 * The Babylon-facing replacement for the old Canvas2D/WebGPU sandbox
 * renderers (see world-sandbox-cpu-backend.mjs's header comment). Reads the
 * same field grid (`FIELD.*`, `colorForCell`) the original renderers read;
 * everything here is new, everything it reads is the revived original.
 *
 * The sandbox lives as one bounded, walk-up-to patch sitting in the
 * Snowflow world — a raised tray, not a replacement for the dune field —
 * so this stays a contained "next to the world" object rather than a
 * second terrain system fighting the first for the ground.
 *
 * Step 1 of the revival: the simulation runs, is visible in real 3D
 * (terrain relief, standing water, vegetation, thrown particles, the
 * stone body), and is touchable with one tool (sand) via aim + click.
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

const SIZE = 64; // field grid resolution — a bounded patch, not the whole world
const WORLD_SPAN = 15; // metres, the patch's footprint
const HEIGHT_SCALE = 3.2; // metres per normalised height unit
const RIM = 0.85; // metres, plinth height above local ground
const WATER_THRESHOLD = 0.006;
const VEG_THRESHOLD = 0.02;
const VEG_STEP = 2; // sample every Nth cell for vegetation — 64² would be too many instances
const MAX_VEG = 900;
const MAX_PARTICLES = 600;

const _scale = new Vector3();
const _rot = Quaternion.Identity();
const _pos = new Vector3();
const _mat = new Matrix();

export class SandboxRenderer {
    /**
     * @param {import("@babylonjs/core/scene").Scene} scene
     * @param {{heightAt(x:number,z:number):number}} terrain — for placing the tray on the snow
     * @param {{x?:number, z?:number}} [opts] world-space centre of the patch
     */
    constructor(scene, terrain, opts = {}) {
        this.scene = scene;
        const cx = opts.x ?? 11;
        const cz = opts.z ?? 7;
        const groundY = terrain.heightAt(cx, cz) + RIM;
        this.origin = new Vector3(cx, groundY, cz);

        this.runtime = new WorldSandboxRuntime({ cpuSize: SIZE });
        this.runtime.enter();
        this.runtime.setTool("sand");
        this.runtime.setBrushRadius(0.045);

        this._buildPlinth(cx, cz, groundY);
        this._buildTerrain();
        this._buildWater();
        this._buildVegetation();
        this._buildParticles();
        this._buildStone();
        this._buildCursor();

        this._toolWasDown = false;
        this._aiming = false;

        this._refresh();
    }

    // -------------------------------------------------------------- build

    _buildPlinth(cx, cz, groundY) {
        const box = MeshBuilder.CreateBox(
            "sandboxPlinth", { width: WORLD_SPAN + 0.5, height: RIM, depth: WORLD_SPAN + 0.5 }, this.scene
        );
        box.position.set(cx, groundY - RIM / 2, cz);
        const mat = new StandardMaterial("sandboxPlinthMat", this.scene);
        mat.diffuseColor = new Color3(0.18, 0.16, 0.14);
        mat.specularColor = new Color3(0.05, 0.05, 0.05);
        box.material = mat;
        box.renderingGroupId = 1;
        this.plinth = box;
    }

    _buildTerrain() {
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
        mat.specularColor = new Color3(0.04, 0.04, 0.04);
        mat.backFaceCulling = false;
        mesh.material = mat;

        this.terrain = mesh;
        this._indices = indices;
        this._positions = positions;
        this._normals = new Float32Array(n * 3);
        this._colors = new Float32Array(n * 4).fill(1);
    }

    _buildWater() {
        const size = SIZE;
        const n = size * size;
        // Same topology as the terrain — built the same way, updated the same way.
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
        mat.alpha = 1;
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
        sphere.position.copyFrom(this.origin);
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

    // ------------------------------------------------------------ runtime

    /** @param {number} dt seconds */
    update(dt) {
        this.runtime.advance(dt, {});
        this._refresh();
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
            this.cursor.position.set(point.x, point.y + 0.02, point.z);
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

        for (let i = 0; i < size * size; i++) {
            const o = i * CELL_STRIDE;
            const ground = world[o + FIELD.BEDROCK] + world[o + FIELD.SAND];
            this._positions[i * 3 + 1] = ground * HEIGHT_SCALE;

            const rgb = colorForCell(world, o, 0);
            this._colors[i * 4] = rgb[0] / 255;
            this._colors[i * 4 + 1] = rgb[1] / 255;
            this._colors[i * 4 + 2] = rgb[2] / 255;
            this._colors[i * 4 + 3] = 1;

            const water = world[o + FIELD.WATER];
            this._waterPositions[i * 3 + 1] = (ground + water) * HEIGHT_SCALE + 0.01;
            const wVisible = water > WATER_THRESHOLD ? Math.min(1, 0.55 + water * 6) : 0;
            this._waterColors[i * 4] = 1;
            this._waterColors[i * 4 + 1] = 1;
            this._waterColors[i * 4 + 2] = 1;
            this._waterColors[i * 4 + 3] = wVisible;
        }

        // `updateExtends: true` on the position update — the mesh's bounding info
        // has to track the live heightfield, or the crosshair raycast's broad-phase
        // rejects real hits once the terrain has deformed away from its initial shape.
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
                const o = (z * size + x) * CELL_STRIDE;
                const bio = world[o + FIELD.BIOMASS];
                if (bio < VEG_THRESHOLD) continue;
                const ground = world[o + FIELD.BEDROCK] + world[o + FIELD.SAND];
                const h = 0.12 + Math.sqrt(bio) * 0.9;
                _pos.set(
                    (x / (size - 1) - 0.5) * WORLD_SPAN,
                    ground * HEIGHT_SCALE + h * 0.5,
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
            _pos.set(
                (p.x - 0.5) * WORLD_SPAN,
                p.y * HEIGHT_SCALE,
                (p.z - 0.5) * WORLD_SPAN
            );
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
            this.stone.position.set(
                this.origin.x + (body.x - 0.5) * WORLD_SPAN,
                this.origin.y + body.y * HEIGHT_SCALE,
                this.origin.z + (body.z - 0.5) * WORLD_SPAN
            );
        }
    }

    setVisible(v) {
        this.plinth.setEnabled(v);
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
        this.plinth.dispose();
        this.terrain.dispose();
        this.water.dispose();
        this.veg.dispose();
        this.particleMesh.dispose();
        this.stone.dispose();
        this.cursor.dispose();
    }
}
