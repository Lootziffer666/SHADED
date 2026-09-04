/**
 * Standard Gamepad API polling — Xbox/PlayStation-style controllers.
 *
 * Polled once per frame from `pollInput`. Nothing here touches `input`
 * directly (no circular dependency on input.js): it just keeps its own
 * `gamepadState`, and `pollInput` folds that in alongside keyboard/mouse and
 * touch, the same way three input sources already coexist there.
 *
 * Mapping (Standard Gamepad layout):
 *   left stick    move        right stick   look
 *   A             sprint      B             surf (snow-surf, hold)
 *   X / Y         spell 1/2   LB / RB       spell 3/4
 *   D-pad up      spell 5     Start         toggle settings overlay
 *   LT / RT       zoom in/out (analog)
 */

const DEADZONE = 0.18;

export const gamepadState = {
    connected: false,

    moveActive: false,
    moveX: 0,
    moveZ: 0,

    lookActive: false,
    lookX: 0,
    lookY: 0,

    sprint: false,
    surf: false,

    zoomActive: false,
    zoomDelta: 0, // -1..1, this frame's trigger balance

    /** 0 = none, else 1..5 — consumed (reset to 0) by whoever reads it. */
    spellPressed: 0,
    spellHeld2: false,

    /** Consumed (reset to false) by whoever reads it. */
    overlayTogglePressed: false,
};

let prevButtons = [];
let toast = null;
let toastTimer = 0;

function deadzone(v) {
    const a = Math.abs(v);
    if (a < DEADZONE) return 0;
    return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

/** Call once per frame. Reads the first connected pad, if any. */
export function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
            gp = pads[i];
            break;
        }
    }

    if (!gp) {
        gamepadState.connected = false;
        gamepadState.moveActive = false;
        gamepadState.lookActive = false;
        gamepadState.sprint = false;
        gamepadState.surf = false;
        gamepadState.zoomActive = false;
        gamepadState.spellHeld2 = false;
        prevButtons = [];
        return;
    }
    gamepadState.connected = true;

    const ax = gp.axes;
    const mx = deadzone(ax[0] || 0);
    const mz = -deadzone(ax[1] || 0); // stick-up (negative Y) is forward
    const mLen = Math.hypot(mx, mz);
    gamepadState.moveActive = mLen > 0.001;
    gamepadState.moveX = mLen > 1 ? mx / mLen : mx;
    gamepadState.moveZ = mLen > 1 ? mz / mLen : mz;

    const lx = deadzone(ax[2] || 0);
    const ly = deadzone(ax[3] || 0);
    gamepadState.lookActive = Math.abs(lx) > 0.001 || Math.abs(ly) > 0.001;
    gamepadState.lookX = lx;
    gamepadState.lookY = ly;

    const pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const value = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const justPressed = (i) => pressed(i) && !prevButtons[i];

    gamepadState.sprint = pressed(0); // A
    gamepadState.surf = pressed(1); // B
    gamepadState.spellHeld2 = pressed(3); // Y, held cast

    if (justPressed(2)) gamepadState.spellPressed = 1; // X
    else if (justPressed(3)) gamepadState.spellPressed = 2; // Y
    else if (justPressed(4)) gamepadState.spellPressed = 3; // LB
    else if (justPressed(5)) gamepadState.spellPressed = 4; // RB
    else if (justPressed(12)) gamepadState.spellPressed = 5; // D-pad up

    if (justPressed(9)) gamepadState.overlayTogglePressed = true; // Start

    const lt = value(6);
    const rt = value(7);
    gamepadState.zoomActive = lt > 0.04 || rt > 0.04;
    gamepadState.zoomDelta = rt - lt;

    prevButtons = gp.buttons.map((b) => b.pressed);
}

// ----------------------------------------------------------- connect toast
// A brief on-screen confirmation so plugging in a pad doesn't feel like it
// silently did nothing.

function ensureToast() {
    if (toast) return toast;
    const el = document.createElement("div");
    el.style.cssText =
        "position:fixed;left:50%;top:14px;z-index:90;transform:translate(-50%,-14px);" +
        "padding:7px 14px;border-radius:999px;background:rgba(8,12,19,0.78);" +
        "border:1px solid rgba(143,196,232,0.28);color:#dbe6f2;" +
        "font:500 11px ui-sans-serif,system-ui,sans-serif;letter-spacing:0.06em;" +
        "opacity:0;transition:opacity 220ms ease,transform 220ms ease;pointer-events:none;";
    document.body.appendChild(el);
    toast = el;
    return el;
}

function showToast(text) {
    const el = ensureToast();
    el.textContent = text;
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,0)";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translate(-50%,-14px)";
    }, 1800);
}

if (typeof window !== "undefined") {
    window.addEventListener("gamepadconnected", (e) => {
        showToast("controller connected — " + (e.gamepad.id || "gamepad"));
    });
    window.addEventListener("gamepaddisconnected", () => {
        showToast("controller disconnected");
    });
}
