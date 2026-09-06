/**
 * Debug HUD — an fps readout (always on), a debug-view switcher, and the
 * SCHEMA-driven graphics settings panel, all toggled together by F1 /
 * backtick / the touch gear button / gamepad Start.
 *
 * Screen-space Babylon GUI (`AdvancedDynamicTexture.CreateFullscreenUI`), not
 * a mesh in the world and not DOM: it can't end up mispositioned by camera
 * distance/FOV/forward-vector math the way the earlier billboarded in-world
 * panel could (and did — see git history around "Replace the broken
 * in-world settings panel"), and it isn't a second UI stack alongside
 * `touchControls.js`'s DOM overlay.
 *
 * The graphics panel is built directly from `core/settings.js`'s `SCHEMA` —
 * one slider/checkbox/enum-stepper per item, grouped exactly as SCHEMA
 * groups them (Sun & Sky, Atmosphere, Snow, Deformation, Character,
 * Snow-surf, Spells, Post), including every group's own master toggle
 * (enableSnowShading, enableDeformBuffer, enableSnowPhysics,
 * enableFootprints, enableSurfing, showWake, enableSpray, showSpells,
 * enableIce, enableWaterSpells, enableFancyPost) alongside its sub-controls —
 * not a hand-picked subset and not a renamed/consolidated "effects" toggle.
 * SCHEMA stays the single source of truth: add a field there and it appears
 * here with no further wiring.
 *
 * Interaction needs a free cursor, so opening the row releases pointer lock;
 * `overlayState.open` is exported so input.js's click-to-relock handler can
 * back off while it's up.
 */

import {
    AdvancedDynamicTexture, StackPanel, ScrollViewer, TextBlock, Slider,
    Checkbox, Button, Grid, Control,
} from "@babylonjs/gui";

import { S, SCHEMA, set } from "../core/settings.js";
import { stats, resetSpikes } from "../core/perf.js";

/** Shared with input.js so an open debug row doesn't also re-request pointer lock on click. */
export const overlayState = { open: false };

/** [debugView key, short button label] — mirrors `SCHEMA`'s "Debug view" enum in settings.js. */
const DEBUG_MODES = [
    ["beauty", "BTY"], ["deform", "DFM"], ["normals", "NRM"], ["depth", "DEP"],
    ["cascades", "CSC"], ["footprint", "FTP"], ["fineNormals", "FNM"], ["shadow", "SHD"],
    ["ndotl", "N·L"], ["shadowMap", "SHM"], ["albedo", "ALB"], ["sandbox", "SBX"],
];
const BTNS_PER_ROW = 6;

/** How often the fps readout repaints and a sample is logged, ms. */
const READOUT_INTERVAL_MS = 250;
/** Every Nth readout tick gets a console log line, so impact of a toggle is traceable over time. */
const LOG_EVERY_N_READOUTS = 8; // 250ms * 8 = 2s

export class Overlay {
    /** @param {import("@babylonjs/core/scene").Scene} scene */
    constructor(scene) {
        this.scene = scene;
        this.visible = false;
        this._acc = 0;
        this._readoutTick = 0;

        const ui = AdvancedDynamicTexture.CreateFullscreenUI("hud", true, scene);
        this.ui = ui;

        // --------------------------------------------------------- fps, always on
        const fps = new TextBlock("fps");
        fps.text = "— fps";
        fps.color = "#dbe6f2";
        fps.fontSize = 22;
        fps.fontFamily = "monospace";
        fps.outlineWidth = 3;
        fps.outlineColor = "#05080c";
        fps.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        fps.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        fps.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        fps.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        fps.paddingLeftInPixels = 14;
        fps.paddingTopInPixels = 10;
        fps.widthInPixels = 180;
        fps.heightInPixels = 28;
        ui.addControl(fps);
        this.fpsText = fps;

        // ------------------------------------------------- debug-view row, toggled
        const bar = new StackPanel("debugBar");
        bar.isVertical = true;
        bar.spacing = 4;
        bar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        bar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        bar.topInPixels = 8;
        bar.isVisible = false;
        ui.addControl(bar);
        this.bar = bar;

        /** @type {Record<string, Button>} */
        this.debugBtns = {};
        for (let i = 0; i < DEBUG_MODES.length; i += BTNS_PER_ROW) {
            const row = new StackPanel();
            row.isVertical = false;
            row.heightInPixels = 40;
            row.spacing = 4;
            bar.addControl(row);
            for (let j = i; j < Math.min(i + BTNS_PER_ROW, DEBUG_MODES.length); j++) {
                const [key, label] = DEBUG_MODES[j];
                const b = Button.CreateSimpleButton("dbg_" + key, label);
                b.widthInPixels = 60;
                b.heightInPixels = 36;
                b.color = "#8fa3b8";
                b.thickness = 1;
                b.cornerRadius = 4;
                b.fontSize = 14;
                if (b.textBlock) b.textBlock.color = "#dbe6f2";
                b.onPointerClickObservable.add(() => {
                    set("debugView", key);
                    this._syncDebugButtons();
                });
                row.addControl(b);
                this.debugBtns[key] = b;
            }
        }
        this._syncDebugButtons();

        // -------------------------------------------------- graphics panel, toggled
        // A ScrollViewer, not a plain StackPanel: SCHEMA has 8 groups and dozens of
        // items, taller than a phone screen at readable font sizes, so it has to
        // scroll rather than clip or shrink to unreadable.
        const scroll = new ScrollViewer("graphicsScroll");
        scroll.width = "min(92%, 520px)";
        scroll.heightInPixels = Math.max(220, Math.round(window.innerHeight * 0.6));
        scroll.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        scroll.topInPixels = 120;
        scroll.barColor = "#8fc4e8";
        scroll.barBackground = "rgba(143,196,232,0.12)";
        scroll.thickness = 0;
        scroll.background = "rgba(8,12,19,0.72)";
        scroll.isVisible = false;
        ui.addControl(scroll);
        this.graphicsScroll = scroll;

        const panel = new StackPanel("graphicsPanel");
        panel.isVertical = true;
        panel.paddingTopInPixels = 12;
        panel.paddingBottomInPixels = 24;
        panel.paddingLeftInPixels = 12;
        panel.paddingRightInPixels = 12;
        panel.spacing = 2;
        scroll.addControl(panel);
        this.graphicsPanel = panel;

        /** @type {Array<{k:string, sync:() => void}>} */
        this.widgets = [];
        for (let g = 0; g < SCHEMA.length; g++) this._mkGroup(SCHEMA[g]);
    }

    _addGroupHeader(text) {
        const t = new TextBlock("h_" + text);
        t.text = text.toUpperCase();
        t.color = "#6f8296";
        t.fontSize = 13;
        t.heightInPixels = 32;
        t.paddingTopInPixels = 10;
        t.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.graphicsPanel.addControl(t);
    }

    /** One SCHEMA group -> a header plus one row per item (slider / checkbox / enum stepper). */
    _mkGroup(group) {
        this._addGroupHeader(group.group);
        for (let i = 0; i < group.items.length; i++) {
            const it = group.items[i];
            const row = new Grid();
            row.heightInPixels = 34;
            row.addColumnDefinition(0.5);
            row.addColumnDefinition(0.5);

            const lab = new TextBlock();
            lab.text = it.l;
            lab.color = "#8fa3b8";
            lab.fontSize = 14;
            lab.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            row.addControl(lab, 0, 0);

            if (it.t === "f") {
                const wrap = new StackPanel();
                wrap.isVertical = false;
                wrap.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                wrap.height = 1;

                const s = new Slider();
                s.minimum = it.min;
                s.maximum = it.max;
                s.value = S[it.k];
                s.step = it.step;
                s.widthInPixels = 120;
                s.heightInPixels = 24;
                s.color = "#8fc4e8";
                s.background = "rgba(143,196,232,0.18)";
                s.onValueChangedObservable.add((n) => {
                    set(it.k, n);
                    v.text = fmtNum(n, it.step);
                });

                const v = new TextBlock();
                v.text = fmtNum(S[it.k], it.step);
                v.color = "#dbe6f2";
                v.fontSize = 13;
                v.widthInPixels = 56;
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
                cb.widthInPixels = 26;
                cb.heightInPixels = 26;
                cb.isChecked = !!S[it.k];
                cb.color = "#eaf4ff";
                cb.background = "rgba(143,196,232,0.16)";
                cb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                cb.onIsCheckedChangedObservable.add((val) => set(it.k, val));
                row.addControl(cb, 0, 1);
                this.widgets.push({ k: it.k, sync: () => (cb.isChecked = !!S[it.k]) });
            } else if (it.t === "e") {
                const wrap = new StackPanel();
                wrap.isVertical = false;
                wrap.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                wrap.height = 1;

                const val = new TextBlock();
                val.text = String(S[it.k]);
                val.color = "#dbe6f2";
                val.fontSize = 13;
                val.widthInPixels = 90;
                val.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

                const step = (dir) => {
                    const idx = it.opts.indexOf(S[it.k]);
                    const next = it.opts[(idx + dir + it.opts.length) % it.opts.length];
                    set(it.k, next);
                    val.text = String(next);
                };
                const prev = Button.CreateSimpleButton("prev_" + it.k, "‹");
                this._styleSmallButton(prev);
                prev.onPointerClickObservable.add(() => step(-1));
                const next = Button.CreateSimpleButton("next_" + it.k, "›");
                this._styleSmallButton(next);
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
                badge.fontSize = 13;
                badge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                row.addControl(badge, 0, 1);
            }

            this.graphicsPanel.addControl(row);
        }
    }

    _styleSmallButton(b) {
        b.color = "#8fa3b8";
        b.background = "rgba(143,196,232,0.10)";
        b.thickness = 1;
        b.cornerRadius = 4;
        b.fontSize = 16;
        b.widthInPixels = 32;
        b.heightInPixels = 28;
        if (b.textBlock) b.textBlock.color = "#dbe6f2";
    }

    _syncWidgets() {
        for (let i = 0; i < this.widgets.length; i++) this.widgets[i].sync();
    }

    _syncDebugButtons() {
        for (const key in this.debugBtns) {
            this.debugBtns[key].background =
                S.debugView === key ? "rgba(143,196,232,0.45)" : "rgba(8,12,19,0.65)";
        }
    }

    /** Show/hide the debug-view row, and hand pointer control to a free cursor while it's up. */
    toggle() {
        this.visible = !this.visible;
        this.bar.isVisible = this.visible;
        this.graphicsScroll.isVisible = this.visible;
        overlayState.open = this.visible;
        if (this.visible) {
            this._syncDebugButtons();
            this._syncWidgets();
            if (document.pointerLockElement) document.exitPointerLock();
        }
    }

    /** @param {number} dtMs */
    update(dtMs) {
        this._acc += dtMs;
        if (this._acc < READOUT_INTERVAL_MS) return;
        this._acc = 0;

        this.fpsText.text = stats.fps.toFixed(0) + " fps · " + stats.fpsLow.toFixed(0) + " low";
        this.fpsText.color = stats.fps < 60 ? "#e8734f" : stats.fps < 88 ? "#e8b04f" : "#dbe6f2";

        // Logged (not just displayed) so a toggle's frame-time impact can be
        // read back after the fact instead of eyeballed live off the HUD.
        this._readoutTick++;
        if (this._readoutTick >= LOG_EVERY_N_READOUTS) {
            this._readoutTick = 0;
            console.log(
                "[fps] median=" + stats.fps.toFixed(1) +
                " low1%=" + stats.fpsLow.toFixed(1) +
                " gpu=" + stats.gpuMs.toFixed(2) + "ms" +
                " draws=" + stats.drawCalls +
                " tris=" + stats.triangles +
                " debugView=" + S.debugView
            );
        }
    }

    resetSpikes() {
        resetSpikes();
    }
}

function fmtNum(v, step) {
    if (step >= 1) return v.toFixed(0);
    if (step >= 0.01) return v.toFixed(2);
    if (step >= 0.001) return v.toFixed(3);
    return v.toFixed(4);
}
