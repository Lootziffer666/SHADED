/**
 * Twin-stick touch overlay — movement (left) and look (right) sticks (via
 * nipplejs, MIT: https://github.com/yoannmoinet/nipplejs) plus hold/press
 * buttons for sprint, snow-surf, the five spells, and the world-sandbox's
 * prev/next tool cycle (next to the move stick — a build utility, not a
 * combat action, so it doesn't belong in the spell/run/surf cluster on the
 * right).
 *
 * Only mounts on touch-capable devices. Has no dependency on input.js (so
 * input.js can depend on this module without a cycle): it just keeps its own
 * `touchState`, exactly like `gamepadState` in core/gamepad.js, and whoever
 * polls input each frame folds both in.
 *
 * The two stick zones size themselves off `vmin` (recomputed on resize) so
 * the rig reads the same physical size in portrait and landscape, matching
 * the button cluster's own CSS `clamp()` sizing — only the button cluster's
 * gap shrinks under a short landscape viewport, where vertical room is
 * tightest.
 *
 * Hides itself entirely while a real gamepad is connected (checked at
 * mount and on every connect/disconnect) — a controller does everything
 * this overlay does, and does it better.
 */
import nipplejs from "nipplejs";

export const touchState = {
    moveActive: false,
    moveX: 0,
    moveZ: 0,

    lookActive: false,
    lookX: 0,
    lookY: 0,

    sprint: false,
    surf: false,

    /** Wheel-like accumulator, written by the two-finger pinch on open canvas. */
    pinchZoomDelta: 0,

    /** 0 = none, else 1..5 — consumed (reset to 0) by whoever reads it. */
    spellPressed: 0,
    spellHeld2: false,

    /** World-sandbox tool cycle: 0 = none, -1 = previous, +1 = next — consumed (reset to 0) by whoever reads it. */
    toolCyclePressed: 0,
};

/** Below this fraction of the stick's radius, input reads as centred/idle — big enough that a
 *  thumb resting near centre doesn't leak tiny unintended drift into movement/look. */
const STICK_DEADZONE = 0.16;
/** The pointer has to travel this fraction of the zone's own radius (not the full radius) to
 *  reach full deflection — i.e. full deflection is reached at DRAG_RADIUS * r, well inside the
 *  zone's edge, so an imprecise thumb still reaches max tilt without needing to drag all the way
 *  to (or past) the physical edge of the stick. */
const DRAG_RADIUS = 0.72;

/** True if any Standard Gamepad is currently connected. */
function hasConnectedGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
        if (pads[i]) return true;
    }
    return false;
}

export function isTouchDevice() {
    if (typeof navigator === "undefined") return false;
    return (
        (navigator.maxTouchPoints || 0) > 0 ||
        (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches)
    );
}

const CSS = `
#tc { position: fixed; inset: 0; z-index: 60; pointer-events: none; touch-action: none; }

#tc .cluster {
  position: absolute;
  bottom: max(16px, env(safe-area-inset-bottom) + 10px);
  display: flex; flex-direction: column; align-items: center; gap: 24px;
}
#tc .cluster.left { left: max(16px, env(safe-area-inset-left) + 10px); }
#tc .cluster.right { right: max(16px, env(safe-area-inset-right) + 10px); align-items: flex-end; }

#tc .stick-zone {
  position: relative; pointer-events: auto; touch-action: none;
  width: clamp(150px, 38vmin, 220px); height: clamp(150px, 38vmin, 220px);
}

#tc .row { display: flex; gap: 10px; }

#tc button {
  pointer-events: auto; touch-action: none; -webkit-touch-callout: none;
  -webkit-user-select: none; user-select: none;
  border-radius: 50%; border: 1px solid rgba(143, 196, 232, 0.28);
  background: rgba(8, 12, 19, 0.55); color: #dbe6f2;
  font: 500 clamp(9px, 2.2vmin, 12px) ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.04em; display: flex; align-items: center; justify-content: center;
  padding: 0;
}
#tc button.held-on {
  background: rgba(143, 196, 232, 0.42); border-color: rgba(234, 244, 255, 0.6);
}
#tc button.spell { width: clamp(34px, 8vmin, 46px); height: clamp(34px, 8vmin, 46px); }
#tc button.hold { width: clamp(56px, 12vmin, 76px); height: clamp(56px, 12vmin, 76px); }
#tc button.hold.primary { border-color: rgba(143, 196, 232, 0.55); }
#tc button.tool-cycle {
  width: clamp(38px, 9vmin, 50px); height: clamp(38px, 9vmin, 50px);
  font-size: clamp(16px, 4vmin, 22px);
}

#tc #tc-settings {
  position: absolute; pointer-events: auto;
  top: max(12px, env(safe-area-inset-top) + 8px);
  right: max(12px, env(safe-area-inset-right) + 8px);
  width: clamp(34px, 8vmin, 42px); height: clamp(34px, 8vmin, 42px);
  font-size: clamp(14px, 3.4vmin, 18px);
}

@media (orientation: landscape) and (max-height: 420px) {
  #tc .cluster { gap: 12px; }
  #tc .row { gap: 8px; }
}
`;

/** `clamp(150px, 38vmin, 220px)` evaluated in JS, since nipplejs's `size` option is a fixed
 *  pixel number, not a CSS length -- kept in step with #tc .stick-zone's own CSS clamp() so the
 *  nipple visually fills the same zone box it did as a hand-rolled div. */
function stickSizePx() {
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    return Math.max(150, Math.min(220, 38 * vmin));
}

/** Creates one nipplejs manager at the current viewport's stick size. Split out of `setupStick`
 *  so a real orientation change can tear it down and remount at the new size (see below). */
function makeManager(zoneEl, onChange, onEnd) {
    // DRAG_RADIUS's old role (full deflection well inside the zone's physical edge, so an
    // imprecise thumb still reaches max tilt without dragging to the physical rim) -- shrinking
    // nipplejs's own size by the same factor keeps full `force` reachable at the same fraction
    // of the zone's radius the hand-rolled stick used.
    const manager = nipplejs.create({
        zone: zoneEl,
        mode: "static",
        position: { left: "50%", top: "50%" },
        size: stickSizePx() * DRAG_RADIUS,
        color: "rgba(143, 196, 232, 0.85)",
        restOpacity: 0.6,
    });
    manager.on("move", (_evt, data) => {
        const len = Math.min(1, data.force || 0);
        onChange(data.vector.x, data.vector.y, len);
    });
    manager.on("end", onEnd);
    return manager;
}

/**
 * Mounts a static nipplejs joystick into `zoneEl` and forwards its live
 * vector to `onChange(nx, ny, len)` / `onEnd()` — the same callback shape the
 * hand-rolled stick used, so nothing downstream (touchState wiring below)
 * had to change. nipplejs's `vector.y` is already negative-up, exactly the
 * raw-pointer-delta convention the old implementation computed by hand, so
 * signs carry over unchanged.
 *
 * nipplejs bakes its pixel `size` in at creation time, so a real orientation
 * change (not just the on-screen keyboard nudging innerHeight) tears the
 * manager down and remounts it at the new size rather than trying to resize
 * it in place.
 * @param {HTMLElement} zoneEl
 * @param {(nx: number, ny: number, len: number) => void} onChange
 * @param {() => void} onEnd
 */
function setupStick(zoneEl, onChange, onEnd) {
    let manager = makeManager(zoneEl, onChange, onEnd);
    let lastVmin = Math.min(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", () => {
        const vmin = Math.min(window.innerWidth, window.innerHeight);
        if (Math.abs(vmin - lastVmin) < 20) return; // ignore mobile keyboard/URL-bar jitter
        lastVmin = vmin;
        manager.destroy();
        manager = makeManager(zoneEl, onChange, onEnd);
    });
}

function setupHoldButton(el, onDown, onUp) {
    el.addEventListener("pointerdown", (e) => {
        try {
            el.setPointerCapture(e.pointerId);
        } catch {}
        el.classList.add("held-on");
        onDown();
        e.preventDefault();
    });
    const release = () => {
        el.classList.remove("held-on");
        onUp();
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
}

/**
 * @param {HTMLCanvasElement} _canvas unused for now — kept so the call site
 *   mirrors `initInput(canvas, hooks)` and can grow canvas-relative layout later.
 * @param {{ onToggleOverlay?: () => void }} [hooks]
 */
export function initTouchControls(_canvas, hooks) {
    if (!isTouchDevice()) return;

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "tc";
    root.innerHTML = `
      <div class="cluster left">
        <div class="row">
          <button class="tool-cycle" id="tc-tool-prev" aria-label="Previous tool">&#8249;</button>
          <button class="tool-cycle" id="tc-tool-next" aria-label="Next tool">&#8250;</button>
        </div>
        <div class="stick-zone" id="tc-move"></div>
      </div>
      <div class="cluster right">
        <div class="row">
          <button class="spell" data-spell="1">1</button>
          <button class="spell" data-spell="2">2</button>
          <button class="spell" data-spell="3">3</button>
          <button class="spell" data-spell="4">4</button>
          <button class="spell" data-spell="5">5</button>
        </div>
        <div class="row">
          <button class="hold" id="tc-sprint">RUN</button>
          <button class="hold primary" id="tc-surf">SURF</button>
        </div>
        <div class="stick-zone" id="tc-look"></div>
      </div>
      <button id="tc-settings" aria-label="Settings">&#9881;</button>
    `;
    document.body.appendChild(root);

    // The desktop "click to look / f1 for settings" hint is meaningless here.
    const hint = document.getElementById("hint");
    if (hint) hint.style.display = "none";

    // A real controller covers everything this overlay does (see
    // core/gamepad.js's mapping) and better — analog sticks and triggers
    // instead of on-screen thumb targets — so once one's connected there's
    // nothing left for the touch overlay to usefully add. Checked once now
    // (a pad already connected before this ran fires no event) and again on
    // every connect/disconnect.
    const updateGamepadVisibility = () => {
        root.style.display = hasConnectedGamepad() ? "none" : "";
    };
    updateGamepadVisibility();
    window.addEventListener("gamepadconnected", updateGamepadVisibility);
    window.addEventListener("gamepaddisconnected", updateGamepadVisibility);

    const moveZone = root.querySelector("#tc-move");
    setupStick(
        moveZone,
        (nx, ny, len) => {
            touchState.moveActive = len > STICK_DEADZONE;
            touchState.moveX = nx;
            touchState.moveZ = -ny; // stick-up is forward
        },
        () => {
            touchState.moveActive = false;
            touchState.moveX = 0;
            touchState.moveZ = 0;
        }
    );

    const lookZone = root.querySelector("#tc-look");
    setupStick(
        lookZone,
        (nx, ny, len) => {
            touchState.lookActive = len > STICK_DEADZONE;
            touchState.lookX = nx;
            touchState.lookY = ny;
        },
        () => {
            touchState.lookActive = false;
            touchState.lookX = 0;
            touchState.lookY = 0;
        }
    );

    setupHoldButton(
        root.querySelector("#tc-sprint"),
        () => (touchState.sprint = true),
        () => (touchState.sprint = false)
    );
    setupHoldButton(
        root.querySelector("#tc-surf"),
        () => (touchState.surf = true),
        () => (touchState.surf = false)
    );

    setupHoldButton(
        root.querySelector("#tc-tool-prev"),
        () => (touchState.toolCyclePressed = -1),
        () => {}
    );
    setupHoldButton(
        root.querySelector("#tc-tool-next"),
        () => (touchState.toolCyclePressed = 1),
        () => {}
    );

    root.querySelectorAll("button.spell").forEach((btn) => {
        const n = Number(btn.dataset.spell);
        setupHoldButton(
            btn,
            () => {
                touchState.spellPressed = n;
                if (n === 2) touchState.spellHeld2 = true;
            },
            () => {
                if (n === 2) touchState.spellHeld2 = false;
            }
        );
    });

    root.querySelector("#tc-settings").addEventListener("pointerdown", (e) => {
        e.preventDefault();
        hooks?.onToggleOverlay?.();
    });

    setupPinchZoom();
}

// ------------------------------------------------------------- pinch zoom
// Two-finger pinch anywhere that isn't a stick or button (i.e. open canvas)
// zooms the camera rig. The canvas already declares `touch-action: none`,
// so this doesn't fight the browser's native pinch-to-zoom-the-page gesture.

function setupPinchZoom() {
    const pointers = new Map();
    let prevDist = null;

    const isControl = (t) => !!(t.closest && (t.closest(".stick-zone") || t.closest("button")));
    const dist = () => {
        const pts = [...pointers.values()];
        return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    window.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch" || isControl(e.target)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) prevDist = dist();
    });
    window.addEventListener("pointermove", (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
            const d = dist();
            if (prevDist != null) {
                // Fingers spreading (d growing) reads as zooming in, so this
                // is negated to match the wheel's deltaY-positive-zooms-out sign.
                touchState.pinchZoomDelta += (prevDist - d) * 0.012;
            }
            prevDist = d;
        }
    });
    const endPointer = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) prevDist = null;
    };
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
}
