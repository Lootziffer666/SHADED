---
name: shaded-spatial-primitive-solver
description: AKTIV. Verifizierter Eintrittspunkt in SHADEDs Room Reconstruction aus einem einzelnen Bild: klassische Single-View-Metrologie, operatorbasierter Zwei-Phasen-Solver und pixelbasierte Cultivation. Bei Rekonstruktion einfacher strukturierter Körper bzw. bei der Prüfung geometrischer Bild-Evidenz vor teureren Depth-/ML-Verfahren verwenden.
---

# SHADED Spatial Primitive Solver

**Status: AKTIV.** Dieser Skill liegt unter `.claude/skills/` und soll vom Harness geladen und bei passender Rekonstruktionsarbeit verwendet werden.

Die vollständige, unveränderte Methodik und Versuchshistorie liegt in `REFERENCE.md` im selben Skill-Verzeichnis. **Vor Anwendung dieses Skills `REFERENCE.md` vollständig lesen und dessen harte Regeln, Grenzen, Verifikationspflichten und dokumentierte Fehlversuche beachten.** Die dort noch enthaltene historische Kennzeichnung „INAKTIV“ beschreibt ausschließlich den früheren Ablagezustand und ist seit dieser Aktivierung nicht mehr maßgeblich.

Dieser Skill ergänzt `shaded-reconstruction`; er ersetzt dessen Provenienz-, Provider- oder Pipeline-Verträge nicht. Gemessene 2D-Evidenz bleibt `MEASURED`; daraus regelbasiert erzeugte 3D-Geometrie ist `RECONSTRUCTED`.