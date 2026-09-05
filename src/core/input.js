/**
 * Raw input state. Everything lands in one mutable struct that systems poll —
 * no events fired into game code, no per-frame allocation.
 *
 * Mouse look uses pointer lock, which frees the right button for snow-surf.
 *
 * Touch (twin-stick overlay) and gamepad each keep their own state object
 * (`touchState` / `gamepadState`) with no knowledge of this module, so they
 * can't form an import cycle with it. `pollInput` is the one place that
 * reconciles all three sources into `input` — continuous axes take
 * whichever source is actively deflected (touch > gamepad > keyboard for
 * movement; mouse, touch and gamepad look all just add their contribution),
 * level state (sprint/surf/held-cast) is OR'd, and edge state (a spell
 * press) is consumed once from whichever source set it.
 */

import { touchState, isTouchDevice } from "../ui/touchControls.js";
import { gamepadState, pollGamepad } from "./gamepad.js";
import { S } from "./settings.js";
import { overlayState } from "../ui/overlay.js";

export const input = {
    // Movement axes, camera-relative, already normalised to a unit disc.
    moveX: 0,
    moveZ: 0,
    moving: false,

    // Accumulated mouse delta since last `endFrame()`, in radians.
    lookX: 0,
    lookY: 0,

    // Zoom, consumed by the camera rig.
    zoomDelta: 0,

    surf: false, // RMB held
    sprint: false, // shift

    /** @type {number} 0 = none, else 1..5 — set on keydown, cleared each frame */
    spellPressed: 0,
    /** @type {boolean} spell 2 (Ribbon) is a held cast */
    spellHeld2: false,

    /** @type {number} world-sandbox tool cycle: 0 = none, -1 = previous, +1 = next — set on keydown, cleared each frame */
    toolCyclePressed: 0,

    locked: false,
};

const keys = Object.create(null);

const LOOK_SCALE = 0.0022;
const STICK_LOOK_RATE = 2.6; // rad/s at full stick deflection (touch + gamepad)
const STICK_ZOOM_RATE = 1.0; // input.zoomDelta units/s at full trigger/button

/** @type {(() => void)|null} */
let onToggleOverlay = null;

// Mirrors of level state that mouse/keyboard events set directly, kept
// private so `pollInput` can OR them together with touch/gamepad each frame
// without a source's absence (e.g. a released touch button) stomping a
// value another source is still holding.
let mouseSurfBtn = false;
let kbSpellHeld2 = false;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onToggleOverlay?: () => void }} [hooks]
 */
export function initInput(canvas, hooks) {
    onToggleOverlay = hooks?.onToggleOverlay ?? null;

    canvas.addEventListener("click", () => {
        // Pointer lock is a desktop-mouse concept; touch devices drive look
        // through the twin-stick overlay instead, and requesting it there
        // just produces an unwanted permission prompt. Also skipped while
        // the settings panel is up: it released the pointer for a free
        // cursor, and a click meant for one of its controls must not
        // immediately recapture the mouse.
        if (!input.locked && !isTouchDevice() && !overlayState.open) canvas.requestPointerLock();
    });

    document.addEventListener("pointerlockchange", () => {
        input.locked = document.pointerLockElement === canvas;
        if (!input.locked) {
            // Drop held state so the character doesn't run off while unfocused.
            for (const k in keys) keys[k] = false;
            mouseSurfBtn = false;
            kbSpellHeld2 = false;
        }
    });

    document.addEventListener("mousemove", (e) => {
        if (!input.locked) return;
        input.lookX += e.movementX * LOOK_SCALE;
        input.lookY += e.movementY * LOOK_SCALE;
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("mousedown", (e) => {
        if (!input.locked) return;
        if (e.button === 2) mouseSurfBtn = true;
    });

    document.addEventListener("mouseup", (e) => {
        if (e.button === 2) mouseSurfBtn = false;
    });

    document.addEventListener(
        "wheel",
        (e) => {
            if (!input.locked) return;
            e.preventDefault();
            input.zoomDelta += e.deltaY * 0.0016;
        },
        { passive: false }
    );

    window.addEventListener("keydown", (e) => {
        // Overlay toggle works whether or not the pointer is locked.
        if (e.code === "F1" || e.code === "Backquote") {
            e.preventDefault();
            onToggleOverlay?.();
            return;
        }
        if (e.repeat) return;
        keys[e.code] = true;

        const n = SPELL_KEYS[e.code];
        if (n) {
            input.spellPressed = n;
            if (n === 2) kbSpellHeld2 = true;
        }

        // World-sandbox tool cycle. Q/E rather than the number row: 1-5 are
        // already spells, and a prev/next pair scales to however many tools
        // exist without needing one key per tool.
        if (e.code === "KeyQ") input.toolCyclePressed = -1;
        else if (e.code === "KeyE") input.toolCyclePressed = 1;
    });

    window.addEventListener("keyup", (e) => {
        keys[e.code] = false;
        if (SPELL_KEYS[e.code] === 2) kbSpellHeld2 = false;
    });

    window.addEventListener("blur", () => {
        for (const k in keys) keys[k] = false;
        mouseSurfBtn = false;
        kbSpellHeld2 = false;
    });
}

const SPELL_KEYS = {
    Digit1: 1,
    Digit2: 2,
    Digit3: 3,
    Digit4: 4,
    Digit5: 5,
};

/**
 * Resolve keyboard, touch and gamepad into the final per-frame axes and
 * button state. Called once per frame before update, with the frame's dt in
 * seconds — needed because touch/gamepad look and zoom are rate-based
 * (a held stick keeps turning), unlike the mouse's per-event delta.
 */
export function pollInput(dt) {
    // "Camera/Input" off: zero everything before anything downstream reads
    // it this frame, including whatever mousemove/wheel accumulated between
    // frames — character and camera coast to a stop and stay there rather
    // than continuing to respond.
    if (!S.inputActive) {
        input.moveX = 0;
        input.moveZ = 0;
        input.moving = false;
        input.lookX = 0;
        input.lookY = 0;
        input.zoomDelta = 0;
        input.surf = false;
        input.sprint = false;
        input.spellPressed = 0;
        input.spellHeld2 = false;
        input.toolCyclePressed = 0;
        pollGamepad();
        return;
    }

    let x = 0;
    let z = 0;
    if (keys.KeyW || keys.ArrowUp) z += 1;
    if (keys.KeyS || keys.ArrowDown) z -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;

    // Clamp to a unit disc so diagonals aren't faster.
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) {
        x /= len;
        z /= len;
    }
    const kbSprint = !!(keys.ShiftLeft || keys.ShiftRight);

    pollGamepad();

    // Movement: whichever stick is actually deflected wins outright, rather
    // than blending — mixing a held WASD key with a resting analog stick at
    // 0 would otherwise fight itself.
    if (touchState.moveActive) {
        x = touchState.moveX;
        z = touchState.moveZ;
    } else if (gamepadState.moveActive) {
        x = gamepadState.moveX;
        z = gamepadState.moveZ;
    }
    input.moveX = x;
    input.moveZ = z;
    input.moving = Math.hypot(x, z) > 0.001;

    input.sprint = kbSprint || touchState.sprint || gamepadState.sprint;
    input.surf = S.enableSurfing && (mouseSurfBtn || touchState.surf || gamepadState.surf);

    // Look: the mouse already wrote its delta for this frame via
    // mousemove; sticks are rate-based, so they add on top of that.
    if (touchState.lookActive) {
        input.lookX += touchState.lookX * STICK_LOOK_RATE * dt;
        input.lookY += touchState.lookY * STICK_LOOK_RATE * dt;
    }
    if (gamepadState.lookActive) {
        input.lookX += gamepadState.lookX * STICK_LOOK_RATE * dt;
        input.lookY += gamepadState.lookY * STICK_LOOK_RATE * dt;
    }

    if (touchState.pinchZoomDelta) {
        input.zoomDelta += touchState.pinchZoomDelta;
        touchState.pinchZoomDelta = 0;
    }
    if (gamepadState.zoomActive) input.zoomDelta += gamepadState.zoomDelta * STICK_ZOOM_RATE * dt;

    // Edge-triggered spell press: consume from whichever source set it.
    if (touchState.spellPressed) {
        input.spellPressed = touchState.spellPressed;
        touchState.spellPressed = 0;
    }
    if (gamepadState.spellPressed) {
        input.spellPressed = gamepadState.spellPressed;
        gamepadState.spellPressed = 0;
    }
    input.spellHeld2 = kbSpellHeld2 || touchState.spellHeld2 || gamepadState.spellHeld2;

    if (touchState.toolCyclePressed) {
        input.toolCyclePressed = touchState.toolCyclePressed;
        touchState.toolCyclePressed = 0;
    }
    if (gamepadState.toolCyclePressed) {
        input.toolCyclePressed = gamepadState.toolCyclePressed;
        gamepadState.toolCyclePressed = 0;
    }

    if (gamepadState.overlayTogglePressed) {
        gamepadState.overlayTogglePressed = false;
        onToggleOverlay?.();
    }
}

/** Clear per-frame accumulators. Called at the very end of the frame. */
export function endFrame() {
    input.lookX = 0;
    input.lookY = 0;
    input.zoomDelta = 0;
    input.spellPressed = 0;
    input.toolCyclePressed = 0;
}

export function isDown(code) {
    return !!keys[code];
}
