# FOUNDATION_DONOR_REGISTRY.md — Repo-Dorfältester donor pins (GOAL_FOUNDATION.md 0B)

GOAL_FOUNDATION.md Section 0B names three donor/reference roles for the Repo-Dorfältester
(Graph + Memory + Wiki): `Graphify-Labs/graphify`, `DeusData/codebase-memory-mcp`, and `MemWiki`
— the last one explicitly requiring its exact upstream repo to be pinned from maintainer history
or explicit selection before installation, never guessed from a same-named GitHub search hit.

The maintainer has since named the exact upstream for all three. This document is the resulting
pin, verified this session by cloning each repository read-only and recording its real HEAD
commit — not asserted from memory or a search result.

## Policy (maintainer-specified, binding)

- Upstream is an **implementation donor**, not a runtime dependency.
- After ingestion, Alfred/SHADED **owns** the integrated implementation.
- **No automatic upstream updates.** A donor is pinned at the resolved snapshot below; picking up
  a newer upstream commit is a deliberate, separate re-pin, never silent.
- **No runtime dependency on donor repositories.** SHADED/Alfred does not call out to these repos
  or their packages at runtime; any mechanism mined from them is re-implemented as SHADED/Alfred-
  owned code, per the same donor-absorption contract `GOAL_WORLD.md` Section 25 already uses for
  the World subsystem's donors (mechanism/algorithm/pattern donated, ownership never retained).
- Required license/copyright/NOTICE provenance remains intact wherever donor-derived mechanism is
  actually used.

## Donors

| Role | Upstream | Resolved snapshot (commit SHA) | Resolved at (commit date) | License | Verified |
|---|---|---|---|---|---|
| Struktur-/Beziehungsgraph des Repos | [`Graphify-Labs/graphify`](https://github.com/Graphify-Labs/graphify) | `c9f99018774e2e0380e9f65b3959944559a0d5f6` | 2026-09-05T22:15:39+01:00 | Apache-2.0 (NOTICE: portions retained under prior MIT license, see `LICENSE-MIT` in that repo) | Cloned read-only this session; `LICENSE`, `LICENSE-MIT`, `NOTICE` present at repo root |
| Persistente codebasebezogene Retrieval-/Memory-Schicht | [`DeusData/codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp) | `7b0f553cbae565247aa858a4aba80b194305e7f5` | 2026-09-06T02:26:48+02:00 | MIT | Cloned read-only this session; `LICENSE` present at repo root |
| Lesbare Erfahrungs-/Entscheidungs-/Warum-Schicht (MemWiki) | [`hereisSwapnil/memwiki`](https://github.com/hereisSwapnil/memwiki) | `8034a3da991ac2639b87875172a9572903ecf1d5` | 2026-06-06T15:21:17+05:30 | ISC (per `package.json`'s `license` field; no separate root `LICENSE` file in that repo as of this snapshot) | Cloned read-only this session; `package.json` present, `license: "ISC"` confirmed |

## Status

Pinned and license-verified. **Not yet integrated**: per F-0301's own growth principle ("lerne
nicht, weil Wissen verfügbar ist; lerne, weil ein echter SHADED-Failure Wissen vermissen lässt"),
no live Graph/Memory/Wiki mechanism has been built from these donors yet, because no real
preflight failure in this repo has actually required one — building the Repo-Dorfältester's live
integration now, ahead of a genuine triggering failure, would itself violate that same growth
principle. This registry exists so that when a real need arises, the donor is already pinned,
licensed, and traceable rather than guessed at under time pressure.

`GOAL_FOUNDATION.md` F-0201–F-0205 (Graph/Memory/Wiki as three views on one repo experience;
source code/git/docs/tests remain primary evidence; every entry carries provenance/freshness;
stale/contradictory memory is marked and reconciled, not silently used; no secrets in Graph/
Memory/Wiki) describe the CONTRACT this eventual integration must satisfy. This document and its
`claim.db` entries satisfy the donor-pinning precondition; F-0201–F-0205's own behavioral
requirements remain open until a real Graph/Memory/Wiki mechanism is actually built against a real
failure case.
