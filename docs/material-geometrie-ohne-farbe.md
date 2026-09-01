# Material & Geometrie ohne Farbwerte — Forschungsnotiz

> **Status:** Forschungsnotiz / Referenz, **keine verbindliche Architektur**, kein Skill.
> Beantwortet die in [`docs/fixture-taxonomie.md`](fixture-taxonomie.md) §6 offen
> gelassene Frage ("der Extraktor ist noch szenen-/paletten-spezifisch") mit externem
> Recherchematerial. Reine Dokumentation — **kein Code geändert**, per Nutzerentscheidung
> ("nur dokumentieren, nicht jetzt umbauen").

## 1. Zwei getrennte Vorschläge, zwei getrennte Ziele

Das Ausgangsmaterial (zwei extern recherchierte Antworten, siehe Quellenangaben darin)
deckt zwei verschiedene Probleme ab, die nicht vermischt werden sollten:

1. **Material-/Geometrieerkennung ohne Farbwerte** — Ersatz für die aktuelle
   Farbtoleranz-Klassifikation des Extraktors durch Luminanz-/Struktur-Merkmale.
2. **Vegetation als Wachstums-Agenten** (Space-Colonization-artige lokale Regeln für
   Wurzeln/Ranken) — ein Simulations-/Weltgesetz-Thema, kein Extraktionsthema.

## 2. Material & Geometrie ohne Farbe — Einordnung

### Was direkt brauchbar ist

**Der Geometrie-Score** (`G = w_l·L + w_c·C + w_j·J + w_s·S − w_r·R`, aus Länge/
Kontinuität, Konturstärke, Junction-Signal, Mehrskalen-Stabilität, minus
Repetitions-Strafe) ist eine formale, direkt umsetzbare Version von etwas, das dieses
Repo bereits an zwei Stellen ohne festen Namen benutzt:

- `docs/synthetic-visual-reverse-engineering.md` §11.1/11.2: *"Topologie = hart,
  Pixelkoordinate = weich"*, explizit gegen Schatten-/AA-/Textur-Kanten, die als
  Struktur fehlinterpretiert werden.
- `docs/fixture-taxonomie.md` §1, Achse A (Silhouetten-Signatur): die Unterscheidung
  `blob` / `linienförmig` / `polyedrisch-N` / `irregulär-geschlossen` braucht genau so
  einen Score, um zu entscheiden, welche Kanten überhaupt zur Silhouette zählen (die
  Regenbogen-artige Repetitions-Strafe `R` ist z. B. exakt das Werkzeug, um
  Dachpfannen-Linien von der Dachsilhouette selbst zu trennen — der immer wieder
  genannte Beispielfall in beiden Dokumenten).

Diese Formalisierung sollte in §1 der Fixture-Taxonomie nachgetragen werden, sobald an
der Extraktion selbst gearbeitet wird — heute nur vorgemerkt.

**Die Mikrotextur-Signatur** (`textureEnergy`, `dominantAngle`, `anisotropy`,
`frequencyScale`, `periodicity`, `localContrast`, `edgeDensity`, gewonnen aus
LBP + Gabor + 2D-Autokorrelation auf Luminanz statt RGB) ist methodisch solide und gut
belegt (die zitierte Literatur ist Standard-Texturanalyse, kein zweifelhafter Ansatz).

### Wo Vorsicht nötig ist

**Die zitierte Literatur ist an Fotografien validiert, nicht an gemalten/stilisierten
Bildern.** Alle 17 Fixtures aus der Taxonomie sind Illustrationen mit flachen
Cel-Shading-Flächen und handgezeichneten Strichlagen (Dachziegel-Linien, Holzmaserung,
Ziegelfugen) — nicht Fotos mit echtem Sensorrauschen und physikalischer Mikrostruktur.
Ob LBP/Gabor/Autokorrelation auf DIESEM Bildstil ein diskriminatives Signal liefern oder
ob die flachen Farbflächen zu wenig Textur enthalten, ist eine **offene, ungeprüfte
Frage** — keine, die aus den zitierten Papers folgt, weil deren Bilddomäne eine andere
ist. Vor jeder Extraktor-Änderung wäre ein kurzer empirischer Test an 2–3 echten
Fixtures (z. B. VLG-02 und INT-01 aus der Taxonomie) der richtige erste Schritt, nicht
die Literatur allein.

**Perspektiv-Entzerrung vor Periodizitätsmessung** (Homographie auf ein Rechteck, dann
erst Autokorrelation) setzt eine bereits erkannte, entzerrbare Fläche voraus — das ist
eine Abhängigkeit zur Geometrie-Erkennung, nicht unabhängig davon. Reihenfolge: erst
grobe Flächenhypothese (Geometrie-Score), dann Textur-/Periodizitätsanalyse auf der
entzerrten Fläche, nie umgekehrt.

### Architektonische Einordnung (`shaded-materials`-Skill, Harte Regeln)

Zwei Regeln aus dem Materialkanal-Vertrag entscheiden, WOHIN diese Signaturen dürfen:

1. **"Provider erzeugen Parameter, niemals Klassen."** Die vorgeschlagene
   Klassifikationstabelle (Glatt/geschlossen, Rau/körnig, Geschichtet/periodisch,
   Organisch/unregelmäßig, Transparent/spiegelnd) darf **nicht** eine zweite,
   unabhängige Materialklassifikation neben `classGrid`/`analyze()` werden — das ist
   exakt der historische Fehler, an dem der Prototyp laut `CLAUDE.md` gestorben ist
   ("CPU sagte Gras, GPU sagte Stein"). Zulässig: diese Tabelle als **Ersatzsignal für
   dieselbe eine Klassifikation** (Textur statt Farbe als Eingabe für denselben
   `analyze()`-Schritt), oder als Eingabe für **Rauheit/BRDF-Parameter** — die laut
   Kanalvertrag ohnehin noch fehlen (Unit 8, Kanäle B/A reserviert für Rauheit und AO,
   Status "noch nicht vorhanden"). Beide Verwendungen sind erlaubt, solange die Klasse
   weiterhin aus genau einer Stelle kommt.
2. **Marker-Overlays korrigieren Klassen, nicht BRDF-Parameter** (und umgekehrt sollte
   eine Textur-Signatur niemals eine Nutzer-Marker-Korrektur überstimmen) — falls
   Textur-Signaturen künftig `classGrid` mitbestimmen, muss die bestehende
   Marker-Vorrangregel (`CLAUDE.md` Invariante 3) unverändert gelten.

## 3. Vegetation als Wachstums-Agenten — Einordnung

Das ist ein **anderes** System als Punkt 2: kein Extraktions-, sondern ein
Simulations-/Weltgesetz-Thema (vergleichbar mit den bereits existierenden Weltgesetzen
"Vegetation-Reaktion" und den Frost-/Mud-/Growth-Mechaniken aus `CLAUDE.md`s
Weltgesetze-Katalog). Der Space-Colonization-Ansatz für Wurzeln/Ranken ist methodisch
etabliert (in der Recherche selbst gut belegt) und passt konzeptionell zu
lokalen-Regeln-statt-Top-down-Modellierung, die dieses Repo an anderer Stelle bereits
verfolgt.

**Zwei offene Punkte, bevor daran gebaut wird:**

- **Direkter Vorläufer bereits im Repo, mit ungeklärtem Schicksal.**
  `runtime/spatial-kernel/cellular-geometry-solver.js` ("proof-of-concept, not yet wired
  into any production path") implementiert GROW/ERODE/SMOOTH-Agenten auf einem
  Höhenfeld — dieselbe Algorithmenfamilie (lokale Agenten, Umfeld sampeln, Zelle
  besetzen/verändern) wie der jetzt vorgeschlagene Wurzel-/Ranken-Kernel, nur mit
  anderem Zielfeld. `docs/synthetic-visual-reverse-engineering.md` §5.1/§5.4 dokumentiert
  denselben Gedanken zusätzlich für Flächen-Kultivierung (Extraktion, nicht Vegetation).
  **Wichtig:** dieser Branch hat festgestellt (siehe `fixture-taxonomie.md`, Hinweis am
  Ende), dass `main` genau diese Datei — und mehrere verwandte Forschungsdokumente —
  inzwischen entfernt hat, aus einem hier nicht bekannten Grund. Bevor neuer
  Agenten-Code für Vegetation entsteht, wäre zu klären, ob diese Löschung eine bewusste
  Abkehr von der Agenten-Richtung war (dann muss der Grund zuerst verstanden werden) oder
  nur unabhängiges Aufräumen.
- **Sprachen-/Laufzeit-Bruch.** Die gelieferte `VegetationKernel.kt` liegt als
  `sandbox:/output/...`-Link einer fremden KI-Umgebung vor — ich habe darauf keinen
  Zugriff (kein Dateipfad, kein Netzwerkziel, das ich erreichen kann) und kann sie daher
  weder einsehen noch übernehmen. Selbst mit Zugriff: SHADEDs Laufzeit ist laut
  `CLAUDE.md` "Ziel statt Format" **JavaScript/ESM + WebGL 2**, nicht Kotlin — Kotlin war
  nie Entwicklungswerkzeug (das war Three.js/TSL) und schon gar nicht Laufzeit-Ziel
  (das war KorGE, SHADEDs historischer Vorläufer, nicht SHADED selbst). Eine Übernahme
  wäre keine Portierung eines fertigen Bausteins, sondern eine Neuimplementierung in
  JS/Compute-Shader-Logik anhand der Konzepte, nicht des Codes.

## 4. Ausdrücklich offen

- Kein Code geändert. Kein Extraktor umgebaut. Keine neue Provider-/Weltgesetz-Klasse
  angelegt.
- Keine empirische Prüfung der Mikrotextur-Hypothese an echten SHADED-Fixtures — nur als
  nächster sinnvoller Schritt benannt, nicht durchgeführt.
- Kein Versuch, `VegetationKernel.kt` zu beschaffen oder zu rekonstruieren.
- Keine Klärung, warum `main` `cellular-geometry-solver.js` entfernt hat.
