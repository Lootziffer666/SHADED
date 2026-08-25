#!/usr/bin/env python3
"""Aus dem Raummodell die Folgeartefakte erzeugen.

    room.json  ->  _depth.png        Companion-Tiefenkarte fuer SHADED (2.5D)
               ->  .pointcloud.json  metrische Punktwolke
               ->  -overlay.png      Rueckprojektion als Sichtbeweis
               ->  .hall.json        schlanker Bauplan fuer BEUTELTIER

Die Tiefenkarte entsteht NICHT aus einem Schaetznetz, sondern aus der
vermessenen Geometrie: jeder Bildpunkt wird gegen Boden, Decke, Rueckwand
und Stuetzenkoerper geschnitten. Sie ist damit exakt, nicht plausibel --
Ebenen bleiben eben, Kanten bleiben Kanten.

Die Rueckprojektion ist der eigentliche Beweis: das Modell wird mit
derselben Kamera wieder ins Bild gezeichnet. Trifft es die Fugen, die
Stuetzen und die Wandkanten, stimmt die Messung. Trifft es sie nicht,
sieht man sofort, wo.
"""

import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw


def modell_laden(pfad):
    """Laedt ein .room.json in metrische Groessen.

    single_view_room.py liefert seit der INFERRED-Erweiterung nicht mehr
    garantiert lauter Zahlen -- ein Feld, das nicht gemessen werden konnte,
    steht als None im Bericht, statt den ganzen Lauf abzubrechen. Fehlende
    Werte werden hier durch dokumentierte 0-Platzhalter ersetzt: das
    entfernt die Struktur, die nicht gemessen wurde (keine Stuetzen im Feld,
    kein Fliesenmuster), erfindet aber keine Zahl. Der Punktwolke/Tiefen-
    Erzeugung darunter reicht das, um trotzdem zu laufen -- die Herkunft
    jedes Felds steht bereits ehrlich im .room.json selbst.
    """
    m = json.load(open(pfad))
    b = m["messung"]

    def g(x, default=0.0):
        return default if x is None else x

    h = b["massstab"]["kamerahoehe_m"]
    if h is None:
        # Kein Anker trug -- ohne Kamerahoehe gibt es keine Meter, nur Pixel.
        # 1.0 m ist ein dokumentierter Notbehelf (keine Messung), damit
        # wenigstens eine Geometrie in EINER Einheit entsteht.
        h = 1.0
    return {
        "quelle": m["quelle"],
        "ppx": b["hauptpunkt"]["x"],
        "ppy": b["hauptpunkt"]["y"],
        "f": b["bodenraster"]["f_px"],
        "h": h,                                     # Kamerahoehe ueber Boden
        "hc": b["deckenhoehe_je_kamerahoehe"]["wert"] * h,   # Decke ueber Kamera
        "z_wand": g(b["raum_je_kamerahoehe"]["rueckwand_tiefe"]) * h,
        "fliese": g(b["bodenraster"]["fliesenbreite_je_h"]) * h,
        "fliese_phase_x": g(b["bodenraster"]["phase_seite_k"]) * h,
        "fliese_phase_b": g(b["bodenraster"]["phase_tiefe_b"]),
        "st_breite": g(b["raster"]["stuetzenbreite_je_h"]) * h,
        "st_reihen": [x * h for x in b["raster"]["reihen_x_je_h"]],
        "st_joch": b["bodenraster"]["f_px"] * g(b["raster"]["tiefenteilung_1_durch_v"]) * h,
        "stuetzen": b["stuetzen"]["liste"],
        "baender": [bb["x_je_h"] * h for bb in b["leuchtbaender"]["liste"]],
        "band_teilung": g(b["leuchtbaender"].get("teilung_je_h"), 1.0) * h,
        "messung": b,
    }


def stuetzen_welt(M):
    """Stuetzen als (X, Z) in Metern -- aus Bildbreite und Fusspunkt.

    Beide Wege stehen zur Verfuegung und muessen dasselbe sagen; genommen
    wird der Fusspunkt, weil er direkt auf der Bodenebene sitzt.
    """
    aus = []
    for s in M["stuetzen"]:
        v = s["v"]
        if v <= 0:
            continue
        Zv = M["f"] * M["h"] / v           # Tiefe der VORDERKANTE
        X = (s["x_mitte"] - M["ppx"]) * Zv / M["f"]
        aus.append((X, Zv + M["st_breite"] / 2.0, s["breite_px"] * Zv / M["f"]))
    return aus


def gitter_stuetzen(M):
    """Das REGELMAESSIGE Raster, auf das die gemessenen Stuetzen fallen.

    Gebaut wird nicht die Streuung der Einzelmessung, sondern das Raster,
    das sie belegt -- und nur so weit, wie das Bild reicht. Seitlich
    daneben steht nichts: dort ist nichts gemessen.
    """
    reihen = M["st_reihen"]
    joch = M["st_joch"]
    gemessen = stuetzen_welt(M)
    aus = []
    for xr in reihen:
        tiefen = [Z for X, Z, _ in gemessen if abs(X - xr) < 0.30 * abs(xr - 0) + 0.9]
        if not tiefen:
            continue
        z0 = min(tiefen)
        n = 0
        while z0 + n * joch < M["z_wand"] - 0.4:
            aus.append((xr, z0 + n * joch))
            n += 1
        # auch nach vorne bis an die Kamera
        n = 1
        while z0 - n * joch > 0.8:
            aus.append((xr, z0 - n * joch))
            n += 1
    return sorted(aus, key=lambda t: t[1])


def tiefenfeld(M, W, H):
    """Fuer jeden Bildpunkt die Tiefe Z (in Metern) der ersten Flaeche."""
    xs = np.arange(W) - M["ppx"]
    ys = np.arange(H) - M["ppy"]
    U, V = np.meshgrid(xs, ys)
    f = M["f"]
    Z = np.full((H, W), np.inf)

    # Boden (V > 0) und Decke (V < 0)
    with np.errstate(divide="ignore", invalid="ignore"):
        zb = np.where(V > 1e-6, f * M["h"] / np.maximum(V, 1e-6), np.inf)
        zd = np.where(V < -1e-6, f * M["hc"] / np.maximum(-V, 1e-6), np.inf)
    Z = np.minimum(Z, zb)
    Z = np.minimum(Z, zd)
    # Rueckwand begrenzt alles
    Z = np.minimum(Z, M["z_wand"])

    # Stuetzen: senkrechte Kaesten, Schnitt in der XZ-Ebene
    hw = M["st_breite"] / 2.0
    for (X0, Z0) in gitter_stuetzen(M):
        # Strahl (u/f, ., 1)*t ; treffe Kasten [X0-hw,X0+hw] x [Z0-hw,Z0+hw]
        with np.errstate(divide="ignore", invalid="ignore"):
            t1 = (X0 - hw) * f / np.where(U == 0, 1e-9, U)
            t2 = (X0 + hw) * f / np.where(U == 0, 1e-9, U)
        tmin = np.minimum(t1, t2)
        tmax = np.maximum(t1, t2)
        # bei u ~ 0 laeuft der Strahl senkrecht durch X=0
        gerade = np.abs(U) < 1e-6
        tmin = np.where(gerade, np.where((X0 - hw <= 0) & (0 <= X0 + hw), 0.0, np.inf), tmin)
        tmax = np.where(gerade, np.where((X0 - hw <= 0) & (0 <= X0 + hw), np.inf, -np.inf), tmax)
        za = np.maximum(tmin, Z0 - hw)
        zc = np.minimum(tmax, Z0 + hw)
        trifft = za <= zc
        # Hoehenpruefung am Eintritt: Y muss zwischen Boden und Decke liegen
        Yein = -za * V / f
        trifft &= (Yein >= -M["h"] - 1e-6) & (Yein <= M["hc"] + 1e-6)
        Z = np.where(trifft & (za > 0.05) & (za < Z), za, Z)
    return Z


def depth_png(M, Z, pfad):
    """SHADED-Companion: 8 Bit, WEISS = NAH (Konvention aus index.html)."""
    znah, zfern = 0.6, M["z_wand"]
    t = (np.clip(Z, znah, zfern) - znah) / (zfern - znah)
    g = np.clip((1.0 - t) * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(g, mode="L").convert("RGB").save(pfad)


def punktwolke(M, Z, rgb, schritt):
    H, W = Z.shape
    pts = []
    for y in range(0, H, schritt):
        for x in range(0, W, schritt):
            z = Z[y, x]
            if not np.isfinite(z) or z <= 0:
                continue
            u = x - M["ppx"]
            v = y - M["ppy"]
            r, g, b = rgb[y, x]
            pts.append({
                "x": round(float(u * z / M["f"]), 4),
                "y": round(float(-v * z / M["f"]), 4),
                "z": round(float(z), 4),
                "r": int(r), "g": int(g), "b": int(b),
            })
    return {
        "format": "SHADED.metric-point-cloud.v1",
        "einheit": "m",
        "erzeuger": "SingleViewRoomProvider / room_to_assets",
        "hinweis": ("Metrische Schwester von SHADED.spatial-point-cloud.v1. Dort steht z "
                    "normiert in 0..1 aus einer Companion-Tiefenkarte; hier stehen echte "
                    "Meter aus vermessener Geometrie. Zwei Formate statt einer ueberladenen "
                    "Bedeutung."),
        "kamera": {"hauptpunkt": [M["ppx"], M["ppy"]], "f_px": M["f"],
                   "kamerahoehe_m": M["h"], "schritt": schritt},
        "produktregel": ("Ein Einzelbild zeigt nur sichtbare Flaechen. Rueckseiten, "
                         "Verdeckungen und alles hinter der Rueckwand sind NICHT gemessen "
                         "und stehen darum auch nicht in dieser Wolke."),
        "punkte": pts,
    }


def overlay(M, bildpfad, pfad):
    """Rueckprojektion des Modells auf das Ausgangsbild -- der Sichtbeweis."""
    im = Image.open(bildpfad).convert("RGB")
    W, H = im.size
    d = ImageDraw.Draw(im)
    f, ppx, ppy, h, hc = M["f"], M["ppx"], M["ppy"], M["h"], M["hc"]

    def bild(X, Y, Z):
        if Z <= 0.01:
            return None
        return (ppx + f * X / Z, ppy - f * Y / Z)

    def strecke(a, b, farbe, br=2):
        pa, pb = bild(*a), bild(*b)
        if pa and pb:
            d.line([pa, pb], fill=farbe, width=br)

    GELB, ROT, CYAN, GRUEN = (255, 210, 40), (255, 70, 70), (60, 220, 255), (120, 255, 120)

    # Bodenfugen -- laengs und quer. Reine Sichtbeweis-Overlaylinien; ohne
    # gemessenes Bodenraster (m<=0, sb None/0 -- der INFERRED-Fall) gibt es
    # kein Fugenmuster zu zeichnen, statt durch 0 zu teilen oder endlos zu
    # laufen (bval bliebe bei sb=0 fuer immer konstant).
    m = M["fliese"]
    sb = M["messung"]["bodenraster"]["fliesentiefe_1_durch_v"]
    if m > 0:
        nx = int(6.0 / m) + 1
        for i in range(-nx, nx + 1):
            X = i * m + M["fliese_phase_x"]
            strecke((X, -h, 1.2), (X, -h, M["z_wand"]), GELB, 1)
        # Querfugen liegen in 1/v aequidistant, nicht in Z -- so werden sie erzeugt
        if sb:
            bb0 = M["fliese_phase_b"]
            n = 1
            while True:
                bval = bb0 + n * sb
                if bval <= 0:
                    n += 1; continue
                zq = M["h"] * M["f"] * bval     # Z = f*h/v  mit  b = 1/v
                if zq > M["z_wand"]:
                    break
                if zq > 1.2:
                    strecke((-nx * m, -h, zq), (nx * m, -h, zq), GELB, 1)
                n += 1
    # Rueckwand
    strecke((-6, -h, M["z_wand"]), (6, -h, M["z_wand"]), ROT, 3)
    strecke((-6, hc, M["z_wand"]), (6, hc, M["z_wand"]), ROT, 3)
    # Leuchtbaender an der Decke
    for X in M["baender"]:
        strecke((X, hc, 0.6), (X, hc, M["z_wand"]), CYAN, 3)
    # Stuetzen
    hw = M["st_breite"] / 2
    for (X0, Z0) in gitter_stuetzen(M):
        for sx in (-1, 1):
            strecke((X0 + sx * hw, -h, Z0 - hw), (X0 + sx * hw, hc, Z0 - hw), GRUEN, 2)
        strecke((X0 - hw, hc, Z0 - hw), (X0 + hw, hc, Z0 - hw), GRUEN, 2)
        strecke((X0 - hw, -h, Z0 - hw), (X0 + hw, -h, Z0 - hw), GRUEN, 2)
    im.save(pfad)


def hallenplan(M):
    """Schlanker Bauplan -- das, was BEUTELTIER wirklich braucht."""
    b = M["messung"]
    return {
        "format": "SHADED.hall-plan.v1",
        "einheit": "m",
        "herkunft": {
            "provider": "SingleViewRoomProvider",
            "quelle": M["quelle"]["datei"],
            "sha256": M["quelle"]["sha256"],
        },
        "kamera": {
            "hoehe_m": M["h"],
            "f_px": M["f"],
            "hauptpunkt_px": [M["ppx"], M["ppy"]],
            "bildgroesse_px": [M["quelle"]["breite"], M["quelle"]["height"]],
            "blick": "entlang +Z, waagerecht, ohne Rollung",
        },
        "raum": {
            "boden_y_m": 0.0,
            "decke_y_m": M["h"] + M["hc"],
            "rueckwand_z_m": M["z_wand"],
            "breite_m": None,
        },
        "boden": {"fliese_m": M["fliese"]},
        "stuetzen": {
            "breite_m": M["st_breite"],
            "reihen_x_m": M["st_reihen"],
            "jochteilung_z_m": M["st_joch"],
            "positionen_xz_m": [[round(x, 3), round(z, 3)] for x, z in gitter_stuetzen(M)],
        },
        "leuchtbaender": {
            "x_m": [round(x, 3) for x in M["baender"]],
            "teilung_m": M["band_teilung"],
            "hoehe_y_m": M["h"] + M["hc"],
        },
        "nicht_gemessen": b["nicht_messbar"],
        "guete": {
            "fluchtpunkt_restfehler_px": b["fluchtpunkt"]["restfehler_px"],
            "wandfuge_restfehler_px": b["wand_boden_fuge"]["restfehler_px"],
            "spiegelprobe_abweichung_prozent": max((pr["abweichung_prozent"]
                                                    for pr in b["spiegelprobe"]["proben"]), default=None),
            "stuetzenreihen_streuung_je_h": b["raster"]["reihen_x_streuung"],
            "brennweite_bandbreite_px": b["bodenraster"].get("f_bandbreite_px"),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("room_json")
    ap.add_argument("--bild", default=None)
    ap.add_argument("--schritt", type=int, default=4)
    a = ap.parse_args()

    M = modell_laden(a.room_json)
    ordner = os.path.dirname(os.path.abspath(a.room_json))
    basis = os.path.basename(a.room_json).replace(".room.json", "")
    bild = a.bild or os.path.join(ordner, M["quelle"]["datei"])

    im = Image.open(bild).convert("RGB")
    W, Hh = im.size
    rgb = np.asarray(im)
    Z = tiefenfeld(M, W, Hh)

    p_depth = os.path.join(ordner, basis + "_depth.png")
    depth_png(M, Z, p_depth)
    p_pc = os.path.join(ordner, basis + ".pointcloud.json")
    pc = punktwolke(M, Z, rgb, a.schritt)
    json.dump(pc, open(p_pc, "w"), indent=1)
    p_ov = os.path.join(ordner, basis + "-overlay.png")
    overlay(M, bild, p_ov)
    p_hp = os.path.join(ordner, basis + ".hall.json")
    json.dump(hallenplan(M), open(p_hp, "w"), indent=2, ensure_ascii=False)

    print("Tiefenkarte  %s   (weiss = nah, %.2f .. %.2f m)" % (p_depth, Z.min(), M["z_wand"]))
    print("Punktwolke   %s   %d Punkte" % (p_pc, len(pc["punkte"])))
    print("Overlay      %s" % p_ov)
    print("Hallenplan   %s   %d Stuetzen" % (p_hp, len(gitter_stuetzen(M))))


if __name__ == "__main__":
    main()
