/**
 * Settings + performance panel — a real object in the world, not a screen
 * overlay. F1 / backtick / the touch gear button / gamepad Start summons a
 * plane a metre in front of the player, billboarded to face the camera, with
 * the whole control tree projected onto it via `@babylonjs/gui`'s
 * `AdvancedDynamicTexture.CreateForMesh`. Closing it just hides the mesh.
 *
 * Interaction needs a free cursor, so opening the panel releases pointer
 * lock; `overlayState.open` is exported so input.js's click-to-relock
 * handler can back off while it's up, or a click meant for a checkbox would
 * also recapture the mouse.
 */

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
    AdvancedDynamicTexture, StackPanel, ScrollViewer, TextBlock, Slider,
    Checkbox, Button, Grid, Control,
} from "@babylonjs/gui";

import { S, SCHEMA, set, applyPreset } from "../core/settings.js";
import { stats, systemMs, spikes, resetSpikes } from "../core/perf.js";

/** Shared with input.js so an open panel doesn't also re-request pointer lock on click. */
export const overlayState = { open: false };

const PANEL_W = 1.35; // metres
const PANEL_H = 1.95;
const TEX_W = 900;
const TEX_H = 1300;
/** Distance and vertical offset the panel floats at in front of the camera. */
const FLOAT_DIST = 1.15;
const FLOAT_DROP = 0.12;

const ROW_H = 42;
const LABEL_W = 340;
const FONT = 24;
const FONT_SMALL = 20;

export class Overlay {
    /**
     * @param {{ rig?: import("../core/camera.js").CameraRig,
     *           character?: import("../character/controller.js").CharacterController }} [refs]
     * @param {import("@babylonjs/core/scene").Scene} scene
     */
    constructor(refs, scene) {
        this.scene = scene;
        this.rig = refs?.rig ?? null;
        this.character = refs?.character ?? null;

        this.mesh = MeshBuilder.CreatePlane("settingsPanel", { width: PANEL_W, height: PANEL_H }, scene);
        this.mesh.isVisible = false;
        this.mesh.isPickable = true;
        this.mesh.renderingGroupId = 2;
        this.mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;

        const adt = AdvancedDynamicTexture.CreateForMesh(this.mesh, TEX_W, TEX_H, true);
        adt.background = "#0a0f16";
        this.adt = adt;

        const scroll = new ScrollViewer("settingsScroll");
        scroll.width = 1;
        scroll.height = 1;
        scroll.barColor = "#8fc4e8";
        scroll.barBackground = "rgba(143,196,232,0.12)";
        scroll.thickness = 0;
        adt.addControl(scroll);

        const root = new StackPanel("settingsRoot");
        root.width = TEX_W - 40 + "px";
        root.isVertical = true;
        root.paddingTopInPixels = 20;
        root.paddingBottomInPixels = 40;
        root.spacing = 2;
        scroll.addControl(root);
        this.root = root;

        // --------------------------------------------------------- header
        const hdr = this._mkHeaderText("SNOWFLOW  ·  press F1 to close");
        root.addControl(hdr);

        // --------------------------------------------------------- perf
        this._addGroupHeader("Performance");
        const numsGrid = this._mkNumGrid();
        root.addControl(numsGrid.grid);
        this.readouts = numsGrid.readouts;
        this._mkNum(numsGrid, "fps", "fps");
        this._mkNum(numsGrid, "fpsLow", "1% low");
        this._mkNum(numsGrid, "median", "median");
        this._mkNum(numsGrid, "p99", "99th");
        this._mkNum(numsGrid, "gpu", "gpu ms");
        this._mkNum(numsGrid, "draws", "draws");
        this._mkNum(numsGrid, "tris", "tris");
        this._mkNum(numsGrid, "spikes", "spikes");
        this._mkNum(numsGrid, "res", "res");

        this._addGroupHeader("Frame budget");
        this.budgetGrid = this._mkNumGrid();
        root.addControl(this.budgetGrid.grid);
        /** @type {Map<string, TextBlock>} */
        this.budgetRows = new Map();

        // ------------------------------------------------------- camera
        this._addGroupHeader("Camera");
        const camGrid = this._mkNumGrid();
        root.addControl(camGrid.grid);
        this._mkNum(camGrid, "camPos", "eye");
        this._mkNum(camGrid, "camAng", "yaw / pitch");
        this._mkNum(camGrid, "camArm", "arm / fov");
        this._mkNum(camGrid, "chrPos", "player");
        this._mkNum(camGrid, "chrMot", "speed / facing");
        Object.assign(this.readouts, camGrid.readouts);

        const pose = new TextBlock("pose");
        pose.text = "—";
        pose.color = "#7f93a8";
        pose.fontSize = FONT_SMALL - 4;
        pose.textWrapping = true;
        pose.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        pose.height = "90px";
        pose.paddingTopInPixels = 6;
        root.addControl(pose);
        this.poseEl = pose;

        const copyBtn = Button.CreateSimpleButton("copyPose", "copy pose");
        this._styleButton(copyBtn);
        copyBtn.height = "44px";
        copyBtn.onPointerClickObservable.add(() => this._copyPose(copyBtn));
        root.addControl(copyBtn);

        // ------------------------------------------------------- presets
        this._addGroupHeader("Quality");
        const presetRow = new StackPanel("presets");
        presetRow.isVertical = false;
        presetRow.height = "44px";
        presetRow.spacing = 8;
        root.addControl(presetRow);
        this.presetBtns = {};
        for (const name of ["ultra", "high", "balanced"]) {
            const b = Button.CreateSimpleButton("preset_" + name, name);
            this._styleButton(b);
            b.widthInPixels = (TEX_W - 40 - 16) / 3;
            b.onPointerClickObservable.add(() => {
                applyPreset(name);
                this._syncPresets();
                this._syncWidgets();
            });
            presetRow.addControl(b);
            this.presetBtns[name] = b;
        }
        this._syncPresets();

        // ------------------------------------------------------- controls
        /** @type {Array<{k:string, sync:() => void}>} */
        this.widgets = [];
        for (let g = 0; g < SCHEMA.length; g++) this._mkGroup(SCHEMA[g]);

        this._acc = 0;
        this._camAcc = 0;
        this._pose = "";
        this.visible = false;
    }

    // --------------------------------------------------------------- build

    _mkHeaderText(text) {
        const t = new TextBlock("hdr");
        t.text = text;
        t.color = "#e6eff8";
        t.fontSize = FONT + 4;
        t.height = "50px";
        t.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        return t;
    }

    _addGroupHeader(text) {
        const t = new TextBlock("h_" + text);
        t.text = text.toUpperCase();
        t.color = "#6f8296";
        t.fontSize = FONT_SMALL - 2;
        t.height = "40px";
        t.paddingTopInPixels = 14;
        t.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.root.addControl(t);
    }

    /** A grid of label/value rows — one stat per row, label left / value right. */
    _mkNumGrid() {
        const grid = new Grid("nums");
        grid.width = 1;
        grid.addColumnDefinition(0.5);
        grid.addColumnDefinition(0.5);
        return { grid, readouts: Object.create(null), _row: 0 };
    }

    _mkNum(g, key, label) {
        const row = g._row;
        g.grid.addRowDefinition(ROW_H, true);
        const lab = new TextBlock();
        lab.text = label;
        lab.color = "#6f8296";
        lab.fontSize = FONT_SMALL;
        lab.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        const val = new TextBlock();
        val.text = "—";
        val.color = "#dbe6f2";
        val.fontSize = FONT_SMALL;
        val.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        g.grid.addControl(lab, row, 0);
        g.grid.addControl(val, row, 1);
        g._row++;
        g.grid.heightInPixels = g._row * ROW_H;
        g.readouts[key] = val;
        g.readouts[key + "_row"] = lab;
    }

    _mkGroup(group) {
        this._addGroupHeader(group.group);
        for (let i = 0; i < group.items.length; i++) {
            const it = group.items[i];
            const row = new Grid();
            row.height = ROW_H + "px";
            row.addColumnDefinition(LABEL_W, true);
            row.addColumnDefinition(1);

            const lab = new TextBlock();
            lab.text = it.l;
            lab.color = "#8fa3b8";
            lab.fontSize = FONT_SMALL;
            lab.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            row.addControl(lab, 0, 0);

            if (it.t === "f") {
                const wrap = new StackPanel();
                wrap.isVertical = false;
                wrap.height = 1;

                const s = new Slider();
                s.minimum = it.min;
                s.maximum = it.max;
                s.value = S[it.k];
                s.step = it.step;
                s.widthInPixels = TEX_W - 40 - LABEL_W - 100;
                s.heightInPixels = ROW_H;
                s.color = "#8fc4e8";
                s.background = "rgba(143,196,232,0.18)";
                s.onValueChangedObservable.add((n) => {
                    set(it.k, n);
                    v.text = fmtNum(n, it.step);
                });

                const v = new TextBlock();
                v.text = fmtNum(S[it.k], it.step);
                v.color = "#dbe6f2";
                v.fontSize = FONT_SMALL;
                v.widthInPixels = 90;
                v.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;

                wrap.addControl(s);
                wrap.addControl(v);
                row.addControl(wrap, 0, 1);

                this.widgets.push({
                    k: it.k,
                    sync: () => {
                        s.value = S[it.k];
                        v.text = fmtNum(S[it.k], it.step);
                    },
                });
            } else if (it.t === "b") {
                const cb = new Checkbox();
                cb.widthInPixels = 34;
                cb.heightInPixels = 34;
                cb.isChecked = !!S[it.k];
                cb.color = "#eaf4ff";
                cb.background = "rgba(143,196,232,0.16)";
                cb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                cb.onIsCheckedChangedObservable.add((v) => set(it.k, v));
                row.addControl(cb, 0, 1);
                this.widgets.push({ k: it.k, sync: () => (cb.isChecked = !!S[it.k]) });
            } else if (it.t === "e") {
                const wrap = new StackPanel();
                wrap.isVertical = false;
                wrap.height = 1;
                wrap.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;

                const val = new TextBlock();
                val.text = String(S[it.k]);
                val.color = "#dbe6f2";
                val.fontSize = FONT_SMALL;
                val.widthInPixels = 140;
                val.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

                const step = (dir) => {
                    const idx = it.opts.indexOf(S[it.k]);
                    const next = it.opts[(idx + dir + it.opts.length) % it.opts.length];
                    set(it.k, next);
                    val.text = String(next);
                };
                const prev = Button.CreateSimpleButton("prev_" + it.k, "‹");
                this._styleButton(prev, true);
                prev.onPointerClickObservable.add(() => step(-1));
                const next = Button.CreateSimpleButton("next_" + it.k, "›");
                this._styleButton(next, true);
                next.onPointerClickObservable.add(() => step(1));

                wrap.addControl(prev);
                wrap.addControl(val);
                wrap.addControl(next);
                row.addControl(wrap, 0, 1);
                this.widgets.push({ k: it.k, sync: () => (val.text = String(S[it.k])) });
            } else if (it.t === "s") {
                // Static status row: no `S` key behind it, nothing to click —
                // structural systems that can't be toggled at runtime. See
                // the "Core (always on)" group in settings.js.
                const badge = new TextBlock();
                badge.text = "always on";
                badge.color = "#5c8fb0";
                badge.fontSize = FONT_SMALL;
                badge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                row.addControl(badge, 0, 1);
            }

            this.root.addControl(row);
        }
    }

    _styleButton(b, small) {
        b.color = "#8fa3b8";
        b.background = "rgba(143,196,232,0.10)";
        b.thickness = 1;
        b.cornerRadius = 4;
        b.fontSize = small ? FONT : FONT_SMALL;
        if (b.textBlock) b.textBlock.color = "#dbe6f2";
        if (small) {
            b.widthInPixels = 44;
            b.heightInPixels = ROW_H;
        }
    }

    _syncPresets() {
        for (const k in this.presetBtns) {
            const on = S.preset === k;
            this.presetBtns[k].background = on ? "rgba(143,196,232,0.30)" : "rgba(143,196,232,0.10)";
        }
    }

    _syncWidgets() {
        for (let i = 0; i < this.widgets.length; i++) this.widgets[i].sync();
    }

    // ------------------------------------------------------------- runtime

    /** Show/hide the panel, and hand pointer control to a free cursor while it's up. */
    toggle() {
        this.visible = !this.visible;
        this.mesh.isVisible = this.visible;
        overlayState.open = this.visible;
        if (this.visible) {
            this._syncWidgets();
            this._place();
            if (document.pointerLockElement) document.exitPointerLock();
        }
    }

    /** Float the panel in front of the camera, slightly below eye line. */
    _place() {
        const rig = this.rig;
        if (!rig) return;
        const cam = rig.camera;
        const f = rig.forward;
        this.mesh.position.set(
            cam.position.x + f.x * FLOAT_DIST,
            cam.position.y + f.y * FLOAT_DIST - FLOAT_DROP,
            cam.position.z + f.z * FLOAT_DIST
        );
    }

    /**
     * @param {number} dtMs
     * @param {import("@babylonjs/core/Engines/engine").Engine} engine
     */
    update(dtMs, engine) {
        if (!this.visible) return;

        this._place();

        this._camAcc += dtMs;
        if (this._camAcc >= 100) {
            this._camAcc = 0;
            this._updateCamera();
        }

        this._acc += dtMs;
        if (this._acc < 250) return;
        this._acc = 0;

        const r = this.readouts;
        this._txt(r.fps, stats.fps.toFixed(0));
        this._txt(r.fpsLow, stats.fpsLow.toFixed(0));
        this._txt(r.median, stats.median.toFixed(2));
        this._txt(r.p99, stats.p99.toFixed(2));
        this._txt(r.gpu, stats.gpuMs > 0 ? stats.gpuMs.toFixed(2) : "—");
        this._txt(r.draws, String(stats.drawCalls));
        this._txt(r.tris, fmtK(stats.triangles));
        this._txt(r.spikes, String(spikes.count));
        this._txt(r.res, engine.getRenderWidth() + "x" + engine.getRenderHeight());

        r.fps.color = stats.fps < 60 ? "#e8734f" : stats.fps < 88 ? "#e8b04f" : "#dbe6f2";
        r.fpsLow.color = stats.fpsLow < 60 ? "#e8734f" : stats.fpsLow < 75 ? "#e8b04f" : "#dbe6f2";
        r.spikes.color = spikes.count > 0 ? "#e8b04f" : "#dbe6f2";

        for (const name in systemMs) {
            let row = this.budgetRows.get(name);
            if (!row) {
                this._mkNum(this.budgetGrid, "sys_" + name, name);
                row = this.budgetGrid.readouts["sys_" + name];
                this.budgetRows.set(name, row);
            }
            this._txt(row, systemMs[name].toFixed(2));
        }
    }

    _updateCamera() {
        const rig = this.rig;
        const r = this.readouts;
        if (!rig) {
            this._txt(r.camPos, "no rig");
            return;
        }

        const p = rig.camera.position;
        this._txt(r.camPos, fmt2(p.x) + "  " + fmt2(p.y) + "  " + fmt2(p.z));
        this._txt(
            r.camAng,
            wrapDeg(rig.yaw * RAD).toFixed(1) + "°  " + signDeg(rig.pitch * RAD)
        );
        this._txt(
            r.camArm,
            rig.distance.toFixed(2) + " m  " + (rig.fov * RAD).toFixed(1) + "° v"
        );

        const c = this.character;
        if (c) {
            const q = c.position;
            this._txt(r.chrPos, fmt2(q.x) + "  " + fmt2(q.y) + "  " + fmt2(q.z));
            this._txt(
                r.chrMot,
                c.speed.toFixed(2) + " m/s  " + wrapDeg(c.facing * RAD).toFixed(0) + "°" +
                (c.surf > 0.01 ? "  surf " + c.surf.toFixed(2) : "")
            );
        } else {
            this._txt(r.chrPos, "—");
            this._txt(r.chrMot, "—");
        }

        this._pose = this._poseScript();
        this._txt(this.poseEl, this._pose);
    }

    _poseScript() {
        const rig = this.rig;
        if (!rig) return "—";
        const c = this.character;
        let s = "const s=SNOWFLOW;";
        if (c) {
            s +=
                "s.character.position.set(" +
                fmt2(c.position.x) + "," + fmt2(c.position.y) + "," + fmt2(c.position.z) +
                ");s.character.facing=" + c.facing.toFixed(3) + ";";
        }
        s +=
            "s.rig.yaw=" + rig.yaw.toFixed(3) +
            ";s.rig.pitch=" + rig.pitch.toFixed(3) +
            ";s.rig.distance=s.rig.distanceTarget=" + rig.distance.toFixed(2) + ";";
        return s;
    }

    _copyPose(btn) {
        const text = this._pose || this._poseScript();
        const done = (ok) => {
            btn.textBlock.text = ok ? "copied" : "see console";
            if (!ok) console.log(text);
            setTimeout(() => (btn.textBlock.text = "copy pose"), 1200);
        };
        try {
            navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
        } catch {
            done(false);
        }
    }

    /** Only touch a control when the string actually changed. */
    _txt(el, s) {
        if (el._v !== s) {
            el._v = s;
            el.text = s;
        }
    }

    resetSpikes() {
        resetSpikes();
    }
}

const RAD = 180 / Math.PI;

function fmt2(v) {
    const s = v.toFixed(2);
    return v < 0 ? s : " " + s;
}

function wrapDeg(d) {
    d %= 360;
    return d < 0 ? d + 360 : d;
}

function signDeg(d) {
    return (d >= 0 ? "+" : "") + d.toFixed(1) + "°";
}

function fmtNum(v, step) {
    if (step >= 1) return v.toFixed(0);
    if (step >= 0.01) return v.toFixed(2);
    if (step >= 0.001) return v.toFixed(3);
    return v.toFixed(4);
}

function fmtK(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
    return String(n);
}
