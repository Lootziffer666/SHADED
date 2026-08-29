#!/usr/bin/env python3
"""Regressionstest fuer tools/single_view_room.py (Exp. 4,
docs/first-glimpse-depth-layers.md).

Drei Faelle, die zusammen die Verallgemeinerung von Version 1.0.0 (fest auf
messehalle.png/1103x1426 verdrahtete Pixel-Suchfenster) auf Version 1.1.0
(bild-relative Suchfenster + resolutionsskalierte Bodenraster-Schwellen)
beweisen -- nicht nur behaupten:

1. messehalle.png (Referenzbild, skala_h == 1): alle Kernmesswerte muessen
   exakt (enge Toleranz fuer Float-Rundung) den Werten entsprechen, die
   Version 1.0.0 mit den damals hart verdrahteten Pixelwerten lieferte.
   Das beweist, dass `deklinieren()`/`skala_h` bei skala_h == 1 auf die
   alten Formeln reduziert -- keine stille Verhaltensaenderung.
2. Ein 2x-Resize von messehalle.png: die erwartete Brennweite verdoppelt
   sich (Kamera/Optik unveraendert, nur Pixelraster feiner). Ohne die
   Skalierung von `bodenraster()`s internen FFT-/Autokorrelations-
   Schwellen (skala_h) fand ein frueherer Testlauf hier die FALSCHE
   Periode: 1119 px statt der erwarteten ~1936 px. Dieser Test haelt das
   als Regression fest.
3. Ein Nicht-Manhattan-Bild (SHADEDs eigenes isometrisches Testbild):
   `vermessen()` darf NIE abstuerzen, und die "Deckenhoehe > 0"-
   Plausibilitaetsguard muss greifen -- ein Konvergenzergebnis mit zu
   wenigen tragenden Linien fuer ein Manhattan-Zentralperspektive-Bild
   darf keine erfundene (negative) Deckenhoehe als MEASURED ausgeben,
   sondern muss auf UNKNOWN (None mit Begruendung) degradieren.

Aufruf: python3 tools/test-single-view-room.py
"""
import json
import os
import sys
import tempfile

import numpy as np  # noqa: E402

sys.path.insert(0, os.path.dirname(__file__))
import single_view_room as svr  # noqa: E402
from PIL import Image  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MESSEHALLE = os.path.join(REPO, "content", "raum", "messehalle.png")
ISOMETRISCH = os.path.join(REPO, "file_00000000974871f49fe71f6b456f9579.png")

failed = False


def check(name, ok, detail=""):
    global failed
    status = "PASS" if ok else "FAIL"
    print(f"  {'✓' if ok else '✗'} {status}: {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        failed = True


def nahe(a, b, rel_tol):
    if a is None or b is None:
        return False
    return abs(a - b) <= rel_tol * abs(b)


print("=== SHADED single_view_room.py Regressionstest (Exp. 4) ===\n")

print("Test 1: messehalle.png (Referenzaufloesung, skala_h == 1) reproduziert die")
print("Version-1.0.0-Messwerte exakt -- deklinieren()/skala_h aendert bei skala_h == 1 nichts.")
rgb, lum, bericht = svr.vermessen(MESSEHALLE, 0.6)
check("status == measured", bericht.get("status") == "measured", bericht.get("status"))
fp = bericht.get("fluchtpunkt", {})
check("Fluchtpunkt x ≈ 665.91", nahe(fp.get("x"), 665.9101396404584, 1e-6), fp.get("x"))
check("Fluchtpunkt y ≈ 464.82", nahe(fp.get("y"), 464.8243734679978, 1e-6), fp.get("y"))
dh = bericht.get("deckenhoehe_je_kamerahoehe") or {}
check("Deckenhoehe/h ≈ 0.2759 (Spiegelprobe bestaetigt)",
      nahe(dh.get("wert"), 0.2759131479006385, 1e-6), dh.get("wert"))
br = bericht.get("bodenraster") or {}
f_px_ref = br.get("f_px")
check("Bodenraster f_px ≈ 967.77", nahe(f_px_ref, 967.7656440937235, 1e-6), f_px_ref)
check("Stuetzen: 9 gefunden", (bericht.get("stuetzen") or {}).get("anzahl") == 9,
      (bericht.get("stuetzen") or {}).get("anzahl"))

print("\nTest 2: 2x-Resize von messehalle.png -- Brennweite muss sich VERDOPPELN.")
print("(Ohne die skala_h-Skalierung der bodenraster()-internen FFT-Schwellen fand ein")
print("frueherer Lauf hier faelschlich 1119 px statt ~1936 px -- das war der empirische")
print("Beweis, dass diese Werte NICHT resolutionsunabhaengig sind.)")
with tempfile.TemporaryDirectory() as td:
    img = Image.open(MESSEHALLE)
    img2x = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    pfad_2x = os.path.join(td, "messehalle_2x.png")
    img2x.save(pfad_2x)
    rgb2, lum2, bericht2 = svr.vermessen(pfad_2x, 0.6)
    check("2x: status == measured", bericht2.get("status") == "measured", bericht2.get("status"))
    br2 = bericht2.get("bodenraster") or {}
    f_px_2x = br2.get("f_px")
    erwartet = (f_px_ref or 0) * 2
    check(f"2x: f_px ≈ 2x Referenz (erwartet ~{erwartet:.0f} px, Toleranz 10 %)",
          nahe(f_px_2x, erwartet, 0.10), f_px_2x)

print("\nTest 3: nicht-Manhattan-Bild (isometrische Illustration) -- kein Absturz, und die")
print("Deckenhoehen-Plausibilitaetsguard degradiert eine unplausible Zahl zu UNKNOWN statt")
print("sie als MEASURED auszugeben (Aufgabe 12: 'Richtig geraten ist nicht gemessen').")
try:
    rgb3, lum3, bericht3 = svr.vermessen(ISOMETRISCH, 0.6)
    crashed = False
except Exception as e:  # noqa: BLE001 -- genau das soll dieser Test verhindern
    crashed = True
    bericht3 = {}
    print(f"  Ausnahme: {e}")
check("kein Absturz", not crashed)
if not crashed:
    raum = bericht3.get("raum_je_kamerahoehe") or {}
    check("Deckenhoehe wird NICHT als Zahl ausgegeben (UNKNOWN statt geraten)",
          raum.get("deckenhoehe") is None, raum.get("deckenhoehe"))
    check("Stuetzenraster wird NICHT als Zahl ausgegeben (UNKNOWN statt geraten)",
          raum.get("stuetzenreihen_abstand") is None, raum.get("stuetzenreihen_abstand"))

print("\nTest 4: Bild ganz ohne Kanten (flaechige Farbe, keinerlei Gradient) -- muss den ECHTEN status=\"declined\"-")
print("Pfad erreichen (Test 3 oben erreicht nur den Plausibilitaets-Degrade-Pfad, nicht diesen).")
print("Der Bericht muss trotzdem ALLE erwarteten Top-Level-Felder tragen (wenn auch als None) --")
print("das ist genau der Vertrag, den die 'IMMER ein strukturierter Bericht'-Zusicherung im")
print("Docstring verspricht; vor dem Fix war der Bericht im declined-Fall nur {status, grund}.")
ERWARTETE_FELDER = {
    "status", "fluchtpunkt", "hauptpunkt", "wand_boden_fuge", "wand_decken_fuge",
    "deckenhoehe_je_kamerahoehe", "leuchtbaender", "spiegelprobe", "stuetzen",
    "raster", "bodenraster", "massstab", "raum_je_kamerahoehe", "raum_meter",
    "nicht_messbar",
}
with tempfile.TemporaryDirectory() as td:
    # WICHTIG: Zufallsrauschen ist HIER die falsche Wahl -- es hat zwar keine echten
    # Kanten, aber genug zufaellige lokale Gradienten-Variation, dass Hough trotzdem
    # >=6 "Linien" ueber der Schwelle findet (per Versuch bestaetigt, nicht vermutet:
    # ein erster Entwurf mit rng.random(...) erreichte status="measured" mit lauter
    # Zufallstreffern statt "declined"). Eine WIRKLICH flaeche Flaeche (kein Gradient
    # ueberhaupt) ist der richtige Fall fuer "zu wenige konvergierende Linien".
    flaeche = np.full((300, 400, 3), 128, dtype=np.uint8)
    pfad_flaeche = os.path.join(td, "flaeche.png")
    Image.fromarray(flaeche, mode="RGB").save(pfad_flaeche)
    try:
        _, _, bericht4 = svr.vermessen(pfad_flaeche, 0.6)
        crashed4 = False
    except Exception as e:  # noqa: BLE001
        crashed4 = True
        bericht4 = {}
        print(f"  Ausnahme: {e}")
    check("kein Absturz", not crashed4)
    if not crashed4:
        check("status == declined (der echte fruehe Ausstieg, nicht nur ein Degrade)",
              bericht4.get("status") == "declined", bericht4.get("status"))
        check("grund ist ein nicht-leerer String", bool(bericht4.get("grund")), bericht4.get("grund"))
        fehlend = ERWARTETE_FELDER - set(bericht4.keys())
        check("alle erwarteten Top-Level-Felder vorhanden (kein KeyError fuer Aufrufer)",
              not fehlend, f"fehlend: {fehlend}" if fehlend else "vollstaendig")

print()
print("❌ test-single-view-room FAILED" if failed else "✅ test-single-view-room PASSED")
sys.exit(1 if failed else 0)
