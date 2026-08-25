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
VERSION = "1.0.0"

# Provenienzklassen aus dem Providervertrag.
MEASURED = "MEASURED"
RECONSTRUCTED = "RECONSTRUCTED"
DECLARED = "DECLARED"

# Referenzmasse von content/raum/messehalle.png (1103x1426), an denen die
# urspruengliche Messkette entwickelt und kalibriert wurde. Jede vormals
# absolute Pixelgrenze im Modul ist eine Bruchzahl dieser beiden Werte --
# so bleibt jede Suchregion an demselben Bildausschnitt verankert, auch
# wenn ein anderes Foto eine andere Aufloesung oder einen anderen
# Seitenschnitt hat. Ohne diese Umrechnung sucht z.B. die Stuetzenerkennung
# in der falschen Bildhaelfte, sobald ein Foto nicht 1103x1426 ist --
# genau das Symptom, an dem `Stuetzenraster nicht bestimmbar` haengt.
_REF_H = 1426.0
_REF_W = 1103.0


def _refy(px, H):
    """Pixel-y aus der Referenzhoehe (1426) auf die tatsaechliche Bildhoehe H."""
    return int(round(px / _REF_H * H))


def _refx(px, W):
    """Pixel-x aus der Referenzbreite (1103) auf die tatsaechliche Bildbreite W."""
    return int(round(px / _REF_W * W))


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
        # Flaechenbasierter Skalenfaktor gegen das Referenzbild -- linear in
        # Pixellaengen (Wurzel aus dem Flaechenverhaeltnis), damit Toleranzen
        # in Pixeln (Bandbreite, Nachbarunterdrueckung) unabhaengig von
        # Seitenverhaeltnis und Aufloesung an derselben SICHTBAREN Groesse
        # bleiben wie am Referenzbild.
        self.skala = math.sqrt((self.H * self.W) / (_REF_H * _REF_W))
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
        # Nachbarunterdrueckung auf der rho-Achse ist eine Pixeldistanz und
        # skaliert mit; die theta-Achse ist gradbasiert und bleibt unveraendert.
        sup_rho = max(4, int(round(14 * self.skala)))
        for _ in range(n_spitzen):
            idx = np.unravel_index(np.argmax(A), A.shape)
            if A[idx] <= 0:
                break
            out.append((th[idx[0]], idx[1] - diag))
            A[max(0, idx[0] - 8):idx[0] + 9, max(0, idx[1] - sup_rho):idx[1] + sup_rho + 1] = 0
        return out

    def verfeinern(self, theta, rho, bereich, band=None, runden=4, minpix=None):
        if band is None:
            band = 3.0 * self.skala
        if minpix is None:
            minpix = max(10, int(round(60 * self.skala ** 2)))
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

def wand_boden_fuge(lum, ppx, ppy):
    """Die Fuge, an der die Rueckwand auf den Boden trifft.

    Sie ist zugleich die Probe auf zwei Behauptungen: liegt sie ueber die
    ganze Breite auf gleicher Hoehe, steht die Wand frontal UND der Boden
    ist eben. Beides wird als Streuung zurueckgegeben statt behauptet.
    """
    H, W = lum.shape
    y_lo, y_hi = _refy(520, H), _refy(690, H)
    xs, ys = [], []
    for x in range(10, W - 10, 20):
        spalte = np.convolve(lum[:, max(0, x - 12):x + 13].mean(axis=1),
                             np.ones(3) / 3, "same")
        best, bestv = None, 0.0
        for y in range(y_lo, y_hi):
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


def wand_decken_fuge(lum, ppy, x0, x1):
    """Oberkante der Rueckwand: Uebergang von dunkler Decke zu heller Wand."""
    H = lum.shape[0]
    profil = np.convolve(lum[:, x0:x1].mean(axis=1), np.ones(3) / 3, "same")
    decke = profil[_refy(380, H):_refy(420, H)].mean()
    wand = profil[_refy(480, H):_refy(540, H)].mean()
    ziel = decke + 0.35 * (wand - decke)
    for y in range(_refy(400, H), _refy(500, H)):
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
    pix_min = max(50, int(round(400 / (_REF_H * _REF_W) * H * W)))
    v0_min = _refy(20, H)
    vv = -float(_refy(200, H))
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
            if len(pix) < pix_min:
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
            if abs(v0) < v0_min:
                continue
            k = (u0 - d[0] / d[1] * v0) if abs(d[1]) > 1e-6 else 0.0
            # exakt: Schnitt mit einer Geraden durch PP -> k = u/v am Fusspunkt
            k = u0 / v0 if abs(d[1]) < 1e-9 else None
            # Geradengleichung aufstellen und k als u/v eines beliebigen Punktes
            n = np.array([-d[1], d[0]])
            c = -(n @ [mx, my])
            # Punkt der Linie bei v = -200 (Referenzbild), skaliert im Deckenbereich
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


def spiegelprobe(lum, ppx, ppy, baender, hc_h):
    """Sitzen die Glanzstreifen dort, wo die Spiegelung sie hinlegt?

    Ein Leuchtband in der Hoehe hc ueber der Kamera hat im Boden ein
    Spiegelbild in der scheinbaren Tiefe 2h + hc darunter. Aus der
    direkten Steigung k folgt zwingend
        k_spiegel = -k * hc / (2h + hc).
    Wird diese Vorhersage im Bild angetroffen, ist hc/h bestaetigt --
    aus einer voellig anderen Bildregion als die Rueckwandkante.
    """
    H, W = lum.shape
    faktor = hc_h / (2.0 + hc_h)
    # Laengsstrukturen im Nahfeld: schmale Helligkeitsruecken
    zeilen = [_refy(f, H) for f in (1180, 1240, 1300, 1360, 1415)]
    x_rand = _refx(35, W)
    bg_fenster = max(3, _refx(61, W) | 1)
    ziel_tol = _refx(30, W)
    gefunden = []
    for y in zeilen:
        row = np.convolve(lum[y - 3:y + 4].mean(axis=0), np.ones(5) / 5, "same")
        bg = np.convolve(row, np.ones(bg_fenster) / bg_fenster, "same")
        r = row - bg
        pk = []
        for x in range(x_rand, W - x_rand):
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
            nah = [x for x in pk if abs(x - ziel) < ziel_tol]
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

def stuetzen(lum, ppx, ppy, band=None):
    """Dunkle Senkrechtbalken vor heller Wand.

    Rueckgabe je Stuetze: Bildkanten, Fusspunkt, Breite/h, X/h.
    Der Fusspunkt ist der Schluessel -- er sitzt auf der Bodenebene und
    uebersetzt Bildbreite in Weltbreite: w/h = dx/v.
    """
    H, W = lum.shape
    if band is None:
        band = (_refy(478, H), _refy(558, H))
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
        for y in range(_refy(585, H), H - _refy(34, H)):
            # anhaltend heller, sonst faengt jeder Glanzfleck den Fuss ab
            if all(innen[y + d] > schwelle for d in (0, 10, 20, 30)):
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

def bodenraster(lum, ppx, ppy):
    """Fliesenraster des Bodens, per Autokorrelation auf beiden Achsen.

    Der Belag ist stark durchgezeichnet -- Risse, Flecken, Kritzel. Eine
    Spitzensuche nach einzelnen Fugen findet darum vor allem Rauschen.
    Die Autokorrelation fragt nicht "wo liegt eine Fuge", sondern "bei
    welchem Versatz wiederholt sich die Flaeche" und mittelt dabei ueber
    den ganzen Boden.

    Beide Achsen sind brennweitenfrei ablesbar:
        k = u/v  -> Fliesenbreite  W/h
        b = 1/v  -> Fliesentiefe   D/(f h)
    """
    H, W = lum.shape
    y_untergrenze = _refy(600, H)
    v_min = _refy(140, H)
    R = np.clip(kastenfilter(lum, 5) - lum, 0, None)
    ys, xs = np.nonzero(R[y_untergrenze:] > 0.05)
    ys = ys + y_untergrenze
    v = ys - ppy
    u = xs - ppx
    ok = v > v_min
    pix_min = max(500, int(round(5000 / (_REF_H * _REF_W) * H * W)))
    if ok.sum() < pix_min:
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
    db = 0.00001
    kanten = np.arange(0.00105, 0.0085, db)
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
    erlaubt = (frq > 1500) & (frq < 6000)     # Teilung 0.00017 .. 0.00067
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


def deckenraster(lum, ppx, ppy, deckengrenze, baender):
    """Kassetten-/Traegerraster der Decke, seitlich per Autokorrelation.

    Analog zu `bodenraster()`, aber auf der Deckenflaeche statt dem Boden --
    mit einem Unterschied, der die Messung eher einfacher macht: die Decke
    ist keine durchgezeichnete Flaeche mit Rissen und Flecken, sondern ein
    gebautes Liniensystem aus wenigen hellen Fugen vor dunklem Feld. Die
    Leuchtbaender selbst sind um ein Vielfaches heller als jede Fuge und
    wuerden die Korrelation kappen -- ihre Flaechen (aus `leuchtbaender()`,
    per Bounding-Box) werden deshalb ausmaskiert, bevor gemessen wird.

    Liefert nur die SEITLICHE Teilung (u/v, "je_h") -- das reicht als
    Massstabsanker, ohne eine Quadrat-Annahme: anders als beim Bodenraster
    wird hier keine Brennweite gebraucht, nur ein Verhaeltnis zur
    Kamerahoehe. Ob das Deckenfeld quadratisch ist, wird nicht vorausgesetzt
    -- dafuer fehlt hier die zweite (Tiefen-)Achse bewusst.
    """
    H, W = lum.shape
    R = np.clip(kastenfilter(lum, 5) - lum, 0, None)
    frei = np.ones_like(lum, bool)
    for b in baender:
        x0, x1 = sorted([b["p0"][0], b["p1"][0]])
        y0, y1 = sorted([b["p0"][1], b["p1"][1]])
        m0 = max(0, int(y0) - 14)
        m1 = min(deckengrenze, int(y1) + 14)
        n0 = max(0, int(x0) - 14)
        n1 = min(W, int(x1) + 14)
        frei[m0:m1, n0:n1] = False
    R = R * frei
    ys, xs = np.nonzero(R[:deckengrenze] > 0.04)
    v = ppy - ys.astype(np.float64)      # positiv: oberhalb des Hauptpunkts
    u = xs.astype(np.float64) - ppx
    ok = v > _refy(24, H)
    pix_min = max(200, int(round(2000 / (_REF_H * _REF_W) * H * W)))
    if ok.sum() < pix_min:
        return None
    k = u[ok] / v[ok]
    gew = R[ys[ok], xs[ok]] * np.sqrt(v[ok])

    def gipfel(sig, lo, hi):
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
    ik, gk, nk = gipfel(hist, 40, 260)      # 0.08 .. 0.52 in k-Einheiten
    if ik is None:
        return None
    w_h = ik * dk

    def phase(werte, gew_, teil):
        ph = np.linspace(0, teil, 200, endpoint=False)
        antwort = [float((gew_ * np.cos(2 * np.pi * (werte - p0) / teil)).sum()) for p0 in ph]
        return float(ph[int(np.argmax(antwort))])

    ph_k = phase(k, gew, w_h)
    return {
        "gitterbreite_je_h": float(w_h),
        "phase_seite_k": float(ph_k),
        "korrelation_seite": gk,
        "nebengipfel_seite": [[float(j * dk), float(vv)] for j, vv in nk],
        "annahme": "keine -- reine Seitenmessung, kein Quadrat vorausgesetzt",
        "provenienz": MEASURED,
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

def vermessen(pfad, anker_m, anker_quelle="decke"):
    rgb, lum = luminanz(pfad)
    H, W = lum.shape
    gx, gy = sobel(lum)
    mag = np.hypot(gx, gy)
    lf = Linienfeld(mag)

    bericht = {}

    # Flaechenbasierter Skalenfaktor gegen das Referenzbild (siehe
    # Linienfeld.skala) -- fuer Pixel-Laengentoleranzen ausserhalb der Klasse.
    _skala = math.sqrt((H * W) / (_REF_H * _REF_W))

    # --- Fluchtpunkt --------------------------------------------------------
    # Bild in Wand- und Bodenhaelfte geteilt (Referenzbild: Trennlinien bei
    # 432 und 560 von 1426 Zeilen) -- als Bruchzahl von H, damit die Suche
    # bei anderer Bildgroesse in derselben Bildregion bleibt.
    _y_wand = _refy(432, H)
    _y_boden = _refy(560, H)
    kand = []
    for ymin, ymax, lo, hi in ((0, _y_wand, 55, 75), (0, _y_wand, 95, 135),
                               (_y_boden, H, 20, 60), (_y_boden, H, 120, 175),
                               (_y_boden, H, 0, 20)):
        for t, r in lf.hough(ymin, ymax, 10, lo, hi):
            L = lf.verfeinern(t, r, (ymin, ymax))
            if L and L["laenge"] > 150 * _skala:
                kand.append(L)
    if len(kand) < 6:
        raise SystemExit("zu wenige Linien fuer einen Fluchtpunkt gefunden")
    vp, inlier, rest = ransac_fluchtpunkt(kand, toleranz=10.0 * _skala)
    ppx, ppy = float(vp[0]), float(vp[1])
    bericht["fluchtpunkt"] = {
        "x": ppx, "y": ppy,
        "linien_gesamt": len(kand),
        "linien_tragend": int(inlier.sum()),
        "restfehler_px": rest,
        "provenienz": MEASURED,
    }

    # --- Parallelitaetsprobe -> Hauptpunkt ----------------------------------
    quer = []
    for ymin, ymax in ((0, _y_wand), (_refy(600, H), H)):
        for t, r in lf.hough(ymin, ymax, 14, 85, 95):
            L = lf.verfeinern(t, r, (ymin, ymax))
            if L and L["laenge"] > 500 * _skala:
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

    # --- Rueckwand ----------------------------------------------------------
    fuge = wand_boden_fuge(lum, ppx, ppy)
    fuge["provenienz"] = MEASURED
    bericht["wand_boden_fuge"] = fuge
    oben = wand_decken_fuge(lum, ppy, _refx(420, W), _refx(900, W))
    if oben is None:
        raise SystemExit("Wand-Decken-Fuge nicht gefunden")
    hc_h = (ppy - oben) / fuge["v"]
    bericht["wand_decken_fuge"] = {"y": oben, "v": float(oben - ppy), "provenienz": MEASURED}
    bericht["deckenhoehe_je_kamerahoehe"] = {
        "wert": float(hc_h),
        "lichte_raumhoehe_je_kamerahoehe": float(1.0 + hc_h),
        "provenienz": MEASURED,
    }

    # --- Leuchtbaender + Spiegelprobe --------------------------------------
    deckengrenze = _refy(440, H)
    baender = leuchtbaender(lum, ppx, ppy, deckengrenze)
    for b in baender:
        b["x_je_hc"] = -b["k"]
        b["x_je_h"] = -b["k"] * hc_h
    bericht["leuchtbaender"] = {"anzahl": len(baender), "liste": baender, "provenienz": MEASURED}
    if len(baender) >= 2:
        xs = sorted(b["x_je_h"] for b in baender)
        bericht["leuchtbaender"]["teilung_je_h"] = float(np.median(np.diff(xs)))
    proben = spiegelprobe(lum, ppx, ppy, baender, hc_h)
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

    # --- Deckenraster (Kassetten-/Traegerteilung) ---------------------------
    decke = deckenraster(lum, ppx, ppy, deckengrenze, baender)
    if decke is not None:
        bericht["deckenraster"] = decke

    # --- Stuetzen -----------------------------------------------------------
    sa = stuetzen(lum, ppx, ppy)
    bericht["stuetzen"] = {"anzahl": len(sa), "liste": sa, "provenienz": MEASURED}
    raster = stuetzenraster(sa, ppx, ppy)
    if raster is None:
        raise SystemExit("Stuetzenraster nicht bestimmbar")
    raster["provenienz"] = MEASURED
    bericht["raster"] = raster

    # --- Brennweite aus dem Bodenraster ------------------------------------
    # Zentralperspektive kann Tiefe und Brennweite nicht trennen: JEDE
    # Brennweite liefert eine Rekonstruktion, die sich exakt auf das
    # Ausgangsbild zurueckbildet. Erst wer den Blickpunkt verlaesst, sieht
    # den Unterschied. Genau eine Formaussage muss also gesetzt werden.
    #
    # Gewaehlt sind quadratische Bodenfliesen -- ein Baumodul, das man dem
    # Bild ansieht. Das Stuetzenjoch waere die naheliegende Alternative,
    # ist hier aber nachweislich falsch: es ergaebe 28 Grad Bildwinkel,
    # bei dem die Decke nicht mehr ueber der Kamera stuende. Sie steht dort.
    boden = bodenraster(lum, ppx, ppy)
    if boden is None:
        raise SystemExit("Bodenraster nicht bestimmbar")
    bericht["bodenraster"] = boden
    f = boden["f_px"]
    bericht["bodenraster"]["bildwinkel_senkrecht_grad"] = float(
        math.degrees(math.atan(ppy / f) + math.atan((H - ppy) / f)))

    # --- Massstab -----------------------------------------------------------
    # Der Anker ist ein Bauteil mit Normmass, nie die Kamerahoehe -- die waere
    # geraten. Zwei Quellen stehen zur Wahl, unabhaengig voneinander gemessen:
    #   'boden' -- Bodenraster (liefert auch die Brennweite, per Quadrat-Annahme)
    #   'decke' -- Deckenraster (reine Seitenmessung, keine Formannahme)
    # Beide "je_h"-Werte sind MEASURED; welcher der beiden die richtige
    # Bauteilgroesse traegt, ist eine Sachfrage vor Ort -- keine Rechnung
    # entscheidet das. Vorgabe ist 'decke': am Referenzbild sind die
    # Bodenplatten grossformatig (deutlich groesser als das deklarierte
    # Mass), das feine Fugenraster sitzt an der Decke.
    w_h_boden = boden["fliesenbreite_je_h"]
    w_h_decke = decke["gitterbreite_je_h"] if decke is not None else None
    quelle = anker_quelle if (anker_quelle == "boden" or w_h_decke is not None) else "boden"
    w_h = w_h_decke if quelle == "decke" else w_h_boden
    h_m = anker_m / w_h
    # Gegenprobe: was wuerde die JEWEILS ANDERE Flaeche unter demselben h_m
    # tragen? Weit ausserhalb plausibler Bauteilgroessen ist ein Warnsignal,
    # keine Bestaetigung -- beide Flaechen muessen fuer sich Sinn ergeben.
    andere_flaeche_m = (w_h_boden if quelle == "decke" else w_h_decke)
    andere_flaeche_m = float(andere_flaeche_m * h_m) if andere_flaeche_m is not None else None
    bericht["massstab"] = {
        "anker": "Deckenraster (Kassetten-/Traegerteilung)" if quelle == "decke"
                 else "Bodenfliese (Kantenlaenge)",
        "anker_quelle": quelle,
        "anker_m": anker_m,
        "kamerahoehe_m": float(h_m),
        "hinweis": ("Ein Einzelbild kennt keine Meter. Alle Verhaeltnisse sind gemessen; "
                    "genau diese eine Laenge ist gesetzt. Wer sie aendert, skaliert die "
                    "ganze Halle -- ihre Form bleibt unberuehrt."),
        "gegenprobe_kamerahoehe": ("Kamerahoehe %.2f m -- plausibel, wenn sie in "
                                    "Augenhoehe oder erhoehtem Stativ liegt." % h_m),
        "gegenprobe_andere_flaeche_m": andere_flaeche_m,
        "gegenprobe_andere_flaeche_hinweis": (
            ("Unter diesem Anker waere die Bodenfliese %.2f m breit -- pruefen, ob das "
             "zum Foto passt." % andere_flaeche_m) if quelle == "decke" and andere_flaeche_m
            else ("Unter diesem Anker waere das Deckenraster %.2f m breit -- pruefen, ob "
                  "das zum Foto passt." % andere_flaeche_m) if andere_flaeche_m else None),
        "provenienz": DECLARED,
    }

    # --- Zusammengesetzter Raum --------------------------------------------
    z_wand_h = f / fuge["v"]
    joch_h = raster["reihenabstand_je_h"]
    bericht["raum_je_kamerahoehe"] = {
        "bodenhoehe": -1.0,
        "deckenhoehe": float(hc_h),
        "lichte_hoehe": float(1.0 + hc_h),
        "rueckwand_tiefe": float(z_wand_h),
        "stuetzenreihen_abstand": float(joch_h),
        "stuetzenbreite": float(raster["stuetzenbreite_je_h"]),
        "stuetzen_jochteilung": float(f * raster["tiefenteilung_1_durch_v"]),
        "fliesenmodul": float(w_h_boden),
        "deckengittermodul": float(w_h_decke) if w_h_decke is not None else None,
        "brennweite_px": float(f),
    }
    bericht["raum_meter"] = {
        "lichte_hoehe_m": float((1.0 + hc_h) * h_m),
        "rueckwand_tiefe_m": float(z_wand_h * h_m),
        "stuetzenreihen_abstand_m": float(joch_h * h_m),
        "stuetzenbreite_m": float(raster["stuetzenbreite_je_h"] * h_m),
        "stuetzen_jochteilung_m": float(f * raster["tiefenteilung_1_durch_v"] * h_m),
        # Beide Flaechenmodule stehen unabhaengig vom gewaehlten Anker: das
        # eine traegt ihn (== anker_m), das andere ist seine Vorhersage --
        # genau die "gegenprobe_andere_flaeche_m" oben, hier griffbereit
        # neben den uebrigen Massen statt nur im massstab-Block.
        "fliesenmodul_m": float(w_h_boden * h_m),
        "deckengittermodul_m": float(w_h_decke * h_m) if w_h_decke is not None else None,
        "kamerahoehe_m": float(h_m),
        "leuchtband_teilung_m": (float(bericht["leuchtbaender"].get("teilung_je_h", 0) * h_m)
                                 if "teilung_je_h" in bericht["leuchtbaender"] else None),
    }
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


def _bilddateien(pfade):
    """Loest Verzeichnisse zu Bilddateien auf; Einzeldateien bleiben, wie sie sind.

    Ermoeglicht den Batch-Aufruf `single_view_room.py content/raum/` genauso
    wie den Aufruf mit einzeln aufgezaehlten Dateien -- eine Warteschlange,
    keine zwei Codepfade.
    """
    endungen = (".png", ".jpg", ".jpeg")
    aus = []
    for p in pfade:
        if os.path.isdir(p):
            for name in sorted(os.listdir(p)):
                if name.lower().endswith(endungen):
                    aus.append(os.path.join(p, name))
        else:
            aus.append(p)
    return aus


def verarbeite_bild(bild, anker_m, anker_quelle, ziel=None):
    """Ein Bild durch die volle Messkette, Artefakt schreiben, Bericht drucken.

    Der Kern von `main()`, herausgeloest, damit ein Batch-Lauf ueber mehrere
    Bilder denselben Weg nimmt wie ein einzelner Aufruf -- keine zweite,
    abweichende Kurzfassung fuer den Mehrfach-Fall.
    """
    ziel = ziel or os.path.dirname(os.path.abspath(bild))
    os.makedirs(ziel, exist_ok=True)
    basis = os.path.splitext(os.path.basename(bild))[0]

    rgb, lum, bericht = vermessen(bild, anker_m, anker_quelle)
    with open(bild, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    modell = {
        "format": "SHADED.single-view-room.v1",
        "provider": PROVIDER,
        "version": VERSION,
        "quelle": {"datei": os.path.basename(bild),
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
    print("\n=== Messbericht: %s ===" % os.path.basename(bild))
    print("Fluchtpunkt      (%.2f, %.2f)  aus %d von %d Linien, Restfehler %.2f px"
          % (b["fluchtpunkt"]["x"], b["fluchtpunkt"]["y"], b["fluchtpunkt"]["linien_tragend"],
             b["fluchtpunkt"]["linien_gesamt"], b["fluchtpunkt"]["restfehler_px"]))
    print("Wand-Boden-Fuge  y=%.1f ueber %d Stuetzstellen, Restfehler %.2f px, Neigung %.1f px"
          % (b["wand_boden_fuge"]["y"], b["wand_boden_fuge"]["stuetzstellen"],
             b["wand_boden_fuge"]["restfehler_px"], b["wand_boden_fuge"]["neigung_px_je_breite"]))
    print("Deckenhoehe      hc = %.4f h   ->  lichte Hoehe %.4f h"
          % (b["deckenhoehe_je_kamerahoehe"]["wert"],
             b["deckenhoehe_je_kamerahoehe"]["lichte_raumhoehe_je_kamerahoehe"]))
    for p in b["spiegelprobe"]["proben"]:
        print("  Spiegelprobe   Band k=%+.4f -> erwartet %+.4f, gemessen %+.4f  (%.1f %%)"
              % (p["band_k"], p["erwartet_k"], p["gemessen_k"], p["abweichung_prozent"]))
    print("Stuetzen         %d gefunden, Breite %.4f h, Reihen %s (Streuung %s)"
          % (b["stuetzen"]["anzahl"], b["raster"]["stuetzenbreite_je_h"],
             ["%.2f" % x for x in b["raster"]["reihen_x_je_h"]],
             ["%.3f" % x for x in b["raster"]["reihen_x_streuung"]]))
    print("Stuetzenraster   Reihenabstand %.3f h, Jochteilung(1/v) %.6f"
          % (b["raster"]["reihenabstand_je_h"], b["raster"]["tiefenteilung_1_durch_v"]))
    print("Bodenraster      Fliese %.4f h seitlich, %.6f in 1/v  (Korr %.2f / %.2f)"
          % (b["bodenraster"]["fliesenbreite_je_h"], b["bodenraster"]["fliesentiefe_1_durch_v"],
             b["bodenraster"]["korrelation_seite"], b["bodenraster"]["korrelation_tiefe"]))
    if "deckenraster" in b:
        print("Deckenraster     Gitter %.4f h seitlich  (Korr %.2f)"
              % (b["deckenraster"]["gitterbreite_je_h"], b["deckenraster"]["korrelation_seite"]))
    else:
        print("Deckenraster     nicht bestimmbar (zu wenig Kontrast/Kandidaten)")
    print("Brennweite       f = %.0f px  ->  senkrechter Bildwinkel %.1f Grad"
          % (b["bodenraster"]["f_px"], b["bodenraster"]["bildwinkel_senkrecht_grad"]))
    print("Massstab         Anker: %s = %.2f m  ->  Kamerahoehe %.2f m"
          % (b["massstab"]["anker"], b["massstab"]["anker_m"], b["massstab"]["kamerahoehe_m"]))
    if b["massstab"]["gegenprobe_andere_flaeche_hinweis"]:
        print("                 " + b["massstab"]["gegenprobe_andere_flaeche_hinweis"])
    print("\n=== In Metern (Anker: %s, %.2f m) ===" % (b["massstab"]["anker"], anker_m))
    for k, v in b["raum_meter"].items():
        if v is not None:
            print("  %-26s %.2f" % (k, v))
    return bericht


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bilder", nargs="+",
                    help="ein oder mehrere Bilder, oder ein Verzeichnis davon "
                         "(fuer den Stapellauf ueber alle Referenzfotos)")
    ap.add_argument("--anker-m", type=float, default=0.60,
                    help="metrischer Anker: Kantenlaenge des gewaehlten Rasters (Vorgabe 0.60 m)")
    ap.add_argument("--anker-quelle", choices=["decke", "boden"], default="decke",
                    help="welche Flaeche den Anker traegt (Vorgabe: decke -- am "
                         "Referenzfoto sind die Bodenplatten grossformatig, das feine "
                         "Fugenraster sitzt an der Decke)")
    ap.add_argument("--out", default=None, help="Zielverzeichnis (Vorgabe: neben jedem Bild)")
    a = ap.parse_args()

    bilder = _bilddateien(a.bilder)
    if not bilder:
        raise SystemExit("keine Bilddateien gefunden")

    berichte = {}
    fehler = {}
    for bild in bilder:
        try:
            berichte[bild] = verarbeite_bild(bild, a.anker_m, a.anker_quelle, a.out)
        except SystemExit as e:
            fehler[bild] = str(e)
            print("UEBERSPRUNGEN %s: %s" % (os.path.basename(bild), e))

    if len(bilder) > 1:
        print("\n=== Stapel: %d Bilder, %d gemessen, %d uebersprungen ===" %
              (len(bilder), len(berichte), len(fehler)))
        kopf = "%-28s %8s %8s %8s %8s %10s" % (
            "Datei", "h_m", "Decke_m", "Ruewand_m", "Joch_m", "Anker")
        print(kopf)
        for bild, b in berichte.items():
            rm = b["raum_meter"]
            print("%-28s %8.2f %8.2f %8.2f %8.2f %10s" % (
                os.path.basename(bild)[:28], rm["kamerahoehe_m"], rm["lichte_hoehe_m"],
                rm["rueckwand_tiefe_m"], rm["stuetzen_jochteilung_m"],
                b["massstab"]["anker_quelle"]))
        for bild, msg in fehler.items():
            print("%-28s FEHLER: %s" % (os.path.basename(bild)[:28], msg))


if __name__ == "__main__":
    main()
