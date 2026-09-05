/**
 * Debug HUD — an fps readout (always on) plus a debug-view switcher (toggled
 * by F1 / backtick / the touch gear button / gamepad Start).
 *
 * Screen-space Babylon GUI (`AdvancedDynamicTexture.CreateFullscreenUI`), not
 * a mesh in the world and not DOM: it can't end up mispositioned by camera
 * distance/FOV/forward-vector math the way a billboarded in-world panel can,
 * and it isn't a second UI stack alongside `touchControls.js`'s DOM overlay.
 *
 * The shader/art tuning knobs (sun, atmosphere, snow, post, presets, …) live
 * in `core/settings.js`'s `SCHEMA` for whoever is tuning the look from code —
 * they are not runtime player-facing controls and have no widget here.
 *
 * Interaction needs a free cursor, so opening the debug-view row releases
 * pointer lock; `overlayState.open` is exported so input.js's click-to-relock
 * handler can back off while it's up.
 */

import {
    AdvancedDynamicTexture, StackPanel, TextBlock, Button, Control,
} from "@babylonjs/gui";

import { S, set } from "../core/settings.js";
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
        overlayState.open = this.visible;
        if (this.visible) {
            this._syncDebugButtons();
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
