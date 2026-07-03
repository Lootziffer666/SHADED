# Registrierung vor Ableitung – Der Projektions-Vertrag

**Status: VERBINDLICH.** Tiefenkarten, Normal-Maps, Masken und AO dürfen
NIEMALS als eigenständige Interpretation eines Bildes erzeugt werden
(KI-Schätzer interpretieren Geometrie neu – pixelgenaue Deckung ist damit
prinzipiell nicht garantierbar). Sie müssen aus einer Quelle abgeleitet
werden, die in DERSELBEN Projektion steht wie das Referenzbild.

Die eigentliche Aufgabe lautet daher immer zuerst:

> **„Finde die exakte Kameraprojektion des Referenzbildes."**

Nicht: „Erzeuge eine möglichst schöne Depth Map."

## Pipeline

```
Input A: Referenzbild (Szene)
Input B: Geometriequelle (GLB / Render / weiteres Bild)
   ↓
1. REGISTRIERUNG  (tools/register.js)
   Kandidaten-Kameras rendern → Kantenkorrelation mit Verschiebungssuche
   → grob (el×az-Raster) → fein (Zoom, Look-Offset, ortho vs. fov)
   → camera.json + overlay.png (Pflicht-Sichtprüfung!)
   ↓
2. ERST JETZT: Ableitungen in GENAU dieser Projektion
   Depth (Weiß=nah), Normal, Masken, AO …
```

```bash
npm i playwright three     # einmalig, nie committen
node tools/register.js <referenz.png> <modell.glb>
# -> tools/register-out/{camera.json, overlay.png, normal.png, depth.png}
```

`overlay.png` ist der Abnahme-Gate: Die Registrierung gilt nur als gelungen,
wenn die Kanten im Overlay sitzen. camera.json dokumentiert die Projektion –
jede weitere Ableitung aus derselben Quelle MUSS diese Parameter verwenden.

## Bekannte Grenze (Befund Demo-Dorf + Hitem3d-GLB)

Wenn die Geometriequelle selbst vom Bild abweicht (Foto-zu-3D-Modelle sind
stellenweise zu groß, Teile fehlen), existiert KEINE einzelne Projektion,
die alle Objekte gleichzeitig pixelgenau deckt – der Score-Verlauf wird
flach und die Optimierung mehrdeutig. Die globale Registrierung ist dann
nur der erste Schritt; der Rest ist ein eigenes Inkrement:

- **Lokale Nachregistrierung** (geplant): stückweise Homographie bzw.
  Kontrollpunkt-Warp pro Objekt (Haus, Baumgruppe) NACH der globalen
  Kamera – erst damit wird ein unpräzises Modell pixelgenau nutzbar.

Bis dahin gilt: Für Szenen mit unpräziser Geometriequelle ist eine
handgemachte Tiefenkarte in Bildkoordinaten (wie beim Demo-Dorf) die
verlässlichere Quelle – sie IST bereits registriert, weil sie im
Referenzraster gemalt wurde.
