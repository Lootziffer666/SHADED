# Runde 8 – Wally-Monokel: Design

## Architektur

```
Tasten 1..5 (Stans Controller)  ──► lensState (0..5, JS-Modulscope)
                                      │
SHADED.lens.set(n)/.get() ───────────┤
                                      ▼
Shader: u_lens-Uniform, EIN Block ganz am Ende von main() (nach der
vollen Komposition — jede Linse sieht dieselbe fertige Welt wie das
Normalbild, keine Sonderpfade weiter oben im Shader nötig).
  u_lens<1.5 → Linse 1: grey + trail.b*1.4 + u_touchWear*0.6 (amber)
  u_lens<2.5 → Linse 2: grey + u_pressureDim*3.0            (rot)
  u_lens<3.5 → Linse 3: grey + texture2D(u_sound,uv).r        (cyan)
  u_lens<4.5 → Linse 4: col unverändert ("der stabile Shader")
  sonst      → Linse 5: |∇maskA| + |∇maskB| (reine Kanten, s/w)

Klang-Wellenfeld (neu, Unit 8) — exakt dasselbe Idiom wie die
Trail-Textur (Runde 4): persistentes Uint8Array, dirty-Upload,
Stempel-Funktion + Zeit-basierter Decay. EIGENE Textur statt
Trail-Kanal-Wiederverwendung, weil alle 4 Trail-Kanäle bereits belegt
sind (R Delle, G Impuls, B Pfad, A Brand) und Klang konzeptionell
nichts mit Bodenkontakt zu tun hat.
  SND=256 (kleiner als Trail, da nur ein Kanal gebraucht wird)
  soundStamp(u,v,strength) — Kreisstempel, wie trailStamp
  soundTick(dt)            — Decay mit k=exp(-d*1.98) ⇒ HWZ ≈ 0.35s
  soundUpload()             — dirty-Flag-Upload, wie trailUpload
  SHADED.sound.emit(u,v,strength) — öffentliche API für künftige
    Dialog-/Story-Trigger (z. B. eine Beleidigung feuert einen Stempel)
```

## Warum Linse 4 nichts tut

Das Prolog-Skript löst das Finger-Rätsel auf 4 und sagt explizit: die
Zahl ordnet die Zustände "zu einer konsistenten Welt" — sie IST das
normale, voll komponierte SHADED-Bild, nicht eine weitere Sonderansicht.
Technisch bedeutet das: der `u_lens<4.5`-Zweig lässt `col` unverändert.
Das ist keine Lücke, sondern die Pointe — verifiziert durch
`verify-lenses.js` (meanAbsDiff(Linse 4, Normalbild) < 2.0).

## Wieso keine neue Textur-Abstraktion für Linse 1/2

Schmutz/Abnutzung (Linse 1) und Belastung (Linse 2) haben in SHADED
bereits lebendige State-Quellen (`trail.b`, `u_touchWear`,
`u_pressureDim` aus Runde 4 / Phase C). Die Linsen lesen diese direkt
statt sie zu duplizieren — konsistent mit dem Weltgesetz-Prinzip
"Shader sind nicht lokal, Shader sind ansteckend" (ein State, mehrere
Ansichten).

## Was diese Runde NICHT baut

- Keine Dialog-/Verb-/Inventar-Engine (Guybrush, Stan, Wally als
  spielbare Figuren, Sarg-Rätsel, Elf-Karten-Rätsel). Das braucht
  zuerst einen Loader für nutzereigene Sprite-/Raum-/Audio-Assets.
- Keine echten Audiodaten oder Melodien. `sound.emit()` ist ein reines
  visuelles Stempel-Primitiv; eine tatsächliche Audiowiedergabe (des
  Original-Themes oder von Sprachzeilen) ist bewusst Sache des Nutzers
  auf seinem eigenen Rechner, mit seinen eigenen Dateien.
- Keine Extraktion, kein Import und kein Commit von Original-Assets
  aus Drittspielen. Siehe `docs/round-8-asset-boundary.md`.

## Kalibrierungs-Fakten (rein strukturell, aus eigener Inventur gewonnen)

SCUMM v5 Standardkanvas: 320×200 (öffentliches Engine-/Plattformwissen,
nicht extrahiert). Ressourcen-Größenordnung realer SCUMM-v5-Kopien
(Format-/Zähldaten, keine Inhalte) siehe
`docs/round-8-asset-boundary.md` — informiert nur die Dimensionierung
eines künftigen Asset-Loaders (Anzahl erwartbarer Kostüme/Räume/Sounds
pro Spiel), nicht diese Runde selbst.

## API-Erweiterung (`window.SHADED`, additiv)

`lens:{set(n), get()}`, `sound:{emit(u,v,strength), clear()}`.
