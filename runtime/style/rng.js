// SHADED Style Discovery — seeded RNG.
//
// Wiederverwendet denselben mulberry32-Algorithmus wie
// runtime/spatial-kernel/world-fields.js (CLAUDE.md-Vorgabe: "Determinismus
// übernehmen"), statt ihn ein zweites Mal zu erfinden.

export { mulberry32 } from '../spatial-kernel/world-fields.js';
