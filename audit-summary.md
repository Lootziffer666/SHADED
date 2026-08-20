# SHADED Engine API Audit — Commit 61d0bb1

**Audit Date**: 2026-08-20
**Audited Commit**: 61d0bb1
**Scope**: `src/render/engine.js` (1744 lines), `src/main.js` (265 lines), `index.html` (303 lines), `runtime/spatial-viewer.js` (276 lines)

## Summary

The SHADED engine at commit 61d0bb1 **silently fails 63% of the `window.SHADED` API contract** (22 of 35 facade methods delegate to `engine?.method?.()` calls where the method does not exist on `SHADEDEngine`). The optional-chaining pattern (`?.`) masks all failures as no-ops returning `undefined` instead of throwing errors.

**41 broken contracts total**: 22 missing engine methods + 7 shadowed methods + 12 unwired UI controls.

Full report: `/tmp/agent_a79fe038-864a-410e-84d2-ba010f94a7c0/audit-61d0bb1.md`