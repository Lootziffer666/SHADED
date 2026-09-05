# Verification — the Consensus/Wolfram/Context7 triangle

Companion to [`PHYSICS.md`](./PHYSICS.md), [`SHADER_IR.md`](./SHADER_IR.md), [`WORLD_KERNEL.md`](./WORLD_KERNEL.md).

## Die Regel

> **Keine neue physikalische Kernlogik wird allein auf Basis einer LLM-Interpretation
> akzeptiert.**

Literaturbehauptung → Consensus. Mathematik/Näherung → Wolfram. Aktuelle Implementierungsdetails
→ Context7. Ergebnis → reproduzierbarer Test im Repo.

Das ist stärker als „Claude soll sorgfältiger sein" — es baut unterschiedliche Arten von
Widerstand ein, die eine einzelne Instanz sich nicht selbst geben kann. Die Architektur ist
inzwischen groß genug, dass ein überzeugend formulierter kleiner Denkfehler mehrere Systeme
gleichzeitig vergiften könnte (WORLD_KERNEL.md's gekoppelte Felder machen genau das wahrscheinlich
— ein falscher Reibungskoeffizient in PHYSICS.md wirkt über CONTACT sofort auf GROUND, WATER und
LIFE).

## Drei Prüfer, keine drei, die dasselbe tun

| Instanz | Prüft |
|---|---|
| **Consensus** | „Ist die zugrunde liegende wissenschaftliche Behauptung überhaupt durch Literatur gedeckt — und was spricht dagegen?" |
| **Wolfram** | „Ist die Mathematik korrekt? Dimensionen, Grenzfälle, die vorgenommene Vereinfachung?" |
| **Context7** | „Benutzen wir die aktuelle API/Library korrekt?" |

Claude sitzt nicht als einzige Wahrheit in der Mitte, sondern als Orchestrator:

```
PAPER / IDEE
     │
     ▼
   CLAUDE
     │
 ┌───┼────────────┐
 ▼   ▼             ▼
Consensus  Wolfram  Context7
Evidence   Math     API/Docs
 │   │             │
 └───┼────────────┘
     ▼
SHADED SPEC / CODE
     │
     ▼
REFERENCE TESTS
```

## Consensus als Gegenprüfer, nicht als Bestätiger

Nicht: „Such mir ein Paper, das meine Idee bestätigt."

Sondern: „Welche Evidenz spricht dagegen, dass diese Näherung in unserem Parameterbereich gültig
ist?"

Das verhindert den LLM-Effekt, bei dem aus „es gibt ein Paper dazu" unbemerkt „die Wissenschaft
sagt, das ist richtig" wird. Eine Methode kann real, zitiert und trotzdem für den konkreten
Anwendungsfall die falsche Wahl sein — das ist der Unterschied, den Consensus hier prüfen soll.

## Das Provenienzformat

Für jede größere Literature-derived-Core-Entscheidung (PHYSICS.md's Begriff):

```
LAW: <name>_v<n>

SOURCE:
<Herkunft — Paper/Verfahren>

CONSENSUS:
<literature support + applicability, oder Gegenevidenz>

WOLFRAM:
dimension check <PASS/OPEN>
boundary cases <PASS/OPEN>
approximation error <checked/OPEN>

CONTEXT7:
<implementation APIs verified against current docs, oder N/A>

SHADED TESTS:
<reference cases frozen — Pfad zum Testfile>
```

Ein `OPEN`-Feld ist kein Fehler, sondern ein ehrlicher Zustand: die Prüfung ist noch nicht
gelaufen (z. B. weil ein Konnektor in dieser Session nicht aktiviert war). Ein `LAW`-Block wird
nicht rückwirkend auf „PASS" gesetzt, ohne dass die Prüfung tatsächlich stattgefunden hat — sonst
ist das Format nur Theater. Damit weiß auch ein anderes Modell später, warum eine Gleichung genau
so im Repo steht, und was davon noch nachgeholt werden muss.

## SHADER_IR ist der zweite Haupt-Anwendungsfall

Bei einer rein technischen Übersetzung (Syntax/Space/Handedness, siehe SHADER_IR.md's
World-Normal-from-Depth-Beispiel) braucht es meist kein Consensus — da geht es nicht um eine
wissenschaftliche Behauptung, sondern um korrekte API-Semantik (Context7) und ggf. mathematische
Äquivalenz einer Vereinfachung (Wolfram). Bei einer physikalischen Shader-Funktion (z. B. einem
Fresnel-Term, einer BRDF-Näherung, einem Wellenmodell) gilt dagegen die volle Kette:

```
DONOR CODE
    ↓
Semantik rekonstruieren
    ↓
Paper/Ursprung bestimmen
    ↓
Consensus → wissenschaftliche Grundlage
Wolfram   → mathematische Form
Context7  → technische Umsetzung
    ↓
SHADED IR
```

## Worked Example: `rigidBody.mjs`s Kontaktlöser

Erste tatsächlich durchgeführte Prüfung nach diesem Format (2026-09-05), rückwirkend auf die in
[`PHYSICS.md`](./PHYSICS.md) referenzierte Literatur angewendet, die `src/physics/rigidBody.mjs`
bereits umsetzt:

```
LAW: sphere_terrain_contact_v1

SOURCE:
Sequential-impulse-Kontaktantwort (Erin Catto-Linie, Box2D/Bullet) gegen ein statisches
Heightfield; semi-implizites Euler (Baraff/Witkin); Baumgarte-Positionskorrektur;
Box2D-artiger Restitutions-Geschwindigkeits-Schwellwert gegen ewiges Mikro-Bouncing im Ruhezustand.

CONSENSUS:
Impulse-basierte Rigid-Body-Simulation ist real und stark etabliert — Mirtich 1995/1996 (418 bzw.
504 Zitationen) begründet den Ansatz für genau diesen Fall: colliding/rolling/sliding/resting
Kontakt einheitlich über Impulse statt Constraint-Kräfte. GEGENEVIDENZ, die tatsächlich gefunden
wurde (nicht nur Bestätigung gesucht): mehrere Arbeiten zeigen, dass die einfache
Ein-Kontakt-pro-Schritt-Sequential-Impulse-Methode bei MEHRPUNKT- oder Mehrkörper-Kontakt
messbar an Genauigkeit verliert — insbesondere bei der Winkelgeschwindigkeit und der
Energieerhaltung — gegenüber Constraint-basierten QP-Lösern oder dem Energy-Tracking-Impulse-Verfahren
(ETI). Für den konkreten Fall hier (eine Kugel gegen ein statisches Heightfield, ein Kontaktpunkt
pro Schritt) betrifft diese Einschränkung nicht — sie wird erst relevant, sobald PHYSICS.md's
nächste Stufe (mehrere Körper, Körper-gegen-Körper-Kontakt) ansteht. Für DIESE Stufe müsste dann
entweder mehrfach über Kontakte iteriert werden (wie Catto/Box2D es tatsächlich tun, nicht nur
einmal wie hier) oder ein Verfahren aus der ETI-Linie geprüft werden.

WOLFRAM:
OPEN — Wolfram-Konnektor war in dieser Session nicht aktiviert (installiert, aber
`enabledInChat: false`). Ersatzweise numerisch/empirisch statt symbolisch geprüft:
tools/test-world-sandbox-physics.mjs verifiziert die Sprunghöhe eines elastischen Falls gegen
die geschlossene Form apex = e² × dropHeight (Energieerhaltung entlang einer Achse) auf 8%
Toleranz, sowie Penetrationskorrektur, Hangabrollen und Reibungsverhalten. Das ersetzt keine
symbolische Dimensions-/Grenzfallprüfung — nachzuholen, sobald der Konnektor aktiv ist.

CONTEXT7:
N/A — das Modul benutzt keine externe Library-API (reines Vanilla-JS, keine Physics-Engine-
Abhängigkeit); Context7 hat hier nichts zu prüfen.

SHADED TESTS:
tools/test-world-sandbox-physics.mjs (Unit-Tests des Moduls + Integrationstest über
WorldSandboxRuntime.launchStone()), in npm run check verdrahtet.
```

**Konsequenz für die nächste Physik-Stufe:** Sobald `src/physics/rigidBody.mjs` auf mehrere
Körper oder Körper-gegen-Körper-Kontakt erweitert wird, ist das oben gefundene Gegenargument
nicht mehr ignorierbar — dann entweder mehrere Solver-Iterationen pro Schritt einführen (wie die
tatsächliche Sequential-Impulse-Praxis es vorsieht) oder gezielt gegen ETI/QP-Alternativen prüfen,
bevor die einfache Ein-Iterations-Version einfach linear auf N Körper hochskaliert wird.

## Wann die Kette übersprungen werden darf

- Reine Rendering-/Optik-Entscheidungen ohne physikalischen Anspruch (Farbgebung, Stil) — dafür
  gibt es `docs/STYLE_DISCOVERY.md` und den entsprechenden Workflow, nicht diese Kette.
- Triviale, in sich geschlossene Mathematik ohne externe Behauptung (z. B. eine Bilinearinterpolation)
  — Wolfram/Consensus sind hier Overkill; ein Unit-Test reicht.
- Reine API-Fragen ohne physikalischen/mathematischen Kern (z. B. „welche WebGPU-Bindgroup-Limits
  gelten") — dort reicht Context7 allein.

Die Kette gilt für **neue physikalische Kernlogik** — das, was WORLD_KERNEL.md, PHYSICS.md,
HYDROLOGY.md und SHADER_IR.md als Weltgesetz bzw. Verhaltens-Donor beschreiben, nicht für jede
Zeile Code.
