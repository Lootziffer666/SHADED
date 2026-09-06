/**
 * Terrain system: owns the heightfield, the clipmap mesh, the snow material,
 * the shadow-pass materials and the generated detail map.
 *
 * Per frame this uploads a handful of uniforms and nothing else. No geometry is
 * rebuilt, no buffer is re-uploaded, nothing is allocated.
 */

import { Vector2, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { ProceduralTexture } from "@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";

import { Heightfield, WORLD_SIZE } from "./heightfield.js";
import { DeformationField } from "./deformation.js";
import {
    buildClipmapMesh,
    BASE_SPACING,
    GRID_HALF_N,
    OUTER_EXTENT,
} from "./clipmapMesh.js";
import { S } from "../core/settings.js";
import { CASCADE_COUNT } from "../render/shadows.js";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.js";
import { bakeOnce, whenReady, bindMatrixArray } from "../core/gpuUtil.js";

const DETAIL_RES = 1024;

const _splits = new Vector4(0, 0, 0, 0);
const _lod = new Vector2();
const _screen = new Vector2();
const _sandboxCenter = new Vector2(0, 0);

const DEBUG_MODES = {
    beauty: 0, deform: 1, normals: 2, depth: 3, cascades: 4,
    footprint: 5, fineNormals: 6, shadow: 7, ndotl: 8, shadowMap: 9,
    albedo: 10, sandbox: 11,
};

export class Terrain {
    /**
     * @param {import("@babylonjs/core/scene").Scene} scene
     * @param {import("../render/sky.js").Sky} sky
     * @param {import("../render/shadows.js").ShadowSystem} shadows
     */
    constructor(scene, sky, shadows) {
        this.scene = scene;
        this.sky = sky;
        this.shadows = shadows;

        this.heightfield = new Heightfield(scene);

        /** The terrain state buffer. Feet, the surf wake and every spell write here. */
        this.deform = new DeformationField(scene);

        // Placeholder so the beauty/prepass/depth materials always have a
        // real texture bound to `sandboxTex` from the moment they're built —
        // the world sandbox (src/sandbox/) doesn't exist yet at this point in
        // startup and replaces this via setSandboxWindow() once it does.
        // sandboxSize stays 0 until then, which is what actually disables the
        // read on the shader side; this is just what the sampler points at
        // in the meantime.
        this._sandboxTexPlaceholder = RawTexture.CreateRGBATexture(
            new Float32Array([0, 0, 0, 0]), 1, 1, scene,
            false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT
        );

        // A renderer-facing auxiliary field container, the first of its kind (EXECUTION_PLAN.md
        // Task 4) -- not a snow-only binding. R carries FIELD.SNOW's own canonical value straight
        // from the world-sandbox grid (world-sandbox-reference.mjs's FIELD enum), unmodified;
        // G/B/A are reserved for future independent scalar fields (e.g. FIELD.ICE) that need the
        // same treatment, so adding one later is packing a channel here, not adding a texture.
        // Only the beauty material samples it: depth/prepass only ever read sandboxTex's height
        // channel for vertex displacement (see terrainDepth.vertex.wgsl), they have no fragment
        // stage that needs a material field like snow coverage.
        this._sandboxFieldTexPlaceholder = RawTexture.CreateRGBATexture(
            new Float32Array([0, 0, 0, 0]), 1, 1, scene,
            false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT
        );

        // Generated snow grain, tiled at three world scales by the material.
        this.detailTex = new ProceduralTexture(
            "detailTex",
            { width: DETAIL_RES, height: DETAIL_RES },
            "detailBake",
            scene,
            {
                generateMipMaps: true,
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
                format: Constants.TEXTUREFORMAT_RGBA,
                samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
                shaderLanguage: ShaderLanguage.WGSL,
                skipSceneRegistration: true,
            }
        );
        this.detailTex.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
        this.detailTex.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
        this.detailTex.refreshRate = 0;

        this.mesh = buildClipmapMesh(scene);

        // Defaults read by _makeSnowMaterial() below -- see setWorldDefaults()'s own doc comment.
        this._worldDefaultSandDepth = 1.0;
        this._worldDefaultSnowCoverage = 0.0;

        this.material = this._makeSnowMaterial();
        this.mesh.material = this.material;

        // One depth material per cascade, so each can carry its own matrix
        // without any mid-frame uniform-buffer swapping.
        shadows.registerCaster(this.mesh, (c) => this._makeDepthMaterial(c));

        this.setDeformTexture(this.deform.texture);
    }

    _makeSnowMaterial() {
        const mat = new ShaderMaterial(
            "snow",
            this.scene,
            { vertex: "snow", fragment: "snow" },
            {
                attributes: ["position"],
                uniforms: [
                    "viewProjection", "cameraPos", "lodCenter",
                    "baseSpacing", "gridHalfN",
                    "worldOrigin", "worldSize", "heightRes",
                    "windAngle", "macroAmp", "sastrugiAmp",
                    "sunDir", "sunRadiance",
                    "shR",
                    "cascadeMatrices", "cascadeSplits", "cascadeParams",
                    "shadowTexel", "shadowSoftness", "shadowBias",
                    "detailStrength", "glintIntensity", "glintGrazing",
                    "sssStrength", "sssRadius",
                    "fogDensity", "fogHeightFalloff", "fogStart", "aerialStrength",
                    "deformCenter", "deformSize", "deformTexel", "deformDepthScale",
                    "ambientIntensity", "ambientFloor", "debugMode", "screenSize",
                    "sandboxCenter", "sandboxSize",
                    "worldDefaultSandDepth", "worldDefaultSnowCoverage",
                    ...SPELL_LIGHT_UNIFORMS,
                ],
                samplers: [
                    "heightTex", "auxTex", "detailTex", "skyLUT",
                    "cascade0", "cascade1", "cascade2", "deformTex", "sandboxTex", "sandboxFieldTex",
                ],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );

        mat.backFaceCulling = true;
        mat.setTexture("heightTex", this.heightfield.heightTex);
        mat.setTexture("auxTex", this.heightfield.auxTex);
        mat.setTexture("detailTex", this.detailTex);
        mat.setTexture("skyLUT", this.sky.lut);
        for (let i = 0; i < CASCADE_COUNT; i++) {
            mat.setTexture("cascade" + i, this.shadows.maps[i]);
        }
        mat.setTexture("sandboxTex", this._sandboxTexPlaceholder);
        mat.setTexture("sandboxFieldTex", this._sandboxFieldTexPlaceholder);
        // 0 size disables the read outright — see setSandboxWindow.
        mat.setVector2("sandboxCenter", _sandboxCenter);
        mat.setFloat("sandboxSize", 0);
        // SHADED's own default surface state (GOAL_WORLD.md G-0601/G-0708) -- desert by default,
        // no snow by default. See setWorldDefaults() and snow.fragment.wgsl's material section.
        mat.setFloat("worldDefaultSandDepth", this._worldDefaultSandDepth);
        mat.setFloat("worldDefaultSnowCoverage", this._worldDefaultSnowCoverage);
        return mat;
    }

    /**
     * SHADED's own default surface state, everywhere the sandbox's local window has no per-cell
     * data (GOAL_WORLD.md G-0601/G-0602/G-2101/G-2102/G-2805). `sandDepth` (default 1) is how much
     * of the default world reads as sand vs. exposed rock on a slope -- 1 means "100% sand" holds
     * across the entire visible terrain, not just the sandbox window; 0 means the whole world's
     * default falls back to exposed rock wherever slope allows it. `snowCoverage` (default 0)
     * activates the snow material state on top of that default -- snow is never the baseline (see
     * GOAL_WORLD.md G-3203, "Snow ist ein SHADED World State/Materialprovider, kein
     * Rendererfundament"). Both apply immediately to the beauty material's live uniforms; the
     * sandbox window's own real per-cell FIELD.SAND/FIELD.SNOW state (set via setSandboxWindow)
     * still overrides this default wherever that window is active, unchanged.
     * @param {number} sandDepth 0..1
     * @param {number} snowCoverage 0..1
     */
    setWorldDefaults(sandDepth, snowCoverage) {
        this._worldDefaultSandDepth = Math.max(0, Math.min(1, sandDepth));
        this._worldDefaultSnowCoverage = Math.max(0, Math.min(1, snowCoverage));
        this.material.setFloat("worldDefaultSandDepth", this._worldDefaultSandDepth);
        this.material.setFloat("worldDefaultSnowCoverage", this._worldDefaultSnowCoverage);
    }

    /**
     * The camera-space depth prepass material.
     *
     * Same clipmap and deformation code as the beauty pass through the same
     * includes; only the fragment stage differs. Registered with the prepass
     * rather than with the shadow system, so it takes `viewProjection` — which
     * Babylon binds from the active camera, and which by then carries this
     * frame's temporal jitter.
     */
    makePrepassMaterial() {
        const mat = new ShaderMaterial(
            "terrainPrepass",
            this.scene,
            { vertex: "terrainPrepass", fragment: "prepass" },
            {
                attributes: ["position"],
                uniforms: [
                    "viewProjection", "cameraPos", "lodCenter",
                    "baseSpacing", "gridHalfN",
                    "worldOrigin", "worldSize", "heightRes",
                    "windAngle", "sastrugiAmp",
                    "deformCenter", "deformSize", "deformDepthScale",
                    "sandboxCenter", "sandboxSize",
                ],
                samplers: ["heightTex", "auxTex", "deformTex", "sandboxTex"],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        mat.backFaceCulling = false;
        mat.setTexture("heightTex", this.heightfield.heightTex);
        mat.setTexture("auxTex", this.heightfield.auxTex);
        mat.setTexture("sandboxTex", this._sandboxTexPlaceholder);
        mat.setVector2("sandboxCenter", _sandboxCenter);
        mat.setFloat("sandboxSize", 0);
        this.prepassMat = mat;
        return mat;
    }

    _makeDepthMaterial(cascade) {
        const mat = new ShaderMaterial(
            "terrainDepth" + cascade,
            this.scene,
            { vertex: "terrainDepth", fragment: "terrainDepth" },
            {
                attributes: ["position"],
                uniforms: [
                    "lightViewProjection", "cameraPos", "lodCenter",
                    "baseSpacing", "gridHalfN",
                    "worldOrigin", "worldSize", "heightRes",
                    "windAngle", "sastrugiAmp",
                    "deformCenter", "deformSize", "deformDepthScale",
                    "sandboxCenter", "sandboxSize",
                ],
                samplers: ["heightTex", "auxTex", "deformTex", "sandboxTex"],
                shaderLanguage: ShaderLanguage.WGSL,
                // Forces a distinct Effect per cascade, so each can carry its
                // own light matrix without mid-frame uniform swapping.
                defines: ["SNOW_CASCADE " + cascade],
            }
        );
        mat.backFaceCulling = false;
        mat.setTexture("heightTex", this.heightfield.heightTex);
        mat.setTexture("auxTex", this.heightfield.auxTex);
        mat.setTexture("sandboxTex", this._sandboxTexPlaceholder);
        mat.setVector2("sandboxCenter", _sandboxCenter);
        mat.setFloat("sandboxSize", 0);
        if (!this._depthMats) this._depthMats = [];
        this._depthMats.push(mat);
        return mat;
    }

    async build() {
        this.detailTex.setFloat("resolution", DETAIL_RES);
        // Tilts a grain dome's flank to roughly 30 degrees. Higher reads as
        // gravel, lower stops registering at all.
        this.detailTex.setFloat("grainScale", 0.013);
        await bakeOnce(this.detailTex, "detailBake");

        await this.heightfield.bake();

        // The cascade fitter needs the world's vertical extent to size each
        // light volume's depth range. A margin covers carved berms and anything
        // standing on the snow.
        this.shadows.setHeightBounds(
            this.heightfield.minHeight - 4,
            this.heightfield.maxHeight + 6
        );
    }

    /**
     * Force every terrain pipeline to compile. Called behind the loading screen
     * so the first rendered frame never pays a compile.
     */
    async warmUp() {
        // Before the snow material, because its first compile binds whatever is
        // in the deformation target and reading uninitialised VRAM as a height
        // can put NaN into a vertex position.
        await this.deform.warmUp();
        this.setDeformTexture(this.deform.texture);

        await whenReady(this.material, "snow material", [this.mesh, false]);
        if (this.prepassMat) {
            await whenReady(this.prepassMat, "terrain prepass", [this.mesh, false]);
        }
        if (this._depthMats) {
            for (let i = 0; i < this._depthMats.length; i++) {
                await whenReady(this._depthMats[i], "terrainDepth" + i, [this.mesh, false]);
            }
        }
    }

    /**
     * Point every terrain pipeline at a deformation target. Called once per
     * ping-pong flip, so all four materials always read the same frame's state.
     * @param {import("@babylonjs/core/Materials/Textures/texture").Texture} tex
     */
    setDeformTexture(tex) {
        this._boundDeform = tex;
        this.material.setTexture("deformTex", tex);
        if (this._depthMats) {
            for (let i = 0; i < this._depthMats.length; i++) {
                this._depthMats[i].setTexture("deformTex", tex);
            }
        }
        if (this.prepassMat) this.prepassMat.setTexture("deformTex", tex);
    }

    /**
     * Point every terrain pipeline at the world sandbox's live ground data —
     * this is the actual replacement mechanism: one continuous clipmap mesh
     * that samples different height and colour within the window, not a
     * second mesh drawn over or cut into this one. `tex` is a single RGBA
     * texture (R = height delta in metres, GBA = ground colour) the sandbox
     * re-uploads every frame; `size <= 0` (or `tex` null) disables the read
     * everywhere the shader consults it, restoring plain baked terrain.
     *
     * Pushed to all four materials together, the same way setDeformTexture
     * is — the beauty pass and the two passes that place its shadow/AO must
     * agree on where the ground actually is, or the dune will shadow and
     * self-occlude against a surface it isn't drawing.
     * @param {import("@babylonjs/core/Materials/Textures/texture").Texture|null} tex
     * @param {number} x @param {number} z @param {number} size metres
     * @param {import("@babylonjs/core/Materials/Textures/texture").Texture|null} [fieldTex]
     *   The auxiliary field container (R = FIELD.SNOW's canonical value, see the constructor's
     *   `_sandboxFieldTexPlaceholder` comment) -- only the beauty material reads it, so unlike
     *   `tex` it is not pushed to the depth/prepass materials below.
     */
    setSandboxWindow(tex, x, z, size, fieldTex) {
        const t = tex || this._sandboxTexPlaceholder;
        const ft = tex ? (fieldTex || this._sandboxFieldTexPlaceholder) : this._sandboxFieldTexPlaceholder;
        const s = tex ? Math.max(0, size) : 0;
        _sandboxCenter.set(x, z);

        this.material.setTexture("sandboxTex", t);
        this.material.setTexture("sandboxFieldTex", ft);
        this.material.setVector2("sandboxCenter", _sandboxCenter);
        this.material.setFloat("sandboxSize", s);

        if (this._depthMats) {
            for (let i = 0; i < this._depthMats.length; i++) {
                const d = this._depthMats[i];
                d.setTexture("sandboxTex", t);
                d.setVector2("sandboxCenter", _sandboxCenter);
                d.setFloat("sandboxSize", s);
            }
        }
        if (this.prepassMat) {
            this.prepassMat.setTexture("sandboxTex", t);
            this.prepassMat.setVector2("sandboxCenter", _sandboxCenter);
            this.prepassMat.setFloat("sandboxSize", s);
        }
    }

    /**
     * Advance the terrain state buffer and push this frame's uniforms.
     *
     * The deformation window follows the *player*, not the camera: the camera can
     * be swung right around and the marks the player left have to stay where they
     * were put.
     *
     * @param {Vector3} cameraPos
     * @param {{x:number, z:number}} focus world position the deform window centres on
     * @param {number} dt seconds
     */
    update(cameraPos, focus, dt) {
        const m = this.material;
        const hf = this.heightfield;
        const windAngle = (S.windDirection * Math.PI) / 180;

        // Simulate first, then bind: the material must sample the target that
        // was written this frame, not the one from last frame, or every mark
        // lands a frame late and fast movement leaves a visible stagger.
        const deformTex = this.deform.update(dt, focus);
        if (deformTex !== this._boundDeform) {
            this.setDeformTexture(deformTex);
        }
        const deformCenter = this.deform.center;
        const deformSize = this.deform.size;

        // Clipmap rings follow the player, not the viewer — see the note on
        // `lodCenter` in snow.vertex.wgsl. No extra snapping here;
        // `placeClipmapVertex` snaps per ring already.
        _lod.set(focus.x, focus.z);

        m.setVector3("cameraPos", cameraPos);
        m.setVector2("lodCenter", _lod);
        m.setFloat("baseSpacing", BASE_SPACING);
        m.setFloat("gridHalfN", GRID_HALF_N);
        m.setVector2("worldOrigin", hf.origin);
        m.setFloat("worldSize", hf.size);
        m.setFloat("heightRes", 4096);
        m.setFloat("windAngle", windAngle);
        m.setFloat("macroAmp", S.macroHeightScale);
        m.setFloat("sastrugiAmp", S.enableSnowShading ? S.sastrugiStrength : 0);

        m.setVector3("sunDir", this.sky.sunDir);
        m.setColor3("sunRadiance", this.sky.sunRadiance);
        m.setArray4("shR", this.sky.sh);

        bindMatrixArray(m, "cascadeMatrices", this.shadows.matrixData);
        _splits.set(
            this.shadows.splits[0], this.shadows.splits[1],
            this.shadows.splits[2], this.shadows.splits[3]
        );
        m.setVector4("cascadeSplits", _splits);
        m.setArray4("cascadeParams", this.shadows.paramData);
        m.setFloat("shadowTexel", this.shadows.texelSize);
        m.setFloat("shadowSoftness", 1.8);
        // Metres. Snow has no thin geometry to peter-pan, so this can stay
        // small and keep contact shadows attached.
        m.setFloat("shadowBias", 0.022);

        // "Snow shading" is the master switch for all of the fine-grained
        // snow material behavior; off is the neutral terrain shader — same
        // geometry and base lighting, none of the multi-scale normals, SSS,
        // sastrugi or glints. Reading the sliders through this gate (rather
        // than the toggle overwriting them) means the user's own tuning
        // survives flipping it back on.
        const snowShading = S.enableSnowShading;
        m.setFloat("detailStrength", snowShading ? S.detailNormalStrength : 0);
        m.setFloat("glintIntensity", snowShading ? S.glintIntensity : 0);
        m.setFloat("glintGrazing", S.glintGrazing);
        m.setFloat("sssStrength", snowShading ? S.sssStrength : 0);
        m.setFloat("sssRadius", S.sssRadius);

        m.setFloat("fogDensity", S.fogDensity);
        m.setFloat("fogHeightFalloff", S.fogHeightFalloff);
        m.setFloat("fogStart", S.fogStart);
        m.setFloat("aerialStrength", S.aerialStrength);
        m.setFloat("ambientIntensity", S.ambientIntensity);
        m.setFloat("ambientFloor", S.ambientFloor);

        m.setVector2("deformCenter", deformCenter);
        m.setFloat("deformSize", deformSize);
        m.setFloat("deformTexel", this.deform.texel);
        m.setFloat("deformDepthScale", S.deformDepth);

        m.setFloat("debugMode", DEBUG_MODES[S.debugView] ?? 0);
        _screen.set(
            this.scene.getEngine().getRenderWidth(),
            this.scene.getEngine().getRenderHeight()
        );
        m.setVector2("screenSize", _screen);
        m.wireframe = S.wireframe;

        // ---- depth prepass ----------------------------------------------
        // Same clipmap parameters as everything else, for the same reason.
        const pm = this.prepassMat;
        if (pm) {
            pm.setVector3("cameraPos", cameraPos);
            pm.setVector2("lodCenter", _lod);
            pm.setFloat("baseSpacing", BASE_SPACING);
            pm.setFloat("gridHalfN", GRID_HALF_N);
            pm.setVector2("worldOrigin", hf.origin);
            pm.setFloat("worldSize", hf.size);
            pm.setFloat("heightRes", 4096);
            pm.setFloat("windAngle", windAngle);
            // Must match the beauty pass's gate exactly, or the depth prepass
            // places vertices somewhere the beauty pass does not.
            pm.setFloat("sastrugiAmp", S.enableSnowShading ? S.sastrugiStrength : 0);
            pm.setVector2("deformCenter", deformCenter);
            pm.setFloat("deformSize", deformSize);
            pm.setFloat("deformDepthScale", S.deformDepth);
        }

        // ---- shadow-pass materials --------------------------------------
        // These must see the identical clipmap parameters, or the depth pass
        // would place vertices somewhere the beauty pass does not.
        const dm = this._depthMats;
        if (dm) {
            for (let i = 0; i < dm.length; i++) {
                const d = dm[i];
                d.setVector3("cameraPos", cameraPos);
                d.setVector2("lodCenter", _lod);
                d.setFloat("baseSpacing", BASE_SPACING);
                d.setFloat("gridHalfN", GRID_HALF_N);
                d.setVector2("worldOrigin", hf.origin);
                d.setFloat("worldSize", hf.size);
                d.setFloat("heightRes", 4096);
                d.setFloat("windAngle", windAngle);
                // Same gate as the beauty and prepass materials — see there.
                d.setFloat("sastrugiAmp", S.enableSnowShading ? S.sastrugiStrength : 0);
                d.setVector2("deformCenter", deformCenter);
                d.setFloat("deformSize", deformSize);
                d.setFloat("deformDepthScale", S.deformDepth);
            }
        }
    }

    /** @param {number} x @param {number} z */
    heightAt(x, z) {
        return this.heightfield.heightAt(x, z);
    }

    /** The pure baked height, bypassing the world sandbox's overlay. See heightfield.js. */
    heightAtBase(x, z) {
        return this.heightfield.heightAtBase(x, z);
    }

    /** @param {number} x @param {number} z @param {Vector3} out */
    normalAt(x, z, out) {
        return this.heightfield.normalAt(x, z, out);
    }

    dispose() {
        this.mesh.dispose();
        this.material.dispose();
        this.detailTex.dispose();
        this.deform.dispose();
        this.heightfield.dispose();
        this._sandboxTexPlaceholder.dispose();
        this._sandboxFieldTexPlaceholder.dispose();
    }
}
