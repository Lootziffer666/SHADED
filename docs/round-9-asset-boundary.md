# Runde 9 – Asset-Boundary

Fortsetzung von `docs/round-8-asset-boundary.md`, gleiche Regel: kein
Original-Asset aus Drittspielen erreicht dieses Repository oder diese
Entwicklungs-Session — auch nicht transient, auch nicht nur zur
Identifikation.

## Was recherchiert wurde (öffentliche Quellen, keine Nutzerdateien)

- **DREAMM**: CPU-Vollemulator, benötigt (anders als ScummVM) sogar die
  originale `.EXE`. Präzedenzfall, der genau zu dieser Architektur
  passt: die "Ultimate Talkie"-Editionen sind Fan-Patches, die eine
  vom Nutzer bereitgestellte legale Originalkopie erweitern, ohne je
  LucasArts-eigene Assets weiterzugeben.
- **ScummVMs eigener Quellcode** (`engines/scumm/resource.cpp`)
  geprüft: enthält *keine* Kostüm-ID→Charaktername-Tabelle. Zitat aus
  dem Code selbst: *"Names of rooms. Maybe we should put them into a
  table, for use by the debugger?"* — selbst das ausführlichste
  Open-Source-SCUMM-Projekt hat diese Zuordnung nie öffentlich
  tabelliert. Raumnamen dagegen liegen in der RNAM-Tabelle der Spieldatei
  selbst vor (strukturelles Faktum, kein künstlerischer Inhalt) und
  wurden dafür bereits in Runde 8 sicher ausgelesen.
- **SCUMM-COST-Formatbeschreibung**: keine autoritative, byte-genaue
  öffentliche Spezifikation gefunden (nur verlustbehaftete
  Sekundärzusammenfassungen). Deshalb: Header/Chunk-Struktur mit hoher
  Zuversicht implementiert, Pixel-RLE-Codec als ausdrücklich
  experimentell gekennzeichnet und nur gegen selbstgebaute
  Testdaten abgesichert (siehe `tools/test-cost-format.mjs`).

## Warum "schnell einzeln ein-/ausblenden, um es zu erkennen" nicht anders behandelt wird

Das Ergebnis (ein Name statt einer Bilddatei) ändert nichts am
zugrunde liegenden Schritt: reale Sprite-Pixel aus der Originaldatei
werden dekodiert und angesehen, um sie zu erkennen — unabhängig davon,
ob das Ergebnis danach verworfen wird. Diese Runde verschiebt genau
diesen einen Schritt (Kostüme ansehen und benennen) auf die
Nutzer-Maschine (`tools/costume-browser.html`, vollständig offline)
und beschränkt sich selbst auf das, was danach übrig bleibt: Namen,
Zahlen, Positionen.

## Was diese Runde nie verarbeitet hat

Keine ZIP-, `.000/.001`-, `.EXE*- oder ROM-Datei wurde in dieser
Session heruntergeladen, geöffnet oder dekodiert. Alle Cel-/Chunk-/
Header-Tests laufen ausschließlich gegen selbst erzeugte, synthetische
Fixtures (siehe `tools/test-cost-format.mjs`,
`tools/verify-costume-browser.js`).
