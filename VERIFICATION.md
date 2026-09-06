# Verification — Consensus / Math Check / Context7

Companion to [`PHYSICS.md`](./PHYSICS.md), [`SHADER_IR.md`](./SHADER_IR.md), [`WORLD_KERNEL.md`](./WORLD_KERNEL.md).

## Die Regel

> **Keine neue physikalische Kernlogik wird allein auf Basis einer LLM-Interpretation
> akzeptiert.**

Literaturbehauptung → Consensus. Mathematik/Näherung → Math Check. Aktuelle Implementierungsdetails
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
| **Math Check** | „Ist die Mathematik korrekt? Dimensionen, Grenzfälle, die vorgenommene Vereinfachung?" |
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
Consensus  Math Check  Context7
Evidence   Math        API/Docs
 │   │             │
 └───┼────────────┘
     ▼
SHADED SPEC / CODE
     │
     ▼
REFERENCE TESTS
```

## Math Check ist ein Vertrag, kein Vendor

„Math Check" heißt bewusst nicht `VERIFY_WITH_WOLFRAM`, sondern:

```
MATH_VERIFICATION
    ├─ symbolic equivalence
    ├─ dimensional sanity
    ├─ boundary conditions
    ├─ numerical reference cases
    └─ approximation error
```

Wolfram war als **Prüfinstanz** gedacht, nicht als Abhängigkeit — als der MCP-Connector in dieser
Session nicht initialisierbar war, blieb die Regel deshalb unverändert, nur der Implementer
wechselte: heute erfüllt **SymPy** (`tools/math-verify/`, `pip install -r
tools/requirements-math-verify.txt`) denselben Vertrag — symbolische Vereinfachung, Ableitungen,
Gleichungen lösen, algebraische Äquivalenz, Grenzwerte, numerische Referenzwerte. Wolfram bleibt
willkommen, als zweiter Prüfer oder späterer Ersatz, ist aber **nicht systemkritisch**. Genau das
ist der Punkt: SHADED entkoppelt sich überall von konkreten Sprachen, Repräsentationen und Donors
(SHADER_IR.md) — die mathematische Wahrheit selbst an einen einzelnen Connector zu hängen wäre
derselbe Fehler, den diese Regel woanders gerade vermeidet.

```
Paper
  ↓
Consensus
  ↓
Claude interpretiert
  ↓
Math Check (heute: SymPy) prüft Mathematik
  ↓
Reference vectors
  ↓
SHADED test suite
```

Sobald die Referenzvektoren als Test im Repo eingefroren sind, brauchen weder SHADED noch ein
späterer Entwickler SymPy, Wolfram oder Claude, um zu wissen, dass für die definierten Randfälle
genau diese Ergebnisse herauskommen müssen — der Test ist der bleibende Beweis, der Checker nur
das Werkzeug, mit dem er einmal hergeleitet wurde.

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

MATH_VERIFICATION:
symbolic equivalence  <PASS/OPEN>
dimensional sanity    <PASS/OPEN>
boundary conditions   <PASS/OPEN>
numerical reference   <PASS/OPEN>
approximation error   <PASS/OPEN>
(implementer: SymPy/Wolfram/…, Pfad zum Skript)

CONTEXT7:
<implementation APIs verified against current docs, oder N/A>

SHADED TESTS:
<reference cases frozen — Pfad zum Testfile>
```

Ein `OPEN`-Feld ist kein Fehler, sondern ein ehrlicher Zustand: die Prüfung ist noch nicht
gelaufen. Ein `LAW`-Block wird nicht rückwirkend auf „PASS" gesetzt, ohne dass die Prüfung
tatsächlich stattgefunden hat — sonst ist das Format nur Theater. Damit weiß auch ein anderes
Modell später, warum eine Gleichung genau so im Repo steht, und was davon noch nachgeholt werden
muss.

## SHADER_IR ist der zweite Haupt-Anwendungsfall

Bei einer rein technischen Übersetzung (Syntax/Space/Handedness, siehe SHADER_IR.md's
World-Normal-from-Depth-Beispiel) braucht es meist kein Consensus — da geht es nicht um eine
wissenschaftliche Behauptung, sondern um korrekte API-Semantik (Context7) und ggf. mathematische
Äquivalenz einer Vereinfachung (Math Check). Bei einer physikalischen Shader-Funktion (z. B. einem
Fresnel-Term, einer BRDF-Näherung, einem Wellenmodell) gilt dagegen die volle Kette:

```
DONOR CODE
    ↓
Semantik rekonstruieren
    ↓
Paper/Ursprung bestimmen
    ↓
Consensus   → wissenschaftliche Grundlage
Math Check  → mathematische Form
Context7    → technische Umsetzung
    ↓
SHADED IR
```

## Worked Example: `rigidBody.mjs`s Kontaktlöser

Erste tatsächlich durchgeführte Prüfung nach diesem Format (2026-09-05), rückwirkend auf die in
[`PHYSICS.md`](./PHYSICS.md) referenzierte Literatur angewendet, die `src/physics/rigidBody.mjs`
bereits umsetzt. Ursprünglich für Wolfram vorgesehen; da der Connector in dieser Session nicht
initialisierbar war, übernimmt SymPy denselben Vertrag (`tools/math-verify/
sphere_terrain_contact_v1.py`, `npm run verify:math`):

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

MATH_VERIFICATION (implementer: SymPy 1.14, tools/math-verify/sphere_terrain_contact_v1.py):
symbolic equivalence  PASS — Impulsformel j = -(1+e)·v_n reduziert sich exakt auf das klassische
                       Stoßgesetz v_n' = -e·v_n.
boundary conditions   PASS — e=0 liefert v_n'=0 (perfekt inelastisch), e=1 liefert v_n'=-v_n
                       (perfekt elastisch); Reibungs-„Friction Cone" per Monotonie bewiesen: der
                       Restanteil des Tangentialvektors ist affin fallend in F und läuft exakt von
                       1 (F=0) auf 0 (F=tangentSpeed) — kann also nie negativ werden (Umkehr der
                       Bewegungsrichtung) oder über 1 (Energiezufuhr).
numerical reference   PASS — aus Energieerhaltung analytisch hergeleitet: apex = e²·dropHeight,
                       identisch zur Formel, die tools/test-world-sandbox-physics.mjs bereits
                       numerisch (auf 8% Toleranz) bestätigt — jetzt zusätzlich analytisch bewiesen,
                       nicht nur empirisch beobachtet.
approximation error   PASS — der Diskretisierungsfehler durch „ein Schritt Schwerkraft zu spät
                       erkannter Kontakt" ist nachweisbar O(dt) (Grenzwert relativer Fehler → 0 für
                       dt→0, Fehler/dt → g/v_true, ein endlicher, von Null verschiedener Grenzwert)
                       — konsistente, keine feste Verzerrung.
dimensional sanity    implizit durch die obigen Ableitungen (Geschwindigkeit rein/raus, dimensionslose
                       e/mu) — kein gesondertes Einheitensystem nötig, da das Modul durchgehend mit
                       Einheitsmasse arbeitet.

CONTEXT7:
N/A — das Modul benutzt keine externe Library-API (reines Vanilla-JS, keine Physics-Engine-
Abhängigkeit); Context7 hat hier nichts zu prüfen.

SHADED TESTS:
tools/test-world-sandbox-physics.mjs (Unit-Tests des Moduls + Integrationstest über
WorldSandboxRuntime.launchStone()), in npm run check verdrahtet.
tools/math-verify/sphere_terrain_contact_v1.py (analytischer Beweis, npm run verify:math),
separat von npm run check, da es eine Python/SymPy-Umgebung voraussetzt.
```

**Konsequenz für die nächste Physik-Stufe:** Sobald `src/physics/rigidBody.mjs` auf mehrere
Körper oder Körper-gegen-Körper-Kontakt erweitert wird, ist das oben gefundene Gegenargument
nicht mehr ignorierbar — dann entweder mehrere Solver-Iterationen pro Schritt einführen (wie die
tatsächliche Sequential-Impulse-Praxis es vorsieht) oder gezielt gegen ETI/QP-Alternativen prüfen,
bevor die einfache Ein-Iterations-Version einfach linear auf N Körper hochskaliert wird.

## Worked Example: `rigidBody.mjs`s Mehrkörper-Erweiterung (EXECUTION_PLAN.md Task 3)

Die oben angekündigte nächste Stufe — jetzt tatsächlich umgesetzt (2026-09-05):
`stepSphereBodies()`/`resolvePairVelocity()` in `src/physics/rigidBody.mjs` lösen Kugel-gegen-
Kugel-Kontakt mit beiden inversen Massen im Nenner und iterieren N-mal pro Schritt über alle
Kontakte (Gauss-Seidel-artig), statt wie die Einzelkörper-Version nur einmal.

```
LAW: sphere_sphere_contact_v1

SOURCE:
Zwei-Körper-Sequential-Impulse (Erin Catto-Linie, Box2D/Bullet), Box2D-artige Mixing-Regeln für
Restitution (max) und Reibung (sqrt(a·b)) zwischen zwei dynamischen Körpern, Baumgarte-
Positionskorrektur aufgeteilt nach inverser Masse, N Solver-Iterationen pro Schritt statt einer.

CONSENSUS:
Die in `LAW: sphere_terrain_contact_v1` bereits gefundene Gegenevidenz (Ein-Iterations-Sequential-
Impulse verliert bei Mehrkörper-/Mehrpunkt-Kontakt an Genauigkeit) wird hier direkt adressiert, mit
zusätzlich gezielt gesuchter Literatur zur Iterationszahl selbst: Tonge et al. 2012, "Mass
splitting for jitter-free parallel rigid body simulation" (ACM TOG, 85 Zitationen) — Projected-
Gauss-Seidel-artige Solver zeigen bei zu wenigen Iterationen sichtbares Jitter nahe Ruhezuständen,
weil die Konvergenz vor Erreichen der Lösung abgebrochen wird; Erleben 2017, "Rigid body contact
problems using proximal operators" (ACM SIGGRAPH/Eurographics SCA, 33 Zitationen) — beweist
Konvergenz für PROX-Iterationsschemata (Jacobi- und geblockte Gauss-Seidel-Varianten) und findet
die Gauss-Seidel-Variante insbesondere bei strukturierten Stapel-Szenarien überlegen. Beide stützen
direkt, was Task 3 als Regressionstest festhält: ein Stapel aus mehreren Kugeln dringt bei 1
Solver-Iteration pro Schritt messbar tiefer ineinander ein als bei mehreren — nicht nur eine
Vermutung, sondern die von der Literatur beschriebene Eigenschaft dieser Solver-Klasse. GEGENEVIDENZ
wurde hier nicht neu gesucht (sie steht bereits im `sphere_terrain_contact_v1`-Block); dieser Block
adressiert sie, ersetzt sie aber nicht — echte Constraint-basierte QP-Löser oder ETI blieben
ungeprüfte Alternativen, absichtlich außerhalb des Umfangs von PHYSICS.md's "kein gigantischer
Physics-Engine-Rewrite".

MATH_VERIFICATION (implementer: SymPy 1.14, tools/math-verify/sphere_sphere_contact_v1.py):
symbolic equivalence  PASS — die Zwei-Körper-Impulsformel j = -(1+e)·v_rel,n / (1/m_a+1/m_b)
                       reduziert sich exakt auf die klassische Stoßformel mit Restitution
                       (unabhängig aus Impulserhaltung + Restitutionsdefinition hergeleitet, nicht
                       aus der Implementierung kopiert).
boundary conditions   PASS — e=0 liefert für beide Körper dieselbe Geschwindigkeit (Verschmelzen,
                       exakt die massegewichtete Schwerpunktsgeschwindigkeit); e=1 bei gleichen
                       Massen tauscht die Geschwindigkeiten exakt (Newton's-Cradle-Fall);
                       Reibungs-„Friction Cone" — dieselbe Monotonie-Argumentation wie im
                       Einzelkörper-Fall, jetzt mit dem verallgemeinerten Cap
                       tangentSpeed/(1/m_a+1/m_b) statt tangentSpeed.
numerical reference   PASS — Impulserhaltung ist für JEDES e identisch Null bewiesen (nicht nur an
                       Stichproben getestet); Energieverlust pro Kontakt entspricht exakt der
                       Standardformel (1/2)·reduzierte_Masse·(1-e²)·(Relativgeschwindigkeit)²;
                       Newton's-Cradle-Zahlenbeispiel (m_a=m_b=1, v_a=2, v_b=0, e=1 → v_a'=0,
                       v_b'=2) bestätigt.
approximation error   PASS — geerbt von `sphere_terrain_contact_v1`, nicht neu hergeleitet: dieselbe
                       semi-implizite-Euler-Integration, unverändert durch die Frage, wogegen ein
                       Körper kontaktiert.
dimensional sanity    PASS — (1-e²) ist auf [0,1] monoton fallend (Ableitung -2e ≤ 0 dort) mit
                       Minimum 0 bei e=1 → Energieverlust ist für jedes e in [0,1] nachweisbar ≥ 0
                       (kein Energiezugewinn möglich), nicht nur an den Rändern geprüft.

CONTEXT7:
N/A — weiterhin reines Vanilla-JS, keine externe Physics-Engine-API.

SHADED TESTS:
tools/test-world-sandbox-physics.mjs — Impulserhaltung (e=0 und e=1), Energieerhaltung bei e=1,
Energieabnahme + analytischer Referenzwert bei e=0, und der Iterationszahl-Regressionstest (Stapel
aus 3 Kugeln, 1 vs. 8 Iterationen, > 1.5× mehr Gesamtüberlappung bei 1 Iteration) — in
`npm run check` verdrahtet.
tools/math-verify/sphere_sphere_contact_v1.py (analytischer Beweis, npm run verify:math).
```

**Bewusst nicht angefasst:** Die bestehende Einzelkörper-Funktion `stepSphereBody()` bleibt
unverändert (eigene Funktion, eigene Tests, weiterhin grün) — `stepSphereBodies()` ist eine
Ergänzung für den Mehrkörper-Fall, keine Ablösung. Ein echter Constraint-Solver oder ETI wurde
nicht eingeführt; die hier gewählte Antwort (mehrfach iterieren) ist exakt die von der oben
zitierten Literatur beschriebene und von `LAW: sphere_terrain_contact_v1` bereits benannte
Minimallösung.

## Wann die Kette übersprungen werden darf

- Reine Rendering-/Optik-Entscheidungen ohne physikalischen Anspruch (Farbgebung, Stil) — dafür
  gibt es `docs/STYLE_DISCOVERY.md` und den entsprechenden Workflow, nicht diese Kette.
- Triviale, in sich geschlossene Mathematik ohne externe Behauptung (z. B. eine Bilinearinterpolation)
  — Math Check/Consensus sind hier Overkill; ein Unit-Test reicht.
- Reine API-Fragen ohne physikalischen/mathematischen Kern (z. B. „welche WebGPU-Bindgroup-Limits
  gelten") — dort reicht Context7 allein.

Die Kette gilt für **neue physikalische Kernlogik** — das, was WORLD_KERNEL.md, PHYSICS.md,
HYDROLOGY.md und SHADER_IR.md als Weltgesetz bzw. Verhaltens-Donor beschreiben, nicht für jede
Zeile Code.
