/**
 * Twin-stick touch overlay — movement (left) and look (right) sticks plus
 * hold/press buttons for sprint, snow-surf and the five spells.
 *
 * Only mounts on touch-capable devices. Has no dependency on input.js (so
 * input.js can depend on this module without a cycle): it just keeps its own
 * `touchState`, exactly like `gamepadState` in core/gamepad.js, and whoever
 * polls input each frame folds both in.
 *
 * Sizing is `vmin`-based with `clamp()`, so the same rig reads the same
 * physical size in portrait and landscape without separate layouts — only
 * the button cluster's gap shrinks under a short landscape viewport, where
 * vertical room is tightest.
 */

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
};

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
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
#tc .cluster.left { left: max(16px, env(safe-area-inset-left) + 10px); }
#tc .cluster.right { right: max(16px, env(safe-area-inset-right) + 10px); align-items: flex-end; }

#tc .stick-zone {
  position: relative; pointer-events: auto; touch-action: none;
  width: clamp(112px, 30vmin, 172px); height: clamp(112px, 30vmin, 172px);
}
#tc .stick-base {
  position: absolute; inset: 0; border-radius: 50%;
  background: rgba(219, 230, 242, 0.07);
  border: 1px solid rgba(143, 196, 232, 0.24);
  backdrop-filter: blur(6px);
}
#tc .stick-knob {
  position: absolute; left: 29%; top: 29%; width: 42%; height: 42%;
  border-radius: 50%; background: rgba(143, 196, 232, 0.5);
  box-shadow: 0 0 14px rgba(143, 196, 232, 0.35);
  transition: background 120ms ease;
  will-change: transform;
}
#tc .stick-zone.active .stick-knob { background: rgba(234, 244, 255, 0.85); }

#tc .row { display: flex; gap: 8px; }

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

#tc #tc-settings {
  position: absolute; pointer-events: auto;
  top: max(12px, env(safe-area-inset-top) + 8px);
  right: max(12px, env(safe-area-inset-right) + 8px);
  width: clamp(34px, 8vmin, 42px); height: clamp(34px, 8vmin, 42px);
  font-size: clamp(14px, 3.4vmin, 18px);
}

@media (orientation: landscape) and (max-height: 420px) {
  #tc .cluster { gap: 6px; }
  #tc .row { gap: 6px; }
}
`;

function setupStick(zoneEl, knobEl, onChange, onEnd) {
    let activeId = null;
    let originX = 0;
    let originY = 0;

    const move = (e) => {
        if (e.pointerId !== activeId) return;
        const r = zoneEl.clientWidth / 2;
        let nx = (e.clientX - originX) / r;
        let ny = (e.clientY - originY) / r;
        const len = Math.hypot(nx, ny);
        if (len > 1) {
            nx /= len;
            ny /= len;
        }
        knobEl.style.transform = `translate(${nx * r * 0.62}px, ${ny * r * 0.62}px)`;
        onChange(nx, ny, Math.min(len, 1));
    };

    const end = (e) => {
        if (e.pointerId !== activeId) return;
        activeId = null;
        zoneEl.classList.remove("active");
        knobEl.style.transform = "translate(0,0)";
        onEnd();
    };

    zoneEl.addEventListener("pointerdown", (e) => {
        if (activeId !== null) return;
        activeId = e.pointerId;
        // Capture failing (some WebViews, or a pointer the UA doesn't track
        // as active) must not stop the stick from responding.
        try {
            zoneEl.setPointerCapture(activeId);
        } catch {}
        zoneEl.classList.add("active");
        const rect = zoneEl.getBoundingClientRect();
        originX = rect.left + rect.width / 2;
        originY = rect.top + rect.height / 2;
        move(e);
        e.preventDefault();
    });
    zoneEl.addEventListener("pointermove", (e) => {
        move(e);
        if (e.pointerId === activeId) e.preventDefault();
    });
    zoneEl.addEventListener("pointerup", end);
    zoneEl.addEventListener("pointercancel", end);
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
        <div class="stick-zone" id="tc-move"><div class="stick-base"></div><div class="stick-knob"></div></div>
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
        <div class="stick-zone" id="tc-look"><div class="stick-base"></div><div class="stick-knob"></div></div>
      </div>
      <button id="tc-settings" aria-label="Settings">&#9881;</button>
    `;
    document.body.appendChild(root);

    // The desktop "click to look / f1 for settings" hint is meaningless here.
    const hint = document.getElementById("hint");
    if (hint) hint.style.display = "none";

    const moveZone = root.querySelector("#tc-move");
    const moveKnob = moveZone.querySelector(".stick-knob");
    setupStick(
        moveZone,
        moveKnob,
        (nx, ny, len) => {
            touchState.moveActive = len > 0.08;
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
    const lookKnob = lookZone.querySelector(".stick-knob");
    setupStick(
        lookZone,
        lookKnob,
        (nx, ny, len) => {
            touchState.lookActive = len > 0.08;
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
