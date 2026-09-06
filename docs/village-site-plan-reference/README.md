# Village Site-Plan Reference

Eigene Bilder des Maintainers (nicht fremdlizenziert). Drei annotierte,
isometrische Village-Site-Pläne mit eingebrannten Beschriftungen:

- `site-plan-en-v1.png`, `site-plan-en-v2.png` — englische Beschriftung,
  Gebäude-Positionsnamen (`BUILDING N (LEFT-TOP/RIGHT-TOP/…)`), Feature-Labels
  (Cobblestone Paths, Grass, Boulders, Deciduous/Purple Blossom Trees, Sign
  Post), Maßstabsbalken (0/5/10 m).
- `site-plan-de-anschluss.png` — deutsche Variante mit anderer Struktur:
  `BAUFLÄCHE A–F (Blg. N, Position)`, Infrastruktur-/Erschließungsvokabular
  (`ANSCHLUSS NORD-WEST`, `ANSCHLUSS SÜD-WEST`, `Y-FÖRMIGE HAUPT-
  INFRASTRUKTURTRASSE`, `ORIENTIERUNGS-/INFORMATIONSSIGNAL`), Waldrand-/
  Vegetationszonen (`FORSTSAUM/SCHUTZWALD`, `FINDSCHUTZGEHÖLZE`), Kompassrose.

## Ausdrücklich NICHT das, wofür sie zuerst gehalten werden könnten

Das sind **keine blinden Rekonstruktions-Fixtures** wie die `VLG-0X`-Einträge
in [`docs/fixture-taxonomie.md`](../fixture-taxonomie.md). Deren Witz ist,
Struktur aus mehrdeutiger 2D-Evidenz zurückzugewinnen — hier steht die
„Lösung" (Gebäudepositionen, Maßstab, Erschließung) schon als Text im Bild.
Als Testfall für einen Solver sind sie dadurch entwertet.

## Wofür sie tatsächlich verwendet werden

1. **`shaded-living` (Geometry/Spatial Construction module) REFERENCE.md, Abschnitt 5 (PREPARE FOR EXTENSION):**
   `site-plan-de-anschluss.png` ist ein konkretes Beispiel für das dort
   abstrakt beschriebene Vokabular — „Fluchtlinien, Anschlusskanten … Stellen
   für den Repräsentationswechsel" wird hier real als
   `ANSCHLUSS NORD-WEST`/`ANSCHLUSS SÜD-WEST` und
   `Y-FÖRMIGE HAUPTINFRASTRUKTURTRASSE` benannt.
2. **`docs/fixture-taxonomie.md`, Notation-Referenz:** Positions-Namenskonvention
   (`LEFT-TOP`/`RIGHT-TOP`/… bzw. `Blg. N, Position`) und ein echter
   Maßstabsbalken — beides fehlt den bestehenden VLG-Fixtures dort bisher
   komplett (Skalierung ist für sie laut Taxonomie noch ungemessen).

Beide Verweise sind Verweise auf diese Bilder, keine Kopie ihres Inhalts in
Prosa — bei Änderungen an dieser README auf Konsistenz mit den beiden
Zielstellen prüfen.
