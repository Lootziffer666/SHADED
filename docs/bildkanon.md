# SHADED Bildkanon – Der Weltbau-Vertrag

**Status: VERBINDLICH.** Dieser Kanon ist ein Vertrag zwischen Bilderzeugung und
Engine: Bilder, die ihn einhalten, werden vollautomatisch korrekt analysiert –
ohne KI, ohne Overlay. Der Analyse-Code DARF sich auf diese Regeln verlassen;
die Bild-Pipeline MUSS sie liefern. Verstöße sind kein Absturz, sondern
degradieren kontrolliert (Heuristik + Marker-Overlay als Eskalation).

> Prinzip: Aus „Was könnte das sein?“ wird „Entspricht es dem Muster,
> das der Kanon garantiert?“

## K1 – Häuser sind Fachwerkhäuser
Jedes Gebäude zeigt Fachwerk: dunkle Holzbalken auf hellem Putz (oder helle
Felder in dunklem Gebälk). Die Balken-auf-Putz-Signatur ist das maschinen-
lesbare Erkennungszeichen für „Gebäude“.

## K2 – Dächer sind gedeckte Schrägen
Dächer bestehen aus sichtbaren Ziegel-/Schindel-/Schieferreihen (periodische
Struktur) und sitzen oberhalb von Fachwerk. Farbe frei (Terracotta, Schiefer …),
Struktur Pflicht.

## K3 – Fenster sind IMMER von Holz umrahmt
Ein Fenster ist eine Nicht-Holz-Füllung (Blauglas, Grauglas, warm erleuchtet,
dunkel) in einem GESCHLOSSENEN Holzrahmen. Der Rahmen ist der Erkennungsanker.
Sprossenfenster sind mehrere gerahmte Füllungen nebeneinander.

## K4 – Glas ohne Rahmen = kein Fenster
Helle Reflexe auf Planken, Ziegeln oder Steinen haben keinen geschlossenen
Holzrahmen und werden NIEMALS als Fenster interpretiert. (Die Negativregel,
die falsche Nachtlichter formal verbietet.)

## K5 – Türen sind Holz mit Bodenkontakt
Türen sind holzgefüllte Öffnungen, die den Boden/eine Treppe berühren.
Sie sind KEINE Fenster und leuchten nachts nicht von selbst.

## K6 – Alles Bedeutsame ist dunkel konturiert
Der Stil umrandet Objekte mit dunklen Linien. Die Analyse behandelt dünne
dunkle Konturen als NEUTRAL (weder Boden- noch Gebäudebeweis).

## K7 – Boden ist verankert, Himmel ist oben
Begehbarer Boden (Pfad/Gras/Wasser) hängt zusammen und ist nie vollständig
von Dach umschlossen. Falls Himmel im Bild ist, berührt er die Bildoberkante,
ist blau-dominant und hell – und ist INERT: kein Wasser, keine Pfützen,
kein Vegetations-Schwanken. Bevorzugt sind Szenen ohne Himmel (Top-Down/Iso).

## K8 – Fenster sind die Warmlichtquellen der Nacht
Nachts leuchten Fenster (und aktive Feuer) – sonst nichts. Tagsüber sind
Fenster Glas (dunkel/blau/spiegelnd) oder neutral.

## Eskalationsleiter (wenn ein Bild vom Kanon abweicht)

1. **Kanon-Detektoren** (Rahmen-Fenster, Fachwerk-Signatur, Himmel-Regel)
2. **Farb-Heuristik + Struktur-Pass** (Bodenanker etc.) als Fallback
3. **Marker-Overlay**: Szenen-Kopie, Pink = Fenster, Palettenfarben =
   lokale Klassen-Korrektur (Nutzer-Ansage schlägt alles)
4. **Volle Material-Map** in kanonischer Palette

## Referenz-Belege im Repo

- `file_00000000c40471f4859a10d6bf3ac39b.png` – Kanon-Dorf top-down
  (Fachwerk, Holzrahmen-Blauglas, Schiefer- UND Terracotta-Dächer)
- `file_00000000723471f48a11eaa8371edfb7.png` – Kanon-Dorf perspektivisch
  MIT Himmel (Testfall für K7)
- `file_00000000974871f49fe71f6b456f9579.png` – Dorf mit warm erleuchteten
  Rahmenfenstern (K3/K8)
