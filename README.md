SHADED

One image. One small world. Several increasingly difficult conversations with reality.

SHADED ist ein WebGL-Experiment für Menschen, die ein einzelnes Bild ansehen und sich denken:

«„Ja. Aber was, wenn es dort regnet, friert, brennt, matscht, wächst, verwittert und irgendwann ein Waldtier hinpinkelt?“»

Das war offenbar die falsche Frage.

Wir haben sie trotzdem beantwortet.

SHADED nimmt ein 2D-Bild, optional eine Tiefenkarte, und macht daraus eine lebendige, shaderbasierte Szene mit Wetter, Licht, Materialreaktionen, räumlicher Exploration, Point Clouds, Voxeln, Navigation, Jahreszeiten und diversen Umweltzuständen, deren Existenz in einem Grafikprojekt ursprünglich niemand beantragt hatte.

---

Was ist SHADED?

In der vernünftigen Beschreibung:

Ein Shader-Editor und experimenteller World-Space-Prototyp, der aus möglichst wenig Eingabedaten möglichst viel räumlich plausibles Verhalten erzeugt.

In der praktischeren Beschreibung:

Du gibst SHADED ein Bild.

SHADED betrachtet dieses Bild.

SHADED bildet Hypothesen.

Dann gibt es Regen.

Dann Schnee.

Dann Feuer.

Dann Matsch.

Dann Dijkstra.

Dann eine Sparse-Voxel-Welt.

Dann steht irgendwo ein Regler namens „Tier-Urin“.

An diesem Punkt ist das Projekt technisch gesehen noch immer eine statische Webanwendung.

---

Das Kernprinzip

SHADED versucht nicht, aus einem einzelnen Foto heimlich die objektive Wahrheit über das Universum zu extrahieren.

Das wäre unseriös.

Stattdessen wird unterschieden zwischen dem, was tatsächlich vorhanden ist, dem, was daraus abgeleitet werden kann, und dem, was wir ergänzen müssen, damit man nicht hinter ein Haus läuft und dort direkt in das mathematische Nichts fällt.

Kurz:

OBSERVED
   ↓
DERIVED
   ↓
INFERRED
   ↓
INVENTED
   ↓
hoffentlich sieht es gut aus

Die Rückseite eines Hauses, die nie fotografiert wurde, bleibt also eine erfundene Rückseite.

Wir nennen sie nur professioneller.

Das Repo bezeichnet solche Flächen ausdrücklich als "GENERATED", statt so zu tun, als hätte eine einzelne PNG-Datei plötzlich Kenntnisse über die örtliche Bauordnung erworben.

---

Quickstart

SHADED hat keinen komplizierten Build-Prozess, weil wir unsere Probleme lieber während der Laufzeit erzeugen.

python3 -m http.server 8000

Dann:

http://localhost:8000/

Anschließend:

1. Bild laden
2. optional Tiefenkarte laden
3. ERSTELLEN drücken
4. kurz zufrieden sein
5. irgendeinen Regler entdecken
6. 45 Minuten später die Ausbreitung von Matsch bei Tauwetter untersuchen

Für den Einstieg gibt es außerdem eine Demo-Szene. Die Runtime kann als PWA installiert werden und wird inklusive App-Shell offline vorgehalten.

---

Dinge, die SHADED inzwischen kann

🌧️ Wetter

Regen, Nebel, Sturm, Hagel, Schnee, Eis, Tauwetter und andere Methoden, eine ursprünglich vollkommen akzeptable Landschaft systematisch ungemütlich zu machen.

🔥 Feuer

Brennstoff kann brennen.

Feuer kann sich ausbreiten.

Wind beeinflusst die Sache.

Regen löscht.

Damit liegt SHADED beim Brandschutz bereits vor mehreren Gartenpartys.

💧 Wasser

Wasser bewegt sich entlang von Höhenpotentialen und wird nicht einfach dekorativ irgendwo hingemalt.

Wir wollten ursprünglich Shader machen.

Jetzt achten wir auf Massenerhaltung.

🟤 Matsch

Wo Wasser und Boden sich beruflich überschneiden, entsteht Matsch.

Bewegung kann Pfade hinterlassen.

Vegetation kann diese später wieder überwachsen.

Das System verfügt damit über ein differenzierteres Verständnis kommunaler Grünflächen als ich.

❄️ Jahreszeiten

Es gibt einen beschleunigten Jahreszeiten-Showcase mit Frühling, Hitze, Sturm, Herbst, Winter, Tauwetter und erneutem Wachstum.

Eine komplette ökologische Existenzkrise dauert dadurch nur wenige Sekunden.

🦌 Tier-Urin

Ja.

Der Parameter existiert.

Nein.

Ich werde ihn nicht wieder entfernen.

Er liegt als skalares Oberflächenfeld vor und ist ausdrücklich keine dreidimensionale Flüssigkeitssimulation. Es gibt Grenzen.

🩸 Blut

Siehe Tier-Urin.

Mit weniger Waldromantik.

⚡ Blitz

Kann automatisch passieren.

Kann man auch manuell auslösen.

Das ist vermutlich eine Macht, mit der die Benutzeroberfläche verantwortungsvoller umgehen sollte.

---

Raum

Mit einer Tiefenkarte kann SHADED aus Szenenfarbe und Tiefe eine relative Point Cloud erzeugen.

Diese lässt sich anschließend frei betrachten.

Maus ziehen       → Kamera drehen
Shift + ziehen    → verschieben
Mausrad           → rein / raus
WASD              → laufen

Für Wegfindung wird unter anderem Dijkstra verwendet.

Und zwar nicht nur nach dem Prinzip:

«„Ist da eine Wand?“»

sondern mit laufenden Kosten für Dinge wie Wasser, Eis, Matsch, Feuer, Rauch und Wachstum.

Der Algorithmus weiß damit beispielsweise:

normaler Boden → okay
Matsch         → lästig
Wasser         → ungünstig
Feuer          → überraschend ungünstig

Ein durchaus brauchbares Weltmodell.

---

Sparse Voxel World

Die Point Cloud kann in ein Sparse-Voxel-Feld überführt werden.

Voxel können unter anderem Material, Confidence, Provenienz und Zustandsfelder speichern.

Außerdem gibt es einen Pinselmodus mit:

- Pressure
- Tilt
- Eraser
- Undo
- Redo
- Projekt-Import
- Projekt-Export

Man kann also zunächst aus einem einzelnen Bild eine hypothetische Welt rekonstruieren und anschließend mit einem Grafiktablet physisch in deren Voxel eingreifen.

Das ist entweder ein Editor oder eine sehr kleine Gottheit mit Pointer Events.

---

Die Material-Wahrheit™

SHADED hat eine wichtige Regel:

Es gibt eine Material-Wahrheit.

Charaktere dürfen herumlaufen.

Katzen dürfen existieren.

Helden dürfen herumstehen.

Monster dürfen bedrohlich aussehen.

Aber sie dürfen nicht heimlich die Materialklassifikation der Welt verändern.

Actors sind Rendering-Dekoration.

Die Landschaft bleibt die Landschaft.

Diese Regel klingt trivial, bis man einmal einen 400-Commit-Prototypen besitzt, der gleichzeitig Shader, Point Clouds, Wetter, NPCs, Voxel, Dialoge, PWA, GPU-Provider, einen Jahreszeitenzyklus und Tierurin verwaltet.

---

Wally-Monokel

SHADED besitzt Inspektionslinsen.

Mit den Tasten "1–5" kann man unter anderem untersuchen:

1  Schmutz / Abnutzung
2  Belastung
3  Klang
4  Materialtreue
5  Kanten

Das Feature heißt Wally-Monokel.

Ich sehe aktuell keinen technischen Grund, diese Benennung zu verteidigen.

Ich sehe allerdings auch keinen Grund, sie zu ändern.

---

Charaktere

Es gibt unter anderem:

🐱 Katzen
👿 Feinde
🧑 NPCs
⚔️ Helden

Die Helden heißen unter anderem Nib, Brugg und Vellum.

Die Katzen besitzen Animationen zum Laufen, Fressen und Faulenzen.

Damit verfügen die Katzen innerhalb des Systems über eine vollständige Gameplay-Schleife.

---

Was SHADED ausdrücklich NICHT behauptet

SHADED ist kein magischer Single-Image-3D-Rekonstruktionsapparat.

Aus einem Bild kann man nicht zuverlässig wissen:

- was hinter einem Gebäude liegt,
- wie tief eine unsichtbare Oberfläche tatsächlich ist,
- ob irgendeine generierte Rückseite architektonisch korrekt ist,
- welche Materialien außerhalb sichtbarer Bereiche existieren,
- was der Fotograf beim Aufnehmen gedacht hat.

Unbekannte Information wird deshalb nicht heimlich zur Messung erklärt.

Manche Dinge werden beobachtet.

Manche werden berechnet.

Manche geschätzt.

Manche erfunden.

Und manche haben einen Button mit einem Hirsch-Emoji bekommen.

Das ist epistemisch sauberer, als es klingt.

---

Tests

Das Projekt besitzt einen "npm run check".

Der entsprechende "package.json"-Eintrag ist inzwischen weniger ein Script als eine persönliche Auseinandersetzung mit der Endlichkeit menschlichen Lebens.

Er überprüft JavaScript, Python, JSON-Schemas, Actors, Depth-Layer, Wetter, Editor, Mobile-Editor, Linsen, Dialoge, PWA, Navigation, Spatial Runtime, Shader-Sandbox, Style Discovery, Provider, Materialsysteme und verschiedene andere Bestandteile.

Der Befehl beginnt ungefähr mit:

npm run check

Was danach passiert, geht nur Node, Python und deinen Prozess-Scheduler etwas an.

---

Docker

Natürlich gibt es Docker.

docker build -t shaded .
docker run --rm -p 8080:80 shaded

Danach:

http://localhost:8080/

Healthcheck:

/healthz

Denn wenn ein Projekt simulierten Hagel, Voxelkontamination und jahreszeitlich regenerierende Trampelpfade verwaltet, möchte Kubernetes wenigstens wissen, ob nginx noch antwortet.

---

Projektphilosophie

SHADED folgt im Wesentlichen fünf Regeln:

1. Ein Bild ist wenig Information.
Wir behandeln es entsprechend.

2. Erfundenes bleibt erfunden.
Nur weil es hübsch aussieht, wird es nicht rückwirkend gemessen.

3. Provider sind Werkzeuge, keine Religion.
Ein Modell darf Vorschläge machen. Die Weltarchitektur gehört ihm deshalb noch lange nicht.

4. Weltzustand und Darstellung werden getrennt.
Feuer soll nicht deshalb existieren, weil irgendwo ein orangener Pixel liegt.

5. Wenn schon eskalieren, dann reproduzierbar.
Seeds existieren aus Gründen.

Diese Trennung von beobachteten, abgeleiteten, geschätzten und erfundenen Informationen ist ein ausdrücklicher Bestandteil der Projektarchitektur.

---

FAQ

Ist das eine Game Engine?

Nein.

Ist das ein Shader-Editor?

Ja.

Ist das eine Spatial Runtime?

Inzwischen leider ebenfalls ja.

Gibt es Point Clouds?

Ja.

Voxel?

Ja.

Physik?

Teilweise.

Wetter?

Ja.

Vegetation?

Ja.

Charaktere?

Ja.

Dialogsystem?

Ja.

Offline-PWA?

Ja.

GPU-Provider?

Ja.

Dijkstra?

Ja.

Tierurin?

Wir hatten dieses Gespräch bereits.

---

Warum?

Weil moderne Grafik erstaunlich viele Dinge überzeugend vortäuschen kann.

Interessanter ist deshalb nicht:

«„Wie machen wir ein Bild hübscher?“»

sondern:

«„Wie wenig müssen wir über eine Welt wissen, damit sie sich trotzdem so verhält, als hätte sie Regeln?“»

SHADED ist der Versuch, diese Grenze systematisch zu missachten, anschließend sauber zu markieren und dann noch einen Regler daneben zu bauen.

---

Status

Experimentell.

Benutzbar.

Gelegentlich erstaunlich.

Gelegentlich eine Diskussion darüber, ob die Rückseite eines Hauses "INFERRED" oder "INVENTED" ist.

Die Software entwickelt sich aktiv weiter.

Die Welt ebenfalls.

Der Hirsch bedauerlicherweise auch.

---

SHADED

One image. One small world.

Keine Garantie für die Rückseite des Hauses.
