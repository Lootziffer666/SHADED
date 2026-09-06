# GOAL.md — SHADED Goal Control Plane

> **Bindende Reihenfolge.** Diese Datei ist absichtlich klein. Die ausführlichen Anforderungen liegen in zwei Dokumenten und werden in exakt dieser Reihenfolge abgearbeitet:
>
> 1. [`GOAL_FOUNDATION.md`](GOAL_FOUNDATION.md) — Claude-Code-Harness, Repo-Dorfältester, Living Skill.
> 2. [`GOAL_WORLD.md`](GOAL_WORLD.md) — vollständiger SHADED Canon zu Ownership, Snowflow-Absorption, World/Surface, Sand, Physics, Hydrology, Reconstruction, UI, Verification usw.
>
> **Kein World-/Runtime-/Snowflow-/Surface-Goal darf als abgeschlossen gelten, solange die Foundation nicht bestanden ist.**

## Gate 0 — zuerst das Repo selbst arbeitsfähig machen

- [ ] **G-0000** `GOAL_FOUNDATION.md` vollständig lesen und **jede `F-xxxx`-Anforderung** umsetzen und einzeln verifizieren.
- [ ] **G-0001** Claude-Code-Control-Plane/Hooks/Scopes so aufbauen, dass Regeln nicht nur dokumentiert, sondern deterministisch durchgesetzt werden.
- [ ] **G-0002** Den Repo-Dorfältesten als ein System aus **Graphify + codebase-memory-mcp + MemWiki** etablieren: Strukturbeziehungen, persistente Code-Erfahrung und lesbares Warum/Entscheidungswissen; aktuelle Primärevidenz bleibt immer Autorität.
- [ ] **G-0003** Den bestehenden `.claude/skills/shaded-geometry`-Mechanismus zum **projektweiten Living Skill** generalisieren, ohne seine Geometry-/Spatial-Construction-Denkgrammatik zu verlieren.
- [ ] **G-0004** Der Living Skill bleibt failure-getrieben: kleiner CORE, `CANDIDATE → Gegenproben → LEARNED`, Herkunft/Evidence, keine Wissens-Enzyklopädie und kein Literatur-Bulk-Import.
- [ ] **G-0005** Die bestehende Reference Library wird problemorientiert über Geometry hinaus erweitert; die bereits benannten Scenic-Painting-/Perspective-/Set-Construction-/Matte-Painting-/VFX-/Film-Nachschlagewerke werden legal indiziert und nur bei konkretem Wissensloch konsultiert.
- [ ] **G-0006** Foundation-Self-Test bestehen: falsches „done“ wird blockiert; ein früherer Regression-Fall ist über Dorfältesten-Preflight auffindbar; ein realer Failure kann durch Living Skill gelernt oder verworfen und danach wieder abgerufen werden.

### Gate-0-Härte

```text
CLAUDE HARNESS
      +
REPO-DORFÄLTESTER
      +
LIVING SKILL
      +
SELF-TEST
      ↓
FOUNDATION PASS
      ↓
ERST DANN SHADED WORLD ARCHITECTURE
```

Wenn eine Foundation-Anforderung fehlt, ist der Status **FAIL**, nicht „später machen“, sofern genau diese Lücke die zuverlässige Ausführung/Verifikation der nachfolgenden Goals beeinträchtigt.

## Gate 1+ — vollständiger SHADED Canon

Nach Foundation-PASS:

- [ ] **G-0010** [`GOAL_WORLD.md`](GOAL_WORLD.md) vollständig lesen.
- [ ] **G-0011** Jede dort enthaltene `G-xxxx`-Anforderung gegen kanonische Dokumente, aktiven Codepfad und Tests/Runtime-Evidence halten.
- [ ] **G-0012** Bei `REPLACE / MIGRATE / ABSORB` gilt immer: `NEW OWNER EXISTS` **und** `OLD OWNER IS GONE`.
- [ ] **G-0013** Widersprüche zwischen GOAL, Docs, Memory und Code werden sichtbar reconciled; niemals still das bequemste Dokument wählen.
- [ ] **G-0014** Neue ausdrückliche Maintainer-Entscheidungen überschreiben alte Notizen/Donorannahmen; History bleibt als History erhalten.
- [ ] **G-0015** Kein „done“, solange FAIL/TODO/ungeprüfte Restpfade/stille Fallbacks/parallele alte Owner oder ungeklärte kanonische Widersprüche bestehen.

## Pflicht-Workflow pro nichttrivialer Änderung

```text
1. DORFÄLTESTER PREFLIGHT
   active entry point · owner · graph · docs · history · failed attempts · tests

2. LIVING-SKILL RETRIEVAL
   existing CORE/LEARNED rules · relevant reference shelf only if needed

3. IMPLEMENT
   active path, not parallel side-path

4. VERIFY
   positive proof + negative proof + real runtime where relevant

5. STORE
   verified experience → Dorfältester
   generalizable verified rule → Living Skill
```

## Abschlussbericht — Pflicht

Vor dem Stoppen müssen **alle `F-xxxx` aus `GOAL_FOUNDATION.md` und alle `G-xxxx` aus `GOAL.md` + `GOAL_WORLD.md`** einzeln geprüft werden. Kein Sammel-PASS für Kapitel.

```text
ID: F-xxxx | G-xxxx
DOC: <Datei + Abschnitt oder N/A>
CODE/HARNESS: <aktiver Pfad/Symbol/Config oder N/A>
TEST: <Command/Fixture/Runtime evidence oder N/A>
OLD OWNER REMOVED: PASS / FAIL / N/A
MEMORY/LEARNING EVIDENCE: <falls relevant>
STATUS: PASS / FAIL / DEFERRED
EVIDENCE: <kurz und konkret>
```

`DEFERRED` ist nur zulässig, wenn ein kanonischer Plan den Punkt ausdrücklich als späteren Scope markiert **und** dadurch kein früheres Gate oder eine Definition-of-Done-Bedingung verletzt wird. Jeder andere ungeklärte Punkt ist `FAIL`.
