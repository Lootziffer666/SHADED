#!/usr/bin/env python3
"""SingleViewRoomProvider - Raumgeometrie aus EINEM Innenraumbild.

Das ist die erste reale Implementierung des in
`docs/reconstruction-provider-und-world-surface-graph.md` beschriebenen
Vertrags `GuidedMetricDepthProvider`: RGB-Einzelbild plus EIN metrischer
Anker. Der Provider erfindet keine Geometrie -- er misst sie.

Warum nicht monokulare Tiefenschaetzung
---------------------------------------
Ein Netz wie Depth Anything liefert fuer eine leere Halle ein weiches
Relieffeld: der Boden woelbt sich, die Saeulen verschmieren, die Decke
wird zur Kuppel. Fuer Parallax reicht das; fuer eine begehbare 3D-Szene
nicht, denn dort faellt jede Kruemmung sofort auf.

Dieses Bild braucht kein Netz. Es ist eine Manhattan-Welt in
Zentralperspektive: ebener Boden, ebene Decke, frontale Rueckwand,
lotrechte Stuetzen. Genau diese Struktur laesst sich aus den Linien des
Bildes ABLESEN. Das ist nach der Vorrangregel des Providervertrags
    gemessen > multiview > engine-bekannt > gefuehrt > monokular
die hoechstwertige Quelle, die aus einem Einzelbild ueberhaupt erreichbar
ist -- und sie ist reproduzierbar, ohne Modellgewichte, ohne GPU.

Messkette
---------
1.  Kanten -> Hough -> Linien per Total Least Squares verfeinert.
2.  RANSAC ueber das Linienbuendel  ->  Fluchtpunkt der Raumachse.
3.  Probe: sind Quer- und Senkrechtlinien im Bild parallel, steht die
    Bildebene parallel zu Raum-X und Raum-Y. Dann IST der Hauptpunkt der
    Fluchtpunkt -- das Bild ist ein Ausschnitt eines groesseren Rahmens.
4.  Wand-Boden-Fuge ueber die volle Bildbreite  ->  Rueckwandtiefe,
    Frontalitaets- und Ebenheitsprobe.
5.  Wand-Decken-Fuge  ->  Deckenhoehe hc als Vielfaches der Kamerahoehe h.
6.  Leuchtbaender  ->  ihre Lage auf der Deckenebene.
7.  GEGENPROBE: die Glanzstreifen im Boden muessen die Spiegelbilder der
    Leuchtbaender sein. Trifft die Vorhersage, ist hc/h bestaetigt --
    unabhaengig von Schritt 5.
8.  Stuetzen im Wandband -> Breite und Seitenlage je Kamerahoehe.
9.  Brennweite aus dem Bodenraster (siehe `bodenraster`).

Was NICHT gemessen werden kann
------------------------------
* Die Hallenbreite. Die Rueckwand fuellt das Bild bis an beide Raender;
  seitlich geht der Raum weiter, als das Bild zeigt.
* Alles hinter der Rueckwand und hinter den Stuetzen.
* Der absolute Massstab. Ein Einzelbild kennt keine Meter. Genau ein
  Anker wird deklariert (Bodenfliese), alles andere haengt daran.

Aufruf:
    python3 tools/single_view_room.py content/raum/messehalle.png
"""

import argparse
import hashlib
import json
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

PROVIDER = "SingleViewRoomProvider"
VERSION = "1.1.0"

# Provenienzklassen aus dem Providervertrag.
MEASURED = "MEASURED"
RECONSTRUCTED = "RECONSTRUCTED"
DECLARED = "DECLARED"
UNKNOWN = "UNKNOWN"

# ---------------------------------------------------------------------------
# Exp. 4 (docs/first-glimpse-depth-layers.md): bild-relative statt fest
# verdrahtete Suchfenster.
#
# Version 1.0.0 hatte jede Such-Zeile/-Spalte als absoluten Pixelwert fuer
# GENAU messehalle.png (1103x1426) verdrahtet -- lauffaehig nur auf diesem
# einen Bild. Diese Fassung druckt jedes Fenster als Bruchteil von H
# (Bildhoehe) bzw. W (Bildbreite) aus, kalibriert an genau diesem Referenzbild
# und dort regressionsgetestet (siehe tools/test-single-view-room.py):
# `round(BRUCHTEIL * H)` muss auf messehalle.png exakt die alten Werte
# reproduzieren. Das verallgemeinert NUR das "WO wird gesucht" (Kamera in
# Augenhoehe, Boden im unteren Bildteil, Decke/Dachlinie im oberen Bildteil)
# -- nicht das "WAS wird gefunden": ein Foto ohne Leuchtbaender oder Stuetzen
# liefert dafuer UNKNOWN statt geraten (Aufgabe 12 des Maintainer-Briefings:
# "Richtig geraten ist nicht gemessen"), siehe die try/except-Kapselung in
# `vermessen()`. Die inneren Autokorrelations-/FFT-Schwellen von
# `bodenraster()` waren zunaechst ABSICHTLICH unangetastet -- ungetestet auf
# andere Aufloesungen hochzurechnen waere selbst schon das geraetene
# Ergebnis gewesen, das diese Regel verbietet. Ein 2x-Resize-Test von
# messehalle.png (siehe tools/test-single-view-room.py) hat die Frage dann
# nicht mehr theoretisch, sondern EMPIRISCH beantwortet: ohne Skalierung
# fand die Autokorrelation dort die falsche Periode (Brennweite 1119 px
# statt der erwarteten ~1936 px). Erst dieser Beweis hat die Skalierung
# (`skala_h = H / _REF_H`, siehe `bodenraster()`) gerechtfertigt.
_REF_W, _REF_H = 1103.0, 1426.0

F_VP_OBEN_ENDE = 432 / _REF_H          # Fluchtpunkt-Suche: Ende der oberen Zone
F_VP_UNTEN_START = 560 / _REF_H        # Fluchtpunkt-Suche: Beginn der unteren Zone
F_PARALLEL_UNTEN_START = 600 / _REF_H  # Parallelitaetsprobe: Beginn der unteren Zone
F_WBF_VON = 520 / _REF_H               # Wand-Boden-Fuge: Suchband Anfang
F_WBF_BIS = 690 / _REF_H               # Wand-Boden-Fuge: Suchband Ende
F_WDF_X0 = 420 / _REF_W                # Wand-Decken-Fuge: Spaltenbereich Anfang
F_WDF_X1 = 900 / _REF_W                # Wand-Decken-Fuge: Spaltenbereich Ende
F_WDF_DECKE_VON = 380 / _REF_H         # Wand-Decken-Fuge: reines Decken-Referenzband
F_WDF_DECKE_BIS = 420 / _REF_H
F_WDF_WAND_VON = 480 / _REF_H          # Wand-Decken-Fuge: reines Wand-Referenzband
F_WDF_WAND_BIS = 540 / _REF_H
F_WDF_SUCH_VON = 400 / _REF_H          # Wand-Decken-Fuge: Uebergangssuche
F_WDF_SUCH_BIS = 500 / _REF_H
F_DECKENGRENZE = 440 / _REF_H          # Leuchtbaender: nur oberhalb dieser Zeile
F_SPIEGEL_ZEILEN = [z / _REF_H for z in (1180, 1240, 1300, 1360, 1415)]  # Spiegelprobe
F_SPIEGEL_RAND = 35 / _REF_W           # Spiegelprobe: seitlicher Suchrand
F_STUETZEN_BAND_VON = 478 / _REF_H     # Stuetzen: Suchband (Wandhoehe)
F_STUETZEN_BAND_BIS = 558 / _REF_H
F_STUETZEN_FUSS_VON = 585 / _REF_H     # Stuetzen: ab hier nach dem Fusspunkt suchen
F_STUETZEN_FUSS_RAND = 34 / _REF_H     # ... bis so nah an den unteren Bildrand
F_STUETZEN_HELL_SCHRITT = 10 / _REF_H  # Stuetzen: Abtastschritt der "anhaltend heller"-Probe
F_BODEN_VON = 600 / _REF_H             # Bodenraster: nur unterhalb dieser Zeile
F_BODEN_V_MIN = 140 / _REF_H           # Bodenraster: Mindestabstand vom Fluchtpunkt


def deklinieren(H, W):
    """Alle Suchfenster-Bruchteile auf die tatsaechliche Bildgroesse (H, W)
    dieses Laufs anwenden. Auf messehalle.png selbst reproduziert das exakt
    die Version-1.0.0-Konstanten (_REF_H/_REF_W sind genau diese Bildgroesse)."""
    return {
        "vp_oben_ende": round(F_VP_OBEN_ENDE * H),
        "vp_unten_start": round(F_VP_UNTEN_START * H),
        "parallel_unten_start": round(F_PARALLEL_UNTEN_START * H),
        "wbf_von": round(F_WBF_VON * H), "wbf_bis": round(F_WBF_BIS * H),
        "wdf_x0": round(F_WDF_X0 * W), "wdf_x1": round(F_WDF_X1 * W),
        "wdf_decke_von": round(F_WDF_DECKE_VON * H), "wdf_decke_bis": round(F_WDF_DECKE_BIS * H),
        "wdf_wand_von": round(F_WDF_WAND_VON * H), "wdf_wand_bis": round(F_WDF_WAND_BIS * H),
        "wdf_such_von": round(F_WDF_SUCH_VON * H), "wdf_such_bis": round(F_WDF_SUCH_BIS * H),
        "deckengrenze": round(F_DECKENGRENZE * H),
        "spiegel_zeilen": [round(f * H) for f in F_SPIEGEL_ZEILEN],
        "spiegel_rand": max(1, round(F_SPIEGEL_RAND * W)),
        "stuetzen_band": (round(F_STUETZEN_BAND_VON * H), round(F_STUETZEN_BAND_BIS * H)),
        "stuetzen_fuss_von": round(F_STUETZEN_FUSS_VON * H),
        "stuetzen_fuss_rand": round(F_STUETZEN_FUSS_RAND * H),
        "stuetzen_hell_schritt": max(1, round(F_STUETZEN_HELL_SCHRITT * H)),
        "boden_von": round(F_BODEN_VON * H),
        "boden_v_min": round(F_BODEN_V_MIN * H),
    }


# ---------------------------------------------------------------------------
# Bildwerkzeug
# ---------------------------------------------------------------------------

def luminanz(pfad):
    im = Image.open(pfad).convert("RGB")
    a = np.asarray(im).astype(np.float64) / 255.0
    return a, a @ np.array([0.2126, 0.7152, 0.0722])


def sobel(g):
    kx = np.array([[-1.0, 0, 1], [-2, 0, 2], [-1, 0, 1]])
    ky = kx.T

    def conv(a, k):
        out = np.zeros_like(a)
        for dy in range(3):
            for dx in range(3):
                out[1:-1, 1:-1] += k[dy, dx] * a[dy:dy + a.shape[0] - 2, dx:dx + a.shape[1] - 2]
        return out

    return conv(g, kx), conv(g, ky)


def kastenfilter(a, r):
    c = np.cumsum(np.pad(a, ((0, 0), (r, r)), mode="edge"), axis=1)
    b = (c[:, 2 * r:] - c[:, :-2 * r]) / (2 * r)
    c2 = np.cumsum(np.pad(b, ((r, r), (0, 0)), mode="edge"), axis=0)
    return (c2[2 * r:] - c2[:-2 * r]) / (2 * r)


# ---------------------------------------------------------------------------
# 1-2. Linien und Fluchtpunkt
# ---------------------------------------------------------------------------

class Linienfeld:
    """Kantenpixel des Bildes, mit Hough-Saat und TLS-Verfeinerung."""

    def __init__(self, mag, schwelle=0.9):
        self.mag = mag
        self.H, self.W = mag.shape
        ys, xs = np.nonzero(mag > schwelle)
        self.P = np.vstack([xs, ys]).T.astype(np.float64)
        self.w = mag[ys, xs]

    def hough(self, ymin, ymax, n_spitzen, theta_lo, theta_hi, schwelle=0.9):
        sub = np.zeros((self.H, self.W), bool)
        sub[ymin:ymax] = self.mag[ymin:ymax] > schwelle
        yy, xx = np.nonzero(sub)
        ww = self.mag[yy, xx]
        if len(yy) < 50:
            return []
        th = np.deg2rad(np.arange(theta_lo, theta_hi, 0.25))
        diag = int(math.hypot(self.W, self.H)) + 2
        acc = np.zeros((len(th), 2 * diag), np.float32)
        for i, t in enumerate(th):
            r = (xx * math.cos(t) + yy * math.sin(t) + diag).astype(np.int32)
            np.add.at(acc[i], r, ww)
        k = np.array([1.0, 2, 3, 2, 1]); k /= k.sum()
        acc = np.apply_along_axis(lambda a: np.convolve(a, k, "same"), 1, acc)
        out, A = [], acc.copy()
        for _ in range(n_spitzen):
            idx = np.unravel_index(np.argmax(A), A.shape)
            if A[idx] <= 0:
                break
            out.append((th[idx[0]], idx[1] - diag))
            A[max(0, idx[0] - 8):idx[0] + 9, max(0, idx[1] - 14):idx[1] + 15] = 0
        return out

    def verfeinern(self, theta, rho, bereich, band=3.0, runden=4, minpix=60):
        n = np.array([math.cos(theta), math.sin(theta)])
        r = float(rho)
        im_bereich = (self.P[:, 1] >= bereich[0]) & (self.P[:, 1] < bereich[1])
        pts = mu = dv = None
        for _ in range(runden):
            d = self.P @ n - r
            m = im_bereich & (np.abs(d) < band)
            if m.sum() < minpix:
                return None
            pts = self.P[m]
            ww = self.w[m]
            mu = (pts * ww[:, None]).sum(0) / ww.sum()
            Q = (pts - mu) * np.sqrt(ww)[:, None]
            _, _, Vt = np.linalg.svd(Q, full_matrices=False)
            dv = Vt[0]
            n = np.array([-dv[1], dv[0]])
            r = n @ mu
        proj = (pts - mu) @ dv
        return {
            "l": np.array([n[0], n[1], -r]),
            "richtung": dv,
            "laenge": float(proj.max() - proj.min()),
            "p0": mu + dv * proj.min(),
            "p1": mu + dv * proj.max(),
        }


def ransac_fluchtpunkt(linien, toleranz=10.0, versuche=6000, saat=3):
    """Fluchtpunkt als Punkt, der moeglichst vielen Linien aufliegt."""
    L = np.array([l["l"] for l in linien])
    laenge = np.array([l["laenge"] for l in linien])
    norm = np.linalg.norm(L[:, :2], axis=1)
    rng = np.random.default_rng(saat)
    bestes = None
    for _ in range(versuche):
        i, j = rng.choice(len(linien), 2, replace=False)
        v = np.cross(L[i], L[j])
        if abs(v[2]) < 1e-9:
            continue
        d = np.abs(L @ v) / (norm * abs(v[2]) + 1e-12)
        inl = d < toleranz
        s = laenge[inl].sum()
        if bestes is None or s > bestes[0]:
            bestes = (s, inl)
    inl = bestes[1]
    v = None
    for _ in range(4):
        M = L[inl] * laenge[inl][:, None]
        _, _, Vt = np.linalg.svd(M)
        v = Vt[-1] / Vt[-1][2]
        d = np.abs(L @ v) / (norm * abs(v[2]) + 1e-12)
        inl = d < toleranz
    rest = np.abs(L[inl] @ v) / (norm[inl] * abs(v[2]) + 1e-12)
    return v[:2], inl, float(np.sqrt((rest ** 2).mean()))


# ---------------------------------------------------------------------------
# 4-5. Waende
# ---------------------------------------------------------------------------

def wand_boden_fuge(lum, ppx, ppy, von, bis):
    """Die Fuge, an der die Rueckwand auf den Boden trifft.

    Sie ist zugleich die Probe auf zwei Behauptungen: liegt sie ueber die
    ganze Breite auf gleicher Hoehe, steht die Wand frontal UND der Boden
    ist eben. Beides wird als Streuung zurueckgegeben statt behauptet.

    `von`/`bis` (Exp. 4): Suchband in Zeilen, bild-relativ vom Aufrufer
    bestimmt (siehe `deklinieren()`) statt hier fest verdrahtet.
    """
    H, W = lum.shape
    xs, ys = [], []
    for x in range(10, W - 10, 20):
        spalte = np.convolve(lum[:, max(0, x - 12):x + 13].mean(axis=1),
                             np.ones(3) / 3, "same")
        best, bestv = None, 0.0
        for y in range(von, bis):
            sprung = spalte[y - 4:y].mean() - spalte[y + 2:y + 7].mean()
            if sprung > bestv:
                bestv, best = sprung, y
        if best is not None and bestv > 0.08:
            xs.append(x)
            ys.append(best)
    xs = np.array(xs, float)
    ys = np.array(ys, float)
    # Ausreisser (Nischen, Tueren) verwerfen
    med = np.median(ys)
    gut = np.abs(ys - med) < 12
    xs, ys = xs[gut], ys[gut]
    A = np.vstack([xs, np.ones_like(xs)]).T
    steig, achse = np.linalg.lstsq(A, ys, rcond=None)[0]
    rest = ys - (A @ [steig, achse])
    return {
        "y": float(np.median(ys)),
        "v": float(np.median(ys) - ppy),
        "stuetzstellen": int(len(xs)),
        "neigung_px_je_breite": float(steig * W),
        "restfehler_px": float(np.sqrt((rest ** 2).mean())),
    }


def wand_decken_fuge(lum, ppy, x0, x1, decke_von, decke_bis, wand_von, wand_bis, such_von, such_bis):
    """Oberkante der Rueckwand: Uebergang von dunkler Decke zu heller Wand.

    Alle Zeilenbereiche (Exp. 4) sind bild-relativ vom Aufrufer bestimmt
    (siehe `deklinieren()`) statt hier fest verdrahtet.
    """
    profil = np.convolve(lum[:, x0:x1].mean(axis=1), np.ones(3) / 3, "same")
    decke = profil[decke_von:decke_bis].mean()
    wand = profil[wand_von:wand_bis].mean()
    ziel = decke + 0.35 * (wand - decke)
    for y in range(such_von, such_bis):
        if profil[y] < ziel <= profil[y + 1]:
            t = (ziel - profil[y]) / (profil[y + 1] - profil[y])
            return float(y + t)
    return None


# ---------------------------------------------------------------------------
# 6-7. Leuchtbaender und die Spiegelprobe
# ---------------------------------------------------------------------------

def leuchtbaender(lum, ppx, ppy, deckengrenze):
    """Helle, langgestreckte Komponenten in der Decke, als Geraden gefittet."""
    H, W = lum.shape
    # Exp. 4: Mindestflaeche (vorher fest 400 px) und Referenzzeile fuer die
    # Steigungsauswertung (vorher fest -200 px ueber dem Fluchtpunkt) skalieren
    # mit der tatsaechlichen Bildflaeche/-hoehe statt mit messehalle.png (1103x1426).
    mindestflaeche = max(20, round(400 * (H * W) / (_REF_H * _REF_W)))
    referenz_v = -200.0 * (H / _REF_H)
    m = lum[:deckengrenze] > 0.72
    gesehen = np.zeros_like(m)
    ergebnis = []
    for y0 in range(deckengrenze):
        for x0 in range(W):
            if not m[y0, x0] or gesehen[y0, x0]:
                continue
            q = deque([(y0, x0)])
            gesehen[y0, x0] = True
            pix = []
            while q:
                y, x = q.popleft()
                pix.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if (0 <= ny < deckengrenze and 0 <= nx < W
                                and m[ny, nx] and not gesehen[ny, nx]):
                            gesehen[ny, nx] = True
                            q.append((ny, nx))
            if len(pix) < mindestflaeche:
                continue
            p = np.array(pix, float)
            yy, xx = p[:, 0], p[:, 1]
            mx, my = xx.mean(), yy.mean()
            cov = np.cov(np.vstack([xx - mx, yy - my]))
            ev, evec = np.linalg.eigh(cov)
            if math.sqrt(ev[-1] / max(ev[0], 1e-9)) < 6:
                continue
            d = evec[:, -1]
            # Steigung im Fluchtpunktbuendel: k = u/v, konstant laengs der Linie
            v0 = my - ppy
            u0 = mx - ppx
            if abs(v0) < 20:
                continue
            k = (u0 - d[0] / d[1] * v0) if abs(d[1]) > 1e-6 else 0.0
            # exakt: Schnitt mit einer Geraden durch PP -> k = u/v am Fusspunkt
            k = u0 / v0 if abs(d[1]) < 1e-9 else None
            # Geradengleichung aufstellen und k als u/v eines beliebigen Punktes
            n = np.array([-d[1], d[0]])
            c = -(n @ [mx, my])
            # Punkt der Linie bei v = referenz_v (im Deckenbereich)
            vv = referenz_v
            if abs(n[0]) > 1e-9:
                uu = (-c - n[1] * (vv + ppy)) / n[0] - ppx
                k = uu / vv
            ergebnis.append({
                "k": float(k),
                "pixel": int(len(pix)),
                "p0": [float(xx.min()), float(yy[np.argmin(xx)])],
                "p1": [float(xx.max()), float(yy[np.argmax(xx)])],
            })
    return sorted(ergebnis, key=lambda r: r["k"])


def spiegelprobe(lum, ppx, ppy, baender, hc_h, zeilen, rand):
    """Sitzen die Glanzstreifen dort, wo die Spiegelung sie hinlegt?

    Ein Leuchtband in der Hoehe hc ueber der Kamera hat im Boden ein
    Spiegelbild in der scheinbaren Tiefe 2h + hc darunter. Aus der
    direkten Steigung k folgt zwingend
        k_spiegel = -k * hc / (2h + hc).
    Wird diese Vorhersage im Bild angetroffen, ist hc/h bestaetigt --
    aus einer voellig anderen Bildregion als die Rueckwandkante.

    `zeilen`/`rand` (Exp. 4): Zeilenband und seitlicher Suchrand, bild-relativ
    vom Aufrufer bestimmt (siehe `deklinieren()`) statt hier fest verdrahtet.
    """
    H, W = lum.shape
    faktor = hc_h / (2.0 + hc_h)
    # Laengsstrukturen im Nahfeld: schmale Helligkeitsruecken
    gefunden = []
    for y in zeilen:
        row = np.convolve(lum[y - 3:y + 4].mean(axis=0), np.ones(5) / 5, "same")
        bg = np.convolve(row, np.ones(61) / 61, "same")
        r = row - bg
        pk = []
        for x in range(rand, W - rand):
            if r[x] == r[x - 12:x + 13].max() and r[x] > 0.05:
                pk.append(x)
        gefunden.append((y, pk))
    proben = []
    for b in baender:
        vorher = -b["k"] * faktor
        treffer = []
        for y, pk in gefunden:
            v = y - ppy
            ziel = ppx + vorher * v
            nah = [x for x in pk if abs(x - ziel) < 30]
            if nah:
                x = min(nah, key=lambda t: abs(t - ziel))
                treffer.append((x - ppx) / v)
        if len(treffer) >= 2:
            ist = float(np.median(treffer))
            # Aus dem angetroffenen Streifen die Deckenhoehe ZURUECKRECHNEN:
            #   ist/k = -hc/(2+hc)   =>   hc = 2r/(1-r)  mit r = -ist/k
            r = -ist / b["k"] if abs(b["k"]) > 1e-6 else None
            hc_rueck = (2.0 * r / (1.0 - r)) if (r is not None and 0 < r < 0.9) else None
            proben.append({
                "band_k": b["k"],
                "erwartet_k": float(vorher),
                "gemessen_k": ist,
                "abweichung_prozent": float(abs(ist - vorher) / max(abs(vorher), 1e-6) * 100),
                "hc_je_h_aus_spiegelung": float(hc_rueck) if hc_rueck else None,
                "zeilen": len(treffer),
            })
    return proben


def gitterteilung(q, smin, smax, schritte=4000):
    """Teilung eines eindimensionalen Gitters aus unvollstaendigen Werten.

    Die Stuetzen einer Reihe stehen in gleichen Jochen, aber nicht jede ist
    im Bild sichtbar. Der Median der Nachbarabstaende faellt darum auf jede
    Luecke herein. Gesucht wird stattdessen die Teilung, auf deren ganze
    Vielfache ALLE Werte fallen -- Luecken schaden dann nicht mehr.
    """
    q = np.sort(np.asarray(q, float))
    if len(q) < 3:
        return None
    d = q - q[0]
    bestes = None
    for s in np.linspace(smin, smax, schritte):
        n = d / s
        rest = np.abs(n - np.round(n))
        if np.round(n).max() > 14:          # unglaubwuerdig feine Teilung
            continue
        guete = float(np.sqrt((rest ** 2).mean()))
        if bestes is None or guete < bestes[0]:
            bestes = (guete, float(s), np.round(n).astype(int).tolist())
    if bestes is None:
        return None
    return {"teilung": bestes[1], "ordnungszahlen": bestes[2], "restfehler": bestes[0]}


# ---------------------------------------------------------------------------
# 8. Stuetzen
# ---------------------------------------------------------------------------

def stuetzen(lum, ppx, ppy, band, fuss_von, fuss_rand, hell_schritt):
    """Dunkle Senkrechtbalken vor heller Wand.

    Rueckgabe je Stuetze: Bildkanten, Fusspunkt, Breite/h, X/h.
    Der Fusspunkt ist der Schluessel -- er sitzt auf der Bodenebene und
    uebersetzt Bildbreite in Weltbreite: w/h = dx/v.

    `band`/`fuss_von`/`fuss_rand`/`hell_schritt` (Exp. 4): Suchfenster,
    bild-relativ vom Aufrufer bestimmt (siehe `deklinieren()`) statt hier
    fest verdrahtet.
    """
    H, W = lum.shape
    profil = np.convolve(lum[band[0]:band[1]].mean(axis=0), np.ones(3) / 3, "same")
    dunkel = profil < 0.30
    laeufe = []
    x = 0
    while x < W:
        if dunkel[x]:
            x0 = x
            while x < W and dunkel[x]:
                x += 1
            if x - x0 >= 8:
                laeufe.append((x0, x - 1))
        else:
            x += 1

    def kante(a, b):
        lo, hi = profil[a], profil[b]
        t = 0.5 * (lo + hi)
        for x in range(a, b):
            p, q = profil[x], profil[x + 1]
            if (p - t) * (q - t) <= 0 and p != q:
                return x + (t - p) / (q - p)
        return None

    aus = []
    for a, b in laeufe:
        # Nachbarlaeufe duerfen die Kantensuche nicht verschlucken
        li = kante(max(0, a - 8), a + 2)
        re = kante(b - 2, min(W - 1, b + 8))
        if li is None or re is None or re - li < 6:
            continue
        xm = 0.5 * (li + re)
        # Fusspunkt ueber die EIGENHELLIGKEIT des Balkens.
        #
        # Der naheliegende Weg -- "wo hoert der dunkle Balken auf" -- geht in
        # diesem Raum zwingend schief: der Boden spiegelt, also setzt sich
        # jede Stuetze unter ihrem Fuss als Spiegelbild fort. Kontrast gegen
        # die Flanken besteht dort unveraendert weiter; er endet erst dort,
        # wo die Spiegelung verlaeuft, und das ist rund das 2,3-fache der
        # wahren Fusstiefe.
        #
        # Der Stahl selbst ist aber deutlich dunkler als seine Spiegelung im
        # Boden -- die Spiegelung traegt immer etwas Bodenhelligkeit mit.
        # Genau dieser Sprung markiert den Fuss.
        i0 = int(round(li)) + 2
        i1 = int(round(re)) - 1
        if i1 - i0 < 2:
            continue
        innen = np.convolve(lum[:, i0:i1].mean(axis=1), np.ones(5) / 5, "same")
        eigen = float(np.median(innen[band[0]:band[1]]))
        schwelle = eigen + 0.055
        fuss = None
        for y in range(fuss_von, H - fuss_rand):
            # anhaltend heller, sonst faengt jeder Glanzfleck den Fuss ab
            if all(innen[y + d * hell_schritt] > schwelle for d in (0, 1, 2, 3)):
                fuss = y
                break
        if fuss is None:
            # Stuetze laeuft unten aus dem Bild -- kein Fusspunkt messbar
            continue
        v = fuss - ppy
        aus.append({
            "x_links": float(li), "x_rechts": float(re), "x_mitte": float(xm),
            "fuss_y": int(fuss), "v": float(v),
            "breite_px": float(re - li),
            "breite_je_h": float((re - li) / v),
            "x_je_h": float((xm - ppx) / v),
        })
    return aus


# ---------------------------------------------------------------------------
# 9. Brennweite
# ---------------------------------------------------------------------------

def bodenraster(lum, ppx, ppy, von, v_min):
    """Fliesenraster des Bodens, per Autokorrelation auf beiden Achsen.

    Der Belag ist stark durchgezeichnet -- Risse, Flecken, Kritzel. Eine
    Spitzensuche nach einzelnen Fugen findet darum vor allem Rauschen.
    Die Autokorrelation fragt nicht "wo liegt eine Fuge", sondern "bei
    welchem Versatz wiederholt sich die Flaeche" und mittelt dabei ueber
    den ganzen Boden.

    Beide Achsen sind brennweitenfrei ablesbar:
        k = u/v  -> Fliesenbreite  W/h
        b = 1/v  -> Fliesentiefe   D/(f h)

    `von`/`v_min` (Exp. 4): aeusseres Suchfenster, bild-relativ vom Aufrufer
    bestimmt (siehe `deklinieren()`). Die inneren Autokorrelations-/FFT-
    Schwellen SIND resolutionsabhaengig -- `v` ist ein Pixel-Offset vom
    Fluchtpunkt, `1/v` skaliert also invers mit der Bildaufloesung -- und
    werden hier explizit mit `H/_REF_H` mitskaliert, NICHT geschaetzt: ein
    Regressionslauf auf einer 2x-Vergroesserung von messehalle.png bestaetigt
    die erwartete verdoppelte Brennweite in Pixeln (siehe
    docs/first-glimpse-depth-layers.md, Exp. 4). Ohne diese Skalierung fand
    die Autokorrelation im 2x-Test die FALSCHE Periode (Brennweite 1119 px
    statt der erwarteten ~1936 px) -- das war der Beweis, dass diese Werte
    NICHT einfach unveraendert uebernommen werden durften.
    """
    H, W = lum.shape
    skala_h = H / _REF_H
    R = np.clip(kastenfilter(lum, 5) - lum, 0, None)
    ys, xs = np.nonzero(R[von:] > 0.05)
    ys = ys + von
    v = ys - ppy
    u = xs - ppx
    ok = v > v_min
    if ok.sum() < 5000:
        return None
    k = u[ok] / v[ok]
    gew = R[ys[ok], xs[ok]] * np.sqrt(v[ok])

    def gipfel(sig, lo, hi):
        """Grundperiode, nicht der hoechste Gipfel.

        Die Autokorrelation eines Rasters hat bei jedem Vielfachen der
        Teilung einen Gipfel, und ein Vielfaches kann durchaus staerker
        korrelieren als die Teilung selbst. Wer schlicht das Maximum nimmt,
        landet dann auf der doppelten Fliese. Genommen wird darum der
        KLEINSTE Versatz, der nahe an das Maximum heranreicht.
        """
        sig = sig - sig.mean()
        n = len(sig)
        F = np.fft.rfft(sig * np.hanning(n))
        ac = np.fft.irfft(F * np.conj(F))[:n // 2]
        ac = ac / ac[0]
        kand = [(i, ac[i]) for i in range(lo, min(hi, len(ac) - 2))
                if ac[i] == ac[i - 2:i + 3].max() and ac[i] > 0.10]
        if not kand:
            return None, None, None
        beste = max(v for _, v in kand)
        i, val = next((i, v) for i, v in kand if v >= 0.92 * beste)
        nebenbuhler = [(j, v) for j, v in kand if v >= 0.92 * beste and j != i]
        a, b, c = ac[i - 1], ac[i], ac[i + 1]
        d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) else 0.0
        return i + d, float(val), nebenbuhler

    dk = 0.002
    hist, _ = np.histogram(k, bins=np.arange(-2.0, 2.0 + dk, dk), weights=gew)
    ik, gk, nk = gipfel(hist, 120, 260)      # 0.24 .. 0.52 in k-Einheiten
    if ik is None:
        return None
    w_h = ik * dk

    # Tiefenachse: NICHT ueber die Autokorrelation. Der Boden wird zum
    # Horizont hin gleichmaessig dunkler; dieser Trend korreliert mit jeder
    # langen Periode und zieht das Ergebnis immer weiter nach oben, bis die
    # "Teilung" nur noch die halbe Flaeche ist. Erst nach Abzug des Trends
    # zeigt das Spektrum die echte Fugenfolge.
    db = 0.00001 / skala_h
    kanten = np.arange(0.00105 / skala_h, 0.0085 / skala_h, db)
    n_b = len(kanten) - 1
    prof = np.zeros(n_b)
    cnt = np.zeros(n_b)
    mitte = np.abs(k) < 0.50
    idx = ((1.0 / v[ok][mitte] - kanten[0]) / db).astype(int)
    gut = (idx >= 0) & (idx < n_b)
    np.add.at(prof, idx[gut], gew[mitte][gut])
    np.add.at(cnt, idx[gut], 1.0)
    prof = prof / np.maximum(cnt, 1)
    trend = np.convolve(prof, np.ones(41) / 41, "same")
    sig = prof - trend
    F = np.abs(np.fft.rfft(sig * np.hanning(len(sig))))
    frq = np.fft.rfftfreq(len(sig), db)
    erlaubt = (frq > 1500 * skala_h) & (frq < 6000 * skala_h)     # Teilung 0.00017 .. 0.00067 (bei skala_h=1)
    if not erlaubt.any():
        return None
    j = int(np.argmax(np.where(erlaubt, F, 0)))
    s_z = float(1.0 / frq[j])
    gb = float(F[j] / F[erlaubt].mean())
    ordn = np.argsort(np.where(erlaubt, F, 0))[::-1][:6]
    nb = [(1.0 / frq[t], float(F[t])) for t in ordn if erlaubt[t] and F[t] > 0.55 * F[j]]

    # Die Autokorrelation kennt die TEILUNG, nicht die LAGE. Ohne Phase
    # laesst sich die Rueckprojektion nicht pruefen -- ein um eine halbe
    # Fliese versetztes Raster sieht falsch aus, obwohl die Teilung stimmt.
    # Die Phase faellt aus der Faltung mit dem gemessenen Rillenbild.
    def phase(werte, gew_, teil):
        ph = np.linspace(0, teil, 200, endpoint=False)
        antwort = [float((gew_ * np.cos(2 * np.pi * (werte - p0) / teil)).sum()) for p0 in ph]
        return float(ph[int(np.argmax(antwort))])

    ph_k = phase(k, gew, w_h)
    bmitte = 1.0 / v[ok][mitte]
    ph_b = phase(bmitte, gew[mitte], s_z)
    # Ehrliche Bandbreite: alle nahezu gleich starken Gipfel ergeben ebenso
    # gueltige Brennweiten. Das ist die Restunsicherheit dieses Schritts.
    f_band = sorted({round((j * dk) / s_z) for j, _ in nk} | {round(w_h / t) for t, _ in nb}
                    | {round(w_h / s_z)})
    return {
        "fliesenbreite_je_h": float(w_h),
        "fliesentiefe_1_durch_v": float(s_z),
        "phase_seite_k": float(ph_k),
        "phase_tiefe_b": float(ph_b),
        "korrelation_seite": gk,
        "korrelation_tiefe": gb,
        "f_px": float(w_h / s_z),
        "f_bandbreite_px": f_band,
        "nebengipfel_seite": [[float(j * dk), float(v)] for j, v in nk],
        "nebengipfel_tiefe": [[float(t), float(vv)] for t, vv in nb],
        "annahme": "quadratische Bodenfliesen",
        "provenienz": RECONSTRUCTED,
    }


def stuetzenraster(saeulen, ppx, ppy):
    """Lage der Stuetzen: Reihen in X, Jochteilung in Z.

    Ohne Brennweitenannahme -- die kommt aus dem Bodenraster. Hier wird
    nur gemessen, wo die Stuetzen stehen, und geprueft, ob sie ueberhaupt
    ein Raster bilden: eine Reihe muss EINE Seitenlage haben, und ihre
    Glieder muessen in 1/v gleichabstaendig sitzen.
    """
    if len(saeulen) < 4:
        return None
    br = np.array([s["breite_je_h"] for s in saeulen])
    # Robuste Stuetzenbreite: alle Stuetzen sind gleich breit
    w_h = float(np.median(br))
    # Tiefe aus der Bildbreite -- unabhaengig vom Fusspunkt, daher zweite Quelle
    for s in saeulen:
        s["v_aus_breite"] = s["breite_px"] / w_h
        s["x_je_h_aus_breite"] = (s["x_mitte"] - ppx) / s["v_aus_breite"]

    # Reihen bilden: gleiche Seitenlage X/h
    punkte = sorted(saeulen, key=lambda s: s["x_je_h"])
    reihen = []
    for s in punkte:
        for r in reihen:
            if abs(np.mean([t["x_je_h"] for t in r]) - s["x_je_h"]) < 0.22:
                r.append(s)
                break
        else:
            reihen.append([s])
    reihen = [r for r in reihen if len(r) >= 2]
    reihen.sort(key=lambda r: np.mean([t["x_je_h"] for t in r]))
    if len(reihen) < 2:
        return None

    # Tiefenteilung: innerhalb einer Reihe ist 1/v arithmetisch.
    # Der kleinste beobachtete Abstand ist die Obergrenze fuer die Teilung
    # (ein Joch kann nie groesser sein als der engste Nachbarabstand).
    teilungen, gueten, ordnungen = [], [], []
    for r in reihen:
        q = np.sort(np.array([1.0 / t["v"] for t in r]))
        if len(q) < 3:
            continue
        eng = float(np.min(np.diff(q)))
        g = gitterteilung(q, eng * 0.45, eng * 1.25)
        if g is None:
            continue
        teilungen.append(g["teilung"])
        gueten.append(g["restfehler"])
        ordnungen.append(g["ordnungszahlen"])
    if not teilungen:
        return None
    s_z = float(np.median(teilungen))
    streuungen = gueten

    x_reihen = [float(np.mean([t["x_je_h"] for t in r])) for r in reihen]
    x_streuung = [float(np.std([t["x_je_h"] for t in r])) for r in reihen]
    seiten = np.diff(x_reihen)
    joch_x = float(np.median(seiten))
    return {
        "reihenabstand_je_h": joch_x,
        "reihen_x_streuung": x_streuung,
        "tiefenteilung_1_durch_v": s_z,
        "reihen_x_je_h": x_reihen,
        "reihenabstand_streuung": float(np.median(streuungen)) if streuungen else None,
        "ordnungszahlen_je_reihe": ordnungen,
        "stuetzenbreite_je_h": w_h,
        "reihen_besetzung": [len(r) for r in reihen],
    }


# ---------------------------------------------------------------------------
# Hauptlauf
# ---------------------------------------------------------------------------

def vermessen(pfad, anker_fliese_m):
    """Exp. 4: gibt IMMER einen strukturierten Bericht zurueck, nie einen
    Absturz. `bericht["status"]` ist "declined", wenn nicht einmal ein
    Fluchtpunkt gefunden wurde (das Bild zeigt vermutlich keine Manhattan-
    Zentralperspektive -- z. B. eine isometrische Illustration statt eines
    Fotos) -- sonst "measured". Einzelne Teilschritte (Leuchtbaender,
    Stuetzen, Bodenraster/Brennweite), die eine bestimmte Bildstruktur
    voraussetzen, die dieses konkrete Bild vielleicht nicht zeigt, melden
    stattdessen UNKNOWN fuer genau dieses Feld, statt das ganze Programm
    abzubrechen (Aufgabe 12 des Maintainer-Briefings: "Richtig geraten ist
    nicht gemessen" -- das gilt auch fuer "lieber abbrechen als raten").
    """
    rgb, lum = luminanz(pfad)
    H, W = lum.shape
    geo = deklinieren(H, W)
    skala_h = H / _REF_H
    gx, gy = sobel(lum)
    mag = np.hypot(gx, gy)
    lf = Linienfeld(mag)

    # Immer ALLE Top-Level-Felder vorbesetzen (auf "nichts gemessen"), bevor irgendein
    # frueher Ausstieg (status="declined") moeglich ist. Ohne das war der Bericht im
    # abgelehnten Fall nur {"status", "grund"} gross -- ein Verstoss gegen das eigene
    # Versprechen "vermessen() gibt IMMER einen strukturierten Bericht zurueck" (siehe
    # Docstring): ein Aufrufer, der z.B. bericht["bodenraster"] liest, ohne zuerst auf
    # status="declined" zu pruefen, bekaeme einen KeyError statt eines sauberen None.
    bericht = {
        "status": "measured", "fluchtpunkt": None, "hauptpunkt": None,
        "wand_boden_fuge": None, "wand_decken_fuge": None,
        "deckenhoehe_je_kamerahoehe": None, "leuchtbaender": None,
        "spiegelprobe": None, "stuetzen": None, "raster": None,
        "bodenraster": None, "massstab": None, "raum_je_kamerahoehe": None,
        "raum_meter": None, "nicht_messbar": [],
    }

    # --- Fluchtpunkt --------------------------------------------------------
    kand = []
    for ymin, ymax, lo, hi in (
            (0, geo["vp_oben_ende"], 55, 75), (0, geo["vp_oben_ende"], 95, 135),
            (geo["vp_unten_start"], H, 20, 60), (geo["vp_unten_start"], H, 120, 175),
            (geo["vp_unten_start"], H, 0, 20)):
        for t, r in lf.hough(ymin, ymax, 10, lo, hi):
            L = lf.verfeinern(t, r, (ymin, ymax))
            if L and L["laenge"] > 150 * skala_h:
                kand.append(L)
    if len(kand) < 6:
        bericht["status"] = "declined"
        bericht["grund"] = ("Zu wenige konvergierende Linien fuer einen Fluchtpunkt gefunden. "
                             "Dieses Bild zeigt vermutlich keine Manhattan-Zentralperspektive "
                             "(z. B. eine isometrische/orthografische Illustration statt eines "
                             "Innenraumfotos) -- fuer diesen Fall ist dieser Provider nicht "
                             "zustaendig, siehe docs/first-glimpse-depth-layers.md.")
        return rgb, lum, bericht
    vp, inlier, rest = ransac_fluchtpunkt(kand)
    ppx, ppy = float(vp[0]), float(vp[1])
    bericht["status"] = "measured"
    bericht["fluchtpunkt"] = {
        "x": ppx, "y": ppy,
        "linien_gesamt": len(kand),
        "linien_tragend": int(inlier.sum()),
        "restfehler_px": rest,
        "provenienz": MEASURED,
    }

    # --- Parallelitaetsprobe -> Hauptpunkt ----------------------------------
    quer = []
    for ymin, ymax in ((0, geo["vp_oben_ende"]), (geo["parallel_unten_start"], H)):
        for t, r in lf.hough(ymin, ymax, 14, 85, 95):
            L = lf.verfeinern(t, r, (ymin, ymax))
            if L and L["laenge"] > 500 * skala_h:
                quer.append(math.degrees(math.atan2(L["richtung"][1], L["richtung"][0])))
    quer = np.array([(a + 180) % 180 for a in quer])
    bericht["hauptpunkt"] = {
        "x": ppx, "y": ppy,
        "begruendung": ("Quer- und Senkrechtlinien sind im Bild parallel; damit steht die "
                        "Bildebene parallel zu Raum-X und Raum-Y und der Hauptpunkt faellt "
                        "mit dem Fluchtpunkt zusammen. Das Bild ist ein Ausschnitt."),
        "querlinien_winkelstreuung_grad": float(np.std(quer)) if len(quer) else None,
        "bildmitte": [W / 2.0, H / 2.0],
        "versatz_zur_bildmitte_px": [ppx - W / 2.0, ppy - H / 2.0],
        "provenienz": MEASURED,
    }

    # --- Rueckwand (optional: liefert hc_h fuer die folgenden Schritte) -----
    fuge = None
    hc_h = None
    try:
        fuge = wand_boden_fuge(lum, ppx, ppy, geo["wbf_von"], geo["wbf_bis"])
        fuge["provenienz"] = MEASURED
        bericht["wand_boden_fuge"] = fuge
        oben = wand_decken_fuge(lum, ppy, geo["wdf_x0"], geo["wdf_x1"],
                                 geo["wdf_decke_von"], geo["wdf_decke_bis"],
                                 geo["wdf_wand_von"], geo["wdf_wand_bis"],
                                 geo["wdf_such_von"], geo["wdf_such_bis"])
        if oben is None:
            raise ValueError("Wand-Decken-Fuge nicht gefunden")
        hc_h = (ppy - oben) / fuge["v"]
        # Plausibilitaetsprobe (Exp. 4): eine Decke UNTER dem Fluchtpunkt oder
        # absurd hoch ueber der Kamerahoehe ist kein Messfehler-Rauschen mehr,
        # sondern das Zeichen, dass diese Wand-Decken-Fuge gar keine echte
        # Deckenkante ist (z. B. weil das Bild keine echte Manhattan-
        # Zentralperspektive zeigt, sondern nur zufaellig genug konvergierende
        # Kanten fuer einen Fluchtpunkt hatte). "Richtig geraten ist nicht
        # gemessen" gilt auch hier: lieber UNKNOWN als eine negative Deckenhoehe
        # als "MEASURED" ausweisen.
        if not (0 < hc_h < 20):
            raise ValueError(
                f"unplausible Deckenhoehe hc/h={hc_h:.3f} (erwartet 0..20) -- "
                "vermutlich keine echte Manhattan-Zentralperspektive")
        bericht["wand_decken_fuge"] = {"y": oben, "v": float(oben - ppy), "provenienz": MEASURED}
        bericht["deckenhoehe_je_kamerahoehe"] = {
            "wert": float(hc_h),
            "lichte_raumhoehe_je_kamerahoehe": float(1.0 + hc_h),
            "provenienz": MEASURED,
        }
    except Exception as e:
        hc_h = None  # Python haelt Zuweisungen aus dem try-Block auch nach einer
                     # Exception -- ohne diesen Reset wuerde ein unplausibler Wert
                     # (siehe Plausibilitaetsprobe oben) trotzdem an die folgenden
                     # Schritte (Leuchtbaender/Spiegelprobe) durchgereicht.
        bericht.setdefault("wand_boden_fuge", None)
        bericht["wand_decken_fuge"] = None
        bericht["deckenhoehe_je_kamerahoehe"] = {"wert": None, "provenienz": UNKNOWN, "grund": str(e)}

    # --- Leuchtbaender + Spiegelprobe (optional, braucht hc_h) --------------
    baender = []
    if hc_h is not None:
        try:
            baender = leuchtbaender(lum, ppx, ppy, geo["deckengrenze"])
            for b in baender:
                b["x_je_hc"] = -b["k"]
                b["x_je_h"] = -b["k"] * hc_h
            bericht["leuchtbaender"] = {"anzahl": len(baender), "liste": baender, "provenienz": MEASURED}
            if len(baender) >= 2:
                xs = sorted(b["x_je_h"] for b in baender)
                bericht["leuchtbaender"]["teilung_je_h"] = float(np.median(np.diff(xs)))
            proben = spiegelprobe(lum, ppx, ppy, baender, hc_h, geo["spiegel_zeilen"], geo["spiegel_rand"])
            # Die Spiegelung ist das GENAUERE Instrument. Die Wandoberkante ist ein
            # weicher Helligkeitsuebergang ueber wenige Pixel; die Spiegelung wirkt
            # ueber die ganze Bildhoehe und wird von zwei Baendern unabhaengig
            # bestaetigt. Also fuehrt sie -- und die Wandkante wird zur Gegenprobe.
            rueck = [p["hc_je_h_aus_spiegelung"] for p in proben if p["hc_je_h_aus_spiegelung"]]
            hc_kante = hc_h
            if len(rueck) >= 2:
                hc_h = float(np.median(rueck))
                for b in baender:
                    b["x_je_h"] = -b["k"] * hc_h
                if len(baender) >= 2:
                    xs = sorted(b["x_je_h"] for b in baender)
                    bericht["leuchtbaender"]["teilung_je_h"] = float(np.median(np.diff(xs)))
            bericht["spiegelprobe"] = {
                "erklaerung": ("Ein Leuchtband in der Hoehe hc hat im Boden ein Spiegelbild in der "
                               "scheinbaren Tiefe 2h+hc. Aus der Lage des angetroffenen Glanzstreifens "
                               "faellt hc zurueck. Das misst ueber die volle Bildhoehe statt ueber die "
                               "wenigen weichen Pixel der Wandoberkante -- darum fuehrt dieser Wert."),
                "proben": proben,
                "hc_je_h_aus_spiegelung": float(np.median(rueck)) if rueck else None,
                "hc_je_h_aus_wandkante": float(hc_kante),
                "streuung_zwischen_baendern": float(np.std(rueck)) if len(rueck) > 1 else None,
                "abweichung_der_beiden_verfahren_prozent": (
                    float(abs(np.median(rueck) - hc_kante) / hc_kante * 100) if rueck else None),
            }
            bericht["deckenhoehe_je_kamerahoehe"] = {
                "wert": float(hc_h),
                "lichte_raumhoehe_je_kamerahoehe": float(1.0 + hc_h),
                "quelle": "spiegelprobe" if len(rueck) >= 2 else "wandkante",
                "provenienz": MEASURED,
            }
        except Exception as e:
            bericht["leuchtbaender"] = {"anzahl": len(baender), "liste": baender, "provenienz": UNKNOWN}
            bericht["spiegelprobe"] = {"proben": [], "provenienz": UNKNOWN, "grund": str(e)}
    else:
        bericht["leuchtbaender"] = {"anzahl": 0, "liste": [], "provenienz": UNKNOWN}
        bericht["spiegelprobe"] = {"proben": [], "provenienz": UNKNOWN,
                                    "grund": "keine Deckenhoehe (Wand-Decken-Fuge nicht gefunden)"}

    # --- Stuetzen (optional -- viele Innenraeume/Fassaden haben keine) ------
    sa = []
    raster = None
    try:
        sa = stuetzen(lum, ppx, ppy, geo["stuetzen_band"], geo["stuetzen_fuss_von"],
                      geo["stuetzen_fuss_rand"], geo["stuetzen_hell_schritt"])
        bericht["stuetzen"] = {"anzahl": len(sa), "liste": sa, "provenienz": MEASURED}
        raster = stuetzenraster(sa, ppx, ppy)
        if raster is None:
            raise ValueError("Stuetzenraster nicht bestimmbar (zu wenige/kein erkennbares Raster)")
        raster["provenienz"] = MEASURED
        bericht["raster"] = raster
    except Exception as e:
        bericht["stuetzen"] = {"anzahl": len(sa), "liste": sa, "provenienz": UNKNOWN}
        bericht["raster"] = None
        bericht["raster_grund"] = str(e)

    # --- Brennweite aus dem Bodenraster (optional -- braucht ein gekacheltes
    # oder sonst periodisch strukturiertes Bodenmuster) ----------------------
    # Zentralperspektive kann Tiefe und Brennweite nicht trennen: JEDE
    # Brennweite liefert eine Rekonstruktion, die sich exakt auf das
    # Ausgangsbild zurueckbildet. Erst wer den Blickpunkt verlaesst, sieht
    # den Unterschied. Genau eine Formaussage muss also gesetzt werden.
    #
    # Gewaehlt sind quadratische Bodenfliesen -- ein Baumodul, das man dem
    # Bild ansieht. Das Stuetzenjoch waere die naheliegende Alternative,
    # ist hier aber nachweislich falsch: es ergaebe 28 Grad Bildwinkel,
    # bei dem die Decke nicht mehr ueber der Kamera stuende. Sie steht dort.
    boden = None
    try:
        boden = bodenraster(lum, ppx, ppy, geo["boden_von"], geo["boden_v_min"])
        if boden is None:
            raise ValueError("Bodenraster nicht bestimmbar (kein periodisches Bodenmuster erkannt)")
        bericht["bodenraster"] = boden
        f = boden["f_px"]
        bericht["bodenraster"]["bildwinkel_senkrecht_grad"] = float(
            math.degrees(math.atan(ppy / f) + math.atan((H - ppy) / f)))
    except Exception as e:
        bericht["bodenraster"] = None
        bericht["bodenraster_grund"] = str(e)

    # --- Massstab + zusammengesetzter Raum (brauchen die Brennweite aus dem
    # Bodenraster -- ohne sie bleibt alles unter diesem Punkt UNKNOWN) -------
    if boden is not None:
        # Anker ist das Bodenmodul, nicht die Kamerahoehe: eine Fliese ist ein
        # Bauteil mit Normmass, die Kamerahoehe waere geraten. Dass daraus eine
        # Kamerahoehe von rund 1,7 m faellt, ist die Gegenprobe auf den Anker.
        w_h = boden["fliesenbreite_je_h"]
        h_m = anker_fliese_m / w_h
        f = boden["f_px"]
        bericht["massstab"] = {
            "anker": "Bodenfliese (Kantenlaenge)",
            "anker_m": anker_fliese_m,
            "kamerahoehe_m": float(h_m),
            "hinweis": ("Ein Einzelbild kennt keine Meter. Alle Verhaeltnisse sind gemessen; "
                        "genau diese eine Laenge ist gesetzt. Wer sie aendert, skaliert die "
                        "ganze Halle -- ihre Form bleibt unberuehrt."),
            "gegenprobe": ("Aus einem 0,60-m-Modul faellt eine Kamerahoehe von rund 1,7 m -- "
                           "Augenhoehe. Der Anker widerspricht sich also nicht selbst."),
            "provenienz": DECLARED,
        }
        z_wand_h = (f / fuge["v"]) if fuge is not None else None
        joch_h = raster["reihenabstand_je_h"] if raster is not None else None
        bericht["raum_je_kamerahoehe"] = {
            "bodenhoehe": -1.0,
            "deckenhoehe": float(hc_h) if hc_h is not None else None,
            "lichte_hoehe": float(1.0 + hc_h) if hc_h is not None else None,
            "rueckwand_tiefe": float(z_wand_h) if z_wand_h is not None else None,
            "stuetzenreihen_abstand": float(joch_h) if joch_h is not None else None,
            "stuetzenbreite": float(raster["stuetzenbreite_je_h"]) if raster is not None else None,
            "stuetzen_jochteilung": (float(f * raster["tiefenteilung_1_durch_v"])
                                     if raster is not None else None),
            "fliesenmodul": float(w_h),
            "brennweite_px": float(f),
        }
        bericht["raum_meter"] = {
            "lichte_hoehe_m": float((1.0 + hc_h) * h_m) if hc_h is not None else None,
            "rueckwand_tiefe_m": float(z_wand_h * h_m) if z_wand_h is not None else None,
            "stuetzenreihen_abstand_m": float(joch_h * h_m) if joch_h is not None else None,
            "stuetzenbreite_m": (float(raster["stuetzenbreite_je_h"] * h_m)
                                 if raster is not None else None),
            "stuetzen_jochteilung_m": (float(f * raster["tiefenteilung_1_durch_v"] * h_m)
                                       if raster is not None else None),
            "fliesenmodul_m": float(w_h * h_m),
            "kamerahoehe_m": float(h_m),
            "leuchtband_teilung_m": (float(bericht["leuchtbaender"].get("teilung_je_h", 0) * h_m)
                                     if "teilung_je_h" in bericht["leuchtbaender"] else None),
        }
    else:
        bericht["massstab"] = {"provenienz": UNKNOWN,
                                "grund": "kein Bodenraster -> keine Brennweite -> kein Massstab ableitbar"}
        bericht["raum_je_kamerahoehe"] = None
        bericht["raum_meter"] = None

    bericht["nicht_messbar"] = [
        "Hallenbreite -- die Rueckwand fuellt das Bild bis an beide Raender; "
        "seitlich geht der Raum weiter, als das Bild zeigt.",
        "Alles hinter der Rueckwand und hinter den Stuetzen (Einzelbild, keine Rueckseiten).",
        "Der absolute Massstab -- dafuer steht der deklarierte Anker.",
        "Die Brennweite ohne Formaussage: jede Brennweite bildet sich exakt auf das "
        "Ausgangsbild zurueck. Gewaehlt wurde die quadratische Bodenfliese; das "
        "quadratische Stuetzenjoch schied aus, es ergaebe 28 Grad Bildwinkel.",
    ]
    return rgb, lum, bericht


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bild")
    ap.add_argument("--fliese-m", type=float, default=0.60,
                    help="metrischer Anker: Kantenlaenge einer Bodenfliese (Vorgabe 0.60 m)")
    ap.add_argument("--out", default=None, help="Zielverzeichnis (Vorgabe: neben dem Bild)")
    a = ap.parse_args()

    ziel = a.out or os.path.dirname(os.path.abspath(a.bild))
    os.makedirs(ziel, exist_ok=True)
    basis = os.path.splitext(os.path.basename(a.bild))[0]

    rgb, lum, bericht = vermessen(a.bild, a.fliese_m)
    with open(a.bild, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    modell = {
        "format": "SHADED.single-view-room.v1",
        "provider": PROVIDER,
        "version": VERSION,
        "quelle": {"datei": os.path.basename(a.bild),
                   "sha256": digest,
                   "breite": lum.shape[1], "height": lum.shape[0]},
        "koordinaten": ("Rechtssystem. Ursprung = Kamera. X rechts, Y oben, Z in die "
                        "Halle. Der Boden liegt bei Y = -Kamerahoehe."),
        "messung": bericht,
    }
    pfad = os.path.join(ziel, basis + ".room.json")
    with open(pfad, "w") as fh:
        json.dump(modell, fh, indent=2, ensure_ascii=False)
    print("geschrieben:", pfad)

    b = bericht
    if b.get("status") == "declined":
        print("\n=== Abgelehnt ===")
        print(b["grund"])
        sys.exit(1)

    print("\n=== Messbericht ===")
    print("Fluchtpunkt      (%.2f, %.2f)  aus %d von %d Linien, Restfehler %.2f px"
          % (b["fluchtpunkt"]["x"], b["fluchtpunkt"]["y"], b["fluchtpunkt"]["linien_tragend"],
             b["fluchtpunkt"]["linien_gesamt"], b["fluchtpunkt"]["restfehler_px"]))
    if b["wand_boden_fuge"]:
        print("Wand-Boden-Fuge  y=%.1f ueber %d Stuetzstellen, Restfehler %.2f px, Neigung %.1f px"
              % (b["wand_boden_fuge"]["y"], b["wand_boden_fuge"]["stuetzstellen"],
                 b["wand_boden_fuge"]["restfehler_px"], b["wand_boden_fuge"]["neigung_px_je_breite"]))
    else:
        print("Wand-Boden-Fuge  UNKNOWN --", b.get("deckenhoehe_je_kamerahoehe", {}).get("grund", "?"))
    if b["deckenhoehe_je_kamerahoehe"].get("wert") is not None:
        print("Deckenhoehe      hc = %.4f h   ->  lichte Hoehe %.4f h"
              % (b["deckenhoehe_je_kamerahoehe"]["wert"],
                 b["deckenhoehe_je_kamerahoehe"]["lichte_raumhoehe_je_kamerahoehe"]))
    for p in b["spiegelprobe"]["proben"]:
        print("  Spiegelprobe   Band k=%+.4f -> erwartet %+.4f, gemessen %+.4f  (%.1f %%)"
              % (p["band_k"], p["erwartet_k"], p["gemessen_k"], p["abweichung_prozent"]))
    if b["raster"]:
        print("Stuetzen         %d gefunden, Breite %.4f h, Reihen %s (Streuung %s)"
              % (b["stuetzen"]["anzahl"], b["raster"]["stuetzenbreite_je_h"],
                 ["%.2f" % x for x in b["raster"]["reihen_x_je_h"]],
                 ["%.3f" % x for x in b["raster"]["reihen_x_streuung"]]))
        print("Stuetzenraster   Reihenabstand %.3f h, Jochteilung(1/v) %.6f"
              % (b["raster"]["reihenabstand_je_h"], b["raster"]["tiefenteilung_1_durch_v"]))
    else:
        print("Stuetzen         UNKNOWN --", b.get("raster_grund", "?"))
    if b["bodenraster"]:
        print("Bodenraster      Fliese %.4f h seitlich, %.6f in 1/v  (Korr %.2f / %.2f)"
              % (b["bodenraster"]["fliesenbreite_je_h"], b["bodenraster"]["fliesentiefe_1_durch_v"],
                 b["bodenraster"]["korrelation_seite"], b["bodenraster"]["korrelation_tiefe"]))
        print("Brennweite       f = %.0f px  ->  senkrechter Bildwinkel %.1f Grad"
              % (b["bodenraster"]["f_px"], b["bodenraster"]["bildwinkel_senkrecht_grad"]))
        print("\n=== In Metern (Anker: Fliese %.2f m) ===" % a.fliese_m)
        for k, v in b["raum_meter"].items():
            if v is not None:
                print("  %-26s %.2f" % (k, v))
    else:
        print("Bodenraster      UNKNOWN --", b.get("bodenraster_grund", "?"))
        print("Massstab         UNKNOWN -- kein Bodenraster, kein Metermassstab ableitbar")


if __name__ == "__main__":
    main()
