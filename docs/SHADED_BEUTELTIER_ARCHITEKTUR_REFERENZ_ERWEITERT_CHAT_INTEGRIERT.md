# SHADED / BEUTELTIER -- Konsolidierte Architektur- und Denkmodell-Referenz

**Status:** Arbeitsverfassung / Architekturreferenz\
**Stand:** 29. August 2026\
**Zweck:** Konsolidierung der in diesem Chat erarbeiteten
Architekturentscheidungen, Richtlinien, Thesen, Korrekturen, Testideen,
Denkmodelle und Produktfolgen. **Ergänzung:** Single-SHADED-UI,
Legacy-Konsolidierung, Style-/Effect-Architektur, Style Discovery,
Style-preserving LOD, Wasser-Renderer-Trennung,
Material-/Organik-System, Element-/Simulations-Labs,
Donor-/Lizenzmatrix, FreeStylized/OpenPBR/Material-Binding und
Agenten-/Dokumentationsregeln.

> Dieses Dokument trennt bewusst zwischen **festen Projektprinzipien**,
> **technischen Architekturentscheidungen**, **Hypothesen, die getestet
> werden müssen**, und **Grenzen, bei denen SHADED ausdrücklich nicht
> behaupten darf, mehr zu wissen als die Evidenz hergibt**.

------------------------------------------------------------------------

# 0A. Ausgangspunkt: SHADED reduziert Kosten, Freiheitsgrade und Notwendigkeiten

Dieser Abschnitt steht bewusst **vor** der bisherigen Kurzfassung. Er
ist die Referenz, von der aus die späteren Themen -- Single-Image-Welt,
Observability, Provider, Room-First, BEUTELTIER, COLMAP, Point Clouds,
Shader, Style, Mobile Performance und Agentenregeln -- gelesen werden
sollen.

## 0A.1 Das Ziel ist kleiner als „Reconstruction"

SHADEDs ursprüngliche und weiterhin gültige Idee ist:

> **One image. One small world.**

Ein Bild, Foto, Gemälde oder eine Zeichnung soll genügen, damit ein
Mensch für einige glaubwürdige Minuten **in diese Welt treten** kann.
Nicht gefordert ist, die objektiv wahre unsichtbare Realität
wiederzugewinnen, einen SOTA-Benchmark zu gewinnen oder ein großes
Modell dauerhaft mitzuführen.

Gesucht wird:

> **Gerade genug Welt für glaubwürdige Immersion -- mit so wenig
> dauerhafter Rechen-, Speicher-, Energie- und Abhängigkeitslast wie
> möglich.**

Die große Maschine ist deshalb nicht automatisch das Produkt. Sie kann
Laborgerät sein.

## 0A.2 Große Provider sind Lehrer, Messgeräte und Wegwerfwerkzeuge

SHADED darf starke Modelle, Cloud-Systeme, GPUs und große Provider
vollständig benutzen, wenn dadurch herausgefunden wird, **was später
nicht mehr gebraucht wird**.

``` text
teurer Provider / aufwendiger Versuch
↓
Beobachtung
↓
welche Information war tatsächlich entscheidend?
↓
Constraint / Regel / kleine Repräsentation / billiger Algorithmus
↓
Provider wird für diesen Teil entbehrlich
```

Ein erster Lauf darf teuer, redundant oder langsam sein, wenn er
zukünftige Kosten entfernt.

> **Wenn eine Berechnung heute Geld kostet, damit dieselbe oder eine
> größere Berechnung morgen nicht mehr nötig ist, muss sie über die
> eingesparte Zukunft bewertet werden -- nicht nur über ihren
> unmittelbaren Preis.**

SHADED optimiert damit nicht nur Inferenzkosten. Es versucht,
**Notwendigkeiten abzuschaffen**.

Die Leitfrage für jede große Komponente lautet:

> **Was genau tut dieses teure Ding hier, das ein viel dümmeres Ding
> ausreichend gut übernehmen könnte, sobald verstanden ist, worauf es
> ankommt?**

## 0A.3 Providerqualität ist nicht dasselbe wie Systemnutzen

Aus den bisherigen Versuchen folgt **keine allgemeine Behauptung**, dass
DepthAnything v2, DepthAnything 3, `depthanything.cpp`, MapAnything,
COLMAP oder andere Provider schlechte Werkzeuge seien.

Die konkrete Beobachtung ist enger: In dem extrem chaotischen
Gamescom-Material haben die bisher getesteten
Mapping-/Reconstruction-Versuche -- lokal und in der Cloud, mit
unterschiedlichen Hardwareklassen, Modellen, Auflösungen, Framezahlen
und Samplingraten -- bislang keine zuverlässig erkennbare gemeinsame
Welt geliefert.

Das Material verletzt viele günstige Voraussetzungen gleichzeitig:

-   etwa 80.000 Besucher und massive Occlusion,
-   Boden teilweise über lange Zeit nicht sichtbar,
-   stark wechselnde Beleuchtung, Displays und Reflexionen,
-   derselbe Stand wirkt aus verschiedenen Bildern völlig
    unterschiedlich,
-   Rempler, Eigenbewegung, Erschrecken und abrupte Kamerabewegung,
-   Motion Blur und Perspektivsprünge,
-   temporäre Eventarchitektur.

Daraus darf nicht geschlossen werden: „Provider X kann nichts." Aber
ebenso wenig darf aus Größe, Hardwarebedarf, GitHub-Sternen oder
Bekanntheit geschlossen werden: „Provider X muss für SHADEDs konkrete
Aufgabe die beste Lösung sein."

> **GitHub-Sterne sind keine räumliche Evidenz. Modellgröße ist keine
> Systemarchitektur. Hardwarebedarf ist kein Qualitätsbeweis.**

## 0A.4 Das Gesamtsystem zählt, nicht der Stolz einzelner Komponenten

Jedes Modell und jeder Algorithmus hat Fehlerprofile. Ein Fehler eines
großen Modells kann manchmal durch etwas sehr Kleines ausreichend
kompensiert werden:

-   einen Shader,
-   eine Maske,
-   einen geometrischen Constraint,
-   eine andere Reihenfolge,
-   eine minimal andere Lastverteilung,
-   einen frühen Reject,
-   einen zweiten Provider mit anderem Fehlerprofil,
-   einen simplen klassischen Algorithmus,
-   eine LUT oder eine bekannte Raumgrenze.

Die Optimierungsfrage lautet deshalb nicht:

> **Welcher Provider ist der stärkste?**

Sondern:

> **Welche konkrete Schwäche bleibt an dieser Stelle übrig, und was ist
> das billigste Mittel, das sie für die Gesamtwahrnehmung ausreichend
> unschädlich macht?**

Ein großes Modell kann in vielen Teilaspekten überlegen sein und genau
in dem einen Aspekt scheitern, der die Immersion zerstört. Ein einfacher
Shader oder Constraint kann diesen Fehler eventuell billiger ausgleichen
als ein noch größeres Modell.

> **Nicht die Stärke einzelner Komponenten maximieren, sondern die
> Schwächen des Gesamtsystems so billig wie möglich gegenseitig
> auslöschen.**

Auch die **Reihenfolge** ist Teil der Lösung. Dieselben Bausteine können
in anderer Reihenfolge einen anderen Lösungsraum, andere Kosten und
andere Fehler erzeugen.

## 0A.5 Von Reconstruction zu Möglichkeitsreduktion

Ein klassisches Reconstruction-Problem fragt:

> Wo im großen 3D-Raum befindet sich die richtige Geometrie?

SHADED kann das Problem vorher verändern:

``` text
Beobachtungen
+
bekannter / ermittelter verfügbarer Raum
+
Flächen- und Raumconstraints
+
mehrere offene oder halboffene Point Clouds
↓
immer weniger zulässige Welten
↓
nur noch lokale Mehrdeutigkeiten
↓
wenige zusätzliche Hinweise reichen zur Entscheidung
```

Wenn der Rahmen bereits bekannt ist und durch mehrere unabhängige Wolken
gestützt wird, muss ein nachgeschaltetes Verfahren nicht mehr die
gesamte Welt liefern. Es muss eventuell nur noch genug Evidenz liefern,
um die **verbleibenden Zweideutigkeiten** zu beseitigen.

Damit ändert sich auch die Rolle von COLMAP:

``` text
bereits stark eingeschränkte Welthypothese
+
COLMAP
↓
gerade genug unabhängige geometrische Evidenz,
um verbleibende Alternativen auszuschließen
```

> **Nicht Rekonstruktion durch maximale Datendichte, sondern
> Rekonstruktion durch schrittweisen Verlust von Möglichkeiten.**

## 0A.6 Point Clouds müssen nicht sauber fusionieren, um Evidenz zu liefern

SHADED verlangt nicht automatisch eine saubere, vollständig fusionierte
Point Cloud. Eine Point Cloud kann auch als **verteilte, unsichere
räumliche Evidenz** behandelt werden.

Mehrere schlechte oder unvollständige Wolken dürfen offen bleiben,
einander durchdringen, Lücken besitzen, unterschiedliche Fehler haben
und nur Teilbereiche treffen.

Interessant ist dann nicht ausschließlich:

> Wie sauber ist die Fusion?

Sondern:

> **Wo erzeugen unabhängige Beobachtungen trotz ihrer Fehler wiederholt
> räumliche Unterstützung?**

Wenn mehrere Wolken in denselben bekannten zulässigen Raum zielen, kann
wiederholte Dichte oder Konvergenz bereits Information tragen, bevor
einzelne Punktmengen „schön" zusammenpassen.

Arbeitsbegriffe dafür können `Evidence Volume`, `Spatial Vote Field`,
`Convergence Field`, `Hypothesis Occupancy` oder
`Weak-Consensus Geometry` sein. Sie sind keine festgeschriebene
Produktterminologie.

## 0A.7 Das Besen-/Borstenexperiment

Ein anschauliches Testmodell:

1.  Zwei unterschiedliche Perspektiven werden als offene räumliche
    Punkt-/Strahlenstrukturen gedacht -- wie zwei Borstenfelder.
2.  Beide werden in den bereits begrenzten verfügbaren Raum gerichtet.
3.  Ihre räumlichen Hypothesen werden schrittweise in Richtung der
    gegenüberliegenden Begrenzung propagiert.
4.  Man geht iterativ weiter.
5.  Noch bevor sich beide Strukturen exakt treffen, kann sich räumliche
    Konvergenz bemerkbar machen.

Die Hypothese ist nicht: Zwei falsche Wolken ergeben automatisch
Wahrheit.

Sondern:

> **Wenn unabhängige unsichere Beobachtungen unter denselben realen
> Raumconstraints immer weniger Ausweichmöglichkeiten besitzen, kann
> ihre verbleibende Konvergenz früh genug Information liefern, um
> Mehrdeutigkeiten zu reduzieren.**

Ein Punkt muss dafür nicht perfekt sein. Eine Wolke muss nicht
vollständig sein. Entscheidend kann sein, dass der **Raum möglicher
Fehler kollabiert**.

## 0A.8 30 %, 50 % und „0 %" nur relativ zur Zielrelation bewerten

Prozentzahlen dürfen hier nicht vorschnell als klassische Reconstruction
Coverage interpretiert werden.

Wenn von bisherigen Werkzeugen sinngemäß „0 %" gesprochen wird, bedeutet
das **nicht**, dass COLMAP keinerlei Geometrie berechnen oder ein
Depth-Modell keinerlei Tiefe schätzen könne.

Gemeint ist:

> **0 % der konkret benötigten gemeinsamen Raumrelation**, wenn die
> Einzelresultate keine erkennbare, belastbare gemeinsame Interpretation
> dieses chaotischen Raums herstellen.

Wenn fünf sehr unterschiedliche Ansichten eines großen, um eine Ecke
verlaufenden Bereichs dagegen wiederholt 30 %, 50 % oder mehr
**nicht-zufällige gemeinsame räumliche Unterstützung** erzeugen, muss
diese Zahl gegen einen passenden Nullfall bewertet werden -- nicht gegen
die Fantasie einer perfekten 100-%-Rekonstruktion.

Die richtige Frage ist:

> **Wie viel dieser Übereinstimmung wäre ohne gemeinsame Welt, mit
> falschen Posen, falschen Räumen oder randomisierten Inputs ebenfalls
> entstanden?**

Daher sind Falsifikationstests zentral:

-   Bilder verschiedener Räume mischen,
-   Kameraposen absichtlich verfälschen,
-   Bilder spiegeln oder drehen,
-   Depth-Felder randomisieren,
-   Same-Room gegen Different-Room testen,
-   Leave-one-image-out,
-   Provider einzeln entfernen,
-   räumliche Peaks und Flächenunterstützung auf Stabilität prüfen.

Wenn die echte Konfiguration deutlich stabilere Konvergenz erzeugt als
diese Kontrollen, wird aus einem visuellen Eindruck ein messbares
Signal.

## 0A.9 „COLMAP liefert zu wenig Punkte" kann die falsche Kritik sein

Sobald andere Constraints bereits einen Großteil des Lösungsraums
ausgeschlossen haben, kann die benötigte Restinformation sehr klein
werden.

Dann lautet die relevante Frage nicht:

> Hat COLMAP die Fläche vollständig rekonstruiert?

Sondern:

> **Hat COLMAP genug unabhängige Information geliefert, damit die noch
> verbleibenden plausiblen Raumhypothesen nicht mehr gleichwertig
> sind?**

Ein fehlender Bereich ist nicht automatisch „fehlende Reconstruction",
wenn seine möglichen Zustände bereits durch Raumhülle, Sichtstrahlen,
Ebenen, Occlusion, bekannte Maße, Anschlussflächen und andere
Perspektiven so stark eingeschränkt wurden, dass er für die gewünschte
kleine Welt praktisch festgelegt ist.

Möglichkeitsreduktion hebt Provenance nicht auf. OBSERVED, DERIVED,
INFERRED, INVENTED und UNKNOWN bleiben getrennt.

## 0A.10 Die Gamescom ist gerade als Worst Case nützlich

Ein leerer, langsam gefilmter, gleichmäßig beleuchteter Raum würde vor
allem zeigen, dass etablierte Verfahren unter günstigen Bedingungen
funktionieren.

Die Gamescom zwingt SHADED dagegen zu der Frage:

> **Welche Information ist wirklich unverzichtbar, wenn fast alles
> Visuelle zeitweise unzuverlässig wird?**

Wenn Menschen den Boden lange verdecken, muss Bodenstruktur eventuell
aus anderen Relationen entstehen. Wenn Beleuchtung die Appearance
ständig verändert, muss persistente Geometrie von Appearance getrennt
werden. Wenn Frames durch Rempler unbrauchbar werden, darf Framezahl
nicht mit Informationsmenge verwechselt werden. Wenn derselbe Stand in
verschiedenen Bildern völlig anders wirkt, muss Standidentität auf
robusteren Beziehungen beruhen als bloßer Pixelähnlichkeit.

Damit ist das Material nicht nur ein schwieriger Datensatz, sondern ein
Werkzeug zur Destillation.

## 0A.11 Ein teurer erster Run kann die billigste Architektur sein

Ein erster SHADED-/BEUTELTIER-Lauf darf zunächst so wirken: Er rattert,
kostet und erzeugt keine sofort beeindruckende Gegenleistung.

Diese Bewertung ist unvollständig, wenn der Lauf Wissen produziert, das
spätere Arbeit dauerhaft eliminiert.

``` text
Gesamtkosten
=
einmalige Erschließung
+
spätere Runtime
+
Wiederholungen
+
Cloud-/Provider-Abhängigkeiten
+
Hardwarebedarf
```

Nicht bloß:

``` text
Kosten des ersten sichtbaren Outputs
```

Ein Provider darf einmal teuer sein, wenn sein Beitrag danach gebacken,
vermessen, als Constraint gespeichert, in eine kleine Repräsentation
übersetzt, durch einen Shader oder klassischen Solver ersetzt oder
vollständig entfernt werden kann.

> **Das Labor darf teuer sein. Das Endprodukt soll es nicht sein.**

## 0A.12 SHADEDs eigentliche Optimierungsrichtung

SHADED sucht nicht einfach maximale Qualität bei weniger GPU.

Es sucht:

> **maximale glaubwürdige Immersion pro dauerhaft benötigtem Byte, FLOP,
> Watt, Dependency und Euro.**

Der Arbeitsprozess läuft bewusst vom Maximum zum Minimum:

``` text
alles benutzen, was Erkenntnis liefern kann
↓
Maximum der erreichbaren Wirkung kennenlernen
↓
Komponenten einzeln entfernen / vereinfachen
↓
Fehler beobachten
↓
nur das behalten, dessen Fehlen wirklich zählt
↓
erneut vereinfachen
↓
kleinstes noch glaubwürdiges System
```

Die richtige Frage lautet nicht:

> Wie bekommen wir dieselbe große Pipeline auf schwächere Hardware?

Sondern:

> **Welche Teile der großen Pipeline waren für die erlebte Welt
> überhaupt jemals notwendig?**

## 0A.13 Unerwartete Ergebnisse sind Beobachtungen, keine Regelverstöße

SHADED entstand nicht aus der Behauptung, bekannte Werkzeuge absichtlich
„falsch" zu benutzen.

Der Entwicklungsmodus ist:

> Eine Idee bauen, beobachten, was passiert, und unerwartete Phänomene
> untersuchen.

Wenn ein Verfahren außerhalb seiner üblichen Zielsetzung etwas
Merkwürdiges, aber reproduzierbares zeigt, darf ein Agent das nicht
allein deshalb verwerfen, weil es nicht dem vorgesehenen
Standardworkflow entspricht.

Ebenso darf ein Agent nicht sagen:

> „Das kann nicht funktionieren, weil Point Clouds normalerweise anders
> fusioniert werden."

wenn der Versuch gar keine klassische Fusion verlangt.

Stattdessen:

1.  Behauptung präzisieren.
2.  Beobachtung reproduzieren.
3.  Nullhypothese definieren.
4.  Gegenprobe bauen.
5.  Signal messen.
6.  Erst dann verwerfen oder übernehmen.

> **Absurd wirkende Resultate sind keine Beweise. Aber sie sind testbare
> Beobachtungen.**

Kein Agent darf eine interessante Beobachtung in eine vertrautere
Problemdefinition zurückbiegen, nur weil dafür bereits ein
Standardverfahren existiert.

## 0A.14 Konsequenz für Agenten und Bewertungen

Bei jeder Analyse von SHADED ist zuerst zu klären:

1.  Welches Problem muss diese Komponente tatsächlich noch lösen?
2.  Welche Freiheitsgrade wurden vorher bereits ausgeschlossen?
3.  Welche Restzweideutigkeit muss beseitigt werden?
4.  Wie wenig Evidenz reicht dafür?
5.  Kann ein billigerer Schritt denselben praktischen Effekt erzeugen?
6.  Kann die teure Komponente danach entfernt werden?
7.  Ist ein scheinbarer Fehler für die wahrgenommene Gesamtwelt
    überhaupt relevant?
8.  Wird gerade ein Standardbenchmark auf eine andere Problemdefinition
    angewendet?
9.  Ist das unerwartete Resultat bereits falsifiziert worden -- oder nur
    ungewohnt?
10. Welche Nullkontrolle würde zeigen, dass beobachtete Konvergenz
    zufällig ist?

Agenten dürfen insbesondere **nicht** GitHub-Sterne als
Qualitätsargument benutzen, Modellgröße als Autorität behandeln, „zu
wenige Punkte" ohne Bezug auf die verbleibende Mehrdeutigkeit als Fehler
deklarieren, offene Point Clouds automatisch an sauberer Fusion messen,
einen einmaligen Providerpreis mit dauerhaften Runtimekosten verwechseln
oder unerwartete Verfahrensergebnisse allein wegen unkonventioneller
Nutzung verwerfen.

## 0A.15 Die kürzeste Form

> **SHADED versucht nicht, immer mehr zu berechnen. SHADED versucht
> herauszufinden, was nicht mehr berechnet werden muss.**

> **Große Modelle sind Laborgeräte, bis ihre Erkenntnis in etwas
> Kleineres überführt wurde.**

> **Eine Point Cloud muss nicht schön sein, wenn ihre Fehler gemeinsam
> genügend Möglichkeiten ausschließen.**

> **COLMAP muss nicht die Welt liefern, wenn die Welt bereits so weit
> eingeschränkt ist, dass wenige Punkte nur noch Zweideutigkeiten
> beseitigen müssen.**

> **Ein Shader darf ein Milliardenparameter-Problem ersetzen, wenn für
> die Wahrnehmung genau dieser Shader genügt.**

> **Die beste Reihenfolge kann wertvoller sein als der stärkste
> Einzelbaustein.**

> **Kosten werden über die Lebensdauer des Wissens bewertet, nicht über
> den ersten Run.**

> **Das Ziel ist nicht die größte Reconstruction. Das Ziel ist die
> kleinste Maschine, in der die Welt noch glaubwürdig existiert.**

------------------------------------------------------------------------

# 0. Kurzfassung

SHADEDs Kernidee bleibt:

> **One image. One small world.**

SHADED soll aus einem einzelnen Bild eine kleine, betretbare Welt
konstruieren. Nicht, indem es behauptet, eine unsichtbare „wahre"
Realität wiederzugewinnen, sondern indem es aus dem Bild nur das
räumlich Ableitbare extrahiert, daraus eine kohärente Welt konstruiert
und fehlende Wahrnehmungsdetails bewusst über Materialien, Shader und
Weltregeln ergänzt.

> **Geometry solves geometry. Shaders solve perception.**

Die spätere Nutzung von SHADED für BEUTELTIER widerspricht diesem Ziel
nicht. Die ungefähr 300 Provider kamen spät hinzu, weil BEUTELTIER ein
anderes, wesentlich größeres Problem stellte: chaotische Bilder und
Videos einer riesigen Messe sollten in vorhandene bzw. rekonstruierte
räumliche Strukturen eingeordnet werden. Diese Provider sind **Werkzeuge
und Forschungsobjekte**, nicht SHADEDs Identität.

Die zentrale methodische These dieses Dokuments lautet:

> **Reconstruct in dependency order, not observation order.**

Oder einfacher:

> **Room first. Everything else second.**

Ein Bild liefert alles gleichzeitig: Licht, Farbe, Menschen, Texturen,
Kanten, Flächen, Spiegelungen, Beschriftungen und Rauschen. Die Pipeline
darf daraus aber nicht schließen, dass alles gleichzeitig gleich wichtig
ist.

Die Welt besitzt eine Abhängigkeitsordnung:

``` text
Topologie
↓
Raum
↓
Flächen
↓
Öffnungen / Primitive / größere Objekte
↓
metrische Verfeinerung
↓
Details
↓
Material
↓
Appearance / Grafik / Effekte
```

Ein Detail hängt von einer Fläche ab. Eine Fläche hängt von einem Raum
ab. Ein Raum hängt von Topologie und räumlichen Beziehungen ab. Nicht
umgekehrt.

Das ist dasselbe Grundprinzip wie bei MANIFOLD, nur auf Geometrie
übertragen: **Bedeutung bzw. Gültigkeit entsteht durch Beziehungen,
Abhängigkeiten und Voraussetzungen.**

------------------------------------------------------------------------

# 1. Projektverfassung

## 1.1 SHADEDs Primärziel

**SHADED CORE:**

> **One image. One small world.**

Ein Einzelbild wird zu einer kleinen, betretbaren Welt.

SHADED ist **nicht primär**:

-   ein allgemeines Photogrammetrie-Framework,
-   ein Video-Reconstruction-System,
-   ein COLMAP-Ersatz,
-   ein MapAnything-Wrapper,
-   ein Depth-Modell-Benchmark,
-   ein „Single Image → perfektes 3D Asset"-Generator,
-   ein Versuch, aus einem Bild eine verborgene objektive Realität
    vollständig wiederzugewinnen.

SHADEDs Ziel ist:

> Eine räumlich kohärente, begehbare Interpretation des Bildes zu
> erzeugen, die ihre sichtbaren Aussagen erklärt und fehlende Details
> bewusst konstruiert, ohne erfundene Information als beobachtete
> Wahrheit auszugeben.

## 1.2 „Shaders bedeuten die Welt"

SHADED soll nicht jedes wahrgenommene Detail geometrisch modellieren.

``` text
Geometrie:
genug, damit Raum, Volumen, Kollision und Perspektive funktionieren

+

Shader / Materialien:
genug, damit das Gehirn Material, Mikrostruktur, Alterung,
Lichtreaktion und Oberflächendetail wahrnimmt

+

Weltregeln:
genug, damit sich die Welt glaubwürdig verhält
```

SHADED ist nicht erfolgreich, wenn es maximal viele Polygone erzeugt.
SHADED ist erfolgreich, wenn es mit möglichst wenig belastbarer
Geometrie eine überzeugende Welt erzeugt.

## 1.3 Projektziel ist Verfassung

„One image. One small world." darf nicht beiläufig weichgespült,
generalisiert oder durch eine modischere Beschreibung ersetzt werden.

> Eine Änderung des Kernziels ist eine explizite Produktentscheidung des
> Menschen, kein Refactor.

------------------------------------------------------------------------

# 2. SHADED Core und BEUTELTIER-Erweiterung sind kein Widerspruch

## 2.1 SHADED Core

``` text
EIN BILD
↓
räumlich beobachtbare Information
↓
kleine 3D-Hypothese
↓
begehbare Welt
↓
Shader / Materialien / Weltregeln
```

## 2.2 SHADED × BEUTELTIER

BEUTELTIER stellt eine andere Aufgabe:

``` text
viele chaotische Beobachtungen
+
bekannte Gebäudegeometrie / Pläne / Maße
+
Provider
↓
lokale Räume und räumliche Relationen erkennen
↓
Räume verbinden
↓
großen Gebäudekomplex zusammensetzen
```

Dafür wurde SHADED später um sehr viele Provider erweitert.

Diese Erweiterung bedeutet **nicht**: SHADED ist jetzt ein
Video-Reconstruction-Framework.

Sie bedeutet:

> Die Denkweise und Infrastruktur von SHADED werden als Werkzeugkasten
> benutzt, um ein anderes Problem zu lösen.

## 2.3 Warum der Provider-Benchmark trotzdem dazugehört

Die Provider wurden für BEUTELTIER eingebaut, weil noch nicht klar ist:

-   welche Verfahren wirklich nützlich sind,
-   welche Teilaufgabe welcher Provider besser löst,
-   welche Verfahren nur unter bestimmten Bedingungen funktionieren,
-   welche alten Verfahren moderne Modelle ergänzen,
-   welche etablierten Vorgehensweisen selbst hinterfragt werden
    sollten,
-   welche neuen Kombinationen aus kleinen, spezialisierten Verfahren
    besser sind als ein einzelnes großes Modell.

Der Benchmark ist deshalb Forschung darüber:

> **Welche Werkzeuge passen überhaupt zu SHADEDs Art, Welt zu
> verstehen?**

------------------------------------------------------------------------

# 3. Epistemisches Grundmodell

## 3.1 Richtig geraten ist nicht gemessen

Ein Modell kann einen unsichtbaren Wert zufällig korrekt erraten. Das
macht ihn nicht zu einer Beobachtung.

``` text
wahre Aussage
≠
belegte Aussage
```

> **Richtig geraten ist nicht gemessen.**

Selbst wenn ein generatives Modell die unsichtbare Rückseite eines
Objekts täuschend realistisch und reproduzierbar erzeugt, bleibt diese
Information konstruiert.

Konsistenz erzeugt keine Evidenz.

``` text
nicht sichtbar
↓
plausibel ergänzt
↓
wiederholt gerendert
↓
konsistent

≠

beobachtet
```

## 3.2 Interne Wahrheitsklassen

### OBSERVED

Direkt aus dem Input gestützt.

Beispiele: - sichtbare Kante, - sichtbarer Flächenverlauf, -
Perspektivbeziehung, - Occlusion Ordering, - erkannte Diagonale, -
belastbarer Referenzpunkt.

### DERIVED

Mathematisch aus beobachteter Evidenz hergeleitet.

Beispiele: - Schnittpunkt, - relative Tiefe, - Parallelitätsrelation, -
geschätzte Ebene, - metrische Relation bei bekanntem Maßstab.

### INFERRED

Durch mehrere unabhängige Hinweise stark gestützte Hypothese.

Beispiele: - Boden setzt sich hinter einem Objekt fort, - zwei Flächen
gehören wahrscheinlich zum selben Raum, - ein Portal verbindet zwei
Raumcharts.

### INVENTED / PRIOR-COMPLETED

Für eine vollständige Welt benötigte, aber nicht beobachtete
Information.

Beispiele: - Rückseite eines Schranks, - Wand hinter einem verdeckenden
Objekt, - unsichtbare Materialvariation.

### UNKNOWN

Nicht ausreichend bestimmbar.

**UNKNOWN ist ein gültiges Ergebnis.**

## 3.3 Leitsatz

> **Plausibility is allowed. False provenance is not.**

## 3.4 Sichtbar, aber nicht messbar vs. unsichtbar

-   Sichtbar, aber räumlich nicht ausreichend messbar → **Abstain.**
-   Unsichtbar, aber für eine begehbare Welt erforderlich → plausible
    Completion erlaubt, aber als konstruiert markiert.

------------------------------------------------------------------------

# 4. MANIFOLD-Prinzip auf Geometrie

Der zentrale Gedanke ist **Abhängigkeit**.

``` text
Topologie
↓
Raum
↓
Fläche
↓
Öffnung / Objekt
↓
Detail
↓
Material
↓
Appearance
```

Ein Fenster ist nicht bloß ein erkannter Gegenstand.

``` text
Fenster
→ braucht tragende Fläche
→ Fläche braucht Orientierung und Ausdehnung
→ Fläche gehört zu / begrenzt einen Raum
→ Raum muss mit angrenzenden Flächen kompatibel sein
```

SHADED fragt nicht nur:

> Was ist das?

Sondern:

> **Welche Voraussetzungen müssen gelten, damit dieses beobachtete Ding
> räumlich überhaupt existieren kann?**

Nicht die Einzelwerte sind das Entscheidende, sondern Beziehungen,
Voraussetzungen und Abhängigkeiten.

------------------------------------------------------------------------

# 5. Erschaffung verläuft in Abhängigkeitsrichtung

Es geht hier nicht um die physiologische Reihenfolge visueller
Wahrnehmung, sondern um **Erschaffung**.

Nahezu jedes konstruktive Verfahren arbeitet:

``` text
groß
↓
grob
↓
strukturell
↓
feiner
↓
Detail
↓
Finish
```

Beispiele:

-   Spielklötze → Duplo → Lego → Lego Technik.
-   Zeichnen → Komposition → große Formen → Proportion → Volumen →
    Details → Farbe.
-   Bildhauerei → Grundvolumen → Form → Details → Oberfläche.
-   Töpferei → Volumen → Grundform → Verfeinerung → Oberfläche.
-   Spielentwicklung → Mechanik/Weltlogik → Blockout → Levelstruktur →
    Collision/Navigation → Gameplay → Art → Lighting/VFX.
-   Architektur → Grundriss → Volumen → Tragwerk → Räume → Öffnungen →
    Ausbau → Oberflächen.

### Konsequenz

> **Reconstruction sollte die Welt nicht in umgekehrter
> Abhängigkeitsrichtung aufbauen.**

Ein Foto liefert zwar Grafik zuerst, aber daraus folgt nicht, dass
Grafik die Welt definieren soll.

------------------------------------------------------------------------

# 6. Observation Order ist nicht Construction Order

Die Kamera liefert gleichzeitig:

-   Pixel,
-   Licht,
-   Farbe,
-   Texturen,
-   Kanten,
-   Menschen,
-   Spiegelungen,
-   Flächen,
-   Beschriftungen,
-   Schatten,
-   Rauschen.

Die Pipeline soll diese Daten nicht gleichberechtigt behandeln.

Lokale Details dürfen früh als **Messinformation** auftauchen.
Beispielsweise kann eine Fenstersprosse eine Fluchtrichtung verraten.
Aber sie darf nicht vorzeitig die globale Struktur bestimmen.

> **Fine evidence may refine coarse structure, but may not silently
> redefine it.**

Beispiel:

``` text
über viele Beobachtungen:
floor = plane A
confidence = 0.94

späterer Depth-Provider:
lokale Bodenwelle

→ Provider widerspricht bestehendem Constraint.
→ Boden wird NICHT automatisch verbogen.
```

Erst genügend neue, unabhängige Evidenz darf einen bereits starken
Constraint revidieren.

------------------------------------------------------------------------

# 7. Room First / Structure First

Die falsche Ausgangsfrage:

> Wie mache ich aus allen Pixeln dieses Frames möglichst direkt 3D?

Die bessere:

> **Welche Teile dieses Materials enthalten überhaupt belastbare
> Information über den Raum selbst?**

``` text
RAW IMAGE / VIDEO
↓
SICHTUNG / OBSERVABILITY
↓
STRUKTURELLE EVIDENZ
↓
ROOM SCAFFOLD
↓
metrische Verfeinerung
↓
Detail-Provider
↓
Appearance
```

Bei Gamescom-Material sind Menschen, Lichtwechsel, Displays,
Reflexionen, Nebel, bewegte Objekte, Motion Blur und temporäre
Dekoration visuell dominant, aber für die tragende Gebäudegeometrie
überwiegend sekundär.

------------------------------------------------------------------------

# 8. Structural Persistence

Nicht Pixel-Persistenz, sondern:

> **Welche strukturellen Beziehungen überleben Beleuchtung, Menschen,
> Inhalt und Kamerabewegung?**

Beispiele:

``` text
wall ↔ floor
wall ↔ ceiling
pillar ↔ floor
portal ↔ wall
corridor axis
surface ordering
opening position
bridge ↔ corridor
```

Dynamische Menschen besitzen geringe Structural Persistence. Eine
Boden-Wand-Kante kann dagegen trotz teilweiser Verdeckung über viele
Frames immer wieder dieselbe Relation liefern.

Nicht jedes Frame muss brauchbar sein. Nicht jedes Pixel muss verstanden
werden.

------------------------------------------------------------------------

# 9. Material zuerst sichten, nicht sofort rekonstruieren

Vor jeder großen Reconstruction:

> **Material wiederholt sichten, bis erkennbar ist, welche Bestandteile
> strukturelles Signal und welche Rauschen sind.**

## 9.1 Frame-Auswahl nach Informationswert

Nicht zufällig hundert Frames, sondern die Frames mit maximaler
räumlicher Aussagekraft.

Kriterien: - sichtbare Boden-/Wandrelation, - belastbare Diagonalen, -
geringe Motion Blur, - geringe dynamische Occlusion, - einzigartige
Anker, - Gegenblick, - neue Fläche / neue Schnittkante.

## 9.2 Manueller Bootstrap

Mögliche Strategie:

1.  System wählt ca. 50--100 strukturell interessante Frames.
2.  Mensch klassifiziert sie grob.
3.  System lernt, welche Evidenz für diesen Datensatz relevant ist.
4.  System zeigt weitere unsichere Frames.
5.  Mensch korrigiert nur.
6.  Wiederholen.

Aber:

> **50--100 ist kein Dogma.**

Wenn fünf gute Bilder genügend unabhängige Constraints liefern, sind
fünf besser als hundert redundante Frames.

Die Anzahl der Frames richtet sich nach **Informationsgewinn**, nicht
nach Volumen.

------------------------------------------------------------------------

# 10. Strukturelle Kategorien

Beispielhafte Labels:

-   Floor
-   Ceiling / Roof
-   Left / Right / Back Surface
-   Structural Edge
-   Useful Diagonal
-   Opening / Portal
-   Pillar
-   Static Obstacle
-   Unique Anchor
-   Repeated Structure
-   Glass Frame
-   Ignore / Dynamic
-   Unknown

Relationen:

-   grenzt an,
-   parallel zu,
-   orthogonal zu,
-   verdeckt,
-   dahinter,
-   schneidet,
-   setzt sich fort,
-   gehört wahrscheinlich zur selben Fläche.

------------------------------------------------------------------------

# 11. Bezugspunkte, Diagonalen und Observability

SHADED braucht für räumliche Aussagen belastbare Beziehungen:

-   definierte Bezugspunkte,
-   verlässliche Diagonalen / Fluchtrichtungen,
-   messbare Relationen,
-   ausreichende perspektivische Information.

Fehlt diese Grundlage:

``` text
kein belastbarer Bezugspunkt
+
keine verwertbare Diagonale
+
keine verlässliche Relation
↓
NICHT BEOBACHTBAR
↓
keine räumlichen Punkte
```

Das ist kein Fehler, sondern korrektes Abstain.

## 11.1 Observability Gate

``` text
IMAGE
↓
Feature / Relation Extraction
↓
OBSERVABILITY GATE
│
├─ Bezugspunkte vorhanden?
├─ belastbare Diagonale vorhanden?
├─ Relationen messbar?
├─ ausreichende perspektivische Information?
│
├──── NO → ABSTAIN / 0 spatial points
│
└──── YES
      ↓
Spatial Inference
```

------------------------------------------------------------------------

# 12. Kanonischer Negativtest: manipulierte Halle

Ein bewusst manipuliertes Hallenbild wurde als Testdatei verwendet.

Manipulationen: - linker Bereich zwischen Pfeilern eingefügt, - rechter
Bereich zwischen Pfeilern eingefügt, - zwei Fluchtwegschilder zufällig
positioniert und viel zu klein, - unbekanntes horizontales Muster
rechts, ähnlich dem Hauptmotiv, aber inkompatibel in
Größe/Tiefenposition, - eine Lücke zwischen Pfeilern künstlich
geschlossen, - Lampen laufen tiefer in den Raum als das Tor plausibel
zulassen würde.

Entscheidend:

> **Dem Bild fehlen definierte Bezugspunkte und vor allem eine einzige
> verlässliche Diagonale.**

Damit besitzt SHADED keine epistemische Berechtigung, Räumlichkeit zu
behaupten.

``` text
negative_observability_control_01

expected: 0 spatial points
actual:   0 spatial points

PASS
```

Das System hat korrekt nicht halluziniert.

------------------------------------------------------------------------

# 13. Testfall-Klassen

## COHERENT

Genügend Evidenz für eine plausible räumliche Welt.

→ bauen.

## UNDERDETERMINED

Mehrere Welten sind mit der Evidenz vereinbar.

→ plausible Hypothese bauen, Unsicherheit erhalten.

## UNOBSERVABLE

Notwendige räumliche Relationen fehlen.

→ abstain.

## CONTRADICTORY

Belastbare Constraints widersprechen sich.

→ Konflikt ausgeben, nicht durch stille Erfindung reparieren.

------------------------------------------------------------------------

# 14. Vom Bild zum korrigierten Tunnel

Wenn sichtbare Linien in der realen Welt parallel in dieselbe Richtung
laufen, schneiden sie sich im perspektivischen Bild an einem
Fluchtpunkt.

Durch projektive Normalisierung kann diese dominante Richtung in einen
kanonischen Raum überführt werden.

``` text
Foto
↓
dominante parallele Weltlinien erkennen
↓
Fluchtpunkt / Fluchtrichtung bestimmen
↓
Perspektive rektifizieren
↓
Linien im kanonischen Raum parallelisieren
↓
lokaler "Tunnel"
```

Dieser Tunnel ist nicht automatisch metrisch perfekt.

Er ist zunächst: - topologisch sinnvoll, - orientiert, - leichter
vergleichbar, - leichter mit weiteren Beobachtungen zu matchen.

## 14.1 Bekannte Länge als metrischer Anker

Eine einzelne bekannte Länge löst beliebige Kamerageometrie nicht
vollständig.

Zusammen mit: - Parallelitätsannahmen, - Fluchtrichtungen, -
orthogonaler / Manhattan-artiger Architektur, - Boden-/Wandrelationen, -
weiteren Ankern,

kann sie den Lösungsraum stark reduzieren.

## 14.2 Tunnel iterativ korrigieren

``` text
Tunnel v1
↓
zweite Ansicht / bekannte Länge
↓
Tunnel v2
↓
Gegenansicht / Portal
↓
Tunnel v3
↓
Loop Closure
↓
global optimierter Raum
```

> **Unsicherheit wird nicht versteckt, sondern durch unabhängige
> Constraints schrittweise reduziert.**

------------------------------------------------------------------------

# 15. Mehrere Anläufe, um Unsicherheiten zu belastbarer Sicherheit zu machen

Mögliche unabhängige Quellen:

1.  Fluchtlinien
2.  bekannte Länge
3.  Boden-Wand-Schnittkante
4.  zweite Kameraperspektive
5.  Gegenblick
6.  wiederkehrende Säulen
7.  einzigartiger Anker
8.  Portalbeziehung
9.  Gebäudeplan
10. LoD2-Geometrie
11. menschliche Korrektur
12. Raymarching-Check
13. virtuelle Kamera
14. Provider-Depth
15. Loop Closure

Ein einzelner unsicherer Hinweis bleibt unsicher.

Mehrere unabhängige Hinweise können den zulässigen Lösungsraum so weit
reduzieren, dass praktisch nur noch eine sinnvolle Konfiguration übrig
bleibt.

Confidence und Provenance bleiben trotzdem erhalten.

------------------------------------------------------------------------

# 16. Räume „falten" statt Fotos auf 3D kleben

Unerwünscht:

> Fläche irgendwo platzieren, Foto drehen, schneiden und oben/hinten
> ankleben.

Gewünscht:

> **Flächen, bekannte Längen und Schnittkanten erkennen und daraus den
> Raum falten.**

``` text
2D Evidenz
↓
Flächen
↓
Schnittkanten
↓
Relationen
↓
Längen / Maßstab
↓
Faltung
↓
Raum
```

Die Koelnmesse ist strukturell dafür dankbar: - Quader, - Säulen, -
Ebenen, - Glasflächen, - Brücken, - Portale, - lange Korridore.

Alles andere ist für die erste Raumerfassung zunächst Rauschen oder
sekundäre Maßstabsevidenz.

------------------------------------------------------------------------

# 17. Local Room Charts statt globale Monster-Reconstruction

Anstatt tausende Frames sofort in ein globales Koordinatensystem zu
zwingen:

``` text
Frame-Gruppe A → Raum A
Frame-Gruppe B → Raum B
Frame-Gruppe C → Korridor C
```

Dann über gemeinsame Portale und Constraints verbinden.

``` text
A.portal[P17] == C.portal[P17]
```

Räume werden über: - Portalposition, - Normalen, - Bodenhöhe, -
Breite, - bekannte Maße

aneinandergefügt.

------------------------------------------------------------------------

# 18. Room / Portal Graph

Globale Welt als Topologie:

``` text
Hall 8
  │
  ├─ Portal → Nordboulevard
  ├─ Portal → weiterer Gang
  └─ Treppe → andere Ebene
```

Lokale Rekonstruktionen brauchen zunächst: - lokale Topologie, - lokale
Maße, - definierte Anschlussstellen.

Das globale System entsteht durch **Constraint Propagation**.

------------------------------------------------------------------------

# 19. „Es kann nur noch da sein"

Wenn mehrere unabhängige Constraints bekannt sind, schrumpft die Zahl
möglicher globaler Platzierungen.

Beispiel: - Boulevardposition bekannt, - Hallenöffnung bekannt, -
Bodenhöhe bekannt, - Portalbreite bekannt, - Raumgröße ungefähr bekannt.

→ viele mögliche Platzierungen.

Zweites Portal: → deutlich weniger.

Bekannte Wandlänge: → eventuell praktisch nur noch eine.

Ziel:

> **Nicht Bildähnlichkeit maximieren, sondern unzulässige geometrische
> Lösungen eliminieren.**

------------------------------------------------------------------------

# 20. Loop Closure

Lokales Anschieben kann Fehler akkumulieren.

``` text
A → B → C → D → E
```

Wenn E später wieder an A anschließt und ein Fehler sichtbar wird,
verteilt ein globaler Solver die Abweichung über die unsicheren
Verbindungen.

Die Hauptknoten sind **stabile Räume, Portale und Strukturen**, nicht
jedes chaotische Frame.

------------------------------------------------------------------------

# 21. Virtuelle Kameras: Ein Bild → viele Messinstrumente

Die ursprüngliche SHADED-Idee ist nicht:

``` text
viele Bilder → eine zusammengeschissene Reconstruction
```

Sondern:

``` text
EIN BILD
↓
initiale räumliche Hypothese / Point Cloud
↓
VIELE virtuelle Kameras
↓
Messungen auf der Hypothese
↓
Hypothese verfeinern
```

Die virtuellen Kameras liefern keine JPEGs als neue Ground Truth.

Sie sind Sonden.

Mögliche Outputs: - depth, - normal, - hitDistance, - surfaceId, -
visibility, - occlusion, - disocclusion, - occupancy, -
gaussianDensity, - materialResponse, - reflectedRayHit, - confidence.

------------------------------------------------------------------------

# 22. Von 2.5D zu echter 3D-Hypothese

Klassisches Monocular Depth:

``` text
RGB
↓
Depth Map
↓
Pixel entlang Z verschieben
```

führt leicht zu: - Löchern, - gestreckten Kanten, - fehlenden
Rückseiten, - Fototapeten-Geometrie.

SHADED soll weitergehen:

``` text
Depth → initial scaffold
↓
von links betrachten
↓
von rechts betrachten
↓
darüber / darunter
↓
Rays senden
↓
Occlusion prüfen
↓
Flächenbeziehungen prüfen
↓
Plausible Completion
↓
erneut prüfen
```

Virtuelle Kameras erzeugen keine neue beobachtete Realität. Sie erzeugen
Information über die **Konsistenz der aktuellen 3D-Hypothese**.

------------------------------------------------------------------------

# 23. Evidence World und Hypothesis World

## Evidence World

``` text
observed pixel
depth estimate
normal estimate
semantic label
edge
surface candidate
confidence
```

## Hypothesis World

``` text
completed wall
hidden floor continuation
back surface
volume
material behaviour
reflection relationship
collision surface
```

Beispiel:

``` text
Surface 182

observed: 42 %
derived: 31 %
prior-completed: 27 %
confidence: 0.74
```

------------------------------------------------------------------------

# 24. Spiegelungen und indirekte Evidenz

Eine Spiegelung kann räumliche Information enthalten.

Möglicher Ablauf:

1.  Spiegeloberfläche erkennen.
2.  Normalen schätzen.
3.  Sichtstrahl reflektieren.
4.  hypothetische Herkunft des reflektierten Inhalts bestimmen.
5.  aktuelle 3D-Hypothese nach kompatiblen Oberflächen durchsuchen.
6.  Widersprüche als Constraint zurückführen.

Ähnliche Forschungsrichtungen: - Schatten, - Glanzlichter, -
transparente Flächen, - wiederkehrende Muster, - perspektivische
Wiederholungen.

**Hypothese, nicht Garantie.**

------------------------------------------------------------------------

# 25. Nordboulevard -- kanonischer Struktur-Test

## 25.1 Erste Bildgruppe: Knick um Halle 8

Fünf Bilder zeigen dieselbe Ecke:

1.  Blick südöstlich aus Halle 8 heraus.
2.  ca. 15 m weiter im Gang, Blick nach Osten zum Nordeingang.
3.  ca. weitere 50 m südlich, Blick nach Nordost.
4.  deutlicher Blick auf den Gastronomieteil.
5.  gleiche Position wie Bild 4, Blick nach Norden Richtung Halle 8.

Tragende Invarianten: - Gastro-Quader, - Fensterbänder, - verglaste
Ecke, - Knick des Boulevards, - Dach-/Lichtstruktur, - Hall-8-Bezug, -
Boden, - Seitenbegrenzungen.

Die Architektur besteht im Wesentlichen aus:

> **Quadern, Flächen und Säulen.**

Menschen und Messedekoration sind für die erste Raumfindung
überwiegend: - Rauschen, - Occlusion, - gelegentlich Maßstab.

## 25.2 Warum fünf Bilder reichen können

Diese fünf liefern: - Vorwärtsblick, - Gegenblick, - Nahsicht, -
Fernsicht, - Höhenbezug, - Fassadenbezug, - Hallenbezug.

Mehr Frames sind nur wertvoll, wenn sie neue Constraints liefern.

------------------------------------------------------------------------

# 26. Zweite Bildgruppe: weitere ca. 150 m Nordboulevard

Die nächsten fünf Bilder setzen denselben Boulevard Richtung Süden fort.

Zentraler Anker:

> **die Brücke.**

Sie ist in allen Bildern sichtbar, aus unterschiedlichen Entfernungen.

Damit ist sie: - Distanzanker, - Richtungsanker, - Höhenanker, -
Loop-Closure-Anker, - globaler Fixpunkt entlang der Boulevardachse.

Schilder liefern zusätzlich Informationen durch: - Seite, - Höhe, -
Position, - Orientierung, - relativen Abstand zur Brücke, - relativen
Abstand zu Hallenöffnungen.

Ein Schild ist:

``` text
semantischer Marker
+
Richtungsvektor
+
Positionsanker
+
Maßstabsobjekt
```

Die Schilder brechen die Symmetrie eines repetitiven Korridors.

------------------------------------------------------------------------

# 27. Boulevard zunächst als 1D + Querschnitt

Statt sofort freies 3D:

## Hauptachse

``` text
s = Position entlang Boulevard
```

## Querschnitt

``` text
left boundary
floor
right boundary
roof
```

## Ereignisse entlang der Achse

-   Brücke,
-   Schild,
-   Portal,
-   Halle,
-   markanter Quader.

Damit wird ein großes 3D-Problem zunächst zu:

> **einem Korridor mit markierten Ereignissen entlang einer bekannten
> Achse.**

------------------------------------------------------------------------

# 28. Menschen: Rauschen und Maßstab zugleich

Menschen sollen nicht primär Geometrie definieren.

Ein einzelner Mensch ist ein schlechter Meterstab: - unbekannte
Körpergröße, - Pose, - Tiefenposition.

Mehrere Menschen können zusammen mit stabileren Referenzen zusätzliche
Skalenevidenz liefern.

Bessere Kombination:

``` text
Tür
+
Schild
+
Fensterachse
+
bekannte Hallenhöhe
+
mehrere Personen statistisch
```

------------------------------------------------------------------------

# 29. Permanent Architecture vs. Event Architecture

## Permanent Architecture

-   Hallenkörper,
-   Boulevard,
-   Brücken,
-   tragende Säulen,
-   feste Treppen,
-   feste Portale.

## Event Architecture

-   Stände,
-   Trennwände,
-   temporäre Gates,
-   Dekoration,
-   Absperrungen.

Der permanente Raum soll zuerst stehen.

------------------------------------------------------------------------

# 30. Glas

## Für Reconstruction

Pixel innerhalb einer Glasscheibe können stammen von: -
dahinterliegender Szene, - Spiegelung, - Licht, - mehreren Tiefenebenen.

Daher:

> Glasrahmen und Kanten können Geometrieconstraints sein. Der Bildinhalt
> innerhalb der Scheibe darf nicht naiv als dort liegende Oberfläche
> behandelt werden.

## Für Mobile Rendering

Große Alphaflächen sind teuer.

> **Glass is an absence first, an effect second.**

### Q0

Rahmen vorhanden, Scheibe nicht rendern.

### Q1

Sehr billige Reflexionswirkung: - Environment Map, - Fresnel, - leichte
Tönung, - keine teure Refraction.

### Q2

Mehr Aufwand nur an wenigen Hero-Flächen.

Die semantische Welt kennt Glas unabhängig vom Renderprofil.

------------------------------------------------------------------------

# 31. Provider-Philosophie

Ungefähr 300 SHADED-Provider wurden später vor allem für BEUTELTIER
zusammengetragen.

Sie sollen **wirklich getestet** werden.

Nicht, weil wahrscheinlich ein einzelner Gewinner die Gamescom löst,
sondern weil sie Teilfähigkeiten zeigen können.

Die falsche Frage:

> Kann Provider X die Gamescom rekonstruieren?

Die bessere:

> **Welche Teilaufgabe löst Provider X unter welchen Bedingungen besser
> als andere?**

------------------------------------------------------------------------

# 32. Provider nicht nach Endbild bewerten

Mögliche Fähigkeiten: - Feature Matching - Camera Pose - Monocular
Depth - Multi-View Depth - Registration - Segmentation - Dynamic
Masking - Meshing - Geometry Completion - Appearance - Delighting -
Relighting - Surface Detection - Plane Fitting - Vanishing Point
Detection - Occlusion Detection - Structural Persistence - Overlap
Detection

Ein Provider kann schlechte „Reconstruction Quality", aber hohe
**BEUTELTIER Utility** haben.

------------------------------------------------------------------------

# 33. Provider-Stages

## STAGE 0 -- OBSERVABILITY

lines, edges, segmentation, motion, vanishing points, persistence,
semantics

## STAGE 1 -- STRUCTURAL SOLVER

planes, relations, room layout, camera hypothesis, projective
rectification

## STAGE 2 -- ENRICHMENT

depth, normals, dense points, matching, geometry

## STAGE 3 -- COMPLETION

GS, hidden surfaces, generative geometry, completion

## STAGE 4 -- APPEARANCE

materials, relighting, textures, shaders

Ein hervorragender Depth-Provider muss keinen Raum erkennen können. Er
bekommt später einen bereits strukturell eingeschränkten Raum.

------------------------------------------------------------------------

# 34. Kein Provider-Lock-in

Der reale Problem-Input wird zunächst eingefroren.

Jeder relevante Provider erhält einen Baseline-Test auf demselben Input.

Erst danach provider-spezifische Verbesserungen.

> **Wir optimieren niemals das Problem für einen Provider, bevor wir die
> Provider für das Problem verglichen haben.**

------------------------------------------------------------------------

# 35. depthanything.cpp / DA3 / MapAnything als Lehrbeispiel

Methodischer Fehler:

``` text
schlechter Output eines gewählten Providers
↓
Input verändern
↓
Raum eingrenzen
↓
Material verbessern
↓
Pipeline um diesen Provider herum verbiegen
```

statt:

``` text
identischer Problem-Input
↓
Provider A testen
↓
Provider B testen
↓
Provider C testen
↓
Ergebnisse vergleichen
```

`depthanything.cpp` hätte als explizit vorgeschlagener Provider direkt
gegen andere Depth-Verfahren getestet werden sollen.

Auch ein negatives Ergebnis wäre wertvoll gewesen.

------------------------------------------------------------------------

# 36. Provider-Status

-   `UNTESTED`
-   `TESTED_POSITIVE`
-   `TESTED_PARTIAL`
-   `TESTED_NEGATIVE`
-   `BLOCKED`
-   `NOT_APPLICABLE`

Nicht zulässig: - „sieht nach Müll aus" - „scheint unnötig" - „anderes
Modell ist moderner" - „ich verstehe nicht, warum wir das brauchen"

------------------------------------------------------------------------

# 37. Research Debt ist kein Dead Code

Trennung:

``` text
providers/
benchmarks/
experiments/
production/
```

Ein Provider kann aus `production/` verschwinden und trotzdem als
getesteter Kandidat erhalten bleiben.

------------------------------------------------------------------------

# 38. Alte Technik ist nicht automatisch veraltet

Relevante ältere Richtungen: - Single-View Metrology - Projective
Geometry - Vanishing-Point Estimation - Perspective Rectification -
Manhattan / Atlanta Worlds - Plane Fitting - Homographies -
Shape-from-X - Geometric Invariants - frühes Image-Based Modeling - Tour
Into the Picture - Layered Depth - Projective Texturing - Pose Graphs -
Loop Closure - SLAM - Structural Landmarks

> **Das Baujahr eines Zahnrads ist irrelevant, wenn es die benötigte
> Aufgabe deterministisch und billig löst.**

Ein altes 10-Star-Repo kann für SHADED wertvoller sein als ein aktueller
20k-Star-Monolith.

------------------------------------------------------------------------

# 39. Technology Archaeology

Vor großen Architekturentscheidungen:

1.  Problem atomar formulieren.
2.  Moderne Verfahren suchen.
3.  Ältere mathematische / klassische Verfahren suchen.
4.  Repos unabhängig von Sternen, Alter und Popularität prüfen.
5.  Input → Operation → Output → Annahmen → Kosten → Determinismus →
    Browserfähigkeit dokumentieren.
6.  Kombinationen benchmarken.

SOTA für SHADED bedeutet:

> **beste Kombination für SHADEDs konkretes Problem**, nicht höchster
> Paper-Benchmark.

------------------------------------------------------------------------

# 40. SHADEDs „Toaster"-These

Hypothese:

> Ein kleines, strukturell korrekt gestelltes Verfahren kann in einer
> eng definierten Disziplin ein deutlich größeres Modell schlagen, weil
> es nicht versucht, unnötig das gesamte visuelle Problem gleichzeitig
> zu lösen.

Nicht: Kleine Modelle sind generell besser.

Sondern:

> **Die richtige Problemzerlegung kann Rechenleistung ersetzen.**

Wenn SHADED aus Flächen, Kanten, Relationen und wenigen bekannten Maßen
einen strukturell korrekteren Raum erzeugt als ein GPU-schweres
End-to-End-System, wäre das eine direkte Bestätigung der
SHADED-Intention.

## „Nicht einmal 80:20"

Arbeitsthese:

Bei strukturell simplen Räumen kann der Anteil der Bildinformation, der
für die **Raumgeometrie** wirklich benötigt wird, weit unter 20 %
liegen.

Der Rest kann für die Raumfindung: - Rauschen, - Appearance, -
Dekoration, - dynamische Occlusion

sein.

Das ist zu messen, nicht pauschal als Zahl zu behaupten.

------------------------------------------------------------------------

# 41. Room Reconstruction und „One Image, One World"

Kein Widerspruch.

``` text
1 Bild → kleine Welt A
1 Bild → kleine Welt B
mehrere Bilder → stärkere Constraints für A/B
A + B + Portal → größerer Raumgraph
```

BEUTELTIER skaliert die SHADED-Logik hierarchisch.

------------------------------------------------------------------------

# 42. Ein Frame ist keine eigene Wahrheit

Die Halle ist die persistente Wahrheit.

Frames sind:

> **Beobachtungen derselben persistenten Geometrie unter wechselnden
> Bedingungen.**

Beispiel:

``` text
Frame 1: Wand weiß
Frame 2: Wand blau
Frame 3: Wand rot
Frame 4: Wand von Menschen verdeckt
Frame 5: Reflexion
Frame 6: Nebel
Frame 7: wieder weiß

→ wall geometry: UNCHANGED
```

------------------------------------------------------------------------

# 43. Reihenfolge für BEUTELTIER-Reconstruction

``` text
RAW VIDEO
↓
OBSERVABILITY SCAN
↓
gute Frames auswählen
↓
STRUCTURAL EXTRACTION
↓
PROJECTIVE NORMALIZATION
↓
LOCAL ROOM CHART
↓
ROOM / PORTAL GRAPH
↓
GLOBAL CONSTRAINT SOLVER
↓
stable spatial scaffold
↓
Depth / GS / COLMAP / andere Provider
↓
Detail / Appearance
```

Kein großer Reconstruction-Provider muss am Anfang stehen.

------------------------------------------------------------------------

# 44. Raymarching Photo Placer

Sinnvolle Aufgabe:

``` text
bekannter / grob erkannter Room Scaffold
+
Foto
↓
Raymarching / Camera Fitting
↓
Kamerapose finden,
die erkannte Raumrelationen erklärt
```

Optimiert werden stabile Raumfeatures: - Boden-Wand-Kanten, -
Deckenlinien, - Portalkanten, - markante Flächen, - Anker.

Nicht Millionen Pixel.

------------------------------------------------------------------------

# 45. Virtuelle Kameras und Raymarching als Hypothesenprüfung

``` text
initiale Hypothese
↓
virtuelle Kamera links
virtuelle Kamera rechts
virtuelle Kamera oben
Raymarching
Reflections
Gaussian Splat Probe
↓
Widersprüche / Löcher / Occlusions / Hit-Distanzen
↓
Hypothese korrigieren
```

Beispiele: - Rückseite schneidet Wand. - Boden öffnet sich. - Silhouette
wird aus Seitenblick absurd. - Strahl verlässt vermeintlich
geschlossenen Raum.

Die „wahre" verborgene Rückseite bleibt unbekannt. Aber eine
inkonsistente Hypothese kann verworfen werden.

------------------------------------------------------------------------

# 46. Cartoon als kanonisches SHADED-Testmotiv

Ein Cartoon wurde absichtlich als frühes SHADED-Testbild verwendet.

Warum?

Bei einem Cartoon gibt es keine verborgene „echte Rückseite".

Damit wird die falsche Bewertungsfrage unmöglich:

> „Sieht die Rückseite wie in echt aus?"

Es gab nie ein „echt".

Der Test erzwingt epistemische Ehrlichkeit:

> SHADED konstruiert eine 3D-Welt, die das Bild erklärt.

Nicht:

> SHADED rekonstruiert eine objektiv vorhandene unsichtbare Realität.

------------------------------------------------------------------------

# 47. Was „perfekt" bei Single-Image-Welten nicht bedeutet

Eine perfekte verborgene Rekonstruktion kann nicht gefordert werden,
wenn die Information nicht im Bild enthalten ist.

Qualität wird beurteilt nach: - räumlicher Kohärenz, - Betretbarkeit, -
Perspektivstabilität, - korrekter Nutzung beobachteter Constraints, -
klarer Provenance, - sinnvoller Completion, - guter Wahrnehmung durch
Shader.

Nicht nach:

> Hat das System zufällig die unsichtbare Realität erraten?

------------------------------------------------------------------------

# 48. BEUTELTIER V2 -- Grundarchitektur

BEUTELTIER sollte primär kein 3D-App-Monolith sein.

> **Offline World Compiler + dünne Mobile Runtime + Studio, das Patches
> erzeugt.**

``` text
Sources
↓
Canonical Evidence / Canonical World
↓
Patch Ledger
↓
World Compiler
↓
Validation
↓
Immutable World Bundle
↓
Thin Runtime
```

------------------------------------------------------------------------

# 49. Vier Wahrheitsdomänen

## Geometry Truth

DGM, LoD2, Hallenpläne, gemessene Punkte, strukturell rekonstruierte
Flächen.

## Topology Truth

Räume, Portale, Ebenen, Walk Surfaces, Routinggraph.

## Visual Truth

DOP, I3S, Fotos, Videos, Materialbeobachtungen.

## Event Truth

Gamescom-Jahr, Stände, Sperrungen, Warteschlangen, Goodies, temporäre
Wege.

Ein Datensatz darf nicht still eine andere Wahrheitsdomäne
überschreiben.

------------------------------------------------------------------------

# 50. Compiler Gates

## 1. Source Gate

Erforderliche Quellen müssen vorhanden sein. Kein Release-Build darf
fehlende Wahrheit durch alte Artefakte ersetzen.

## 2. Spatial Gate

Kanonisches metrisches Koordinatensystem. Cross-Language-Golden-Tests
für Transformationsregeln.

## 3. Geometry Gate

Nur Geometrie, Ebenen, Portale, Stände. Flat / unlit. Keine kosmetischen
Effekte.

## 4. Wireframe Gate

Wireframe, Normals, reproduzierbare Kameras, First Person. Schwebende /
invertierte / gespiegelte Fehler sichtbar machen.

## 5. Mobile Gate

Finale Chunk-/Collision-Architektur bereits benutzen. 60-Hz-Ziel vor
Appearance.

## 6. Appearance Gate

DOP / Roofs / I3S / Fotoevidenz schrittweise. Performance nach jedem
Schritt erneut messen.

## 7. Editor Roundtrip Gate

Jeder Editor schreibt Patches. Compiler reproduziert exakt.

## 8. Style Gate

Toon, Licht, technische Details, Stimmung erst jetzt. Style darf
Geometry / Collision / Navigation nicht verändern.

------------------------------------------------------------------------

# 51. Einheitliches Studio

Ein Studio, mehrere Ansichten:

-   2D Surface / Registration Mode
-   3D World Builder / Ultra Duplo
-   Photo Poser / Evidence Mode
-   Walkability / Vermessung
-   Route / Portal Mode
-   Dependency / Source Graph
-   Diagnostics

Alle lesen dasselbe WorldDocument.

Alle schreiben dasselbe Patch-Modell.

------------------------------------------------------------------------

# 52. Patch Ledger

Editoren bearbeiten keine exportierten GLBs als Wahrheit.

Konzept:

``` text
target
operation
beforeHash
world-space transform / geometry delta
evidence
confidence
tool
author / source
```

Patches sind nachvollziehbar und reproduzierbar.

------------------------------------------------------------------------

# 53. Source Candidates statt stiller Überschreibung

Beispiel:

``` text
hall-height:
  LoD2:            11.84 m
  Plan:            12.00 m
  Photo inference: 11.70 m

status: CONFLICT
```

Erst Regel oder menschliche Entscheidung erzeugt kanonische Wahrheit.

------------------------------------------------------------------------

# 54. Visual Evidence ist nicht Geometry Truth

Beispiel Fassaden:

-   LoD2 kann Geometrie-/Semantiktruth liefern.
-   I3S kann visuelle Evidenz liefern.
-   DOP kann Dächer / Bodenappearance liefern.
-   normale Luftbilder sehen Fassaden nicht zuverlässig.

Visuelle Quelle darf nicht still Geometrie neu definieren.

------------------------------------------------------------------------

# 55. Mobile Performance ist Architektur

Mobile SoCs: - Shared Memory CPU/GPU, - begrenzte Bandbreite, - hohe
Draw-Call-Kosten, - Tile-Based Rendering, - thermisches Throttling.

> **Performancebudget bestimmt rückwärts die zulässige
> Weltkomplexität.**

Nicht: fertige Welt später optimieren.

------------------------------------------------------------------------

# 56. Render-Budget-Vertrag

Baseline:

``` text
target: sustained 60 Hz
frame budget: 16.67 ms
initial DPR: ~1.0
higher DPR: nur mit gemessenem Headroom
```

Grundregeln: - keine unnötigen Fullscreen-Passes, - wenige / keine
dynamischen Schatten in Baseline, - dynamische Punktlichter hart
begrenzen, - große Transparenzflächen vermeiden, - Draw Calls
begrenzen, - KTX2/Basis-Kompression, - Meshopt / Geometry-Kompression, -
Instancing, - LOD, - Texture Residency budgetieren, -
Runtime-Allokationen minimieren, - React nicht als 60-Hz-Szenenzustand
benutzen.

------------------------------------------------------------------------

# 57. Sustained Performance statt Screenshot-FPS

``` text
cold launch
↓
5 min Route / Ego
↓
10 min
↓
20 min
↓
frametime / throttling / spikes prüfen
```

Nicht „60 FPS direkt nach Start", sondern sustained Performance auf
definiertem Baseline-Gerät.

Portrait und Landscape getrennt testen.

------------------------------------------------------------------------

# 58. Spatial Chunking

Keine monolithische 7×3-km-Welt.

Beispiele:

``` text
OUTDOOR TILE
HALL 6.1
HALL 6.2
BOULEVARD NORTH A
BOULEVARD NORTH B
STANDS HALL7 ZONE03
```

Ein Chunk umfasst logisch: - Rendergeometrie, - Collision, -
Navigation, - Materialien, - Texturen, - POIs, - Landmarken, - Live-IDs.

------------------------------------------------------------------------

# 59. Predictive Streaming

BEUTELTIER kennt die Route.

``` text
current chunk
↓
next route chunk
↓
next junction
↓
likely destination
```

Entlang der Route vorladen statt nur Radius-Culling.

------------------------------------------------------------------------

# 60. Dynamic Quality

``` text
Q3
full target

↓ pressure

Q2
lower DPR
earlier LOD

↓ sustained pressure

Q1
reduced lighting
reduced decoration
lower distant texture quality

↓ severe

Q0
navigation-safe mode
```

Nie wegoptimieren: - Route, - Collision, - Landmarken, - Ziel, -
Standidentität, - wichtige Information.

> Die Welt darf hässlicher werden. Sie darf nicht unbrauchbarer werden.

------------------------------------------------------------------------

# 61. Performance Harness

Für aufgezeichnete Routen messen: - Gerät - Browser - Orientation -
Resolution - Quality Profile - FPS p50 / p95 / p99 - CPU Frame Time -
GPU-nahe Messwerte, soweit verfügbar - Draw Calls - Triangles -
Textures - Geometries - JS Heap - Long Tasks - Chunk Load Latency -
Frame Spikes - Context Loss

------------------------------------------------------------------------

# 62. Diagnose-Layer

-   Semantic
-   Wireframe
-   Normals
-   Collision
-   Navigation
-   Sources
-   Confidence
-   Photo Coverage
-   Chunk Bounds
-   Draw Calls
-   Overdraw
-   Landmark Visibility

Kein neuer Debug-Renderer für jedes Problem.

------------------------------------------------------------------------

# 63. Landmarken-Navigation statt Indoor-GPS-Zwang

BEUTELTIER soll navigieren wie Menschen:

> bis zu diesem Ding, dort links, durch diese Tür, dann Richtung
> markanter Stand.

Elemente: - Landmarken, - Wegclips, - nächstes Routensegment, -
sichtbare Anker, - Nutzerbestätigung, - ggf. QR / visuelle
Kalibrierung, - Pose Reset an sicheren Punkten.

Kontinuierliche Indoor-Positionierung ist keine Grundvoraussetzung.

------------------------------------------------------------------------

# 64. Anchors und Drift Reset

``` text
Anchor A sicher
↓
lokales Tracking
↓
Unsicherheit steigt
↓
Anchor B erkannt
↓
Drift reset
```

Passend für: - Hallenschilder, - Brücken, - Portale, - markante
Stände, - Rolltreppen, - QR-Marker.

------------------------------------------------------------------------

# 65. Routing als Entscheidungssystem

Routing berücksichtigt langfristig: - schnellster Weg, - schnellste
Beute, - mehrere Ziele, - Warteschlange, - Crowd, - Sperrungen, -
Einbahnführung, - Rolltreppenrichtung, - Terminfenster, -
Fastlane-Slots, - Pufferzeiten.

Manchmal ist die beste Route:

> **gerade nicht hingehen.**

------------------------------------------------------------------------

# 66. Live State als Overlay

Statische Welt bleibt lokal.

Server liefert nur kleine Deltas:

``` text
edge_4711 → CLOSED
stand_samsung → wait=75min
goodie_xyz → AVAILABLE
escalator_17 → DOWN_ONLY
```

Keine Welt vom Server abhängig machen.

------------------------------------------------------------------------

# 67. Front-first Stände

Unbekannte Gamescom-Stände müssen nicht vollständig rekonstruiert
werden.

Wichtig: - offene Seite, - Logo, - Farbfläche, - Banner, - LED-Wand, -
Truss, - Hero-Objekt, - Bodenwechsel, - Silhouette.

Die Rückseite kann stark vereinfacht sein.

Ziel: Stand muss als Landmarke funktionieren.

------------------------------------------------------------------------

# 68. Proof Mode vor Beauty Mode

## PROOF MODE

-   desaturiert,
-   Helligkeit normalisiert,
-   Patchgrenzen sichtbar,
-   Confidence sichtbar,
-   Quellen sichtbar,
-   Alignment prüfbar.

## BEAUTY MODE

Erst nach bestandenem Proof: - Farbanpassung, - Materialien, - Stil, -
Licht.

------------------------------------------------------------------------

# 69. Fotos als Evidenz, nicht automatisch als Textur

``` text
Photo
↓
Color Normalization
↓
Light / Emissive Separation
↓
Delighting-lite
↓
Semantic Material Split
↓
Canonical Material Palette
↓
Game Surface
```

------------------------------------------------------------------------

# 70. Crowd Rendering

``` text
nah:
wenige echte Figuren

mittel:
instanzierte billige Silhouetten

fern:
shader-/billboardbasierte Masse
```

Für Navigation kann Crowd gleichzeitig ein Kostenfeld sein.

------------------------------------------------------------------------

# 71. Harte Agentenregeln

## Identität

1.  Kein Agent darf SHADEDs Kernziel umdefinieren.
2.  „One image. One small world." ist Verfassung.
3.  Eine Zieländerung ist kein Refactor.

## Evidenz

4.  Keine räumliche Behauptung ohne ausreichende Observability.
5.  Ein richtiger Guess ist keine Messung.
6.  Invented ≠ Observed.
7.  UNKNOWN und ABSTAIN sind gültige Ergebnisse.

## Struktur

8.  Reconstruct in dependency order, not observation order.
9.  Fine evidence may refine coarse structure, but not silently redefine
    it.
10. Raumstruktur vor Appearance.

## Provider

11. Ein explizit verlangter Provider muss minimal reproduzierbar
    getestet werden.
12. Keine Ablehnung aufgrund subjektiver Plausibilität.
13. Kein Input-Fitting vor Baseline-Vergleich.
14. Benchmarkartefakte behalten.
15. Research Debt ist kein Dead Code.

## BEUTELTIER

16. Kein Renderer darf die Welt „reparieren".
17. Kein Editor bearbeitet Buildprodukte als kanonische Wahrheit.
18. Kein Build erfindet fehlende Quellen über Fallbacks.
19. Style darf Geometry / Collision / Navigation nicht verändern.
20. Performance ist Build Gate, kein später Polish.

------------------------------------------------------------------------

# 72. Was ausdrücklich NICHT behauptet werden darf

## 72.1 Eine bekannte Länge löst nicht beliebige Perspektive vollständig

Weitere Annahmen / Fluchtrichtungen / Relationen sind nötig.

## 72.2 Menschen sind keine präzisen Einzel-Meterstäbe

Nur ergänzende Evidenz.

## 72.3 Glas ist mehrdeutig

Reflexion und Transmission trennen.

## 72.4 Repetitive Architektur kann falsch zugeordnet werden

Einzigartige Anker sind wichtig.

## 72.5 Virtuelle Kameras erzeugen keine neue beobachtete Ground Truth

Sie testen die Hypothese.

## 72.6 Unsichtbare Details bleiben unterbestimmt

Completion ist erlaubt, aber nicht als Messung.

## 72.7 „Es kann nur dort sein" gilt erst nach genügend unabhängigen Constraints

Nicht nach einem einzelnen Match.

## 72.8 Nicht-orthogonale / organische Räume sind schwieriger

Die Koelnmesse ist gerade deshalb ein guter Test, weil viel Architektur
primitiv / Manhattan-artig ist.

## 72.9 Temporäre Eventarchitektur muss getrennt werden

Nicht alles Persistente ist permanent.

------------------------------------------------------------------------

# 73. Falsifizierbarkeit

Die Methode muss gestoppt oder korrigiert werden, wenn Tests zeigen:

-   stabile Kantenrelationen reichen nicht, um lokale Raumcharts
    reproduzierbar zu erzeugen,
-   projective rectification verschlechtert systematisch statt zu
    stabilisieren,
-   Local Room Charts lassen sich ohne massiven Drift nicht verbinden,
-   strukturelle Anker sind im realen Material zu selten,
-   die angeblich invarianten Flächen ändern sich durch
    Kamera-/Lens-Effekte stärker als erwartet,
-   die manuelle Bootstrap-Klassifikation generalisiert nicht
    ausreichend,
-   virtuelle Probe-Kameras erzeugen keine verwertbaren zusätzlichen
    Constraints,
-   Provider-Enrichment widerspricht strukturellen Scaffolds
    systematisch aus nachvollziehbaren Gründen,
-   Browserbudget reicht für die beabsichtigten Solver nicht.

Dann wird nicht die Evidenz passend gebogen.

Dann wird die These angepasst.

------------------------------------------------------------------------

# 74. Kanonische Test-Suite

## A. SHADED Single Image Positive

Cartoon / Illustration mit ausreichenden Relationen.

Erwartung: - kleine betretbare Welt, - plausible Completion, - klare
Provenance.

## B. Negative Observability Control

Manipulierte Halle ohne belastbare räumliche Grundlage.

Erwartung: - 0 räumliche Punkte bzw. Abstain.

## C. Nordboulevard Corner

Erste fünf Bilder.

Erwartung: - gleicher lokaler Raumchart, - Knick, - Halle-8-Bezug, -
Gastro-Quader, - Gegenblick konsistent.

## D. Nordboulevard Continuation

Zweite fünf Bilder.

Erwartung: - Brücke als gemeinsamer Anker, - Bilder entlang derselben
Achse, - Blickrichtung aus Landmarken/Schildern, - Anschluss an ersten
Raumchart.

## E. Colored Lighting

Gleiche Geometrie bei unterschiedlichen Farben.

Erwartung: - Raum bleibt gleich.

## F. Heavy Crowd

Starke Occlusion.

Erwartung: - Structural Persistence aus verbleibenden Frames.

## G. Glass

Reflexion / Transmission.

Erwartung: - keine naive Pixel-zu-Fläche-Zuordnung.

## H. Repetitive Corridor

Viele gleiche Säulen, ein einzigartiger Anker.

Erwartung: - nicht um ein Rastersegment verrutschen.

## I. Loop Closure

Raumkette schließt sich.

Erwartung: - Drift wird verteilt.

## J. Provider Bake-Off

Identische Inputs, atomare Fähigkeiten.

Erwartung: - nachvollziehbare Statusmatrix.

------------------------------------------------------------------------

# 75. Benchmark-Prinzip für Provider

Nicht nur Endqualität.

Schema:

  ----------------------------------------------------------------------------------------------
  Provider             Visual     Local   Relative      Pose   Overlap   Structural        Crowd
               Reconstruction     Depth      Depth                          Utility   Robustness
  ---------- ---------------- --------- ---------- --------- --------- ------------ ------------
  A                   niedrig      hoch       hoch        --      hoch         hoch       mittel

  B                      hoch      hoch     mittel      hoch   niedrig       mittel      niedrig

  C                    mittel sehr hoch  sehr hoch        --      hoch         hoch         hoch
  ----------------------------------------------------------------------------------------------

Die Tabelle ist nur das Bewertungsschema. Werte müssen gemessen werden.

------------------------------------------------------------------------

# 76. Entscheidungslogik für neue Ideen / Repos

``` text
Welches Problem?
↓
Welche Voraussetzung?
↓
Input?
↓
Output?
↓
Was behauptet das Ergebnis?
↓
Observed / Derived / Inferred / Invented?
↓
Welche Stage?
↓
Welche Kosten?
↓
Browser-/Mobile-Eignung?
↓
Welcher Benchmark?
↓
Darf es die bestehende Struktur verändern?
```

------------------------------------------------------------------------

# 77. Begriffe

## Observability

Ob genügend Information vorhanden ist, um eine bestimmte räumliche
Aussage überhaupt zu rechtfertigen.

## Structural Persistence

Stabilität räumlicher Beziehungen über wechselnde Bilder / Frames.

## Spatial Scaffold / Room Scaffold

Minimaler räumlicher Unterbau vor Detail-Reconstruction.

## Local Room Chart

Lokale Raumdarstellung mit eigener Geometrie, Achsen, Flächen und
Portalen.

## Rectified / Corrected Tunnel

Projektiv normalisierter Korridor als lokale Zwischenrepräsentation.

## Anchor

Eindeutiger räumlicher Fixpunkt, z. B. Brücke, Portal, markantes Schild.

## Room / Portal Graph

Topologischer Graph aus Räumen und ihren Verbindungen.

## Evidence World

Nur beobachtete / belastbar abgeleitete Information.

## Hypothesis World

Die daraus konstruierte, vervollständigte Welt.

## Provider

Spezialisierter Algorithmus / Modell / Tool, das Evidenz oder Hypothesen
liefert. Kein Eigentümer der Welt.

## Abstain

Explizite Entscheidung, keine räumliche Behauptung zu machen.

------------------------------------------------------------------------

# 78. Leitfragen während der Entwicklung

1.  Was versuche ich gerade wirklich zu erschaffen?
2.  Welche gröbere Struktur muss dafür bereits existieren?
3.  Welche Evidenz trägt diese Struktur?
4.  Welche Teile des Inputs sind für diesen Schritt nur Rauschen?
5.  Ist die Information observed, derived, inferred oder invented?
6.  Kann ich die Behauptung mit einem einfacheren Constraint testen?
7.  Brauche ich wirklich ein großes Modell?
8.  Gibt es ein altes, deterministisches Verfahren dafür?
9.  Kann ein Browser / Toaster diesen Teil lösen?
10. Was würde die These falsifizieren?
11. Was darf dieser Schritt auf keinen Fall heimlich verändern?
12. Kommt hier bereits Grafik ins Spiel, obwohl die Geometrie noch nicht
    fest ist?

------------------------------------------------------------------------

# 79. Kernthesen in einem Satz

> **Pixels are evidence. They are not the world.**

> **One image. One small world.**

> **Room first. Everything else second.**

> **Reconstruct in dependency order, not observation order.**

> **Fine evidence may refine coarse structure, but may not silently
> redefine it.**

> **Right by accident is not measured.**

> **Plausibility is allowed. False provenance is not.**

> **Glass is an absence first, an effect second.**

> **Research Debt is not Dead Code.**

> **Do not optimize the problem for one provider before comparing
> providers on the problem.**

> **The renderer may display the world. It may not repair the world.**

> **The world may become uglier under load. It may not become less
> usable.**

> **Geometry solves geometry. Shaders solve perception.**

------------------------------------------------------------------------

# 80. Die eigentliche SHADED-Hypothese

Die tiefere Idee ist nicht:

> Primitive sind besser als AI.

Sondern:

> **Wenn Weltstruktur hierarchische Abhängigkeiten besitzt, sollte
> Reconstruction diese Abhängigkeiten explizit lösen, bevor sie
> Erscheinung rekonstruiert.**

Wenn dadurch ein Browserprozess aus: - wenigen Kanten, -
Flächenrelationen, - bekannten Maßen, - Projective Rectification, -
lokalen Raumcharts, - Portalen, - Constraint Propagation, - einfachen
Rays

einen strukturell korrekteren Raum erzeugt als ein riesiges
End-to-End-Modell, dann wurde kein Technikmonster „mit weniger
Rechenleistung im selben Spiel" geschlagen.

Dann wurde gezeigt:

> **Das Technikmonster hat ein viel größeres Problem gelöst als nötig,
> während SHADED zuerst die richtige Frage gestellt hat.**

Das ist die eigentliche „Way of the Toaster"-These.

------------------------------------------------------------------------

# 81. Offene Forschungsrichtung

Noch nicht als bewiesen behandeln:

-   Wie weit kann Flächen-/Kantenvermessung tatsächlich metrisch tragen?
-   Wie zuverlässig ist automatisches Observability Ranking?
-   Wie gut lässt sich ein rectified corridor aus Smartphonebildern
    erzeugen?
-   Wie stark helfen bekannte Hallenmaße?
-   Wie wenige Frames reichen pro Raumtyp?
-   Wie gut funktionieren Gegenblicke?
-   Wie wertvoll sind Menschen statistisch als Maßstab?
-   Wie viel kann Loop Closure korrigieren?
-   Welche Provider werden nach Room Scaffold plötzlich viel besser?
-   Welche Provider werden dadurch komplett unnötig?
-   Welche klassischen Verfahren schlagen moderne Modelle bei
    Teilaufgaben?
-   Wie viel zusätzliche Konsistenz liefern virtuelle Kameras?
-   Wie weit ist die 80/20-Verteilung tatsächlich -- oder ist sie bei
    Hallen noch extremer?

Diese Fragen sind Teil des Projekts.

Nicht Argumente dagegen.

------------------------------------------------------------------------

# 82. SHADED ist der Editor -- eine Anwendung, eine Produktoberfläche

Die UI-Konsolidierung vom 29. August 2026 klärt eine lange
missverständliche Trennung:

> **SHADED ist nicht eine Engine plus ein separater Editor. SHADED IST
> der Editor.**

Es darf produktseitig genau **eine** SHADED-Anwendung geben.

``` text
SHADED
├─ Editor Shell / Workbench
├─ Viewport
├─ World / Reconstruction
├─ Material / Appearance
├─ Actors
├─ Storyboard / Timeline
├─ Style Discovery
├─ Diagnostics
└─ Runtime / Renderer
```

Historisch existierte eine alte Root-Oberfläche in `index.html` und
daneben die neuere, Theia-kompatible / Workbench-artige
Editor-Oberfläche unter `editor/index.html`. Diese Trennung war **kein
gewünschtes Endmodell**, sondern technischer Zwischenzustand.

Zielzustand:

``` text
/index.html
    = einzige kanonische SHADED-Anwendung

/editor/
    = UI-Module, Styles, Tools

/runtime/
    = Render-, Simulations-, World- und Domain-Module
```

Es gibt ausdrücklich **nicht**:

-   ein „normales SHADED" plus „SHADED Editor",
-   einen Classic Mode,
-   eine zweite versteckte Produktoberfläche,
-   einen Launcher, der erst den eigentlichen Editor öffnet,
-   eine separate Style-Discovery-App als zweites Produkt,
-   zwei konkurrierende Navigations-/Inspector-Systeme.

Ein interner Sandbox- oder Benchmark-Entry-Point darf als **Test
Harness** existieren, solange er nicht zur zweiten Produktoberfläche
wird.

> **One SHADED. One UI. One canonical entry point.**

------------------------------------------------------------------------

# 83. Eine Wahrheit bedeutet nicht eine Datei

Mehrere ältere Projektregeln haben wichtige semantische Invarianten mit
konkreter Dateistruktur vermischt.

Sinnvoll und weiterhin gültig sind:

-   **eine Material-Wahrheit**,
-   **eine kanonische WorldState-/Material-Semantik**,
-   **ein konsistenter API-/Projektvertrag**,
-   **keine zwei unabhängig driftenden Implementierungen derselben
    Verantwortung**.

Daraus folgt aber **nicht**:

-   ein einziger 4.000+-Zeilen-Shader-/Engine-Monolith,
-   eine einzige physische Shader-Datei,
-   dass `shaded-engine.mjs` für immer jede Verantwortung besitzen muss,
-   dass UI und Runtime im selben Dokument gekoppelt bleiben müssen,
-   dass ein Dateiname zur Architektur-Invariante wird.

Die richtige Interpretation ist:

``` text
ONE TRUTH
≠
ONE FILE
```

Beispiel:

``` text
runtime/
├─ renderer
├─ materials
├─ world-state
├─ simulation
├─ water
├─ actors
├─ camera
└─ persistence
```

kann weiterhin **eine** Material- und Rendering-Wahrheit besitzen, wenn
die Verantwortungsgrenzen explizit sind und keine parallelen
semantischen Systeme entstehen.

> **Zwei Renderer dürfen existieren. Zwei Style-Systeme dürfen nicht
> unabhängig auseinanderlaufen.**

Ein Benchmark-Renderer und ein Produktionsrenderer können denselben
`WorldState`, dieselbe `MaterialResponse`, dasselbe `StyleProfile`,
denselben `TechniqueRegistry`-Vertrag und dasselbe `RenderBudget`
konsumieren.

------------------------------------------------------------------------

# 84. Projektregeln dürfen Architektur nicht fossilieren

`CLAUDE.md`, Agentenregeln und ähnliche Dateien sind **abgeleitete
Projektverfassung**, nicht höherwertige Wahrheit als eine neue
ausdrückliche Architekturentscheidung des Maintainers.

Problematisches Muster:

``` text
alte Architektur
↓
in CLAUDE.md als „unverhandelbar“ dokumentiert
↓
Architektur ändert sich
↓
Dokument bleibt alt
↓
Agent verteidigt den überholten Zustand gegen den aktuellen Auftrag
```

Genau dies kann passieren, wenn Regeln weiterhin Aussagen enthalten wie:

-   `editor/` müsse dauerhaft ein separates Autorenwerkzeug bleiben,
-   `index.html` müsse dauerhaft das Rendering-Ziel bleiben,
-   ein konkreter Monolith sei die „eine Shader-Wahrheit",
-   APIs dürften ausschließlich erweitert, aber selbst bei
    Architekturwechsel nie neu geschnitten werden.

Daher gilt:

> **Invarianten schützen Ziele und Semantik, nicht historische
> Dateinamen.**

Vor größeren Agentenläufen müssen Projektregeln auf Widerspruch mit der
aktuellen Architektur geprüft werden.

Wenn eine Regel nachweislich eine explizit verworfene Architektur
konserviert, wird die Regel korrigiert --- nicht die neue Architektur
zurückgebogen.

Nicht verhandelbare Kernziele wie **„One image. One small world."**,
Provenance, Material-Wahrheit und Observability bleiben davon unberührt.

------------------------------------------------------------------------

# 85. Legacy-Code ist Capability Donor, nicht Erhaltungsobjekt

Bei der Konsolidierung wird alte Funktionalität **nicht wholesale
migriert**.

Die alte Anwendung ist ein **Legacy Capability Donor**.

Jedes Legacy-Subsystem wird vor Übernahme klassifiziert.

## A --- Preserve and extract

Produkt-/Domain-Funktionalität, die weiterhin zu SHADED gehört:

-   Storyboard / Story Timeline,
-   Actor Placement und Actor State,
-   Scene-/Project-Persistence,
-   Import / Export,
-   nützliche World-State-Logik,
-   Wasser-Simulation / Wasserzustand / Interaktionen,
-   Ripple-/Wave-/Foam-Inputs,
-   Collision-/Environment-Logik,
-   brauchbare Kamera-/Navigationslogik,
-   einzigartige räumliche oder Editor-Workflows.

Diese Fähigkeiten werden in saubere Module extrahiert und an das
aktuelle SHADED angeschlossen.

## B --- Preserve only if still superior or unique

Vor Übernahme älterer:

-   Materiallogik,
-   Spatial-Code,
-   Partikellogik,
-   Kameralogik,
-   Simulationen,
-   Utilities,
-   Renderer-Helfer

wird geprüft, ob die neue Architektur bereits eine bessere oder
gleichwertige Lösung besitzt.

Keine doppelte Fähigkeit nur aus Kompatibilitätsgründen.

## C --- Do not migrate

Nicht automatisch übernehmen:

-   alte Shader-Effekte,
-   alte Post-Processing-Effekte,
-   alte Style-Presets,
-   effekt-spezifische Legacy-UI,
-   alte Shader-Branches,
-   duplizierte Materialdarstellung,
-   visuelle Hacks, die durch `StyleProfile` / `TechniqueRegistry` /
    moderne Renderer ersetzt wurden.

Wenn die neue Effektbibliothek eine reale Ersatzimplementierung besitzt,
ist **die neue Implementierung kanonisch**.

> **Preserve capabilities, not legacy implementations.**

Feature-Parität bedeutet nicht Implementierungs-Parität.

------------------------------------------------------------------------

# 86. Konsolidierung darf Spaghetti nicht nur umtopfen

Eine UI-/Runtime-Migration ist keine Verbesserung, wenn der alte
Monolith lediglich nach `legacy-engine.js` verschoben wird.

Unerwünscht:

``` text
index.html spaghetti
↓
legacy-engine.mjs spaghetti
↓
„modularisiert“
```

Gewünscht ist eine inkrementelle Verantwortungszerlegung:

-   Renderer / WebGL lifecycle,
-   Scene Loading / Asset Ingestion,
-   World State / Simulation,
-   Material Handling,
-   Water / Domain Simulations,
-   Actors / Animation,
-   Storyboard / Timeline,
-   Spatial / World Viewer,
-   Input / Camera,
-   Persistence / Presets,
-   Editor UI Bindings.

Regeln:

1.  tatsächliche Verantwortung identifizieren,
2.  prüfen, ob bereits ein neuer Eigentümer dieser Verantwortung
    existiert,
3.  erhaltene Fähigkeit in das kleinste passende bestehende oder neue
    Modul verschieben,
4.  doppelten Zustand entfernen,
5.  doppelte Event Handler entfernen,
6.  globale `window`-Kopplung dort durch kleine explizite APIs ersetzen,
    wo dies ohne unnötigen Rewrite möglich ist,
7.  Funktion im neuen Pfad verifizieren,
8.  erst danach toten Legacy-Code löschen,
9.  funktionierende Algorithmen nicht nur aus Stilgründen neu schreiben.

> **Incremental extraction with working checkpoints beats a big-bang
> rewrite.**

Die Root-HTML-Datei soll langfristig eine **dünne Application Shell**
sein, nicht der Ort der eigentlichen Runtime-Implementierung.

UI-Module dürfen Runtime-APIs aufrufen. Runtime-Module sollen nicht von
der konkreten Editor-DOM-Struktur abhängen.

------------------------------------------------------------------------

# 87. Kanonische Style-/Effect-Architektur

Die neue Appearance-Architektur trennt Weltzustand,
physische/materialbezogene Reaktion, Stil und Ausführung.

``` text
WorldState
↓
Solver / Simulation
↓
MaterialResponse
↓
StyleProfile
↓
TechniqueRegistry
↓
RenderBudget
↓
Renderer / Final Render
```

## 87.1 WorldState

Beschreibt semantisch, **was mit der Welt der Fall ist**, nicht wie es
aussieht.

Beispiele:

-   wetness,
-   moisture,
-   temperature,
-   soot,
-   ash,
-   rust,
-   damage,
-   crack,
-   fracture,
-   frost,
-   snow,
-   ice,
-   blood,
-   wound,
-   scab,
-   emission,
-   velocity.

Ein nasses Brett ist in PBR, Anime, Comic oder Painterly **dasselbe
nasse Brett**.

## 87.2 Solver / Simulation

Verändert WorldState durch Weltregeln.

Beispiele:

-   Wasser / Wellen,
-   Feuer / Brennstoff / Char,
-   Rost / Patina,
-   Trocknung,
-   Schnee / Eis,
-   Erosion,
-   Fracture,
-   Temperaturgradienten.

## 87.3 MaterialResponse

Übersetzt WorldState in **stilunabhängige materielle Konsequenzen**.

Beispiele:

-   baseColorShift,
-   roughnessShift,
-   reflectance,
-   emission,
-   surfaceDarkening,
-   normalChange,
-   edgeDamage,
-   wetness response,
-   charAmount,
-   sootAmount,
-   crackAmount,
-   frostAmount,
-   snowAmount,
-   bloodAmount.

## 87.4 StyleProfile

Bestimmt, **wie diese Konsequenzen grafisch ausgedrückt werden**.

Beispiele:

-   lighting model,
-   diffuse bands,
-   shadow treatment,
-   specular mode,
-   rim mode,
-   normal treatment,
-   outlines,
-   palette,
-   texture breakup,
-   transparency treatment,
-   post FX.

## 87.5 TechniqueRegistry

Katalogisiert konkrete Techniken und ihre Fähigkeiten, Kosten,
Substitutionen und Provenance.

Der Registry-Eintrag soll mindestens beantworten:

-   Was tut die Technik?
-   Welche Inputs benötigt sie?
-   Welche Style-Dimension bedient sie?
-   Welche Renderkosten besitzt sie?
-   Welche Mobile-Substitution existiert?
-   Woher stammt die Idee / Implementierung?
-   Unter welcher Lizenz darf sie wie verwendet werden?

## 87.6 RenderBudget

Kommt **nach** der Stilentscheidung.

Es beantwortet nicht:

> Welchen Stil habe ich?

sondern:

> Wie erhalte ich die Identität dieses Stils innerhalb des verfügbaren
> Budgets?

## 87.7 Aktuelle Implementierungsgrenze

Der renderer-unabhängige Style-Core soll unter `runtime/style/` bzw.
äquivalenten reinen Runtime-Modulen leben.

Er soll nach Möglichkeit:

-   kein DOM benötigen,
-   kein WebGL/WebGPU direkt benötigen,
-   als Pure ESM importierbar sein,
-   in Node testbar sein,
-   Kandidaten, Profile, Präferenzen, Budgets und Registry unabhängig
    vom konkreten Renderer modellieren.

Renderer-spezifische Adapter bleiben dünn.

`runtime/shaded-engine.mjs` darf während der Migration vorübergehend
noch funktionierende Legacy-Ausführung enthalten. Es ist aber **nicht
automatisch die zukünftige Architektur**, nur weil ältere Projektregeln
es als zentrale Shader-/Material-Wahrheit beschrieben haben.

Alte visuelle Implementierungen werden erst entfernt, wenn ein realer
Ersatz existiert und verifiziert wurde. Das schützt Funktionalität, ohne
den Legacy-Monolithen zum Zukunftsmodell zu erklären.

------------------------------------------------------------------------

# 88. MaterialResponse darf vor dem Style-Pass nicht semantisch zerstört werden

Ein G-Buffer oder Zwischenpass darf nicht alle relevanten
World-/Material-Signale zu früh in wenige fertige visuelle Werte backen.

Problem:

``` text
wetness
↓
sofort zu darker baseColor + roughness gebacken
↓
Style A und Style B sehen nur das fertige Ergebnis
```

Dann kann Style A Nässe nicht anders interpretieren als Style B.

Gewünscht:

``` text
WorldState.wetness
↓
MaterialResponse.wetness / response channels
↓
Style A → dunkler + glatter
Style B → harte Highlight-Bänder
Style C → gemalte dunkle Ränder
```

Daher müssen relevante semantische Response-Signale bis zur
Stilentscheidung erhalten bleiben.

Sie können technisch:

-   in zusätzlichen Attachments gepackt,
-   über Material-/Object-IDs referenziert,
-   in Response-Tabellen geführt,
-   oder anderweitig effizient verfügbar gemacht werden.

Entscheidend ist die semantische Trennung, nicht ein bestimmtes
Packing-Format.

------------------------------------------------------------------------

# 89. Style Discovery -- Geschmack lernen statt Shadernamen abfragen

SHADED soll den Nutzer nicht zwingen, Begriffe wie `Half-Lambert`,
`Gooch`, `GGX`, `MatCap`, `Sobel Outline` oder `Fresnel Rim` verstehen
zu müssen.

Style Discovery zeigt Resultate und lernt Präferenzen.

Grundprinzip:

``` text
Kandidat A     Kandidat B
      \         /
       Blind Vote
          ↓
Preference Model
          ↓
gezielter nächster Vergleich
          ↓
komponiertes StyleProfile
```

## 89.1 Blindvergleich

Vor der Entscheidung zunächst nur:

-   Kandidat A,
-   Kandidat B,
-   keine Stilnamen,
-   keine Techniknamen,
-   keine Label wie „Anime", „PBR" oder „Comic", die Erwartung erzeugen.

Nach dem Vote darf die technische Erklärung sichtbar werden.

## 89.2 Feedback

Mindestens sinnvoll:

-   bevorzuge A,
-   bevorzuge B,
-   keine Präferenz,
-   interessant / markieren,
-   Undo Last Vote.

## 89.3 Kein unnötiges ML-Backend

Das Preference Model soll zunächst:

-   deterministisch,
-   inspectable,
-   reproduzierbar,
-   lokal speicherbar

sein.

Ein komplexes ML-Backend ist erst gerechtfertigt, wenn ein einfaches
adaptives Modell nachweisbar nicht reicht.

------------------------------------------------------------------------

# 90. Style-Discovery-Benchmark ist Diagnosewerkzeug, kein Spielzeugmotiv

Eine gute Benchmark-Szene enthält bewusst Materialien und Formen, an
denen unterschiedliche Techniken sichtbar werden.

Beispielhafte diagnostische Objekte:

-   curved matte sphere,
-   wood block,
-   metal torus,
-   glass / crystal primitive,
-   water plane,
-   skin-like capsule,
-   fur / feather-like surface,
-   emissive / fire object,
-   smoke / volume region,
-   damaged / weathered plate.

Die Szene braucht kontrollierte:

-   Kamera,
-   Beleuchtung,
-   Environment,
-   WorldState-Varianten,
-   reproduzierbare Seeds.

Sie ist kein zweites SHADED-Produkt, sondern ein **Beweisfeld für
Style-/Material-Techniken**.

## 90.1 Erste vertikale Slice

Zuerst wenige echte, kombinierbare Primitive vollständig beweisen, bevor
Hunderte Shader gesammelt werden.

Sinnvoller Start:

-   Lighting: Half-Lambert / 3-Band Ramp / Hard Cel,
-   Specular: material-aware / banded,
-   Rim: off / soft / hard colored,
-   Normals: smooth / curvature / faceted,
-   Outline: none + eine echte Depth/Normal-Lösung,
-   Palette: free / gradient / posterize,
-   Texture: clean / graphic-painterly breakup,
-   Post: Bloom + Grain/Halftone,
-   States: dry / wet / charred / damaged,
-   Budgets: FULL / MOBILE.

Erst wenn diese Slice von WorldState bis Mobile-Render sauber
funktioniert, lohnt breite Bibliothekserweiterung.

------------------------------------------------------------------------

# 91. Adaptive Preference Discovery muss deterministisch testbar sein

Die nächste Vergleichspaarung soll nicht „irgendwie weniger zufällig"
wirken, sondern nachvollziehbar aus Unsicherheit entstehen.

Beispiel:

``` text
höchste Unsicherheit = outlineMode
↓
selectPair()
↓
A und B unterscheiden primär outlineMode
↓
andere etablierte Dimensionen bleiben stabil
```

Regeln:

-   unsichere Dimensionen häufiger testen,
-   bereits stabile Dimensionen seltener erneut fragen,
-   gelegentliche Retests gegen Drift / Zufallsentscheidungen,
-   nicht alle Dimensionen gleichzeitig mutieren,
-   erfolgreiche Profile als Eltern nutzen,
-   kleine kontrollierte Mutation vor allem auf unsicheren Dimensionen.

## 91.1 Side Bias

A/B-Bildschirmposition darf nicht zum gelernten Stilmerkmal werden.

Daher:

-   Kandidatenseiten balanciert oder deterministisch wechseln,
-   Seitenzuordnung nicht mit einem Style-Cluster korrelieren lassen,
-   Präferenzmodell nur Style-Differenzen lernen lassen.

## 91.2 Reproduzierbarkeit

Gespeichert werden mindestens:

-   Seed,
-   Candidate-Konfiguration,
-   StyleProfile,
-   WorldState,
-   Lighting Setup,
-   Scene Version,
-   RenderBudget,
-   Votes,
-   Confidence / Unsicherheit,
-   Paarungsgrund.

Lokale Persistenz plus menschenlesbarer JSON-Export/-Import ist
vorzuziehen.

------------------------------------------------------------------------

# 92. Zwei kanonische Vergleichsmodi

## Same State, All Styles

Gleiche Welt, gleicher Zustand, unterschiedliche grafische
Interpretation.

Beispiel:

``` text
wood + wetness=.8 + damage=.3
│
├─ PBR
├─ Anime
├─ Comic
├─ Painterly
├─ Graphic
├─ PSX
└─ Custom Learned Style
```

Damit wird geprüft, ob Style wirklich **Presentation** ist und nicht
heimlich WorldState verändert.

## Same Style, All States

Gleicher Stil, unterschiedliche Weltzustände.

``` text
Custom Style
│
├─ dry
├─ wet
├─ frozen
├─ burning
├─ charred
├─ mossy
└─ damaged
```

Damit wird geprüft, ob der Stil eine kohärente Sprache über verschiedene
Zustände besitzt.

------------------------------------------------------------------------

# 93. Renderpipeline: logische Stufen wichtiger als künstliche Pass-Zählung

Die Architektur darf nicht zu einer kosmetischen Aussage wie „genau zwei
GPU-Passes" verbogen werden.

Sinnvoll ist logisch:

``` text
Geometry / Material Response Pass
↓
Style Pass
↓
optional Lightweight Post Chain
↓
Final Render
```

Ein echter Bloom benötigt typischerweise zusätzliche Verarbeitung. Er
soll nicht gefälscht oder in einen unpassenden Pass gepresst werden, nur
damit ein „2-pass"-Versprechen formal stehen bleibt.

> **Architekturstufen sind semantische Grenzen, keine Marketingzahl für
> Draw Calls.**

Die konkrete Passzahl darf durch Renderer, Technik und Budget variieren,
solange die semantischen Verträge stabil bleiben.

------------------------------------------------------------------------

# 94. Style-preserving LOD statt Style-off

Mobile Optimierung soll die Implementierung vereinfachen, nicht die
Stilidentität löschen.

Beispiele:

``` text
Volume:
physical raymarch
→ banded low-step raymarch
→ SDF puffs
→ billboard

Outline:
depth+normal
→ simplified depth/normal
→ silhouette
→ off nur wenn Stilidentität es erlaubt

Refraction:
physical
→ screen UV offset
→ fake transmission
→ dither/cutout

Particles:
simulated mesh
→ flipbook
→ sprite
→ merged billboards
```

Zu erhalten sind möglichst:

-   Silhouette,
-   Palette,
-   Materialunterscheidung,
-   charakteristische Licht-/Shadow-Sprache,
-   zentrale Outline-/Rim-Identität,
-   wichtige WorldState-Lesbarkeit.

Die Welt darf unter Last billiger werden, aber der **Stil soll
wiedererkennbar bleiben**.

## 94.1 Keine Fake-Budget-Tiers

Wenn aktuell nur `FULL` und `MOBILE` wirklich implementiert sind, werden
auch nur diese als echte Nutzermodi angeboten und verifiziert.

`BALANCED` / `MINIMAL` dürfen als interne Zielklasse oder
Substitutionsplanung existieren, aber nicht als scheinbar fertige
UI-Option ohne reale Implementierung.

------------------------------------------------------------------------

# 95. Style Discovery gehört in die bestehende Workbench

Die Style-Discovery-Oberfläche darf nicht als zweite generische
Dark-Card-Webseite neben SHADED entstehen.

Sie wird in die bestehende Theia-kompatible / Workbench-artige
SHADED-Shell integriert.

Grundstruktur:

``` text
Tool Rail
├─ Quelle
├─ Welt
├─ Material
├─ Actor
├─ Story
└─ Stil

Main Viewport
├─ normaler SHADED View
└─ A/B Style Comparison bei aktivem Discovery-Modus

Inspector
├─ World State
├─ Style Discovery
├─ Style Profile
├─ Render Budget
└─ Expert / Telemetry
```

UI-Regeln:

-   keine zweite globale Navigation,
-   keine zweite Theme-/Token-Welt,
-   keine riesige Intro-/Marketingüberschrift,
-   keine Website-artige Card-Kaskade als Editorersatz,
-   bestehende Tool-Rail, Inspector- und Drawer-Muster wiederverwenden,
-   technisches Detail in einen Expert-/Advanced-Bereich,
-   Renderfläche bleibt primär.

## 95.1 Portrait first

Desktop kann A und B nebeneinander zeigen.

Auf schmalem Portrait sind zwei winzige Render-Thumbnails ungeeignet.

Bevorzugt:

-   großer A/B-Toggle,
-   Flick-/Hold-Vergleich,
-   oder vertikal klar getrennte große Ansichten,
-   kompakte Vote-Controls,
-   Inspector als Drawer / Bottom Sheet.

Das Produkt soll auf Mobile **wie ein Editor mit großem Viewport**
wirken, nicht wie ein langes Einstellungsformular.

------------------------------------------------------------------------

# 96. Wasser: Domain-Logik und visueller Renderer sind getrennte Entscheidungen

Die alte Wasserfunktionalität enthält möglicherweise wertvolle
Simulations-/Interaktionslogik, auch wenn ihre visuelle Implementierung
überholt ist.

Zu erhalten, wenn brauchbar:

-   waterDepth,
-   velocity,
-   ripple/wave propagation,
-   collision boundaries,
-   interaction impulses,
-   foam/splash state,
-   environment coupling,
-   Temperatur-/Wetness-Beziehungen.

Nicht automatisch erhalten:

-   alter Water Fragment Shader,
-   alte Reflection Hacks,
-   alte Foam-Darstellung,
-   alte Refraction-/Post-FX-Tricks.

Ziel:

``` text
Water Simulation / WorldState
↓
MaterialResponse
↓
StyleProfile + RenderBudget
↓
moderner spezialisierter Water Renderer
```

Für SHADED ist **Particles4All** die bevorzugte spezialisierte
WebGPU-Basis für Wasser/Fluid, sofern Integration und Zielplattform dies
tragen. SHADED liefert dabei Geometrie, Kollisionskörper, WorldState,
Umwelt-/Materialparameter, Style- und Budgetinformationen; der
spezialisierte Renderer soll Fluiddarstellung nicht unnötig neu
erfinden.

> **Preserve the water logic; do not automatically preserve the old
> water look.**

------------------------------------------------------------------------

# 97. Donor- und Lizenzregeln für die Effektbibliothek

Eine große TechniqueRegistry ist nur nützlich, wenn Provenance und
Nutzungsart sauber dokumentiert bleiben.

Jeder Donor-/Technik-Eintrag sollte mindestens enthalten:

``` text
source / repository / URL
technique
license
license class
usage mode
affected/local implementation
notes
```

Sinnvolle Usage Modes:

-   `direct`
-   `port`
-   `algorithm-reference`
-   `visual-reference`

Grundregeln:

-   MIT/BSD/Apache/ISC/Unlicense/CC0 können je nach konkreter Lizenzlage
    direkte Wiederverwendung erlauben.
-   Fehlende Lizenz bedeutet **nicht** freie Wiederverwendung.
-   Shadertoy ist nicht pauschal „frei"; Lizenz pro Shader prüfen.
-   Gists ohne Lizenz sind Referenz, kein automatisch kopierbarer Code.
-   NC-/kommerzielle/unklare Quellen nicht in Produktionscode kopieren.
-   Große Frameworks nicht importieren, wenn nur eine kleine Technik
    gebraucht wird.
-   Algorithmus und Idee dürfen, wo rechtlich zulässig, unabhängig
    sauber implementiert werden; Provenance trotzdem dokumentieren.

Die TechniqueRegistry ist damit zugleich **Capability Registry und
Provenance Registry**.

------------------------------------------------------------------------

# 98. Style-Discovery- und UI-Verifikation

Statische Unit Tests reichen für Rendering-/Editor-Arbeit nicht aus.

Mindestens zu prüfen:

## Architektur

-   Stylewechsel mutiert WorldState nicht.
-   MaterialResponse bleibt stilunabhängig.
-   Candidate Seed + Serialisierung sind deterministisch.
-   Preference Model reagiert deterministisch auf bekannte Votes.
-   Budget-Substitution erhält Style-Identität besser als ein styleless
    Fallback.
-   Registry-Einträge validieren Capability / Provenance / Lizenzmodus.

## Produktfluss

-   Blind Mode zeigt vor Vote keine Style-/Techniknamen.
-   Votes persistieren über Reload.
-   Undo Last Vote funktioniert.
-   adaptive Paarwahl reagiert auf Unsicherheit.
-   isolierter Dimensionsvergleich verändert tatsächlich nur die
    beabsichtigte Dimension bzw. definierte kleine Gruppe.
-   Custom Profile rendert als echte Komposition.
-   Same State / All Styles ist sichtbar verschieden.
-   Same Style / All States zeigt unterschiedliche Zustände im selben
    Stil.

## Rendering

-   FULL und MOBILE besitzen real unterschiedliche Kosten.
-   MOBILE ist keine bloße Auflösungsattrappe.
-   Kameraorbit verursacht keine unvertretbare
    Outline-/Hatch-/Noise-Instabilität.
-   Objekt-/World-Space-Verfahren werden bevorzugt, wenn
    Screen-Space-Noise sichtbar schwimmt.
-   keine neuen Console-/WebGL-Fehler.

## UI

-   Desktop,
-   schmales Portrait,
-   Landscape,
-   Touch,
-   Reload / Persistence

werden tatsächlich im Browser geprüft.

Für die Entwicklungsiteration darf ein interaktiver Browser mit
Console-/Network-/DOM-/GPU-Diagnostik Playwright als
**Pflichtvoraussetzung** ersetzen. Für deterministische Regression, CI
und reproduzierbare Acceptance Tests bleibt Browserautomation weiterhin
sinnvoll.

> **Visually inspect what the user will actually see. A passing unit
> test is not a rendered product.**

------------------------------------------------------------------------

# 99. Ergänzende harte Agentenregeln für SHADED UI / Style / Migration

21. **SHADED ist der Editor.** Kein Agent erzeugt wieder zwei
    Produktoberflächen.
22. Eine Sandbox ist Test Harness, nicht automatisch ein zweites
    Produkt.
23. „Eine Wahrheit" darf nie als Begründung für einen unnötigen
    Monolithen missbraucht werden.
24. Veraltete `CLAUDE.md`-/Agentenregeln werden gegen aktuelle explizite
    Architekturentscheidungen geprüft und bei Widerspruch aktualisiert.
25. Legacy-Code erhält kein automatisches Bestandsschutzrecht.
    Fähigkeiten werden A/B/C klassifiziert.
26. Neue Effekt-/Style-Architektur ist kanonisch, sobald eine reale
    Ersatzimplementierung vorhanden und verifiziert ist.
27. Domain-Logik und visuelle Implementierung getrennt beurteilen ---
    besonders bei Wasser, Wetter und Materialzuständen.
28. Runtime-Code darf nicht an die konkrete Editor-DOM-Struktur gebunden
    werden, wenn eine kleine explizite API die Grenze sauber halten
    kann.
29. Kein „Refactor", der Spaghetti nur in eine andere große Datei
    verschiebt.
30. Keine Fake-Budget-Tiers oder kosmetischen Acceptance Tests.
31. Style Discovery lernt Präferenz aus Resultaten; der Nutzer muss
    keine Shadernomenklatur beherrschen.
32. A/B-Seitenbias darf nicht als Stilpräferenz gelernt werden.
33. Style bleibt Presentation. WorldState bleibt Weltzustand.
34. RenderBudget kommt nach Style und darf WorldState nicht
    umdefinieren.
35. Zwei Renderer sind akzeptabel, solange sie dasselbe
    Style-/World-System konsumieren. Zwei unabhängig driftende
    Style-Systeme sind es nicht.

------------------------------------------------------------------------

# 100. Ergebnis der Shader-/Materialrecherche: kein Shader-Fundus, sondern Technikbaukasten

Die in diesem Chat zusammengetragene Recherche umfasst inzwischen weit
mehr als klassische Shader: Oberflächenrenderer, NPR-/Toon-Techniken,
Volumen, Wasser/Fluid, granulare Simulation, Stable Fluids,
Erosion/Sediment, Partikel, Schnee/Eis, Feuer/Rauch/Ruß/Glut,
Wetness/Trocknung/Pfützen, Materialalterung, SSS/Transmission/Caustics,
Vegetation, Deformation/Fracture, Material Recognition/Binding,
prozedurale Materialien, Organic-/Creature-Materialien und
Painterly/Watercolor/Ink/Comic/Manga/PSX/Pixel-Stile.

Die Konsequenz lautet ausdrücklich **nicht**:

> SHADED braucht Hunderte unabhängige Shader.

Sondern:

> **Fremde Shader sind ein Ersatzteillager. SHADED komponiert aus
> orthogonalen Techniken eigene StyleProfiles.**

Ein Donor kann nur für Foam, ein anderer nur für Outlines, anisotrope
Highlights oder die Simulation unterhalb der Darstellung interessant
sein. Die Entscheidungseinheit ist daher nicht `repo`, `shader` oder
`demo`, sondern **Technique Capability**.

------------------------------------------------------------------------

# 101. Die fehlenden elementaren Systeme sind Labs, keine Material-Presets

Sand, Wasser, Rauch oder Matsch dürfen nicht in jeweils einem
Shader-Preset zusammenfallen.

Mindestens zu trennen sind:

``` text
Material / Surface Lab
Coast / Water Surface Lab
Granular Lab
Fluid Lab
Particle Lab
Volume Lab
Erosion / Sediment Lab
Vegetation / Growth Lab
Deformation / Fracture Lab
Aging / Weathering Lab
Material Binding Lab
Style Discovery Lab
```

Beispiel Sand:

``` text
Sand als Material
≠ Düne als Geländeform
≠ Falling Sand als granulare Simulation
≠ Sandflug als Partikelsystem
≠ Sedimenttransport durch Wasser
```

Beispiel Wasser:

``` text
Water WorldState
≠ Wellenoberfläche
≠ Ufer / Coast / Foam
≠ Fluid Solver
≠ Spray / Splash / Bubble Particles
≠ Refraction / Reflection / Caustics
```

Die Sandbox darf diese Disziplinen gemeinsam sichtbar machen, aber
intern nicht wieder zu einem `WaterShader` oder `SandShader` verkleben.

------------------------------------------------------------------------

# 102. Kanonische Element-/Simulationsbausteine

## 102.1 Granular

Für Falling Sand ist ein GPU-Cellular-Automaton sinnvoll. Wichtige
Referenzen:

-   `m4ym4y/falling-sand-shader`
-   `kody-w/learnwithkody` Falling Sand Lab
-   `GelamiSalami/GPU-Falling-Sand-CA`
-   `ericleong/sand.js`
-   `wg-romank/sands-of-rust`
-   John Robinsons WebGL SandToy

Technisch besonders interessant ist das **Block-Cellular-Automaton mit
Margolus-Offsets**, weil nicht überlappende 2×2-Blöcke
GPU-Race-Conditions stark vereinfachen.

Kodys Elementmodell ist als lokaler Chunk-Ansatz interessant:

``` text
element id
temperature
lifetime / reaction state
nonce / update state
```

Dies ist kein zwingendes globales WorldState-Packing. Der Granular
Solver darf intern kompakt packen, solange die semantischen Zustände an
der Systemgrenze explizit bleiben.

## 102.2 Stable Fluids

Für Rauch, Dampf, Gas und allgemeine Fluidadvektion sollen nicht mehrere
Noise-Animationen als unabhängige „Simulationen" existieren.

Kanonische Prozessfolge:

``` text
Sources / Forces
↓
Velocity Advection
↓
Divergence
↓
Pressure Solve
↓
Pressure Gradient Subtraction
↓
Density / Heat Advection
↓
optional Buoyancy / Vorticity
```

Wichtige Donoren / Referenzen:

-   `piellardj/navier-stokes-webgl` --- ISC
-   `aadebdeb/WebGL_SmokeSimulation` --- MIT
-   `julesyoungberg/2d-smoke` --- MIT
-   `keijiro/StableFluids` --- Unlicense / Public Domain
-   `matthiasbroske/GPUStableFluids` --- MIT

Fundament: Jos Stam --- *Stable Fluids* / *Real-Time Fluid Dynamics for
Games*; Mark Harris --- *Fast Fluid Dynamics Simulation on the GPU*;
*Hardware-aware analysis and optimization of stable fluids*.

> Rauch, Dampf, Hitze, Nebel und andere advectierbare Felder teilen
> möglichst ein konsistentes Bewegungsfeld statt jeweils eigene
> Fake-Bewegung zu erfinden.

## 102.3 Erosion und Sediment

Starker permissiver Donor:

-   `bshishov/UnityTerrainErosionGPU` --- MIT

Relevante Zustände pro Zelle:

``` text
terrainHeight
waterHeight
suspendedSediment
terrainHardness
waterFlux
velocity
```

Kette:

``` text
Regen → Wasserfluss → Sedimentaufnahme → Transport → Ablagerung → veränderte Terrainhöhe
```

Darauf können Matsch, stehendes Wasser, Sandtransport und
Vegetationswiderstand aufbauen.

## 102.4 Partikel

Ein allgemeines Partikelsystem soll Profile statt unabhängiger Engines
verwenden:

``` text
Regen    = schnelle Streaks + Impact
Schnee   = leichte Partikel + Drift
Hagel    = schwere Partikel + Bounce + Impact
Glut     = buoyant + emissive
Asche    = leichte draggy flakes
Sandflug = Wind + Ground Collision
Spray    = Water impulse + ballistic droplets
Debris   = Mesh particles + collision
```

Relevante Donoren / Referenzen: `skeeto/webgl-particles` (Unlicense),
`threeparticles/threeparticles`, `tigerabrodi/webgpu-vfx`,
`keijiro/ShurikenPlus`, Soft-Particle-Technik von `keaukraine`.

## 102.5 Volumen

Volumetrische Darstellung und Volumensimulation sind getrennte
Entscheidungen.

Relevante Renderer-/Technikspender:

-   `Donitzo/three.js-volume-renderer` --- MIT
-   Three.js `VolumeShader`
-   `leoawen/volumetric-clouds` --- MIT
-   `mattatz/THREE.Cloud` --- MIT

StyleProfile entscheidet anschließend beispielsweise:

``` text
PBR       → physical / high-step raymarch
Anime     → banded volume
Comic     → 2-color volume + outline/halftone
Painterly → warped density + brush breakup
Mobile    → SDF puffs / billboards
```

------------------------------------------------------------------------

# 103. Material ist Substrat + Aufbau + Layer + Zustand + Alter

Die Recherche zu Fell, Horn, Blut und Schorf zeigt, dass ein einzelnes
`materialType` nicht reicht.

Kanonisches Denkmodell:

``` text
SUBSTRATE
+
MICROSTRUCTURE / BUILD
+
SURFACE LAYER
+
WORLD STATE
+
AGE / HISTORY
+
STYLE
```

Beispiele:

``` text
skin → wound layer → wet blood → clot → scab → dry scab → cracking / peeling → scar
```

``` text
skin → fur fibers → wetness → clumping → snow / frost → drying
```

``` text
keratin → layered growth → anisotropy → translucency → wear → cracking
```

Diese Struktur verhindert kombinatorische Materialexplosionen wie
`WetBurntFrostedHornShader`.

------------------------------------------------------------------------

# 104. Organic-/Creature-Materialfamilien

SHADED soll ausdrücklich biologische, faserige und geschichtete
Materialien abbilden können.

  -----------------------------------------------------------------------
  Familie                             Wesentliche
                                      Response-/Rendermerkmale
  ----------------------------------- -----------------------------------
  Haut                                SSS, Poren, Öl/Schweiß, Blush,
                                      Dryness, Falten

  Haar                                anisotrope Highlights, Strähnen,
                                      Clumping, Wet Hair

  Fell                                Shells/Fins/Cards, Fiber Lighting,
                                      Wind, Nässe, Schnee

  Federn                              Layering, anisotrope Barbs,
                                      Iridescence, Wind

  Horn                                Keratin-Schichten, Growth Rings,
                                      Transmission, Abrieb

  Hufe / Krallen / Nägel              Keratin, Coat, Wachstum, Abrieb

  Zähne / Elfenbein                   Enamel/Dentin-Layer,
                                      SSS/Transmission, Verschleiß

  Knochen                             Porosität, Alterung, Feuchtigkeit

  Schuppen                            Layering, Directionality, Wetness,
                                      Iridescence

  Chitin / Panzer                     harter Coat, Thin Film, Kratzer,
                                      Risse

  Muschel / Perlmutt                  Layering + starke Iridescence

  Muskel / Fleisch                    feucht, faserig, SSS

  Fett / Wachs                        starke Translucency / SSS

  Auge                                Cornea + Flüssigkeit + Iris +
                                      Sclera als Layer

  Narben                              geänderte Roughness / Normal / SSS

  Schorf                              Trocknung, Schrumpfung,
                                      Rissbildung, Peeling

  Schwielen / Hornhaut                graduelle Verdickung + Dryness

  Blut                                zeitabhängiger Wechsel von Farbe /
                                      Roughness / Thickness

  Schleim / Mucus                     Film, Strings, Transmission,
                                      Specular

  Schimmel                            Growth Mask, Fuzz,
                                      Feuchteabhängigkeit

  Pilze                               Wachstum, Feuchte, SSS

  Algen                               nasse Growth Layer

  Moos / Flechten                     Surface Growth Layer

  Koralle                             poröse Struktur + Wachstum
  -----------------------------------------------------------------------

Hair/Fur/Feather-Techniken: Kajiya-Kay / Scheuermann Highlights, Shell
Texturing, Fins, Cards/Strands, anisotropic primary/secondary
highlights, Backlighting, Rim, Iridescence, Auto-LOD.

Relevante offene Referenzen:

-   `GarrettGunnell/Shell-Texturing` --- MIT
-   `hecomi/UnityFurURP` --- MIT
-   normalizedcrow Feather/Fur Basic --- als MIT-Basis berichtet;
    Lizenzversion bei Integration archivieren
-   `NeuralVFX/glsl-feather-shader` --- Referenz; Lizenz vor Copy prüfen

------------------------------------------------------------------------

# 105. Weitere materielle Familien

Zusätzlich benötigt SHADED:

-   Glas / Kristall,
-   Metall / Rost / Patina,
-   Holz / Rinde / Verkohlung,
-   Beton / Putz / Ziegel / Asphalt,
-   Kunststoff / Gummi / Silikon,
-   Stoff / Leder / Filz / Wolle,
-   Papier / Karton,
-   Keramik / Porzellan,
-   Gips / Kreide,
-   Harz / Amber,
-   Gel / Seife,
-   Salz / Kristallwachstum,
-   Teer / Bitumen,
-   Kohle / Asche / Staub / Pulver,
-   Öl / Schleim / Säure,
-   Schaum / Blasen.

Viele sind **kein eigener Shader**:

``` text
Plastik = dielectric response + roughness + optional coat
Gummi   = dielectric + hohe roughness + soft deformation
Leder   = dielectric + sheen/fuzz + pores + folds + aging
Metall  = conductor response + anisotropy + wear/rust layers
```

------------------------------------------------------------------------

# 106. Kanonisches Materialmodell, Materialbibliothek und Material Binding

## 106.1 OpenPBR als Vokabular / Zielmodell

Relevante Grundlagen:

-   Adobe `openpbr-bsdf` --- Apache-2.0
-   Academy Software Foundation OpenPBR
-   MaterialX als Austausch-/Vokabularschicht

Relevante Lobes / Parameter: Base, Metal, Roughness, Coat, Fuzz/Sheen,
Transmission, Dispersion, Translucency, Subsurface/Volume, Emission,
Anisotropy.

OpenPBR / MaterialX sind **Vokabular und Materialmodell**, nicht
automatisch SHADEDs Runtime-Codegenerator.

## 106.2 FreeStylized als lokale Source Library

Im Chat wurde eine lokale FreeStylized-Importpipeline für SHADED
angelegt.

Grundregeln:

-   öffentliche gebackene PBR-Texturen lokal nutzbar,
-   1K als Default, 2K/4K opt-in,
-   Bibliothek unter `.cache/materials/freestylized`,
-   Rohmaterialien nicht in das öffentliche SHADED-Repo committen,
-   `assignment: null`: Library-Material ist Quelle, keine semantische
    Klasse,
-   Kategorie ist höchstens Search-/Filter-Prior, niemals `classGrid`,
-   Source-/License-Metadaten erhalten.

Die öffentliche FreeStylized-Lizenz erlaubt Projektverwendung,
beschränkt aber die unveränderte Weiterverteilung als eigene
Assetbibliothek. Patreon-/SBS/SBSAR-Inhalte sind getrennt und werden
nicht umgangen.

## 106.3 Material Binding

Zielpipeline:

``` text
Image / reconstructed surface
↓
Material decomposition / segmentation
↓
material class + PBR observations
↓
OpenPBR-like canonical parameters
↓
World-law binding
↓
MaterialResponse
↓
StyleProfile
```

Relevante Forschungs-/Codequellen:

-   `astra-vision/MaterialPalette` --- PBR Material Extraction; Code
    MIT, Modell-/Checkpoint-Lizenz separat prüfen
-   `PROPHETE-pro/MaterialSeg3D` --- Materialklassensegmentierung;
    Lizenz vor Übernahme prüfen
-   `Kai-46/IRON` --- inverse rendering, BSD-2-Clause

Beispiel:

``` text
rough dielectric + semantic evidence wood
→ materialClass = wood
→ moisture absorption allowed
→ fire fuel response allowed
→ frost expansion possible
→ canonical MaterialResponse
```

> **Material Recognition bestimmt nicht den Stil. Es bindet
> Weltverhalten an eine Oberfläche.**

------------------------------------------------------------------------

# 107. Alterung, Wetterung und persistente Surface States

Nicht nur aktuelles Wetter, sondern **Historie** gehört in die Welt.

Relevante Zustände: wetness/moisture, drying, dirt, dust, soot, ash,
rust, patina, moss, algae, scratches, cracks, paint peeling, scorch,
char, blood, scab, footprints, tire marks, salt/mineral deposits.

Wichtige Papers / Denkmodelle:

-   *Flow and Changes in Appearance*
-   *Modeling and Rendering of Metallic Patinas*
-   *Modeling and Rendering of Weathered Stone*
-   *Visual Simulation of Weathering by γ-ton Tracing*
-   *Simulating Dust Accumulation*
-   *Simulation of Paint Cracking and Peeling*
-   *Generating Surface Crack Patterns*

Beispiel ausblutende Pfütze:

``` text
standingWater
↓ evaporation / drainage
wetness remains
↓
dissolved dirt moves
↓
edge dries
↓
residue / dirt ring remains
```

Eine Pfütze ist damit kein bloßer Alpha-Fade.

------------------------------------------------------------------------

# 108. Deformation, Materialermüdung und Bruch

Materialermüdung ist kein Shaderproblem. Der Shader zeigt Folgen eines
Zustands / Solvers.

Relevante Solver-/Paperfamilien:

-   XPBD für Cloth / Soft Bodies,
-   MPM für Schnee / visko-elasto-plastische Stoffe,
-   Stress-/Crack-Propagation,
-   Fracture,
-   Paint cracking / adhesion loss.

Relevante Donoren / Referenzen:

-   `penn-graphics-research/ziran2019` --- MIT, MPM + fracture
-   kleinere MPM-Snow-Implementierungen als Algorithmusreferenz
-   WebGPU Soft Body / XPBD Cloth Repos als Browser-/GPU-Referenzen

``` text
stress / fatigue / damage / crack / fracture / deformation
```

sind World-/Solver-Zustände. Fracture Highlight, Comic Impact Star oder
Dust Puff sind Renderentscheidungen.

------------------------------------------------------------------------

# 109. Stilisierung ist ein vollständiger Rendererraum, kein `toon=true`

StyleProfiles sollen mindestens folgende großen Familien ausdrücken
können:

-   PBR,
-   Soft Toon,
-   Hard Cel,
-   Anime,
-   Illustrative / Gooch,
-   Ghibli-artige Environment-Stilisierung,
-   Comic,
-   Manga,
-   Ink,
-   Painterly,
-   Watercolor,
-   Low Poly,
-   PSX,
-   Pixel 3D,
-   Graphic,
-   Dreamlike.

Die Namen sind Preset-/Discovery-Cluster, keine unveränderlichen
technischen Definitionen.

Beispiel eines legitimen eigenen Profils:

``` text
3-band Cel
+ warme Schatten
+ realistischer Materialresponse
+ harte farbige Rims
+ keine schwarzen Outlines
+ rounded normals
+ painterly breakup
+ kräftiges Bloom
```

------------------------------------------------------------------------

# 110. Kanonische Stylized-Technique-Dimensionen

## Lighting

Lambert; Half-Lambert / wrapped diffuse; 2/3/4-band cel; Ramp Lighting;
Shadow Ramp; Gooch warm/cold; Anime Face SDF; X-Toon/2D Ramp;
MatCap/LitSphere; stylized ambient cube / colored bounce.

## Specular / Rim

material-aware specular; banded Blinn/Phong; anisotropic hair/fiber
highlight; painted highlight; MatCap highlight; soft Fresnel rim; hard
rim band; colored rim; per-light rim.

## Normals

smooth; faceted; rounded; bent/art-directed; canopy normals; upright
foliage normals; curvature exaggeration; spherical normal quantization.

## Geometry

vertex wobble; PSX snapping; squash/stretch; inflation; silhouette
exaggeration; low-poly faceting.

## Outlines / Ink

inverted hull; depth; depth+normal; curvature/crease; suggestive
contours; variable thickness; tapered ink; broken/dry-brush ink;
wobbling/boiling line.

## Palette / Print

gradient map; posterize; fixed palette; Bayer/ordered dither; blue-noise
dither; halftone/Ben-Day; screentone; crosshatch/tonal art maps;
monochrome manga.

## Reflections / Transmission

physical reflection; SSR; quantized reflection; painted/MatCap
reflection; physical refraction; screen-space UV distortion; fake
transmission; prism RGB split; rim transmission; thin-film/iridescence;
caustics.

## Texture Language

clean; graphic breakup; domain-warped hand-painted; brush field; hatch;
watercolor paper/granulation; procedural wear; edge wear; dirt masks.

## Post

bloom; grain; halftone; screentone; pixelate; color-depth reduction;
LUT; chromatic split; god rays; glitch/impact frame; speed lines.

------------------------------------------------------------------------

# 111. Stylized Darstellung pro Weltzustand

  -----------------------------------------------------------------------
  Zustand / Material                  mögliche stylisierte Sprache
  ----------------------------------- -----------------------------------
  Wasser                              depth bands, graphic foam, fake
                                      refraction, sparkles, stylized
                                      caustics

  Sand                                dune bands, wind ripples, graphic
                                      grains

  Matsch                              chunky relief, glossy puddle
                                      islands, footprints

  Feuer                               2--4 Farbbänder, harte Flame-Mask,
                                      cartoon sparks

  Glut                                emissive cracks + banded blackbody

  Rauch                               puffed/cloudlike masses, cel-banded
                                      density

  Dampf                               soft billboard / depth fade

  Lava                                harte Kruste + leuchtende Risse

  Eis                                 stylized cracks, edge transmission,
                                      inner glow

  Schnee                              soft caps, slope accumulation,
                                      sparkle

  Wolken                              sculpted masses, 2--4 Lichtbänder,
                                      hard silver lining

  Vegetation                          gradient leaves, toon normals,
                                      stylized wind

  Rost / Patina                       grafische Masks, harte
                                      Materialgrenzen

  Holz / Rinde                        hand-painted grain + curvature
                                      accents

  Beton / Putz                        graphic breakup + edge highlight

  Metall                              banded specular + painted
                                      reflection

  Glas / Kristall                     fake prism + edge glow

  Öl / Schleim                        iridescence + flow bands + blobs

  Säure                               emissive rim + bubbles + reactive
                                      surface

  Elektrizität                        tapered bolts, branching, pulse
                                      bands, glow

  Fell                                shell/card silhouette + banded
                                      fiber light

  Horn                                growth bands + anisotropy + rim
                                      transmission

  Schorf                              dry crust + cracks + peeling rim

  Blut                                glossy dark wet state → rough brown
                                      dry state

  Stoff                               stylized sheen + weave breakup +
                                      folds

  Leder                               pores + edge wear + stylized sheen
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 112. Wichtige Stylized-/NPR-Donoren und Referenzen

Die folgenden Quellen wurden in diesem Chat als besonders relevant
identifiziert. Der Eintrag ist **keine dauerhafte Lizenzgarantie**; vor
direkter Codeübernahme wird die konkrete Version erneut geprüft und
archiviert.

## Toon / Anime / Lighting

-   Three.js `MeshToonMaterial`, `OutlineEffect`, Toon/WebGPU-Nodes ---
    Three.js MIT
-   `OmarShehata/webgl-outlines` --- MIT
-   `kaze-mio/UnityGenshinToonShader` --- MIT
-   `Teeinn0730/AnimeToonShader` --- MIT
-   `NguyenDucThuan2209/AnimeShader` --- MIT
-   `xms0g/glToonShader` --- MIT
-   `lilxyzw/lilToon` --- MIT; großer Feature-Donor
-   Valve *Illustrative Rendering in Team Fortress 2* --- Paper /
    Technikreferenz
-   Gooch Shading --- Paper
-   X-Toon --- Paper / 2D Style-Ramp-Idee
-   Guilty Gear Xrd --- technische/visuelle Referenz, kein automatischer
    Copy-Donor

## Stylized Normals / Vegetation

-   `pajama-studio/ez-tree-toon` --- MIT
-   `James-Smyth/three-grass-demo` --- MIT
-   `achrefelouafi/GrassSystemThreeJS` --- MIT
-   `CK42BB/procedural-grass-threejs` --- Lizenz bei Integration erneut
    verifizieren

## Water / Foam / Bubbles

-   `achrefelouafi/WaterThreeJS` --- MIT
-   `jeantimex/threejs-water` --- MIT
-   Three.js Water / WebGPU Water / WebGPU Caustics --- MIT
-   Crest Ocean --- MIT, aber Algorithmus-/Port-Donor; Runtime selbst
    nicht WebGL
-   Defold stylized water / toon-water Repos --- Kandidaten; Lizenz
    erneut sichern
-   `m-ender/webgl-ripples` --- Ripple/Impact-Referenz
-   Ghibli-Water-/Foam-Breakdowns --- visuelle/Algorithmusreferenz

Kanonische Foam-Primitiven:

``` text
shoreline distance field
whitecap mask
bubble underlayer
impact / injected foam
feedback + dissipation
stylized ring breakup
```

## Fire / Smoke / Volumes

-   `mattatz/THREE.Fire` --- MIT
-   `neungkl/fire-simulation` --- MIT
-   `cpl121/fire-shader` --- MIT
-   `SqrtPapere/SmokeGL` --- MIT
-   `Donitzo/three.js-volume-renderer` --- MIT
-   `leoawen/volumetric-clouds` --- MIT

ShaderToy-/Blog-Flames bleiben Referenz, sofern keine separate
permissive Lizenz nachgewiesen ist.

## Surface Weather / Snow / Soil

-   `achrefelouafi/BasicProceduralBuilding` --- MIT
-   `achrefelouafi/GrassSystemThreeJS` / Soil Studio --- MIT
-   `achrefelouafi/SnowSystemThreeJS` --- MIT
-   `achrefelouafi/LinearAbiltyCastingThreeJS` / Elemental Sandbox ---
    MIT
-   `tuxalin/procedural-tileable-shaders` --- prozeduraler
    Toolkit-Kandidat; Lizenzversion archivieren

## SSS / AO / Optics

-   `wingstone/PreintegratedSubsurfaceScattering` --- MIT
-   Intel `GameTechDev/XeGTAO` --- MIT; ASSAO wird nicht neu integriert
-   `DerSchmale/threejs-thin-film-iridescence` --- MIT
-   Three.js Caustics / Transmission --- MIT
-   `shanecelis/water-demo` Caustics --- Lizenzpfad bei Übernahme
    archivieren

## Painterly / Print / Post

-   `glslify/glsl-halftone` --- MIT; Version prüfen
-   `pmndrs/postprocessing` --- zlib / Three.js
-   Real-Time Hatching / Tonal Art Maps --- Paper
-   Hertzmann Painterly Rendering --- Paper + Referenzimplementierungen
-   Edge Tangent Flow --- Algorithmusfamilie
-   Kuwahara / anisotropic Kuwahara --- Painterly-Technik
-   Curtis et al. Watercolor und art-directed watercolor ---
    Algorithmusreferenzen

------------------------------------------------------------------------

# 113. Lizenzklassen für die TechniqueRegistry

Zusätzlich zu `usageMode` wird jeder Donor in eine verständliche Klasse
eingeordnet.

## A --- permissiv direkt nutzbar / portierbar

Nur wenn die konkrete Version tatsächlich passend lizenziert ist: MIT,
BSD, Apache, ISC, Unlicense/Public Domain, CC0. Direkte Nutzung bleibt
provenance-pflichtig.

## B --- Port-/Algorithmus-Donor

Technik ist klar und wertvoll, aber anderer Stack, Runtime ungeeignet,
Assets getrennt lizenziert oder eigener kleiner Port sinnvoller.

## C --- Paper / visuelle / nicht-kopierbare Code-Referenz

Papers, Tutorials, ShaderToy ohne passende Einzellizenz, Gists ohne
Lizenzheader, Repos ohne Lizenz, ArtStation-Breakdowns, Foren-Snippets
mit unklarer Rechtekette.

## D --- nicht übernehmen

Kommerzielle Packs ohne passende Rechte, NC-/ND-Inhalte bei
inkompatibler Zielnutzung, Premium-Assets und explizit inkompatible
Lizenzen.

## Wichtige Korrekturen

### LYGIA

LYGIA ist technisch ein hervorragender Algorithmus-/Portability-Index,
aber **nicht pauschal MIT-freie Produktionsquelle**. Aktueller
Recherche-Stand: Prosperity/Patron-Modell. Standard:
`algorithm-reference`, nicht `direct`.

### Shadertoy

Shadertoy-Code ist **nicht pauschal frei kopierbar**. Lizenz pro
Shader/Autor prüfen. Ohne explizit passende Lizenz: `visual-reference`
oder `algorithm-reference`.

### Gists

Ein Gist ohne Lizenzheader ist keine Copy-Paste-Freigabe.

### FreeStylized

Projektverwendung öffentlicher Texturen ist erlaubt, aber unveränderte
Weiterverteilung der Assetbibliothek ist eingeschränkt. Lokal/gitignored
halten, Provenance erhalten, keine RAW-Spiegelung im öffentlichen Repo.

------------------------------------------------------------------------

# 114. Unvollständige Stylized-Nischen nach der großen Recherche

Die breite Recherche ist inzwischen **vollständig genug**, aber einige
Bereiche bleiben schwächer belegt:

-   Cartoon Foam / Splashes / Bubbles,
-   NPR Cloth/Fiber für Samt, Filz, Jeans, Wolle, Leder,
-   permissiver Horn/Keratin/Nail-Donor,
-   Feather NPR,
-   stylized Skin Stack inklusive Scar/Wound/Dryness,
-   Cartoon Cloud Geometry,
-   stylized Destruction Language,
-   thick Cartoon Fluid Shapes / Jelly / Strings,
-   Weather Interaction über Fell/Stoff/Glas/Schlamm/Frost hinweg,
-   Painterly Brush Field,
-   Watercolor Bleeding / Granulation,
-   Ink / Brush Outlines mit Taper/Breakup,
-   stylized GI / Colored Bounce,
-   stylized Transparency,
-   Style-preserving LOD.

Diese Liste ist **kein Auftrag, endlos weiterzusuchen**. Sie markiert
nur Stellen mit noch überproportionalem Nutzen.

------------------------------------------------------------------------

# 115. Style Discovery ist gerade deshalb Pflicht, weil der gewünschte Stil unbekannt ist

Der Nutzer muss **nicht vorher wissen**, welcher der gesammelten Shader
gefällt. Diese Unsicherheit ist Produktinput.

Die fremden Shader sind kein Menü:

``` text
Shader A / Shader B / Shader C → Nutzer wählt einen
```

Sondern ein Teilelager:

``` text
A liefert interessante Schatten
B liefert besseren Rim
C liefert bessere Normals
D liefert bessere Palette
E liefert bessere Foam-Sprache
↓
SHADED komponiert eigenes StyleProfile
```

Der Style-Discovery-Modus soll zunächst komplette Varianten blind
vergleichen und danach einzelne Dimensionen isolieren.

> **Der richtige Zielstil muss entdeckt werden, nicht vorab benannt
> werden.**

------------------------------------------------------------------------

# 116. Konkreter Sandbox-Stand aus diesem Chat

Im SHADED-Repo wurde im Rahmen dieses Chats eine echte
Sandbox-Vertikalscheibe auf dem Materialbibliothekszweig aufgebaut.

Implementierungsstand zum Zeitpunkt dieser Referenz:

-   Branch `feat/freestylized-material-library`
-   lokaler FreeStylized-Importer
-   Branch `feat/shaded-sandbox`
-   PR `#76` --- viewport-first shader sandbox
-   Integration in die neue SHADED-Workbench / Editor-Shell
-   WebGL2 / GLSL ES 3.00
-   echte Browser-/Chromium-Verifikation
-   Desktop-Drawer + Mobile-Bottom-Drawer
-   HQ / Balanced / Fast Sandboxbudgets
-   Orbit / Zoom / Vollbild / Pause
-   Preset-Export `shaded.sandbox.effect.v1`
-   lokaler FreeStylized-Albedo-/Roughness-Hook
-   isolierter Vertrag: kein `classGrid`-Write, keine Hauptszene
    mutieren

Erste Live-Modi:

-   water,
-   ice/frost,
-   sand,
-   mud,
-   dry soil/cracks,
-   wet surface/puddles,
-   snow,
-   moss,
-   lava,
-   fire,
-   smoke,
-   steam,
-   fog,
-   volumetric cloud,
-   hologram,
-   dissolve/burn.

Diese Slice ist **nicht** die endgültige Architektur pro Element.
Sand-Material, Sand-Terrain, Granular-Simulation, Partikel und Sediment
sind getrennte Systeme. Water Surface, Coast/Foam, Fluid Simulation,
Particles und Optics/Caustics ebenfalls.

Der nächste Ausbau soll daher spezialisierte Labs besitzen statt immer
mehr Effektknöpfe in einen monolithischen Shader zu packen.

------------------------------------------------------------------------

# 117. Forschungsschwelle: wann die breite Suche beendet ist

Die Sammlung ist breit genug, wenn für jede große Technikfamilie
mindestens vorhanden ist:

``` text
1 permissiver Donor ODER frei implementierbarer Algorithmus
+
1 stilisierte Referenz
+
1 realistische Referenz
+
1 plausibler Mobile-Fallback
```

Danach ist weitere Recherche nur noch gezielt erlaubt, wenn eine
Capability fehlt, ein Donor rechtlich ungeeignet ist, ein
Mobile-Fallback qualitativ scheitert oder ein Benchmark eine konkrete
Lücke zeigt.

Die nächste Phase lautet dann nicht:

> noch mehr coole Shader finden.

Sondern:

> **Donors auditieren, Primitive extrahieren, benchmarken und in
> StyleProfiles kombinierbar machen.**

------------------------------------------------------------------------

# 118. Abschluss

SHADED soll nicht durch immer größere Modelle versuchen, Unsicherheit zu
verstecken.

Es soll Unsicherheit **strukturieren**.

Erst feststellen:

> Was kann ich aus diesem Material wirklich räumlich behaupten?

Dann:

> Welche primitive Welt erklärt diese Aussagen?

Dann:

> Welche zusätzlichen Beobachtungen machen Unsicherheit kleiner?

Dann:

> Welche Provider können gezielt einzelne Lücken füllen?

Dann:

> Welche Details muss Geometrie wirklich tragen?

Und erst danach:

> Wie soll diese Welt aussehen?

BEUTELTIER erweitert dieses Prinzip lediglich von:

> **einem Bild → einer kleinen Welt**

zu:

> **vielen lokal begründeten kleinen Welten → einem durch Constraints
> verbundenen großen Raumgraphen.**

Das Provider-Labor widerspricht diesem Ansatz ebenfalls nicht.

Im Gegenteil:

> Solange noch nicht bekannt ist, welches Verfahren auf welcher Stufe
> nützlich ist, wäre das Nicht-Testen der Provider die stärkere
> Vorannahme.

Die Methode bleibt absichtlich falsifizierbar.

Wenn ein Teil nicht trägt, wird er verworfen oder korrigiert.

Aber kein großer Name, kein moderner Benchmark und kein Agent erhält das
Recht, die Problemstellung still in eine vertrautere Form umzuschreiben.

**Die Welt wird von grob nach fein erschaffen.\
SHADED soll sie in derselben Abhängigkeitsrichtung wieder aufbauen.**
